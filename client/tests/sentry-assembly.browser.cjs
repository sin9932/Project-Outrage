const engine=process.env.OUTRAGE_BROWSER||'chromium',browserType=require(process.env.OUTRAGE_PLAYWRIGHT)[engine],fs=require('fs'),assert=require('node:assert/strict');
(async()=>{const b=await browserType.launch({headless:true,...(engine==='chromium'?{executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'}:{})});try{
const p=await b.newPage({viewport:{width:1440,height:900}}),errors=[];p.on('pageerror',e=>errors.push(e.stack));p.on('console',m=>{if(m.type()==='error')console.log(m.text())});
await p.goto('http://127.0.0.1:8765/index.html?debug=1');await p.waitForFunction(()=>window.OUTank3D?.sentryReady&&window.OUTankTest,null,{timeout:90000});await p.locator('#fogOff').check();await p.locator('#startBtn').click();await p.waitForFunction(()=>OUTankTest.running);
await p.evaluate(()=>{const g=OUTankTest;g.ai.tick=()=>{};for(const u of g.units)u.alive=false;
for(let y=8;y<22;y++)for(let x=8;x<22;x++){let i=y*g.MAP_W+x;g.terrain[i]=0;g.treeHp[i]=0;g.ore[i]=0;}
window.gun=g.addBuilding(0,'turret',15,15);g.cam.zoom=3;g.centerCameraOn(gun.x,gun.y);
window.records=[];const fn=OURender.draw;OURender.draw=function(...a){records.push({t:g.state.t,alive:gun.alive,selling:!!gun._sentrySelling,progress:OUSentry.progress(gun,g.state.t),occupied:g.buildOcc[gun.ty*g.MAP_W+gun.tx],shots:gun.shotSerial||0});return fn.apply(this,a);};});
const curves=await p.evaluate(()=>{const result=[];for(const progress of [0,.15,.3,.45,.6,.75,.9,1]){
const forward={...gun,_placedAt:10-progress*OUSentry.buildSeconds},reverse={...gun,_sentrySelling:true,_sentrySellFrom:1,_sentrySellT0:10-(1-progress)*OUSentry.buildSeconds};
result.push({progress,forward:OUTank3D.sentryAssemblyPose(forward,10),reverse:OUTank3D.sentryAssemblyPose(reverse,10)});
}return result;});
for(const sample of curves)for(const name of Object.keys(sample.forward))for(const key of ['position','quaternion','scale'])sample.forward[name][key].forEach((v,i)=>assert(Math.abs(v-sample.reverse[name][key][i])<1e-5,'Reverse clip differs'));
for(const name of ['Leg_0','Leg_4','Pedestal','HeadAssembly','GunSlide'])assert.notDeepEqual(curves[0].forward[name],curves.at(-1).forward[name],name+' does not assemble');
// The receiver must be seated before the barrel telescope starts. The ammo
// rack and hinge remain rigid so neither can sweep through the receiver.
for(const sample of curves){
 for(const name of ['AmmoRack','GunHinge'])assert.deepEqual(sample.forward[name],curves.at(-1).forward[name],name+' must stay rigid');
 if(sample.progress>=.75)assert.deepEqual(sample.forward.HeadAssembly,curves.at(-1).forward.HeadAssembly,'Receiver moves during barrel deployment');
 assert.deepEqual(sample.forward.GunSlide.quaternion,curves.at(-1).forward.GunSlide.quaternion,'Barrels must extend without folding');
}
await p.waitForFunction(()=>OUSentry.complete(gun,OUTankTest.state.t));
const before=await p.evaluate(()=>({money:OUTankTest.state.player.money,shots:gun.shotSerial||0}));
await p.locator('#btnSellMode').click();
const pt=await p.evaluate(()=>OUTankTest.worldToScreen(gun.x,gun.y)),box=await p.locator('#c').boundingBox();
await p.mouse.move(box.x+pt.x,box.y+pt.y-25);await p.waitForTimeout(150);await p.mouse.click(box.x+pt.x,box.y+pt.y-25);await p.waitForFunction(()=>gun._sentrySelling,null,{timeout:5000});
await p.mouse.click(box.x+pt.x,box.y+pt.y-25);
await p.waitForTimeout(600);
const middle=await p.evaluate(()=>({alive:gun.alive,occupied:OUTankTest.buildOcc[gun.ty*OUTankTest.MAP_W+gun.tx],progress:OUSentry.progress(gun,OUTankTest.state.t)}));
assert(middle.alive&&middle.occupied===1&&middle.progress>0&&middle.progress<1);
await p.waitForFunction(()=>!gun.alive,null,{timeout:7000});
const sold=await p.evaluate(()=>({money:OUTankTest.state.player.money,occupied:OUTankTest.buildOcc[gun.ty*OUTankTest.MAP_W+gun.tx],duration:gun._sentrySellFinalizeAt-gun._sentrySellT0,records,shots:gun.shotSerial||0}));
assert.equal(sold.money-before.money,250);assert.equal(sold.occupied,0);assert(Math.abs(sold.duration-3.2)<1e-6);assert.equal(sold.shots,before.shots);assert(sold.records.filter(r=>r.alive&&r.selling).every(r=>r.occupied===1));
await p.locator('#btnSellMode').click();
await p.evaluate(()=>{const g=OUTankTest;gun=g.addBuilding(0,'turret',15,15);gun._placedAt=g.state.t-1.2;records=[];});
await p.locator('#btnSellMode').click();await p.mouse.move(box.x+pt.x,box.y+pt.y-25);await p.waitForTimeout(150);await p.mouse.click(box.x+pt.x,box.y+pt.y-25);await p.waitForFunction(()=>gun._sentrySelling,null,{timeout:5000});
const partial=await p.evaluate(()=>({from:gun._sentrySellFrom,duration:gun._sentrySellFinalizeAt-gun._sentrySellT0}));
assert(partial.from>0&&partial.from<.8);assert(Math.abs(partial.duration-partial.from*3.2)<1e-6);await p.waitForFunction(()=>!gun.alive);
const legacy=[];
for(const [kind,flag,cost] of [['barracks','_barrackSelling',500],['power','_powerSelling',600],['refinery','_refinerySelling',2000]]){
 await p.evaluate(kind=>{const g=OUTankTest;gun=g.addBuilding(0,kind,15,15);gun._freeHarvesterPending=false;g.centerCameraOn(gun.x,gun.y);},kind);
 await p.waitForFunction(()=>OUTankTest.state.t>=PO.buildings.constructionEnd(gun));
 const money=await p.evaluate(()=>OUTankTest.state.player.money),xy=await p.evaluate(()=>OUTankTest.worldToScreen(gun.x,gun.y));
 if(await p.evaluate(()=>OUTankTest.state.mouseMode!=='sell'))await p.locator('#btnSellMode').click();
 await p.mouse.move(xy.x,xy.y-25);await p.waitForTimeout(100);await p.mouse.click(xy.x,xy.y-25);
 await p.waitForFunction(f=>gun[f],flag,{timeout:5000});assert(await p.evaluate(()=>gun.alive));
 await p.waitForFunction(()=>!gun.alive,null,{timeout:10000});
 const refund=await p.evaluate(m=>OUTankTest.state.player.money-m,money);assert.equal(refund,cost/2);legacy.push({kind,refund});
}
assert.equal(errors.length,0,errors.join('\n'));
fs.writeFileSync(process.argv[2],JSON.stringify({curves,middle,sold:{duration:sold.duration,refund:sold.money-before.money,occupied:sold.occupied},partial,legacy,errors},null,2));
console.log({middle,sold:{duration:sold.duration,refund:sold.money-before.money},partial,legacy,errors});
}finally{await b.close();}})().catch(e=>{console.error(e);process.exitCode=1});