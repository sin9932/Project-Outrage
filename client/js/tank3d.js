import * as THREE from 'three';
import { GLTFLoader } from '../vendor/three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from '../vendor/three/addons/utils/BufferGeometryUtils.js';

// Hybrid isometric renderer: rasterize actual geometry at its current arbitrary
// pose every frame, then composite at the existing world depth-sort position.
// Units and unfolding yards use rigid poses; settled yards cache the exact endpoint.
const api = window.OUTank3D = { status: 'loading', draws: 0, error: null };
const enabled = new URLSearchParams(location.search).get('tank3d') !== '0';
let config = window.OUTankConfig;
const span = config.renderSpan;
let renderer, scene, camera, model, hull, turret, barrel, barrelRest;
let wheels = [], materials = [], currentColor = null, extraParts=[];
const assets=new Map();
const poseByUnit = new Map();
const frameSlots = new Map();
const framePages = [];
let detailMeshes=[], crowdMeshes=[];
const ray = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const v = new THREE.Vector3();

function pose(u, time) {
  if(u.kind==='mcv'||u.kind==='hq'){
    const a=assets.get(u.kind),M=window.OUMCV;
    const work=u.kind==='hq'?window.OUHQWork.progress(u,time):null;
    a.buildAction.enabled=work==null;a.workAction.enabled=work!=null;
    a.buildAction.time=M.progress(u,time)*a.buildClip.duration;
    if(work!=null)a.workAction.time=work*a.workClip.duration;
    a.buildMixer.update(0);
    model.rotation.set(0,u.kind==='mcv'?Math.PI/2-window.OUTankMotion.readPose(u).bodyYaw:0,0);
    model.position.y=u._mcvSelling?-Math.max(0,time-u._mcvSellT0-M.seconds)*20:0;
    if(u.kind==='mcv')animateWheels(u,time,window.OUTankMotion.readPose(u).bodyYaw);
    model.updateMatrixWorld(true);return;
  }
  if(u.kind==='repair'){
    model.position.y=-3*(1-Math.max(0,Math.min(1,(time-u._placedAt)/window.OUTech.assemblySeconds('repair'))));model.updateMatrixWorld(true);return;
  }
  if(u.kind==='factory'){
    const F=window.OUFactory,a=assets.get('factory');
    a.buildAction.time=F.progress(u,time)*a.buildClip.duration;a.buildMixer.update(0);
    model.rotation.set(0,Math.PI/2-F.heading,0);hull.scale.setScalar(1);
    const roof=F.roof(u,time)*1.22;
    model.getObjectByName('RoofL').rotation.z=roof;model.getObjectByName('RoofR').rotation.z=-roof;
    model.getObjectByName('Door').scale.y=1-.98*F.door(u,time);
    if(u._factoryDeath!=null){const d=Math.max(0,(time-u._factoryDeath)/F.deathSeconds);hull.scale.y=Math.max(.02,1-d);}
    model.updateMatrixWorld(true);return;
  }
  if(u.kind==='turret'){
    const C=window.OUSentry,death=u._sentryDeath!=null?Math.max(0,(time-u._sentryDeath)/C.deathSeconds):0;
    const asset=assets.get('turret'),progress=C.progress(u,time);
    asset.buildAction.time=progress*asset.buildClip.duration;
    asset.buildMixer.update(0);
    model.rotation.set(0,Math.PI/2,0);hull.scale.setScalar(1);
    turret.scale.setScalar(1);turret.rotation.set(death*1.1,-(u.turretYaw||0),death*.6);
    turret.position.y=.66-death*.6;
    const age=time-(u.lastShotAt??-999);
    barrel.rotation.z=age>=0&&age<.4?age*35:0;
    if(death){hull.scale.multiplyScalar(Math.max(.01,1-death*.25));turret.scale.multiplyScalar(Math.max(.01,1-death));}
    model.updateMatrixWorld(true);return;
  }

  const m = window.OUTankMotion;
  const {bodyYaw,turretYaw} = m.readPose(u);
  model.rotation.y = Math.PI / 2 - bodyYaw;
  if(turret){turret.rotation.y=bodyYaw-turretYaw;barrel.position.copy(barrelRest);barrel.position.z-=m.recoil(u,time);}
  if(u.kind==='harvester'){
    const d=u.harvesterDock,gate=model.getObjectByName('Tailgate'),cargo=model.getObjectByName('Cargo');
    gate.rotation.x=d?.phase==='unload'?-1.8*Math.min(1,(time-d.started)/.4):d?.phase==='close'?-1.8*Math.max(0,1-(time-d.started)/.4):0;
    cargo.visible=u.carry>0;cargo.scale.y=Math.max(.05,Math.min(1,u.carry/Math.max(1,u.carryMax)));
    model.getObjectByName('Rotor').rotation.x=(u.harvestUntil||0)>time?time*9:0;
  }
  animateWheels(u,time,bodyYaw);
  model.updateMatrixWorld(true);
}

