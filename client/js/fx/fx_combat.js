'use strict';
// fx_combat.js - split FX module
// Loaded after fx_core.js
(function(){
  'use strict';
  const FX = window.FX = window.FX || {};
  FX._setTileHooks = FX._setTileHooks || [];
  let TILE = FX.TILE || 64;
  FX._setTileHooks.push((t)=>{ TILE = t || TILE; });
  function clamp(v,a,b){ return Math.max(a, Math.min(b, v)); }

  const traces = FX.traces = FX.traces || [];
  const impacts = FX.impacts = FX.impacts || [];
  const fires = FX.fires = FX.fires || [];
  const healMarks = FX.healMarks = FX.healMarks || [];
  const flashes = FX.flashes = FX.flashes || [];
  const casings = FX.casings = FX.casings || [];
  const repairWrenches = FX.repairWrenches = FX.repairWrenches || [];

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

  Object.assign(FX, {
    traces, impacts, fires, healMarks, flashes, casings, repairWrenches,
    tickCombatFx, drawTraces, drawFlashes, drawCasings, drawFires, drawImpacts, drawHealMarks
  });
})();
