/* Sentry contract. glTF +Z forward/+Y up; simulation owns aim and fire.
   Orange reference armor is the team-color material, fixed base + yawing head. */
(function(g){
 const C={modelUrl:'../asset/model/sentry/sentry.glb',scale:20,renderSpan:14,wheelRadius:1,
  buildSeconds:3.2,deathSeconds:1.1,turnRate:8,aimTolerance:.06,
  muzzleForward:2.20,muzzleHeight:1.77};
 C.progress=(b,t)=>Math.max(0,Math.min(1,b._sentrySelling
  ?b._sentrySellFrom-(t-b._sentrySellT0)/C.buildSeconds
  :(t-(b._placedAt||0))/C.buildSeconds));
 C.complete=(b,t)=>!b._sentrySelling&&C.progress(b,t)>=1;
 C.beginSell=(b,t)=>{
  const from=C.progress(b,t);b._sentrySelling=true;b._sentrySellFrom=from;
  b._sentrySellT0=t;b._sentrySellFinalizeAt=t+from*C.buildSeconds;
  b.sentryTarget=null;b.forceFire=null;
 };
 C.aim=(b,x,y,dt)=>{
   const target=Math.atan2(y-b.y,x-b.x),m=g.OUTankMotion;
   b.turretYaw=m.toward(b.turretYaw??0,target,C.turnRate,dt);
   return Math.abs(m.wrap(target-b.turretYaw))<=C.aimTolerance;
 };
 C.muzzle=b=>({x:b.x+Math.cos(b.turretYaw||0)*C.muzzleForward*C.scale,
  y:b.y+Math.sin(b.turretYaw||0)*C.muzzleForward*C.scale,z:C.muzzleHeight*C.scale});
 g.OUSentry=Object.freeze(C);
})(globalThis);
