const {chromium}=require(process.env.OUTRAGE_PLAYWRIGHT),fs=require('fs');
(async()=>{const b=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});try{
const p=await b.newPage({viewport:{width:1440,height:900}}),errors=[];p.on('pageerror',e=>errors.push(String(e)));
await p.goto('http://127.0.0.1:8765/index.html?debug=1');await p.waitForFunction(()=>window.OUTankTest&&window.OUTank3D?.status==='ready');
await p.locator('#fogOff').check();await p.locator('#startBtn').click();await p.waitForFunction(()=>OUTankTest.running);
await p.evaluate(()=>{const g=OUTankTest;g.ai.tick=()=>{};const T=g.TILE,x=Math.floor(g.MAP_W/2),y=Math.floor(g.MAP_H/2);
window.victims=[];for(let i=0;i<3;i++)victims.push(g.addBuilding(g.TEAM.ENEMY,'power',x+i*4,y));
g.centerCameraOn((x+5)*T,(y+2)*T);g.cam.zoom=1;
window.samples=[];const fn=OURender.draw;OURender.draw=function(...a){const t=performance.now(),r=fn.apply(this,a);samples.push(performance.now()-t);return r;};
});
const cdp=await p.context().newCDPSession(p);await cdp.send('Profiler.enable');await cdp.send('Profiler.start');await p.waitForTimeout(2500);const before=await p.evaluate(()=>{const a=samples;samples=[];for(const v of victims)OUTankTest.destroyBuilding(v);return a;});
await p.waitForTimeout(6000);const after=await p.evaluate(()=>samples);const {profile}=await cdp.send('Profiler.stop');const counts=new Map();for(const id of profile.samples||[])counts.set(id,(counts.get(id)||0)+1);console.log(profile.nodes.map(n=>({name:n.callFrame.functionName,n:counts.get(n.id)||0})).sort((a,b)=>b.n-a.n).slice(0,25));
await p.screenshot({path:process.argv[2]+'.png'});const stat=a=>{a.sort((a,b)=>a-b);return{n:a.length,mean:a.reduce((s,v)=>s+v,0)/a.length,p95:a[Math.floor(a.length*.95)],max:a.at(-1)}};
const result={before:stat(before),after:stat(after),errors};fs.writeFileSync(process.argv[2],JSON.stringify(result,null,2));console.log(result);
}finally{await b.close();}})().catch(e=>{console.error(e);process.exitCode=1});