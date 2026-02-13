// FX module split out of game.js
// Owns: smoke, dust, blood, building explosions, and combat sprite FX (traces/impacts/fires/flashes/casings/heal marks)
//
// This file must be loaded BEFORE game.js
(function(){
  'use strict';

  let TILE = 64;
  function setTile(t){ TILE = t || TILE; }
  function clamp(v,a,b){ return Math.max(a, Math.min(b, v)); }

  // --- shared FX arrays (game.js aliases these) ---
  const traces = [];
  const impacts = [];
  const fires = [];
  const explosions = [];
  const healMarks = [];
  const flashes = [];
  const casings = [];
  const repairWrenches = [];

  // --- smoke/dust/blood state ---
  const smokeWaves = [];
  const smokePuffs = [];
  const smokeEmitters = [];
  const dustPuffs = [];
  const dmgSmokePuffs = [];

  const bloodStains = [];
  const bloodPuffs = [];

// ===== Smoke ring + smoke particles (building destruction) =====
// 목표:
// - 파동 연기: "원형으로 퍼지되", 아이소메트리라서 위아래 납작 + 라인 없이 흐릿한 연무 타입
// - 파티클/폭발을 가리지 않도록 렌더 순서는 최하위(지형 위, 폭발/파편 아래)

// Extra ground FX for vehicles

// Dust puff for moving vehicles (sandy haze). World-positioned (does NOT follow units).
function spawnDustPuff(wx, wy, vx, vy, strength=1){
  const size = clamp(strength, 0.6, 2.2);
  const spread = TILE * 0.30 * size;
  const ang = Math.random() * Math.PI * 2;
  const rad = Math.sqrt(Math.random()) * spread;
  const x = wx + Math.cos(ang) * rad;
  const y = wy + Math.sin(ang) * rad;

  // drift roughly opposite of movement (normalize vx/vy)
  const mag = Math.max(0.0001, Math.hypot(vx||0, vy||0));
  const backx = -(vx||0) / mag;
  const backy = -(vy||0) / mag;

  dustPuffs.push({
    x, y,
    vx: backx*(TILE*0.18*size) + (Math.random()*2-1)*(TILE*0.05*size),
    vy: backy*(TILE*0.18*size) + (Math.random()*2-1)*(TILE*0.05*size),
    t: 0,
    ttl: 1.35 + Math.random()*0.75,
    r0: (22 + Math.random()*14) * size,
    grow: (92 + Math.random()*60) * size,
    seed: Math.random()*9999,
    a0: 0.48 + Math.random()*0.18
  });
}

// Damage smoke from a crippled unit (from turret area). World-positioned.
function spawnDmgSmokePuff(wx, wy, strength=1){
  const size = clamp(strength, 0.6, 2.4);
  const spread = TILE * 0.16 * size;
  const ang = Math.random() * Math.PI * 2;
  const rad = Math.sqrt(Math.random()) * spread;
  const x = wx + Math.cos(ang) * rad;
  const y = wy + Math.sin(ang) * rad;

  dmgSmokePuffs.push({
    x, y,
    vx: (Math.random()*2-1)*(TILE*0.02*size),
    vy: (Math.random()*2-1)*(TILE*0.02*size) - (TILE*0.03*size),
    t: 0,
    ttl: 1.9 + Math.random()*1.0,
    r0: (8 + Math.random()*7) * size,
    grow: (44 + Math.random()*34) * size,
    seed: Math.random()*9999,
    a0: 0.18 + Math.random()*0.10
  });
}

function addSmokeWave(wx, wy, size=1){
  const sz = clamp(size, 0.6, 2.1);
  smokeWaves.push({
    x: wx, y: wy,
    t: 0,
    ttl: 1.55,
    size: sz,
    seed: (Math.random()*1e9)|0,
    squash: 0.62 // y flatten
  });
}

function addSmokeEmitter(wx, wy, size=1){
  const sz = clamp(size, 0.6, 2.3);
  smokeEmitters.push({ x:wx, y:wy, t:0, ttl:3.4, size: sz, acc:0 });

  // 잔류 연무(넓게 퍼지는 옅은 연기) 몇 덩이 깔기
  for (let i=0;i<7;i++) spawnSmokeHaze(wx, wy, sz * (0.95 + Math.random()*0.28));
}

function spawnSmokePuff(wx, wy, size=1){
  const spread = TILE * 0.85 * size;
  const ang = Math.random() * Math.PI * 2;
  const rad = Math.sqrt(Math.random()) * spread;

  const x = wx + Math.cos(ang) * rad;
  const y = wy + Math.sin(ang) * rad;

  smokePuffs.push({
    x, y,
    vx: (Math.random()*2-1) * (TILE * 0.22 * size) + Math.cos(ang)*(TILE*0.08*size),
    vy: (Math.random()*2-1) * (TILE * 0.22 * size) + Math.sin(ang)*(TILE*0.08*size),
    t: 0,
    ttl: 2.8 + Math.random()*2.2,
    r0: (18 + Math.random()*26) * size,
    grow: (30 + Math.random()*44) * size,
    a0: 0.12 + Math.random()*0.12
  });
}

function spawnSmokeHaze(wx, wy, size=1){
  const spread = TILE * 1.15 * size;
  const ang = Math.random() * Math.PI * 2;
  const rad = Math.sqrt(Math.random()) * spread;

  const x = wx + Math.cos(ang) * rad;
  const y = wy + Math.sin(ang) * rad;

  smokePuffs.push({
    x, y,
    vx: (Math.random()*2-1) * (TILE * 0.10 * size) + Math.cos(ang)*(TILE*0.06*size),
    vy: (Math.random()*2-1) * (TILE * 0.10 * size) + Math.sin(ang)*(TILE*0.06*size),
    t: 0,
    ttl: 4.2 + Math.random()*2.2,
    r0: (34 + Math.random()*24) * size,
    grow: (70 + Math.random()*70) * size,
    a0: 0.06 + Math.random()*0.05
  });
}

function updateSmoke(dt){
  // Waves
  for (let i=smokeWaves.length-1;i>=0;i--){
    const w = smokeWaves[i];
    w.t += dt;
    if (w.t >= w.ttl) smokeWaves.splice(i,1);
  }

  // Emitters
  for (let i=smokeEmitters.length-1;i>=0;i--){
    const e = smokeEmitters[i];
    e.t += dt;
    e.acc += dt;

    const rate = 18 * e.size;
    const step = 1 / Math.max(6, rate);

    while (e.acc >= step){
      e.acc -= step;
      spawnSmokePuff(e.x, e.y, e.size);
    }
    if (e.t >= e.ttl) smokeEmitters.splice(i,1);
  }

  // Puffs
  for (let i=smokePuffs.length-1;i>=0;i--){
    const p = smokePuffs[i];
    p.t += dt;
    if (p.t >= p.ttl){ smokePuffs.splice(i,1); continue; }

    p.x += p.vx * dt;
    p.y += p.vy * dt;

    const damp = Math.pow(0.992, dt*60);
    p.vx *= damp;
    p.vy *= damp;
  }

  // Dust puffs
  for (let i=dustPuffs.length-1;i>=0;i--){
    const p = dustPuffs[i];
    p.t += dt;
    if (p.t >= p.ttl){ dustPuffs.splice(i,1); continue; }
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    const damp = Math.pow(0.975, dt*60);
    p.vx *= damp;
    p.vy *= damp;
  }

  // Damage smoke puffs
  for (let i=dmgSmokePuffs.length-1;i>=0;i--){
    const p = dmgSmokePuffs[i];
    p.t += dt;
    if (p.t >= p.ttl){ dmgSmokePuffs.splice(i,1); continue; }
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    const damp = Math.pow(0.988, dt*60);
    p.vx *= damp;
    p.vy *= damp;
  }
}

function drawSmokeWaves(ctx, w2s, cam){
    const worldToScreen = w2s;

  if (!smokeWaves.length) return;
  const z = (typeof cam !== "undefined" && cam && typeof cam.zoom==="number") ? cam.zoom : 1;

  // deterministic-ish per-wave rand
  const pr = (seed, n)=>{
    const x = Math.sin((seed + n) * 12.9898) * 43758.5453;
    return x - Math.floor(x);
  };

  for (const w of smokeWaves){
    const p = worldToScreen(w.x, w.y);
    const t = clamp(w.t / Math.max(0.001, w.ttl), 0, 1);
    const ease = 1 - Math.pow(1 - t, 4); // fast -> slow

    // 너무 커지지 않게(건물 크기 대비)
    const R0 = (TILE * 0.10) * z;
    const R1 = (TILE * 1.05 * w.size) * z;
    const R  = R0 + (R1 - R0) * ease;

    // "잔류연기처럼" 흐릿: 라인X, 그라데이션 필
    const aBase = 0.32 * Math.pow(1 - t, 0.60);

    const squash = (w.squash ?? 0.62);
    const th = (TILE * 0.34 * w.size) * z; // 부드러운 두께

    ctx.save();
    ctx.globalCompositeOperation = "source-over";

    // ellipse gradient: scale Y so radial gradient becomes flattened in screen space
    ctx.translate(p.x, p.y);
    ctx.scale(1, squash);

    // 3겹 연무 레이어(살짝 흔들리는)
    for (let k=0;k<3;k++){
      const jx = (pr(w.seed, 10+k)-0.5) * (TILE * 0.09 * w.size) * z;
      const jy = (pr(w.seed, 20+k)-0.5) * (TILE * 0.09 * w.size) * z;
      const rr = 1 + (pr(w.seed, 30+k)-0.5) * 0.07;

      const a = aBase * (0.66 - k*0.16);

      // 깨끗한 라인 방지용 블러
      ctx.shadowColor = "rgba(0,0,0,0.22)";
      ctx.shadowBlur  = 28 * z;

      const inner = Math.max(0, (R*rr) - th*0.55);
      const outer = (R*rr) + th*1.45;

      const g = ctx.createRadialGradient(jx, jy, inner, jx, jy, outer);
      g.addColorStop(0.00, "rgba(0,0,0,0)");
      g.addColorStop(0.42, `rgba(110,110,110,${a*0.10})`);
      g.addColorStop(0.60, `rgba(85,85,85,${a*0.22})`);
      g.addColorStop(0.80, `rgba(70,70,70,${a*0.18})`);
      g.addColorStop(1.00, "rgba(0,0,0,0)");

      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(jx, jy, outer, 0, Math.PI*2);
      ctx.fill();
    }

    // 링 가장자리의 옅은 연무 덩이(연기 느낌)
    ctx.shadowBlur = 18 * z;
    for (let i=0;i<12;i++){
      const ang = (i/12) * (Math.PI*2) + pr(w.seed, 100+i)*0.70;
      const rad = R * (0.86 + pr(w.seed, 130+i)*0.24);

      const x = Math.cos(ang) * rad;
      const y = Math.sin(ang) * rad;

      const r = (TILE * (0.10 + pr(w.seed, 160+i)*0.12) * w.size) * z;
      const a = aBase * 0.14 * (0.6 + pr(w.seed, 190+i)*0.9);

      const g = ctx.createRadialGradient(x, y, 0, x, y, r*2.4);
      g.addColorStop(0.0, `rgba(150,150,150,${a*0.20})`);
      g.addColorStop(0.5, `rgba(90,90,90,${a*0.18})`);
      g.addColorStop(1.0, "rgba(0,0,0,0)");

      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, r*2.4, 0, Math.PI*2);
      ctx.fill();
    }

    ctx.restore();
  }
}

  function drawSmokePuffs(ctx, w2s, cam){
    const worldToScreen = w2s;

    if (!smokePuffs.length) return;
    const z = (typeof cam !== "undefined" && cam && typeof cam.zoom==="number") ? cam.zoom : 1;

    for (const s of smokePuffs){
      const p = worldToScreen(s.x, s.y);
      const t = clamp(s.t / Math.max(0.001, s.ttl), 0, 1);

      const r = (s.r0 + s.grow * t) * z;

      // fade out slowly
      const a = s.a0 * Math.pow(1 - t, 0.65);

      ctx.save();
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = a;

      const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
      g.addColorStop(0.0, "rgba(220,220,220,0.22)");
      g.addColorStop(0.35, "rgba(130,130,130,0.20)");
      g.addColorStop(1.0, "rgba(50,50,50,0.0)");
      ctx.fillStyle = g;

      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI*2);
      ctx.fill();

      ctx.restore();
    }
  }