function animateWheels(u,time,bodyYaw){
  let rec = poseByUnit.get(u.id);
  if (!rec || rec.unit !== u) rec = { unit:u, x:u.x, y:u.y, wheel:0, seen:time };
  const dx = u.x - rec.x, dy = u.y - rec.y;
  const forward = dx * Math.cos(bodyYaw) + dy * Math.sin(bodyYaw);
  if (Math.hypot(dx,dy) < 200) rec.wheel += forward / (window.OUTankMotion.SCALE * config.wheelRadius * (config.modelScale||1));
  if(u._factoryDistance!=null)rec.wheel=u._factoryDistance/(window.OUTankMotion.SCALE*config.wheelRadius*(config.modelScale||1));
  rec.x = u.x; rec.y = u.y; rec.seen = time;
  poseByUnit.set(u.id,rec);
  for (const w of wheels) w.rotation.x = rec.wheel;
}

function teamColor(color) {
  if (color === currentColor) return;
  currentColor = color;
  const tint = new THREE.Color(color);
  for (const mat of materials) {
    mat.color.copy(tint);
    if (mat.name.includes('recessed')) mat.color.multiplyScalar(.45);
    if (mat.emissive) mat.emissive.copy(tint).multiplyScalar(.05);
  }
}

// Merge rigid decorations by material inside each articulated part. Moving
// pivots and wheel nodes remain intact; geometry is baked into its own parent.
function mergeCompatible(geometries){
  // Procedural GLBs have optional UV/tangent attributes; retain the common contract.
  const names=new Set(geometries.flatMap(g=>Object.keys(g.attributes)));
  for(const name of names)if(!geometries.every(g=>g.hasAttribute(name)))for(const g of geometries)g.deleteAttribute(name);
  return mergeGeometries(geometries,false);
}
function mergeRigidParts() {
  model.updateMatrixWorld(true);
  const parts=new Set([hull,turret,barrel,...wheels,...extraParts].filter(Boolean));
  for(const root of parts){
    const groups=new Map(),inverse=root.matrixWorld.clone().invert();
    function visit(o){
      if(o!==root&&parts.has(o))return;
      if(o!==root&&o.isMesh&&!Array.isArray(o.material)){
        const list=groups.get(o.material)||[];list.push(o);groups.set(o.material,list);
      }
      for(const c of o.children)visit(c);
    }
    visit(root);
    for(const [material,meshes] of groups){
      if(meshes.length<2)continue;
      const geometries=meshes.map(m=>m.geometry.clone().applyMatrix4(inverse.clone().multiply(m.matrixWorld)));
      const merged=mergeCompatible(geometries);
      for(const g of geometries)g.dispose();
      if(!merged)continue;
      const mesh=new THREE.Mesh(merged,material);mesh.name=root.name+'_batch_'+material.name;
      root.add(mesh);
      for(const old of meshes)old.removeFromParent();
    }
  }
}

// At army scale, combine static metal/rubber materials into vertex colors.
// Keep articulated pivots and separate live team-color materials. This reduces
// draw calls without replacing geometry with sprites or changing hit geometry.
function buildCrowdDetail() {
  const parts=new Set([hull,turret,barrel,...wheels,...extraParts].filter(Boolean));
  const plain=new THREE.MeshStandardMaterial({vertexColors:true,metalness:.35,roughness:.7});
  for(const root of parts){
    const groups=new Map(), inverse=root.matrixWorld.clone().invert();
    function visit(o){
      if(o!==root&&parts.has(o))return;
      if(o!==root&&o.isMesh&&!Array.isArray(o.material)){
        // Keep mapped albedo when batching weathered factory parts.
        const key=(o.material.map||o.material.aoMap||/TeamColor|Lamp/.test(o.material.name))?o.material:plain;
        const list=groups.get(key)||[];list.push(o);groups.set(key,list);
      }
      for(const c of o.children)visit(c);
    }
    visit(root);
    for(const [material,meshes] of groups){
      if(meshes.length<2)continue;
      const geometries=meshes.map(m=>{
        const g=m.geometry.clone().applyMatrix4(inverse.clone().multiply(m.matrixWorld));
        if(material===plain){
          const values=new Float32Array(g.attributes.position.count*3),c=m.material.color;
          for(let i=0;i<values.length;i+=3){values[i]=c.r;values[i+1]=c.g;values[i+2]=c.b;}
          g.setAttribute('color',new THREE.BufferAttribute(values,3));
        }
        return g;
      });
      const geometry=mergeCompatible(geometries);
      for(const g of geometries)g.dispose();
      if(!geometry)continue;
      const m=new THREE.Mesh(geometry,material);m.visible=false;root.add(m);
      crowdMeshes.push(m);detailMeshes.push(...meshes);
    }
  }
}

