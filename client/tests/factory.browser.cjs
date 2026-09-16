const engine=process.env.OUTRAGE_BROWSER||'chromium',bt=require(process.env.OUTRAGE_PLAYWRIGHT)[engine],fs=require('fs'),assert=require('node:assert/strict');
(async()=>{const b=await bt.launch({headless:true,...(engine==='chromium'?{executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'}:{})});try{
const p=await b.newPage({viewport:{width:1440,height:900}}),errors=[];p.on('pageerror',e=>errors.push(e.stack));
await p.goto('http://127.0.0.1:8765/index.html?debug=1');await p.waitForFunction(()=>OUTank3D.factoryReady||OUTank3D.assetError,null,{timeout:90000});assert(await p.evaluate(()=>OUTank3D.factoryReady),await p.evaluate(()=>OUTank3D.assetError));
await p.locator('#fogOff').check();await p.locator('#startBtn').click();await p.waitForFunction(()=>OUTankTest.running);
await p.evaluate(()=>{const g=OUTankTest;g.ai.tick=()=>{};for(const u of g.units)u.alive=false;for(let y=8;y<32;y++)for(let x=8;x<32;x++){const i=y*g.MAP_W+x;g.terrain[i]=0;g.treeHp[i]=0;g.ore[i]=0;}
window.fac=g.addBuilding(0,'factory',16,15);g.state.primary.player.factory=fac.id;g.state.debug.fastProd=true;g.cam.zoom=1.8;g.centerCameraOn(fac.x,fac.y);window.factoryHistory=[];const draw=OURender.draw;OURender.draw=function(...a){factoryHistory.push({t:g.state.t,progress:OUFactory.progress(fac,g.state.t),door:OUFactory.door(fac,g.state.t),vehicle:OUFactory.vehicle(fac,g.state.t,g.TILE),spawn:g.units.filter(u=>u._factoryBornFrom===fac.id).length});return draw.apply(this,a);};});
const curves=await p.evaluate(()=>[0,.2,.4,.6,.8,1].map(v=>{const f={...fac,_placedAt:10-v*OUFactory.buildSeconds},r={...fac,_factorySelling:true,_factorySellFrom:1,_factorySellT0:10-(1-v)*OUFactory.buildSeconds};return{v,forward:OUTank3D.factoryPose(f,10),reverse:OUTank3D.factoryPose(r,10)}}));
for(const c of curves)for(const n in c.forward)for(const key of ['position','quaternion','scale'])c.forward[n][key].forEach((v,i)=>assert(Math.abs(v-c.reverse[n][key][i])<1e-5));
await p.waitForFunction(()=>OUFactory.complete(fac,OUTankTest.state.t));
const hatch=await p.evaluate(()=>{const t=OUTankTest.state.t;OUFactory.beginAirLaunch(fac,t);return [0,.3,.6,1.5,2.3,2.7].map(a=>({a,open:OUFactory.roof(fac,t+a),pose:OUTank3D.factoryPose(fac,t+a)}));});assert(Math.abs(hatch[2].open-1)<1e-6);assert.equal(hatch.at(-1).open,0);
await p.evaluate(()=>{fac._factoryAirAt=-100;for(let i=0;i<2;i++)fac.buildQ.push({kind:'tank',t:0,tNeed:.1,cost:0,paid:0});});
await p.waitForFunction(()=>!!fac._factoryDispatch);await p.waitForFunction(()=>OUTankTest.units.some(u=>u._factoryBornFrom===fac.id),null,{timeout:15000});
const first=await p.evaluate(()=>{const u=OUTankTest.units.find(u=>u._factoryBornFrom===fac.id),a=OUFactory.exit(fac,OUTankTest.TILE);return{born:{x:u.x,y:u.y},exit:a,count:OUTankTest.units.filter(u=>u._factoryBornFrom===fac.id).length,history:factoryHistory}});assert.equal(first.count,1);assert(first.history.some(h=>h.door===1&&h.vehicle&&h.spawn===0));assert(!first.history.some(h=>h.progress<1&&h.spawn));
await p.waitForFunction(()=>OUTankTest.units.filter(u=>u._factoryBornFrom===fac.id).length===2,null,{timeout:15000});
await p.evaluate(()=>{const g=OUTankTest;for(const u of g.units)u.alive=false;const a=OUFactory.exit(fac,g.TILE);window.blocker=g.addBuilding(0,'turret',Math.floor(a.x/g.TILE),Math.floor(a.y/g.TILE));fac.buildQ.push({kind:'harvester',t:0,tNeed:.1,cost:0,paid:0});});await p.waitForTimeout(1600);assert(await p.evaluate(()=>!fac._factoryDispatch&&fac.buildQ.length===1));
await p.evaluate(()=>OUTankTest.destroyBuilding(blocker));await p.waitForFunction(()=>OUTankTest.units.some(u=>u.alive&&u._factoryBornFrom===fac.id&&u.kind==='harvester'),null,{timeout:15000});
await p.evaluate(()=>{for(const u of OUTankTest.units)u.alive=false;fac.buildQ.push({kind:'tank',t:0,tNeed:.1,cost:0,paid:0});});await p.waitForFunction(()=>!!fac._factoryDispatch);
await p.evaluate(()=>{window.beforeCancel=OUTankTest.units.length;fac.buildQ.length=0;});await p.waitForTimeout(2200);assert(await p.evaluate(()=>!fac._factoryDispatch&&OUTankTest.units.length===beforeCancel));
// Fully paid dispatch must not require spare credits or charge twice.
await p.evaluate(()=>{const g=OUTankTest;g.state.debug.fastProd=false;g.state.player.money=0;window.paidCount=g.units.length;fac.buildQ.push({kind:'tank',t:.1,tNeed:.1,cost:1000,paid:1000});});
await p.waitForFunction(()=>OUTankTest.units.length>paidCount,null,{timeout:15000});assert.equal(await p.evaluate(()=>OUTankTest.state.player.money),0);
await p.evaluate(()=>{for(const u of OUTankTest.units)u.alive=false;});
await p.evaluate(()=>{const g=OUTankTest;g.state.debug.fastProd=true;g.state.primary.player.factory=fac.id;fac.buildQ.push({kind:'tank',t:0,tNeed:.1,cost:0,paid:0});});
await p.waitForFunction(()=>!!fac._factoryDispatch);
const source=await p.evaluate(()=>{const g=OUTankTest;window.primaryBefore=g.units.length;const started=fac._factoryDispatch.started;window.altFactory=g.addBuilding(0,'factory',23,15);altFactory._placedAt=-100;g.state.primary.player.factory=altFactory.id;return{started,id:fac.id}});
await p.waitForFunction(()=>OUTankTest.units.length>primaryBefore,null,{timeout:15000});assert.equal(await p.evaluate(()=>OUTankTest.units.at(-1)._factoryBornFrom),source.id);
await p.evaluate(()=>OUTankTest.sellBuilding(fac));assert(await p.evaluate(()=>fac.alive&&fac._factorySelling));await p.waitForFunction(()=>!fac.alive,null,{timeout:6000});
assert.equal(errors.length,0,errors.join('\n'));const result={curves,hatch,production:{count:first.count,insideBeforeSpawn:true,blockedExitWait:true,harvesterExit:true,cancelledDispatch:true,sequentialExit:true,paidWithZeroBalance:true,primarySwitch:true},reverseSale:true,errors};fs.writeFileSync(process.argv[2],JSON.stringify(result,null,2));console.log({factoryReady:true,production:result.production,reverseSale:true,errors});
}finally{await b.close();}})().catch(e=>{console.error(e);process.exitCode=1});