// ===== Blood particles (infantry death) =====
// - Uses the same "soft radial particle" style as smoke puffs, but tinted red/brown.
// - Two layers:
//   1) bloodStains: ground decal (flattened ellipse) lingering longer
//   2) bloodPuffs : short-lived mist/droplets that spread out and fade

function addBloodBurst(wx, wy, size=1){
  const sz = clamp(size, 0.6, 1.8);
  // Spawn puffs a bit above ground so it feels like it comes from the body, not the floor.
  const BLOOD_PUFF_LIFT = (TILE * 0.32) * sz; // tweak if needed

  // Ground stain (isometric flattened)
  bloodStains.push({
    x: wx, y: wy,
    t: 0,
    ttl: 14 + Math.random()*10,
    size: sz,
    r0: (TILE * (0.12 + Math.random()*0.06)) * sz,
    grow: (TILE * (0.10 + Math.random()*0.06)) * sz,
    a0: 0.26 + Math.random()*0.12,
    squash: 0.56 + Math.random()*0.06
  });

  // Mist/droplet particles
  const N = Math.round(10 + Math.random()*6);
  for (let i=0;i<N;i++){
    const ang = Math.random()*Math.PI*2;
    const spd = (TILE * (0.45 + Math.random()*0.55)) * sz;

    bloodPuffs.push({
      x: wx + (Math.random()*2-1) * TILE*0.06*sz,
      y: (wy - BLOOD_PUFF_LIFT) + (Math.random()*2-1) * TILE*0.06*sz,
      vx: Math.cos(ang)*spd + (Math.random()*2-1)*TILE*0.10*sz,
      vy: Math.sin(ang)*spd + (Math.random()*2-1)*TILE*0.10*sz,
      t: 0,
      ttl: 0.9 + Math.random()*0.8,
      r0: (6 + Math.random()*8) * sz,
      grow: (10 + Math.random()*16) * sz,
      a0: 0.22 + Math.random()*0.18,
      rise: 0,
      vrise: (22 + Math.random()*38) * sz, // screen-space rise (px/s), for a little "splash"
      kind: (Math.random() < 0.45) ? "droplet" : "mist"
    });
  }
}


