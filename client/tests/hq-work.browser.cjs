const engine=process.env.OUTRAGE_BROWSER||'chromium',bt=require(process.env.OUTRAGE_PLAYWRIGHT)[engine],fs=require('fs'),assert=require('node:assert/strict');
(async()=>{const browser=await bt.launch({headless:true,...(engine==='chromium'?{executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'}:{})});try{
 const p=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];p.on('pageerror',e=>errors.push(e.stack));
 await p.goto(process.env.OUTRAGE_URL||'http://127.0.0.1:8770/index.html?debug=1');
 await p.waitForFunction(()=>window.OUTankTest,null,{timeout:60000});await p.locator('#fogOff').check();await p.locator('#mcvRedeploy').check();await p.locator('#startBtn').click();
 await p.waitForFunction(()=>OUTankTest.running&&(OUTank3D.mcvReady||OUTank3D.assetError),null,{timeout:120000});assert(await p.evaluate(()=>OUTank3D.mcvReady),await p.evaluate(()=>OUTank3D.assetError));
 await p.waitForFunction(()=>OUTankTest.buildings.some(b=>b.alive&&b.team===1&&b.kind==='hq'&&!b._mcvPhase),null,{timeout:15000});
 await p.evaluate(()=>{window.g=OUTankTest;g.ai.tick=()=>{};g.state.enemy.money=0;g.state.player.money=100000;for(const u of g.units)u.alive=false;
  for(let y=7;y<42;y++)for(let x=7;x<42;x++){const i=y*g.MAP_W+x;g.terrain[i]=g.treeHp[i]=g.ore[i]=0;}
  for(const b of g.buildings)if(b.tx<42&&b.ty<42&&b.tx>6&&b.ty>6){b.alive=false;g.footprint.setBuildingOcc(b,0);}
  g.hqWork.reset();window.yard=g.addBuilding(0,'hq',18,18);g.cam.zoom=.85;g.state.colors.player='#347ee8';g.centerCameraOn(yard.x,yard.y);g.state.selection.clear();
  window.completed=g.addBuilding(0,'factory',30,30);
 });
 assert.equal(await p.evaluate(()=>yard._hqWork??null),null,'Work began before building construction completed');
 await p.waitForFunction(()=>yard._hqWork,null,{timeout:5000});
 const live=await p.evaluate(()=>({elapsed:g.state.t-completed._placedAt,stats:g.hqWork.stats(),buildingId:yard._hqWork.buildingId,id:completed.id}));
 assert(live.elapsed>=1.6-1e-6);assert.equal(live.buildingId,live.id);
 await p.waitForFunction(()=>g.hqWork.stats().finished===1,null,{timeout:6500});
 await p.evaluate(()=>{g.addBuilding(0,'radar',30,20);g.addBuilding(0,'repair',34,20);});
 await p.waitForFunction(()=>g.hqWork.stats().queued===1,null,{timeout:4000});
 await p.waitForFunction(()=>g.hqWork.stats().finished===3,null,{timeout:10000});
 const fifo=await p.evaluate(()=>g.hqWork.stats());assert.equal(fifo.events,3);assert.equal(fifo.active,0);assert.equal(fifo.queued,0);
 // Actual timing above; deterministic state edges below run through the same
 // authoritative controller while the normal game pause freezes the clock.
 await p.keyboard.press('Escape');await p.evaluate(()=>{for(const el of document.querySelectorAll('[id*=pause],[id*=Pause]'))el.style.visibility='hidden';});
 const cases=await p.evaluate(()=>{
  const check=(ok,message)=>{if(!ok)throw Error(message);};
  g.hqWork.reset();window.near=g.addBuilding(0,'hq',34,12);window.enemy=g.buildings.find(b=>b.alive&&b.team===1&&b.kind==='hq');
  const r=g.addBuilding(0,'radar',35,18);g.hqWork.tick();check(near._hqWork?.buildingId===r.id,'Nearest friendly yard was not chosen');check(!yard._hqWork&&!enemy._hqWork,'Event leaked to another yard/team');
  const r2=g.addBuilding(0,'radar',36,18);g.hqWork.tick();check(g.hqWork.stats().queued===1,'Second completion was dropped');
  near._mcvPhase='pack';g.hqWork.tick();check(!near._hqWork,'Packing yard retained work');check(yard._hqWork?.buildingId===r2.id,'Queued work was not transferred');
  yard._mcvSelling=true;g.hqWork.tick();check(!yard._hqWork,'Selling yard retained work');delete yard._mcvSelling;near.alive=false;
  const removed=g.addBuilding(0,'factory',30,35);removed.alive=false;g.footprint.setBuildingOcc(removed,0);g.state.t+=2;g.hqWork.tick();check(g.hqWork.stats().events===2,'Destroyed unfinished building triggered work');
  const r3=g.addBuilding(0,'radar',29,35);g.hqWork.tick();check(yard._hqWork?.buildingId===r3.id,'Surviving yard failed to accept work');yard.alive=false;g.hqWork.tick();check(!yard._hqWork,'Destroyed yard retained work');yard.alive=true;
  g.hqWork.reset();yard._mcvPhase='deploy';const r4=g.addBuilding(0,'radar',28,35);g.hqWork.tick();check(!yard._hqWork&&g.hqWork.stats().queued===1,'Work overlapped deployment');yard._mcvPhase=null;g.hqWork.tick();check(yard._hqWork?.buildingId===r4.id,'Deploy endpoint did not release work');
  const saved=JSON.stringify(yard);OUHQWork.progress(yard,g.state.t);OUTank3D.mcvPose(yard,g.state.t);check(saved===JSON.stringify(yard),'Rendering changed authoritative yard state');
  g.hqWork.reset();return {nearest:true,team:true,queueTransfer:true,pack:true,sell:true,death:true,unfinishedDeath:true,deployWait:true,renderReadOnly:true};
 });
 // Pixel equality catches a pose snap when Work returns to the shared idle cache.
 const sample=()=>p.evaluate(()=>{const c=document.createElement('canvas');c.width=c.height=900;OUTank3D.draw(c.getContext('2d'),yard,{x:450,y:550},g.cam.zoom,g.state.colors.player,g.state.t);return Array.from(c.getContext('2d').getImageData(0,0,900,900).data);});
 await p.evaluate(()=>{g.centerCameraOn(yard.x,yard.y);OUHQAssembly.clear();});await p.waitForTimeout(160);const idle=await sample();
 const clip=await p.evaluate(()=>{const q=g.worldToScreen(yard.x,yard.y);return{x:Math.round(q.x-340),y:Math.round(q.y-430),width:680,height:650};});
 let begin,end,middle;const poses=[];
 for(let i=0;i<=48;i++){
  await p.evaluate(v=>{yard._hqWork={serial:999,started:g.state.t-v*OUHQWork.seconds};},i/48);await p.waitForTimeout(65);
  if(i===0)begin=await sample();if(i===24)middle=await sample();if(i===48)end=await sample();
  if(i%12===0)poses.push(await p.evaluate(()=>OUTank3D.mcvPose(yard,g.state.t)));
  if(!process.env.OUTRAGE_WORK_QUICK||i%12===0)await p.screenshot({path:process.argv[2]+'-'+String(i).padStart(2,'0')+'.png',clip});
 }
 const difference=(a,b)=>a.reduce((n,v,i)=>n+(v!==b[i]),0),beginDiff=difference(idle,begin),endDiff=difference(idle,end),middleDiff=difference(idle,middle);
 assert.equal(beginDiff,0,'Work first pose differed from idle');assert.equal(endDiff,0,'Work final pose differed from idle');assert(middleDiff>100,'Work did not visibly animate');
 await p.evaluate(()=>{delete yard._hqWork;});await p.waitForTimeout(150);assert.equal(difference(idle,await sample()),0,'Idle raster changed after Work');
 const before=await p.evaluate(()=>OUHQAssembly.stats());await p.waitForTimeout(250);const after=await p.evaluate(()=>OUHQAssembly.stats());assert.equal(before.builds,after.builds);assert(after.hits>before.hits);
 assert.equal(errors.length,0,errors.join('\n'));
 const report={live,fifo,cases,beginDiff,endDiff,middleDiff,cacheBefore:before,cacheAfter:after,poses,errors};fs.writeFileSync(process.argv[2]+'-report.json',JSON.stringify(report,null,2));console.log('HQ_WORK_PASS',JSON.stringify({...report,poses:undefined}));
 }finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1});
