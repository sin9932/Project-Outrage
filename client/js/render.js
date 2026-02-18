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

  function drawMain(env){
    if (!env) return;
    const {
      canvas, ctx, cam, state, TEAM, MAP_W, MAP_H, TILE, ISO_X, ISO_Y,
      terrain, ore, explored, visible, BUILD, DEFENSE, BUILD_SPRITE, NAME_KO,
      units, buildings, bullets, traces, impacts, fires, healMarks, flashes, casings,
      gameOver, POWER,
      updateMoney, updateProdBadges,
      inMap, idx, tileToWorldCenter, worldToScreen,
      snapHoverToTileOrigin, buildingWorldFromTileOrigin, inBuildRadius, isBlockedFootprint, footprintBlockedMask,
      drawIsoTile, drawFootprintTiles, drawFootprintDiamond, drawRangeEllipseWorld, drawFootprintPrism,
      updateInfDeathFx, updateSnipDeathFx, drawInfDeathFxOne, drawSnipDeathFxOne,
      drawSelectionEllipseAt, drawUnitHpBlocks, drawBuildingHpBlocks, drawGroupBadge,
      drawWrenchFx, drawExplosions, drawSmokeWaves, drawDustPuffs, drawExp1Fxs,
      drawSmokePuffs, drawDmgSmokePuffs, drawBlood, drawClickWaves, drawPathFx, drawOrderFx, drawRallyPointsForSelection, drawHoverNameTooltip,
      rectFromDrag, refreshPrimaryBuildingBadgesUI,
      drawLiteTankSprite, drawHarvesterSprite,
      drawInfantrySprite, drawInfantryMoveEast, drawInfantryMoveNE, drawInfantryMoveN, drawInfantryMoveNW, drawInfantryMoveW, drawInfantryMoveSW, drawInfantryMoveS, drawInfantryMoveSE,
      drawSniperSprite, drawSniperMoveByDir,
      drawBuildingSprite, drawPrimaryBadgeForSelectedBuilding, drawLabel,
      worldVecToDir8,
      isUnderPower, clamp,
      INF_IMG, SNIP_IMG
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
        const ent = (env.getEntityById && env.getEntityById(id)) || null;
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
    for (let i=0;i<env.infDeathFxs.length;i++){
      const fx=env.infDeathFxs[i];
      if (!fx || !fx._rd) continue;
      drawables.push({ id: 9000000+i, kind: "_fx_inf_die", alive: true, team: fx.team, x: fx.x, y: fx.y, fxRef: fx });
    }
    for (let i=0;i<env.snipDeathFxs.length;i++){
      const fx=env.snipDeathFxs[i];
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
