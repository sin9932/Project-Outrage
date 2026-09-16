const engine=process.env.OUTRAGE_BROWSER||'firefox';const chromium=require(process.env.OUTRAGE_PLAYWRIGHT)[engine],assert=require('node:assert/strict'),fs=require('fs');
(async()=>{const b=await chromium.launch({headless:true});try{
const p=await b.newPage({viewport:{width:1440,height:900}}),errors=[];p.on('pageerror',e=>errors.push(String(e)));
await p.goto('http://127.0.0.1:8765/index.html?debug=1');await p.waitForFunction(()=>window.OUTankTest&&window.OUTank3D?.status==='ready');
await p.locator('#fogOff').check();await p.locator('#startBtn').click();await p.waitForFunction(()=>OUTankTest.running);
await p.evaluate(()=>{const g=OUTankTest;g.ai.tick=()=>{};const T=g.TILE,x=Math.floor(g.MAP_W/2),y=Math.floor(g.MAP_H/2);
window.victims=[];for(let i=0;i<3;i++)victims.push(g.addBuilding(g.TEAM.ENEMY,'power',x+i*4,y));
g.centerCameraOn((x+5)*T,(y+2)*T);g.cam.zoom=1;
window.samples=[];const fn=OURender.draw;OURender.draw=function(...a){const t=performance.now(),r=fn.apply(this,a);samples.push(performance.now()-t);return r;};
});
await p.waitForTimeout(2500);const before=await p.evaluate(()=>{const a=samples;samples=[];for(const v of victims)OUTankTest.destroyBuilding(v);return a;});
await p.waitForTimeout(6000);const after=await p.evaluate(()=>samples);const smoke=await p.evaluate(()=>({count:FX.smokePuffs.length,dead:victims.every(v=>!v.alive)}));assert(smoke.dead);assert(smoke.count>0,'Smoke must remain visible');await p.setViewportSize({width:1537,height:947});await p.waitForTimeout(150);const layers=await p.evaluate(()=>{const original=CanvasRenderingContext2D.prototype.drawImage;window.layers=[];CanvasRenderingContext2D.prototype.drawImage=function(im,...a){if(this.canvas.id==='c'&&im instanceof HTMLCanvasElement&&im.width===Math.ceil(this.canvas.width*.25))layers.push({w:im.width,h:im.height,W:this.canvas.width,H:this.canvas.height});return original.call(this,im,...a)};});await p.waitForTimeout(150);assert((await p.evaluate(()=>layers)).some(l=>l.h===Math.ceil(l.H*.25)),'Smoke layer must resize');assert.equal(errors.length,0,errors.join('\n'));await p.screenshot({path:process.argv[2]+'.png'});const stat=a=>{a.sort((a,b)=>a-b);return{n:a.length,mean:a.reduce((s,v)=>s+v,0)/a.length,p95:a[Math.floor(a.length*.95)],max:a.at(-1)}};
const result={before:stat(before),after:stat(after),errors};fs.writeFileSync(process.argv[2],JSON.stringify(result,null,2));console.log(result);
}finally{await b.close();}})().catch(e=>{console.error(e);process.exitCode=1});