function drawDustPuffs(ctx, w2s, cam){
  const worldToScreen = w2s;
  if (!dustPuffs.length) return;

  const z = (typeof cam !== "undefined" && cam && typeof cam.zoom==="number") ? cam.zoom : 1;
  ctx.save();
  for (const p of dustPuffs){
    const k = p.t / p.ttl;
    const a = (1-k) * p.a0;
    const r = (p.r0 + p.grow*k) * z;
    const s = worldToScreen(p.x, p.y);

    // Noisy gradient haze (building explosion style-ish)
    const g = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, r*1.55);
    g.addColorStop(0.00, `rgba(255, 235, 200, ${a*0.62})`);
    g.addColorStop(0.45, `rgba(220, 205, 175, ${a*0.34})`);
    g.addColorStop(1.00, `rgba(220, 205, 175, 0)`);

    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(s.x, s.y, r*1.55, r*1.08, 0, 0, Math.PI*2);
    ctx.fill();

    // micro "noise" blobs (deterministic-ish, animated by p.t)
    const n = 7 + ((p.seed*0.17)|0)%5;
    const ph = p.seed*0.031 + p.t*2.2;
    ctx.fillStyle = `rgba(210, 195, 165, ${a*0.22})`;
    for (let j=0;j<n;j++){
      const t = ph + j*1.7;
      const ox = Math.cos(t*1.13) * r * (0.18 + 0.14*Math.sin(t*0.7));
      const oy = Math.sin(t*0.97) * r * (0.14 + 0.10*Math.cos(t*0.9));
      const rr = r * (0.18 + 0.08*Math.sin(t*1.9));
      ctx.beginPath();
      ctx.ellipse(s.x+ox, s.y+oy, rr*1.05, rr*0.85, 0, 0, Math.PI*2);
      ctx.fill();
    }
  }
  ctx.restore();
}