function remember(kind){assets.set(kind,{config,model,hull,turret,barrel,barrelRest,wheels,materials,detailMeshes,crowdMeshes,extraParts});}
function selectAsset(kind){
 const a=assets.get(kind);if(!a)return false;
 if(model===a.model)return true;
 ({config,model,hull,turret,barrel,barrelRest,wheels,materials,detailMeshes,crowdMeshes,extraParts}=a);
 for(const [k,v] of assets)v.model.visible=k===kind;
 currentColor=null;return true;
}

export const ready = (async () => {
  if (!enabled) { api.status='disabled'; return false; }
  try {
    renderer = new THREE.WebGLRenderer({alpha:true, antialias:true, powerPreference:'high-performance'});
    renderer.setPixelRatio(1);
    renderer.setClearColor(0,0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    renderer.domElement.addEventListener('webglcontextlost', event => {
      event.preventDefault(); api.status='lost'; window.OUHQAssembly?.clear();
    });
    renderer.domElement.addEventListener('webglcontextrestored', () => { api.status='ready'; });
    scene = new THREE.Scene();
    camera = new THREE.OrthographicCamera(-span/2,span/2,span/2,-span/2,.1,100);
    camera.position.set(10,Math.sqrt(200/3),10); // 30 degrees, 2:1 ground projection
    camera.lookAt(0,0,0);
    scene.add(new THREE.HemisphereLight(0xe4eeff,0x69604c,2.6));
    const key = new THREE.DirectionalLight(0xffeed5,3.2);
    key.position.set(-4,8,3); scene.add(key);
    const fill = new THREE.DirectionalLight(0xd7e3ff,1.0);
    fill.position.set(5,3,-4); scene.add(fill);
    const gltf = await new GLTFLoader().loadAsync(new URL(config.modelUrl,import.meta.url).href);
    model = gltf.scene;
    hull = model.getObjectByName('Hull'); turret = model.getObjectByName('Turret'); barrel = model.getObjectByName('Barrel');
    if (!hull || !turret || !barrel || !model.getObjectByName('Muzzle')) throw Error('Tank hierarchy is incomplete');
    model.updateMatrixWorld(true);
    const tip=model.getObjectByName('Muzzle').getWorldPosition(new THREE.Vector3());
    const pivot=turret.getWorldPosition(new THREE.Vector3());
    const c=config;
    if (Math.abs(pivot.z-c.turretForward)>.001 || Math.abs(tip.z-pivot.z-c.muzzleForward)>.001 || Math.abs(tip.y-c.muzzleHeight)>.001)
      throw Error('GLB attachment points do not match tank_config.js');
    barrelRest = barrel.position.clone();
    model.traverse(o => {
      if (/^Wheel_[LR]_\d$/.test(o.name)) wheels.push(o);
      if (!o.isMesh) return;
      for (const mat of Array.isArray(o.material) ? o.material : [o.material]) {
        if (/TeamColor|Lamp/.test(mat.name) && !materials.includes(mat)) materials.push(mat);
      }
    });
    mergeRigidParts();
    model.updateMatrixWorld(true);
    buildCrowdDetail();
    scene.add(model);
    // Contact shadow on the ground plane, attached to the hull's orientation.
    const shadow = new THREE.Mesh(new THREE.CircleGeometry(1,32),new THREE.MeshBasicMaterial({color:0x000000,transparent:true,opacity:.2,depthWrite:false}));
    shadow.rotation.x=-Math.PI/2; shadow.scale.set(1.65,2.25,1); shadow.position.y=.012;
    hull.add(shadow);
    remember('tank');
    api.status='ready';
    api.asset = { animations:gltf.animations.map(a=>a.name), meshCount:0 };
    model.traverse(o=>{if(o.isMesh)api.asset.meshCount++;});
    const hg=await new GLTFLoader().loadAsync(new URL(window.OUHarvester.modelUrl,import.meta.url).href);
    config=window.OUHarvester;model=hg.scene;hull=model.getObjectByName('Hull');turret=null;barrel=null;barrelRest=null;
    wheels=[];materials=[];detailMeshes=[];crowdMeshes=[];
    extraParts=['Tailgate','Cargo','Rotor'].map(n=>model.getObjectByName(n));
    if(!hull||extraParts.some(p=>!p)||!model.getObjectByName('IntakeSocket')||!model.getObjectByName('DischargeSocket'))throw Error('Harvester hierarchy incomplete');
    model.updateMatrixWorld(true);
    for(const [node,key] of [['IntakeSocket','intake'],['DischargeSocket','discharge']]){
      const p=model.getObjectByName(node).getWorldPosition(new THREE.Vector3()),c=config[key];
      if(Math.abs(p.z-c.forward)>.001||Math.abs(p.y-c.height)>.001)throw Error('Harvester socket contract mismatch');
    }
    model.traverse(o=>{if(/^Wheel_[LR]_\d$/.test(o.name))wheels.push(o);if(o.isMesh)for(const mat of Array.isArray(o.material)?o.material:[o.material])if(/TeamColor|Lamp/.test(mat.name)&&!materials.includes(mat))materials.push(mat);});
    mergeRigidParts();model.updateMatrixWorld(true);buildCrowdDetail();scene.add(model);
    const hs=shadow.clone();hull.add(hs);remember('harvester');selectAsset('tank');
    api.harvesterReady=true;
    const sg=await new GLTFLoader().loadAsync(new URL(window.OUSentry.modelUrl,import.meta.url).href);
    config=window.OUSentry;model=sg.scene;hull=model.getObjectByName('Hull');turret=model.getObjectByName('Turret');barrel=model.getObjectByName('Barrel');
    if(!hull||!turret||!barrel||!model.getObjectByName('Muzzle'))throw Error('Sentry hierarchy incomplete');
    const buildClip=sg.animations.find(a=>a.name==='Build');
    if(!buildClip)throw Error('Sentry Build clip missing: '+sg.animations.map(a=>a.name).join(','));
    const buildMixer=new THREE.AnimationMixer(model),buildAction=buildMixer.clipAction(buildClip);
    buildAction.setLoop(THREE.LoopOnce,1);buildAction.clampWhenFinished=true;buildAction.play();buildAction.paused=true;
    buildAction.time=buildClip.duration;buildMixer.update(0);
    model.updateMatrixWorld(true);const sentryTip=model.getObjectByName('Muzzle').getWorldPosition(new THREE.Vector3());
    if(Math.abs(sentryTip.z-config.muzzleForward)>.001||Math.abs(sentryTip.y-config.muzzleHeight)>.001)throw Error('Sentry muzzle contract mismatch');
    barrelRest=barrel.position.clone();wheels=[];materials=[];detailMeshes=[];crowdMeshes=[];
    extraParts=['Pedestal','HeadAssembly','AmmoRack','GunHinge','GunSlide',...Array.from({length:5},(_,i)=>'Leg_'+i)].map(n=>model.getObjectByName(n));
    if(extraParts.some(n=>!n))throw Error('Sentry assembly nodes missing');
    mergeRigidParts();model.updateMatrixWorld(true);buildCrowdDetail();scene.add(model);remember('turret');Object.assign(assets.get('turret'),{buildClip,buildMixer,buildAction});selectAsset('tank');
    api.sentryReady=true;
    const fg=await new GLTFLoader().loadAsync(new URL(window.OUFactory.modelUrl,import.meta.url).href);
    config=window.OUFactory;model=fg.scene;hull=model.getObjectByName('Hull');turret=null;barrel=null;barrelRest=null;
    wheels=[];materials=[];detailMeshes=[];crowdMeshes=[];
    extraParts=['Floor','Ramp','WallL','WallR','Rear','Front','RoofFrame','RoofL','RoofR','Door','Equipment'].map(n=>model.getObjectByName(n));
    if(!hull||extraParts.some(n=>!n))throw Error('Factory articulated hierarchy incomplete');
    const fClip=fg.animations.find(a=>a.name==='Build');if(!fClip)throw Error('Factory Build clip missing');
    const fm=new THREE.AnimationMixer(model),fa=fm.clipAction(fClip);fa.setLoop(THREE.LoopOnce,1);fa.clampWhenFinished=true;fa.play();fa.paused=true;fa.time=fClip.duration;fm.update(0);
    model.traverse(o=>{if(o.isMesh)for(const mat of Array.isArray(o.material)?o.material:[o.material])if(/TeamColor/.test(mat.name)&&!materials.includes(mat))materials.push(mat);});
    mergeRigidParts();model.updateMatrixWorld(true);buildCrowdDetail();scene.add(model);remember('factory');Object.assign(assets.get('factory'),{buildClip:fClip,buildMixer:fm,buildAction:fa});
    // Preserve the existing IFV placeholder marker during interior dispatch.
    config=window.OUTankConfig;model=new THREE.Group();hull=new THREE.Group();model.add(hull);
    turret=null;barrel=null;barrelRest=null;wheels=[];extraParts=[];detailMeshes=[];crowdMeshes=[];
    const markerMat=new THREE.MeshBasicMaterial({color:0xffffff});markerMat.name='TeamColor | IFV placeholder';
    const marker=new THREE.Mesh(new THREE.CircleGeometry(1.3,24),markerMat);marker.quaternion.copy(camera.quaternion);hull.add(marker);materials=[markerMat];scene.add(model);remember('ifv');
    selectAsset('tank');api.factoryReady=true;
    const mg=await new GLTFLoader().loadAsync(new URL(window.OUMCV.modelUrl,import.meta.url).href);
    const contract=await fetch(new URL('../asset/model/mcv/contract.json?v=6',import.meta.url)).then(r=>{if(!r.ok)throw Error('MCV contract unavailable');return r.json();});
    if(contract.revision!==6||contract.runtimeSeconds!==window.OUMCV.seconds||contract.worldUnitsPerMetre!==window.OUMCV.scale||contract.modelScale!==window.OUMCV.modelScale||contract.up!=='+Y'||contract.heading!=='+Z')throw Error('MCV model dimensions/timing contract mismatch');
    const mc=mg.animations.find(c=>c.name==='Deploy');if(!mc||Math.abs(mc.duration-3)>.02||mc.tracks.some(t=>t.name.endsWith('.scale')))throw Error('Rigid MCV Deploy clip contract mismatch');
    const work=mg.animations.find(c=>c.name==='Work');
    if(contract.workClip!=='Work'||contract.workSeconds!==window.OUHQWork.seconds||!work||Math.abs(work.duration-contract.workSeconds)>.02||work.tracks.some(t=>t.name.endsWith('.scale')))throw Error('Rigid construction-yard Work clip contract mismatch');
    const deployTracks=new Set(mc.tracks.map(t=>t.name));
    if(work.tracks.length!==mc.tracks.length||work.tracks.some(t=>!deployTracks.has(t.name)))throw Error('Construction-yard Work pose coverage mismatch');
    for(const kind of ['mcv','hq']){
      config={...window.OUMCV,renderSpan:kind==='hq'?window.OUMCV.hqSpan:window.OUMCV.renderSpan};
      model=mg.scene.clone(true);hull=model.getObjectByName('Hull');turret=barrel=barrelRest=null;
      wheels=[];materials=[];extraParts=[];detailMeshes=[];crowdMeshes=[];
      hull?.scale.setScalar(window.OUMCV.modelScale);
      if(!hull||['Cab','Container_1','ArmorWing_1_1','TowerSleeve','Mast_1','BoomHinge','BoomExtension','Workshop','ControlCabin','RadarDish','UtilityPlant','WorkGimbal','WorkCable_0','WorkCable_1','WorkCable_2','WorkCable_3','WorkGripper','WorkJaw_-1','WorkJaw_1','WorkContainer','WorkSupplyLid','WarehouseShutter_0','WarehouseShutter_1'].some(n=>!model.getObjectByName(n)))throw Error('Mechanical MCV hierarchy incomplete');
      model.traverse(o=>{if(!o.isMesh)extraParts.push(o);if(/^Wheel_[LR]_\d$/.test(o.name))wheels.push(o);if(o.isMesh)for(const mat of Array.isArray(o.material)?o.material:[o.material])if(/TeamColor/.test(mat.name)&&!materials.includes(mat))materials.push(mat);});
      const mx=new THREE.AnimationMixer(model),ac=mx.clipAction(mc);ac.setLoop(THREE.LoopOnce,1);ac.clampWhenFinished=true;ac.play();ac.paused=true;ac.time=kind==='hq'?mc.duration:0;mx.update(0);
      const wa=mx.clipAction(work);wa.setLoop(THREE.LoopOnce,1);wa.clampWhenFinished=true;wa.play();wa.paused=true;wa.enabled=false;
      mergeRigidParts();model.updateMatrixWorld(true);buildCrowdDetail();scene.add(model);remember(kind);Object.assign(assets.get(kind),{buildClip:mc,buildMixer:mx,buildAction:ac,workClip:work,workAction:wa});
    }
    // Dedicated service depot: armored workshop with a maintenance gantry.
    config={scale:20,renderSpan:38};model=new THREE.Group();hull=new THREE.Group();model.add(hull);
    turret=barrel=barrelRest=null;wheels=[];extraParts=[];detailMeshes=[];crowdMeshes=[];materials=[];
    const rm=new THREE.MeshStandardMaterial({color:0x626663,metalness:.4,roughness:.8}),dk=new THREE.MeshStandardMaterial({color:0x202a2b,metalness:.5,roughness:.7}),tm=new THREE.MeshStandardMaterial({color:0xffffff,roughness:.6});tm.name='TeamColor | depot';materials=[tm];
    const rb=(x,y,z,w,h,d,mat)=>{const o=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat);o.position.set(x,y,z);hull.add(o);};
    rb(0,.15,0,15,.3,15,dk);rb(0,.45,0,13,.3,13,rm);
    for(const x of [-5.5,5.5]){rb(x,1.4,0,1.8,2,11,rm);rb(x,2.45,0,1.85,.15,9,tm);rb(x,3.4,-4,1,5,1,rm);}
    rb(0,5.5,-4,12,1,1.3,rm);rb(0,5.5,-4.68,10,.3,.06,tm);rb(0,3.8,-4,.3,3,.3,dk);rb(0,2.4,-4,1.2,.35,.7,rm);
    for(const z of [-4,-2,0,2,4]){rb(-3.2,.64,z,.18,.04,1.4,tm);rb(3.2,.64,z,.18,.04,1.4,tm);}
    mergeRigidParts();model.updateMatrixWorld(true);buildCrowdDetail();scene.add(model);remember('repair');
    selectAsset('tank');api.mcvReady=true;

    return true;
  } catch (error) {
    if(assets.has('tank')){selectAsset('tank');api.status='ready';api.assetError=String(error);console.error('[vehicle3d asset]',error);return true;}
    api.status='error'; api.error=String(error);
    console.error('[tank3d] Real-time renderer unavailable; using existing fallback.',error);
    return false;
  }
})();

