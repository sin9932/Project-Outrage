// render.js
// Minimap renderer split from game.js (Step 1)
(function(){
  "use strict";

  function drawMini(env){
    if (!env) return;
    const {
      fitMini, mmCanvas, mmCtx, TEAM, WORLD_W, WORLD_H, MAP_W, MAP_H, TILE,
      explored, visible, ore, units, buildings, state,
      idx, inMap, tileOfX, tileOfY, hasRadarAlive, isUnderPower, drawMinimapNoise
    } = env;

    if (typeof fitMini === "function") fitMini();
    if (!mmCanvas || !mmCtx) return;

    const W=mmCanvas.width, H=mmCanvas.height;
    mmCtx.clearRect(0,0,W,H);

    const radar = hasRadarAlive && hasRadarAlive(TEAM.PLAYER);
    const radarOff = !radar;
    if (radarOff){
      mmCtx.fillStyle="rgba(0,0,0,0.55)";
      mmCtx.fillRect(0,0,W,H);
      mmCtx.fillStyle="rgba(255,210,110,0.8)";
      mmCtx.font="bold 12px system-ui";
      mmCtx.fillText("RADAR REQUIRED", 10, 20);
      return;
    }

    const lowPower = isUnderPower && isUnderPower(TEAM.PLAYER);
    if (lowPower){
      if (typeof drawMinimapNoise === "function") drawMinimapNoise(W,H);
      return;
    }

    const sx=W/WORLD_W, sy=H/WORLD_H;

    mmCtx.fillStyle="rgba(0,0,0,0.35)";
    mmCtx.fillRect(0,0,W,H);

    mmCtx.fillStyle="rgba(0,0,0,0.55)";
    for (let ty=0; ty<MAP_H; ty+=2){
      for (let tx=0; tx<MAP_W; tx+=2){
        if (!explored[TEAM.PLAYER][idx(tx,ty)]) {
          mmCtx.fillRect(tx*TILE*sx, ty*TILE*sy, 2*TILE*sx, 2*TILE*sy);
        }
      }
    }

    // Ore dots on minimap (only where explored)
    mmCtx.fillStyle = "rgba(255,170,40,0.95)";
    for (let ty=0; ty<MAP_H; ty+=2){
      for (let tx=0; tx<MAP_W; tx+=2){
        const ii = idx(tx,ty);
        if (!explored[TEAM.PLAYER][ii]) continue;
        if (ore[ii] > 0){
          mmCtx.fillRect((tx*TILE+TILE*0.5)*sx-1, (ty*TILE+TILE*0.5)*sy-1, 2, 2);
        }
      }
    }

    for (const u of units){
      if (!u.alive) continue;
      const tx=tileOfX(u.x), ty=tileOfY(u.y);
      if (u.team===TEAM.ENEMY){
        if (radarOff) continue;
        if (inMap(tx,ty) && !explored[TEAM.PLAYER][idx(tx,ty)]) continue;
      }
      mmCtx.fillStyle = (u.team===TEAM.PLAYER) ? state.colors.player : state.colors.enemy;
      mmCtx.fillRect(u.x*sx-1, u.y*sy-1, 2, 2);
    }

    for (const b of buildings){
      if (!b.alive || b.civ) continue;
      if (b.team===TEAM.ENEMY){ if (radarOff) continue; if (!explored[TEAM.PLAYER][idx(b.tx,b.ty)]) continue; }
      mmCtx.fillStyle = (b.team===TEAM.PLAYER) ? state.colors.player : state.colors.enemy;
      mmCtx.fillRect(b.x*sx-2, b.y*sy-2, 4, 4);
    }

    // Blinking purple dot on minimap for recently hit player assets (4s)
    if (state.attackEvents && state.attackEvents.length){
      const now = state.t;
      const blinkA = 0.35 + 0.65*(0.5+0.5*Math.sin(now*10.0));
      for (let i=0;i<state.attackEvents.length;i++){
        const ev = state.attackEvents[i];
        if (!ev || now > (ev.until||-1e9)) continue;
        const px = ev.x * sx;
        const py = ev.y * sy;
        mmCtx.fillStyle = `rgba(200,0,255,${blinkA})`;
        mmCtx.beginPath();
        mmCtx.arc(px, py, 4.2, 0, Math.PI*2);
        mmCtx.fill();
        mmCtx.strokeStyle = `rgba(200,0,255,${0.25*blinkA})`;
        mmCtx.lineWidth = 2;
        mmCtx.beginPath();
        mmCtx.arc(px, py, 7.5, 0, Math.PI*2);
        mmCtx.stroke();
      }
    }

    // Attack alert triangle FX (player assets hit)
    if (state.alertFx && state.alertFx.length){
      const now = state.t;
      const dur = 1.5;
      for (let i=state.alertFx.length-1;i>=0;i--){
        const fx = state.alertFx[i];
        const age = now - fx.t0;
        if (age > dur){ state.alertFx.splice(i,1); continue; }
        const p = 1 - (age/dur);
        const cx = fx.x * sx;
        const cy = fx.y * sy;

        const base = 34;
        const scale = 0.22 + 2.45*p;
        const rot = age * 1.35;

        const perimPt = (f)=>{
          f = (f%1+1)%1;
          const L = base*2;
          const P = L*4;
          let d = f*P;
          if (d < L) return {x:-base + d, y:-base};
          d -= L;
          if (d < L) return {x:base, y:-base + d};
          d -= L;
          if (d < L) return {x:base - d, y:base};
          d -= L;
          return {x:-base, y:base - d};
        };

        mmCtx.save();
        mmCtx.translate(cx, cy);
        mmCtx.rotate(rot);
        mmCtx.scale(scale, scale);

        const a = (0.25 + 0.75*p);
        mmCtx.strokeStyle = `rgba(200,0,255,${a})`;
        mmCtx.lineWidth = 4.6;
        mmCtx.beginPath();
        mmCtx.rect(-base, -base, base*2, base*2);
        mmCtx.stroke();

        const spd = 0.95;
        const f1 = (age*spd) % 1;
        const f2 = (1 - ((age*spd + 0.37) % 1));
        const dotR = 4.2;

        const drawDotTrail = (f, dir)=>{
          for (let k=7;k>=0;k--){
            const ff = f - dir*(k*0.018);
            const pt = perimPt(ff);
            const aa = (0.06 + 0.14*p) * (k/8);
            mmCtx.fillStyle = `rgba(255,255,255,${aa})`;
            mmCtx.beginPath();
            mmCtx.arc(pt.x, pt.y, dotR*(0.55 + 0.45*(k/8)), 0, Math.PI*2);
            mmCtx.fill();
          }
          const pt = perimPt(f);
          mmCtx.fillStyle = `rgba(255,255,255,${0.78 + 0.18*p})`;
          mmCtx.beginPath();
          mmCtx.arc(pt.x, pt.y, dotR, 0, Math.PI*2);
          mmCtx.fill();
        };

        drawDotTrail(f1, +1);
        drawDotTrail(f2, -1);

        mmCtx.restore();
      }
    }
  }

  window.OURender = window.OURender || {};
  window.OURender.drawMini = drawMini;
})();
