const {chromium,firefox}=require(process.env.OUTRAGE_PLAYWRIGHT),fs=require('fs'),assert=require('assert');
(async()=>{const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});try{
const p=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];p.on('pageerror',e=>errors.push(String(e)));
await p.goto('http://127.0.0.1:8765/index.html?debug=1');await p.waitForFunction(()=>window.OUTankTest&&window.OUTank3D?.harvesterReady);
await p.locator('#fogOff').check();await p.locator('#startBtn').click();await p.waitForFunction(()=>OUTankTest.running);
await p.evaluate(()=>{const g=OUTankTest,T=g.TILE;g.ai.tick=()=>{};for(const u of g.units)u.alive=false;
const x=Math.floor(g.MAP_W/2),y=Math.floor(g.MAP_H/2);
for(let ty=y-10;ty<y+15;ty++)for(let tx=x-10;tx<x+18;tx++){const i=ty*g.MAP_W+tx;g.terrain[i]=0;g.treeHp[i]=0;g.ore[i]=0;g.isGem[i]=0;}
const ref=g.addBuilding(g.TEAM.PLAYER,'refinery',x,y);for(const u of g.units)u.alive=false;
window.portcase={ref,port:OUHarvester.port(ref)};g.centerCameraOn(ref.x+T,ref.y);
const bd=PO.buildings.drawBuilding,ud=OUTank3D.draw,draw=OURender.draw;
PO.buildings.drawBuilding=function(b,...a){window.paintOrder.push(b.id);return bd.call(this,b,...a)};
OUTank3D.draw=function(c,u,...a){window.paintOrder.push(u.id);return ud.call(this,c,u,...a)};
OURender.draw=function(...a){window.paintOrder=[];return draw.apply(this,a)};
});
const moves=[];
for(const kind of ['tank','harvester','infantry'])for(const lane of [-1,0,1]){
await p.evaluate(({kind,lane})=>{const g=OUTankTest,T=g.TILE,{port}=portcase;for(const u of g.units)u.alive=false;
const u=g.addUnit(g.TEAM.PLAYER,kind,(port.tx+.5)*T,(port.ty+lane+.5)*T,{skipMvp:true});
u.order={type:'idle'};window.probe=u;window.goal={x:(port.tx+1.5)*T,y:(port.ty+(lane===-1?-3:3)+.5)*T};
g.state.selection.clear();g.state.selection.add(u.id);},{kind,lane});
await p.waitForTimeout(120);
if(kind!=='infantry')assert(await p.evaluate(()=>paintOrder.indexOf(portcase.ref.id)<paintOrder.indexOf(probe.id)),'Port unit must draw in front of refinery');
await p.evaluate(()=>OUTankTest.commands.issueMoveAll(goal.x,goal.y));
await p.waitForFunction(()=>Math.hypot(probe.x-goal.x,probe.y-goal.y)<65,{},{timeout:12000});
moves.push({kind,lane,escaped:true});
}
await p.evaluate(()=>{const g=OUTankTest,T=g.TILE,{port,ref}=portcase;for(const u of g.units)u.alive=false;
window.mineCells=[];for(let i=0;i<7;i++){const tx=port.tx+4+i%3,ty=port.ty+Math.floor(i/3);g.ore[ty*g.MAP_W+tx]=OUHarvester.ore.max;mineCells.push(ty*g.MAP_W+tx);}
const tx=port.tx+4,ty=port.ty,u=g.addUnit(g.TEAM.PLAYER,'harvester',(tx+.5)*T,(ty+.5)*T,{skipMvp:true});window.probe=u;
u.carry=0;u.order={type:'harvest',tx,ty,x:u.x,y:u.y};g.sim.setPathTo(u,u.x,u.y);
window.miningStart=g.state.t;
});
await p.waitForFunction(()=>mineCells.filter(i=>OUTankTest.ore[i]<=0).length>=3,{},{timeout:20000});
const mining=await p.evaluate(()=>({depleted:mineCells.filter(i=>OUTankTest.ore[i]<=0).length,elapsed:OUTankTest.state.t-miningStart,carry:probe.carry,removed:mineCells.length*OUHarvester.ore.max-mineCells.reduce((a,i)=>a+OUTankTest.ore[i],0)}));
assert(Math.abs(mining.carry-mining.removed)<.0001);
await p.screenshot({path:process.argv[2]+'/port-resource-gameplay.png'});
await p.evaluate(()=>{const g=OUTankTest,T=g.TILE,ref=portcase.ref,a=OUHarvester.approach(ref,T);
probe.x=a.x;probe.y=a.y;probe.bodyYaw=0;probe.carry=1000;probe.target=ref.id;probe.order={type:'return'};probe.path=null;
window.unloadSample={money:g.state.player.money};
function sample(){const d=probe.harvesterDock;if(d?.phase==='unload'&&unloadSample.start==null)unloadSample.start=d.started;
if(d?.phase==='close'&&unloadSample.end==null){unloadSample.end=g.state.t;unloadSample.paid=g.state.player.money-unloadSample.money;}
if(unloadSample.end==null)requestAnimationFrame(sample)}requestAnimationFrame(sample);
});
await p.waitForFunction(()=>unloadSample.end!=null,{},{timeout:12000});
const unloading=await p.evaluate(()=>unloadSample);assert.equal(unloading.paid,1000);assert(unloading.end-unloading.start-.4<1.08);assert.equal(errors.length,0);
const result={moves,mining,unloading,errors};fs.writeFileSync(process.argv[2]+'/port-resource-evidence.json',JSON.stringify(result,null,2));console.log(result);
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1});