// Pool one instanced draw per articulated geometry/material. Camera-plane offsets
// place live 3D poses into atlas cells, so a page requires one scene submission.
let batchScene,batchCamera;
const batches=new Map(),offsetMatrix=new THREE.Matrix4(),instanceMatrix=new THREE.Matrix4();
const cameraRight=new THREE.Vector3(),cameraUp=new THREE.Vector3(),white=new THREE.Color(1,1,1);
function prepareBatchPage(cols,rows){
  if(!batchScene){
    batchScene=new THREE.Scene();batchCamera=camera.clone();
    for(const o of scene.children)if(o.isLight)batchScene.add(o.clone());
    camera.updateMatrixWorld(true);
    cameraRight.setFromMatrixColumn(camera.matrixWorld,0);cameraUp.setFromMatrixColumn(camera.matrixWorld,1);
  }
  batchCamera.left=-span*cols/2;batchCamera.right=span*cols/2;
  batchCamera.top=span*rows/2;batchCamera.bottom=-span*rows/2;batchCamera.updateProjectionMatrix();
  for(const b of batches.values()){b.mesh.count=0;b.mesh.visible=false;}
}
function appendPose(u,time,cellX,cellY,capacity,tint,viewSpan=span,localOffset=null){
  selectAsset(u.kind);pose(u,time);
  offsetMatrix.makeTranslation(cameraRight.x*cellX+cameraUp.x*cellY,cameraRight.y*cellX+cameraUp.y*cellY,cameraRight.z*cellX+cameraUp.z*cellY);
  offsetMatrix.scale(new THREE.Vector3(span/viewSpan,span/viewSpan,span/viewSpan));
  if(localOffset)offsetMatrix.multiply(new THREE.Matrix4().makeTranslation(...localOffset));
  model.traverseVisible(src=>{
    if(!src.isMesh||Array.isArray(src.material))return;
    let b=batches.get(src.uuid);
    if(!b||b.capacity<capacity){
      if(b){b.mesh.removeFromParent();b.mesh.dispose();b.mesh.material.dispose();if(b.ground)b.mesh.geometry.dispose();}
      const team=/TeamColor|Lamp/.test(src.material.name),mat=src.material.clone();
      if(team){mat.color.set(0xffffff);if(mat.emissive)mat.emissive.set(0);}
      let geometry=src.geometry,ground=null;
      if(['turret','factory','hq','repair','mcv'].includes(u.kind)){
        // Each atlas cell has a different camera-plane offset. Remove that offset
        // before clipping the underground assembly against the real ground plane.
        geometry=src.geometry.clone();ground=new THREE.InstancedBufferAttribute(new Float32Array(capacity),1);
        geometry.setAttribute('assemblyGroundOffset',ground);
        mat.onBeforeCompile=shader=>{
          shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nattribute float assemblyGroundOffset;\nvarying float assemblyHeight;');
          shader.vertexShader=shader.vertexShader.replace('#include <project_vertex>','#include <project_vertex>\nassemblyHeight=(instanceMatrix*vec4(transformed,1.0)).y-assemblyGroundOffset;');
          shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nvarying float assemblyHeight;');
          shader.fragmentShader=shader.fragmentShader.replace('#include <clipping_planes_fragment>','#include <clipping_planes_fragment>\nif(assemblyHeight<0.0)discard;');
        };
        mat.customProgramCacheKey=()=> 'sentry-assembly-ground-v1';
      }
      const mesh=new THREE.InstancedMesh(geometry,mat,capacity);mesh.count=0;mesh.frustumCulled=false;mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      b={mesh,ground,team,capacity,dark:src.material.name.includes('recessed')};batches.set(src.uuid,b);batchScene.add(mesh);
    }
    const n=b.mesh.count++;b.mesh.visible=true;
    if(b.ground)b.ground.setX(n,offsetMatrix.elements[13]);
    instanceMatrix.multiplyMatrices(offsetMatrix,src.matrixWorld);b.mesh.setMatrixAt(n,instanceMatrix);
    b.mesh.setColorAt(n,b.team?(b.dark?tint.clone().multiplyScalar(.45):tint):white);
  });
}

