const engine=process.env.OUTRAGE_BROWSER||'chromium',bt=require(process.env.OUTRAGE_PLAYWRIGHT)[engine],fs=require('fs'),assert=require('node:assert/strict');
(async()=>{const b=await bt.launch({headless:true,...(engine==='chromium'?{executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'}:{})});try{
 const p=await b.newPage({viewport:{width:1440,height:900}}),errors=[];p.on('pageerror',e=>errors.push(e.stack));
 await p.goto(process.env.OUTRAGE_URL||'http://127.0.0.1:8765/index.html?debug=1');
 await p.waitForFunction(()=>window.OUTankTest,null,{timeout:60000});console.log('LOADED',errors);
 await p.locator('#fogOff').check();await p.locator('#mcvRedeploy').check();await p.locator('#startBtn').click();await p.waitForFunction(()=>OUTankTest.running);
 await p.waitForFunction(()=>OUTank3D.mcvReady||OUTank3D.assetError,null,{timeout:120000});assert(await p.evaluate(()=>OUTank3D.mcvReady),await p.evaluate(()=>OUTank3D.assetError));
 console.log('ASSETS_READY');assert(await p.evaluate(()=>OUTankTest.state.mcvRedeploy));
 // The ordinary match now starts with two MCVs; keep the AI's deployed HQ alive in this isolated fixture.
 await p.waitForFunction(()=>OUTankTest.buildings.some(b=>b.alive&&b.team===1&&b.kind==='hq'&&!b._mcvPhase),null,{timeout:15000});
 await p.evaluate(()=>{window.g=OUTankTest;window.originalAITick=g.ai.tick;g.ai.tick=()=>{};g.state.enemy.money=0;g.state.player.money=100000;for(const u of g.units)u.alive=false;
  for(let y=7;y<37;y++)for(let x=7;x<37;x++){const i=y*g.MAP_W+x;g.terrain[i]=g.treeHp[i]=g.ore[i]=0;}
  for(const b of g.buildings)if(b.tx<36&&b.ty<36&&b.tx>6&&b.ty>6){b.alive=false;g.footprint.setBuildingOcc(b,0);}
  g.cam.zoom=1.4;window.u=g.addUnit(0,'mcv',20.5*g.TILE,20.5*g.TILE);g.centerCameraOn(u.x,u.y);g.state.selection=new Set([u.id]);u.hp=2345;
 });
 await p.evaluate(()=>{u.alive=false;g.state.selection.clear();window.yard=g.addBuilding(0,'hq',18,18);g.mcv.tick=()=>{};g.cam.zoom=.85;g.state.colors.player='#347ee8';g.centerCameraOn(yard.x,yard.y);});
 await p.keyboard.press('Escape');await p.evaluate(()=>{for(const el of document.querySelectorAll('[id*=pause],[id*=Pause]'))el.style.visibility='hidden';});

 const clip=await p.evaluate(()=>{const q=g.worldToScreen(yard.x,yard.y);return {x:Math.round(q.x-340),y:Math.round(q.y-430),width:680,height:650};});
 for(let i=process.env.OUTRAGE_ART_QUICK?48:0;i<=48;i++){
  await p.evaluate(v=>{yard._mcvPhase='deploy';yard._mcvT0=g.state.t-v*OUMCV.seconds;},i/48);
  await p.waitForTimeout(60);await p.screenshot({path:process.argv[2]+'-'+String(i).padStart(2,'0')+'.png',clip});
 }
 const sample=()=>p.evaluate(()=>{const c=document.createElement('canvas');c.width=c.height=900;const ctx=c.getContext('2d');OUTank3D.draw(ctx,yard,{x:450,y:550},g.cam.zoom,g.state.colors.player,g.state.t);return Array.from(ctx.getImageData(0,0,900,900).data);});
 const endpoint=await sample();
 await p.evaluate(()=>{yard._mcvPhase=null;OUHQAssembly.clear();});await p.waitForTimeout(180);
 await p.screenshot({path:process.argv[2]+'-settled.png',clip});
 const still=await sample();console.log('CACHE',await p.evaluate(()=>({cache:OUHQAssembly.stats(),pages:OUTank3D.pages,t:g.state.t,phase:yard._mcvPhase})));let pixels=0;for(let i=0;i<still.length;i++)if(still[i]!==endpoint[i])pixels++;
 assert.equal(pixels,0,'Endpoint changed when the cache replaced the animated model');
 const before=await p.evaluate(()=>OUHQAssembly.stats());await p.waitForTimeout(500);const after=await p.evaluate(()=>OUHQAssembly.stats());
 assert.equal(after.builds,before.builds,'Settled yard was rerendered');assert(after.hits>before.hits);
 await p.evaluate(()=>{window.hqReadOnly=JSON.stringify(yard);});await p.waitForTimeout(100);assert(await p.evaluate(()=>hqReadOnly===JSON.stringify(yard)));
 // Review the mobile endpoint in all eight gameplay headings, including the
 // front entry hood and rear folded hook that the old single view concealed.
 await p.evaluate(()=>{yard.alive=false;g.footprint.setBuildingOcc(yard,0);window.mobile=g.addUnit(0,'mcv',yard.x,yard.y);g.cam.zoom=1.35;g.centerCameraOn(mobile.x,mobile.y);g.state.selection.clear();});
 for(let h=0;h<8;h++){
  await p.evaluate(v=>{mobile.bodyYaw=v*Math.PI/4;},h);await p.waitForTimeout(70);
  await p.screenshot({path:process.argv[2]+'-mobile-'+h+'.png',clip});
 }
 await p.evaluate(()=>{mobile.alive=false;});
 // Six identical settled yards share one image, even at different world positions.
 await p.evaluate(()=>{for(const b of g.buildings){b.alive=false;g.footprint.setBuildingOcc(b,0);}for(const [x,y] of [[14,14],[20,14],[26,14],[14,20],[20,20],[26,20]])g.addBuilding(0,'hq',x,y);g.cam.zoom=.45;g.centerCameraOn(22*g.TILE,19*g.TILE);OUHQAssembly.clear();});
 await p.waitForTimeout(250);const six=await p.evaluate(()=>({cache:OUHQAssembly.stats(),pages:OUTank3D.pages,draws:OUTank3D.draws}));
 assert.equal(six.cache.entries,1);assert.equal(six.pages,0,'Settled-only scene submitted WebGL pages');assert(six.draws>=6&&six.draws<=7);
 await p.screenshot({path:process.argv[2]+'-six-yards.png'});
 assert.equal(errors.length,0,errors.join('\n'));
 fs.writeFileSync(process.argv[2]+'-art.json',JSON.stringify({endpointPixelDifferences:pixels,cacheBefore:before,cacheAfter:after,six,errors},null,2));console.log('MECHANICAL_ART_PASS',JSON.stringify(six));
 }finally{await b.close();}})().catch(e=>{console.error(e);process.exitCode=1});
