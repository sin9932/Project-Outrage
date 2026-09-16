const {chromium}=require(process.env.OUTRAGE_PLAYWRIGHT),fs=require('fs'),assert=require('assert');
(async()=>{const b=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});try{
const p=await b.newPage({viewport:{width:1440,height:900}}),errors=[];p.on('pageerror',e=>errors.push(String(e)));
await p.goto(process.env.OUTRAGE_URL||'http://127.0.0.1:8765/index.html?debug=1');await p.waitForFunction(()=>window.OUTankTest&&window.OUTank3D?.harvesterReady);
await p.locator('#fogOff').check();await p.locator('#startBtn').click();await p.waitForFunction(()=>OUTankTest.running);
await p.waitForFunction(()=>OUTankTest.buildings.some(b=>b.alive&&b.team===OUTankTest.TEAM.ENEMY&&b.kind==='hq'),null,{timeout:15000});
// Keep both teams viable when replacing their starting MCV units for this fixture.
await p.evaluate(()=>{const g=OUTankTest,m=g.units.find(u=>u.alive&&u.team===g.TEAM.PLAYER&&u.kind==='mcv');
if(m&&!g.buildings.some(b=>b.alive&&b.team===g.TEAM.PLAYER&&b.kind==='hq'))g.addBuilding(g.TEAM.PLAYER,'hq',Math.floor(m.x/g.TILE)-2,Math.floor(m.y/g.TILE)-2);});
await p.evaluate(()=>{const g=OUTankTest,T=g.TILE;g.ai.tick=()=>{};for(const u of g.units)u.alive=false;
const x=Math.floor(g.MAP_W/2),y=Math.floor(g.MAP_H/2);
for(let ty=y-8;ty<y+15;ty++)for(let tx=x-8;tx<x+18;tx++){const i=ty*g.MAP_W+tx;g.terrain[i]=0;g.treeHp[i]=0;g.ore[i]=0;}
const ref=g.addBuilding(g.TEAM.PLAYER,'refinery',x,y);ref._freeHarvesterPending=false;for(const u of g.units)u.alive=false;
const a=OUHarvester.approach(ref,T),list=[];
for(let i=0;i<2;i++){const u=g.addUnit(g.TEAM.PLAYER,'harvester',a.x+i*T*2,a.y+i*T*2,{skipMvp:true});
u.carry=40;u.target=ref.id;u.bodyYaw=0;u.order={type:'return'};g.sim.setPathTo(u,a.x,a.y);list.push(u);}
window.dcase={ref,a,list,start:g.state.player.money,done:new Set(),phases:new Map()};
function sample(){for(const u of list){if(u.harvesterDock)dcase.phases.set(u.id,true);if(dcase.phases.has(u.id)&&!u.harvesterDock&&u.carry===0)dcase.done.add(u.id);}requestAnimationFrame(sample)}requestAnimationFrame(sample);
g.centerCameraOn(a.x,a.y);
});
await p.waitForFunction(()=>dcase.done.size===2,{},{timeout:45000});
const queue=await p.evaluate(()=>({done:dcase.done.size,money:OUTankTest.state.player.money-dcase.start}));
assert.equal(queue.money,80);
await p.evaluate(()=>{const g=OUTankTest,{list,ref,a}=dcase;for(const u of list){u.order={type:'idle'};u.path=null;}
const u=list[0];u.x=a.x;u.y=a.y;u.bodyYaw=0;u.carry=50;u.target=ref.id;u.order={type:'return'};});
await p.waitForFunction(()=>dcase.list[0].harvesterDock?.phase==='unload',{},{timeout:15000});
const carry=await p.evaluate(()=>{const u=dcase.list[0],g=OUTankTest;u.order={type:'move'};u.target=null;g.sim.setPathTo(u,dcase.a.x+g.TILE*3,dcase.a.y);return u.carry;});
await p.waitForTimeout(700);
assert(await p.evaluate(c=>dcase.list[0].harvesterDock===null&&dcase.ref.dockUnitId==null&&dcase.list[0].carry===c,carry));
await p.evaluate(()=>{const u=dcase.list[0],g=OUTankTest;u.x=dcase.a.x;u.y=dcase.a.y;u.path=null;u.bodyYaw=0;u.target=dcase.ref.id;u.order={type:'return'};});
await p.waitForFunction(()=>dcase.list[0].harvesterDock?.phase==='enter');
await p.evaluate(()=>OUTankTest.destroyBuilding(dcase.ref));await p.waitForTimeout(400);
assert(await p.evaluate(()=>!dcase.list[0].harvesterDock));assert.equal(errors.length,0);
const result={queue,cancelPreservesCargo:true,destroyedRefineryReleasesDock:true,errors};
fs.writeFileSync(process.argv[2]+'/harvester-docking-evidence.json',JSON.stringify(result,null,2));console.log(result);
}finally{await b.close();}})().catch(e=>{console.error(e);process.exitCode=1});