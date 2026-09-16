const {chromium}=require(process.env.OUTRAGE_PLAYWRIGHT),fs=require('fs'),assert=require('node:assert/strict');
(async()=>{const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});try{
 const p=await browser.newPage({viewport:{width:1600,height:1000}}),errors=[];
 p.on('pageerror',e=>errors.push(e.stack));
 await p.goto(process.env.OUTRAGE_URL||'http://127.0.0.1:8772/index.html?debug=1');
 await p.waitForFunction(()=>window.OUTankTest&&window.OUTank3D&&(OUTank3D.mcvReady||OUTank3D.assetError),null,{timeout:120000});
 assert(await p.evaluate(()=>OUTank3D.mcvReady),await p.evaluate(()=>OUTank3D.assetError));
 await p.locator('#fogOff').check();await p.locator('#startBtn').click();
 await p.waitForFunction(()=>OUTankTest.buildings.some(b=>b.alive&&b.team===1&&b.kind==='hq'&&!b._mcvPhase));
 await p.evaluate(()=>{window.g=OUTankTest;g.ai.tick=()=>{};for(const u of g.units)u.alive=false;
  for(let y=8;y<44;y++)for(let x=8;x<44;x++){const i=y*g.MAP_W+x;g.terrain[i]=g.treeHp[i]=g.ore[i]=0;}
  window.yard=g.addBuilding(0,'hq',18,18);window.fac=g.addBuilding(0,'factory',25,18);fac._placedAt=-100;
  g.state.selection=new Set([yard.id,fac.id]);g.state.colors.player='#e83737';g.cam.zoom=.92;g.centerCameraOn(23.8*g.TILE,20.7*g.TILE);
 });
 await p.keyboard.press('Escape');await p.evaluate(()=>{for(const el of document.querySelectorAll('[id*=pause],[id*=Pause]'))el.style.visibility='hidden';});
 const prefix=process.argv[2];await p.waitForTimeout(120);await p.screenshot({path:prefix+'-together.png'});
 await p.evaluate(()=>g.state.selection.clear());await p.waitForTimeout(80);await p.screenshot({path:prefix+'-unselected.png'});
 const geometry=await p.evaluate(async()=>{
  const T=await import('/vendor/three/three.module.js'),{GLTFLoader}=await import('/vendor/three/addons/loaders/GLTFLoader.js');
  const mg=await new GLTFLoader().loadAsync('/asset/model/mcv/mcv.glb');
  const mx=new T.AnimationMixer(mg.scene),ac=mx.clipAction(mg.animations.find(a=>a.name==='Deploy'));ac.setLoop(T.LoopOnce,1);ac.clampWhenFinished=true;ac.play();mx.setTime(3);
  mg.scene.getObjectByName('Hull').scale.setScalar(OUMCV.modelScale);mg.scene.updateMatrixWorld(true);
  const ground=new T.Box3();mg.scene.traverse(o=>{if(!o.isMesh&&/^(Deck_|CenterApron_)/.test(o.name))ground.expandByObject(o);});
  const v=ground.getSize(new T.Vector3());
  mx.setTime(0);mg.scene.updateMatrixWorld(true);const mobile=new T.Box3().setFromObject(mg.scene).getSize(new T.Vector3());
  const fg=await new GLTFLoader().loadAsync('/asset/model/factory/factory.glb');const fm=new T.AnimationMixer(fg.scene),fa=fm.clipAction(fg.animations.find(a=>a.name==='Build'));fa.setLoop(T.LoopOnce,1);fa.clampWhenFinished=true;fa.play();fm.setTime(2);fg.scene.updateMatrixWorld(true);
  const pad=new T.Box3().setFromObject(fg.scene.getObjectByName('Hull_Geometry')).getSize(new T.Vector3());
  return {yardFill:[v.x*20/(yard.tw*g.TILE),v.z*20/(yard.th*g.TILE)],factoryFill:[pad.x*20/(fac.tw*g.TILE),pad.z*20/(fac.th*g.TILE)],factoryTiles:[fac.tw,fac.th],mobileMetres:mobile.toArray(),modelScale:OUMCV.modelScale};
 });
 assert(geometry.yardFill.every(v=>v>.985&&v<1.025),JSON.stringify(geometry));
 assert(geometry.factoryFill.every(v=>v>.98&&v<1.025));assert.deepEqual(geometry.factoryTiles,[4,3]);
 // Large MCV and hatch are reviewed in the same real renderer as gameplay.
 await p.evaluate(()=>{g.state.selection=new Set([fac.id]);g.cam.zoom=1.30;g.centerCameraOn(fac.x,fac.y);});
 for(const v of [0,.35,.65,1]){
  await p.evaluate(v=>{fac._factoryDispatch={kind:'mcv',started:g.state.t-OUFactory.doorSeconds-OUFactory.driveSeconds*v};},v);
  await p.waitForTimeout(100);await p.screenshot({path:prefix+'-mcv-exit-'+String(v).replace('.','')+'.png'});
 }
 await p.evaluate(()=>{fac._factoryDispatch=null;fac._factoryDoorClosedAt=-100;fac._factoryAirAt=g.state.t-.65;});
 await p.waitForTimeout(100);await p.screenshot({path:prefix+'-hatch.png'});
 assert.equal(errors.length,0,errors.join('\n'));fs.writeFileSync(prefix+'.json',JSON.stringify({geometry,errors},null,2));console.log('ARCHITECTURE_PASS',geometry);
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1});
