'use strict';
// fx_explosions.js - split FX module
// Loaded after fx_core.js
(function(){
  'use strict';
  const FX = window.FX = window.FX || {};
  FX._setTileHooks = FX._setTileHooks || [];
  let TILE = FX.TILE || 64;
  FX._setTileHooks.push((t)=>{ TILE = t || TILE; });
  function clamp(v,a,b){ return Math.max(a, Math.min(b, v)); }

  const explosions = FX.explosions = FX.explosions || [];

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

  Object.assign(FX, {
    explosions,
    addBuildingExplosion, updateExplosions, drawExplosions
  });
})();


// ES module scope: expose legacy globals expected by bullet_system.js
try { if (typeof window !== 'undefined' && typeof updateExplosions === 'function') window.updateExplosions = updateExplosions; } catch(e) {}
