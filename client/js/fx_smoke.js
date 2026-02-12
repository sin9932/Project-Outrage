(function(){
'use strict';

// Smoke & ground FX module (independent from bullets).
// Exposes a global SmokeFX with a small API that game.js calls.
//
// Design goals:
// - No shared globals besides reading cam (for draw) and TILE (setTile)
// - Internal state only
// - Works even if some calls are missing (safe no-ops)

let TILE = 64;

function clamp(v,a,b){ return v<a?a:(v>b?b:v); }

// small deterministic RNG per particle
function mulberry32(a){
  return function(){
    let t = a += 0x6D2B79F5;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function camParams(){
  // game.js uses cam {x,y,zoom}; fallback to identity
  const z = (typeof cam !== "undefined" && cam && typeof cam.zoom==="number") ? cam.zoom : 1;
  const cx = (typeof cam !== "undefined" && cam && typeof cam.x==="number") ? cam.x : 0;
  const cy = (typeof cam !== "undefined" && cam && typeof cam.y==="number") ? cam.y : 0;
  return {cx,cy,z};
}

const smokeWaves = [];
const smokeEmitters = [];
const smokeHaze = [];
const smokePuffs = [];

const dustPuffs = [];
const dmgSmokePuffs = [];

// ===== Building ring wave (ground smoke ring) =====
function addSmokeWave(wx, wy, size=1){
  const sz = clamp(size, 0.6, 2.2);
  smokeWaves.push({
    x: wx, y: wy,
    t: 0,
    ttl: 1.65,
    size: sz,
    seed: (Math.random()*1e9)|0,
    squash: 0.62
  });
}

// ===== Persistent emitter after building explosion =====
function spawnSmokeHaze(wx, wy, size=1){
  const sz = clamp(size, 0.6, 2.4);
  const seed = (Math.random()*1e9)|0;
  const r = mulberry32(seed);
  // big soft haze puff that lingers
  smokeHaze.push({
    x: wx + (r()*2-1)*TILE*0.35*sz,
    y: wy + (r()*2-1)*TILE*0.22*sz,
    vx: (r()*2-1)*TILE*0.04,
    vy: (r()*2-1)*TILE*0.03,
    t: 0,
    ttl: 3.6 + r()*1.6,
    size: sz*(0.95 + r()*0.55),
    a0: 0.06 + r()*0.06,
    seed
  });
}

function addSmokeEmitter(wx, wy, size=1){
  const sz = clamp(size, 0.6, 2.5);
  smokeEmitters.push({ x:wx, y:wy, t:0, ttl:3.8, size: sz, acc:0, seed:(Math.random()*1e9)|0 });

  // restore the old "noise gradient haze" vibe: scatter multiple lingering haze blobs
  for (let i=0;i<10;i++){
    spawnSmokeHaze(wx, wy, sz*(0.9 + Math.random()*0.6));
  }
}

// ===== Smoke puff (plume) =====
function spawnSmokePuff(wx, wy, vx, vy, strength=1){
  const sz = clamp(strength, 0.6, 2.6);
  const seed = (Math.random()*1e9)|0;
  const r = mulberry32(seed);

  // drift mostly upward, a bit opposite movement
  const sp = Math.hypot(vx||0, vy||0);
  const backx = sp>1 ? (-(vx||0)/sp) : 0;
  const backy = sp>1 ? (-(vy||0)/sp) : 0;

  smokePuffs.push({
    x: wx + (r()*2-1)*TILE*0.10*sz + backx*TILE*0.06*sz,
    y: wy + (r()*2-1)*TILE*0.08*sz + backy*TILE*0.06*sz,
    vx: (r()*2-1)*TILE*0.06*sz + backx*TILE*0.03*sz,
    vy: (-TILE*(0.10 + r()*0.08))*sz + (r()*2-1)*TILE*0.03*sz,
    t: 0,
    ttl: 1.15 + r()*0.45,
    size: sz,
    a0: 0.16 + r()*0.10,
    seed
  });
}

// ===== Vehicle trail dust (behind the vehicle) =====
function spawnDustPuff(wx, wy, vx, vy, strength=1){
  const sz = clamp(strength, 0.6, 2.6);
  const seed = (Math.random()*1e9)|0;
  const r = mulberry32(seed);

  const sp = Math.hypot(vx||0, vy||0);
  const backx = sp>1 ? (-(vx||0)/sp) : 0;
  const backy = sp>1 ? (-(vy||0)/sp) : 0;

  dustPuffs.push({
    x: wx + (r()*2-1)*TILE*0.10*sz,
    y: wy + (r()*2-1)*TILE*0.08*sz,
    vx: (r()*2-1)*TILE*0.10*sz + backx*TILE*0.05*sz,
    vy: (r()*2-1)*TILE*0.08*sz + backy*TILE*0.05*sz,
    t: 0,
    ttl: 0.75 + r()*0.40,
    size: sz*(0.95 + r()*0.45),
    a0: 0.22 + r()*0.10,
    seed
  });

  // add a few micro puffs to fake noise on edges (like your building destruction gradient)
  if (Math.random() < 0.65){
    for (let i=0;i<4;i++){
      dustPuffs.push({
        x: wx + (r()*2-1)*TILE*0.18*sz,
        y: wy + (r()*2-1)*TILE*0.14*sz,
        vx: (r()*2-1)*TILE*0.14*sz + backx*TILE*0.04*sz,
        vy: (r()*2-1)*TILE*0.10*sz + backy*TILE*0.04*sz,
        t: 0,
        ttl: 0.45 + r()*0.25,
        size: sz*(0.55 + r()*0.35),
        a0: 0.14 + r()*0.08,
        seed: seed ^ (i*0x9e3779b9)
      });
    }
  }
}

// ===== Damage smoke (small black smoke when yellow HP) =====
function spawnDmgSmokePuff(wx, wy, strength=1){
  const sz = clamp(strength, 0.6, 2.2);
  const seed = (Math.random()*1e9)|0;
  const r = mulberry32(seed);

  dmgSmokePuffs.push({
    x: wx + (r()*2-1)*TILE*0.12*sz,
    y: wy + (r()*2-1)*TILE*0.10*sz,
    vx: (r()*2-1)*TILE*0.04*sz,
    vy: (-TILE*(0.07 + r()*0.05))*sz,
    t: 0,
    ttl: 1.25 + r()*0.65,
    size: sz*(0.45 + r()*0.35),
    a0: 0.18 + r()*0.10,
    seed
  });
}

// ===== Update =====
function updateSmoke(dt){
  // ground ring waves
  for (let i=smokeWaves.length-1;i>=0;i--){
    const w = smokeWaves[i];
    w.t += dt;
    if (w.t >= w.ttl) smokeWaves.splice(i,1);
  }

  // emitters spawn puffs + haze
  for (let i=smokeEmitters.length-1;i>=0;i--){
    const e = smokeEmitters[i];
    e.t += dt;
    e.acc += dt;
    const interval = 0.12;
    while (e.acc >= interval){
      e.acc -= interval;
      // small plume puffs around the ruins
      spawnSmokePuff(
        e.x + (Math.random()*2-1)*TILE*0.22*e.size,
        e.y + (Math.random()*2-1)*TILE*0.14*e.size,
        0, 0,
        0.9*e.size
      );
      if (Math.random() < 0.35) spawnSmokeHaze(e.x, e.y, e.size*0.9);
    }
    if (e.t >= e.ttl) smokeEmitters.splice(i,1);
  }

  // haze drift
  for (let i=smokeHaze.length-1;i>=0;i--){
    const p = smokeHaze[i];
    p.t += dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    if (p.t >= p.ttl) smokeHaze.splice(i,1);
  }

  // plume puffs
  for (let i=smokePuffs.length-1;i>=0;i--){
    const p = smokePuffs[i];
    p.t += dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    // gentle damping
    p.vx *= Math.pow(0.88, dt*60);
    p.vy *= Math.pow(0.90, dt*60);
    if (p.t >= p.ttl) smokePuffs.splice(i,1);
  }

  // dust puffs
  for (let i=dustPuffs.length-1;i>=0;i--){
    const p = dustPuffs[i];
    p.t += dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vx *= Math.pow(0.82, dt*60);
    p.vy *= Math.pow(0.82, dt*60);
    if (p.t >= p.ttl) dustPuffs.splice(i,1);
  }

  // damage smoke puffs
  for (let i=dmgSmokePuffs.length-1;i>=0;i--){
    const p = dmgSmokePuffs[i];
    p.t += dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vx *= Math.pow(0.86, dt*60);
    p.vy *= Math.pow(0.88, dt*60);
    if (p.t >= p.ttl) dmgSmokePuffs.splice(i,1);
  }
}

// ===== Draw helpers: noisy radial gradient blob =====
function drawNoisyBlob(ctx, x, y, baseR, a, rgb, seed){
  const r = mulberry32(seed);
  const g = ctx.createRadialGradient(x, y, 0, x, y, baseR);
  g.addColorStop(0, `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${a})`);
  g.addColorStop(0.55, `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${a*0.55})`);
  g.addColorStop(1, `rgba(${rgb[0]},${rgb[1]},${rgb[2]},0)`);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, baseR, 0, Math.PI*2);
  ctx.fill();

  // edge noise: micro blobs around circumference
  const n = 6 + ((seed>>>0) % 6);
  for (let i=0;i<n;i++){
    const ang = r()*Math.PI*2;
    const rr = baseR*(0.55 + r()*0.55);
    const ox = Math.cos(ang)*baseR*(0.55 + r()*0.25);
    const oy = Math.sin(ang)*baseR*(0.55 + r()*0.25);
    const ga = a*(0.25 + r()*0.30);
    const gg = ctx.createRadialGradient(x+ox, y+oy, 0, x+ox, y+oy, rr);
    gg.addColorStop(0, `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${ga})`);
    gg.addColorStop(1, `rgba(${rgb[0]},${rgb[1]},${rgb[2]},0)`);
    ctx.fillStyle = gg;
    ctx.beginPath();
    ctx.arc(x+ox, y+oy, rr, 0, Math.PI*2);
    ctx.fill();
  }
}

// ===== Draw: ground ring waves (your "building destruction gradient noise smoke") =====
function drawSmokeWaves(ctx){
  if (!smokeWaves.length) return;
  const {cx,cy,z} = camParams();
  ctx.save();
  ctx.globalCompositeOperation = "source-over";
  for (const w of smokeWaves){
    const t = w.t / w.ttl;
    const rr = (TILE * 1.45 * w.size) * (0.45 + t*1.35);
    const a = (1-t) * (0.18 + 0.10*(1-t));
    const x = (w.x - cx) * z;
    const y = (w.y - cy) * z;

    ctx.save();
    ctx.translate(x, y);
    ctx.scale(1, w.squash);
    // ring: draw a few noisy blobs around circle
    const seed = w.seed;
    const r = mulberry32(seed);
    const chunks = 18;
    for (let i=0;i<chunks;i++){
      const ang = (i/chunks)*Math.PI*2 + r()*0.08;
      const px = Math.cos(ang) * rr;
      const py = Math.sin(ang) * rr;
      drawNoisyBlob(ctx, px, py, rr*0.22, a, [190,190,190], seed ^ (i*0x9e3779b9));
    }
    ctx.restore();
  }
  ctx.restore();
}

// Draw smoke plume puffs (above the ground ring)
function drawSmokePuffs(ctx){
  if (!smokePuffs.length && !smokeHaze.length) return;
  const {cx,cy,z} = camParams();
  ctx.save();
  ctx.globalCompositeOperation = "source-over";

  for (const p of smokeHaze){
    const t = p.t / p.ttl;
    const a = (1-t) * p.a0;
    const R = (TILE*0.95*p.size) * (0.55 + t*1.40);
    drawNoisyBlob(ctx, (p.x-cx)*z, (p.y-cy)*z, R*z, a, [155,155,155], p.seed);
  }

  for (const p of smokePuffs){
    const t = p.t / p.ttl;
    const a = (1-t) * p.a0;
    const R = (TILE*0.55*p.size) * (0.65 + t*1.25);
    drawNoisyBlob(ctx, (p.x-cx)*z, (p.y-cy)*z, R*z, a, [175,175,175], p.seed);
  }

  ctx.restore();
}

// Draw vehicle dust trail (ground)
function drawDustPuffs(ctx){
  if (!dustPuffs.length) return;
  const {cx,cy,z} = camParams();
  ctx.save();
  ctx.globalCompositeOperation = "source-over";
  for (const p of dustPuffs){
    const t = p.t / p.ttl;
    const a = (1-t) * p.a0;
    const R = (TILE*0.38*p.size) * (0.75 + t*1.35);
    drawNoisyBlob(ctx, (p.x-cx)*z, (p.y-cy)*z, R*z, a, [205,205,205], p.seed);
  }
  ctx.restore();
}

// Draw small black damage smoke (yellow HP)
function drawDmgSmokePuffs(ctx){
  if (!dmgSmokePuffs.length) return;
  const {cx,cy,z} = camParams();
  ctx.save();
  ctx.globalCompositeOperation = "source-over";
  for (const p of dmgSmokePuffs){
    const t = p.t / p.ttl;
    const a = (1-t) * p.a0;
    const R = (TILE*0.28*p.size) * (0.75 + t*1.25);
    drawNoisyBlob(ctx, (p.x-cx)*z, (p.y-cy)*z, R*z, a, [25,25,25], p.seed);
  }
  ctx.restore();
}

function setTile(t){ TILE = (typeof t==="number" && isFinite(t)) ? t : TILE; }

window.SmokeFX = {
  setTile,
  addSmokeWave,
  addSmokeEmitter,
  spawnSmokeHaze,
  spawnSmokePuff,
  drawSmokePuffs,
  updateSmoke,
  drawSmokeWaves,
  spawnDustPuff,
  drawDustPuffs,
  spawnDmgSmokePuff,
  drawDmgSmokePuffs
};

})();