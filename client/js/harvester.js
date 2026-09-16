/* Harvester contract: simulation owns phase/cargo/yaw; graphics only read it.
 * glTF +Z forward, +Y up. Refinery ramp opens toward world +X. */
(function(g){
 const H={modelUrl:'../asset/model/harvester/harvester.glb',scale:20,renderSpan:14,wheelRadius:.427,
  turnRate:2.6,unloadSeconds:1,harvestRate:125,reverseSpeed:45,intake:{forward:2.80,height:.63},discharge:{forward:-2.43,height:1.40}};
 H.ore=Object.freeze({base:48,step:48,max:240,value:120,gemBase:48,gemStep:48,gemMax:240,gemValue:240});
 // Atlas cells 0..4 are gems; 5..9 are ore, sparse to full.
 H.oreGid=(amount,gem)=>amount>0?225+(gem?0:5)+Math.min(4,Math.max(0,Math.ceil(amount/(gem?H.ore.gemMax:H.ore.max)*5)-1)):0;
 H.port=b=>({tx:b.tx+b.tw-1,ty:b.ty+Math.floor(b.th/2)});
 H.isLane=(b,tx,ty)=>b.kind==='refinery'&&tx===H.port(b).tx&&Math.abs(ty-H.port(b).ty)<=1;
 // Collision follows solid cells, not a padded rectangle over the open ramp.
 H.blocks=(b,x,y,T,r)=>{
   if(b.kind!=='refinery')return null;
   const x0=Math.max(b.tx,Math.floor((x-r)/T)),x1=Math.min(b.tx+b.tw-1,Math.floor((x+r)/T));
   const y0=Math.max(b.ty,Math.floor((y-r)/T)),y1=Math.min(b.ty+b.th-1,Math.floor((y+r)/T));
   for(let ty=y0;ty<=y1;ty++)for(let tx=x0;tx<=x1;tx++){
     if(H.isLane(b,tx,ty))continue;
     const dx=Math.max(tx*T-x,0,x-(tx+1)*T),dy=Math.max(ty*T-y,0,y-(ty+1)*T);
     if(dx*dx+dy*dy<r*r)return true;
   }
   return false;
 };
 H.frontDepth=(u,b,T)=>{
   if(b.kind!=='refinery')return null;
   const p=H.port(b);
   if(u.x>=(p.tx)*T && u.x<=(p.tx+3)*T && Math.abs(u.y-(p.ty+.5)*T)<=1.5*T)
     return b.tx+b.ty+b.tw+b.th-2+.01+(u.x+u.y)/T*.00001;
   return null;
 };
 H.approach=(b,T)=>{const p=H.port(b);return{x:(p.tx+2.5)*T,y:(p.ty+.5)*T};};
 H.dock=(b,T)=>{const p=H.port(b);return{x:(p.tx+.5)*T,y:(p.ty+.5)*T};};
 H.drive=(u,dx,dy,dt,dir8)=>{const m=g.OUTankMotion,target=Math.atan2(dy,dx);
  u.bodyYaw=m.toward(m.readPose(u).bodyYaw,target,H.turnRate,dt);u.bodyDir=u.dir=dir8(Math.cos(u.bodyYaw),Math.sin(u.bodyYaw));u.bodyTurn=null;
  if(Math.abs(m.wrap(target-u.bodyYaw))>.025){u.travelPhase='hull';return false;}
  u.bodyYaw=target;u.travelPhase='drive';return true;};
 H.socket=(u,key)=>{const a=g.OUTankMotion.readPose(u).bodyYaw,p=H[key];return{x:u.x+Math.cos(a)*p.forward*H.scale,y:u.y+Math.sin(a)*p.forward*H.scale,z:p.height*H.scale};};
 // Returns true after exiting the bay; caller resumes the normal harvest order.
 H.tickDock=(u,b,dt,c)=>{
  const {T,time,dir8,canMove,getUnit,credit}=c,approach=H.approach(b,T),dock=H.dock(b,T);
  let d=u.harvesterDock;
  if(d&&d.refId!==b.id){u.harvesterDock=null;d=null;}
  if(!d){if(Math.hypot(u.x-approach.x,u.y-approach.y)>10)return false;
    const owner=getUnit(b.dockUnitId);if(owner&&owner.id!==u.id&&owner.alive&&owner.order?.type==='return'&&owner.target===b.id){u.vx=u.vy=0;return false;}
    b.dockUnitId=u.id;d=u.harvesterDock={refId:b.id,phase:'align',started:time};u.path=null;u.flowGoal=null;
  }
  u.vx=u.vy=0;
  if(d.phase==='align'){
    if(H.drive(u,1,0,dt,dir8)){d.phase='reverse';d.started=time;}return false;
  }
  if(d.phase==='reverse'||d.phase==='exit'){
    const target=d.phase==='reverse'?dock:approach,dx=target.x-u.x,dy=target.y-u.y,dist=Math.hypot(dx,dy);
    const step=Math.min(dist,H.reverseSpeed*dt),nx=u.x+(dx/(dist||1))*step,ny=u.y+(dy/(dist||1))*step;
    if(dist>.5&&!canMove(nx,ny))return false;
    const ox=u.x,oy=u.y;u.x=nx;u.y=ny;u.vx=(nx-ox)/Math.max(dt,.001);u.vy=(ny-oy)/Math.max(dt,.001);
    if(dist<=step+.5){
      if(d.phase==='exit'){b.dockUnitId=null;u.harvesterDock=null;return true;}
      d.phase='unload';d.started=time;d.initial=u.carry;d.paid=0;
      b._activeT0=time;b._activePulse=(b._activePulse||0)+1;
    }return false;
  }
  if(d.phase==='unload'){
    const elapsed=time-d.started;
    if(elapsed<.4)return false;
    const progress=Math.min(1,(elapsed-.4)/H.unloadSeconds);
    u.carry=Math.max(0,d.initial*(1-progress));
    // Credit integer deltas, never round away fractional per-tick cargo.
    const total=Math.floor(d.initial-u.carry+1e-7),delta=total-d.paid;if(delta>0){credit(delta);d.paid=total;}
    if(u.carry<=.0001){u.carry=0;u._needsRef=false;d.phase='close';d.started=time;}return false;
  }
  if(d.phase==='close'&&time-d.started>=.4){d.phase='exit';d.started=time;}
  return false;
 };
 Object.freeze(H.intake);Object.freeze(H.discharge);
 g.OUHarvester=Object.freeze(H);
})(globalThis);
