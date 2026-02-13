/* fx_smoke.js
   Smoke waves + smoke puffs + dust puffs + damage smoke.
   This file is intentionally standalone and binds to game deps at runtime.
*/
(function(){
  "use strict";
  window.PO = window.PO || {};
  const FX = {};

  let _deps = {};
  let TILE = 64;

  // Bind dependencies from game.js once they exist.
  FX.bind = function(deps){
    _deps = deps || {};
    if (typeof _deps.TILE === "number" && _deps.TILE > 0) TILE = _deps.TILE;
  };

  function clamp(v,a,b){
    if (_deps && typeof _deps.clamp === "function") return _deps.clamp(v,a,b);
    return Math.max(a, Math.min(b, v));
  }
  function worldToScreen(wx, wy){
    if (_deps && typeof _deps.worldToScreen === "function") return _deps.worldToScreen(wx, wy);
    return { x: wx, y: wy };
  }
  const cam = {
    get zoom(){
      try{
        const c = (_deps && typeof _deps.getCam === "function") ? _deps.getCam() : null;
        const z = c && typeof c.zoom === "number" ? c.zoom : 1;
        return z || 1;
      }catch(_e){ return 1; }
    }
  };

// ===== Smoke ring + smoke particles (building destruction) =====
// 목표:
// - 파동 연기: "원형으로 퍼지되", 아이소메트리라서 위아래 납작 + 라인 없이 흐릿한 연무 타입
// - 파티클/폭발을 가리지 않도록 렌더 순서는 최하위(지형 위, 폭발/파편 아래)
const smokeWaves = [];
const smokePuffs = [];
const smokeEmitters = [];

// Extra ground FX for vehicles
const dustPuffs = [];
const dmgSmokePuffs = [];

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
    a0: 0.48 + Math.random()*0.18
  });
}

// Damage smoke from a crippled unit (from turret area). World-positioned.
function spawnDmgSmokePuff(wx, wy, strength=1){
  const size = clamp(strength, 0.6, 2.4);
  const spread = TILE * 0.22 * size;
  const ang = Math.random() * Math.PI * 2;
  const rad = Math.sqrt(Math.random()) * spread;
  const x = wx + Math.cos(ang) * rad;
  const y = wy + Math.sin(ang) * rad;

  dmgSmokePuffs.push({
    x, y,
    vx: (Math.random()*2-1)*(TILE*0.03*size),
    vy: (Math.random()*2-1)*(TILE*0.03*size) - (TILE*0.02*size),
    t: 0,
    ttl: 1.55 + Math.random()*0.75,
    r0: (10 + Math.random()*10) * size,
    grow: (48 + Math.random()*40) * size,
    a0: 0.10 + Math.random()*0.06
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

function drawSmokeWaves(ctx){
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

  function drawSmokePuffs(ctx){
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




function drawDustPuffs(ctx){
  if (!dustPuffs.length) return;
  const z = (typeof cam !== "undefined" && cam && typeof cam.zoom==="number") ? cam.zoom : 1;
  ctx.save();
  for (const p of dustPuffs){
    const k = p.t / p.ttl;
    const a = (1-k) * p.a0;
    const r = (p.r0 + p.grow*k) * z;
    const s = worldToScreen(p.x, p.y);
    // sandy haze
    ctx.fillStyle = `rgba(220, 205, 175, ${a})`;
    ctx.beginPath();
    ctx.ellipse(s.x, s.y, r*1.45, r*1.00, 0, 0, Math.PI*2);
    ctx.fill();
  }
  ctx.restore();
}

function drawDmgSmokePuffs(ctx){
  if (!dmgSmokePuffs.length) return;
  const z = (typeof cam !== "undefined" && cam && typeof cam.zoom==="number") ? cam.zoom : 1;
  ctx.save();
  for (const p of dmgSmokePuffs){
    const k = p.t / p.ttl;
    const a = (1-k) * p.a0;
    const r = (p.r0 + p.grow*k) * z;
    const s = worldToScreen(p.x, p.y);
    ctx.fillStyle = `rgba(160, 160, 160, ${a})`;
    ctx.beginPath();
    ctx.ellipse(s.x, s.y, r*1.05, r*0.95, 0, 0, Math.PI*2);
    ctx.fill();
  }
  ctx.restore();
}


  // Exports
  FX.addSmokeWave = (typeof addSmokeWave === "function") ? addSmokeWave : undefined;
  FX.addSmokeEmitter = (typeof addSmokeEmitter === "function") ? addSmokeEmitter : undefined;
  FX.spawnSmokePuff = (typeof spawnSmokePuff === "function") ? spawnSmokePuff : undefined;
  FX.spawnSmokeHaze = (typeof spawnSmokeHaze === "function") ? spawnSmokeHaze : undefined;
  FX.spawnDustPuff = (typeof spawnDustPuff === "function") ? spawnDustPuff : undefined;
  FX.spawnDmgSmokePuff = (typeof spawnDmgSmokePuff === "function") ? spawnDmgSmokePuff : undefined;
  FX.update = (typeof updateSmoke === "function") ? updateSmoke : undefined;

  FX.drawWaves = (typeof drawSmokeWaves === "function") ? drawSmokeWaves : undefined;
  FX.drawPuffs = (typeof drawSmokePuffs === "function") ? drawSmokePuffs : undefined;
  FX.drawDust = (typeof drawDustPuffs === "function") ? drawDustPuffs : undefined;
  FX.drawDmg = (typeof drawDmgSmokePuffs === "function") ? drawDmgSmokePuffs : undefined;

  window.PO.fxSmoke = FX;
})();
