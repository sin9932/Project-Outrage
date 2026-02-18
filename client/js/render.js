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

  let canvas, ctx, cam, state, TEAM, MAP_W, MAP_H, TILE, ISO_X, ISO_Y;
  let terrain, ore, explored, visible, BUILD, DEFENSE, BUILD_SPRITE, NAME_KO, POWER;
  let worldToScreen, tileToWorldCenter, idx, inMap, clamp, getEntityById;
  let REPAIR_WRENCH_IMG, repairWrenches;
  let EXP1_IMG, EXP1_FRAMES, EXP1_PIVOT_X, EXP1_PIVOT_Y, EXP1_Y_OFFSET, exp1Fxs;
  let smokeWaves, smokePuffs, dustPuffs, dmgSmokePuffs, bloodStains, bloodPuffs;
  let explosions;

  function bindEnv(env){
    canvas = env.canvas; ctx = env.ctx; cam = env.cam; state = env.state;
    TEAM = env.TEAM; MAP_W = env.MAP_W; MAP_H = env.MAP_H; TILE = env.TILE; ISO_X = env.ISO_X; ISO_Y = env.ISO_Y;
    terrain = env.terrain; ore = env.ore; explored = env.explored; visible = env.visible;
    BUILD = env.BUILD; DEFENSE = env.DEFENSE; BUILD_SPRITE = env.BUILD_SPRITE; NAME_KO = env.NAME_KO; POWER = env.POWER;
    worldToScreen = env.worldToScreen; tileToWorldCenter = env.tileToWorldCenter; idx = env.idx; inMap = env.inMap;
    clamp = env.clamp; getEntityById = env.getEntityById;
    REPAIR_WRENCH_IMG = env.REPAIR_WRENCH_IMG; repairWrenches = env.repairWrenches || [];
    EXP1_IMG = env.EXP1_IMG; EXP1_FRAMES = env.EXP1_FRAMES;
    EXP1_PIVOT_X = env.EXP1_PIVOT_X; EXP1_PIVOT_Y = env.EXP1_PIVOT_Y; EXP1_Y_OFFSET = env.EXP1_Y_OFFSET;
    exp1Fxs = env.exp1Fxs || [];
    smokeWaves = env.smokeWaves || []; smokePuffs = env.smokePuffs || [];
    dustPuffs = env.dustPuffs || []; dmgSmokePuffs = env.dmgSmokePuffs || [];
    bloodStains = env.bloodStains || []; bloodPuffs = env.bloodPuffs || [];
    explosions = env.explosions || [];
  }

  function drawIsoTile(tx,ty,type){
    const c=tileToWorldCenter(tx,ty);
    const wx=c.x, wy=c.y;
    const p=worldToScreen(wx,wy);
    const x=p.x, y=p.y;

    ctx.beginPath();
    const ox=ISO_X*cam.zoom, oy=ISO_Y*cam.zoom;

    ctx.moveTo(x, y-oy);
    ctx.lineTo(x+ox, y);
    ctx.lineTo(x, y+oy);
    ctx.lineTo(x-ox, y);
    ctx.closePath();

    ctx.fillStyle = (type===1) ? "#101621" : "#0c121a";
    ctx.fill();

    if (ore[idx(tx,ty)]>0){
      const a=clamp(ore[idx(tx,ty)]/520,0,1);
      ctx.fillStyle=`rgba(255,215,0,${0.10+0.28*a})`;
      ctx.fill();
    }

    ctx.strokeStyle="rgba(255,255,255,0.035)";
    ctx.stroke();
  }

  function drawFootprintDiamond(b, fill, stroke){
    const tx0=b.tx, ty0=b.ty, tx1=b.tx+b.tw, ty1=b.ty+b.th;
    const c0=worldToScreen(tx0*TILE, ty0*TILE);
    const c1=worldToScreen(tx1*TILE, ty0*TILE);
    const c2=worldToScreen(tx1*TILE, ty1*TILE);
    const c3=worldToScreen(tx0*TILE, ty1*TILE);

    ctx.beginPath();
    ctx.moveTo(c0.x,c0.y);
    ctx.lineTo(c1.x,c1.y);
    ctx.lineTo(c2.x,c2.y);
    ctx.lineTo(c3.x,c3.y);
    ctx.closePath();

    ctx.fillStyle=fill;
    ctx.strokeStyle=stroke;
    ctx.lineWidth=2;
    ctx.fill();
    ctx.stroke();
  }

  function drawFootprintPrism(b, fill, stroke){
    const tx0=b.tx, ty0=b.ty, tx1=b.tx+b.tw, ty1=b.ty+b.th;

    const p0=worldToScreen(tx0*TILE, ty0*TILE);
    const p1=worldToScreen(tx1*TILE, ty0*TILE);
    const p2=worldToScreen(tx1*TILE, ty1*TILE);
    const p3=worldToScreen(tx0*TILE, ty1*TILE);

    const level = (BUILD[b.kind] && typeof BUILD[b.kind].hLevel === "number") ? BUILD[b.kind].hLevel : 2;
    const unitH = 34 * cam.zoom;
    const h = Math.max(0, level) * unitH;

    const t0={x:p0.x, y:p0.y-h};
    const t1={x:p1.x, y:p1.y-h};
    const t2={x:p2.x, y:p2.y-h};
    const t3={x:p3.x, y:p3.y-h};

    ctx.save();
    ctx.globalAlpha = 0.85;
    ctx.beginPath();
    ctx.moveTo(p0.x,p0.y);
    ctx.lineTo(p1.x,p1.y);
    ctx.lineTo(p2.x,p2.y);
    ctx.lineTo(p3.x,p3.y);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.fillStyle = fill;

    ctx.globalAlpha = 0.45;
    ctx.beginPath();
    ctx.moveTo(p1.x,p1.y);
    ctx.lineTo(p2.x,p2.y);
    ctx.lineTo(t2.x,t2.y);
    ctx.lineTo(t1.x,t1.y);
    ctx.closePath();
    ctx.fill();

    ctx.globalAlpha = 0.42;
    ctx.beginPath();
    ctx.moveTo(p2.x,p2.y);
    ctx.lineTo(p3.x,p3.y);
    ctx.lineTo(t3.x,t3.y);
    ctx.lineTo(t2.x,t2.y);
    ctx.closePath();
    ctx.fill();

    ctx.restore();

    ctx.beginPath();
    ctx.moveTo(t0.x,t0.y);
    ctx.lineTo(t1.x,t1.y);
    ctx.lineTo(t2.x,t2.y);
    ctx.lineTo(t3.x,t3.y);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 2;
    ctx.fill();
    ctx.stroke();

    ctx.save();
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(p0.x,p0.y); ctx.lineTo(t0.x,t0.y);
    ctx.moveTo(p1.x,p1.y); ctx.lineTo(t1.x,t1.y);
    ctx.moveTo(p2.x,p2.y); ctx.lineTo(t2.x,t2.y);
    ctx.moveTo(p3.x,p3.y); ctx.lineTo(t3.x,t3.y);
    ctx.stroke();

    ctx.globalAlpha = 0.9;
    ctx.beginPath();
    ctx.moveTo(p0.x,p0.y);
    ctx.lineTo(p1.x,p1.y);
    ctx.lineTo(p2.x,p2.y);
    ctx.lineTo(p3.x,p3.y);
    ctx.closePath();
    ctx.stroke();
    ctx.restore();
  }

  function drawFootprintTiles(tx, ty, tw, th, mask, okFill, badFill, okStroke, badStroke){
    let k=0;
    for (let y=0; y<th; y++){
      for (let x=0; x<tw; x++){
        const ttx=tx+x, tty=ty+y;
        const blocked = mask ? (mask[k]===1) : false;
        k++;
        const p=worldToScreen((ttx+0.5)*TILE, (tty+0.5)*TILE);
        ctx.beginPath();
        ctx.moveTo(p.x, p.y-ISO_Y);
        ctx.lineTo(p.x+ISO_X, p.y);
        ctx.lineTo(p.x, p.y+ISO_Y);
        ctx.lineTo(p.x-ISO_X, p.y);
        ctx.closePath();
        ctx.fillStyle = blocked ? badFill : okFill;
        ctx.strokeStyle = blocked ? badStroke : okStroke;
        ctx.lineWidth = 2;
        ctx.fill();
        ctx.stroke();
      }
    }
  }

  function rgbaFrom(hexOrRgba, alpha){
    if (!hexOrRgba) return `rgba(255,255,255,${alpha})`;
    if (hexOrRgba.startsWith("rgba")) return hexOrRgba.replace(/rgba\(([^)]+),\s*([0-9.]+)\)/, (m, body) => `rgba(${body}, ${alpha})`);
    if (hexOrRgba.startsWith("#") && hexOrRgba.length===7){
      const r=parseInt(hexOrRgba.slice(1,3),16);
      const g=parseInt(hexOrRgba.slice(3,5),16);
      const b=parseInt(hexOrRgba.slice(5,7),16);
      return `rgba(${r},${g},${b},${alpha})`;
    }
    return `rgba(255,255,255,${alpha})`;
  }

  function drawRangeEllipseWorld(cx, cy, range, color, ringOpt=null){
    const p0 = worldToScreen(cx, cy);
    const px = worldToScreen(cx + range, cy);
    const py = worldToScreen(cx, cy + range);

    const rx = Math.abs(px.x - p0.x);
    const ry = Math.abs(py.y - p0.y);

    const fillA = ringOpt?.alphaFill ?? 0.08;
    const strokeA = ringOpt?.alphaStroke ?? 0.75;
    const strokeW = ringOpt?.strokeW ?? 3.0;

    ctx.save();
    ctx.beginPath();
    ctx.ellipse(p0.x, p0.y, rx, ry, 0, 0, Math.PI*2);

    ctx.fillStyle = rgbaFrom(color, fillA);
    ctx.strokeStyle = rgbaFrom(color, strokeA);
    ctx.lineWidth = strokeW;
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  function drawSelectionEllipseAt(ent){
    const col = (ent.team===TEAM.PLAYER) ? "#28ff6a" : "#ff2a2a";
    const ringOpt = { alphaFill: 0.0, alphaStroke: 0.95, strokeW: 3.0 };
    const base = (ent.kind==="infantry" || ent.kind==="engineer" || ent.kind==="sniper") ? TILE*0.26 : TILE*0.34;
    drawRangeEllipseWorld(ent.x, ent.y, base, col, ringOpt);
  }

  function drawHpBlocksAtScreen(px, py, blocks, ratio){
    const z = (typeof cam !== "undefined" && cam && typeof cam.zoom==="number") ? cam.zoom : 1;
    const w = 10 * z;
    const h = 8 * z;
    const gap = 3 * z;

    const filled = Math.max(0, Math.min(blocks, Math.round(blocks * ratio)));
    const totalW = blocks*w + (blocks-1)*gap;

    const x0 = px - totalW/2;
    const y0 = py;

    ctx.save();
    ctx.fillStyle = "rgba(0,0,0,0.45)";
    for (let i=0;i<blocks;i++){
      const x = x0 + i*(w+gap);
      ctx.fillRect(x, y0, w, h);
    }
    const fillColor = (ratio < 0.20) ? "rgba(255,70,60,0.95)"
                    : (ratio < 0.50) ? "rgba(255,220,70,0.95)"
                    : "rgba(40,255,90,0.95)";
    ctx.fillStyle = fillColor;
    for (let i=0;i<filled;i++){
      const x = x0 + i*(w+gap);
      ctx.fillRect(x, y0, w, h);
    }
    ctx.restore();
  }

  function drawUnitHpBlocks(ent, p){
    const isInf = (ent.kind==="infantry" || ent.kind==="engineer" || ent.kind==="sniper");
    const blocks = isInf ? 5 : 10;
    const ratio = clamp(ent.hp/ent.hpMax, 0, 1);

    const z = (typeof cam !== "undefined" && cam && typeof cam.zoom==="number") ? cam.zoom : 1;
    const y = p.y + (isInf ? 22*z : 24*z);
    drawHpBlocksAtScreen(p.x, y, blocks, ratio);
  }

  function drawLabel(text,x,y){
    ctx.font="12px system-ui";
    ctx.textAlign="center";
    ctx.textBaseline="middle";
    ctx.lineWidth=3;
    ctx.strokeStyle="rgba(0,0,0,0.68)";
    ctx.strokeText(text,x,y);
    ctx.fillStyle="rgba(255,255,255,0.92)";
    ctx.fillText(text,x,y);
  }

  function drawWrenchFx(){
    const img = REPAIR_WRENCH_IMG;
    if (!img) return;

    const TILEPX = 602;
    const COLS = 3;
    const FRAMES = 7;
    const frameDur = 0.060;

    for (let i=repairWrenches.length-1;i>=0;i--){
      const fx = repairWrenches[i];
      const age = state.t - fx.t0;
      const ttl = fx.ttl || 0.7;
      const since = state.t - ((fx.last!=null)?fx.last:fx.t0);
      const linger = 0.22;
      if (since > linger){ repairWrenches.splice(i,1); continue; }

      if (!img.complete || img.naturalWidth <= 0) continue;

      const p = worldToScreen(fx.x, fx.y);
      const z = cam.zoom||1;

      const x = p.x;
      const y = p.y - 64*z;

      const a = clamp(age/ttl, 0, 1);
      const activeHold = 0.14;
      let fade = 1;
      if (since > activeHold){
        fade = clamp(1 - ((since - activeHold) / (linger - activeHold)), 0, 1);
      }

      const fi = (Math.floor(age / frameDur) % FRAMES);
      const sx = (fi % COLS) * TILEPX;
      const sy = ((fi / COLS) | 0) * TILEPX;

      const size = 216 * z;

      ctx.save();
      ctx.globalAlpha = 0.95 * fade;

      const dx = Math.round(x - size/2);
      const dy = Math.round(y - size/2);
      ctx.drawImage(img, sx, sy, TILEPX, TILEPX, dx, dy, size, size);

      ctx.restore();
    }
  }

  function drawBuildingHpBlocks(ent){
    const ratio = clamp(ent.hp/ent.hpMax, 0, 1);

    const segN = clamp(Math.round((ent.tw + ent.th) * 2), 6, 14);
    const filled = clamp(Math.round(segN * ratio), 0, segN);

    const fillColor = (ratio < 0.20) ? "rgba(255,70,60,0.98)"
                    : (ratio < 0.50) ? "rgba(255,220,70,0.98)"
                    : "rgba(110,255,90,0.98)";

    const level = (BUILD[ent.kind] && typeof BUILD[ent.kind].hLevel === "number") ? BUILD[ent.kind].hLevel : 2;
    const unitH = 34 * cam.zoom;
    const h = Math.max(0, level) * unitH;

    const tx0 = ent.tx, ty0 = ent.ty, tx1 = ent.tx + ent.tw, ty1 = ent.ty + ent.th;
    const g0 = worldToScreen(tx0*TILE, ty0*TILE);
    const g1 = worldToScreen(tx1*TILE, ty0*TILE);
    const g2 = worldToScreen(tx1*TILE, ty1*TILE);
    const g3 = worldToScreen(tx0*TILE, ty1*TILE);

    const t0 = { x: g0.x, y: g0.y - h };
    const t1 = { x: g1.x, y: g1.y - h };
    const t2 = { x: g2.x, y: g2.y - h };
    const t3 = { x: g3.x, y: g3.y - h };

    const rcx = (t0.x + t1.x + t2.x + t3.x) * 0.25;
    const rcy = (t0.y + t1.y + t2.y + t3.y) * 0.25;
    const midx = (t0.x + t3.x) * 0.5;
    const midy = (t0.y + t3.y) * 0.5;

    let ox = (midx - rcx), oy = (midy - rcy);
    const oLen = Math.hypot(ox, oy) || 1;
    ox /= oLen; oy /= oLen;

    const off = 14 * cam.zoom;
    const b0 = { x: t0.x + ox*off, y: t0.y + oy*off };
    const b1 = { x: t3.x + ox*off, y: t3.y + oy*off };

    let ux = (b1.x - b0.x), uy = (b1.y - b0.y);
    const uLen = Math.hypot(ux, uy) || 1;
    ux /= uLen; uy /= uLen;

    let vx = (t1.x - t0.x), vy = (t1.y - t0.y);
    const vLen = Math.hypot(vx, vy) || 1;
    vx /= vLen; vy /= vLen;

    const edgeLen = Math.hypot(b1.x - b0.x, b1.y - b0.y) || 1;

    const thick = 12 * cam.zoom;
    const padU = 10 * cam.zoom;
    const padV = 6 * cam.zoom;
    const gap = 2.2 * cam.zoom;

    const usable = Math.max(1, edgeLen - padU*2);
    const segLen = Math.max(1, (usable - gap*(segN-1)) / segN);

    const ang = Math.atan2(uy, ux);
    ctx.save();
    ctx.translate(b0.x, b0.y);
    ctx.rotate(ang);

    const plateW = usable + padU*2;
    const plateH = thick + padV*2;
    const plateX = -padU;
    const plateY = -plateH*0.5;

    const rr = (x,y,w,h,r)=>{
      r = Math.min(r, w*0.5, h*0.5);
      ctx.beginPath();
      ctx.moveTo(x+r, y);
      ctx.lineTo(x+w-r, y);
      ctx.quadraticCurveTo(x+w, y, x+w, y+r);
      ctx.lineTo(x+w, y+h-r);
      ctx.quadraticCurveTo(x+w, y+h, x+w-r, y+h);
      ctx.lineTo(x+r, y+h);
      ctx.quadraticCurveTo(x, y+h, x, y+h-r);
      ctx.lineTo(x, y+r);
      ctx.quadraticCurveTo(x, y, x+r, y);
      ctx.closePath();
    };

    rr(plateX + 2*cam.zoom, plateY + 2*cam.zoom, plateW, plateH, plateH*0.45);
    ctx.fillStyle = "rgba(0,0,0,0.30)";
    ctx.fill();

    rr(plateX, plateY, plateW, plateH, plateH*0.45);
    ctx.fillStyle = "rgba(12,16,24,0.72)";
    ctx.fill();

    rr(plateX, plateY, plateW, plateH, plateH*0.45);
    ctx.strokeStyle = "rgba(180,210,255,0.10)";
    ctx.lineWidth = Math.max(1, 1.1*cam.zoom);
    ctx.stroke();

    for (let i=0;i<segN;i++){
      const isMissing = (i >= filled);
      const base = isMissing ? "rgba(0,0,0,0.80)" : fillColor;

      const x0 = plateX + padU + i*(segLen + gap);
      const y0 = -thick*0.5;
      const w = segLen;
      const h0 = thick;

      ctx.fillStyle = base;
      ctx.fillRect(x0, y0, w, h0);

      ctx.strokeStyle = "rgba(0,0,0,0.35)";
      ctx.lineWidth = Math.max(1, 1.0*cam.zoom);
      ctx.strokeRect(x0, y0, w, h0);

      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x0+w, y0);
      ctx.strokeStyle = "rgba(255,255,255,0.10)";
      ctx.lineWidth = Math.max(1, 1.0*cam.zoom);
      ctx.stroke();
    }

    ctx.restore();
  }

  function drawGroupBadge(x,y,n){
    if (!n) return;
    ctx.save();
    ctx.font="11px system-ui";
    ctx.textAlign="center";
    ctx.textBaseline="middle";
    ctx.fillStyle="rgba(0,0,0,0.82)";
    ctx.strokeStyle="rgba(255,255,255,0.22)";
    ctx.lineWidth=1;
    const w=14,h=14;
    ctx.beginPath();
    ctx.rect(x-w/2, y-h/2, w, h);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle="rgba(255,255,255,0.92)";
    ctx.fillText(String(n), x, y+0.5);
    ctx.restore();
  }

  function roundRectPath(ctx, x, y, w, h, r){
    r = Math.max(0, Math.min(r, Math.min(w,h)/2));
    ctx.beginPath();
    ctx.moveTo(x+r, y);
    ctx.arcTo(x+w, y,   x+w, y+h, r);
    ctx.arcTo(x+w, y+h, x,   y+h, r);
    ctx.arcTo(x,   y+h, x,   y,   r);
    ctx.arcTo(x,   y,   x+w, y,   r);
    ctx.closePath();
  }

  function isPrimaryBuilding(b){
    if (!b || b.team!==TEAM.PLAYER) return false;
    if (b.kind==="barracks") return state.primary.player.barracks===b.id;
    if (b.kind==="factory")  return state.primary.player.factory===b.id;
    return false;
  }

  function drawPrimaryBadgeForSelectedBuilding(b){
    if (!isPrimaryBuilding(b)) return;
    const p=worldToScreen(b.x,b.y);
    const yy = p.y - (Math.max(b.tw,b.th)*ISO_Y*cam.zoom) - 40;
    const xx = p.x + ISO_X*(b.tw*0.72)*cam.zoom;
    const text="??????";
    ctx.save();
    ctx.font="bold 12px system-ui";
    ctx.textAlign="left";
    ctx.textBaseline="middle";
    const padX=8;
    const w = ctx.measureText(text).width + padX*2;
    const h = 22;
    ctx.fillStyle="rgba(0,0,0,0.55)";
    ctx.strokeStyle="rgba(255,235,140,0.9)";
    ctx.lineWidth=1.5;
    roundRectPath(ctx, xx, yy, w, h, 7);
    ctx.fill(); ctx.stroke();
    ctx.fillStyle="rgba(255,235,140,0.95)";
    ctx.fillText(text, xx+padX, yy+h/2);
    ctx.restore();
  }

  function drawHoverNameTooltip(){
    if (!state.hover.entId) return;
    if ((state.t - state.hover.t0) < 0.8) return;
    if (state.drag.on || state.pan.on) return;
    if (state.build.active) return;

    const ent = getEntityById(state.hover.entId);
    if (!ent || !ent.alive) return;
    if (ent.hidden || ent.inTransport) return;

    const name = NAME_KO[ent.kind] || ent.kind;
    const W = canvas.width, H = canvas.height;
    const x = clamp(state.hover.px + 14, 10, W-10);
    const y = clamp(state.hover.py - 18, 10, H-10);

    ctx.save();
    ctx.font="12px system-ui";
    ctx.textAlign="left";
    ctx.textBaseline="middle";
    const padX=10;
    const tw = ctx.measureText(name).width;
    const bw = tw + padX*2;
    const bh = 24;

    ctx.fillStyle="rgba(0,0,0,0.62)";
    ctx.strokeStyle="rgba(255,255,255,0.25)";
    ctx.lineWidth=1;
    roundRectPath(ctx, x, y, bw, bh, 8);
    ctx.fill(); ctx.stroke();

    ctx.fillStyle="rgba(255,255,255,0.92)";
    ctx.fillText(name, x+padX, y+bh/2);
    ctx.restore();
  }

  function drawClickWaves(){
    const now=state.t;
    state.fx.clicks = state.fx.clicks.filter(w=> (now - w.t0) <= w.life);

    for (const w of state.fx.clicks){
      const a = clamp((now - w.t0) / w.life, 0, 1);
      const sp = worldToScreen(w.x, w.y);
      const r1 = 6 + a*34;
      const r2 = 2 + a*18;
      const alpha = (1-a);

      ctx.save();
      ctx.globalAlpha = 0.75 * alpha;
      ctx.lineWidth = 2.6;
      ctx.strokeStyle = w.color || "rgba(255,255,255,0.85)";

      ctx.beginPath(); ctx.arc(sp.x, sp.y, r1, 0, Math.PI*2); ctx.stroke();
      ctx.globalAlpha = 0.45 * alpha;
      ctx.beginPath(); ctx.arc(sp.x, sp.y, r2, 0, Math.PI*2); ctx.stroke();
      ctx.restore();
    }
  }

  function drawPathFx(){
    return;
  }

  function drawRallyPointsForSelection(){
    for (const id of state.selection){
      const b=getEntityById(id);
      if (!b || !b.alive || b.team!==TEAM.PLAYER) continue;
      if (!BUILD[b.kind] || b.civ) continue;
      if (b.kind!=="barracks" && b.kind!=="factory" && b.kind!=="hq") continue;
      if (!b.rally) continue;

      const level = (BUILD[b.kind] && typeof BUILD[b.kind].hLevel === "number") ? BUILD[b.kind].hLevel : 2;
      const unitH = 34 * cam.zoom;
      const h = Math.max(0, level) * unitH;

      const c = worldToScreen((b.tx + b.tw/2) * TILE, (b.ty + b.th/2) * TILE);
      const from = { x: c.x, y: c.y - h };

      const to   = worldToScreen(b.rally.x, b.rally.y);

      ctx.save();
      ctx.globalAlpha=0.95;
      ctx.strokeStyle="rgba(255,255,255,0.8)";
      ctx.lineWidth=2;

      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(to.x, to.y);
      ctx.stroke();

      ctx.fillStyle="rgba(255,255,255,0.95)";
      ctx.beginPath();
      ctx.moveTo(from.x, from.y-6.0);
      ctx.lineTo(from.x+6.0, from.y);
      ctx.lineTo(from.x, from.y+6.0);
      ctx.lineTo(from.x-6.0, from.y);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle="rgba(255,255,255,0.95)";
      ctx.beginPath();
      ctx.arc(to.x, to.y, 5.2, 0, Math.PI*2);
      ctx.fill();

      ctx.restore();
    }
  }

  function drawOrderFx(){
    const now = state.t;
    if (!state.fx.orders) state.fx.orders = [];
    state.fx.orders = state.fx.orders.filter(o=> now <= o.until);

    for (const o of state.fx.orders){
      const u = getEntityById(o.unitId);
      if (!u || !u.alive || u.inTransport) continue;

      let tx=o.x, ty=o.y;
      let target=null;
      if (o.targetId!=null){
        target=getEntityById(o.targetId);
        if (target && target.alive){
          tx=target.x; ty=target.y;
        }
      }

      const from = worldToScreen(u.x, u.y);
      const to   = worldToScreen(tx, ty);

      ctx.save();
      const a = clamp((o.until - now) / o.ttl, 0, 1);
      ctx.globalAlpha = 0.95 * a;
      ctx.lineWidth = o.w || 3.2;
      ctx.strokeStyle = o.color || "rgba(120,255,120,0.95)";
      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(to.x, to.y);
      ctx.stroke();

      const r = o.r || 5.5;
      ctx.fillStyle = o.color2 || (o.color || "rgba(255,90,90,0.95)");
      ctx.beginPath();
      ctx.arc(to.x, to.y, r, 0, Math.PI*2);
      ctx.fill();

      if (o.kind==="attack"){
        ctx.globalAlpha = 0.8 * a;
        ctx.strokeStyle = "rgba(255,255,255,0.45)";
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(to.x-r-2, to.y);
        ctx.lineTo(to.x+r+2, to.y);
        ctx.moveTo(to.x, to.y-r-2);
        ctx.lineTo(to.x, to.y+r+2);
        ctx.stroke();
      }

      ctx.restore();
    }



  function drawExplosions(ctx){
    if (!explosions.length) return;
    const z = (typeof cam !== "undefined" && cam && typeof cam.zoom==="number") ? cam.zoom : 1;

    for (const e of explosions){
      const p = worldToScreen(e.x, e.y);
      const k = clamp(1 - (e.t / Math.max(0.001, e.ttl)), 0, 1);

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

      ctx.globalAlpha = 0.85 * Math.pow(k, 0.35);
      const R2 = (TILE*1.25*e.size) * z;
      const g2 = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, R2);
      g2.addColorStop(0.0, "rgba(255,255,255,0.95)");
      g2.addColorStop(0.5, "rgba(255,245,210,0.55)");
      g2.addColorStop(1.0, "rgba(255,220,140,0.0)");
      ctx.fillStyle = g2;
      ctx.beginPath();
      ctx.arc(p.x, p.y, R2, 0, Math.PI*2);
      ctx.fill();

      for (const prt of e.parts){
        const pp = worldToScreen(prt.x, prt.y);
        const a = clamp(prt.life / Math.max(0.001, prt.ttl), 0, 1);

        if (prt.kind==="streak"){
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
          ge.addColorStop(0.0, "rgba(255,210,120,0.85)");
          ge.addColorStop(0.45, "rgba(255,170,70,0.28)");
          ge.addColorStop(1.0, "rgba(0,0,0,0)");
          ctx.fillStyle = ge;
          ctx.beginPath();
          ctx.arc(pp.x, pp.y, rr, 0, Math.PI*2);
          ctx.fill();
        } else if (prt.kind==="flame"){
          const rr = (prt.r * z) * (0.65 + (1-a)*0.6);
          const lift = (prt.rise||0) * z;
          ctx.globalAlpha = 0.55 * a;
          const gf = ctx.createRadialGradient(pp.x, pp.y - lift, 0, pp.x, pp.y - lift, rr);
          gf.addColorStop(0.0, "rgba(255,180,80,0.45)");
          gf.addColorStop(0.45, "rgba(255,120,40,0.25)");
          gf.addColorStop(1.0, "rgba(0,0,0,0)");
          ctx.fillStyle = gf;
          ctx.beginPath();
          ctx.arc(pp.x, pp.y - lift, rr, 0, Math.PI*2);
          ctx.fill();
        }
      }

      ctx.restore();
    }
  }

  function drawExp1Fxs(ctx){
    if (!exp1Fxs.length) return;
    if (!EXP1_FRAMES || !EXP1_FRAMES.length) return;
    if (!EXP1_IMG || !EXP1_IMG.complete) return;

    const z = (typeof cam !== "undefined" && cam && typeof cam.zoom==="number") ? cam.zoom : 1;

    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = 1;

    for (const fx of exp1Fxs){
      const age = state.t - fx.t0;
      const fi = Math.floor(age / Math.max(0.001, fx.frameDur));
      if (fi < 0 || fi >= EXP1_FRAMES.length) continue;

      const fr = EXP1_FRAMES[fi];
      const p = worldToScreen(fx.x, fx.y);

      const dw = (fr.sw ?? fr.w) * fx.scale * z;
      const dh = (fr.sh ?? fr.h) * fx.scale * z;

      const dx = p.x - dw * EXP1_PIVOT_X;
      const dy = p.y - dh * EXP1_PIVOT_Y + (EXP1_Y_OFFSET * z);

      const ox = (fr.ox ?? 0) * fx.scale * z;
      const oy = (fr.oy ?? 0) * fx.scale * z;
      const fw = fr.w * fx.scale * z;
      const fh = fr.h * fx.scale * z;

      ctx.drawImage(EXP1_IMG, fr.x, fr.y, fr.w, fr.h, dx + ox, dy + oy, fw, fh);
    }

    ctx.restore();
  }

  function drawSmokeWaves(ctx){
    if (!smokeWaves.length) return;
    const z = (typeof cam !== "undefined" && cam && typeof cam.zoom==="number") ? cam.zoom : 1;

    const pr = (seed, n)=>{
      const x = Math.sin((seed + n) * 12.9898) * 43758.5453;
      return x - Math.floor(x);
    };

    for (const w of smokeWaves){
      const p = worldToScreen(w.x, w.y);
      const t = clamp(w.t / Math.max(0.001, w.ttl), 0, 1);
      const ease = 1 - Math.pow(1 - t, 4);

      const R0 = (TILE * 0.10) * z;
      const R1 = (TILE * 1.05 * w.size) * z;
      const R  = R0 + (R1 - R0) * ease;

      const aBase = 0.32 * Math.pow(1 - t, 0.60);

      const squash = (w.squash ?? 0.62);
      const th = (TILE * 0.34 * w.size) * z;

      ctx.save();
      ctx.globalCompositeOperation = "source-over";

      ctx.translate(p.x, p.y);
      ctx.scale(1, squash);

      for (let k=0;k<3;k++){
        const jx = (pr(w.seed, 10+k)-0.5) * (TILE * 0.09 * w.size) * z;
        const jy = (pr(w.seed, 20+k)-0.5) * (TILE * 0.09 * w.size) * z;
        const rr = 1 + (pr(w.seed, 30+k)-0.5) * 0.07;

        const a = aBase * (0.66 - k*0.16);

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
      const a = s.a0 * Math.pow(1 - t, 0.65);

      ctx.save();
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = a;

      const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r*2.2);
      g.addColorStop(0.0, "rgba(120,120,120,0.12)");
      g.addColorStop(0.45, "rgba(90,90,90,0.10)");
      g.addColorStop(1.0, "rgba(0,0,0,0)");
      ctx.fillStyle = g;

      ctx.beginPath();
      ctx.arc(p.x, p.y, r*2.2, 0, Math.PI*2);
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

  function drawBlood(ctx){
    const z = (typeof cam !== "undefined" && cam && typeof cam.zoom==="number") ? cam.zoom : 1;

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
      g.addColorStop(0.0, "rgba(80, 0, 0, 0.55)");
      g.addColorStop(0.35, "rgba(60, 0, 0, 0.35)");
      g.addColorStop(1.0, "rgba(0, 0, 0, 0.0)");
      ctx.fillStyle = g;

      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI*2);
      ctx.fill();
      ctx.restore();
    }

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
  }

  function drawMain(env){
    if (!env) return;
    bindEnv(env);
    const {




      canvas, ctx, cam, state, TEAM, MAP_W, MAP_H, TILE, ISO_X, ISO_Y,
      terrain, ore, explored, visible, BUILD, DEFENSE, BUILD_SPRITE, NAME_KO,
      units, buildings, bullets, traces, impacts, fires, healMarks, flashes, casings,
      gameOver, POWER,
      EXP1_IMG, EXP1_FRAMES, EXP1_PIVOT_X, EXP1_PIVOT_Y, EXP1_Y_OFFSET, exp1Fxs,
      smokeWaves, smokePuffs, dustPuffs, dmgSmokePuffs, bloodStains, bloodPuffs,
      updateMoney, updateProdBadges,
      inMap, idx, tileToWorldCenter, worldToScreen,
      getEntityById, REPAIR_WRENCH_IMG, repairWrenches,
      snapHoverToTileOrigin, buildingWorldFromTileOrigin, inBuildRadius, isBlockedFootprint, footprintBlockedMask,
      updateInfDeathFx, updateSnipDeathFx, drawInfDeathFxOne, drawSnipDeathFxOne,
      rectFromDrag, refreshPrimaryBuildingBadgesUI,
      drawLiteTankSprite, drawHarvesterSprite,
      drawInfantrySprite, drawInfantryMoveEast, drawInfantryMoveNE, drawInfantryMoveN, drawInfantryMoveNW, drawInfantryMoveW, drawInfantryMoveSW, drawInfantryMoveS, drawInfantryMoveSE,
      drawSniperSprite, drawSniperMoveByDir,
      drawBuildingSprite,
      worldVecToDir8,
      isUnderPower, clamp,
      INF_IMG, SNIP_IMG,
      infDeathFxs = [], snipDeathFxs = []
    
    
    
    
    } = env;

    const W=canvas.width, H=canvas.height;
    ctx.clearRect(0,0,W,H);
    if (typeof updateMoney === "function") updateMoney(state.player.money);
    if (typeof updateProdBadges === "function") updateProdBadges();

    for (let s=0; s<=(MAP_W-1)+(MAP_H-1); s++){
      for (let ty=0; ty<MAP_H; ty++){
        const tx=s-ty;
        if (!inMap(tx,ty)) continue;
        const i=idx(tx,ty);

        drawIsoTile(tx,ty,terrain[i]);

        const iVis = visible[TEAM.PLAYER][i];
        const iExp = explored[TEAM.PLAYER][i];

        if (!iExp || !iVis){
          const c = tileToWorldCenter(tx,ty);
          const p = worldToScreen(c.x,c.y);
          const x = p.x, y = p.y;
          const ox = ISO_X*cam.zoom, oy = ISO_Y*cam.zoom;

          const eps = 2.4*cam.zoom;
          if (!iExp){
            ctx.fillStyle = "rgba(0,0,0,1)";
          } else {
            ctx.fillStyle = "rgba(0,0,0,0.10)";
          }

          ctx.beginPath();
          ctx.moveTo(x, y-oy-eps);
          ctx.lineTo(x+ox+eps, y);
          ctx.lineTo(x, y+oy+eps);
          ctx.lineTo(x-ox-eps, y);
          ctx.closePath();
          ctx.fill();
        }
      }
    }

    if (state.build.active && state.build.kind){
      const kind=state.build.kind;
      const spec=BUILD[kind];
      const s = snapHoverToTileOrigin(kind);
      const tx=s.tx, ty=s.ty;
      const wpos=buildingWorldFromTileOrigin(tx,ty,spec.tw,spec.th);

      const ok = inBuildRadius(TEAM.PLAYER, wpos.cx, wpos.cy)
        && !isBlockedFootprint(tx,ty,spec.tw,spec.th);

      const ghost={tx,ty,tw:spec.tw,th:spec.th};
      const fp = footprintBlockedMask(tx,ty,spec.tw,spec.th);

      if (!inBuildRadius(TEAM.PLAYER, wpos.cx, wpos.cy)){
        fp.mask.fill(1);
        fp.blocked = true;
      }

      ctx.globalAlpha=0.62;
      drawFootprintTiles(
        tx, ty, spec.tw, spec.th,
        fp.mask,
        "rgba(120,255,170,0.22)", "rgba(255,120,120,0.22)",
        "rgba(120,255,170,0.78)", "rgba(255,120,120,0.78)"
      );
      ctx.globalAlpha=1;

      ctx.globalAlpha=0.78;
      drawFootprintDiamond(ghost, "rgba(0,0,0,0)", fp.blocked ? "rgba(255,120,120,0.90)" : "rgba(120,255,170,0.90)");
      ctx.globalAlpha=1;

      const dspec = DEFENSE[kind];
      if (dspec && dspec.range){
        const ringColor = state.colors.player;
        drawRangeEllipseWorld(wpos.cx, wpos.cy, dspec.range, ringColor, dspec.ring);
      }
    }

    if (state.selection && state.selection.size){
      for (const id of state.selection){
        const ent = getEntityById ? getEntityById(id) : null;
        if (!ent) continue;
        if (!BUILD[ent.kind]) continue;
        const dspec = DEFENSE[ent.kind];
        if (!dspec || !dspec.range) continue;
        const col = ent.team===TEAM.PLAYER ? state.colors.player : state.colors.enemy;
        drawRangeEllipseWorld(ent.x, ent.y, dspec.range, col, dspec.ring);
      }
    }

    if (typeof updateInfDeathFx === "function") updateInfDeathFx();
    if (typeof updateSnipDeathFx === "function") updateSnipDeathFx();

    const drawables=[];
    for (const b of buildings) if (b.alive) drawables.push(b);
    for (const u of units) if (u.alive) drawables.push(u);
    for (let i=0;i<infDeathFxs.length;i++){
      const fx=infDeathFxs[i];
      if (!fx || !fx._rd) continue;
      drawables.push({ id: 9000000+i, kind: "_fx_inf_die", alive: true, team: fx.team, x: fx.x, y: fx.y, fxRef: fx });
    }
    for (let i=0;i<snipDeathFxs.length;i++){
      const fx=snipDeathFxs[i];
      if (!fx || !fx._rd) continue;
      drawables.push({ id: 9100000+i, kind: "_fx_snip_die", alive: true, team: fx.team, x: fx.x, y: fx.y, fxRef: fx });
    }

    drawables.sort((a,b)=>{
      const aIsB=!!BUILD[a.kind], bIsB=!!BUILD[b.kind];
      const aKey = aIsB ? ((a.tx + a.ty) + (a.tw + a.th - 2)) : ((a.x + a.y)/TILE);
      const bKey = bIsB ? ((b.tx + b.ty) + (b.tw + b.th - 2)) : ((b.x + b.y)/TILE);
      if (aKey !== bKey) return aKey - bKey;
      if (aIsB !== bIsB) return aIsB ? -1 : 1;
      return (a.id||0) - (b.id||0);
    });

    for (const ent of drawables){
      const isB=!!BUILD[ent.kind];
      const tx=isB?ent.tx:(ent.x/TILE)|0;
      const ty=isB?ent.ty:(ent.y/TILE)|0;
      let rX = ent.x, rY = ent.y;

      if (ent.team===TEAM.ENEMY && inMap(tx,ty) && !explored[TEAM.PLAYER][idx(tx,ty)]) continue;

      if (isB){
        if (ent.civ) continue;

        let fill="#1b2636", stroke="#2b3d55";
        if (ent.team===TEAM.PLAYER){ fill="rgba(10,40,70,0.9)"; stroke=state.colors.player; }
        if (ent.team===TEAM.ENEMY){  fill="rgba(70,10,10,0.9)"; stroke=state.colors.enemy; }

        if (BUILD_SPRITE[ent.kind]){
          drawFootprintDiamond(ent, "rgba(0,0,0,0.22)", "rgba(0,0,0,0)");
          drawBuildingSprite(ent);
        } else if (window.PO && PO.buildings && PO.buildings.drawBuilding) {
          const helpers = { worldToScreen, ISO_X, ISO_Y, drawFootprintDiamond };
          const drew = PO.buildings.drawBuilding(ent, ctx, cam, helpers, state);
          if (!drew) drawFootprintPrism(ent, fill, stroke);
        } else {
          drawFootprintPrism(ent, fill, stroke);
        }

        if (ent.kind==="turret" && POWER.turretUse>0 && isUnderPower(ent.team)){
          const blink = (Math.floor(state.t*6)%2)===0;
          if (blink){
            drawFootprintPrism(ent, "rgba(0,0,0,0.55)", "rgba(0,0,0,0)");
          }
          const p2=worldToScreen(rX,rY);
          ctx.font=(16*cam.zoom).toFixed(0)+"px system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
          ctx.textAlign="center"; ctx.textBaseline="middle";
          ctx.fillStyle="rgba(255,235,120,0.95)";
          ctx.fillText("⚡", p2.x, p2.y-ISO_Y*0.25);
        }

        const p=worldToScreen(rX,rY);
        const z = (typeof cam !== "undefined" && cam && typeof cam.zoom==="number") ? cam.zoom : 1;
        const yy = p.y - (Math.max(ent.tw,ent.th)*ISO_Y*z) - 22*z;
        const showHp = (state.selection && state.selection.has(ent.id)) || (state.hover && state.hover.entId===ent.id);
        if (showHp) drawBuildingHpBlocks(ent);
        if (showHp) drawLabel(`${NAME_KO[ent.kind]||ent.kind}`, p.x, yy-14);
        if (ent.grp) drawGroupBadge(p.x + ISO_X*(ent.tw*0.55), yy-14, ent.grp);

        if (state.selection.has(ent.id)){
          if (typeof drawPrimaryBadgeForSelectedBuilding === "function") drawPrimaryBadgeForSelectedBuilding(ent);
          ctx.lineWidth=2;
          drawFootprintDiamond(ent, "rgba(0,0,0,0)", "rgba(255,255,255,0.9)");
        }
      } else {
        if (ent.kind==="_fx_inf_die"){ if (typeof drawInfDeathFxOne === "function") drawInfDeathFxOne(ent.fxRef); continue; }
        if (ent.kind==="_fx_snip_die"){ if (typeof drawSnipDeathFxOne === "function") drawSnipDeathFxOne(ent.fxRef); continue; }
        if (ent.hidden || ent.inTransport) continue;
        if (ent.kind==="sniper" && ent.cloaked && ent.team===TEAM.ENEMY) continue;
        const p=worldToScreen(rX,rY);
        let c = (ent.team===TEAM.PLAYER) ? state.colors.player : state.colors.enemy;

        if (state.selection && state.selection.has(ent.id)) drawSelectionEllipseAt(ent);
        if (ent.kind==="harvester") c = (ent.team===TEAM.PLAYER) ? "#a0ffbf" : "#ffb0b0";
        if (ent.kind==="engineer") c = (ent.team===TEAM.PLAYER) ? "#b7a8ff" : "#ffb7d9";

        const isInfantry = (ent.kind==="infantry" && typeof INF_IMG!=="undefined" && INF_IMG && INF_IMG.complete && INF_IMG.naturalWidth>0);
        const isSnip = (ent.kind==="sniper" && typeof SNIP_IMG!=="undefined" && SNIP_IMG && SNIP_IMG.complete && SNIP_IMG.naturalWidth>0);
        const isInf = isInfantry || isSnip;
        const infDir = isInf ? (
          (ent.fireHoldT>0 && ent.fireDir!=null) ? ent.fireDir :
          (ent.faceDir!=null) ? ent.faceDir :
          (ent.order && (ent.order.type==="move" || ent.order.type==="attackmove" || ent.order.type==="attack") && (ent.order.x!=null) && (ent.order.y!=null))
            ? worldVecToDir8(ent.order.x - ent.x, ent.order.y - ent.y)
            : 6
        ) : 6;

        ctx.save();
        if (ent.kind==="sniper" && ent.team===TEAM.PLAYER && ent.cloaked) ctx.globalAlpha = 0.45;
        if (ent.flash && ent.flash>0){
          if (((state.t*28)|0)%2===0) ctx.globalAlpha *= 0.55;
          ctx.shadowColor = "rgba(255,255,255,0.9)";
          ctx.shadowBlur = 12;
        }
        if (!isInf){
          let drewSprite = false;
          if (ent.kind==="tank"){
            drewSprite = drawLiteTankSprite(ent, p);
          } else if (ent.kind==="harvester"){
            drewSprite = drawHarvesterSprite(ent, p);
          }
          if (!drewSprite){
            ctx.fillStyle=c;
            ctx.strokeStyle="rgba(0,0,0,0.4)";
            ctx.lineWidth=2;
            ctx.beginPath();
            ctx.arc(p.x,p.y,ent.r,0,Math.PI*2);
            ctx.fill(); ctx.stroke();
          }
        } else {
          let a = 1;
          if (ent.kind==="sniper" && ent.team===TEAM.PLAYER && ent.cloaked) a = 0.45;
          {
            if (ent.kind==="sniper"){
              const firing = ((ent.fireHoldT||0)>0);
              const isMoveOrder = !!(ent.order && (ent.order.type==="move" || ent.order.type==="attackmove"));
              const v2 = (ent.vx||0)*(ent.vx||0) + (ent.vy||0)*(ent.vy||0);
              const moving = isMoveOrder || v2 > 0.0004 || (ent.path && ent.path.length>0);
              if (!firing && moving){
                drawSniperMoveByDir(ctx, p.x, p.y, infDir, a, ent.team, state.t);
              } else {
                drawSniperSprite(ctx, p.x, p.y, infDir, a, ent.team);
              }
            } else {
              const firing = ((ent.fireHoldT||0)>0);
              const isMoveOrder = !!(ent.order && (ent.order.type==="move" || ent.order.type==="attackmove"));
              const v2 = (ent.vx||0)*(ent.vx||0) + (ent.vy||0)*(ent.vy||0);
              const moving = isMoveOrder || v2 > 0.0004 || (ent.path && ent.path.length>0);
              if (!firing && moving){
                if (infDir===0)      drawInfantryMoveEast(ctx, p.x, p.y, a, ent.team, state.t);
                else if (infDir===1) drawInfantryMoveNE(ctx, p.x, p.y, a, ent.team, state.t);
                else if (infDir===2) drawInfantryMoveN(ctx,  p.x, p.y, a, ent.team, state.t);
                else if (infDir===3) drawInfantryMoveNW(ctx, p.x, p.y, a, ent.team, state.t);
                else if (infDir===4) drawInfantryMoveW(ctx,  p.x, p.y, a, ent.team, state.t);
                else if (infDir===5) drawInfantryMoveSW(ctx, p.x, p.y, a, ent.team, state.t);
                else if (infDir===6) drawInfantryMoveS(ctx,  p.x, p.y, a, ent.team, state.t);
                else if (infDir===7) drawInfantryMoveSE(ctx, p.x, p.y, a, ent.team, state.t);
                else                 drawInfantrySprite(ctx, p.x, p.y, infDir, a, ent.team, firing);
              } else {
                drawInfantrySprite(ctx, p.x, p.y, infDir, a, ent.team, firing);
              }
            }
          }
        }

        if (ent.kind==="ifv"){
          const s=8;
          const x0=p.x - ent.r - 2;
          const y0=p.y + ent.r - s + 2;
          ctx.lineWidth=1.5;
          ctx.strokeStyle="rgba(255,255,255,0.85)";
          ctx.strokeRect(x0,y0,s,s);
          if (ent.passKind){
            let fc="rgba(255,255,255,0.0)";
            if (ent.passKind==="infantry") fc="rgba(255,60,60,0.95)";
            else if (ent.passKind==="engineer") fc="rgba(60,140,255,0.95)";
            else if (ent.passKind==="sniper") fc="rgba(255,220,60,0.95)";
            ctx.fillStyle=fc;
            ctx.fillRect(x0+1,y0+1,s-2,s-2);
          }
        }
        ctx.restore();
        const showHp = (state.selection && state.selection.has(ent.id)) || (state.hover && state.hover.entId===ent.id);
        if (showHp) drawUnitHpBlocks(ent, p);

        if (ent.grp) drawGroupBadge(p.x + ent.r*0.85, p.y - ent.r*0.85, ent.grp);

        if (ent.kind==="harvester"){
          const cr=clamp(ent.carry/(ent.carryMax||1),0,1);
          ctx.fillStyle="rgba(0,0,0,0.45)";
          ctx.fillRect(p.x-ent.r, p.y+ent.r+6, ent.r*2, 4);
          ctx.fillStyle="rgba(255,215,0,0.9)";
          ctx.fillRect(p.x-ent.r, p.y+ent.r+6, ent.r*2*cr, 4);
        }
      }
    }

    if (typeof drawWrenchFx === "function") drawWrenchFx();

    for (const bl of bullets){
      const p0=worldToScreen(bl.x,bl.y);

      if (bl.kind==="shell"){
        const t = Math.max(0, Math.min(1, bl.t||0));
        const z = Math.sin(Math.PI*t) * (bl.h||24);
        const p = {x:p0.x, y:p0.y - z};

        ctx.save();
        ctx.globalAlpha = 0.95;
        ctx.shadowBlur = 26;
        ctx.shadowColor = "rgba(255,180,70,1.0)";
        ctx.fillStyle = "rgba(255,210,110,0.95)";
        ctx.beginPath();
        ctx.arc(p.x, p.y, 3.6, 0, Math.PI*2);
        ctx.fill();

        ctx.shadowBlur = 0;
        ctx.fillStyle = "rgba(255,245,190,1.0)";
        ctx.beginPath();
        ctx.arc(p.x, p.y, 1.6, 0, Math.PI*2);
        ctx.fill();
        ctx.restore();
      } else if (bl.kind==="missile"){
        const p=p0;
        const a=(bl.team===TEAM.PLAYER) ? "rgba(150,220,255,0.95)" : "rgba(255,150,150,0.95)";
        ctx.strokeStyle=a;
        ctx.lineWidth=2;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - bl.vx*0.040, p.y - bl.vy*0.040);
        ctx.stroke();

        const ang = Math.atan2(bl.vy, bl.vx);
        const len = 8.5;
        const wid = 4.2;
        const hx = Math.cos(ang), hy = Math.sin(ang);
        const px = -hy, py = hx;

        ctx.fillStyle=a;
        ctx.beginPath();
        ctx.moveTo(p.x + hx*len, p.y + hy*len);
        ctx.lineTo(p.x - hx*len*0.55 + px*wid, p.y - hy*len*0.55 + py*wid);
        ctx.lineTo(p.x - hx*len*0.55 - px*wid, p.y - hy*len*0.55 - py*wid);
        ctx.closePath();
        ctx.fill();
      } else {
        const p=p0;
        ctx.fillStyle=(bl.team===TEAM.PLAYER) ? "rgba(150,220,255,0.9)" : "rgba(255,150,150,0.9)";
        ctx.fillRect(p.x-2,p.y-2,4,4);
      }
    }

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
        ctx.save();
        ctx.lineCap = "round";
        ctx.globalAlpha = alpha*0.85;
        ctx.shadowBlur = 22;
        ctx.shadowColor = "rgba(255, 195, 80, 1.0)";
        ctx.strokeStyle = "rgba(255, 220, 120, 0.70)";
        ctx.lineWidth = 6.2;
        ctx.beginPath(); ctx.moveTo(a.x,a.y); ctx.lineTo(b.x,b.y); ctx.stroke();

        ctx.shadowBlur = 0;
        ctx.globalAlpha = alpha;
        ctx.strokeStyle = "rgba(255, 248, 185, 1.0)";
        ctx.lineWidth = 2.6;
        ctx.beginPath(); ctx.moveTo(a.x,a.y); ctx.lineTo(b.x,b.y); ctx.stroke();

        ctx.globalAlpha = alpha;
        ctx.fillStyle = "rgba(255, 245, 200, 1.0)";
        ctx.beginPath();
        ctx.arc(b.x, b.y, 2.2, 0, Math.PI*2);
        ctx.fill();

        ctx.restore();
      } else if (tr.kind === "tmg"){
        ctx.save();
        ctx.lineCap = "round";

        ctx.globalAlpha = alpha*0.95;
        ctx.shadowBlur = 34;
        ctx.shadowColor = "rgba(255, 170, 40, 1.0)";
        ctx.strokeStyle = "rgba(255, 210, 90, 0.85)";
        ctx.lineWidth = 10.5;
        ctx.beginPath(); ctx.moveTo(a.x,a.y); ctx.lineTo(b.x,b.y); ctx.stroke();

        ctx.shadowBlur = 0;
        ctx.globalAlpha = alpha;
        ctx.strokeStyle = "rgba(255, 250, 200, 1.0)";
        ctx.lineWidth = 4.8;
        ctx.beginPath(); ctx.moveTo(a.x,a.y); ctx.lineTo(b.x,b.y); ctx.stroke();

        ctx.globalAlpha = alpha;
        ctx.fillStyle = "rgba(255, 255, 220, 1.0)";
        ctx.beginPath(); ctx.arc(b.x, b.y, 3.0, 0, Math.PI*2); ctx.fill();

        ctx.restore();
      } else if (tr.kind === "snip"){
        ctx.save();
        ctx.lineCap = "round";
        const isP = (tr.team===TEAM.PLAYER);
        const glow = isP ? "rgba(0, 160, 255, 1.0)" : "rgba(255, 60, 60, 1.0)";
        const mid  = isP ? "rgba(0, 140, 255, 0.75)" : "rgba(255, 70, 70, 0.75)";
        const core = "rgba(255, 255, 255, 1.0)";

        ctx.globalAlpha = alpha*0.80;
        ctx.shadowBlur = 28;
        ctx.shadowColor = glow;
        ctx.strokeStyle = mid;
        ctx.lineWidth = 7.2;
        ctx.beginPath(); ctx.moveTo(a.x,a.y); ctx.lineTo(b.x,b.y); ctx.stroke();

        ctx.shadowBlur = 0;
        ctx.globalAlpha = alpha;
        ctx.strokeStyle = core;
        ctx.lineWidth = 3.2;
        ctx.beginPath(); ctx.moveTo(a.x,a.y); ctx.lineTo(b.x,b.y); ctx.stroke();

        ctx.globalAlpha = alpha;
        ctx.fillStyle = core;
        ctx.beginPath();
        ctx.arc(b.x, b.y, 3.2, 0, Math.PI*2);
        ctx.fill();

        ctx.restore();

      } else if (tr.kind === "impE"){
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

    try{ if (window.PO && PO.buildings && PO.buildings.drawGhosts){
      const helpers = { worldToScreen, ISO_X, ISO_Y, drawFootprintDiamond };
      PO.buildings.drawGhosts(ctx, cam, helpers, state);
    }}catch(_e){}

    if (typeof drawExplosions === "function") drawExplosions(ctx);
    if (typeof drawSmokeWaves === "function") drawSmokeWaves(ctx);
    if (typeof drawDustPuffs === "function") drawDustPuffs(ctx);
    if (typeof drawExp1Fxs === "function") drawExp1Fxs(ctx);
    if (typeof drawSmokePuffs === "function") drawSmokePuffs(ctx);
    if (typeof drawDmgSmokePuffs === "function") drawDmgSmokePuffs(ctx);

    for (const f of fires){
      const p = worldToScreen(f.x, f.y);
      const a = clamp(f.life/0.6, 0, 1);
      const z = (typeof cam !== "undefined" && cam && typeof cam.zoom==="number") ? cam.zoom : 1;
      ctx.globalAlpha = a;
      const h = (16 + f.rise*0.6) * z;
      ctx.fillStyle = "rgba(255, 120, 20, 0.95)";
      ctx.fillRect(p.x-1.6*z, p.y-h, 3.2*z, h);
      ctx.fillStyle = "rgba(255, 200, 80, 0.95)";
      ctx.fillRect(p.x-0.9*z, p.y-h*0.72, 1.8*z, h*0.72);
      ctx.globalAlpha = 1;
    }

    for (const p0 of impacts){
      const p=worldToScreen(p0.x,p0.y);
      ctx.globalAlpha = Math.min(1, p0.life/0.22);
      ctx.fillStyle = "rgba(255, 210, 90, 0.95)";
      ctx.fillRect(p.x-1.4, p.y-1.4, 2.8, 2.8);
      ctx.globalAlpha = 1;
    }

    if (typeof drawBlood === "function") drawBlood(ctx);

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

    for (const c of casings){
      if ((c.delay||0) > 0) continue;
      const p=worldToScreen(c.x, c.y);
      const y = p.y - (c.z||0)*0.18;
      const a = Math.min(1, c.life/0.35);
      ctx.save();
      ctx.globalAlpha = a*0.95;
      ctx.translate(p.x, y);
      ctx.rotate(c.rot||0);
      ctx.shadowBlur = 8;
      ctx.shadowColor = "rgba(255, 210, 110, 0.55)";
      ctx.fillStyle = "rgba(255, 200, 90, 0.95)";
      ctx.fillRect(-(c.w||4)/2, -(c.h||2)/2, (c.w||4), (c.h||2));
      ctx.restore();
      ctx.globalAlpha = 1;
    }

    if (typeof refreshPrimaryBuildingBadgesUI === "function") refreshPrimaryBuildingBadgesUI();
    if (typeof drawClickWaves === "function") drawClickWaves();
    if (typeof drawPathFx === "function") drawPathFx();
    if (typeof drawOrderFx === "function") drawOrderFx();
    if (typeof drawRallyPointsForSelection === "function") drawRallyPointsForSelection();
    if (typeof drawHoverNameTooltip === "function") drawHoverNameTooltip();

    if (state.drag.on && state.drag.moved){
      const r=rectFromDrag();
      ctx.strokeStyle="rgba(255,255,255,0.55)";
      ctx.lineWidth=1.5;
      ctx.strokeRect(r.x0,r.y0,r.x1-r.x0,r.y1-r.y0);
      ctx.fillStyle="rgba(255,255,255,0.06)";
      ctx.fillRect(r.x0,r.y0,r.x1-r.x0,r.y1-r.y0);
    }

    if (gameOver){
      ctx.fillStyle="rgba(0,0,0,0.55)";
      ctx.fillRect(0,0,W,H);
      ctx.fillStyle="#e6eef7";
      ctx.font="bold 44px system-ui";
      const msg="GAME OVER";
      ctx.fillText(msg, W/2-ctx.measureText(msg).width/2, H/2);
      ctx.font="16px system-ui";
      const sub="새로고침하면 재시작";
      ctx.fillText(sub, W/2-ctx.measureText(sub).width/2, H/2+28);
    }
  }

  window.OURender = window.OURender || {};
  window.OURender.drawMini = drawMini;
  window.OURender.draw = drawMain;
})();
