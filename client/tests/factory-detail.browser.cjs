// Inspect normal gameplay scale and render cost with several detailed factories.
const {chromium}=require(process.env.OUTRAGE_PLAYWRIGHT),fs=require('fs'),assert=require('node:assert/strict');
(async()=>{const b=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});try{
 const p=await b.newPage({viewport:{width:1440,height:900}}),errors=[];p.on('pageerror',e=>errors.push(e.stack));
 await p.goto('http://127.0.0.1:8765/index.html?debug=1');await p.waitForFunction(()=>OUTank3D.factoryReady,null,{timeout:90000});
 await p.locator('#fogOff').check();await p.locator('#startBtn').click();await p.waitForFunction(()=>OUTankTest.running);
 await p.evaluate(()=>{const g=OUTankTest;g.ai.tick=()=>{};for(const u of g.units)u.alive=false;
 for(const b of g.buildings)b.alive=false;
 for(let y=3;y<30;y++)for(let x=3;x<30;x++){const i=y*g.MAP_W+x;g.terrain[i]=0;g.treeHp[i]=0;g.ore[i]=0;}
 window.detailFactories=[g.addBuilding(0,'factory',13,12)];detailFactories[0]._placedAt=g.state.t-10;
 g.cam.zoom=1;g.centerCameraOn(detailFactories[0].x,detailFactories[0].y);
 });
 await p.waitForTimeout(1200);
 await p.screenshot({path:process.argv[2]+'/factory-gameplay.png'});
 async function sample(){return await p.evaluate(()=>new Promise(resolve=>{const a=[];let last=performance.now();function frame(t){a.push(t-last);last=t;if(a.length<121){requestAnimationFrame(frame);return;}a.shift();a.sort((x,y)=>x-y);resolve({medianMs:a[60],p95Ms:a[114],pages:OUTank3D.pages,drawCalls:OUTank3D.gpuDrawCalls,drawn:OUTank3D.draws});}requestAnimationFrame(frame);}));}
 const one=await sample();
 await p.evaluate(()=>{const g=OUTankTest;for(const [x,y] of [[6,5],[13,5],[20,5],[6,12],[20,12]]){const b=g.addBuilding(0,'factory',x,y);b._placedAt=g.state.t-10;detailFactories.push(b);}g.cam.zoom=.65;g.centerCameraOn(14*g.TILE,10*g.TILE);});
 await p.waitForTimeout(1000);const six=await sample();
 await p.screenshot({path:process.argv[2]+'/factory-six.png'});assert.equal(errors.length,0,errors.join('\n'));
 fs.writeFileSync(process.argv[2]+'/factory-detail-evidence.json',JSON.stringify({one,six,errors},null,2));console.log({one,six,errors});
}finally{await b.close();}})().catch(e=>{console.error(e);process.exitCode=1});
