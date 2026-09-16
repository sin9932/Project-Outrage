const engine=process.env.OUTRAGE_BROWSER||'chromium';const chromium=require(process.env.OUTRAGE_PLAYWRIGHT)[engine],fs=require('fs'),assert=require('node:assert/strict');
(async()=>{const b=await chromium.launch({headless:true,...(engine==='chromium'?{executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'}:{})});
try{const p=await b.newPage({viewport:{width:1440,height:900}}),errors=[];p.on('pageerror',e=>errors.push(e.stack));
await p.goto('http://127.0.0.1:8765/index.html?debug=1&tankdemo=1');await p.waitForFunction(()=>window.OUTankTest&&window.OUTank3D?.status==='ready');
await p.locator('#fogOff').check();await p.locator('#startBtn').click();await p.waitForFunction(()=>OUTankTest.running);
await p.evaluate(()=>{const g=OUTankTest;g.ai.tick=()=>{};g.units.forEach(u=>u.alive=false);g.cam.zoom=.5;g.centerCameraOn(0,0);
window.oreDraws=[];const draw=CanvasRenderingContext2D.prototype.drawImage;
CanvasRenderingContext2D.prototype.drawImage=function(img,...args){if(img.src?.endsWith('/ore.png'))oreDraws.push([args[0],args[1]]);return draw.call(this,img,...args)};});
const stages=[];
for(const amount of [240,192,144,96,48,0]){
await p.evaluate(a=>{const g=OUTankTest;for(let i=0;i<g.ore.length;i++)if(g.terrain[i]===2||g.ore[i]>0)g.ore[i]=a;oreDraws.length=0;},amount);
await p.waitForTimeout(120);
stages.push(await p.evaluate(a=>({amount:a,draws:[...new Set(oreDraws.map(v=>v.join(',')))],gids:[OUHarvester.oreGid(a,false),OUHarvester.oreGid(a,true)]}),amount));
}
for(let i=0;i<5;i++){const r=stages[i];for(const [x,y]of r.draws.map(s=>s.split(',').map(Number))){const id=y/90*2+x/130;assert([r.gids[0]-225,r.gids[1]-225].includes(id),JSON.stringify(r));}assert(r.draws.length,'No actual ore draws');}
assert.equal(stages[5].draws.length,0);
const black=await p.evaluate(()=>{const c=document.getElementById('c');return [...c.getContext('2d').getImageData(4,4,1,1).data]});assert.deepEqual(black,[0,0,0,255]);
const turn=await p.evaluate(()=>{const out=[];for(const fps of [30,60,120]){const u={bodyYaw:0,turretYaw:0};let t=0;while(t<2){t+=1/fps;if(OUTankMotion.drive(u,0,1,1/fps,()=>0))break;if(u.travelPhase==='turret'&&u.bodyYaw!==0)throw Error('Hull moved before turret');}out.push({fps,seconds:t,error:Math.abs(u.bodyYaw-Math.PI/2)});}return out;});assert(turn.every(r=>r.seconds<.4&&r.error<1e-9),JSON.stringify(turn));
assert.equal(errors.length,0);const evidence={stages,black,turn,errors};fs.writeFileSync(process.argv[2],JSON.stringify(evidence,null,2));await p.screenshot({path:process.argv[2]+'.png'});console.log(JSON.stringify(evidence));
}finally{await b.close();}})().catch(e=>{console.error(e);process.exitCode=1;});