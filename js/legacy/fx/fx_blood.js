'use strict';
// fx_blood.js - split FX module
// Loaded after fx_core.js
(function(){
  'use strict';
  const FX = window.FX = window.FX || {};
  FX._setTileHooks = FX._setTileHooks || [];
  let TILE = FX.TILE || 64;
  FX._setTileHooks.push((t)=>{ TILE = t || TILE; });
  function clamp(v,a,b){ return Math.max(a, Math.min(b, v)); }

  const bloodStains = FX.bloodStains = FX.bloodStains || [];
  const bloodPuffs = FX.bloodPuffs = FX.bloodPuffs || [];

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

  Object.assign(FX, {
    bloodStains, bloodPuffs,
    addBloodBurst, updateBlood, drawBlood
  });
})();
