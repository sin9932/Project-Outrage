const {chromium}=require(process.env.OUTRAGE_PLAYWRIGHT),fs=require('fs'),assert=require('node:assert/strict'),path=require('path');
(async()=>{const b=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
try{const p=await b.newPage({viewport:{width:1440,height:900}});const errors=[];p.on('pageerror',e=>errors.push(e.stack));
await p.goto(process.env.OUTRAGE_URL||'http://127.0.0.1:8765/index.html?debug=1&tankdemo=1');await p.waitForFunction(()=>window.OUTankTest&&window.OUTank3D?.status==='ready');
await p.locator('#fogOff').check();await p.locator('#startBtn').click();await p.waitForFunction(()=>OUTankTest.running);
const camera=await p.evaluate(()=>{const g=OUTankTest,c=document.getElementById('c'),out=[];g.ai.tick=()=>{};
for(const z of [.6,1,1.8]){g.cam.zoom=z;for(const [x,y]of[[0,0],[g.MAP_W*g.TILE,0],[0,g.MAP_H*g.TILE],[g.MAP_W*g.TILE,g.MAP_H*g.TILE]]){
g.centerCameraOn(x,y);const s=g.worldToScreen(x,y);out.push({z,error:Math.hypot(s.x-(g.cam.viewWidth||c.width)/2,s.y-c.height/2)});
}g.centerCameraOn(g.MAP_W*g.TILE/2,g.MAP_H*g.TILE/2);const q=g.camera.worldToIso(g.cam.x,g.cam.y),before=g.worldToScreen(g.cam.x,g.cam.y),world={x:g.cam.x,y:g.cam.y};g.camera.applyPan(q.x,q.y,70,40);const after=g.worldToScreen(world.x,world.y);out.push({z,panError:Math.hypot(after.x-before.x-70,after.y-before.y-40)});}
return out;});assert(camera.every(r=>(r.error??r.panError)<.001),JSON.stringify(camera));
const ids=await p.evaluate(()=>{const g=OUTankTest,T=g.TILE,cx=Math.floor(g.MAP_W/2),cy=Math.floor(g.MAP_H/2);
for(let y=cy-12;y<cy+12;y++)for(let x=cx-12;x<cx+12;x++){const i=y*g.MAP_W+x;g.terrain[i]=0;g.treeHp[i]=0;g.ore[i]=0;}
const ids=[];for(let j=0;j<8;j++){const u=g.addUnit(0,'tank',(cx-5+j%4+.5)*T,(cy-3+Math.floor(j/4)+.5)*T,{skipMvp:true});
u.bodyYaw=u.turretYaw=Math.PI;u.order={type:'move',x:(cx+6.5)*T,y:(cy+3.5)*T};u.path=null;ids.push(u.id);}
g.cam.zoom=1;g.centerCameraOn(cx*T,cy*T);return ids;});
const motion=await p.evaluate(ids=>new Promise(resolve=>{
const g=OUTankTest,prev=new Map(),samples=[];const started=performance.now();
function sample(){for(const id of ids){const u=g.getEntityById(id),a=prev.get(id),distance=a?Math.hypot(u.x-a.x,u.y-a.y):0;
samples.push({id,phase:u.travelPhase,flow:!!u.flowGoal,distance,body:u.bodyYaw,turret:u.turretYaw,
error:Math.hypot(u.vx||0,u.vy||0)>2?Math.abs(OUTankMotion.wrap(Math.atan2(u.vy,u.vx)-u.bodyYaw)):0});
prev.set(id,{x:u.x,y:u.y});}
if(performance.now()-started<4500)requestAnimationFrame(sample);else resolve(samples);}
requestAnimationFrame(sample);
}),ids);
assert(motion.some(s=>s.flow),'Group flow route was not exercised');
assert(motion.some(s=>s.phase==='turret')&&motion.some(s=>s.phase==='hull')&&motion.some(s=>s.phase==='drive'),'Missing staged turn');
assert(motion.some(s=>s.distance>1),'Group never moved');
assert(motion.every(s=>s.error<.081),'Velocity does not match hull yaw');
assert(motion.filter(s=>s.phase==='turret'||s.phase==='hull').every(s=>s.distance<.01),'Tank slid while turning');
const ground=[];
for(const corner of [[.05,.05],[.95,.05],[.05,.95],[.95,.95]]){
 const target=await p.evaluate(({ids,corner})=>{const g=OUTankTest,u=g.getEntityById(ids[0]),T=g.TILE;
 for(const id of ids){if(id===u.id)continue;const v=g.getEntityById(id);v.order={type:'idle',x:v.x,y:v.y};v.path=null;v.flowGoal=null;v.target=null;}
 const tx=Math.floor(u.x/T)+2,ty=Math.floor(u.y/T),i=ty*g.MAP_W+tx;
 if(g.buildOcc[i])throw Error('Ground fixture intersects building');
 g.terrain[i]=0;g.treeHp[i]=1;g.ore[i]=1;u.shootCd=0;g.state.selection.clear();g.state.selection.add(u.id);
 g.commands.issueForceFirePos((tx+corner[0])*T,(ty+corner[1])*T);
 return{id:u.id,i,x:(tx+.5)*T,y:(ty+.5)*T,order:{...u.order},oreBefore:g.ore[i],treeBefore:g.treeHp[i]};
 },{ids,corner});
 assert.equal(target.order.x,target.x);assert.equal(target.order.y,target.y);
 assert.equal(target.oreBefore,1);assert.equal(target.treeBefore,1);
 await p.waitForFunction(({i})=>OUTankTest.treeHp[i]===0&&OUTankTest.ore[i]===0,target,{timeout:12000});
 const after=await p.evaluate(({id})=>({...OUTankTest.getEntityById(id).order}),target);
 assert.equal(after.x,target.x,'Navigation overwrote shot target');assert.equal(after.y,target.y);ground.push({corner,target,after});
}
assert.equal(errors.length,0,errors.join('\n'));
await p.screenshot({path:path.join(process.argv[2],'navigation-gameplay.png')});
const out={pass:true,camera,motion:{samples:motion.length,maxYawError:Math.max(...motion.map(s=>s.error)),phases:[...new Set(motion.map(s=>s.phase))]},ground,errors};
fs.writeFileSync(path.join(process.argv[2],'navigation-evidence.json'),JSON.stringify(out,null,2));console.log(JSON.stringify(out));
}finally{await b.close();}})().catch(e=>{console.error(e);process.exitCode=1});