function drawDmgSmokePuffs(ctx, w2s, cam){
  const worldToScreen = w2s;
  if (!dmgSmokePuffs.length) return;

  const z = (typeof cam !== "undefined" && cam && typeof cam.zoom==="number") ? cam.zoom : 1;
  ctx.save();
  for (const p of dmgSmokePuffs){
    const k = p.t / p.ttl;
    const a = (1-k) * p.a0;
    const r = (p.r0 + p.grow*k) * z;
    const s = worldToScreen(p.x, p.y);

    // Small black smoke with noisy gradient
    const g = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, r*1.25);
    g.addColorStop(0.00, `rgba(10, 10, 10, ${a*0.70})`);
    g.addColorStop(0.55, `rgba(55, 55, 55, ${a*0.30})`);
    g.addColorStop(1.00, `rgba(55, 55, 55, 0)`);

    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(s.x, s.y, r*1.10, r*0.95, 0, 0, Math.PI*2);
    ctx.fill();

    const n = 5 + ((p.seed*0.23)|0)%5;
    const ph = p.seed*0.041 + p.t*1.9;
    ctx.fillStyle = `rgba(20, 20, 20, ${a*0.28})`;
    for (let j=0;j<n;j++){
      const t = ph + j*2.1;
      const ox = Math.cos(t*1.02) * r * (0.22 + 0.12*Math.sin(t*0.8));
      const oy = Math.sin(t*0.88) * r * (0.18 + 0.10*Math.cos(t*0.9));
      const rr = r * (0.16 + 0.07*Math.cos(t*1.7));
      ctx.beginPath();
      ctx.ellipse(s.x+ox, s.y+oy, rr*0.95, rr*0.75, 0, 0, Math.PI*2);
      ctx.fill();
    }
  }
  ctx.restore();
}

function updateBlood(dt){
  // Stains
  for (let i=bloodStains.length-1;i>=0;i--){
    const s = bloodStains[i];
    s.t += dt;
    if (s.t >= s.ttl) bloodStains.splice(i,1);
  }

  // Puffs
  for (let i=bloodPuffs.length-1;i>=0;i--){
    const p = bloodPuffs[i];
    p.t += dt;
    if (p.t >= p.ttl){ bloodPuffs.splice(i,1); continue; }

    p.x += p.vx * dt;
    p.y += p.vy * dt;

    // dampen movement
    const damp = Math.pow(0.985, dt*60);
    p.vx *= damp;
    p.vy *= damp;

    // rise is screen-space (used only in draw)
    p.rise += p.vrise * dt;
    p.vrise *= Math.pow(0.94, dt*60);
  }
}

