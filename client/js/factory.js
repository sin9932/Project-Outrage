/* Factory: 3x4 tiles, 20 world units/metre. The authored glTF exits along +Z;
 * heading rotates the whole building and its dispatch lane toward world -Y.
 * Simulation owns dispatch; renderer samples this state read-only. */
(function(g){
 const clamp=v=>Math.max(0,Math.min(1,v));
 const F={modelUrl:'../asset/model/factory/factory.glb',scale:20,renderSpan:52,wheelRadius:1,heading:-Math.PI/2,
  buildSeconds:1.6,doorSeconds:.35,driveSeconds:1.4,closeSeconds:.35,deathSeconds:1.2};
 // Both supported facings use the long axis of the 3x4 footprint. Reuse this
 // direction for placement reservation, interior travel and outside clearance.
 const forwardY=Math.round(Math.sin(F.heading));
 F.progress=(b,t)=>clamp(b._factorySelling?b._factorySellFrom-(t-b._factorySellT0)/F.buildSeconds:(t-(b._placedAt||0))/F.buildSeconds);
 F.complete=(b,t)=>!b._factorySelling&&F.progress(b,t)>=1;
 F.beginSell=(b,t)=>{b._factorySellFrom=F.progress(b,t);b._factorySellT0=t;b._factorySellFinalizeAt=t+b._factorySellFrom*F.buildSeconds;b._factorySelling=true;if(b._factoryDispatch)b._factoryDoorClosedAt=t;b._factoryDispatch=null;};
 F.accessRect=b=>({tx:b.tx+Math.floor(b.tw/2),ty:forwardY>0?b.ty+b.th:b.ty-1,tw:1,th:1});
 F.exit=(b,T)=>({x:b.x,y:(F.accessRect(b).ty+.5)*T});
 F.clearance=(b,T)=>{const end=F.exit(b,T);return{x:end.x,y:end.y+forwardY*T*2};};
 F.door=(b,t)=>b._factoryDispatch?clamp((t-b._factoryDispatch.started)/F.doorSeconds):clamp(1-(t-(b._factoryDoorClosedAt??-100))/F.closeSeconds);
 // Aircraft are not in the current roster; their launch uses this simulation hook.
 F.beginAirLaunch=(b,t)=>{if(F.complete(b,t))b._factoryAirAt=t;};
 F.roof=(b,t)=>{const age=t-(b._factoryAirAt??-100);return age<0?0:age<.6?clamp(age/.6):age<2?1:clamp(1-(age-2)/.6);};
 F.vehicle=(b,t,T)=>{const d=b._factoryDispatch;if(!d)return null;const p=clamp((t-d.started-F.doorSeconds)/F.driveSeconds),end=F.exit(b,T),start=b.y+forwardY*(d.kind==='mcv'?-.5:.5)*T;
  return{id:-100000-b.id,kind:d.kind,alive:true,team:b.team,x:b.x,y:start+(end.y-start)*p,bodyYaw:F.heading,turretYaw:F.heading,carry:0,carryMax:1000,_factoryDistance:Math.abs(end.y-start)*p};};
 // A completed queue item stays the dispatch ticket until its unit exits.
 F.dispatch=(b,q,owner,t,T,canExit)=>{
  if(!F.complete(b,t)||b._factorySelling)return null;
  if(b._factoryDispatch&&b._factoryDispatch.ticket!==q)return null;
  const end=F.exit(b,T);
  if(!b._factoryDispatch){
   if(t<(q._factoryRetryAt||0))return null;
   q._factoryRetryAt=t+.25;
   if(!canExit(end.x,end.y,q.kind))return null;
   b._factoryDispatch={ticket:q,ownerId:owner.id,kind:q.kind,started:t,lastTick:t};q._factorySource=b.id;
  }
  const d=b._factoryDispatch;
  const elapsed=t-d.started;
  if(elapsed>=F.doorSeconds+F.driveSeconds*.72){
   if(t>=(d.nextCheck||0)){d.exitClear=canExit(end.x,end.y,q.kind);d.nextCheck=t+.2;}
   if(!d.exitClear){d.started+=t-d.lastTick;d.lastTick=t;return null;}
  }
  d.lastTick=t;
  if(t-d.started<F.doorSeconds+F.driveSeconds)return null;
  if(!canExit(end.x,end.y,q.kind)){d.exitClear=false;return null;}
  b._factoryDispatch=null;b._factoryDoorClosedAt=t;return end;
 };
 g.OUFactory=Object.freeze(F);
})(globalThis);
