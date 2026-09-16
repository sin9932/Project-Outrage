const {chromium}=require(process.env.OUTRAGE_PLAYWRIGHT);
const fs=require('fs'),assert=require('node:assert/strict');
const count=Number(process.env.OUTRAGE_STRESS_COUNT||48);
let browser;
(async()=>{
 browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
 const page=await browser.newPage({viewport:{width:1440,height:900}});
 const errors=[];page.on('pageerror',e=>errors.push(e.stack));
 const t0=Date.now();
 await page.goto('http://127.0.0.1:8765/index.html?debug=1&tankdemo=1',{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>window.OUTankTest&&window.OUTank3D?.status==='ready',null,{timeout:120000});
 await page.locator('#fogOff').check();
 const click=Date.now();await page.locator('#startBtn').click();
 await page.waitForFunction(()=>OUTankTest.running,null,{timeout:180000});
 const startup={totalMs:Date.now()-t0,clickMs:Date.now()-click};
 const setup=await page.evaluate(count=>{
 const g=OUTankTest,b=g.buildings.find(b=>b.alive&&b.team===g.TEAM.ENEMY);
 b.hp=b.hpMax=1000000;
 const T=g.TILE,tx=Math.floor(b.x/T),ty=Math.floor(b.y/T);
 for(let y=Math.max(0,ty-18);y<Math.min(g.MAP_H,ty+18);y++)for(let x=Math.max(0,tx-18);x<Math.min(g.MAP_W,tx+18);x++){let i=y*g.MAP_W+x;if(!g.buildOcc[i]){g.terrain[i]=0;g.treeHp[i]=0;}}
 g.state.selection.clear();const start=[];
 const cols=count>48?10:6,rows=Math.ceil(count/cols);
 for(let j=0;j<count;j++){let x=(Math.max(1,Math.min(g.MAP_W-cols-1,tx-10))+(j%cols)+.5)*T,y=(Math.max(1,Math.min(g.MAP_H-rows-1,ty-10))+Math.floor(j/cols)+.5)*T;
 const u=g.addUnit(g.TEAM.PLAYER,'tank',x,y,{skipMvp:true});g.state.selection.add(u.id);start.push({id:u.id,x,y});}
 g.centerCameraOn(b.x-180,b.y-180);g.cam.zoom=.6;
 window.benchStart=start;window.benchBuilding=b;
 window.frameTimes=[];let last=performance.now();function f(t){frameTimes.push(t-last);last=t;if(frameTimes.length<2000)requestAnimationFrame(f)}requestAnimationFrame(f);
 const t=performance.now();g.commands.issueAttack(b.id);return{commandMs:performance.now()-t,target:b.kind,count:start.length};
 },count);
 await page.waitForTimeout(12000);
 const result=await page.evaluate(()=>{
 const g=OUTankTest;const a=frameTimes.slice().sort((a,b)=>a-b);
 return{progress:benchStart.filter(s=>{const u=g.getEntityById(s.id);return u&&(Math.hypot(u.x-s.x,u.y-s.y)>30||(u.shotSerial||0)>0)}).length,pathStats:g.sim.pathStats,frames:a.length,p95:a[Math.floor(a.length*.95)],max:a.at(-1),hp:benchBuilding.hp,moved:benchStart.filter(s=>{const u=g.getEntityById(s.id);return u&&Math.hypot(u.x-s.x,u.y-s.y)>30}).length,shots:benchStart.reduce((n,s)=>n+(g.getEntityById(s.id)?.shotSerial||0),0)};
 });
 await browser.close();fs.writeFileSync(process.argv[2],JSON.stringify({startup,setup,result,errors},null,2));
 assert.equal(errors.length,0,errors.join('\n'));assert(result.shots>0&&result.hp<1000000,'Attack must deal damage');assert(result.progress>count*.2,'Units must approach or fire when already in range');assert(result.pathStats.maxPerTick<=8,'Path budget exceeded');
 const out={startup,setup,result,errors};console.log(JSON.stringify(out));fs.writeFileSync(process.argv[2],JSON.stringify(out,null,2));await browser.close();
})().catch(async e=>{console.error(e);process.exitCode=1;await browser?.close();});