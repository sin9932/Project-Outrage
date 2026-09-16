import * as THREE from 'three';
import { GLTFLoader } from '../vendor/three/addons/loaders/GLTFLoader.js';

// Hybrid isometric renderer: rasterize actual geometry at its current arbitrary
// pose every frame, then composite at the existing world depth-sort position.
// No directional atlas, cached view frames, or animation image sequences.
const api = window.OUTank3D = { status: 'loading', draws: 0, error: null };
const enabled = new URLSearchParams(location.search).get('tank3d') !== '0';
const span = 14;
let renderer, scene, camera, model, hull, turret, barrel, barrelRest;
let wheels = [], materials = [], currentColor = null;
const poseByUnit = new Map();
const ray = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const v = new THREE.Vector3();

function pose(u, time) {
  const m = window.OUTankMotion;
  m.ensure(u);
  model.rotation.y = Math.PI / 2 - u.bodyYaw;
  turret.rotation.y = u.bodyYaw - u.turretYaw;
  barrel.position.copy(barrelRest);
  barrel.position.z -= m.recoil(u, time);
  let rec = poseByUnit.get(u.id);
  if (!rec || rec.unit !== u) rec = { unit:u, x:u.x, y:u.y, wheel:0, seen:time };
  const dx = u.x - rec.x, dy = u.y - rec.y;
  const forward = dx * Math.cos(u.bodyYaw) + dy * Math.sin(u.bodyYaw);
  if (Math.hypot(dx,dy) < 200) rec.wheel += forward / (m.SCALE * .427);
  rec.x = u.x; rec.y = u.y; rec.seen = time;
  poseByUnit.set(u.id,rec);
  for (const w of wheels) w.rotation.x = rec.wheel;
  model.updateMatrixWorld(true);
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
      event.preventDefault(); api.status='lost';
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
    const gltf = await new GLTFLoader().loadAsync(new URL('../asset/model/lite_tank/light_tank.glb',import.meta.url).href);
    model = gltf.scene;
    hull = model.getObjectByName('Hull'); turret = model.getObjectByName('Turret'); barrel = model.getObjectByName('Barrel');
    if (!hull || !turret || !barrel || !model.getObjectByName('Muzzle')) throw Error('Tank hierarchy is incomplete');
    barrelRest = barrel.position.clone();
    model.traverse(o => {
      if (/^Wheel_[LR]_\d$/.test(o.name)) wheels.push(o);
      if (!o.isMesh) return;
      for (const mat of Array.isArray(o.material) ? o.material : [o.material]) {
        if (/TeamColor|Lamp/.test(mat.name) && !materials.includes(mat)) materials.push(mat);
      }
    });
    scene.add(model);
    // Contact shadow on the ground plane, attached to the hull's orientation.
    const shadow = new THREE.Mesh(new THREE.CircleGeometry(1,32),new THREE.MeshBasicMaterial({color:0x000000,transparent:true,opacity:.2,depthWrite:false}));
    shadow.rotation.x=-Math.PI/2; shadow.scale.set(1.65,2.25,1); shadow.position.y=.012;
    hull.add(shadow);
    api.status='ready';
    api.asset = { animations:gltf.animations.map(a=>a.name), meshCount:0 };
    model.traverse(o=>{if(o.isMesh)api.asset.meshCount++;});
    return true;
  } catch (error) {
    api.status='error'; api.error=String(error);
    console.error('[tank3d] Real-time renderer unavailable; using existing fallback.',error);
    return false;
  }
})();

api.beginFrame = function(units,time) {
  api.draws = 0;
  const live = new Set(units.filter(u=>u.alive && u.kind==='tank').map(u=>u.id));
  for (const [id,p] of poseByUnit) if (!live.has(id) || time < p.seen) poseByUnit.delete(id);
};

api.draw = function(ctx,u,p,zoom,color,time) {
  if (api.status!=='ready') return false;
  const size = span * window.OUTankMotion.SCALE / Math.sqrt(2) * zoom;
  if (p.x+size/2<0 || p.y+size/2<0 || p.x-size/2>ctx.canvas.width || p.y-size/2>ctx.canvas.height) return true;
  const resolution = Math.max(64,Math.min(768,Math.ceil(size)));
  if (renderer.domElement.width!==resolution) renderer.setSize(resolution,resolution,false);
  pose(u,time); teamColor(color);
  renderer.render(scene,camera);
  // Synchronous copy before the browser discards the WebGL drawing buffer.
  ctx.drawImage(renderer.domElement,p.x-size/2,p.y-size/2,size,size);
  api.draws++;
  return true;
};

api.hitTest = function(u,screen,origin,zoom,time) {
  if(api.status!=='ready') return false;
  const size=span*window.OUTankMotion.SCALE/Math.sqrt(2)*zoom;
  pointer.set((screen.x-origin.x)*2/size,-(screen.y-origin.y)*2/size);
  if(Math.abs(pointer.x)>1 || Math.abs(pointer.y)>1) return false;
  pose(u,time); ray.setFromCamera(pointer,camera);
  return ray.intersectObject(model,true).some(h=>h.object.material?.opacity!==.2);
};

// Used by the browser integration test to compare the GLB attachment to physics.
api.muzzleWorld = function(u,time) {
  if(api.status!=='ready') return null;
  pose(u,time); model.getObjectByName('Muzzle').getWorldPosition(v);
  const s=window.OUTankMotion.SCALE;
  return {x:u.x+v.x*s,y:u.y+v.z*s,z:v.y*s};
};
