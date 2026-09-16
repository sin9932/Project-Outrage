/* MCV lifecycle and asset contract. glTF +Z forward, +Y up; fixed HQ faces +Y.
 * Simulation replaces exactly one entity per transition, never invokes death or sale.
 * Rendering samples Deploy at progress, including its exact reverse; owns no gameplay state. */
(function(g){
 'use strict';
 const clamp=v=>Math.max(0,Math.min(1,v));
 const M={modelUrl:'../asset/model/mcv/mcv.glb?v=3',scale:20,modelScale:1.65,renderSpan:30,hqSpan:62,wheelRadius:.65,turnRate:7.5,deployTurnRate:20,seconds:.8,heading:Math.PI/2};
 M.progress=(b,t)=>b._mcvSelling?clamp(1-(t-b._mcvSellT0)/M.seconds):b._mcvPhase==='deploy'?clamp((t-b._mcvT0)/M.seconds):b._mcvPhase==='pack'?clamp(1-(t-b._mcvT0)/M.seconds):b.kind==='hq'?1:0;
 M.beginSell=(b,t)=>{b._mcvSelling=true;b._mcvSellT0=t;b._mcvSellFinalizeAt=t+M.seconds+.25;};
 M.drive=(u,dx,dy,dt,dir8)=>{const m=g.OUTankMotion,target=Math.atan2(dy,dx);u.bodyYaw=m.toward(m.readPose(u).bodyYaw,target,M.turnRate,dt);u.bodyDir=u.dir=dir8(Math.cos(u.bodyYaw),Math.sin(u.bodyYaw));u.bodyTurn=null;if(Math.abs(m.wrap(target-u.bodyYaw))>.04){u.travelPhase='hull';return false;}u.bodyYaw=target;u.travelPhase='drive';return true;};
 M.create=c=>{
  const {state,units,buildings,TEAM,BUILD,COST,TILE,MAP_W,MAP_H,footprint,addBuilding,addUnit,setBuildingOcc,recomputePower,setPathTo,clearReservation,getEntityById,toast}=c;
  let nextAI=0,nextRepair=0;
  const operational=b=>g.OUTech.operational(b);
  const tell=(e,s)=>{if(e.team===TEAM.PLAYER)toast(s);};
  const site=u=>({tx:Math.floor(u.x/TILE)-Math.floor(BUILD.hq.tw/2),ty:Math.floor(u.y/TILE)-Math.floor(BUILD.hq.th/2)});
  const valid=(u,p)=>!footprint.isBlockedFootprint(p.tx,p.ty,BUILD.hq.tw,BUILD.hq.th,'hq',u);
  const stop=u=>{clearReservation(u);u.path=null;u.flowGoal=null;u.target=null;u.vx=u.vy=0;u.order={type:'idle'};};
  function transferSelection(a,b){if(state.selection.delete(a.id))state.selection.add(b.id);b.grp=a.grp||0;}
  function requestDeploy(u){
   if(!u?.alive||u.kind!=='mcv'||u._mcvPending)return false;
   const p=site(u);if(!valid(u,p)){tell(u,'건설소를 펼칠 평지와 빈 공간이 필요합니다.');return false;}
   stop(u);const x=(p.tx+BUILD.hq.tw/2)*TILE,y=(p.ty+BUILD.hq.th/2)*TILE;
   u.order={type:'move',x,y};u._mcvPending={...p,x,y,order:u.order};setPathTo(u,x,y);return true;
  }
  function requestRepack(b,x,y){
   if(!b?.alive||b.kind!=='hq'||!operational(b)||b._mcvPhase)return false;
   if(!state.mcvRedeploy){tell(b,'게임 시작 옵션에서 MCV 재배치를 켜야 합니다.');return false;}
   b._mcvPhase='pack';b._mcvT0=state.t;b._mcvDestination={x,y};b.repairOn=false;recomputePower();return true;
  }
  function deploySelected(){for(const id of [...state.selection]){const u=getEntityById(id);if(u?.team===TEAM.PLAYER)requestDeploy(u);}}
  function repackSelected(x,y){for(const id of [...state.selection]){const b=getEntityById(id);if(b?.team===TEAM.PLAYER)requestRepack(b,x,y);}}
  function tick(dt){
   for(const u of units){
    const p=u._mcvPending;if(!u.alive||!p)continue;
    // A new player order cancels the request; the simulation may replace move with idle on arrival.
    const arrived=Math.hypot(u.x-p.x,u.y-p.y)<5;
    if(u.order!==p.order&&(!arrived||!['idle','guard'].includes(u.order?.type))){u._mcvPending=null;continue;}
    if(!arrived)continue;
    if(!valid(u,p)){u._mcvPending=null;stop(u);tell(u,'전개 공간이 막혔습니다.');continue;}
    stop(u);p.order=u.order;
    u.bodyYaw=g.OUTankMotion.toward(g.OUTankMotion.readPose(u).bodyYaw,M.heading,M.deployTurnRate,dt);
    u.bodyDir=u.dir=c.worldVecToDir8(Math.cos(u.bodyYaw),Math.sin(u.bodyYaw));
    if(Math.abs(g.OUTankMotion.wrap(M.heading-u.bodyYaw))>.04)continue;
    // Atomic replacement: no death effects, refund, crew, or healing. Occupancy starts immediately.
    const selected=state.selection.has(u.id);u.alive=false;u._mcvPending=null;
    const b=addBuilding(u.team,'hq',p.tx,p.ty,{skipMvp:true});b.hp=Math.min(b.hpMax,u.hp);b._mcvPhase='deploy';b._mcvT0=state.t;b._mcvOriginId=u.id;
    transferSelection(u,b);if(selected)state.selection.add(b.id);recomputePower();
   }
   for(const b of buildings){
    if(!b.alive||!b._mcvPhase||state.t-b._mcvT0<M.seconds)continue;
    if(b._mcvPhase==='deploy'){b._mcvPhase=null;recomputePower();continue;}
    const destination=b._mcvDestination;setBuildingOcc(b,0);b.alive=false;
    const u=addUnit(b.team,'mcv',b.x,b.y,{skipMvp:true});u.hp=Math.min(u.hpMax,b.hp);u.bodyYaw=M.heading;transferSelection(b,u);recomputePower();
    if(destination){u.order={type:'move',...destination};setPathTo(u,destination.x,destination.y);}
   }
   if(state.t<nextAI-2){nextAI=state.t;nextRepair=state.t;}
   if(state.t>=nextAI){nextAI=state.t+.8;tickAI();}
   // A service depot repairs one nearby parked vehicle per second, with normal credits.
   if(state.t>=nextRepair){nextRepair=state.t+1;for(const b of buildings){if(b.kind!=='repair'||!operational(b)||state.t-b._placedAt<g.OUTech.assemblySeconds('repair'))continue;const owner=b.team===TEAM.PLAYER?state.player:state.enemy;
    const u=units.find(u=>u.alive&&u.team===b.team&&['tank','ifv','harvester','mcv'].includes(u.kind)&&u.hp<u.hpMax&&Math.hypot(u.x-b.x,u.y-b.y)<TILE*2.7&&Math.hypot(u.vx||0,u.vy||0)<1);
    if(u&&owner.money>=5){u.hp=Math.min(u.hpMax,u.hp+30);owner.money-=5;}
   }}
  }
  function tickAI(){
   const team=TEAM.ENEMY;if(buildings.some(b=>b.alive&&b.team===team&&b.kind==='hq'))return;
   const mcvs=units.filter(u=>u.alive&&u.team===team&&u.kind==='mcv');
   if(!mcvs.length){
    if(!g.OUTech.canUnit(buildings,team,'mcv',state.t)||state.enemy.money<COST.mcv)return;
    if(buildings.some(b=>b.alive&&b.team===team&&b.buildQ?.some(q=>q.kind==='mcv')))return;
    const f=buildings.find(b=>b.team===team&&b.kind==='factory'&&operational(b));
    if(f)f.buildQ.unshift({kind:'mcv',t:0,tNeed:c.getBaseBuildTime('mcv'),cost:COST.mcv,paid:0});return;
   }
   for(const u of mcvs){if(u._mcvPending)continue;if(u._mcvAISite&&Math.hypot(u.x-u._mcvAISite.x,u.y-u._mcvAISite.y)<8){requestDeploy(u);u._mcvAISite=null;continue;}
    if(u._mcvAISite&&state.t<(u._mcvAIRetry||0))continue;
    // 24 candidates per think, persistent cursor; no map-wide path searches per frame.
    const origin=u._mcvAIOrigin||u;let chosen=null;
    for(let n=0;n<24;n++){const k=u._mcvAIScan=(u._mcvAIScan||0)+1,r=3+Math.floor(k/16)%12,a=k*Math.PI/8,tx=Math.floor(origin.x/TILE+Math.cos(a)*r)-2,ty=Math.floor(origin.y/TILE+Math.sin(a)*r)-2;
     if(tx<0||ty<0||tx+5>MAP_W||ty+5>MAP_H||!valid(u,{tx,ty}))continue;
     const x=(tx+2.5)*TILE,y=(ty+2.5)*TILE;
     if(units.some(e=>e.alive&&e.team!==team&&e.canAttack&&Math.hypot(e.x-x,e.y-y)<TILE*7))continue;
     chosen={x,y};break;
    }
    if(chosen){u._mcvAISite=chosen;u._mcvAIRetry=state.t+12;u.order={type:'move',...chosen};setPathTo(u,chosen.x,chosen.y);}
   }
  }
  return{requestDeploy,requestRepack,deploySelected,repackSelected,tick,valid,site,tickAI};
 };
 g.OUMCV=Object.freeze(M);
})(globalThis);