// Render fresh poses into frame-local pages before painter-order composition.
// This is real-time geometry, not stored directional sprites: pages are redrawn
// every frame. Each page crosses WebGL -> Canvas2D once, instead of once per tank.
api.beginFrame = function(units,time,view) {
  api.draws=0; api.gpuDrawCalls=0; frameSlots.clear();
  const live=new Set(units.filter(u=>u.alive&&assets.has(u.kind)).map(u=>u.id));
  for(const [id,p] of poseByUnit) if(!live.has(id)||time<p.seen) poseByUnit.delete(id);
  if(api.status!=='ready'||!view) return;
  const {ctx,project,zoom,color}=view;
  const viewWidth=view.width||ctx.canvas.width;
  const visible=units.filter(u=>{
    if(!u.alive||!assets.has(u.kind)||u.kind==='ifv'||u.hidden||u.inTransport)return false;
    const size=assets.get(u.kind).config.renderSpan*assets.get(u.kind).config.scale/Math.sqrt(2)*zoom,p=project(u.x,u.y);
    return p.x+size/2>=0&&p.y+size/2>=0&&p.x-size/2<=viewWidth&&p.y-size/2<=ctx.canvas.height;
  });
  const groups=new Map(),settled=new Map(),pending=new Map();
  const isSettled=u=>u.kind==='hq'&&!u._mcvPhase&&!u._mcvSelling&&window.OUHQWork.progress(u,time)==null;
  const pixelSize=viewSpan=>Math.max(64,Math.min(768,Math.ceil(viewSpan*20/Math.sqrt(2)*zoom)));
  const cache=window.OUHQAssembly;
  for(const u of visible){
    const viewSpan=assets.get(u.kind).config.renderSpan;
    if(isSettled(u)){
      const res=pixelSize(viewSpan),k=cache.key(color(u),res),size=viewSpan*20/Math.sqrt(2)*zoom;
      settled.set(u.id,{k,res,size});
      const canvas=cache.get(k);
      if(canvas){frameSlots.set(u.id,{canvas,x:0,y:0,res,size});continue;}
      if(pending.has(k))continue;
      pending.set(k,u.id);
    }
    if(!groups.has(viewSpan))groups.set(viewSpan,[]);groups.get(viewSpan).push(u);
  }
  const res=Math.max(64,Math.min(768,Math.ceil(span*window.OUTankConfig.scale/Math.sqrt(2)*zoom)));
  const crowd=res<=160 || visible.length>=48;
  for(const a of assets.values()){for(const m of a.detailMeshes)m.visible=!crowd;for(const m of a.crowdMeshes)m.visible=crowd;}
  api.detail=crowd?'crowd':'full';
  const maxSide=Math.min(2048,renderer.capabilities.maxTextureSize);
  renderer.autoClear=false;
  let pageCount=0;
  for(const [viewSpan,group] of groups){
  const size=viewSpan*window.OUTankConfig.scale/Math.sqrt(2)*zoom;
  const res=Math.max(64,Math.min(768,Math.ceil(size)));
  const cols=Math.max(1,Math.min(Math.ceil(Math.sqrt(group.length)),Math.floor(maxSide/res)));
  const capacity=cols*Math.max(1,Math.floor(maxSide/res));
  for(let start=0;start<group.length;start+=capacity){
    const chunk=group.slice(start,start+capacity);
    const rows=Math.ceil(chunk.length/cols),width=cols*res,height=rows*res;
    if(renderer.domElement.width!==width||renderer.domElement.height!==height)renderer.setSize(width,height,false);
    renderer.setScissorTest(false);renderer.setViewport(0,0,width,height);renderer.clear();
    prepareBatchPage(cols,rows);
    let canvas=framePages[pageCount];
    if(!canvas)canvas=framePages[pageCount]=document.createElement('canvas');
    if(canvas.width!==width||canvas.height!==height){canvas.width=width;canvas.height=height;}
    for(let i=0;i<chunk.length;i++){
      const u=chunk[i],x=(i%cols)*res,y=Math.floor(i/cols)*res;
      const cx=((i%cols)+.5-cols/2)*span,cy=(rows/2-Math.floor(i/cols)-.5)*span,tint=new THREE.Color(color(u));
      appendPose(u,time,cx,cy,capacity,tint,viewSpan);
      if(u.kind==='factory'){
        const vehicle=window.OUFactory.vehicle(u,time,u.w/u.tw);
        if(vehicle&&assets.has(vehicle.kind))appendPose(vehicle,time,cx,cy,capacity,tint,viewSpan,[(vehicle.x-u.x)/20,0,(vehicle.y-u.y)/20]);
      }
      frameSlots.set(u.id,{canvas,x,y,res,size});
    }
    for(const b of batches.values())if(b.mesh.count){b.mesh.instanceMatrix.needsUpdate=true;b.mesh.instanceColor.needsUpdate=true;if(b.ground)b.ground.needsUpdate=true;}
    renderer.render(batchScene,batchCamera);
    api.gpuDrawCalls=renderer.info.render.calls;
    const copy=canvas.getContext('2d');copy.clearRect(0,0,width,height);
    copy.drawImage(renderer.domElement,0,0);
    for(let i=0;i<chunk.length;i++){
      const entry=settled.get(chunk[i].id);if(!entry)continue;
      const still=document.createElement('canvas');still.width=still.height=res;
      still.getContext('2d').drawImage(canvas,(i%cols)*res,Math.floor(i/cols)*res,res,res,0,0,res,res);
      cache.put(entry.k,still);
    }
    pageCount++;
  }
  }
  renderer.setScissorTest(false);renderer.autoClear=true;
  framePages.length=pageCount;
  for(const [id,entry] of settled){
    const canvas=cache.get(entry.k);
    if(canvas)frameSlots.set(id,{canvas,x:0,y:0,res:entry.res,size:entry.size});
  }
  api.pages=pageCount;
  api.yardCache=cache.stats();
};

