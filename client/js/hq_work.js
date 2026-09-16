/* Construction completion is a simulation event, independent of visibility.
 * Each yard owns one FIFO work cycle; the renderer only samples its timestamp. */
(function(g){
 'use strict';
 const seconds=3.2;
 const available=b=>b?.kind==='hq'&&g.OUTech.operational(b);
 const progress=(b,t)=>available(b)&&!b._mcvPhase&&b._hqWork
  ?Math.max(0,Math.min(1,(t-b._hqWork.started)/seconds)):null;
 function constructionEnd(b){
  if(b.kind==='factory')return b._placedAt+g.OUFactory.buildSeconds;
  if(b.kind==='turret')return b._placedAt+g.OUSentry.buildSeconds;
  if(b.kind==='repair')return b._placedAt+g.OUTech.assemblySeconds(b.kind);
  return g.PO?.buildings?.constructionEnd?.(b)??b._placedAt;
 }
 function create({state,buildings}){
  const pending=new Set(),queues=new Map();let serial=0,finished=0,canceled=0;
  function placed(b){if(b.alive&&!b.civ&&b.kind!=='hq')pending.add(b);}
  function enqueue(event){
   let yard=null,distance=Infinity;
   for(const b of buildings){
    if(!available(b)||b.team!==event.team)continue;
    const d=(b.x-event.x)**2+(b.y-event.y)**2;
    if(d<distance){distance=d;yard=b;}
   }
   if(!yard)return;
   let q=queues.get(yard);if(!q)queues.set(yard,q=[]);q.push(event);
  }
  function tick(){
   // Cancel the current action on repack/sell/death. Completed events still
   // waiting in its queue may be handled by another surviving yard.
   for(const [yard,q] of queues){
    const ownerChanged=(yard._hqWork&&yard._hqWork.team!==yard.team)||q.some(event=>event.team!==yard.team);
    if(available(yard)&&!ownerChanged)continue;
    if(yard._hqWork){delete yard._hqWork;canceled++;}
    queues.delete(yard);
    for(const event of q)enqueue(event);
   }
   for(const b of pending){
    if(!g.OUTech.operational(b)){pending.delete(b);continue;}
    if(state.t<constructionEnd(b))continue;
    pending.delete(b);enqueue({id:++serial,buildingId:b.id,team:b.team,x:b.x,y:b.y});
   }
   for(const [yard,q] of queues){
    if(yard._hqWork&&state.t-yard._hqWork.started>=seconds){delete yard._hqWork;finished++;}
    // Deployment allows building immediately, but the crane waits for its
    // mechanical endpoint before it handles the completed building's cargo.
    if(!yard._hqWork&&!yard._mcvPhase&&q.length){
     const event=q.shift();yard._hqWork={serial:event.id,buildingId:event.buildingId,team:event.team,started:state.t};
    }
    if(!yard._hqWork&&!q.length)queues.delete(yard);
   }
  }
  function reset(){for(const b of queues.keys())delete b._hqWork;pending.clear();queues.clear();serial=finished=canceled=0;}
  return Object.freeze({placed,tick,reset,stats:()=>({pending:pending.size,queued:[...queues.values()].reduce((n,q)=>n+q.length,0),active:[...queues.keys()].filter(b=>b._hqWork).length,events:serial,finished,canceled})});
 }
 g.OUHQWork=Object.freeze({seconds,progress,constructionEnd,create});
})(globalThis);
