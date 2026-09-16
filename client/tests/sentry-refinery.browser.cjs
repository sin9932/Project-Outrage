const engine=process.env.OUTRAGE_BROWSER||'chromium';const chromium=require(process.env.OUTRAGE_PLAYWRIGHT)[engine],assert=require('node:assert/strict'),fs=require('fs');
(async()=>{const b=await chromium.launch({headless:true,...(engine==='chromium'?{executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'}:{})});
try{const p=await b.newPage({viewport:{width:1440,height:900}}),errors=[];p.on('pageerror',e=>errors.push(e.stack));p.on('console',m=>{if(m.type()==='error')console.log(m.text())});
await p.goto('http://127.0.0.1:8765/index.html?debug=1');await p.waitForFunction(()=>window.OUTankTest&&window.OUTank3D?.sentryReady,null,{timeout:90000});
await p.locator('#fogOff').check();await p.locator('#startBtn').click();await p.waitForFunction(()=>OUTankTest.running);
const placed=await p.evaluate(()=>{const g=OUTankTest;g.ai.tick=()=>{};for(const u of g.units)u.alive=false;
const x=12,y=12,T=g.TILE;for(let yy=7;yy<29;yy++)for(let xx=7;xx<29;xx++){const i=yy*g.MAP_W+xx;g.terrain[i]=0;g.treeHp[i]=0;g.ore[i]=0;}
window.ref=g.addBuilding(g.TEAM.PLAYER,'refinery',x,y);g.centerCameraOn(0,0);
window.spawnSamples=[];function sample(){spawnSamples.push({t:g.state.t,n:g.units.filter(u=>u.homeRefineryId===ref.id).length});if(spawnSamples.length<2000)requestAnimationFrame(sample)}sample();
return {id:ref.id,start:g.state.t,end:PO.buildings.constructionEnd(ref)};});
await p.waitForFunction(()=>OUTankTest.units.some(u=>u.homeRefineryId===ref.id),null,{timeout:30000});
const spawn=await p.evaluate(()=>({end:PO.buildings.constructionEnd(ref),first:spawnSamples.find(s=>s.n>0),early:spawnSamples.filter(s=>s.t<PO.buildings.constructionEnd(ref)&&s.n>0)}));assert.equal(spawn.early.length,0);assert(spawn.first.t>=spawn.end);
await p.evaluate(()=>{const g=OUTankTest,H=OUHarvester,T=g.TILE;for(const u of g.units)u.alive=false;const a=H.approach(ref,T);window.h=g.addUnit(0,'harvester',a.x,a.y,{skipMvp:true});h.bodyYaw=Math.PI;h.carry=1000;h.order={type:'return'};h.target=ref.id;h.repathCd=99;h.path=null;g.state.player.money=10000;window.dockSamples=[];window.finished=false;const fn=OURender.draw;OURender.draw=function(...args){if(h.harvesterDock)dockSamples.push({t:g.state.t,x:h.x,y:h.y,phase:h.harvesterDock.phase,carry:h.carry,yaw:h.bodyYaw});else if(dockSamples.length&&!finished){finished=true;window.departedAt=g.state.t;}return fn.apply(this,args)};g.centerCameraOn(ref.x,ref.y);});
await p.waitForFunction(()=>finished,null,{timeout:30000});
const dock=await p.evaluate(()=>({samples:dockSamples,departedAt,point:OUHarvester.dock(ref,OUTankTest.TILE),approach:OUHarvester.approach(ref,OUTankTest.TILE),money:OUTankTest.state.player.money,T:OUTankTest.TILE}));const phases=[...new Set(dock.samples.map(s=>s.phase))];assert.deepEqual(phases,['enter','turn','unload','close']);
assert(Math.abs(dock.approach.x-dock.point.x-dock.T)<.001);
const turning=dock.samples.filter(s=>s.phase==='turn');assert(turning.every(s=>Math.hypot(s.x-dock.point.x,s.y-dock.point.y)<1));
const close=dock.samples.filter(s=>s.phase==='close');assert(dock.departedAt-close[0].t>=.49&&dock.departedAt-close[0].t<.56);assert.equal(dock.money,11000);
await p.evaluate(()=>{const g=OUTankTest;for(const u of g.units)u.alive=false;window.gun=g.addBuilding(0,'turret',22,18);window.red=g.addBuilding(1,'turret',25,22);red._placedAt=g.state.t+100;window.foe=g.addUnit(1,'infantry',gun.x,gun.y-260,{skipMvp:true});foe.hp=foe.hpMax=10000;foe.dmg=0;foe.holdPos=true;foe.order={type:'stop'};window.shotsBeforeBuild=0;window.aimErrors=[];const fn=OURender.draw;let last=0;OURender.draw=function(...a){if((gun.shotSerial||0)>last){last=gun.shotSerial;if(!OUSentry.complete(gun,g.state.t))shotsBeforeBuild++;aimErrors.push(Math.abs(OUTankMotion.wrap(gun.turretYaw-Math.atan2(foe.y-gun.y,foe.x-gun.x))));}return fn.apply(this,a)};g.centerCameraOn((gun.x+red.x)/2,(gun.y+red.y)/2);g.cam.zoom=1.3;});
await p.waitForFunction(()=>gun.shotSerial>0,null,{timeout:10000});
const headings=[];
for(const angle of [0,Math.PI/2,Math.PI,-Math.PI/2]){
const old=await p.evaluate(a=>{foe.x=gun.x+Math.cos(a)*260;foe.y=gun.y+Math.sin(a)*260;return gun.shotSerial},angle);
await p.waitForFunction(n=>gun.shotSerial>n,old,{timeout:5000});
headings.push(await p.evaluate(()=>({yaw:gun.turretYaw,hp:foe.hp})));
}
const combat=await p.evaluate(()=>{const physical=OUSentry.muzzle(gun),render=OUTank3D.sentryMuzzleWorld(gun,OUTankTest.state.t);return {headings:gun.turretYaw,shots:gun.shotSerial,shotsBeforeBuild,aimErrors,muzzleError:Math.hypot(physical.x-render.x,physical.y-render.y,physical.z-render.z)}});
assert.equal(combat.shotsBeforeBuild,0);assert(combat.aimErrors.every(e=>e<.061));assert(combat.muzzleError<.01,JSON.stringify(combat));
await p.evaluate(()=>{red._placedAt=0;red.turretYaw=.6;red.shootCd=100;foe.alive=false});await p.waitForTimeout(100);
await p.screenshot({path:process.argv[2]+'.png'});
await p.evaluate(()=>OUTankTest.destroyBuilding(gun));await p.waitForTimeout(100);assert(await p.evaluate(()=>OUTank3D.sentryGhosts(OUTankTest.state.t).length>0));await p.waitForTimeout(1500);assert.equal(await p.evaluate(()=>OUTank3D.sentryGhosts(OUTankTest.state.t).length),0);
await p.evaluate(()=>{window.doomed=OUTankTest.addBuilding(0,'refinery',7,22);OUTankTest.destroyBuilding(doomed)});await p.waitForTimeout(1800);assert(await p.evaluate(()=>!OUTankTest.units.some(u=>u.homeRefineryId===doomed.id)),'Destroyed construction spawned a free harvester');assert.equal(errors.length,0,errors.join('\n'));const out={placed,spawn,dock:{phases,enterDistance:dock.T,closeDuration:dock.departedAt-close[0].t,money:dock.money},combat,headings,errors};fs.writeFileSync(process.argv[2],JSON.stringify(out,null,2));console.log(out);
}finally{await b.close();}})().catch(e=>{console.error(e);process.exitCode=1});