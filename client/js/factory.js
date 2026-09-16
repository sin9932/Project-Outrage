/* Fixed isometric factory: 4x3 footprint, long barrel vault with screen-right end portal. */
(function(g){
 const clamp=v=>Math.max(0,Math.min(1,v));
 const F={modelUrl:'../asset/model/factory/factory.glb?v=3',scale:20,renderSpan:52,wheelRadius:1,heading:0,modelYaw:0,footprint:[4,3],roofAxis:'x',portalX:9.62,
  buildSeconds:1.6,doorSeconds:.35,driveSeconds:1.4,closeSeconds:.35,deathSeconds:1.2};
 F.progress=(b,t)=>clamp(b._factorySelling?b._factorySellFrom-(t-b._factorySellT0)/F.buildSeconds:(t-(b._placedAt||0))/F.buildSeconds);
 F.complete=(b,t)=>!b._factorySelling&&F.progress(b,t)>=1;
 F.beginSell=(b,t)=>{b._factorySellFrom=F.progress(b,t);b._factorySellT0=t;b._factorySellFinalizeAt=t+b._factorySellFrom*F.buildSeconds;b._factorySelling=true;if(b._factoryDispatch)b._factoryDoorClosedAt=t;b._factoryDispatch=null;};
 F.accessRect=b=>({tx:b.tx+b.tw,ty:b.ty+Math.floor(b.th/2),tw:1,th:1});
 F.exit=(b,T)=>{const a=F.accessRect(b);return{x:(a.tx+.5)*T,y:(a.ty+.5)*T};};
 // Keep the large MCV inside the depth-tested factory pass until its rear
 // clears the portal. Spawning at the first outside tile exposes its tail
 // on top of the factory roof when ordinary unit rendering takes over.
 F.release=(b,T,kind)=>{const p=F.exit(b,T);if(kind==='mcv'){const M=g.OUMCV;p.x=Math.max(p.x,b.x+F.portalX*F.scale+M.packedRearMetres*M.modelScale*M.scale+12);}return p;};
 F.clearance=(b,T)=>{const end=F.exit(b,T);return{x:end.x+T*2,y:end.y};};
 F.door=(b,t)=>b._factoryDispatch?clamp((t-b._factoryDispatch.started)/F.doorSeconds):clamp(1-(t-(b._factoryDoorClosedAt??-100))/F.closeSeconds);
 // Aircraft are not in the current roster; their launch uses this simulation hook.
 F.beginAirLaunch=(b,t)=>{if(F.complete(b,t))b._factoryAirAt=t;};
 F.roof=(b,t)=>{const age=t-(b._factoryAirAt??-100);return age<0?0:age<.6?clamp(age/.6):age<2?1:clamp(1-(age-2)/.6);};
 F.vehicle=(b,t,T)=>{const d=b._factoryDispatch;if(!d)return null;const p=clamp((t-d.started-F.doorSeconds)/F.driveSeconds),end=F.release(b,T,d.kind),start=b.x-(d.kind==='mcv'?T*.10:0);
  return{id:-100000-b.id,kind:d.kind,alive:true,team:b.team,x:start+(end.x-start)*p,y:end.y,bodyYaw:F.heading,turretYaw:F.heading,carry:0,carryMax:1000,_factoryDistance:(end.x-start)*p};};
 // A completed queue item stays the dispatch ticket until its unit exits.
 F.dispatch=(b,q,owner,t,T,canExit)=>{
  if(!F.complete(b,t)||b._factorySelling)return null;
  if(b._factoryDispatch&&b._factoryDispatch.ticket!==q)return null;
  const end=F.release(b,T,q.kind),mouth=F.exit(b,T);
  const clearLane=()=>{const steps=Math.max(1,Math.ceil((end.x-mouth.x)/(T*.5)));for(let i=0;i<=steps;i++)if(!canExit(mouth.x+(end.x-mouth.x)*i/steps,end.y,q.kind))return false;return true;};
  if(!b._factoryDispatch){
   if(t<(q._factoryRetryAt||0))return null;
   q._factoryRetryAt=t+.25;
   if(!clearLane())return null;
   b._factoryDispatch={ticket:q,ownerId:owner.id,kind:q.kind,started:t,lastTick:t};q._factorySource=b.id;
  }
  const d=b._factoryDispatch;
  const elapsed=t-d.started;
  if(elapsed>=F.doorSeconds+F.driveSeconds*.72){
   if(t>=(d.nextCheck||0)){d.exitClear=clearLane();d.nextCheck=t+.2;}
   if(!d.exitClear){d.started+=t-d.lastTick;d.lastTick=t;return null;}
  }
  d.lastTick=t;
  if(t-d.started<F.doorSeconds+F.driveSeconds)return null;
  if(!clearLane()){d.exitClear=false;return null;}
  b._factoryDispatch=null;b._factoryDoorClosedAt=t;return end;
 };
 g.OUFactory=Object.freeze(F);
})(globalThis);