api.draw = function(ctx,u,p,zoom,color,time) {
  if(api.status!=='ready'||!assets.has(u.kind))return false;
  const slot=frameSlots.get(u.id);
  if(slot){
    const {canvas,x,y,res,size}=slot;
    ctx.drawImage(canvas,x,y,res,res,p.x-size/2,p.y-size/2,size,size);
    api.draws++;
  }
  return true;
};

api.hitTest = function(u,screen,origin,zoom,time) {
  if(api.status!=='ready'||!assets.has(u.kind)) return false;
  const pickSpan=assets.get(u.kind).config.renderSpan;
  const size=pickSpan*window.OUTankMotion.SCALE/Math.sqrt(2)*zoom;
  pointer.set((screen.x-origin.x)*2/size,-(screen.y-origin.y)*2/size);
  if(Math.abs(pointer.x)>1 || Math.abs(pointer.y)>1) return false;
  camera.left=-pickSpan/2;camera.right=pickSpan/2;camera.top=pickSpan/2;camera.bottom=-pickSpan/2;camera.updateProjectionMatrix();
  selectAsset(u.kind);pose(u,time); ray.setFromCamera(pointer,camera);
  return ray.intersectObject(model,true).some(h=>h.object.material?.opacity!==.2);
};

// Used by the browser integration test to compare the GLB attachment to physics.
api.muzzleWorld = function(u,time) {
  if(api.status!=='ready') return null;
  selectAsset('tank');pose(u,time); model.getObjectByName('Muzzle').getWorldPosition(v);
  const s=window.OUTankMotion.SCALE;
  return {x:u.x+v.x*s,y:u.y+v.z*s,z:v.y*s};
};

