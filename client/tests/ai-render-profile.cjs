const {chromium}=require(process.env.OUTRAGE_PLAYWRIGHT),fs=require('fs');
(async()=>{const b=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});const out=[];
try{for(const ai of [true,false])for(const render of [true,false]){
 const p=await b.newPage({viewport:{width:1440,height:900}});const errors=[];p.on('pageerror',e=>errors.push(e.stack));
 await p.goto('http://127.0.0.1:8765/index.html?debug=1&tankdemo=1');await p.waitForFunction(()=>window.OUTankTest&&window.OUTank3D?.status==='ready');
 await p.locator('#fogOff').check();await p.locator('#startBtn').click();await p.waitForFunction(()=>OUTankTest.running);
 await p.evaluate(({ai,render})=>{const g=OUTankTest,T=g.TILE;const x=Math.floor(g.MAP_W/2),y=Math.floor(g.MAP_H/2);
 for(let ty=y-12;ty<y+12;ty++)for(let tx=x-12;tx<x+12;tx++){const i=ty*g.MAP_W+tx;g.terrain[i]=0;g.treeHp[i]=0;}
 for(let j=0;j<120;j++){const u=g.addUnit(g.TEAM.ENEMY,'tank',(x-6+j%12+.5)*T,(y-5+Math.floor(j/12)+.5)*T,{skipMvp:true});u.hp=100000;}
 g.centerCameraOn(x*T,y*T);g.cam.zoom=.6;
 window.perf={ai:[],sim:[],render:[],frame:[]};
 for(const [o,k,n]of[[g.ai,'tick','ai'],[g.sim,'tickSim','sim'],[OURender,'draw','render']]){const fn=o[k];o[k]=function(...a){const t=performance.now();const r=fn.apply(this,a);perf[n].push(performance.now()-t);return r;};}
 if(!ai)g.ai.tick=()=>{};if(!render){OUTank3D.draw=()=>true;OUTank3D.beginFrame=()=>{};}
 let prev=performance.now();function f(t){perf.frame.push(t-prev);prev=t;requestAnimationFrame(f)}requestAnimationFrame(f);
 },{ai,render});
 await p.waitForTimeout(8000);
 const data=await p.evaluate(()=>Object.fromEntries(Object.entries(perf).map(([k,a])=>{a.sort((x,y)=>x-y);return[k,{n:a.length,mean:a.reduce((x,y)=>x+y,0)/a.length,p95:a[Math.floor(a.length*.95)],max:a.at(-1)}]})));
 out.push({ai,render,data,errors});await p.close();
}fs.writeFileSync(process.argv[2],JSON.stringify(out,null,2));console.log(JSON.stringify(out));}finally{await b.close();}})().catch(e=>{console.error(e);process.exitCode=1});