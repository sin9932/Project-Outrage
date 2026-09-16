const engine=process.env.OUTRAGE_BROWSER||'chromium',bt=require(process.env.OUTRAGE_PLAYWRIGHT)[engine],fs=require('fs'),assert=require('node:assert/strict');
(async()=>{const b=await bt.launch({headless:true,...(engine==='chromium'?{executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'}:{})});try{
 const p=await b.newPage({viewport:{width:1440,height:900}}),errors=[];p.on('pageerror',e=>errors.push(e.stack));
 await p.goto(process.env.OUTRAGE_URL||'http://127.0.0.1:8765/index.html?debug=1');
 await p.waitForFunction(()=>window.OUTankTest,null,{timeout:60000});console.log('LOADED',errors);
 await p.locator('#fogOff').check();await p.locator('#mcvRedeploy').check();await p.locator('#startBtn').click();await p.waitForFunction(()=>OUTankTest.running);
 await p.waitForFunction(()=>OUTank3D.mcvReady||OUTank3D.assetError,null,{timeout:120000});assert(await p.evaluate(()=>OUTank3D.mcvReady),await p.evaluate(()=>OUTank3D.assetError));
 console.log('ASSETS_READY');assert(await p.evaluate(()=>OUTankTest.state.mcvRedeploy));
 // The ordinary match now starts with two MCVs; keep the AI's deployed HQ alive in this isolated fixture.
 await p.waitForFunction(()=>OUTankTest.buildings.some(b=>b.alive&&b.team===1&&b.kind==='hq'&&!b._mcvPhase),null,{timeout:15000});
 await p.evaluate(()=>{window.g=OUTankTest;window.originalAITick=g.ai.tick;g.ai.tick=()=>{};g.state.enemy.money=0;g.state.player.money=100000;for(const u of g.units)u.alive=false;
  for(let y=7;y<37;y++)for(let x=7;x<37;x++){const i=y*g.MAP_W+x;g.terrain[i]=g.treeHp[i]=g.ore[i]=0;}
  for(const b of g.buildings)if(b.tx<36&&b.ty<36&&b.tx>6&&b.ty>6){b.alive=false;g.footprint.setBuildingOcc(b,0);}
  for(const b of g.buildings)if(b.alive&&b.team===0&&b.kind==='hq'){b.alive=false;g.footprint.setBuildingOcc(b,0);}
  g.cam.zoom=1.4;window.u=g.addUnit(0,'mcv',20.5*g.TILE,20.5*g.TILE);g.centerCameraOn(u.x,u.y);g.state.selection=new Set([u.id]);u.hp=2345;
 });
 const blocked=await p.evaluate(()=>{const s=g.mcv.site(u),i=(s.ty+1)*g.MAP_W+s.tx+1;g.ore[i]=100;const a=g.mcv.requestDeploy(u);g.ore[i]=0;g.terrain[i]=1;const c=g.mcv.requestDeploy(u);g.terrain[i]=0;const blocker=g.addUnit(0,'tank',u.x+g.TILE,u.y);const d=g.mcv.requestDeploy(u);blocker.alive=false;return[a,c,d]});assert.deepEqual(blocked,[false,false,false]);
 await p.screenshot({path:process.argv[2]+'-mobile.png'});
 await p.evaluate(()=>{window.deployObservation=null;const watch=()=>{const b=g.buildings.find(b=>b.alive&&b._mcvOriginId===u.id);if(!b){requestAnimationFrame(watch);return;}
  g.economy.enqueueEcon({type:'setBuild',kind:'power'});
  const started=g.state.t;window.deployObservation={started,phase:b._mcvPhase,operational:OUTech.operational(b),repackRejected:!g.mcv.requestRepack(b,b.x+100,b.y)};
  const done=()=>{if(b._mcvPhase){if(g.state.buildLane.main.queue?.t>0)deployObservation.queueStartedDuringDeploy=true;requestAnimationFrame(done);return;}deployObservation.duration=g.state.t-b._mcvT0;};requestAnimationFrame(done);
 };requestAnimationFrame(watch);});
 await p.keyboard.press('d');await p.waitForFunction(()=>g.buildings.some(b=>b.alive&&b._mcvOriginId===u.id),null,{timeout:12000});
 await p.evaluate(()=>{window.yard=g.buildings.find(b=>b.alive&&b._mcvOriginId===u.id)});assert.equal(await p.evaluate(()=>yard.hp),2345);
 await p.screenshot({path:process.argv[2]+'-deploy.png'});
 await p.waitForFunction(()=>!yard._mcvPhase,null,{timeout:10000});
 const curves=await p.evaluate(()=>[0,.2,.4,.6,.8,1].map(v=>({v,a:OUTank3D.mcvPose({...yard,_mcvPhase:'deploy',_mcvT0:10-v*OUMCV.seconds},10),b:OUTank3D.mcvPose({...yard,_mcvPhase:'pack',_mcvT0:10-(1-v)*OUMCV.seconds},10)})));
 for(const c of curves)for(const n in c.a)for(const key of ['position','quaternion','scale'])c.a[n][key].forEach((v,i)=>assert(Math.abs(v-c.b[n][key][i])<1e-5));
 const timing=await p.evaluate(()=>deployObservation);assert.equal(timing.phase,'deploy');assert(timing.operational&&timing.repackRejected&&timing.queueStartedDuringDeploy,JSON.stringify(timing));assert(timing.duration>=.8&&timing.duration<.95,JSON.stringify(timing));
 // The existing construction lane must make progress before the animation ends.
 const immediate=await p.evaluate(()=>{const only={...yard,_mcvPhase:'deploy',_mcvT0:g.state.t};return OUTech.has([only],0,'hq')&&!OUTech.has([{...only,_mcvPhase:'pack'}],0,'hq');});assert(immediate);
 await p.screenshot({path:process.argv[2]+'-yard.png'});
 assert(await p.evaluate(()=>{g.state.mcvRedeploy=false;return !g.mcv.requestRepack(yard,yard.x+100,yard.y)}));
 const before=await p.evaluate(()=>{g.state.buildLane.main={queue:null,ready:null,fifo:[]};g.state.mcvRedeploy=true;window.money=g.state.player.money;window.beforeUnits=g.units.length;g.mcv.requestRepack(yard,yard.x+g.TILE*4,yard.y);return {money,units:beforeUnits}});
 await p.waitForFunction(()=>!yard.alive,null,{timeout:10000});
 assert.equal(await p.evaluate(()=>g.state.player.money),before.money);
 assert.equal(await p.evaluate(()=>g.units.length),before.units+1);
 await p.evaluate(()=>{window.repacked=g.units.find(u=>u.alive&&u.kind==='mcv');});
 assert.equal(await p.evaluate(()=>repacked.hp),2345);assert.equal(await p.evaluate(()=>repacked.hpMax),3000);
 await p.waitForFunction(()=>Math.hypot(repacked.x-yard.x,repacked.y-yard.y)>100,null,{timeout:12000});console.log('ROUNDTRIP_OK');
 // Queued production needs BOTH completed prerequisites, and pauses on their loss.
 await p.evaluate(()=>{repacked.alive=false;window.fac=g.addBuilding(0,'factory',9,10);fac._placedAt=-100;g.state.primary.player.factory=fac.id;window.dep=g.addBuilding(0,'repair',14,10);dep._placedAt=-100;g.state.debug.fastProd=true;});
 assert(await p.evaluate(()=>OUTech.canUnit(g.buildings,0,'mcv',g.state.t)));
 await p.evaluate(()=>{fac.buildQ.push({kind:'mcv',t:0,tNeed:1,cost:0,paid:0});dep.alive=false;g.footprint.setBuildingOcc(dep,0);});await p.waitForTimeout(600);assert.equal(await p.evaluate(()=>fac.buildQ[0].t),0);
 await p.evaluate(()=>{dep=g.addBuilding(0,'repair',14,10);dep._placedAt=-100});
 await p.waitForFunction(()=>g.units.some(u=>u.alive&&u.kind==='mcv'&&u._factoryBornFrom===fac.id),null,{timeout:20000}).catch(async e=>{console.log('DIAGNOSTIC',JSON.stringify(await p.evaluate(()=>({q:fac.buildQ,dispatch:fac._factoryDispatch,units:g.units.map(u=>({kind:u.kind,x:u.x,y:u.y,from:u._factoryBornFrom,alive:u.alive})),state:g.state.gameOverPending,time:g.state.t,fac:{x:fac.x,y:fac.y,alive:fac.alive},dep:{alive:dep.alive},can:OUTech.canUnit(g.buildings,0,'mcv',g.state.t)}))));console.log(errors);throw e;});console.log('PRODUCTION_OK');
 // Destruction during packing must never create another MCV.
 await p.evaluate(()=>{window.deadYard=g.addBuilding(0,'hq',24,24);g.mcv.requestRepack(deadYard,deadYard.x,deadYard.y);deadYard.alive=false;g.footprint.setBuildingOcc(deadYard,0);window.count=g.units.filter(u=>u.alive&&u.kind==='mcv').length;});
 await p.waitForTimeout(3500);assert.equal(await p.evaluate(()=>g.units.filter(u=>u.alive&&u.kind==='mcv').length),await p.evaluate(()=>count));
 // Sale is demolition/refund, never a controllable MCV.
 await p.evaluate(()=>{window.sale=g.addBuilding(0,'hq',24,24);window.saleMCVs=g.units.filter(u=>u.alive&&u.kind==='mcv').length;window.saleMoney=g.state.player.money;g.sellBuilding(sale)});
 assert(await p.evaluate(()=>sale._mcvSelling&&g.state.player.money===saleMoney+g.COST.hq/2));
 await p.waitForFunction(()=>!sale.alive,null,{timeout:10000});assert.equal(await p.evaluate(()=>g.units.filter(u=>u.alive&&u.kind==='mcv').length),await p.evaluate(()=>saleMCVs));
 // Enemy MCV uses bounded site search and deploys instead of joining an attack wave.
 await p.evaluate(()=>{for(const b of g.buildings)if(b.team===1&&b.kind==='hq'){b.alive=false;g.footprint.setBuildingOcc(b,0);}g.ai.tick=originalAITick;window.enemyMCV=g.addUnit(1,'mcv',28.5*g.TILE,20.5*g.TILE);g.mcv.tickAI();});
 await p.waitForFunction(()=>g.buildings.some(b=>b.alive&&b.team===1&&b._mcvOriginId===enemyMCV.id),null,{timeout:35000});
 // Real pointer double-click, then a ground movement order to the selected yard.
 await p.evaluate(()=>{for(const u of g.units)if(u.team===0)u.alive=false;window.clickMCV=g.addUnit(0,'mcv',20.5*g.TILE,28.5*g.TILE);g.centerCameraOn(clickMCV.x,clickMCV.y);g.state.selection.clear();});
 const point=await p.evaluate(()=>{const c=document.querySelector('canvas'),r=c.getBoundingClientRect(),v=g.worldToScreen(clickMCV.x,clickMCV.y);return{x:r.left+v.x*r.width/c.width,y:r.top+(v.y-15*g.cam.zoom)*r.height/c.height}});
 await p.mouse.dblclick(point.x,point.y,{delay:80});await p.waitForFunction(()=>g.buildings.some(b=>b.alive&&b._mcvOriginId===clickMCV.id),null,{timeout:12000});
 await p.evaluate(()=>{window.clickYard=g.buildings.find(b=>b.alive&&b._mcvOriginId===clickMCV.id)});await p.waitForFunction(()=>!clickYard._mcvPhase,null,{timeout:10000});
 const dest=await p.evaluate(()=>{g.state.selection=new Set([clickYard.id]);const c=document.querySelector('canvas'),r=c.getBoundingClientRect(),v=g.worldToScreen(clickYard.x+4*g.TILE,clickYard.y);return{x:r.left+v.x*r.width/c.width,y:r.top+v.y*r.height/c.height}});
 await p.mouse.click(dest.x,dest.y);await p.waitForFunction(()=>clickYard._mcvPhase==='pack',null,{timeout:5000});
 assert.equal(errors.length,0,errors.join('\n'));fs.writeFileSync(process.argv[2]+'.json',JSON.stringify({timing,immediateBuild:immediate,blocked,reverseMatches:true,hpPreserved:true,optionGate:true,noRepackRefund:true,production:true,deathNoRespawn:true,saleDistinct:true,enemyDeploy:true,doubleClick:true,groundMoveRepack:true,errors},null,2));console.log('MCV_PASS');
 }finally{await b.close();}})().catch(e=>{console.error(e);process.exitCode=1});