const sentryGhosts=[];
api.onSentryDestroyed=(b,time)=>{sentryGhosts.push({...b,id:-b.id,alive:true,_sentryDeath:time});};
api.sentryGhosts=time=>{
 for(let i=sentryGhosts.length-1;i>=0;i--)if(time<sentryGhosts[i]._sentryDeath||time-sentryGhosts[i]._sentryDeath>window.OUSentry.deathSeconds)sentryGhosts.splice(i,1);
 return sentryGhosts;
};
api.sentryMuzzleWorld=(u,time)=>{
 if(!assets.has('turret'))return null;selectAsset('turret');pose(u,time);
 model.getObjectByName('Muzzle').getWorldPosition(v);
 return {x:u.x+v.x*20,y:u.y+v.z*20,z:v.y*20};
};

// Read-only diagnostic samples for animation regression and preview tooling.
api.sentryAssemblyPose=(u,time)=>{
 if(!assets.has('turret'))return null;selectAsset('turret');pose(u,time);
 return Object.fromEntries(extraParts.map(n=>[n.name,{position:n.position.toArray(),quaternion:n.quaternion.toArray(),scale:n.scale.toArray()}]));
};


const factoryGhosts=[];
api.onFactoryDestroyed=(b,time)=>factoryGhosts.push({...b,id:-b.id,alive:true,_factoryDeath:time,_factoryDispatch:null});
api.factoryGhosts=time=>{for(let i=factoryGhosts.length-1;i>=0;i--)if(time<factoryGhosts[i]._factoryDeath||time-factoryGhosts[i]._factoryDeath>window.OUFactory.deathSeconds)factoryGhosts.splice(i,1);return factoryGhosts;};
api.factoryPose=(u,time)=>{if(!assets.has('factory'))return null;selectAsset('factory');pose(u,time);return Object.fromEntries(extraParts.map(n=>[n.name,{position:n.position.toArray(),quaternion:n.quaternion.toArray(),scale:n.scale.toArray()}]));};

api.mcvPose=(u,t)=>{if(!assets.has(u.kind))return null;selectAsset(u.kind);pose(u,t);return Object.fromEntries(extraParts.map(n=>[n.name,{position:n.position.toArray(),quaternion:n.quaternion.toArray(),scale:n.scale.toArray()}]));};
