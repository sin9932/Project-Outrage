const {chromium}=require(process.env.OUTRAGE_PLAYWRIGHT),fs=require('fs'),assert=require('assert');
(async()=>{const b=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});try{
const p=await b.newPage({viewport:{width:1440,height:900}}),errors=[];p.on('pageerror',e=>errors.push(e.stack));
await p.goto('http://127.0.0.1:8765/index.html?debug=1');await p.waitForFunction(()=>window.OUTankTest&&window.OUTank3D?.harvesterReady,{},{timeout:30000});
await p.locator('#fogOff').check();await p.locator('#startBtn').click();await p.waitForFunction(()=>OUTankTest.running);
await p.evaluate(()=>{const g=OUTankTest,T=g.TILE;g.ai.tick=()=>{};for(const u of g.units){u.order={type:'idle'};u.path=null;}
const x=Math.floor(g.MAP_W/2),y=Math.floor(g.MAP_H/2);
for(let ty=y-8;ty<y+15;ty++)for(let tx=x-8;tx<x+18;tx++){const i=ty*g.MAP_W+tx;g.terrain[i]=0;g.treeHp[i]=0;g.ore[i]=0;}
const ref=g.addBuilding(g.TEAM.PLAYER,'refinery',x,y);const port=OUHarvester.port(ref);
const tx=port.tx+5,ty=port.ty;g.ore[ty*g.MAP_W+tx]=2000;
const u=g.addUnit(g.TEAM.PLAYER,'harvester',(tx+.5)*T,(ty+2.5)*T,{skipMvp:true});
u.carryMax=100;u.carry=0;window.hcase={ref,u,tx,ty,startMoney:g.state.player.money,phases:[],mined:false};u.order={type:'harvest',tx,ty,x:(tx+.5)*T,y:(ty+.5)*T};g.sim.setPathTo(u,(tx+.5)*T,(ty+.5)*T);
g.centerCameraOn((port.tx+1)*T,(port.ty+.5)*T);g.cam.zoom=1.2;
window.hsamples=[];function sample(){const d=u.harvesterDock;if(d&&!hcase.phases.includes(d.phase))hcase.phases.push(d.phase);
if(u.harvestUntil>g.state.t)hcase.mined=true;
hsamples.push({t:g.state.t,x:u.x,y:u.y,carry:u.carry,phase:d?.phase,order:u.order.type});requestAnimationFrame(sample)}requestAnimationFrame(sample);
});
await p.waitForFunction(()=>hcase.mined,{},{timeout:15000});await p.screenshot({path:process.argv[2]+'/harvester-mining.png'});
await p.waitForFunction(()=>hcase.u.harvesterDock?.phase==='unload',{},{timeout:30000});await p.waitForTimeout(500);
await p.screenshot({path:process.argv[2]+'/harvester-unload.png'});
await p.waitForFunction(()=>hcase.phases.includes('exit')&&!hcase.u.harvesterDock,{},{timeout:15000});
const result=await p.evaluate(()=>{const g=OUTankTest,c=hcase;return{phases:c.phases,mined:c.mined,moneyDelta:g.state.player.money-c.startMoney,carry:c.u.carry,order:c.u.order.type,lanes:[-1,0,1].map(d=>{const p=OUHarvester.port(c.ref);return g.buildOcc[(p.ty+d)*g.MAP_W+p.tx]}),asset:OUTank3D.harvesterReady,samples:hsamples.length};});
console.log(result);assert(result.mined);assert(result.moneyDelta>=99);assert(result.lanes.every(x=>x===0));assert(result.phases.includes('reverse'));assert.equal(errors.length,0);
fs.writeFileSync(process.argv[2]+'/harvester-evidence.json',JSON.stringify({...result,errors},null,2));console.log(result);
}finally{await b.close();}})().catch(e=>{console.error(e);process.exitCode=1});