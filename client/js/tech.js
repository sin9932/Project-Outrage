/* Shared prerequisite and availability rules for UI, economy and AI. */
(function(g){
 'use strict';
 const buildPrereq={
  power:['hq'],refinery:['hq','power'],barracks:['hq','power'],
  factory:['hq','barracks'],radar:['hq','factory','refinery'],
  turret:['hq','barracks'],repair:['hq','factory']
 };
 const unitPrereq={
  infantry:['barracks'],engineer:['barracks'],sniper:['barracks','radar'],
  tank:['factory'],ifv:['factory'],harvester:['factory'],mcv:['factory','repair']
 };
 // Deployment reserves the yard immediately and enables construction in the same tick.
 // Packing/selling withdraw availability; animation completion is not an extra tech gate.
 const operational=b=>!!(b&&b.alive&&!b.civ&&b._mcvPhase!=='pack'&&!b._mcvSelling&&
  !b._factorySelling&&!b._sentrySelling&&!b._powerSelling&&!b._refinerySelling&&!b._barrackSelling);
 const assemblySeconds=kind=>kind==='factory'?g.OUFactory.buildSeconds:kind==='repair'?1.6:0;
 const has=(buildings,team,kind)=>buildings.some(b=>operational(b)&&b.team===team&&b.kind===kind);
 const canUnit=(buildings,team,kind,time=Infinity)=>(unitPrereq[kind]||[]).every(required=>
  buildings.some(b=>operational(b)&&b.team===team&&b.kind===required&&
   (kind!=='mcv'||time-(b._placedAt||0)>=assemblySeconds(required))));
 const producer=kind=>['tank','harvester','ifv','mcv'].includes(kind)?'factory':'barracks';
 g.OUTech=Object.freeze({buildPrereq,unitPrereq,operational,has,canUnit,producer,assemblySeconds});
})(globalThis);
