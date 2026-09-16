const engine=process.env.OUTRAGE_BROWSER||'chromium',browserType=require(process.env.OUTRAGE_PLAYWRIGHT)[engine],fs=require('fs'),assert=require('node:assert/strict');
(async()=>{const b=await browserType.launch({headless:true,...(engine==='chromium'?{executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'}:{})});try{
const p=await b.newPage({viewport:{width:1440,height:900}}),errors=[];p.on('pageerror',e=>errors.push(e.stack));
await p.goto('http://127.0.0.1:8765/index.html?debug=1');await p.waitForFunction(()=>window.OUTankTest&&window.OUTank3D?.sentryReady,null,{timeout:90000});await p.locator('#fogOff').check();await p.locator('#startBtn').click();await p.waitForFunction(()=>OUTankTest.running);
const placement=await p.evaluate(()=>{const g=OUTankTest;window.originalAI=g.ai.tick;g.ai.tick=()=>{};for(const u of g.units)u.alive=false;for(const b of [...g.buildings])if(b.kind!=='hq')g.destroyBuilding(b);
for(let y=5;y<35;y++)for(let x=5;x<35;x++){const i=y*g.MAP_W+x;g.terrain[i]=0;g.treeHp[i]=0;g.ore[i]=0;}
window.ref=g.addBuilding(0,'refinery',12,12);ref._freeHarvesterPending=false;const a=OUHarvester.accessRect(ref),cells=[];
for(let y=a.ty;y<a.ty+a.th;y++)for(let x=a.tx;x<a.tx+a.tw;x++)cells.push({x,y,walk:g.buildOcc[y*g.MAP_W+x],blocked:g.footprint.isBlockedFootprint(x,y,1,1,'turret'),preview:g.footprint.footprintBlockedMask(x,y,1,1,'turret').blocked});
const occupied=g.footprint.isBlockedFootprint(ref.tx,ref.ty,ref.tw,ref.th,'refinery');g.destroyBuilding(ref);
const released=cells.every(c=>!g.footprint.isBlockedFootprint(c.x,c.y,1,1,'turret'));
window.blocker=g.addBuilding(0,'turret',a.tx+1,a.ty+1);blocker._placedAt=g.state.t+100;
const reverseBlocked=g.footprint.isBlockedFootprint(12,12,ref.tw,ref.th,'refinery');
window.ref=g.addBuilding(0,'refinery',12,12);ref._freeHarvesterPending=false;ref._placedAt=-100;
return{cells,occupied,released,reverseBlocked};});
assert(placement.cells.every(c=>c.walk===0&&c.blocked&&c.preview));assert(placement.occupied&&placement.released&&placement.reverseBlocked);
await p.evaluate(()=>{const g=OUTankTest,a=OUHarvester.approach(ref,g.TILE);window.h=g.addUnit(0,'harvester',a.x+g.TILE*2,a.y,{skipMvp:true});h.carry=100;h.order={type:'return'};h.target=ref.id;window.startMoney=g.state.player.money;});
await p.waitForTimeout(1800);const waiting=await p.evaluate(()=>({carry:h.carry,dock:!!h.harvesterDock,order:h.order.type}));assert.equal(waiting.carry,100);assert.equal(waiting.dock,false);assert.equal(waiting.order,'return');
await p.evaluate(()=>{const g=OUTankTest;window.alt=g.addBuilding(0,'refinery',20,12);alt._placedAt=-100;alt._freeHarvesterPending=false;});
await p.waitForFunction(()=>h.carry===0,null,{timeout:45000});assert.equal(await p.evaluate(()=>OUTankTest.state.player.money-startMoney),100);
await p.evaluate(()=>{const g=OUTankTest;g.destroyBuilding(blocker);for(const u of g.units)u.alive=false;const a=OUHarvester.approach(ref,g.TILE);window.h2=g.addUnit(0,'harvester',a.x,a.y,{skipMvp:true});h2.bodyYaw=Math.PI;h2.carry=75;h2.order={type:'return'};h2.target=ref.id;});await p.waitForFunction(()=>h2.carry===0,null,{timeout:35000}).catch(async e=>{console.log(await p.evaluate(()=>({h:JSON.parse(JSON.stringify(h2)),ref,blocked:OUTankTest.buildOcc[ref.ty*OUTankTest.MAP_W+ref.tx],units:OUTankTest.units.filter(u=>u.alive).map(u=>({id:u.id,x:u.x,y:u.y,kind:u.kind}))})));throw e;});
// Hit an enemy under each strategic order. Preserve player manual orders.
const reactions=[];
for(const type of ['guard','attackmove','attack']){
 await p.evaluate(type=>{const g=OUTankTest;for(const u of g.units)u.alive=false;window.gun=g.addBuilding(0,'turret',25,25);gun.hp=gun.hpMax=100000;gun._placedAt=-100;
 window.foe=g.addUnit(1,'tank',gun.x+420,gun.y,{skipMvp:true});foe.hp=foe.hpMax=10000;foe.order={type,x:gun.x+1000,y:gun.y,manual:true,allowAuto:type!=='attack',lockTarget:type==='attack'};foe.target=type==='attack'?ref.id:null;g.applyDamage(foe,1,gun.id,0);},type);
 await p.waitForFunction(()=>foe.target===gun.id&&foe.order.type==='attack',null,{timeout:8000});reactions.push(type);
 await p.evaluate(()=>OUTankTest.destroyBuilding(gun));
}
await p.evaluate(()=>{const g=OUTankTest;for(const u of g.units)u.alive=false;window.red=g.addBuilding(1,'turret',25,25);red._placedAt=-100;red.hp=red.hpMax=100000;window.player=g.addUnit(0,'tank',red.x+400,red.y,{skipMvp:true});player.order={type:'move',x:player.x+300,y:player.y,manual:true,allowAuto:false};g.applyDamage(player,1,red.id,1);});await p.waitForTimeout(500);assert(await p.evaluate(()=>player.target!==red.id));
// Real sentry fire with AI enabled must provoke a real damaging response.
await p.evaluate(()=>{const g=OUTankTest;g.destroyBuilding(red);for(const u of g.units)u.alive=false;window.gun=g.addBuilding(0,'turret',25,25);gun._placedAt=-100;gun.hp=gun.hpMax=100000;window.foe=g.addUnit(1,'tank',gun.x+420,gun.y,{skipMvp:true});foe.hp=foe.hpMax=10000;foe.order={type:'guard',x:foe.x,y:foe.y};g.ai.tick=originalAI;g.centerCameraOn(gun.x,gun.y);});
await p.waitForFunction(()=>gun.hp<gun.hpMax&&foe.lastAttacker===gun.id,null,{timeout:35000});
const live=await p.evaluate(()=>({target:foe.target,gun:gun.id,damage:gun.hpMax-gun.hp}));assert.equal(live.target,live.gun);
assert.equal(errors.length,0,errors.join('\n'));const result={placement,waiting,alternateUnloaded:true,clearedEntranceUnloaded:true,reactions,playerManualPreserved:true,live,errors};fs.writeFileSync(process.argv[2],JSON.stringify(result,null,2));console.log(result);
}finally{await b.close();}})().catch(e=>{console.error(e);process.exitCode=1});