function drawBlood(ctx, w2s, cam){
    const worldToScreen = w2s;

  const z = (typeof cam !== "undefined" && cam && typeof cam.zoom==="number") ? cam.zoom : 1;

  // 1) ground stains (very subtle, long lasting)
  for (const s of bloodStains){
    const p = worldToScreen(s.x, s.y);
    const t = clamp(s.t / Math.max(0.001, s.ttl), 0, 1);
    const a = s.a0 * Math.pow(1 - t, 0.55);
    const r = (s.r0 + s.grow * t) * z;

    ctx.save();
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = a;

    ctx.translate(p.x, p.y);
    ctx.scale(1, s.squash ?? 0.58);

    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
    // darker center, softer edge
    g.addColorStop(0.0, "rgba(80, 0, 0, 0.55)");
    g.addColorStop(0.35, "rgba(60, 0, 0, 0.35)");
    g.addColorStop(1.0, "rgba(0, 0, 0, 0.0)");
    ctx.fillStyle = g;

    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI*2);
    ctx.fill();
    ctx.restore();
  }

  // 2) mist/droplets (short-lived)
  for (const b of bloodPuffs){
    const p = worldToScreen(b.x, b.y);
    const t = clamp(b.t / Math.max(0.001, b.ttl), 0, 1);
    const a = b.a0 * Math.pow(1 - t, 0.70);

    const r = (b.r0 + b.grow * t) * z;
    const yLift = (b.rise || 0) * z;

    ctx.save();
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = a;

    if (b.kind === "droplet"){
      // small, denser blob
      const rr = Math.max(2, r*0.35);
      const g = ctx.createRadialGradient(p.x, p.y - yLift, 0, p.x, p.y - yLift, rr*2.2);
      g.addColorStop(0.0, "rgba(160, 0, 0, 0.65)");
      g.addColorStop(0.45, "rgba(120, 0, 0, 0.28)");
      g.addColorStop(1.0, "rgba(0,0,0,0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(p.x, p.y - yLift, rr*2.2, 0, Math.PI*2);
      ctx.fill();
    } else {
      // misty puff
      const g = ctx.createRadialGradient(p.x, p.y - yLift, 0, p.x, p.y - yLift, r);
      g.addColorStop(0.0, "rgba(120, 0, 0, 0.28)");
      g.addColorStop(0.35, "rgba(70, 0, 0, 0.16)");
      g.addColorStop(1.0, "rgba(0,0,0,0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(p.x, p.y - yLift, r, 0, Math.PI*2);
      ctx.fill();
    }

    ctx.restore();
  }
}



  

// ===== Building Destruction Explosion FX =====
  // Creates a big flash + ground glow + streak sparks + flame plumes (roughly like the screenshot).
  function addBuildingExplosion(b){
    if (!b) return;
    const w = (b.w||0), h = (b.h||0);
    let size = Math.sqrt((w*w+h*h)) / (TILE*1.25);
    size = clamp(size, 2.4, 7.5); // HUGE explosion scale
    const ex = {
      x: b.x, y: b.y,
      t: 0,
      ttl: 1.15,
      size,
      parts: []
    };

    // Streak sparks (fast, thin)
    const sparkN = 54;
    for (let i=0;i<sparkN;i++){
      const ang = (-Math.PI/2) + (Math.random()*Math.PI) + (Math.random()*0.35 - 0.175);
      const spd = 420 + Math.random()*520;
      ex.parts.push({
        kind:"streak",
        x: ex.x + (Math.random()*2-1)*TILE*0.10,
        y: ex.y + (Math.random()*2-1)*TILE*0.10,
        vx: Math.cos(ang)*spd,
        vy: Math.sin(ang)*spd,
        life: 0.28 + Math.random()*0.18,
        ttl: 0.28 + Math.random()*0.18,
        w: 1.2 + Math.random()*1.8
      });
    }

    // Flame plumes (slow, rising)
    const flameN = 34;
    for (let i=0;i<flameN;i++){
      const ang = Math.random()*Math.PI*2;
      const spd = 70 + Math.random()*120;
      ex.parts.push({
        kind:"flame",
        x: ex.x + (Math.random()*2-1)*TILE*0.18,
        y: ex.y + (Math.random()*2-1)*TILE*0.18,
        vx: Math.cos(ang)*spd,
        vy: Math.sin(ang)*spd,
        rise: 160 + Math.random()*190,
        life: 0.65 + Math.random()*0.35,
        ttl: 0.65 + Math.random()*0.35,
        r: 40 + Math.random()*70
      });
    }

    // A few embers (mid speed)
    const emberN = 28;
    for (let i=0;i<emberN;i++){
      const ang = (-Math.PI/2) + (Math.random()*Math.PI);
      const spd = 170 + Math.random()*220;
      ex.parts.push({
        kind:"ember",
        x: ex.x + (Math.random()*2-1)*TILE*0.14,
        y: ex.y + (Math.random()*2-1)*TILE*0.14,
        vx: Math.cos(ang)*spd,
        vy: Math.sin(ang)*spd,
        life: 0.55 + Math.random()*0.25,
        ttl: 0.55 + Math.random()*0.25,
        r: 6 + Math.random()*8
      });
    }

    explosions.push(ex);
  }

  function updateExplosions(dt){
    for (let i=explosions.length-1;i>=0;i--){
      const e = explosions[i];
      e.t += dt;
      for (let j=e.parts.length-1;j>=0;j--){
        const p = e.parts[j];
        p.life -= dt;
        if (p.life<=0){ e.parts.splice(j,1); continue; }
        p.x += p.vx*dt;
        p.y += p.vy*dt;
        // Gravity-ish pull down a bit for sparks/embers
        if (p.kind==="streak" || p.kind==="ember"){
          p.vy += 820*dt;
          p.vx *= (1 - Math.min(1, dt*1.8));
          p.vy *= (1 - Math.min(1, dt*1.2));
        } else if (p.kind==="flame"){
          // Flames drift + rise
          p.vx *= (1 - Math.min(1, dt*1.2));
          p.vy *= (1 - Math.min(1, dt*1.2));
          p.rise *= (1 - Math.min(1, dt*2.6));
        }
      }
      if (e.t >= e.ttl && e.parts.length===0){
        explosions.splice(i,1);
      }
    }
  }

  function drawExplosions(ctx, w2s, cam){
    const worldToScreen = w2s;

    if (!explosions.length) return;
    const z = (typeof cam !== "undefined" && cam && typeof cam.zoom==="number") ? cam.zoom : 1;

    for (const e of explosions){
      const p = worldToScreen(e.x, e.y);
      const k = clamp(1 - (e.t / Math.max(0.001, e.ttl)), 0, 1);

      // Big ground glow (additive)
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = 0.95 * Math.pow(k, 0.55);
      const R = (TILE*2.60*e.size) * z;
      const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, R);
      g.addColorStop(0.0, "rgba(255,255,235,0.92)");
      g.addColorStop(0.28, "rgba(255,220,120,0.70)");
      g.addColorStop(0.62, "rgba(255,170,70,0.28)");
      g.addColorStop(1.0, "rgba(255,140,50,0.0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(p.x, p.y, R, 0, Math.PI*2);
      ctx.fill();

      // Central flash
      ctx.globalAlpha = 0.85 * Math.pow(k, 0.35);
      const R2 = (TILE*1.25*e.size) * z; // HUGE central flash
      const g2 = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, R2);
      g2.addColorStop(0.0, "rgba(255,255,255,0.95)");
      g2.addColorStop(0.5, "rgba(255,245,210,0.55)");
      g2.addColorStop(1.0, "rgba(255,220,140,0.0)");
      ctx.fillStyle = g2;
      ctx.beginPath();
      ctx.arc(p.x, p.y, R2, 0, Math.PI*2);
      ctx.fill();

      // Particles
      for (const prt of e.parts){
        const pp = worldToScreen(prt.x, prt.y);
        const a = clamp(prt.life / Math.max(0.001, prt.ttl), 0, 1);

        if (prt.kind==="streak"){
          // thin streak line
          const len = (TILE*1.40*e.size) * z * (0.7 + (1-a)*1.2);
          const dx = (prt.vx) * 0.006 * z;
          const dy = (prt.vy) * 0.006 * z;
          const norm = Math.hypot(dx,dy) || 1;
          const ux = dx/norm, uy = dy/norm;
          ctx.globalAlpha = 0.70 * a;
          ctx.lineWidth = prt.w * z;
          ctx.strokeStyle = "rgba(255,230,150,1)";
          ctx.beginPath();
          ctx.moveTo(pp.x - ux*len, pp.y - uy*len);
          ctx.lineTo(pp.x + ux*len*0.15, pp.y + uy*len*0.15);
          ctx.stroke();
        } else if (prt.kind==="ember"){
          const rr = (prt.r * z) * (0.35 + (1-a)*0.25);
          ctx.globalAlpha = 0.65 * a;
          const ge = ctx.createRadialGradient(pp.x, pp.y, 0, pp.x, pp.y, rr);
          ge.addColorStop(0, "rgba(255,255,235,0.9)");
          ge.addColorStop(0.5, "rgba(255,200,90,0.55)");
          ge.addColorStop(1, "rgba(255,160,60,0.0)");
          ctx.fillStyle = ge;
          ctx.beginPath();
          ctx.arc(pp.x, pp.y, rr, 0, Math.PI*2);
          ctx.fill();
        } else if (prt.kind==="flame"){
          const lift = (prt.rise * (1-a)) * z * 0.10;
          const rr = (prt.r * z) * (0.75 + (1-a)*0.55);
          ctx.globalAlpha = 0.55 * a;
          const gf = ctx.createRadialGradient(pp.x, pp.y - lift, 0, pp.x, pp.y - lift, rr);
          gf.addColorStop(0, "rgba(255,255,235,0.85)");
          gf.addColorStop(0.35, "rgba(255,210,110,0.62)");
          gf.addColorStop(0.70, "rgba(255,140,60,0.26)");
          gf.addColorStop(1, "rgba(255,120,40,0.0)");
          ctx.fillStyle = gf;
          ctx.beginPath();
          ctx.arc(pp.x, pp.y - lift, rr, 0, Math.PI*2);
          ctx.fill();
        }
      }

      ctx.restore();
    }
  }

  function tickCombatFx(dt, buildings){
    for (let i=impacts.length-1;i>=0;i--){
      const p = impacts[i];
      p.delay = (p.delay||0) - dt;
      if (p.delay > 0) continue;
      p.life -= dt;
      p.x += p.vx*dt;
      p.y += p.vy*dt;
      // quick drag
      p.vx *= (1 - Math.min(1, dt*7.5));
      p.vy *= (1 - Math.min(1, dt*7.5));
      if (p.life<=0) impacts.splice(i,1);
    }
    // Building fire particles when HP is critically low (<30%)
    for (const b of buildings){
      if (b.attackable===false) continue;
      const r = (b.hpMax>0) ? (b.hp/b.hpMax) : 1;
      if (r < 0.30){
        b._fireAcc = (b._fireAcc||0) + dt;
        if (b._fireAcc >= 0.08){
          b._fireAcc = 0;
          const tw = (b.tw||1), th = (b.th||1);
          // spawn near the roof area
          const rx = (Math.random()-0.5) * tw * TILE * 0.55;
          const ry = (Math.random()-0.5) * th * TILE * 0.55;
          fires.push({
            x: b.x + rx, y: b.y + ry,
            vx: (Math.random()*2-1)*12,
            vy: (Math.random()*2-1)*12,
            rise: 18 + Math.random()*26,
            life: 0.55 + Math.random()*0.35
          });
        }
      } else {
        b._fireAcc = 0;
      }
    }

    for (let i=fires.length-1;i>=0;i--){
      const f = fires[i];
      f.life -= dt;
      if (f.life<=0){ fires.splice(i,1); continue; }
      f.x += f.vx*dt; f.y += f.vy*dt;
      f.rise *= (1 - Math.min(1, dt*2.5));
    }

    updateExplosions(dt);

    for (let i=healMarks.length-1;i>=0;i--){
      const h = healMarks[i];
      h.life -= dt;
      if (h.life<=0) healMarks.splice(i,1);
    }

    // shell casings physics (simple hop + fall)
    for (let i=casings.length-1;i>=0;i--){
      const c = casings[i];
      c.delay = (c.delay||0) - dt;
      if (c.delay > 0) continue;

      c.life -= dt;
      c.x += c.vx*dt;
      c.y += c.vy*dt;

      // gravity on z
      c.vz -= 820*dt;
      c.z += c.vz*dt;

      // ground bounce
      if (c.z < 0){
        c.z = 0;
        c.vz *= -0.42;
        c.vx *= 0.78;
        c.vy *= 0.78;
      }

      // air/ground drag
      c.vx *= (1 - Math.min(1, dt*1.6));
      c.vy *= (1 - Math.min(1, dt*1.6));
      c.rot += (c.vx*0.003 + c.vy*0.003);

      if (c.life<=0) casings.splice(i,1);
    }

    for (let i=traces.length-1;i>=0;i--){
      traces[i].delay = (traces[i].delay||0) - dt;
      if (traces[i].delay > 0) continue;
      traces[i].life -= dt;
      if (traces[i].life<=0) traces.splice(i,1);
    }

    for (let i=flashes.length-1;i>=0;i--){
      flashes[i].delay = (flashes[i].delay||0) - dt;
      if (flashes[i].delay > 0) continue;
      flashes[i].life -= dt;
      if (flashes[i].life<=0) flashes.splice(i,1);
    }
  }
  }

  function drawTraces(ctx, w2s, cam){
    const worldToScreen = w2s;
    for (const tr of traces){
      if ((tr.delay||0) > 0) continue;
      const a=worldToScreen(tr.x0,tr.y0);
      const b=worldToScreen(tr.x1,tr.y1);
      let alpha;
      if (tr.kind === "snip"){
        alpha = Math.min(1, tr.life / (tr.maxLife ?? 0.80));
      } else {
        alpha = Math.min(1, tr.life / (tr.kind==="mg" ? 0.14 : 0.09));
      }
      ctx.globalAlpha = alpha;

      if (tr.kind === "mg"){
        // Solid yellow tracer with glow (auto-rifle 느낌: 선이 깜빡이며 나감)
        ctx.save();
        ctx.lineCap = "round";

        // outer glow
        ctx.globalAlpha = alpha*0.85;
        ctx.shadowBlur = 22;
        ctx.shadowColor = "rgba(255, 195, 80, 1.0)";
        ctx.strokeStyle = "rgba(255, 220, 120, 0.70)";
        ctx.lineWidth = 6.2;
        ctx.beginPath(); ctx.moveTo(a.x,a.y); ctx.lineTo(b.x,b.y); ctx.stroke();

        // bright core
        ctx.shadowBlur = 0;
        ctx.globalAlpha = alpha;
        ctx.strokeStyle = "rgba(255, 248, 185, 1.0)";
        ctx.lineWidth = 2.6;
        ctx.beginPath(); ctx.moveTo(a.x,a.y); ctx.lineTo(b.x,b.y); ctx.stroke();

// tiny end-point glint for readability
ctx.globalAlpha = alpha;
ctx.fillStyle = "rgba(255, 245, 200, 1.0)";
ctx.beginPath();
ctx.arc(b.x, b.y, 2.2, 0, Math.PI*2);
ctx.fill();

        ctx.restore();
      } else if (tr.kind === "tmg"){
        // Turret MG tracer: thicker + brighter than infantry tracer
        ctx.save();
        ctx.lineCap = "round";

        // outer glow
        ctx.globalAlpha = alpha*0.95;
        ctx.shadowBlur = 34;
        ctx.shadowColor = "rgba(255, 170, 40, 1.0)";
        ctx.strokeStyle = "rgba(255, 210, 90, 0.85)";
        ctx.lineWidth = 10.5;
        ctx.beginPath(); ctx.moveTo(a.x,a.y); ctx.lineTo(b.x,b.y); ctx.stroke();

        // hot core
        ctx.shadowBlur = 0;
        ctx.globalAlpha = alpha;
        ctx.strokeStyle = "rgba(255, 250, 200, 1.0)";
        ctx.lineWidth = 4.8;
        ctx.beginPath(); ctx.moveTo(a.x,a.y); ctx.lineTo(b.x,b.y); ctx.stroke();

        // end glint
        ctx.globalAlpha = alpha;
        ctx.fillStyle = "rgba(255, 255, 220, 1.0)";
        ctx.beginPath(); ctx.arc(b.x, b.y, 3.0, 0, Math.PI*2); ctx.fill();

        ctx.restore();
      
      } else if (tr.kind === "snip"){
        // Sniper: glowing team-colored beam with thicker stroke + long afterimage
        ctx.save();
        ctx.lineCap = "round";
        const isP = (tr.team===TEAM.PLAYER);
        const glow = isP ? "rgba(0, 160, 255, 1.0)" : "rgba(255, 60, 60, 1.0)";
        const mid  = isP ? "rgba(0, 140, 255, 0.75)" : "rgba(255, 70, 70, 0.75)";
        const core = "rgba(255, 255, 255, 1.0)";

        // outer glow
        ctx.globalAlpha = alpha*0.80;
        ctx.shadowBlur = 28;
        ctx.shadowColor = glow;
        ctx.strokeStyle = mid;
        ctx.lineWidth = 7.2;
        ctx.beginPath(); ctx.moveTo(a.x,a.y); ctx.lineTo(b.x,b.y); ctx.stroke();

        // bright core
        ctx.shadowBlur = 0;
        ctx.globalAlpha = alpha;
        ctx.strokeStyle = core;
        ctx.lineWidth = 3.2;
        ctx.beginPath(); ctx.moveTo(a.x,a.y); ctx.lineTo(b.x,b.y); ctx.stroke();

        // end glint for readability
        ctx.globalAlpha = alpha;
        ctx.fillStyle = core;
        ctx.beginPath();
        ctx.arc(b.x, b.y, 3.2, 0, Math.PI*2);
        ctx.fill();

        ctx.restore();

      } else if (tr.kind === "impE"){
        // impact ellipse dodge (isometric)
        const c = worldToScreen(tr.x0, tr.y0);
        const range = tr.fx?.range ?? 48;
        const px = worldToScreen(tr.x0 + range, tr.y0);
        const py = worldToScreen(tr.x0, tr.y0 + range);
        const rx = Math.abs(px.x - c.x);
        const ry = Math.abs(py.y - c.y);

        ctx.save();
        ctx.beginPath();
        ctx.ellipse(c.x, c.y, rx, ry, 0, 0, Math.PI*2);

        ctx.fillStyle = (tr.team===TEAM.PLAYER) ? "rgba(255, 200, 90, 0.16)" : "rgba(255, 200, 90, 0.16)";
        ctx.strokeStyle = "rgba(255, 210, 110, 0.88)";
        ctx.lineWidth = tr.fx?.strokeW ?? 4.6;
        ctx.shadowBlur = 22;
        ctx.shadowColor = "rgba(255, 170, 60, 1.0)";
        ctx.fill();
        ctx.stroke();
        ctx.restore();
} else {
        ctx.strokeStyle=(tr.team===TEAM.PLAYER) ? "rgba(255,255,255,0.85)" : "rgba(255,210,210,0.85)";
        ctx.lineWidth=1.6;
        ctx.beginPath(); ctx.moveTo(a.x,a.y); ctx.lineTo(b.x,b.y); ctx.stroke();
      }

      ctx.globalAlpha=1;
    }
  }

  function drawFlashes(ctx, w2s, cam){
    const worldToScreen = w2s;
    for (const f of flashes){
      if ((f.delay||0) > 0) continue;
      const p=worldToScreen(f.x,f.y);
      const a = Math.min(1, f.life/0.06);
      ctx.globalAlpha = a;
      const r = f.r;
      const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
      g.addColorStop(0, "rgba(255, 245, 200, 0.95)");
      g.addColorStop(0.25, "rgba(255, 220, 120, 0.55)");
      g.addColorStop(1, "rgba(255, 200, 80, 0.0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI*2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }

  function drawCasings(ctx, w2s, cam){
    const worldToScreen = w2s;
    for (const c of casings){
      if ((c.delay||0) > 0) continue;
      const p=worldToScreen(c.x, c.y);
      const y = p.y - (c.z||0)*0.18; // lift a bit while in air
      const a = Math.min(1, c.life/0.35);
      ctx.save();
      ctx.globalAlpha = a*0.95;
      ctx.translate(p.x, y);
      ctx.rotate(c.rot||0);
      // subtle glow for visibility
      ctx.shadowBlur = 8;
      ctx.shadowColor = "rgba(255, 210, 110, 0.55)";
      ctx.fillStyle = "rgba(255, 200, 90, 0.95)";
      ctx.fillRect(-(c.w||4)/2, -(c.h||2)/2, (c.w||4), (c.h||2));
      ctx.restore();
      ctx.globalAlpha = 1;
    }
  }

  function drawFires(ctx, w2s, cam){
    const worldToScreen = w2s;
    for (const f of fires){
      const p = worldToScreen(f.x, f.y);
      const a = clamp(f.life/0.6, 0, 1);
      const z = (typeof cam !== "undefined" && cam && typeof cam.zoom==="number") ? cam.zoom : 1;
      ctx.globalAlpha = a;
      // flame pillar (zoom-consistent)
      const h = (16 + f.rise*0.6) * z;
      ctx.fillStyle = "rgba(255, 120, 20, 0.95)";
      ctx.fillRect(p.x-1.6*z, p.y-h, 3.2*z, h);
      ctx.fillStyle = "rgba(255, 200, 80, 0.95)";
      ctx.fillRect(p.x-0.9*z, p.y-h*0.72, 1.8*z, h*0.72);
      ctx.globalAlpha = 1;
    }
  }

  function drawImpacts(ctx, w2s, cam){
    const worldToScreen = w2s;
    for (const p0 of impacts){
      const p=worldToScreen(p0.x,p0.y);
      ctx.globalAlpha = Math.min(1, p0.life/0.22);
      ctx.fillStyle = "rgba(255, 210, 90, 0.95)";
      ctx.fillRect(p.x-1.4, p.y-1.4, 2.8, 2.8);
      ctx.globalAlpha = 1;
    }
  }

  function drawHealMarks(ctx, w2s, cam){
    const worldToScreen = w2s;
    for (const h of healMarks){
      const p = worldToScreen(h.x, h.y);
      const a = Math.min(1, h.life/0.45);
      const s = 10 + (1-a)*6;
      ctx.save();
      ctx.globalAlpha = a;
      ctx.strokeStyle = "rgba(255,255,255,0.85)";
      ctx.lineWidth = 3.2;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y - s);
      ctx.lineTo(p.x, p.y + s);
      ctx.moveTo(p.x - s, p.y);
      ctx.lineTo(p.x + s, p.y);
      ctx.stroke();
      ctx.strokeStyle = "rgba(220,40,40,0.95)";
      ctx.lineWidth = 2.0;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y - s);
      ctx.lineTo(p.x, p.y + s);
      ctx.moveTo(p.x - s, p.y);
      ctx.lineTo(p.x + s, p.y);
      ctx.stroke();
      ctx.restore();
    }
  }


  window.FX = {
    setTile,
    traces, impacts, fires, explosions, healMarks, flashes, casings, repairWrenches,
    smokeWaves, smokePuffs, smokeEmitters, dustPuffs, dmgSmokePuffs,
    bloodStains, bloodPuffs,

    addSmokeWave, spawnSmokePuff, spawnSmokeHaze, addSmokeEmitter, spawnDustPuff, spawnDmgSmokePuff,
    updateSmoke, drawSmokeWaves, drawSmokePuffs, drawDustPuffs, drawDmgSmokePuffs,

    addBloodBurst, updateBlood, drawBlood,

    addBuildingExplosion, updateExplosions, drawExplosions,

    tickCombatFx,
    drawTraces, drawFlashes, drawCasings, drawFires, drawImpacts, drawHealMarks,
  };
})();
