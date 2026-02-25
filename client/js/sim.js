// sim.js
// - Simulation tick wrapper (movement/attack/collision orchestration)
// - Tick functions are injected via refs to avoid DOM dependencies.

(function (global) {
  "use strict";

  const OUSim = global.OUSim || (global.OUSim = {});

  OUSim.create = function create(refs) {
    const r = refs || {};

    const buildings = r.buildings || [];
    const units = r.units || [];
    const bullets = r.bullets || [];
    const flashes = r.flashes || [];
    const impacts = r.impacts || [];
    const explored = r.explored || [];
    const visible = r.visible || [];
    const fires = r.fires || [];
    const healMarks = r.healMarks || [];
    const casings = r.casings || [];
    const traces = r.traces || [];

    const TEAM = r.TEAM || {};
    const POWER = r.POWER || {};
    const DEFENSE = r.DEFENSE || {};
    const BUILD = r.BUILD || {};
    const UNIT = r.UNIT || {};
    const occAll = r.occAll || null;
    const occInf = r.occInf || null;
    const occVeh = r.occVeh || null;
    const occAnyId = r.occAnyId || null;
    const occId = occAnyId;
    const occTeam = r.occTeam || null;
    const occResId = r.occResId || null;
    const infSlotNext0 = r.infSlotNext0 || null;
    const infSlotNext1 = r.infSlotNext1 || null;
    const infSlotMask0 = r.infSlotMask0 || null;
    const infSlotMask1 = r.infSlotMask1 || null;
    const INF_SLOT_MAX = r.INF_SLOT_MAX || 4;
    const terrain = r.terrain || [];
    const treeHp = r.treeHp || null;
    const TILE = r.TILE || 48;
    const WORLD_W = r.WORLD_W || 0;
    const WORLD_H = r.WORLD_H || 0;
    const MAP_W = r.MAP_W || 0;
    const MAP_H = r.MAP_H || 0;
    const state = r.state || {};
    const ore = r.ore || [];
    const isGem = r.isGem || null;

    const clamp = r.clamp;
    const rnd = r.rnd;
    const getFogEnabled = r.getFogEnabled;
    const getPowerFactor = r.getPowerFactor;
    const isUnderPower = r.isUnderPower;
    const getEntityById = r.getEntityById;
    const dist2 = r.dist2;
    const worldVecToDir8 = r.worldVecToDir8;
    const worldToIso = r.worldToIso;
    const isoToWorld = r.isoToWorld;
    const tileOfX = r.tileOfX;
    const tileOfY = r.tileOfY;
    const tileToWorldCenter = r.tileToWorldCenter;
    const inMap = r.inMap;
    const idx = r.idx;

    let _aliveCache = [];
    const spawnTrailPuff = r.spawnTrailPuff;
    const spawnDmgSmokePuff = r.spawnDmgSmokePuff;
    const crushInfantry = r.crushInfantry;
    const captureBuilding = r.captureBuilding;
    const buildOcc = r.buildOcc;
    const tileToWorldSubslot = r.tileToWorldSubslot;
    const snapWorldToTileCenter = r.snapWorldToTileCenter;
    const findBypassStep = r.findBypassStep || (() => null);
    const getMoveSpeed = r.getMoveSpeed || (u => u.speed || 80);
    const _tankUpdateHull = r._tankUpdateHull || (() => {});

    function isBlockedWorldPoint(u, x, y) {
      const tx = tileOfX(x), ty = tileOfY(y);
      if (inMap(tx, ty) && buildOcc[idx(tx, ty)] === 1) return true;
      const ur = (UNIT[u.kind] && UNIT[u.kind].r) ? UNIT[u.kind].r : ((UNIT[u.kind] && UNIT[u.kind].cls === "veh") ? 12 : 8);
      const pad = 3;
      for (let i = 0; i < buildings.length; i++) {
        const b = buildings[i];
        if (!b || b.hp <= 0) continue;
        const hw = (b.w || 0) / 2 + ur + pad;
        const hh = (b.h || 0) / 2 + ur + pad;
        if (x >= b.x - hw && x <= b.x + hw && y >= b.y - hh && y <= b.y + hh) return true;
      }
      return false;
    }
    const _advanceTurnState = r._advanceTurnState;
    const _turnStepTowardTurret = r._turnStepTowardTurret;
    const _turretTurnFrameNum = r._turretTurnFrameNum;
    const boardUnitIntoIFV = r.boardUnitIntoIFV;
    const applyDamage = r.applyDamage;
    const _v = (typeof window !== "undefined" && window.__ou_veterancy) || null;
    const getVeteranCombat = r.getVeteranCombat || (_v && _v.getVeteranCombat) || (() => 1);
    const getVeteranROF = r.getVeteranROF || (_v && _v.getVeteranROF) || (() => 1);
    const applyEliteHeal = r.applyEliteHeal || (_v && _v.applyEliteHeal) || (() => {});
    const isWalkableTile = r.isWalkableTile;
    const updateExplosions = r.updateExplosions;
    const updateDebris = r.updateDebris;

    function recordKill(team, opts) {
      if (team != null && state.stats) {
        state.stats.kills[team] = (state.stats.kills[team] || 0) + 1;
        const m = state.stats.mvp;
        if (m && opts) {
          const isVeh = opts.targetKind && ["tank", "ifv", "harvester"].includes(opts.targetKind);
          const isInf = opts.targetCls === "inf" || (opts.targetKind && ["infantry", "engineer", "sniper"].includes(opts.targetKind));
          if (isVeh) m.vehicleKills[team] = (m.vehicleKills[team] || 0) + 1;
          if (isInf && opts.sniperKill) m.sniperInfantryKills[team] = (m.sniperInfantryKills[team] || 0) + 1;
        }
      }
    }
    function recordLoss(team) {
      if (team != null && state.stats) state.stats.losses[team] = (state.stats.losses[team] || 0) + 1;
    }
    function recordConstruction(team, kind) {
      if (team != null && state.stats) {
        state.stats.construction[team] = (state.stats.construction[team] || 0) + 1;
        if (kind === "turret" && state.stats.mvp) state.stats.mvp.turretBuilt[team] = (state.stats.mvp.turretBuilt[team] || 0) + 1;
      }
    }
    function recordCapture(team) {
      if (team != null && state.stats && state.stats.mvp) state.stats.mvp.engineerCaptures[team] = (state.stats.mvp.engineerCaptures[team] || 0) + 1;
    }
    function recordProduction(team, kind) {
      if (team != null && state.stats && state.stats.mvp) {
        const m = state.stats.mvp;
        if (["infantry", "engineer", "sniper"].includes(kind)) m.infantryProduced[team] = (m.infantryProduced[team] || 0) + 1;
        if (["tank", "ifv"].includes(kind)) m.armorProduced[team] = (m.armorProduced[team] || 0) + 1;
      }
    }

    function segIntersectsCircle(ax,ay,bx,by, cx,cy, r){
      // segment AB to circle C
      const vx = bx-ax, vy = by-ay;
      const wx = cx-ax, wy = cy-ay;
      const c1 = vx*wx + vy*wy;
      if (c1 <= 0){
        const d2 = (cx-ax)*(cx-ax) + (cy-ay)*(cy-ay);
        return d2 <= r*r;
      }
      const c2 = vx*vx + vy*vy;
      if (c2 <= c1){
        const d2 = (cx-bx)*(cx-bx) + (cy-by)*(cy-by);
        return d2 <= r*r;
      }
      const b = c1 / c2;
      const px = ax + b*vx, py = ay + b*vy;
      const d2 = (cx-px)*(cx-px) + (cy-py)*(cy-py);
      return d2 <= r*r;
    }

    function segIntersectsAABB(ax,ay,bx,by, x0,y0,x1,y1){
      // Liang-Barsky
      const dx = bx-ax, dy = by-ay;
      let t0 = 0, t1 = 1;
      const p = [-dx, dx, -dy, dy];
      const q = [ax-x0, x1-ax, ay-y0, y1-ay];
      for (let i=0;i<4;i++){
        const pi = p[i], qi = q[i];
        if (pi === 0){
          if (qi < 0) return false;
        } else {
          const r = qi / pi;
          if (pi < 0){
            if (r > t1) return false;
            if (r > t0) t0 = r;
          } else {
            if (r < t0) return false;
            if (r < t1) t1 = r;
          }
        }
      }
      return true;
    }

    function applyTreeDamageInRadius(x, y, radius) {
      if (!treeHp || !MAP_W || !MAP_H || !TILE) return;
      const r2 = radius * radius;
      const half = TILE / 2;
      for (let ty = 0; ty < MAP_H; ty++) {
        for (let tx = 0; tx < MAP_W; tx++) {
          const cx = tx * TILE + half, cy = ty * TILE + half;
          if (dist2(x, y, cx, cy) > r2) continue;
          const i = idx(tx, ty);
          if (treeHp[i] > 0) treeHp[i] -= 1;
        }
      }
    }

    function applyAreaDamageAt(x,y, radius, dmg, srcId=null, srcTeam=null, isExplosive=false){
      const r2 = radius*radius;
      for (const u of units){
        if (!u.alive || u.inTransport || u.hidden) continue;
        if (dist2(x,y,u.x,u.y) <= r2){ applyDamage(u, dmg, srcId, srcTeam); }
      }
      for (const b of buildings){
        if (!b.alive || b.civ) continue;
        if (dist2(x,y,b.x,b.y) <= r2){ applyDamage(b, dmg, srcId, srcTeam); }
      }
      if (isExplosive) applyTreeDamageInRadius(x, y, radius);
    }

    // Ore/gem can be damaged by explosives; damage = weapon damage (1:1), splash falls off linearly.
    function applyOreDamageInRadius(xWorld, yWorld, radiusWorld, dmg){
      if (!ore || radiusWorld <= 0) return;
      const r2 = radiusWorld * radiusWorld;
      const half = (TILE || 48) / 2;
      const PERCENT_AT_MAX = 0.02;
      for (let ty = 0; ty < MAP_H; ty++){
        for (let tx = 0; tx < MAP_W; tx++){
          if (!inMap(tx, ty) || ore[idx(tx,ty)] <= 0) continue;
          const cx = tx * TILE + half, cy = ty * TILE + half;
          const d2 = dist2(xWorld, yWorld, cx, cy);
          if (d2 > r2) continue;
          const dist = Math.sqrt(d2);
          const factor = dist <= 0 ? 1 : Math.max(PERCENT_AT_MAX, 1 - (dist / radiusWorld) * (1 - PERCENT_AT_MAX));
          const dig = dmg * factor;
          const ii = idx(tx,ty);
          ore[ii] = Math.max(0, ore[ii] - dig);
          if (ore[ii] <= 0 && terrain) terrain[ii] = 0;
        }
      }
    }

    function applyOreDamageSingleCell(tx, ty, dmg){
      if (!ore || !inMap(tx, ty) || ore[idx(tx,ty)] <= 0) return;
      const ii = idx(tx,ty);
      ore[ii] = Math.max(0, ore[ii] - (dmg || 0));
      if (ore[ii] <= 0 && terrain) terrain[ii] = 0;
    }

    function aggroDelay(u, base){
      if (!u) return base;
      return (u.team===TEAM.ENEMY) ? Math.max(0.08, base*0.5) : base;
    }

    function isInfantryUnit(e){
      if (!e || !e.alive) return false;
      if (BUILD[e.kind]) return false;
      return (UNIT[e.kind]?.cls==="inf");
    }

    function canCrushInf(u){
      return !!u && (u.kind==="tank" || u.kind==="harvester");
    }

    function isEnemyInf(e){
      if (!e || !e.alive) return false;
      if (BUILD[e.kind]) return false;
      return (UNIT[e.kind]?.cls==="inf");
    }

    function spawnTurretMGTracers(shooter, target){
      const fx = (DEFENSE.turret && DEFENSE.turret.fx) ? DEFENSE.turret.fx : null;

      const dx = target.x - shooter.x;
      const dy = target.y - shooter.y;
      const d = Math.hypot(dx, dy) || 1;
      const nx = dx/d, ny = dy/d;

      const blips = fx ? fx.blips : 4;
      const gap = fx ? fx.blipGap : 0.06;

      const tracerLife = 0.055;
      const muzzleLife = 0.060;

      for (let i=0;i<blips;i++){
        const delay = i*gap;

        // turret: straight line (no shotgun spread)
        const mx = shooter.x + nx*(12 + Math.random()*3);
        const my = shooter.y + ny*(12 + Math.random()*3);

        spawnTrace(mx, my, target.x, target.y, shooter.team, {
          kind:"tmg",
          life:tracerLife,
          delay,
          fx
        });

        // strong muzzle flash (radial gradient in draw)
        flashes.push({
          x: shooter.x + nx*14,
          y: shooter.y + ny*14,
          r: (fx ? fx.muzzleR : 42) * (0.92 + Math.random()*0.18),
          a: fx ? fx.muzzleA : 0.45,
          life: muzzleLife,
          delay
        });

        // impact sparks (small, quick)
        const sparks = 4;
        for (let k=0;k<sparks;k++){
          const ang = Math.random()*Math.PI*2;
          const spd = 120 + Math.random()*220;
          impacts.push({
            x: target.x + (Math.random()*2-1)*10,
            y: target.y + (Math.random()*2-1)*10,
            vx: Math.cos(ang)*spd,
            vy: Math.sin(ang)*spd,
            a: fx ? fx.impactA : 0.55,
            life: 0.10 + Math.random()*0.06,
            delay
          });
        }
      }
    }

    function buildingAnyExplored(viewerTeam, b){
      // Consider a building "known/visible" if any tile in its footprint is explored.
      // Using only (b.tx,b.ty) breaks for large buildings partially in fog.
      const ex = explored[viewerTeam];
      for (let ty=b.ty; ty<b.ty+b.th; ty++){
        for (let tx=b.tx; tx<b.tx+b.tw; tx++){
          if (!inMap(tx,ty)) continue;
          if (ex[idx(tx,ty)]) return true;
        }
      }
      return false;
    }

    function clearOcc(dt){
      if (!occAll || !occInf || !occVeh || !occAnyId || !occTeam || !occResId ||
          !infSlotNext0 || !infSlotNext1 || !infSlotMask0 || !infSlotMask1) return;

      occAll.fill(0);
      occInf.fill(0);
      occVeh.fill(0);
      occAnyId.fill(0);
      occTeam.fill(0);
      occResId.fill(0);
      infSlotNext0.fill(0);
      infSlotNext1.fill(0);
      infSlotMask0.fill(0);
      infSlotMask1.fill(0);
      // Rebuild reservations from units (kept in u.resTx/u.resTy)
      for (const u of units){
        if (!u.alive) continue;
        if (u.resTx!=null && u.resTy!=null && inMap(u.resTx,u.resTy)){
          const ri = idx(u.resTx,u.resTy);
          if ((occResId[ri]|0)===0) occResId[ri]=u.id;
        }
      }
      for (const u of units){
        if (!u.alive) continue;
        if (u.sepCd && u.sepCd>0){ u.sepCd -= dt; if (u.sepCd<=0){ u.sepCd=0; u.sepOx=0; u.sepOy=0; } }
        const tx=tileOfX(u.x), ty=tileOfY(u.y);
        if (!inMap(tx,ty)) continue;
        const i=idx(tx,ty);
        if (occAnyId[i]===0){ occAnyId[i]=u.id; occTeam[i]=u.team; }
        const cls = (UNIT[u.kind] && UNIT[u.kind].cls) ? UNIT[u.kind].cls : "";
        if (cls==="inf") {
          // Allow up to 4 infantry per tile (same-team only via canEnterTile rules)
          occInf[i] = Math.min(255, occInf[i]+1);

          // Stable per-unit sub-slot: keep the same slot while staying in the same tile.
          let mask = (u.team===0) ? infSlotMask0[i] : infSlotMask1[i];

          let slot = -1;
          if (u.subSlot!=null && u.subSlotTx===tx && u.subSlotTy===ty) slot = (u.subSlot & 3);

          // keep existing slot if free this frame, else pick first free slot.
          if (slot>=0 && ((mask >> slot) & 1)===0){
            // ok
          } else {
            slot = -1;
            for (let s=0; s<INF_SLOT_MAX; s++){
              if (((mask >> s) & 1)===0){ slot=s; break; }
            }
            if (slot<0) slot = 0;
          }

          u.subSlot = slot;
          u.subSlotTx = tx; u.subSlotTy = ty;
          mask = (mask | (1<<slot)) & 0x0F;

          if (u.team===0) infSlotMask0[i] = mask;
          else infSlotMask1[i] = mask;
        }
        else if (cls==="veh") occVeh[i] = Math.min(255, occVeh[i]+1);
        occAll[i] = Math.min(255, occAll[i]+1);
      }
    }

    function updateOccForUnitMove(u, oldTx, oldTy, newTx, newTy){
      if (!occAll || !occInf || !occVeh || !occAnyId || !occTeam || !infSlotMask0 || !infSlotMask1) return;
      if (!u.alive || u.inTransport) return;
      const cls = (UNIT[u.kind] && UNIT[u.kind].cls) ? UNIT[u.kind].cls : "";
      const oi = idx(oldTx, oldTy);
      const ni = idx(newTx, newTy);
      if (inMap(oldTx, oldTy)){
        occAll[oi] = Math.max(0, (occAll[oi]||0) - 1);
        if (cls==="inf"){
          occInf[oi] = Math.max(0, (occInf[oi]||0) - 1);
          const mask = (u.team===0) ? infSlotMask0[oi] : infSlotMask1[oi];
          const slot = (u.subSlot!=null && u.subSlotTx===oldTx && u.subSlotTy===oldTy) ? (u.subSlot & 3) : 0;
          const cleared = (mask & ~(1<<slot)) & 0x0F;
          if (u.team===0) infSlotMask0[oi] = cleared; else infSlotMask1[oi] = cleared;
        } else if (cls==="veh") occVeh[oi] = Math.max(0, (occVeh[oi]||0) - 1);
        if ((occAll[oi]||0)<=0){ occAnyId[oi]=0; occTeam[oi]=0; }
      }
      if (inMap(newTx, newTy)){
        if ((occAnyId[ni]||0)===0){ occAnyId[ni]=u.id; occTeam[ni]=u.team; }
        if (cls==="inf"){
          occInf[ni] = Math.min(255, (occInf[ni]||0) + 1);
          let mask = (u.team===0) ? infSlotMask0[ni] : infSlotMask1[ni];
          let slot = (u.subSlot!=null && u.subSlotTx===newTx && u.subSlotTy===newTy && ((mask>>(u.subSlot&3))&1)===0) ? (u.subSlot&3) : -1;
          if (slot<0){ for (let s=0;s<4;s++){ if (((mask>>s)&1)===0){ slot=s; break; } } if (slot<0) slot=0; }
          u.subSlot=slot; u.subSlotTx=newTx; u.subSlotTy=newTy;
          mask=(mask|(1<<slot))&0x0F;
          if (u.team===0) infSlotMask0[ni]=mask; else infSlotMask1[ni]=mask;
        } else if (cls==="veh") occVeh[ni] = Math.min(255, (occVeh[ni]||0) + 1);
        occAll[ni] = Math.min(255, (occAll[ni]||0) + 1);
      }
    }

    function tickTurrets(dt){
      for (const b of buildings){
        if (!b.alive || b.civ || b.kind!=="turret") continue;
        if (b.shootCd>0) b.shootCd -= dt;

        const pf=getPowerFactor ? getPowerFactor(b.team) : 1;
        const spec=DEFENSE.turret;
        const rof=spec.rofBase/pf;
        const range=spec.range;
        if (b.shootCd>0) continue;

        // Low power: powered defenses go offline
        if (POWER.turretUse>0 && isUnderPower && isUnderPower(b.team)){
          continue;
        }
        // Force-fire/force-attack overrides auto-targeting.
        if (b.forceFire){
          if (b.forceFire.mode==="id"){
            const t = getEntityById ? getEntityById(b.forceFire.id) : null;
            if (!t || !t.alive || t.attackable===false){ b.forceFire=null; }
            else {
              const d2=dist2(b.x,b.y,t.x,t.y);
              if (d2<=range*range){
                b.shootCd=rof;
                if (spawnTurretMGTracers) spawnTurretMGTracers(b, t);
                const dmg = (t.cls==="inf") ? (spec.dmgInf ?? spec.dmg) : spec.dmg;
                if (applyDamage) applyDamage(t, dmg, b.id, b.team);
              }
              continue;
            }
          } else if (b.forceFire.mode==="pos"){
            const tx=b.forceFire.x, ty=b.forceFire.y;
            const d2=dist2(b.x,b.y, tx, ty);
            if (d2<=range*range){
              b.shootCd=rof;
              if (spawnTurretMGTracers) spawnTurretMGTracers(b, {x:tx, y:ty, cls:"pos"});
              if (applyAreaDamageAt) applyAreaDamageAt(tx,ty, 18, Math.max(1, spec.dmg*0.35), b.id, b.team);
            }
            continue;
          }
        }

        const enemyTeam = b.team===TEAM.PLAYER ? TEAM.ENEMY : TEAM.PLAYER;
        let best=null, bestD=Infinity;

        // target enemy units
        for (const u of units){
          if (!u.alive || u.team!==enemyTeam || u.inTransport || u.hidden) continue;
          if (u.kind==="sniper" && u.cloaked) continue;
          const tx=tileOfX(u.x), ty=tileOfY(u.y);
          if (inMap(tx,ty) && !visible[b.team][idx(tx,ty)]) continue;
          const d2=dist2(b.x,b.y,u.x,u.y);
          if (d2<bestD){ bestD=d2; best=u; }
        }

        // also target enemy buildings
        for (const bb of buildings){
          if (!bb.alive || bb.civ) continue;
          if (bb.team!==enemyTeam) continue;
          if (bb.attackable===false) continue;
          const tx=bb.tx, ty=bb.ty;
          if (inMap(tx,ty) && !visible[b.team][idx(tx,ty)]) continue;
          const d2=dist2(b.x,b.y,bb.x,bb.y);
          if (d2<bestD){ bestD=d2; best=bb; }
        }

        if (best && bestD<=range*range){
          b.shootCd = rof;
          if (spawnTurretMGTracers) spawnTurretMGTracers(b, best);
          const dmg = (best.cls==="inf") ? (spec.dmgInf ?? spec.dmg) : spec.dmg;
          if (applyDamage) applyDamage(best, dmg, b.id, b.team);
        }
      }
    }

    function tickBullets(dt){
      // bullets + shells

      function explodeMissile(bl, ix, iy){
        // impact FX (missile)
        flashes.push({x: ix, y: iy, r: 44 + Math.random()*10, life: 0.10, delay: 0});
        for (let k=0;k<6;k++){
          const ang = Math.random()*Math.PI*2;
          const spd = 70 + Math.random()*160;
          impacts.push({x:ix,y:iy,vx:Math.cos(ang)*spd,vy:Math.sin(ang)*spd,life:0.20,delay:0});
        }

        // direct hit + splash
        const t = (bl.tid!=null) ? getEntityById(bl.tid) : null;
        if (t && t.alive && t.attackable!==false && t.team!==bl.team){
          // If we have an explicit hit target, always apply direct damage.
          if (applyDamage) applyDamage(t, (bl.dmg||0), bl.ownerId, bl.team);
        } else {
          // Fallback: if no explicit target id, still allow edge/side hits on buildings
          const enemyTeam = bl.team===TEAM.PLAYER ? TEAM.ENEMY : TEAM.PLAYER;
          for (const b of buildings){
            if (!b.alive || b.team!==enemyTeam) continue;
            if (b.attackable===false) continue;
            const x0=b.x-b.w/2-2, y0=b.y-b.h/2-2;
            const x1=x0+b.w+4, y1=y0+b.h+4;
            if (ix>=x0 && ix<=x1 && iy>=y0 && iy<=y1){
              if (applyDamage) applyDamage(b, (bl.dmg||0), bl.ownerId, bl.team);
              break;
            }
          }
        }

        // splash (units/buildings); 폭발형이라 나무도 피격
        if (applyAreaDamageAt) applyAreaDamageAt(ix, iy, 38, (bl.dmg||0)*0.45, bl.ownerId, bl.team, true);
        // Missile damages ore/gem in radius, linear falloff.
        applyOreDamageInRadius(ix, iy, 38, bl.dmg||0);
      }


      for (let i=bullets.length-1;i>=0;i--){
        const bl = bullets[i];

        if (bl.kind==="shell"){
          // track moving target so shells can actually hit infantry
          if (bl.tid){
            const tEnt = getEntityById(bl.tid);
            if (tEnt && tEnt.alive){ bl.x1 = tEnt.x; bl.y1 = tEnt.y; }
          }
          bl.t += dt / (bl.dur||0.25);
          const t = Math.min(1, bl.t);
          bl.x = bl.x0 + (bl.x1 - bl.x0)*t;
          bl.y = bl.y0 + (bl.y1 - bl.y0)*t;

          if (t >= 1){
            // impact at destination
            let hit=null;

            // Friendly-fire support (CTRL force-attack testing)
            if (bl.allowFriendly && bl.tid){
              const tEnt = getEntityById(bl.tid);
              if (tEnt && tEnt.alive && !tEnt.inTransport && !tEnt.hidden){
                hit = tEnt;
              }
            }

            const enemyTeam = bl.team===TEAM.PLAYER ? TEAM.ENEMY : TEAM.PLAYER;

            if (!hit){
              // units
              for (const u of units){
                if (!u.alive || u.team!==enemyTeam || u.inTransport || u.hidden) continue;
                const tx=tileOfX(u.x), ty=tileOfY(u.y);
                if (enemyTeam===TEAM.ENEMY){
                  if (inMap(tx,ty) && !explored[TEAM.PLAYER][idx(tx,ty)]) continue;
                }
                if (dist2(bl.x, bl.y, u.x, u.y) <= (u.r+10)*(u.r+10)){ hit=u; break; }
              }
              // buildings
              if (!hit){
                for (const b of buildings){
                  if (!b.alive || b.team!==enemyTeam) continue;
                  if (b.attackable===false) continue;
                  if (enemyTeam===TEAM.ENEMY){
                    if (!buildingAnyExplored(TEAM.PLAYER,b)) continue;
                  }
                  const x0=b.x-b.w/2, y0=b.y-b.h/2;
                  if (bl.x>=x0-8 && bl.x<=x0+b.w+8 && bl.y>=y0-8 && bl.y<=y0+b.h+8){ hit=b; break; }
                }
              }
            }

            // dmg bonus: tank
            let dmg = bl.dmg;
            const owner = getEntityById(bl.ownerId);
            if (owner && owner.kind==="tank"){
              // slightly reduced vs infantry
              if (hit && hit.cls==="inf") dmg *= 0.70;
              // modest bonus vs vehicles/buildings
              if (hit && (BUILD[hit.kind] || hit.kind==="tank")) dmg *= 1.15;
            }

            if (hit) applyDamage(hit, dmg, bl.ownerId, bl.team);

            // impact FX
            flashes.push({x: bl.x, y: bl.y, r: 48 + Math.random()*10, life: 0.10, delay: 0});
            for (let k=0;k<6;k++){
              const ang = Math.random()*Math.PI*2;
              const spd = 60 + Math.random()*140;
              impacts.push({x:bl.x,y:bl.y,vx:Math.cos(ang)*spd,vy:Math.sin(ang)*spd,life:0.22,delay:0});
            }

            // 경전차 포탄: 폭발 반경 내 나무 1회 피격 (RA2 스타일)
            if (applyTreeDamageInRadius) applyTreeDamageInRadius(bl.x, bl.y, 22);
            // Tank shell damages ore/gem at impact cell (weapon damage = ore credit loss 1:1)
            try{
              const owner2 = getEntityById(bl.ownerId);
              if (owner2 && owner2.kind==="tank"){
                const txi=(bl.x/TILE)|0, tyi=(bl.y/TILE)|0;
                applyOreDamageSingleCell(txi, tyi, dmg||0);
              }
            }catch(_e){}

            bullets.splice(i,1);
          }
          continue;
        }

        // normal bullet (linear)
        bl.life -= dt;
        const px = bl.x, py = bl.y;
        bl.x += bl.vx*dt;
        bl.y += bl.vy*dt;

        // Swept collision for missiles to prevent tunneling through buildings at high speed.
        if (bl.kind==="missile"){
          const enemyTeam = bl.team===TEAM.PLAYER ? TEAM.ENEMY : TEAM.PLAYER;
          let hit=null;

          for (const u of units){
            if (!u.alive||u.team!==enemyTeam||u.inTransport||u.hidden) continue;
            const txU=tileOfX(u.x), tyU=tileOfY(u.y);
            if (enemyTeam===TEAM.ENEMY){
              if (inMap(txU,tyU) && !explored[TEAM.PLAYER][idx(txU,tyU)]) continue;
            }
            const rr = (u.r||18) + 3;
            if (segIntersectsCircle(px,py, bl.x,bl.y, u.x,u.y, rr)){ hit=u; break; }
          }
          if (!hit){
            for (const b of buildings){
              if (!b.alive||b.team!==enemyTeam) continue;
              if (b.attackable===false) continue;
              if (enemyTeam===TEAM.ENEMY){
                if (!buildingAnyExplored(TEAM.PLAYER,b)) continue;
              }
              const x0=b.x-b.w/2-2, y0=b.y-b.h/2-2;
              const x1=x0+b.w+4, y1=y0+b.h+4;
              if (segIntersectsAABB(px,py, bl.x,bl.y, x0,y0,x1,y1)){ hit=b; break; }
            }
          }
          if (hit){
            bl.tid = hit.id;
            explodeMissile(bl, bl.x, bl.y);
            bullets.splice(i,1);
            continue;
          }
        }

        if (bl.life<=0){
          if (bl.kind==="missile"){
            const ix = (bl.tx??bl.x), iy = (bl.ty??bl.y);
            explodeMissile(bl, ix, iy);
          }
          bullets.splice(i,1); continue;
        }

        const enemyTeam = bl.team===TEAM.PLAYER ? TEAM.ENEMY : TEAM.PLAYER;
        let hit=null;

        for (const u of units){
          if (!u.alive||u.team!==enemyTeam||u.inTransport||u.hidden) continue;
          const tx=tileOfX(u.x), ty=tileOfY(u.y);
          if (enemyTeam===TEAM.ENEMY){
            if (inMap(tx,ty) && !explored[TEAM.PLAYER][idx(tx,ty)]) continue;
          }
          if (dist2(bl.x,bl.y,u.x,u.y) <= u.r*u.r){ hit=u; break; }
        }
        if (!hit){
          for (const b of buildings){
            if (!b.alive||b.team!==enemyTeam) continue;
            if (b.attackable===false) continue;
            if (enemyTeam===TEAM.ENEMY){
              if (!buildingAnyExplored(TEAM.PLAYER,b)) continue;
            }
            const x0=b.x-b.w/2, y0=b.y-b.h/2;
            if (bl.x>=x0 && bl.x<=x0+b.w && bl.y>=y0 && bl.y<=y0+b.h){ hit=b; break; }
          }
        }
        if (hit){
          if (bl.kind==="missile"){
            bl.tid = hit.id;
            explodeMissile(bl, bl.x, bl.y);
            bullets.splice(i,1);
            continue;
          }
          let dmg = bl.dmg;
          const owner = getEntityById(bl.ownerId);
          if (owner && owner.kind==="tank"){
            if (BUILD[hit.kind] || hit.kind==="tank") dmg *= 1.25;
          }
          if (applyDamage) applyDamage(hit, dmg, bl.ownerId, bl.team);
          bullets.splice(i,1);
        }
      }
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

      if (updateExplosions) updateExplosions(dt);
      if (updateDebris) updateDebris(dt);

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

    function resolveUnitOverlaps(){
      const clsOf = (u)=> (u && UNIT[u.kind] && UNIT[u.kind].cls) ? UNIT[u.kind].cls : "";
      const effCollR = (u)=> (clsOf(u)==="inf" ? 9 : (u.r||18));
      _aliveCache.length = 0;
      for (const u of units) if (u.alive && !u.inTransport) _aliveCache.push(u);
      const alive = _aliveCache;
      const n = alive.length;
      if (n<2) return;

      const isImmovableInCombat = (u)=>{
        if (!u || !u.alive) return false;
        if (!u.order || u.order.type!=="attack") return false;
        if ((u.fireHoldT||0) > 0) return true;
        if (!u.holdAttack) return false;
        if (u.target==null) return false;
        const t = getEntityById(u.target);
        if (!t || !t.alive) return false;
        const dEff = _effDist(u, t, u.x, u.y);
        return (dEff <= (u.range + 1.0));
      };

      const isAnchored = (u)=>{
        if (!u || !u.alive) return false;
        if (u.path && u.path.length && u.pathI < u.path.length) return false;
        if (u.target!=null){
          const tt = getEntityById(u.target);
          if (!tt || !tt.alive || tt.attackable===false){ u.target=null; }
        }
        if (u.target!=null) return false;
        const ot = u.order && u.order.type;
        if (ot && ot!=="idle" && ot!=="guard") return false;
        if (u.kind==="harvester" && (u.returning || u.manualOre!=null)) return false;
        return true;
      };

      const cell = 64;
      const grid = new Map();
      const key = (cx,cy)=> (cx<<16) ^ cy;

      const iters = n > 50 ? 3 : 5;
      const basePushK = 0.85;
      const baseMaxPush = 18.0;
      const eps = 1.0;

      for (let it=0; it<iters; it++){
        grid.clear();
        for (const uu of alive){
          uu._sepAx = 0; uu._sepAy = 0;
          if (clsOf(uu)==="inf") continue;
          const cx2 = (uu.x/cell)|0, cy2=(uu.y/cell)|0;
          const k2 = key(cx2,cy2);
          let arr2 = grid.get(k2);
          if (!arr2){ arr2=[]; grid.set(k2,arr2); }
          arr2.push(uu);
        }

        for (const u of alive){
          if (clsOf(u)==="inf") continue;
          const cx = (u.x/cell)|0, cy=(u.y/cell)|0;
          for (let oy=-1; oy<=1; oy++){
            for (let ox=-1; ox<=1; ox++){
              const arr = grid.get(key(cx+ox,cy+oy));
              if (!arr) continue;
              for (const v of arr){
                if (v===u) continue;
                if (v.id < u.id) continue;

                const cu = clsOf(u);
                const cv = clsOf(v);
                if (cu==="inf" && cv==="inf") continue;
                const dx = v.x - u.x;
                const dy = v.y - u.y;
                const rr = (effCollR(u)+effCollR(v));
                const d2 = dx*dx + dy*dy;
                if (d2 >= rr*rr) continue;

                const d = Math.sqrt(d2) || 0.001;
                const overlap = rr - d;
                if (overlap <= eps) continue;
                const nx = dx / d, ny = dy / d;
                const pushK = basePushK;
                const maxPush = baseMaxPush;
                const push = Math.min(maxPush, overlap * pushK);

                const au = isAnchored(u);
                const av = isAnchored(v);

                const hu = isImmovableInCombat(u);
                const hv = isImmovableInCombat(v);
                if (hu && hv) continue;

                let wu = 0.5, wv = 0.5;
                if (au && !av){ wu = 0.0; wv = 1.0; }
                else if (!au && av){ wu = 1.0; wv = 0.0; }
                if (hu && !hv){ wu = 0.0; wv = 1.0; }
                else if (!hu && hv){ wu = 1.0; wv = 0.0; }
                if (u.kind==="harvester" && v.kind!=="harvester"){ wu = 0.08; wv = 0.92; }
                else if (v.kind==="harvester" && u.kind!=="harvester"){ wu = 0.92; wv = 0.08; }
                if (cu==="inf" && cv!=="inf"){ wu = 1.0; wv = 0.0; }
                else if (cv==="inf" && cu!=="inf"){ wu = 0.0; wv = 1.0; }

                u._sepAx = (u._sepAx||0) - nx * push * wu;
                u._sepAy = (u._sepAy||0) - ny * push * wu;
                v._sepAx = (v._sepAx||0) + nx * push * wv;
                v._sepAy = (v._sepAy||0) + ny * push * wv;
              }
            }
          }
        }

        // Apply accumulated separation with damping to prevent "진동"
        // 보병은 bothInf 스킵으로 다른 보병에게서는 _sepAx 없음. 차량에 밀릴 때만 적용.
        for (const uu of alive){
          let ax = uu._sepAx || 0;
          let ay = uu._sepAy || 0;
          if (ax===0 && ay===0){ uu._sepAx = 0; uu._sepAy = 0; continue; }

          const damp = 0.55;
          ax *= damp; ay *= damp;

          const lx = uu._lastSepAx || 0;
          const ly = uu._lastSepAy || 0;
          if ((lx!==0 || ly!==0) && (ax*lx + ay*ly) < 0){
            const blend = 0.25;
            ax = ax*blend + lx*(1-blend);
            ay = ay*blend + ly*(1-blend);
          }

          const mag = Math.hypot(ax, ay);
          const maxStep = (clsOf(uu)==="inf") ? 4.0 : 6.0;
          if (mag > maxStep){
            const k = maxStep / (mag || 1);
            ax *= k; ay *= k;
          }

          uu.x += ax;
          uu.y += ay;

          uu._lastSepAx = ax;
          uu._lastSepAy = ay;

          uu._sepAx = 0; uu._sepAy = 0;
        }
      }
      // Attack-hold anchor
      for (const uu of alive){
        const holdAtk = isImmovableInCombat(uu);
        if (!holdAtk){
          uu.atkX = null; uu.atkY = null;
          continue;
        }
        if (uu.atkX==null || uu.atkY==null){ uu.atkX = uu.x; uu.atkY = uu.y; }
        uu.x = uu.atkX;
        uu.y = uu.atkY;
      }
    }

    // v1415: combat goal selection for backline congestion.
    function _distPointToRect(px,py,x0,y0,x1,y1){
      const dx = Math.max(x0 - px, 0, px - x1);
      const dy = Math.max(y0 - py, 0, py - y1);
      return Math.hypot(dx, dy);
    }

    function _effDist(u, t, px, py){
      // Effective distance from point (px,py) to the target's hittable boundary.
      const ur = (u && u.r) ? u.r : 0;
      if (!t) return 1e9;
      const isB = (t.type==="building") || !!BUILD[t.kind];
      if (isB){
        const tw = (t.tw!=null)? t.tw : (t.w!=null? Math.max(1, Math.round(t.w/TILE)) : 1);
        const th = (t.th!=null)? t.th : (t.h!=null? Math.max(1, Math.round(t.h/TILE)) : 1);
        const tx = (t.tx!=null)? t.tx : ((t.x/TILE)|0);
        const ty = (t.ty!=null)? t.ty : ((t.y/TILE)|0);
        const x0 = tx*TILE, y0 = ty*TILE;
        const x1 = (tx+tw)*TILE, y1 = (ty+th)*TILE;
        const d = _distPointToRect(px,py,x0,y0,x1,y1);
        return Math.max(0, d - ur);
      } else {
        const raw = Math.hypot(t.x - px, t.y - py);
        return Math.max(0, raw - (t.r||0) - ur);
      }
    }

    function _occNearTile(tx, ty){
      let n = 0;
      for (const uu of units){
        if (!uu.alive) continue;
        const ux = (uu.x / TILE) | 0, uy = (uu.y / TILE) | 0;
        if (Math.abs(ux - tx) <= 1 && Math.abs(uy - ty) <= 1) n++;
      }
      return n;
    }

    function pickAttackTile(u, t, preferDist){
      const maxR = Math.max(2, Math.min(12, Math.ceil((u.range || 0) / TILE) + 4));
      const tTx = (t.x / TILE) | 0, tTy = (t.y / TILE) | 0;

      let best = null, bestScore = 1e18;
      for (let r = 0; r <= maxR; r++){
        for (let dy = -r; dy <= r; dy++){
          for (let dx = -r; dx <= r; dx++){
            if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
            const tx = tTx + dx, ty = tTy + dy;
            if (!inMap(tx, ty)) continue;
            if (!isWalkableTile(tx, ty)) continue;

            const cx = (tx + 0.5) * TILE, cy = (ty + 0.5) * TILE;
            const dEff = _effDist(u, t, cx, cy);
            if (dEff > (u.range || 0)) continue;

            const occ = _occNearTile(tx, ty);
            const distPref = Math.abs(dEff - preferDist);
            const travel = Math.hypot(cx - u.x, cy - u.y) / TILE;

            const score = distPref*1.00 + travel*0.65 + occ*0.95 + (Math.random()*0.06);
            if (score < bestScore){
              bestScore = score;
              best = {x: cx, y: cy};
            }
          }
        }
        if (best && r >= 2 && bestScore < 7.0) break;
      }
      return best;
    }

    function pickApproachTile(u, t){
      const maxR = Math.max(3, Math.min(18, Math.ceil(((u.range || 0) + (TILE*3)) / TILE) + 6));
      const tTx = (t.x / TILE) | 0, tTy = (t.y / TILE) | 0;

      let best = null, bestScore = 1e18;
      const maxEff = (u.range || 0) + (TILE*3.0);
      for (let r = 1; r <= maxR; r++){
        for (let dy = -r; dy <= r; dy++){
          for (let dx = -r; dx <= r; dx++){
            if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
            const tx = tTx + dx, ty = tTy + dy;
            if (!inMap(tx, ty)) continue;
            if (!isWalkableTile(tx, ty)) continue;

            const cx = (tx + 0.5) * TILE, cy = (ty + 0.5) * TILE;
            const dEff = _effDist(u, t, cx, cy);
            if (dEff > maxEff) continue;

            const occ = _occNearTile(tx, ty);
            const travel = Math.hypot(cx - u.x, cy - u.y) / TILE;

            const score = dEff*0.020 + travel*0.85 + occ*1.00 + (Math.random()*0.08);
            if (score < bestScore){
              bestScore = score;
              best = {x: cx, y: cy};
            }
          }
        }
        if (best && bestScore < 10.0) break;
      }
      return best;
    }

    function getCombatGoal(u, t){
      const isB = !!BUILD[t.kind];
      let gx = t.x, gy = t.y;

      if (isB){
        const x0 = (t.x - (t.w||0)/2), y0 = (t.y - (t.h||0)/2);
        const pad = TILE * 0.55;
        const rx0 = x0 - pad, ry0 = y0 - pad;
        const rx1 = x0 + (t.w||0) + pad, ry1 = y0 + (t.h||0) + pad;
        gx = clamp(u.x, rx0, rx1);
        gy = clamp(u.y, ry0, ry1);
      } else {
        let dx = u.x - t.x, dy = u.y - t.y;
        let L = Math.hypot(dx,dy);
        if (L < 1e-3){ dx = 1; dy = 0; L = 1; }
        const stop = Math.max(10, (u.range||0) * 0.88);
        gx = t.x + (dx / L) * stop;
        gy = t.y + (dy / L) * stop;
      }

      let gTx = tileOfX(gx), gTy = tileOfY(gy);
      if (!inMap(gTx,gTy)){ gTx = clamp(gTx,0,MAP_W-1); gTy = clamp(gTy,0,MAP_H-1); }

      if (!isWalkableTile(gTx,gTy)){
        let best=null, bestD=1e9;
        for (let r=1;r<=10;r++){
          for (let dy=-r;dy<=r;dy++){
            for (let dx=-r;dx<=r;dx++){
              const tx=gTx+dx, ty=gTy+dy;
              if (!inMap(tx,ty)) continue;
              if (!isWalkableTile(tx,ty)) continue;
              const d = dx*dx+dy*dy;
              if (d<bestD){ bestD=d; best={tx,ty}; }
            }
          }
          if (best) break;
        }
        if (best){ gTx=best.tx; gTy=best.ty; }
      }

      u.combatGX = (gTx+0.5)*TILE;
      u.combatGY = (gTy+0.5)*TILE;
      u.combatGoalMode = "commit";
      u.combatGoalT = 0.40;

      return {x:u.combatGX, y:u.combatGY};
    }

    // Pick an attack standoff point around the target so clumped units don't all try to stand on the same pixel.
    function getStandoffPoint(u, t, wantDist, isB, targetRad, seedAng){
      const tid = (t && t.id!=null) ? t.id : 0;
      const h = (((u.id*9301 + tid*49297 + 233280*7) % 233280) / 233280);
      const jitter = (h - 0.5);

      const base = (seedAng!=null && isFinite(seedAng)) ? seedAng : Math.atan2(u.y - t.y, u.x - t.x);

      const lateral = jitter * TILE * 0.95;

      const minDist = (targetRad||0) + Math.max((u.r||0) + 10, TILE*0.35);
      const startDist = (targetRad||0) + Math.max(wantDist, TILE*0.45);

      const radii = [];
      for (let r = startDist; r >= minDist; r -= TILE*0.55){
        radii.push(r);
        if (radii.length>=6) break;
      }
      if (!radii.length) radii.push(startDist);

      const angs = [];
      angs.push(base + jitter*1.35);
      for (let k=1;k<=6;k++){
        const s = (k%2?1:-1);
        const step = 0.34 + 0.20*Math.floor((k-1)/2);
        angs.push(base + jitter*1.10 + s*step);
      }

      const uTx = tileOfX(u.x), uTy = tileOfY(u.y);

      for (const dist of radii){
        for (const ang of angs){
          let gx = t.x + Math.cos(ang)*dist + Math.cos(ang + Math.PI/2)*lateral;
          let gy = t.y + Math.sin(ang)*dist + Math.sin(ang + Math.PI/2)*lateral;
          gx = clamp(gx, 0, WORLD_W);
          gy = clamp(gy, 0, WORLD_H);
          const tx=(gx/TILE)|0, ty=(gy/TILE)|0;
          if (!inMap(tx,ty)) continue;
          if (!isWalkableTile(tx,ty)) continue;

          const okGoal = (tx===uTx && ty===uTy) || canEnterTile(u, tx, ty) || (isB && !isSqueezedTile(tx,ty));
          if (okGoal) return {x:gx,y:gy};
        }
      }

      if (isB){
        const dock = getDockPoint(t,u);
        return {x:dock.x, y:dock.y};
      }

      const rawD = Math.hypot(t.x-u.x, t.y-u.y);
      const dist = clamp((targetRad||0) + wantDist, minDist, startDist);
      if (rawD > 1){
        const nx = (u.x - t.x)/rawD, ny = (u.y - t.y)/rawD;
        let gx = t.x + nx*dist, gy = t.y + ny*dist;
        gx = clamp(gx, 0, WORLD_W);
        gy = clamp(gy, 0, WORLD_H);
        return {x:gx, y:gy};
      }
      return {x:u.x, y:u.y};
    }

    const dist2PointToRect = (r.dist2PointToRect || (global.OU && global.OU.dist2PointToRect)) || function(px,py,rx,ry,rw,rh){ const hx=rw*0.5, hy=rh*0.5; const dx=Math.max(Math.abs(px-rx)-hx,0); const dy=Math.max(Math.abs(py-ry)-hy,0); return dx*dx+dy*dy; };

    function getClosestPointOnBuilding(b, u){
      const x0 = b.tx*TILE, y0 = b.ty*TILE;
      const x1 = (b.tx+b.tw)*TILE, y1 = (b.ty+b.th)*TILE;
      const pad = (u && u.r) ? u.r*0.45 : TILE*0.20;
      const px = clamp(u ? u.x : (x0+x1)*0.5, x0-pad, x1+pad);
      const py = clamp(u ? u.y : (y0+y1)*0.5, y0-pad, y1+pad);
      return {x:px, y:py};
    }

    function getDockPoint(b, u){
      const x0 = b.tx*TILE, y0 = b.ty*TILE;
      const x1 = (b.tx+b.tw)*TILE, y1 = (b.ty+b.th)*TILE;
      const cx = (x0+x1)*0.5, cy = (y0+y1)*0.5;
      const pad = (u && u.r) ? u.r*0.65 : TILE*0.25;
      const px = clamp(u ? u.x : cx, x0-pad, x1+pad);
      const py = clamp(u ? u.y : cy, y0-pad, y1+pad);
      const candidates = [
        {x: x1 + pad, y: cy},
        {x: x0 - pad, y: cy},
        {x: cx, y: y1 + pad},
        {x: cx, y: y0 - pad},
        {x: px, y: py},
      ];
      const uTx = u ? tileOfX(u.x) : -999;
      const uTy = u ? tileOfY(u.y) : -999;
      let best = null, bestD = 1e18;
      for (const c of candidates){
        const tx=(c.x/TILE)|0, ty=(c.y/TILE)|0;
        if (!inMap(tx,ty)) continue;
        if (!isWalkableTile(tx,ty)) continue;
        if (!u) return c;
        if (canEnterTileGoal(u, tx, ty, b) || (tx===uTx && ty===uTy)){
          const d2 = (u.x - c.x)**2 + (u.y - c.y)**2;
          if (d2 < bestD){ bestD = d2; best = c; }
        }
      }
      return best || candidates[candidates.length-1];
    }

    function isReservedByOther(u, tx, ty){
      if (!inMap(tx,ty)) return false;
      const cls = (UNIT[u.kind] && UNIT[u.kind].cls) ? UNIT[u.kind].cls : "";
      if (cls==="inf") return false;
      const i = idx(tx,ty);
      const rid = occResId[i]|0;
      return (rid!==0 && rid!==u.id);
    }

    function reserveTile(u, tx, ty){
      if (!inMap(tx,ty)) return false;
      const cls = (UNIT[u.kind] && UNIT[u.kind].cls) ? UNIT[u.kind].cls : "";
      if (cls==="inf") { u.resTx=-1; u.resTy=-1; return true; }
      const i = idx(tx,ty);
      const rid = occResId[i]|0;
      if (rid===0 || rid===u.id){
        occResId[i]=u.id;
        u.resTx = tx; u.resTy = ty;
        return true;
      }
      return false;
    }

    function isSqueezedTile(tx, ty){
      const B = (x,y)=> (inMap(x,y) && buildOcc[idx(x,y)]===1);
      if (B(tx-1,ty) && B(tx+1,ty)) return true;
      if (B(tx,ty-1) && B(tx,ty+1)) return true;
      if (B(tx-1,ty) && B(tx,ty-1)) return true;
      if (B(tx+1,ty) && B(tx,ty-1)) return true;
      if (B(tx-1,ty) && B(tx,ty+1)) return true;
      if (B(tx+1,ty) && B(tx,ty+1)) return true;
      return false;
    }

    function findNearestFreeStep(u){
      if (!u) return null;
      const s = snapWorldToTileCenter(u.x, u.y);
      const baseTx = s.tx, baseTy = s.ty;
      for (let r=1; r<=4; r++){
        let best = null;
        let bestD = 1e9;
        for (let dy=-r; dy<=r; dy++){
          for (let dx=-r; dx<=r; dx++){
            if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
            const tx = baseTx + dx;
            const ty = baseTy + dy;
            if (!inMap(tx,ty)) continue;
            if (!isWalkableTile(tx,ty)) continue;
            if (isSqueezedTile(tx,ty)) continue;
            const i = idx(tx,ty);
            if (occAll[i] !== 0) continue;
            if (isReservedByOther(u, tx, ty)) continue;
            const c = tileToWorldCenter(tx,ty);
            if (isBlockedWorldPoint(u, c.x, c.y)) continue;
            const d = dx*dx + dy*dy;
            if (d < bestD){
              bestD = d;
              best = {tx, ty};
            }
          }
        }
        if (best) return best;
      }
      return null;
    }

    function canEnterTileGoal(u, tx, ty, t){
      if (!inMap(tx,ty)) return false;
      if (!isWalkableTile(tx,ty)) return false;
      if (isSqueezedTile(tx,ty)) return false;

      const isB = !!(t && BUILD[t.kind]);
      if (isB && t && t.tx!=null && t.ty!=null && t.tw!=null && t.th!=null){
        if (tx>=t.tx && tx<(t.tx+t.tw) && ty>=t.ty && ty<(t.ty+t.th)) return false;
      } else {
        const c = tileToWorldCenter(tx,ty);
        if (isBlockedWorldPoint(u, c.x, c.y)) return false;
      }

      const i = idx(tx,ty);
      {
        const ucls = (UNIT[u.kind] && UNIT[u.kind].cls) ? UNIT[u.kind].cls : "";
        if (ucls==="inf"){
          if (occVeh[i] > 0) return false;
          if (occTeam[i]!==0 && occTeam[i]!==u.team) return false;
          if (occInf[i] >= INF_SLOT_MAX) return false;
          return true;
        }
        if (ucls==="veh" && canCrushInf(u)){
          if (occInf[i] > 0 && occTeam[i] === u.team) return false;
          const other = (occAll[i]||0) - (occInf[i]||0);
          return (occVeh[i] <= 0) && (other < 1);
        }
      }
      if (occTeam[i]===0) return true;
      if (occTeam[i]===u.team && occId[i]===u.id) return true;

      const otherId = occId[i];
      if (otherId!=null){
        const other = getEntityById(otherId);
        if (other && other.alive && other.type==="unit"){
          const ocls = (UNIT[other.kind] && UNIT[other.kind].cls) ? UNIT[other.kind].cls : "";
          const ucls = (UNIT[u.kind] && UNIT[u.kind].cls) ? UNIT[u.kind].cls : "";
          if (ucls==="veh" && ocls!=="veh"){
            if (canCrushInf(u) && ocls==="inf") return true;
          } else if (ucls!=="veh" && ocls==="veh"){
            if (!other.yieldCd || other.yieldCd<=0){
              other.yieldCd = 0.18;
              const step = findNearestFreeStep(other);
              if (step){
                setPathTo(other, (step.tx+0.5)*TILE, (step.ty+0.5)*TILE);
              }
            }
          }
        }
      }
      return (occTeam[i]===0);
    }

    function canEnterTile(u, tx, ty){
      if (!inMap(tx,ty)) return false;
      if (!isWalkableTile(tx,ty)) return false;
      if (isSqueezedTile(tx,ty)) return false;
      {
        const c = tileToWorldCenter(tx,ty);
        if (isBlockedWorldPoint(u, c.x, c.y)) return false;
      }
      if (u.kind==="harvester"){
        const i = idx(tx,ty);
        if (isReservedByOther(u, tx, ty)) return false;
        if (canCrushInf(u)){
          if (occInf[i] > 0 && occTeam[i] === u.team) return false;
          const other = (occAll[i]||0) - (occInf[i]||0);
          return (occVeh[i] <= 0) && (other < 1);
        }
        return occAll[i] < 1;
      }
      if (isReservedByOther(u, tx, ty)) return false;
      const i = idx(tx,ty);
      const cls = (UNIT[u.kind] && UNIT[u.kind].cls) ? UNIT[u.kind].cls : "";
      if (cls==="veh"){
        if (canCrushInf(u)){
          if (occInf[i] > 0 && occTeam[i] === u.team) return false;
          const other = (occAll[i]||0) - (occInf[i]||0);
          return (occVeh[i] <= 0) && (other < 1);
        }
        return occAll[i] < 1;
      }
      if (cls==="inf") {
        if (occVeh[i] > 0) return false;
        if (occTeam[i]!==0 && occTeam[i]!==u.team) return false;
        return occInf[i] < INF_SLOT_MAX;
      }
      return occAll[i] < 2;
    }

    function followPathInfantry(u, dt){
      if (u && u.order && (u.order.type==="idle" || u.order.type==="guard") && u.target==null){
        if (u.path){ u.path = null; u.pathI = 0; }
        u.stuckT = 0; u.yieldCd = 0;
        return false;
      }
      if (!u.path || u.pathI >= u.path.length){
        const ot = (u.order && u.order.type) ? u.order.type : null;
        if (ot==="move" || ot==="guard_return" || ot==="attackmove"){
          const gx = (u.order && u.order.x!=null) ? u.order.x : u.x;
          const gy = (u.order && u.order.y!=null) ? u.order.y : u.y;
          const d2 = dist2(u.x,u.y,gx,gy);
          if (d2 < 12*12){
            u.x = gx; u.y = gy;
            u.vx = 0; u.vy = 0;
            u.path = null; u.pathI = 0;
            clearReservation(u);
            if (ot==="attackmove"){
              u.guard = {x0:u.x, y0:u.y};
              u.order = {type:"guard", x:u.x, y:u.y, tx:null, ty:null};
            } else {
              u.order = {type:"idle", x:u.x, y:u.y, tx:null, ty:null};
            }
            return false;
          }
        }
        return false;
      }
      if (u.yieldCd && u.yieldCd>0){ u.yieldCd -= dt; if (u.yieldCd>0) return false; u.yieldCd=0; }

      const p = u.path[u.pathI];
      const curTx = tileOfX(u.x), curTy = tileOfY(u.y);

      const isLastTile = (u.pathI >= u.path.length - 1);
      let wx = (p.tx+0.5)*TILE, wy = (p.ty+0.5)*TILE;
      const ni = idx(p.tx,p.ty);
      let mask = (u.team===0) ? infSlotMask0[ni] : infSlotMask1[ni];
      let slot = -1;
      if (u.navSlot!=null && u.navSlotTx===p.tx && u.navSlotTy===p.ty){ slot = (u.navSlot & 3); }
      else {
        for (let s=0; s<4; s++){ if (((mask>>s)&1)===0){ slot=s; break; } }
        if (slot>=0){ u.navSlot=slot; u.navSlotTx=p.tx; u.navSlotTy=p.ty; }
      }
      if (slot>=0 && isLastTile){ const sp=tileToWorldSubslot(p.tx,p.ty,slot); wx=sp.x; wy=sp.y; }

      if (u.holdPos && curTx===p.tx && curTy===p.ty) return false;

      if (!(p.tx===curTx && p.ty===curTy)){
        const _tGoal = (u.target!=null) ? getEntityById(u.target) : null;
        const _combatOrder = (u.order && (u.order.type==="attack" || u.order.type==="attackmove"));
        const _canEnter = (_combatOrder && _tGoal && BUILD[_tGoal.kind]) ? canEnterTileGoal(u, p.tx, p.ty, _tGoal) : canEnterTile(u, p.tx, p.ty);
        if (!_canEnter || !reserveTile(u, p.tx, p.ty)){
          if (slot<0){
            u.vx=0; u.vy=0;
            u.queueWaitT = (u.queueWaitT||0) + dt;
            if (u.queueWaitT > 2.5 && u.order && (u.order.x!=null || u.order.tx!=null)){
              const gx = (u.order.tx!=null) ? (u.order.tx+0.5)*TILE : (u.order.x!=null ? u.order.x : u.x);
              const gy = (u.order.ty!=null) ? (u.order.ty+0.5)*TILE : (u.order.y!=null ? u.order.y : u.y);
              if ((u._queueRetryT==null || (state.t - u._queueRetryT) > 1.2)){
                u._queueRetryT = state.t; u.queueWaitT = 0;
                setPathTo(u, gx, gy);
                return true;
              }
            }
            return false;
          }
          const pi = idx(p.tx, p.ty);
          const blockedByEnemy = (occTeam && occTeam[pi]!==0 && occTeam[pi]!==u.team);
          const blockerId = blockedByEnemy ? (occAnyId && occAnyId[pi]|0) : 0;
          const blocker = blockerId ? getEntityById(blockerId) : null;
          const canEngageBlocker = blocker && blocker.alive && blocker.attackable!==false &&
            (u.dmg||0)>0 && (u.range||0)>0 && u.kind!=="engineer" && u.kind!=="harvester" &&
            dist2(u.x, u.y, blocker.x, blocker.y) <= ((u.range||0)*(u.range||0));
          if (blockedByEnemy && canEngageBlocker){
            u.target = blocker.id;
            u.order = {type:"attack", x:u.x, y:u.y, tx:null, ty:null, manual:!!(u.team===TEAM.ENEMY), allowAuto:!(u.team===TEAM.ENEMY), lockTarget:!!(u.team===TEAM.ENEMY)};
            setPathTo(u, blocker.x, blocker.y);
            u.pathI = 0; clearReservation(u);
            return true;
          }
          u.vx=0; u.vy=0;
          u.blockT = (u.blockT||0) + dt;
          if (u.blockT > 4.0 && u.pathI >= (u.path.length-1)){
            u.order={type:"idle",x:u.x,y:u.y,tx:null,ty:null};
            u.path=null; u.pathI=0; clearReservation(u); u.blockT=0;
            return false;
          }
          return false;
        }
      }

      const dx=wx-u.x, dy=wy-u.y, d=Math.hypot(dx,dy);
      const ARRIVE_EPS = 4;
      if (d < ARRIVE_EPS){
        if (u.pathI >= (u.path.length-1)){
          const slot2 = (u.navSlot!=null && u.navSlotTx===p.tx && u.navSlotTy===p.ty) ? (u.navSlot&3) : ((u.order && u.order.tx===p.tx && u.order.ty===p.ty && u.order.subSlot!=null) ? (u.order.subSlot|0) : (u.subSlot|0));
          const sp = tileToWorldSubslot(p.tx, p.ty, slot2);
          u.x = sp.x; u.y = sp.y; u.vx = 0; u.vy = 0; u.holdPos = true;
        }
        u.pathI++; clearReservation(u);
        if (u.pathI >= u.path.length){
          u.vx = 0; u.vy = 0; u.path = null; u.pathI = 0; clearReservation(u);
          const ot2 = (u.order && u.order.type) ? u.order.type : null;
          if (ot2==="attackmove"){ u.guard={x0:u.x,y0:u.y}; u.order={type:"guard",x:u.x,y:u.y,tx:null,ty:null}; }
          else if (ot2==="move"||ot2==="guard_return"){ u.order={type:"idle",x:u.x,y:u.y,tx:null,ty:null}; }
        }
        u.blockT = 0; u.stuckT = 0;
        return true;
      }

      const targetTile = u.path[u.pathI];
      if (targetTile && (targetTile.tx!==curTx || targetTile.ty!==curTy)){
        if (!reserveTile(u, targetTile.tx, targetTile.ty) || isReservedByOther(u, targetTile.tx, targetTile.ty)) return false;
        if (!canEnterTile(u, targetTile.tx, targetTile.ty)) return false;
      }

      u.queueWaitT = 0;
      const speed = getMoveSpeed(u)||80;
      const baseStep = speed * dt;
      const easeIn = (d < 18) ? Math.max(0.4, d/18) : 1;
      const step = Math.min(baseStep * easeIn, d);
      const ax = dx/(d||1), ay = dy/(d||1);
      const nx = u.x + ax*step, ny = u.y + ay*step;
      const ntx = tileOfX(nx), nty = tileOfY(ny);
      if (!isWalkableTile(ntx,nty)) return false;
      if (ntx!==curTx || nty!==curTy){
        if (!canEnterTile(u, ntx, nty) || isReservedByOther(u, ntx, nty)) return false;
      }
      if (isBlockedWorldPoint(u, nx, ny)) return false;

      u.x = clamp(nx, 0, WORLD_W);
      u.y = clamp(ny, 0, WORLD_H);
      const velMag = (dt > 0) ? (step / dt) : (speed || 80);
      u.vx = ax * velMag;
      u.vy = ay * velMag;
      u.faceDir = worldVecToDir8(ax, ay);
      u.dir = u.faceDir;
      u.blockT = 0;
      u.stuckT = Math.max(0, (u.stuckT||0) - dt*0.5);
      return true;
    }

    function followPath(u, dt){
      const ucls = (UNIT[u.kind] && UNIT[u.kind].cls) ? UNIT[u.kind].cls : "";
      if (ucls==="inf") return followPathInfantry(u, dt);
      if (u && u.order && (u.order.type==="idle" || u.order.type==="guard") && u.target==null){
        if (u.path){ u.path = null; u.pathI = 0; }
        u.stuckT = 0; u.yieldCd = 0;
        return false;
      }
      if (!u.path || u.pathI >= u.path.length){
        const ot = (u.order && u.order.type) ? u.order.type : null;
        if (ot==="move" || ot==="guard_return" || ot==="attackmove"){
          const gx = (u.order && u.order.x!=null) ? u.order.x : u.x;
          const gy = (u.order && u.order.y!=null) ? u.order.y : u.y;
          const d2 = dist2(u.x,u.y,gx,gy);
          if (d2 < 16*16){
            u.x = gx; u.y = gy;
            u.vx = 0; u.vy = 0;
            u.path = null; u.pathI = 0;
            clearReservation(u);
            if (ot==="attackmove"){
              u.guard = {x0:u.x, y0:u.y};
              u.order = {type:"guard", x:u.x, y:u.y, tx:null, ty:null};
            } else {
              u.order = {type:"idle", x:u.x, y:u.y, tx:null, ty:null};
            }
            return false;
          }
        }
        return false;
      }
      if (u.yieldCd && u.yieldCd>0){ u.yieldCd -= dt; if (u.yieldCd>0) return false; u.yieldCd=0; }

      const p = u.path[u.pathI];
      let wx = (p.tx+0.5)*TILE, wy=(p.ty+0.5)*TILE;

      const curTx = tileOfX(u.x), curTy = tileOfY(u.y);
      if (!(p.tx===curTx && p.ty===curTy)){
        const _tGoal = (u && u.target!=null) ? getEntityById(u.target) : null;
        const _combatOrder = (u && u.order && (u.order.type==="attack" || u.order.type==="attackmove"));
        const _canEnter = (_combatOrder && _tGoal && BUILD[_tGoal.kind]) ? canEnterTileGoal(u, p.tx, p.ty, _tGoal) : canEnterTile(u, p.tx, p.ty);
        if (!_canEnter || !reserveTile(u, p.tx, p.ty)) {
          if (u.pathI >= (u.path.length-1)) {
            u.finalBlockT = (u.finalBlockT||0) + dt;
            if (u.finalBlockT > 0.18 && (u.lastRetargetT==null || (state.t - u.lastRetargetT) > 0.50)) {
              const goalWx = (p.tx+0.5)*TILE, goalWy = (p.ty+0.5)*TILE;
              const spot = findNearestFreePoint(goalWx, goalWy, u, 3);
              const nTx = tileOfX(spot.x), nTy = tileOfY(spot.y);
              if ((nTx!==p.tx || nTy!==p.ty) && canEnterTile(u, nTx, nTy) && reserveTile(u, nTx, nTy)) {
                const wp2 = tileToWorldCenter(nTx, nTy);
                u.order = {type:(u.order && u.order.type) ? u.order.type : "move", x:wp2.x, y:wp2.y, tx:nTx, ty:nTy};
                setPathTo(u, wp2.x, wp2.y);
                u.lastRetargetT = state.t;
                u.finalBlockT = 0;
                return true;
              }
            }
          }
          const step = (u.cls!=="inf") ? findBypassStep(u, curTx, curTy, p.tx, p.ty) : null;
          if (step && reserveTile(u, step.tx, step.ty)){
            u.path = [{tx:step.tx, ty:step.ty}, ...u.path.slice(u.pathI)];
            u.pathI = 0;
            return true;
          }
          u.blockT = (u.blockT||0) + dt;
          if (u.blockT > 0.48){
            const pi = idx(p.tx, p.ty);
            const blockedByEnemy = (occTeam[pi]!==0 && occTeam[pi]!==u.team);
            const blockerId = blockedByEnemy ? (occAnyId[pi]|0) : 0;
            const blocker = blockerId ? getEntityById(blockerId) : null;
            const canEngageBlocker = blocker && blocker.alive && blocker.attackable!==false &&
              (u.dmg||0)>0 && (u.range||0)>0 && u.kind!=="engineer" && u.kind!=="harvester" &&
              dist2(u.x, u.y, blocker.x, blocker.y) <= ((u.range||0)*(u.range||0));
            if (blockedByEnemy && canEngageBlocker){
              u.target = blocker.id;
              u.order = {type:"attack", x:u.x, y:u.y, tx:null, ty:null, manual:!!(u.team===TEAM.ENEMY), allowAuto:!(u.team===TEAM.ENEMY), lockTarget:!!(u.team===TEAM.ENEMY)};
              setPathTo(u, blocker.x, blocker.y);
              u.pathI = 0;
              clearReservation(u);
              u.blockT = 0;
              u.repathCd = 0.15;
              u.combatGoalT = 0;
              return true;
            }
            const cwx=(curTx+0.5)*TILE, cwy=(curTy+0.5)*TILE;
            u.x=cwx; u.y=cwy;
            const _combatLocked = (u.target!=null && u.order && (u.order.type==="attack" || u.order.type==="attackmove"));
            if (_combatLocked){
              u.path=null; u.pathI=0;
              clearReservation(u);
              u.yieldCd=0;
              u.blockT=0;
              u.repathCd = 0;
              u.combatGoalT = 0;
              return false;
            }
            u.order = {type:"idle", x:u.x, y:u.y, tx:null, ty:null};
            u.path=null; u.pathI=0;
            clearReservation(u);
            u.yieldCd=0;
            u.blockT=0;
            return false;
          }
          u.yieldCd = 0.10;
          return false;
        }
      }

      const dx=wx-u.x, dy=wy-u.y;
      const d=Math.hypot(dx,dy);

      if (u.stuckT==null){ u.stuckT=0; u.lastX=u.x; u.lastY=u.y; }

      if (d < 2 || (u.pathI >= (u.path.length-1) && d < 12)){
        if (u.pathI >= (u.path.length-1)){
          const sx = (p.tx+0.5)*TILE, sy = (p.ty+0.5)*TILE;
          u.x = sx; u.y = sy;
        }
        u.holdPos = false;
        u.pathI++;
        clearReservation(u);
        if (u.pathI >= u.path.length){
          const ot2 = (u.order && u.order.type) ? u.order.type : null;
          u.vx = 0; u.vy = 0;
          u.path = null; u.pathI = 0;
          clearReservation(u);
          if (ot2==="attackmove"){
            u.guard = {x0:u.x, y0:u.y};
            u.order = {type:"guard", x:u.x, y:u.y, tx:null, ty:null};
          } else if (ot2==="move" || ot2==="guard_return"){
            u.order = {type:"idle", x:u.x, y:u.y, tx:null, ty:null};
          }
        }
        u.blockT = 0;
        u.stuckT = 0;
        return true;
      }

      const curTileTx=tileOfX(u.x), curTileTy=tileOfY(u.y);
      if (u.pathI>0){
        const nextTile = u.path[u.pathI];
        if (!(nextTile.tx===curTileTx && nextTile.ty===curTileTy)){
          if (!reserveTile(u, nextTile.tx, nextTile.ty) || isReservedByOther(u, nextTile.tx, nextTile.ty)){
            const bp = (u.cls!=="inf") ? findBypassStep(u, curTileTx, curTileTy, nextTile.tx, nextTile.ty) : null;
            if (bp){
              u.path.splice(u.pathI, 0, {tx:bp.tx, ty:bp.ty});
              return true;
            }
          }
          if (!canEnterTile(u, nextTile.tx, nextTile.ty)){
            if (u.order && (u.order.type==="move" || u.order.type==="attackmove") && u.pathI >= (u.path.length-1)){
              const dd = dist2(u.x,u.y,u.order.x,u.order.y);
              if (dd < 58*58){
                u.order = {type:"idle", x:u.x, y:u.y, tx:null, ty:null};
                u.path = null; u.pathI = 0;
                clearReservation(u);
                u.stuckTime = 0;
                return false;
              }
            }
            if ((u.avoidCd||0) <= 0 && u.cls!=="inf"){
              const bypass = findBypassStep(u, curTileTx, curTileTy, nextTile.tx, nextTile.ty);
              if (bypass){
                u.path.splice(u.pathI, 0, bypass);
                u.avoidCd = 0.45;
              } else {
                u.avoidCd = 0.25;
              }
            }
            return true;
          }
        }
      }

      const step=Math.min(getMoveSpeed(u)*dt, d);
      let ax=dx/(d||1), ay=dy/(d||1);
      // RA2 style: 보병은 회피 없이 목표로 직진 (위글+렉 근본 해결)
      if (u.cls!=="inf"){
        let avoidX=0, avoidY=0;
        for (let j=0;j<units.length;j++){
          const o=units[j];
          if (!o.alive || o.id===u.id) continue;
          const same = (o.team===u.team);
          const rr = (u.r+o.r) + (same?14:4);
          const dx2=u.x-o.x, dy2=u.y-o.y;
          const dd=dx2*dx2+dy2*dy2;
          if (dd<=0.0001 || dd>rr*rr) continue;
          const inv = 1/Math.sqrt(dd);
          const push = (rr - Math.sqrt(dd)) * (same?1.15:0.35);
          avoidX += dx2*inv*push;
          avoidY += dy2*inv*push;
        }
        const alen = Math.hypot(avoidX,avoidY);
        if (alen>0.0001){
          const mix = 0.55;
          const nx = avoidX/alen, ny = avoidY/alen;
          ax = ax*(1-mix) + nx*mix;
          ay = ay*(1-mix) + ny*mix;
          const nlen = Math.hypot(ax,ay)||1;
          ax/=nlen; ay/=nlen;
        }
      }

      const movingDir = (Math.abs(ax) + Math.abs(ay)) > 1e-4;
      if ((u.fireHoldT||0) > 0 && u.fireDir!=null){
        u.faceDir = u.fireDir;
        if (u.kind !== "tank" && u.kind !== "harvester"){
          u.dir = u.fireDir;
        } else {
          if (u.bodyDir==null) u.bodyDir = (u.dir!=null ? u.dir : 6);
          u.dir = u.bodyDir;
        }
      } else if (movingDir){
        const fd = worldVecToDir8(ax, ay);
        if (u.kind === "tank" || u.kind === "harvester"){
          if (u.bodyDir == null) u.bodyDir = (u.dir!=null ? u.dir : 6);
          if (fd !== u.bodyDir){
            _tankUpdateHull(u, fd, dt);
            u.dir = u.bodyDir;
            u.faceDir = (u.fireDir!=null ? u.fireDir : (u.turretDir!=null ? u.turretDir : u.bodyDir));
            return true;
          }
          u.bodyTurn = null;
          u.bodyDir = fd;
          u.dir = fd;
          u.faceDir = (u.fireDir!=null ? u.fireDir : fd);
        } else {
          u.faceDir = fd;
          u.dir = fd;
        }
      } else {
        if (u.faceDir==null) u.faceDir = 6;
        if (u.dir==null) u.dir = u.faceDir;
      }

      const nx=u.x+ax*step, ny=u.y+ay*step;
      const ntx=tileOfX(nx), nty=tileOfY(ny);
      if (!isWalkableTile(ntx,nty)){ return false; }
      if (!(ntx===curTx && nty===curTy)){
        const blockedNext = (!canEnterTile(u, ntx, nty) || isReservedByOther(u, ntx, nty));
        if (blockedNext){
          u.blockT = (u.blockT||0) + dt;
          if ((u.avoidCd||0) <= 0 && u.cls!=="inf"){
            const bypass = findBypassStep(u, curTx, curTy, ntx, nty);
            if (bypass){
              u.path.splice(u.pathI, 0, bypass);
              u.avoidCd = 0.45;
            } else {
              const g = (u.path && u.path.length) ? u.path[u.path.length-1] : {tx:ntx,ty:nty};
              const gp = findNearestFreePoint((g.tx+0.5)*TILE,(g.ty+0.5)*TILE,u,5);
              setPathTo(u, gp.x, gp.y);
              u.avoidCd = 0.35;
            }
          }
          u.yieldCd = Math.max(u.yieldCd||0, 0.10);
          return false;
        }
      }
      if (isBlockedWorldPoint(u, nx, ny)){
        const px = -ay, py = ax;
        for (const sgn of [1,-1]){
          const sx = u.x + px*step*sgn;
          const sy = u.y + py*step*sgn;
          const stx = tileOfX(sx), sty = tileOfY(sy);
          if (isWalkableTile(stx, sty) && canEnterTile(u, stx, sty) && !isBlockedWorldPoint(u, sx, sy)){
            u.x = clamp(sx,0,WORLD_W);
            u.y = clamp(sy,0,WORLD_H);
            u.blockT = 0;
            return true;
          }
        }
        const sx1 = u.x + ax*step;
        const sy1 = u.y;
        const stx1 = tileOfX(sx1), sty1 = tileOfY(sy1);
        if (isWalkableTile(stx1, sty1) && canEnterTile(u, stx1, sty1) && !isBlockedWorldPoint(u, sx1, sy1)){
          u.x = clamp(sx1,0,WORLD_W);
          u.y = clamp(sy1,0,WORLD_H);
          u.blockT = 0;
          return true;
        }
        const sx2 = u.x;
        const sy2 = u.y + ay*step;
        const stx2 = tileOfX(sx2), sty2 = tileOfY(sy2);
        if (isWalkableTile(stx2, sty2) && canEnterTile(u, stx2, sty2) && !isBlockedWorldPoint(u, sx2, sy2)){
          u.x = clamp(sx2,0,WORLD_W);
          u.y = clamp(sy2,0,WORLD_H);
          u.blockT = 0;
          return true;
        }
        u.blockT = (u.blockT||0) + dt;
        if (u.path && u.path.length && u.pathI < u.path.length){
          const goal = u.path[u.path.length-1];
          const curTx2 = tileOfX(u.x), curTy2 = tileOfY(u.y);
          let best=null, bestScore=1e18;
          for (let dy=-1; dy<=1; dy++){
            for (let dx=-1; dx<=1; dx++){
              if (dx===0 && dy===0) continue;
              const tx = curTx2+dx, ty = curTy2+dy;
              if (!inMap(tx,ty)) continue;
              if (!isWalkableTile(tx,ty)) continue;
              if (!canEnterTile(u, tx, ty)) continue;
              const c = tileToWorldCenter(tx,ty);
              if (isBlockedWorldPoint(u, c.x, c.y)) continue;
              const h = (tx-goal.tx)*(tx-goal.tx) + (ty-goal.ty)*(ty-goal.ty);
              const turn = (dx*dx+dy*dy===2) ? 0.15 : 0.0;
              const score = h + turn;
              if (score < bestScore){ bestScore=score; best={tx,ty}; }
            }
          }
          if (best){
            u.path[u.pathI] = {tx:best.tx, ty:best.ty};
            reserveTile(u, best.tx, best.ty);
            u.blockT = 0;
            u.yieldCd = Math.max(u.yieldCd||0, 0.12);
            return false;
          }
        }
        if ((u.avoidCd||0) <= 0){
          const gx0 = (u.order && u.order.tx!=null) ? (u.order.tx+0.5)*TILE : wx;
          const gy0 = (u.order && u.order.ty!=null) ? (u.order.ty+0.5)*TILE : wy;
          const spot = findNearestFreePoint(gx0, gy0, u, 5);
          const gx = spot && spot.found ? spot.x : gx0;
          const gy = spot && spot.found ? spot.y : gy0;
          setPathTo(u, gx, gy);
          u.avoidCd = 0.45;
        }
        if (u.blockT > 0.95){
          const cwx=(tileOfX(u.x)+0.5)*TILE, cwy=(tileOfY(u.y)+0.5)*TILE;
          u.x=cwx; u.y=cwy;
          u.order = {type:"idle", x:u.x, y:u.y, tx:null, ty:null};
          u.path=null; u.pathI=0;
          clearReservation(u);
          u.blockT=0;
          return false;
        }
        u.yieldCd = Math.max(u.yieldCd||0, 0.12);
        return false;
      }
      u.x=clamp(nx,0,WORLD_W);
      u.y=clamp(ny,0,WORLD_H);

      const moved = Math.hypot(u.x-(u.lastX||u.x), u.y-(u.lastY||u.y));
      u.lastX=u.x; u.lastY=u.y;
      if (moved < 0.25 && d > 6) u.stuckT += dt; else u.stuckT = Math.max(0, u.stuckT - dt*0.5);

      if (u.stuckT > 0.75){
        const goal = (u.path && u.path.length) ? u.path[u.path.length-1] : null;
        u.stuckT = 0;
        clearReservation(u);
        if (goal && (u.kind==="tank" || u.kind==="harvester" || (u.cls==="veh"))){
          setPathTo(u, (goal.tx+0.5)*TILE, (goal.ty+0.5)*TILE);
          u.yieldCd = Math.max(u.yieldCd||0, 0.15);
          return true;
        } else if (goal){
          const b = (u.cls!=="inf") ? findBypassStep(u, curTx, curTy, goal.tx, goal.ty) : null;
          if (b){ u.path.splice(u.pathI, 0, b); }
          else { setPathTo(u, (goal.tx+0.5)*TILE, (goal.ty+0.5)*TILE); }
          u.yieldCd = Math.max(u.yieldCd||0, 0.12);
          return true;
        } else {
          const cwx=(curTx+0.5)*TILE, cwy=(curTy+0.5)*TILE;
          u.x=cwx; u.y=cwy;
          u.order={type:"idle", x:u.x, y:u.y, tx:null, ty:null};
          u.path=null; u.pathI=0;
          return false;
        }
      }
      return true;
    }

    function heuristic(ax,ay,bx,by){
      const dx=Math.abs(ax-bx), dy=Math.abs(ay-by);
      const D=10, D2=14;
      return D*(dx+dy) + (D2-2*D)*Math.min(dx,dy);
    }

    function aStarPath(sx,sy,gx,gy, maxNodes=12000){
      if (!inMap(sx,sy) || !inMap(gx,gy)) return null;
      if (!isWalkableTile(gx,gy)) return null;

      const W=MAP_W, H=MAP_H;
      const N=W*H;

      const open = new Int32Array(N);
      let openN=0;

      const inOpen = new Uint8Array(N);
      const closed = new Uint8Array(N);
      const gScore = new Int32Array(N);
      const fScore = new Int32Array(N);
      const came = new Int32Array(N);

      for (let i=0;i<N;i++){ gScore[i]=1e9; fScore[i]=1e9; came[i]=-1; }

      const s = sy*W+sx;
      const g = gy*W+gx;

      open[0]=s; inOpen[s]=1; openN=1;
      gScore[s]=0; fScore[s]=heuristic(sx,sy,gx,gy);

      const dirs = [
        [1,0,10],[-1,0,10],[0,1,10],[0,-1,10],
        [1,1,14],[1,-1,14],[-1,1,14],[-1,-1,14]
      ];

      let nodes = 0;
      while (openN>0 && nodes++ < maxNodes){
        let bestI=0, best=open[0], bestF=fScore[best];
        for (let i=1;i<openN;i++){
          const n=open[i];
          const f=fScore[n];
          if (f<bestF){ bestF=f; best=n; bestI=i; }
        }
        openN--;
        open[bestI]=open[openN];
        inOpen[best]=0;

        const cx=best%W, cy=(best/W)|0;
        if (best===g) break;
        closed[best]=1;

        for (let di=0;di<dirs.length;di++){
          const nx=cx+dirs[di][0], ny=cy+dirs[di][1];
          if (!inMap(nx,ny)) continue;
          const ni=ny*W+nx;
          if (closed[ni]) continue;
          if (!isWalkableTile(nx,ny)) continue;
          const cost=dirs[di][2];
          const tent=gScore[best]+cost;
          if (tent < gScore[ni]){
            came[ni]=best;
            gScore[ni]=tent;
            fScore[ni]=tent + heuristic(nx,ny,gx,gy);
            if (!inOpen[ni]){
              open[openN++]=ni;
              inOpen[ni]=1;
              if (openN>=N-4) break;
            }
          }
        }
      }

      if (came[g]===-1 && g!==s) return null;

      const path=[];
      let cur=g;
      path.push(cur);
      while (cur!==s){
        cur=came[cur];
        if (cur===-1) break;
        path.push(cur);
      }
      path.reverse();

      const out=[];
      let last=-1;
      for (let i=0;i<path.length;i++){
        const n=path[i];
        if (n===last) continue;
        last=n;
        out.push({tx:n%W, ty:(n/W)|0});
      }
      return out;
    }

  const MAX_ASTAR_EXPAND = 900;
  function aStarPathOcc(u, sx, sy, gx, gy){
      if (!inMap(sx,sy) || !inMap(gx,gy)) return null;
      const W=MAP_W, H=MAP_H, N=W*H;
      const s=sy*W+sx, g=gy*W+gx;
      if (s===g) return [{tx:sx, ty:sy}];

      const open = new Int32Array(N);
      const inOpen = new Uint8Array(N);
      const closed = new Uint8Array(N);
      const came = new Int32Array(N);
      const gScore = new Float32Array(N);
      const fScore = new Float32Array(N);
      for (let i=0;i<N;i++){ came[i]=-1; gScore[i]=1e9; fScore[i]=1e9; }

      function h(x,y, tx,ty){ return Math.abs(x-tx)+Math.abs(y-ty); }

      open[0]=s; inOpen[s]=1;
      gScore[s]=0; fScore[s]=h(sx,sy,gx,gy);
      let openN=1;
      let expanded = 0;

      const dirs = [
        [1,0,1],[-1,0,1],[0,1,1],[0,-1,1],
        [1,1,1.42],[1,-1,1.42],[-1,1,1.42],[-1,-1,1.42],
      ];

      while (openN>0){
        if (expanded >= MAX_ASTAR_EXPAND) return null;
        expanded++;
        let bestI=0, best=open[0], bestF=fScore[best];
        for (let i=1;i<openN;i++){
          const n=open[i];
          const f=fScore[n];
          if (f<bestF){ bestF=f; best=n; bestI=i; }
        }
        openN--;
        open[bestI]=open[openN];
        inOpen[best]=0;

        const cx=best%W, cy=(best/W)|0;
        if (best===g) break;
        closed[best]=1;

        for (let di=0;di<dirs.length;di++){
          const nx=cx+dirs[di][0], ny=cy+dirs[di][1];
          if (!inMap(nx,ny)) continue;
          if (dirs[di][0]!==0 && dirs[di][1]!==0){
            if (!isWalkableTile(cx+dirs[di][0], cy) || !isWalkableTile(cx, cy+dirs[di][1])) continue;
          }
          const ni=ny*W+nx;
          if (closed[ni]) continue;
          if (!isWalkableTile(nx,ny)) continue;
          if (!(nx===sx && ny===sy) && !(nx===gx && ny===gy)){
            if (!canEnterTile(u, nx, ny)) continue;
            if (isReservedByOther(u, nx, ny)) continue;
          }
          const cost=dirs[di][2];
          const tent=gScore[best]+cost;
          if (tent < gScore[ni]){
            came[ni]=best;
            gScore[ni]=tent;
            fScore[ni]=tent + h(nx,ny,gx,gy);
            if (!inOpen[ni]){
              open[openN++]=ni;
              inOpen[ni]=1;
              if (openN>=N-4) break;
            }
          }
        }
      }

      if (came[g]===-1 && g!==s) return null;

      const path=[];
      let cur=g;
      path.push(cur);
      while (cur!==s){
        cur=came[cur];
        if (cur===-1) break;
        path.push(cur);
      }
      path.reverse();

      const out=[];
      let last=-1;
      for (let i=0;i<path.length;i++){
        const n=path[i];
        if (n===last) continue;
        last=n;
        out.push({tx:n%W, ty:(n/W)|0});
      }
    return out;
  }

  // Path setter (moved from game.js)
  function setPathTo(u, goalX, goalY){
    if (_pathFindBudget <= 0) {
      u.path = null; u.pathI = 0; // order와 path 불일치 방지 (다음 틱에 재시도)
      return false;
    }
    _pathFindBudget--;
    // Temporary separation offset to reduce clump jitter
    if (u.sepCd && u.sepCd>0){ goalX += (u.sepOx||0); goalY += (u.sepOy||0); }
    const sTx=tileOfX(u.x), sTy=tileOfY(u.y);
    let gTx=tileOfX(goalX), gTy=tileOfY(goalY);

    if (!isWalkableTile(gTx,gTy)){
      let found=false;
      for (let r=1;r<=4 && !found;r++){
        for (let dy=-r;dy<=r && !found;dy++){
          for (let dx=-r;dx<=r && !found;dx++){
            const tx=gTx+dx, ty=gTy+dy;
            if (!inMap(tx,ty)) continue;
            if (isWalkableTile(tx,ty)){ gTx=tx; gTy=ty; found=true; }
          }
        }
      }
      if (!found) return false;
    }

    // If the goal tile is crowded, we only "snap" to a nearby free tile for non-combat move orders.
    // For combat orders we intentionally keep the goal stable and allow compression; otherwise backliners can "dance".
    const _combatOrder = (u && u.order && (u.order.type==="attack" || u.order.type==="attackmove"));
    if (true){
      if (!canEnterTile(u, gTx, gTy)){
        let best=null, bestD=1e9;
        for (let r=1;r<=6;r++){
          for (let dy=-r;dy<=r;dy++){
            for (let dx=-r;dx<=r;dx++){
              const tx=gTx+dx, ty=gTy+dy;
              if (!inMap(tx,ty)) continue;
              if (!isWalkableTile(tx,ty)) continue;
              if (!canEnterTile(u, tx, ty)) continue;
              const d = dx*dx+dy*dy;
              if (d<bestD){ bestD=d; best={tx,ty}; }
            }
          }
          if (best) break;
        }
        if (best){ gTx=best.tx; gTy=best.ty; }
      }
    }
    // Persist intended goal tile for repath/anti-jitter decisions.
    u.order = u.order || {type:"move"};
    u.order.tx = gTx; u.order.ty = gTy;
    u.order.x = (gTx+0.5)*TILE; u.order.y = (gTy+0.5)*TILE;
    const path=aStarPathOcc(u, sTx, sTy, gTx, gTy);
    u.path=path;
    u.pathI=0;
    // Avoid the classic 'backstep' when a new order is issued.
    // If the path begins with our current tile, skip it so we immediately head toward the next tile
    // instead of re-centering on the current tile first.
    u.holdPos = false;
    if (u.path && u.path.length>1){
      const p0 = u.path[0];
      if (p0 && p0.tx===sTx && p0.ty===sTy) u.pathI = 1;
    }
    u.lastGoalTx=gTx; u.lastGoalTy=gTy;
    return !!path;
  }

    function findNearestRefinery(team, wx, wy){
      let best=null, bestD=1e9;
      const fakeU = {x: wx, y: wy, r: 28}; // harvester radius for dock selection
      for (const b of buildings){
        if (!b.alive || b.team!==team || b.kind!=="refinery") continue;
        const dock = getDockPoint(b, fakeU);
        const d2 = dist2(wx, wy, dock.x, dock.y);
        if (d2<bestD){ bestD=d2; best=b; }
      }
      return best;
    }

    function hasAnyRefinery(team){
      for (const b of buildings){
        if (b.alive && b.team===team && b.kind==="refinery") return true;
      }
      return false;
    }

    function findNearestFreePoint(wx, wy, u, r=3){
      const cx=tileOfX(wx), cy=tileOfY(wy);
      let bestX=wx, bestY=wy, bestD=1e18, found=false;
      for (let dy=-r; dy<=r; dy++){
        for (let dx=-r; dx<=r; dx++){
          const tx=cx+dx, ty=cy+dy;
          if (!isWalkableTile(tx,ty)) continue;
          const curTx=tileOfX(u.x), curTy=tileOfY(u.y);
          if (!(tx===curTx && ty===curTy) && !canEnterTile(u,tx,ty)) continue;
          const pTile=tileToWorldCenter(tx,ty);
          const px=pTile.x, py=pTile.y;
          const dd=dist2(wx,wy,px,py);
          if (dd<bestD){ bestD=dd; bestX=px; bestY=py; found=true; }
        }
      }
      return {x:bestX,y:bestY,found};
    }

    function clearReservation(u){
      u.resTx = null; u.resTy = null;
    }

    function settleInfantryToSubslot(u, dt){
      const cls = (UNIT[u.kind] && UNIT[u.kind].cls) ? UNIT[u.kind].cls : "";
      if (cls!=="inf") return;
      if (!u.alive || u.inTransport) return;
      if (u.target!=null) return;
      const ot = u.order && u.order.type;
      if (ot!=="idle" && ot!=="guard") return;
      // RA2 style: 매 틱 실행, sub-slot 근처면 즉시 고정

      const tx = tileOfX(u.x), ty = tileOfY(u.y);
      if (!inMap(tx,ty)) return;

      const ss = (u.subSlot==null) ? 0 : (u.subSlot & 3);
      const sp = tileToWorldSubslot(tx, ty, ss);
      const toSlot2 = (u.x - sp.x)**2 + (u.y - sp.y)**2;
      if (toSlot2 < 25){ u.x = sp.x; u.y = sp.y; u.vx = 0; u.vy = 0; u.holdPos = true; return; }

      const center = tileToWorldCenter(tx, ty);
      const toCenter2 = (u.x - center.x)**2 + (u.y - center.y)**2;
      if (toCenter2 > (0.12 * TILE) ** 2) return;

      const i = idx(tx, ty);
      if (occInf && occInf[i] > INF_SLOT_MAX) {
        u.x = center.x; u.y = center.y;
        u.vx = 0; u.vy = 0;
        u.holdPos = true;
        return;
      }

      const dx = sp.x - u.x, dy = sp.y - u.y;
      const d2 = dx*dx + dy*dy;
      if (d2 < 25){
        u.x = sp.x; u.y = sp.y;
        u.vx = 0; u.vy = 0;
        u.holdPos = true;
        return;
      }

      const d = Math.sqrt(d2);
      const easeIn = (d < 15) ? Math.max(0.35, d/15) : 1;
      const maxStep = Math.min(80 * dt * easeIn, Math.max(d * 0.25, 1.5));
      const step = Math.min(maxStep, d);
      const nx = dx / (d||1), ny = dy / (d||1);
      u.x += nx * step;
      u.y += ny * step;

      const velMag = (dt > 0 && step > 0) ? (step / dt) : 0;
      u.vx = nx * velMag;
      u.vy = ny * velMag;
      u.holdPos = true;
    }

    function getClosestPointOnBuilding(b, u){
      const x0 = b.tx*TILE, y0 = b.ty*TILE;
      const x1 = (b.tx+b.tw)*TILE, y1 = (b.ty+b.th)*TILE;
      const pad = (u && u.r) ? u.r*0.45 : TILE*0.20;
      const px = clamp(u ? u.x : (x0+x1)*0.5, x0-pad, x1+pad);
      const py = clamp(u ? u.y : (y0+y1)*0.5, y0-pad, y1+pad);
      return {x:px, y:py};
    }

    function getDockPoint(b, u){
      const x0 = b.tx*TILE, y0 = b.ty*TILE;
      const x1 = (b.tx+b.tw)*TILE, y1 = (b.ty+b.th)*TILE;
      const cx = (x0+x1)*0.5, cy = (y0+y1)*0.5;
      const pad = (u && u.r) ? u.r*0.65 : TILE*0.25;
      const px = clamp(u ? u.x : cx, x0-pad, x1+pad);
      const py = clamp(u ? u.y : cy, y0-pad, y1+pad);
      const candidates = [
        {x: x1 + pad, y: cy},
        {x: x0 - pad, y: cy},
        {x: cx, y: y1 + pad},
        {x: cx, y: y0 - pad},
        {x: px, y: py},
      ];
      const uTx = u ? tileOfX(u.x) : -999;
      const uTy = u ? tileOfY(u.y) : -999;
      let best = null, bestD = 1e18;
      for (const c of candidates){
        const tx=(c.x/TILE)|0, ty=(c.y/TILE)|0;
        if (!inMap(tx,ty)) continue;
        if (!isWalkableTile(tx,ty)) continue;
        if (!u) return c;
        if (canEnterTileGoal(u, tx, ty, b) || (tx===uTx && ty===uTy)){
          const d2 = (u.x - c.x)**2 + (u.y - c.y)**2;
          if (d2 < bestD){ bestD = d2; best = c; }
        }
      }
      return best || candidates[candidates.length-1];
    }

    function findNearestRefinery(team, wx, wy){
      let best=null, bestD=1e9;
      const fakeU = {x: wx, y: wy, r: 28};
      for (const b of buildings){
        if (!b.alive || b.team!==team || b.kind!=="refinery") continue;
        const dock = getDockPoint(b, fakeU);
        const d2 = dist2(wx, wy, dock.x, dock.y);
        if (d2<bestD){ bestD=d2; best=b; }
      }
      return best;
    }

    function findNearestFreePoint(wx, wy, u, r=3){
      let best=null, bestD=1e9;
      for (let dy=-r; dy<=r; dy++){
        for (let dx=-r; dx<=r; dx++){
          const tx = ((wx/TILE)|0) + dx;
          const ty = ((wy/TILE)|0) + dy;
          if (!inMap(tx,ty)) continue;
          if (!isWalkableTile(tx,ty)) continue;
          if (isSqueezedTile(tx,ty)) continue;
          if (isReservedByOther(u, tx, ty)) continue;
          const i=idx(tx,ty);
          if (occAll[i]!==0) continue;
          const c = tileToWorldCenter(tx,ty);
          if (isBlockedWorldPoint && isBlockedWorldPoint(u, c.x, c.y)) continue;
          const d = dx*dx + dy*dy;
          if (d < bestD){ bestD=d; best={x:c.x, y:c.y}; }
        }
      }
      return best;
    }

    function clearReservation(u){
      u.resTx = null; u.resTy = null;
    }

    function settleInfantryToSubslot(u, dt){
      const cls = (UNIT[u.kind] && UNIT[u.kind].cls) ? UNIT[u.kind].cls : "";
      if (cls!=="inf") return;
      if (!u.alive || u.inTransport) return;
      if (u.target!=null) return;
      const ot = u.order && u.order.type;
      if (ot!=="idle" && ot!=="guard") return;
      // RA2 style: 매 틱 실행, sub-slot 근처면 즉시 고정

      const tx = tileOfX(u.x), ty = tileOfY(u.y);
      if (!inMap(tx,ty)) return;

      const ss = (u.subSlot==null) ? 0 : (u.subSlot & 3);
      const sp = tileToWorldSubslot(tx, ty, ss);
      const toSlot2 = (u.x - sp.x)**2 + (u.y - sp.y)**2;
      if (toSlot2 < 25){ u.x = sp.x; u.y = sp.y; u.vx = 0; u.vy = 0; u.holdPos = true; return; }

      const center = tileToWorldCenter(tx, ty);
      const toCenter2 = (u.x - center.x)**2 + (u.y - center.y)**2;
      if (toCenter2 > (0.12 * TILE) ** 2) return;

      const i = idx(tx, ty);
      if (occInf && occInf[i] > INF_SLOT_MAX) {
        u.x = center.x; u.y = center.y;
        u.vx = 0; u.vy = 0;
        u.holdPos = true;
        return;
      }

      const dx = sp.x - u.x, dy = sp.y - u.y;
      const d2 = dx*dx + dy*dy;
      if (d2 < 25){
        u.x = sp.x; u.y = sp.y;
        u.vx = 0; u.vy = 0;
        u.holdPos = true;
        return;
      }

      const d = Math.sqrt(d2);
      const easeIn = (d < 15) ? Math.max(0.35, d/15) : 1;
      const maxStep = Math.min(80 * dt * easeIn, Math.max(d * 0.25, 1.5));
      const step = Math.min(maxStep, d);
      const nx = dx / (d||1), ny = dy / (d||1);
      u.x += nx * step;
      u.y += ny * step;

      const velMag = (dt > 0 && step > 0) ? (step / dt) : 0;
      u.vx = nx * velMag;
      u.vy = ny * velMag;
      u.holdPos = true;
    }

    function _tankUpdateTurret(u, desiredDir, dt){
      if (u.turretDir == null) u.turretDir = (u.dir!=null ? u.dir : 6);
      if (desiredDir == null || desiredDir === u.turretDir){
        u.turretTurn = null;
        return;
      }
      if (!u.turretTurn || u.turretTurn.fromDir==null || u.turretTurn.toDir==null){
        const step = _turnStepTowardTurret(u.turretDir, desiredDir);
        u.turretTurn = { fromDir: u.turretDir, toDir: step.nextDir, stepDir: step.stepDir, t: 0 };
      }
      const { done, frameNum } = _advanceTurnState(u.turretTurn, u.turretTurn.fromDir, u.turretTurn.toDir, dt, 0.045, _turretTurnFrameNum);
      u.turretTurn.frameNum = frameNum;
      if (done){
        u.turretDir = u.turretTurn.toDir;
        u.turretTurn = null;
      }
    }

    function findNearestEnemyFor(team, wx, wy, radius, infOnly=false, unitOnly=false){
      const enemyTeam = (team===TEAM.PLAYER) ? TEAM.ENEMY : TEAM.PLAYER;
      let best=null, bestD=Infinity;
      const r2=radius*radius;
      for (const u of units){
        if (!u.alive || u.team!==enemyTeam || u.inTransport || u.hidden) continue;
        if (infOnly){
          const cls = (UNIT[u.kind] && UNIT[u.kind].cls) ? UNIT[u.kind].cls : "";
          if (cls!=="inf") continue;
        }
        const tx=tileOfX(u.x), ty=tileOfY(u.y);
        if (enemyTeam===TEAM.ENEMY && inMap(tx,ty) && !visible[TEAM.PLAYER][idx(tx,ty)]) continue;
        const d2=dist2(wx,wy,u.x,u.y);
        if (d2<bestD && d2<=r2){ bestD=d2; best=u; }
      }
      if (infOnly || unitOnly) return best;
      for (const b of buildings){
        if (!b.alive || b.team!==enemyTeam) continue;
        if (b.attackable===false || b.civ) continue;
        if (enemyTeam===TEAM.ENEMY && inMap(b.tx,b.ty) && !visible[TEAM.PLAYER][idx(b.tx,b.ty)]) continue;
        const d2=dist2(wx,wy,b.x,b.y);
        if (d2<bestD && d2<=r2){ bestD=d2; best=b; }
      }
      return best;
    }

    function findNearestAttackMoveTargetFor(team, wx, wy, radius, attackerKind){
      const enemyTeam = (team===TEAM.PLAYER) ? TEAM.ENEMY : TEAM.PLAYER;
      const enemySniper = (team===TEAM.ENEMY && attackerKind==="sniper");
      let best=null, bestD=Infinity;
      const r2=radius*radius;

      for (const u of units){
        if (!u.alive || u.team!==enemyTeam || u.inTransport || u.hidden) continue;
        if (attackerKind==="sniper" && (u.kind==="tank" || u.kind==="harvester")) continue;
        if (enemySniper && (UNIT[u.kind]?.cls!=="inf")) continue; // 적 저격병: 보병만 공격
        const d2=dist2(wx,wy,u.x,u.y);
        if (d2<=r2 && d2<bestD){ best=u; bestD=d2; }
      }
      if (!enemySniper){
        if (attackerKind!=="sniper"){
          for (const b of buildings){
            if (!b.alive || b.team!==enemyTeam || b.civ) continue;
            if (b.attackable===false) continue;
            const d2=dist2(wx,wy,b.x,b.y);
            if (d2<=r2 && d2<bestD){ best=b; bestD=d2; }
          }
        } else {
          for (const b of buildings){
            if (!b.alive || b.team!==enemyTeam || b.civ) continue;
            if (b.attackable===false || b.kind!=="turret") continue;
            const d2=dist2(wx,wy,b.x,b.y);
            if (d2<=r2 && d2<bestD){ best=b; bestD=d2; }
          }
        }
      }
      return best;
    }

    function revealCircle(team, wx, wy, radius){
      const t0x=clamp(((wx-radius)/TILE)|0,0,MAP_W-1);
      const t1x=clamp(((wx+radius)/TILE)|0,0,MAP_W-1);
      const t0y=clamp(((wy-radius)/TILE)|0,0,MAP_H-1);
      const t1y=clamp(((wy+radius)/TILE)|0,0,MAP_H-1);
      const r2=radius*radius;
      for (let ty=t0y; ty<=t1y; ty++){
        for (let tx=t0x; tx<=t1x; tx++){
          const cx=(tx)*TILE, cy=(ty)*TILE;
          if (dist2(wx,wy,cx,cy)<=r2){
            const i=idx(tx,ty);
            visible[team][i]=1;
            explored[team][i]=1;
          }
        }
      }
    }

    function updateVision(){
      const fogOn = (typeof getFogEnabled==="function") ? !!getFogEnabled() : true;
      if (!fogOn){
        visible[TEAM.PLAYER].fill(1); explored[TEAM.PLAYER].fill(1);
        visible[TEAM.ENEMY].fill(1);  explored[TEAM.ENEMY].fill(1);
        return;
      }
      visible[TEAM.PLAYER].fill(0);
      visible[TEAM.ENEMY].fill(0);

      for (const b of buildings){
        if (!b.alive) continue;
        if (b.civ) continue;
        const v = BUILD[b.kind]?.vision || 0;
        if (v>0 && (b.team===TEAM.PLAYER || b.team===TEAM.ENEMY)) {
          revealCircle(b.team,b.x,b.y,v);
        }
        if (b.team===TEAM.PLAYER || b.team===TEAM.ENEMY){
          const t=b.team;
          for (let ty=b.ty; ty<b.ty+b.th; ty++){
            for (let tx=b.tx; tx<b.tx+b.tw; tx++){
              if (!inMap(tx,ty)) continue;
              const i=idx(tx,ty);
              visible[t][i]=1;
              explored[t][i]=1;
            }
          }
        }
      }

      for (const u of units){
        if (!u.alive) continue;
        // 저격IFV: 사정거리(1200)만큼 시야 확보 (저격병과 동일). vision < range인 경우 range로 reveal.
        const visR = Math.max(UNIT[u.kind]?.vision || 200, u.range || 0);
        revealCircle(u.team,u.x,u.y, visR);
      }
    }

    function spawnBullet(team,x,y,tx,ty,dmg,ownerId, opt={}){
      const kind = opt.kind || "bullet";
      if (kind==="shell"){
        const dx=tx-x, dy=ty-y;
        const dist=Math.hypot(dx,dy)||1;
        const dur = opt.dur ?? Math.max(0.10, Math.min(0.18, dist/2200));
        bullets.push({
          kind:"shell",
          team,
          x0:x, y0:y, x1:tx, y1:ty,
          x, y,
          t:0, dur,
          h: opt.h ?? (18 + Math.min(46, dist*0.10)),
          dmg, ownerId,
          tid: opt.tid ?? null,
          allowFriendly: !!opt.allowFriendly
        });
        return;
      }
      const sp = opt.sp ?? 680;
      const dx=tx-x, dy=ty-y;
      const d=Math.hypot(dx,dy)||1;
      bullets.push({kind: (opt.kind||"bullet"),team,x,y,vx:dx/d*sp,vy:dy/d*sp,life:(opt.life??0.35),dmg,ownerId, tx:(opt.tx??tx), ty:(opt.ty??ty)});
    }

    function spawnTrace(x0,y0,x1,y1,team, opt={}){
      const life = (opt.life ?? 0.09);
      window.__combatUntil = Math.max(window.__combatUntil||0, performance.now()+12000);
      traces.push({x0,y0,x1,y1,team,life, maxLife: (opt.maxLife ?? life), kind: opt.kind || "line", delay: opt.delay ?? 0, fx: opt.fx || null});
    }

    function spawnMGTracers(shooter, target){
      const dx = target.x - shooter.x;
      const dy = target.y - shooter.y;
      const d = Math.hypot(dx, dy) || 1;
      const nx = dx/d, ny = dy/d;
      const px = -ny, py = nx;

      const MUZZLE_RISE = 48;
      const lift = (x,y)=>{
        const iso = worldToIso(x,y);
        const w = isoToWorld(iso.x, iso.y - MUZZLE_RISE);
        return {x:w.x, y:w.y};
      };

      const bursts = 4;
      const gap = 0.07;
      const tracerLife = 0.045;
      const muzzleLife = 0.045;

      for (let i=0;i<bursts;i++){
        const delay = i*gap;
        const spread = (Math.random()*2-1) * 6;
        const endX = target.x + px*spread;
        const endY = target.y + py*spread;

        const mx = shooter.x + px*((Math.random()*2-1)*3) + nx*(6 + Math.random()*4);
        const my = shooter.y + py*((Math.random()*2-1)*3) + ny*(6 + Math.random()*4);

        const m0 = lift(mx, my);
        const mx2 = m0.x, my2 = m0.y;

        spawnTrace(mx2, my2, endX, endY, shooter.team, { kind:"mg", life:tracerLife, delay });

        const f0 = lift(shooter.x + nx*14, shooter.y + ny*14);
        flashes.push({ x: f0.x, y: f0.y, r: 22 + Math.random()*8, life: muzzleLife, delay });

        const side = (Math.random() < 0.5) ? -1 : 1;
        const ex = shooter.x + px*side*6 + nx*6;
        const ey = shooter.y + py*side*6 + ny*6;
        const e0 = lift(ex, ey);
        const ex2 = e0.x, ey2 = e0.y;
        const sp = 260 + Math.random()*260;
        casings.push({
          x: ex2, y: ey2,
          vx: (px*side*0.85 - nx*0.25) * sp + (Math.random()*2-1)*30,
          vy: (py*side*0.85 - ny*0.25) * sp + (Math.random()*2-1)*30,
          z: 8 + Math.random()*10,
          vz: 260 + Math.random()*220,
          rot: Math.random()*Math.PI*2,
          w: 4.5, h: 2.0,
          life: 0.20,
          delay
        });

        const sparks = 4;
        for (let k=0;k<sparks;k++){
          const ang = Math.random()*Math.PI*2;
          const spd = 40 + Math.random()*90;
          impacts.push({
            x: target.x + px*((Math.random()*2-1)*8) + nx*((Math.random()*2-1)*8),
            y: target.y + py*((Math.random()*2-1)*8) + ny*((Math.random()*2-1)*8),
            vx: Math.cos(ang)*spd,
            vy: Math.sin(ang)*spd,
            life: 0.16 + Math.random()*0.08
          });
        }
      }
    }

    function spawnSniperTracer(shooter, target){
      const dx = target.x - shooter.x;
      const dy = target.y - shooter.y;
      const d = Math.hypot(dx, dy) || 1;
      const nx = dx/d, ny = dy/d;

      const MUZZLE_RISE = 48;
      const lift = (x,y)=>{
        const iso = worldToIso(x,y);
        const w = isoToWorld(iso.x, iso.y - MUZZLE_RISE);
        return {x:w.x, y:w.y};
      };

      const mx = shooter.x + nx*12;
      const my = shooter.y + ny*12;
      const m0 = lift(mx, my);

      spawnTrace(m0.x, m0.y, target.x, target.y, shooter.team, { kind:"snip", life: 0.80, maxLife: 0.80, delay: 0 });

      const f0 = lift(shooter.x + nx*14, shooter.y + ny*14);
      flashes.push({ x: f0.x, y: f0.y, r: 18 + Math.random()*6, life: 0.045, delay: 0 });
    }

    function isHitscanUnit(u){
      return !!(u.hitscan || UNIT[u.kind]?.hitscan || (u.kind==="ifv" && u.passKind==="sniper"));
    }

    function setFacingForShot(shooter, target){
      if (!shooter || shooter.inTransport) return;
      if (shooter.kind!=="infantry" && shooter.kind!=="sniper") return;
      if (!target) return;
      const dx = (target.x - shooter.x);
      const dy = (target.y - shooter.y);
      const fd = worldVecToDir8(dx, dy);
      shooter.faceDir = fd;
      shooter.dir = fd;
      shooter.fireDir = fd;
      shooter.fireHoldT = Math.max(shooter.fireHoldT||0, 0.40);
    }

    function hitscanShot(shooter,target){
      setFacingForShot(shooter, target);
      if (shooter.kind==="infantry" || (shooter.kind==="ifv" && shooter.passKind==="infantry")){
        spawnMGTracers(shooter, target);
      } else if (shooter.kind==="sniper" || (shooter.kind==="ifv" && shooter.passKind==="sniper")){
        if (spawnSniperTracer) spawnSniperTracer(shooter, target);
      } else {
        spawnTrace(shooter.x,shooter.y,target.x,target.y,shooter.team);
      }
      let dmg = shooter.dmg;
      const isInfTarget = (target && !BUILD[target.kind] && (UNIT[target.kind]?.cls==="inf"));
      if (shooter.kind==="sniper" || (shooter.kind==="ifv" && shooter.passKind==="sniper")){
        dmg = isInfTarget ? 125 : 1;
      }
      dmg *= getVeteranCombat(shooter);
      applyDamage(target, dmg, shooter.id, shooter.team);
    }

    function fireTankShell(shooter,target){
      const dx = target.x - shooter.x, dy = target.y - shooter.y;
      const d = Math.hypot(dx,dy)||1;
      const nx = dx/d, ny = dy/d;

      flashes.push({x: shooter.x + nx*18, y: shooter.y + ny*18, r: 26 + Math.random()*12, life: 0.10, delay: 0});

      const mx = shooter.x + nx*16, my = shooter.y + ny*16;
      spawnTrace(mx, my, mx + nx*26, my + ny*26, shooter.team, { kind:"mg", life: 0.06, delay: 0 });

      spawnBullet(shooter.team, mx, my, target.x, target.y, shooter.dmg, shooter.id, { kind:"shell", dur: 0.12, h: 18, tid: target.id, allowFriendly: !!(shooter.order && shooter.order.allowFriendly) });
    }

    function fireIFVMissiles(u, t){
      const dx = t.x - u.x, dy = t.y - u.y;
      const dist = Math.hypot(dx,dy) || 1;
      const ang = Math.atan2(dy, dx);
      const spread = 0.08;

      const sp = 1350;
      const baseLife = dist / sp;
      const life = Math.max(0.25, Math.min(2.0, baseLife + 0.18));

      const tid = (t && typeof t.id==="number") ? t.id : null;

      const tx1 = u.x + Math.cos(ang-spread)*dist;
      const ty1 = u.y + Math.sin(ang-spread)*dist;
      const tx2 = u.x + Math.cos(ang+spread)*dist;
      const ty2 = u.y + Math.sin(ang+spread)*dist;

      spawnBullet(u.team, u.x, u.y, tx1, ty1, u.dmg, u.id, { sp, kind:"missile", life, tx:tx1, ty:ty1, tid, aimX:t.x, aimY:t.y });
      spawnBullet(u.team, u.x, u.y, tx2, ty2, u.dmg, u.id, { sp, kind:"missile", life, tx:tx2, ty:ty2, tid, aimX:t.x, aimY:t.y });
    }

    function tickUnits(dt){
        clearOcc(dt);
        for (let i=0; i<units.length; i++){
          const u = units[i];
          if (i>0){
            const prev = units[i-1];
            if (prev.alive && !prev.inTransport && prev._occOldTx!=null && prev._occOldTy!=null){
              const nTx=tileOfX(prev.x), nTy=tileOfY(prev.y);
              if (prev._occOldTx!==nTx || prev._occOldTy!==nTy){
                updateOccForUnitMove(prev, prev._occOldTx, prev._occOldTy, nTx, nTy);
              }
            }
          }
          u._occOldTx = tileOfX(u.x), u._occOldTy = tileOfY(u.y);
          if (!u.alive) continue;
          applyEliteHeal(u, dt);
          const eliteFx = (u.kind==="infantry" || u.kind==="sniper") ? u :
            (u.kind==="ifv" && u.passengerId && (u.passKind==="infantry" || u.passKind==="sniper") ? getEntityById(u.passengerId) : null);
          if (eliteFx && eliteFx.eliteFlashUntil && state.t < eliteFx.eliteFlashUntil){
            if ((eliteFx._eliteSparkNext || 0) <= state.t){
              eliteFx._eliteSparkNext = state.t + 0.12;
              const fx = (u.kind==="ifv") ? u : eliteFx;
              for (let k=0;k<6;k++){
                impacts.push({x:fx.x+(Math.random()*12-6), y:fx.y+(Math.random()*12-6), vx:(Math.random()*160-80), vy:(Math.random()*160-80), life:0.22});
              }
            }
          }
          if (u.shootCd>0) u.shootCd -= dt;
          if (u.flash && u.flash>0) u.flash -= dt;
          if (u.repathCd>0) u.repathCd -= dt;
          if (u.avoidCd>0) u.avoidCd -= dt;
          if (u.holdPosT>0) u.holdPosT -= dt;
          if (u.fireHoldT>0) u.fireHoldT -= dt;
    
          u._justShot = false;
    
          // IFV weapon stats by passenger: apply early so u.range/u.dmg are correct for rest of tick (저격IFV 사정거리 = 저격병과 동일).
          if (u.kind==="ifv"){
            if (u.passengerId && u.passKind==="sniper"){
              u.dmg = 125; u.range = (UNIT.sniper && UNIT.sniper.range) || 1200; u.rof = 2.20/2.0; u.hitscan = true;
            } else if (u.passengerId && u.passKind==="infantry"){
              u.dmg = (UNIT.infantry && UNIT.infantry.dmg) || 12; u.range = 620; u.rof = ((UNIT.infantry && UNIT.infantry.rof) || 0.55)/2.0; u.hitscan = true;
            } else if (u.passengerId && u.passKind==="engineer"){
              u.dmg = 0; u.range = 0; u.rof = UNIT.ifv.rof; u.hitscan = true;
            } else {
              u.dmg = UNIT.ifv.dmg; u.range = UNIT.ifv.range; u.rof = UNIT.ifv.rof; u.hitscan = UNIT.ifv.hitscan;
            }
          }
    
          // If a movement order is active, cancel any lingering firing pose
          if (u.order && (u.order.type==="move" || u.order.type==="attackmove")){ u.fireHoldT=0; u.fireDir=null; }
          // Also: if we're currently moving and we did NOT fire this tick, don't keep the firing pose.
          // This prevents 'attack animation while approaching' or while chasing.
          const mv = (Math.abs(u.vx||0) + Math.abs(u.vy||0));
          if (mv > 0.5 && !u._justShot){ u.fireHoldT = 0; u.fireDir = null; }
    
    
          // Ensure core flags exist (prevents command filters from dropping orders)
          if (u.type!=="unit") u.type="unit";
          u.canAttack = ((u.dmg||0)>0 && (u.range||0)>0 && u.kind!=="engineer" && u.kind!=="harvester");
    
    
          if (u.aggroCd>0) u.aggroCd -= dt;
          // Safety: clear stale targets so idle units don't get treated as "active" and pushed around.
          if (u.target!=null && (u.order==null || u.order.type==="idle" || u.order.type==="guard")){
            const tt=getEntityById(u.target);
            if (!tt || !tt.alive || tt.attackable===false) u.target=null;
          }
    
          // Dynamic combat flags (fix: some units couldn't attack because these were missing).
          u.canAttack = ((u.dmg||0)>0 && (u.range||0)>0);
          // hitscan may change (e.g., IFV passenger), keep it truthy if either dynamic or static says so.
          u.hitscan = !!(u.hitscan || UNIT[u.kind]?.hitscan);
    
          // 차량(탱크/굴착기): 정지 상태에서도 겹친 적 보병 즉사 (이동 없이 밟기)
          if (canCrushInf(u)) crushInfantry(u);
    
          if (!u.order || u.order.type!=="attack") u.holdAttack = false;
    
          // HARD IDLE LOCK: if a unit should be stationary, freeze it completely (no path, no nudges, no steering drift).
          // Auto-attack fix: if we can shoot and we're idle/guard/attackmove with no target, acquire enemies automatically.
          // Throttle: don't run findNearestEnemyFor every frame for every unit (huge cost in mass combat).
          if (!u.inTransport && !u.hidden && u.team!==TEAM.CIV && (u.dmg||0)>0 && (u.range||0)>0){
            const otPre = u.order && u.order.type;
            const wantsAuto = (!u.target && (otPre==="idle" || otPre==="guard" || otPre==="guard_return" || otPre==="attackmove"));
            if (wantsAuto && u.aggroCd<=0 && state.t >= (u._nextAcquire||0)){
              const infThrottle = (u.team===TEAM.ENEMY && (u.kind==="infantry" || u.kind==="sniper")) ? 0.42 + (u.id % 11)*0.03 : 0.18 + (u.id % 7)*0.02;
              u._nextAcquire = state.t + infThrottle;
              const sniperMode = (u.kind==="sniper" || (u.kind==="ifv" && u.passKind==="sniper"));
      const manualLock = !!(u.order && u.order.manual && u.order.allowAuto!==true);
              const vis = Math.max(UNIT[u.kind]?.vision || 300, u.range || 0); // 저격IFV: u.range(1200) 사용
              const cand = findNearestEnemyFor(u.team, u.x, u.y, vis, sniperMode, true); // unitOnly
              if (cand){
                if (!sniperMode || isEnemyInf(cand)){
                  u.order = {type:"attack", x:u.x, y:u.y, tx:null, ty:null};
                  u.target = cand.id;
                  setPathTo(u, cand.x, cand.y);
                  u.repathCd = 0.25;
                  u.aggroCd = aggroDelay(u, 0.25);
                }
              }
            }
          }
    
          const ot0 = u.order && u.order.type;
          const shouldRest = (u.alive && !u.inTransport && u.target==null && (ot0==="idle" || ot0==="guard") &&
                              !(u.kind==="harvester" && (u.returning || u.manualOre!=null)));
          if (shouldRest){
            u.restX = u.x; u.restY = u.y;
            u.path = null; u.pathI = 0;
            u.vx = 0; u.vy = 0;
            u.stuckT = 0; u.stuckTime = 0; u.yieldCd = 0; u.avoidCd = 0;
            u.x = u.restX; u.y = u.restY;
            const cls = (UNIT[u.kind] && UNIT[u.kind].cls) ? UNIT[u.kind].cls : "";
            if (cls === "inf") u.holdPos = true;
          } else {
            u.restX = null; u.restY = null;
          }
    
          // Sniper cloaking:
    // - Cloak when idle/standing.
    // - Reveal while moving (including any path-follow), and for a while after firing.
    // v130: detect movement without relying on vx/vy (some paths update position directly).
    if (u.kind==="sniper"){
      // v1441: Sniper sprite was turning invisible due to default cloak logic.
      // Cloaking is now optional. Default is OFF (UNIT.sniper.cloak=false).
      if (!UNIT.sniper.cloak){
        u.cloakBreak = 999;
        u.cloaked = false;
        u._justShot = false;
      } else {
      if (u.cloakBreak>0) u.cloakBreak -= dt;
    
      const ot = (u.order && u.order.type) ? u.order.type : "idle";
      const hasPath = (u.path && u.path.length && u.pathI < u.path.length);
    
      // Goal distance heuristic for orders that should count as "moving"
      let gx = u.x, gy = u.y;
      if (ot==="move" || ot==="guard_return" || ot==="attackmove"){
        gx = (u.order && (u.order.tx!=null)) ? u.order.tx : ((u.order && u.order.x!=null) ? u.order.x : u.x);
        gy = (u.order && (u.order.ty!=null)) ? u.order.ty : ((u.order && u.order.y!=null) ? u.order.y : u.y);
      } else if (ot==="forcefire"){
        gx = (u.order && u.order.x!=null) ? u.order.x : u.x;
        gy = (u.order && u.order.y!=null) ? u.order.y : u.y;
      } else if (ot==="attack"){
        const tt = (u.target!=null) ? getEntityById(u.target) : null;
        if (tt){ gx = tt.x; gy = tt.y; }
      }
    
      const dGoal2 = dist2(u.x,u.y,gx,gy);
      const vel = Math.hypot(u.vx||0, u.vy||0);
    
      const moving = hasPath || vel>2.0 || ((ot==="move" || ot==="attackmove" || ot==="guard_return" || ot==="forcefire") && dGoal2 > 24*24);
    
      if (moving){
        // Reveal while moving.
        u.cloakBreak = Math.max(u.cloakBreak, 0.65);
      }
    
      u.cloaked = (u.cloakBreak<=0.001);
      u._justShot = false;
      }
    }
    
    // IFV: passenger and repair timer
          if (u.kind==="ifv"){
            if (u.repairCd>0) u.repairCd -= dt;
          }
    
          // IFV weapon mode switching based on passenger (dmg/range/rof already set at tick start; keep in sync for engineer repair branch).
          if (u.kind==="ifv"){
            u.dmg = UNIT.ifv.dmg; u.range = UNIT.ifv.range; u.rof = UNIT.ifv.rof; u.hitscan = UNIT.ifv.hitscan;
            if (u.passKind==="infantry"){
              u.dmg = (UNIT.infantry && UNIT.infantry.dmg) || 12; u.range = 620; u.rof = ((UNIT.infantry && UNIT.infantry.rof) || 0.55)/2.0; u.hitscan = true;
            } else if (u.passKind==="sniper"){
              u.dmg = 125; u.range = (UNIT.sniper && UNIT.sniper.range) || 1200; u.rof = 2.20/2.0; u.hitscan = true;
            } else if (u.passKind==="engineer"){
              // Engineer IFV: repairs friendly vehicles (auto + manual).
              // Rules:
              // - Moves to the target, then repairs ONLY while idle/standing still (no "drive-by" repairing).
              // - Heal rate is moderate (no instant full heal).
              u.dmg = 0; u.range = 0; u.hitscan = true;
    
              const REPAIR_RANGE = 260;         // v54: looser repair range (in-range repairs feel responsive)
              const REPAIR_INTERVAL = 1.25;     // seconds per tick (slower ticks, bigger heals)
              const REPAIR_AMOUNT = 24;         // hp per tick
    
              // validate / auto-pick a repair target
              const allowAutoRepair = (!u.order || u.order.type==="idle" || u.order.type==="guard" || u.order.type==="attackmove" || u.order.type==="attack");
    
              let rt = (u.repairTarget!=null) ? getEntityById(u.repairTarget) : null;
              const isRepairableVeh = (e)=>{
                if (!e || !e.alive || e.team!==u.team) return false;
                if (e.id===u.id) return false; // never self-repair
                if (BUILD[e.kind]) return false;
                const cls = (UNIT[e.kind] && UNIT[e.kind].cls) ? UNIT[e.kind].cls : "";
                if (cls!=="veh") return false;
                if (e.hp>=e.hpMax-0.5) return false;
                return true;
              };
              if (!isRepairableVeh(rt)){ u.repairTarget=null; rt=null; }
    
              if (!rt && allowAutoRepair && state.t >= (u._nextRepairSearch||0)){
                u._nextRepairSearch = state.t + 0.4;
                let best=null, bestD2=Infinity;
                for (const tu of units){
                  if (!isRepairableVeh(tu)) continue;
                  const d2 = dist2(u.x,u.y,tu.x,tu.y);
                  if (d2<760*760 && d2<bestD2){ best=tu; bestD2=d2; }
                }
                if (best){ u.repairTarget=best.id; rt=best; }
              }
    
              if (rt){
                const d2 = dist2(u.x,u.y,rt.x,rt.y);
    
                // Approach phase: move toward target
                if (d2 > REPAIR_RANGE*REPAIR_RANGE){
                  // Approach phase: force move toward target (engineer IFV never auto-attacks)
                  u.target = null; u.attackTarget = null;
                  u.order = {type:"move", x:u.x, y:u.y, tx:null, ty:null};
                  if (u.repathCd<=0){
                    setPathTo(u, rt.x, rt.y);
                    u.repathCd = 0.30;
                  }
                } else {
                  // In-range: STOP and repair only while idle (no repair while moving)
                  if (u.order.type!=="idle"){
                    u.order = {type:"idle", x:u.x, y:u.y, tx:null, ty:null};
                    u.path = null; u.pathI = 0;
                  clearReservation(u);
                  }
    
                  // Repair tick (only when standing still)
                  if ((!u.path || u.pathI>= (u.path?.length||0)) && u.repairCd<=0){
                    rt.hp = Math.min(rt.hpMax, rt.hp + REPAIR_AMOUNT);
                    rt.flash = Math.max(rt.flash||0, 0.16);
                    healMarks.push({x:rt.x, y:rt.y-18, life:0.25});
                    // weld sparks + red-cross marker
                    for (let k=0;k<6;k++){
                      impacts.push({x:rt.x+(Math.random()*12-6), y:rt.y+(Math.random()*12-6), vx:(Math.random()*160-80), vy:(Math.random()*160-80), life:0.22});
                    }
                    healMarks.push({x:rt.x, y:rt.y-24, life:0.55});
                    u.repairCd = REPAIR_INTERVAL;
                  }
                }
              }
            } else {
              u.dmg = 18; u.range = 420; u.rof = 0.85; u.hitscan = false;
            }
          }
    
    
    // Handle pending IFV boarding intent.
    if (u.wantsBoard){
      const ifv = getEntityById(u.wantsBoard);
      if (!ifv || !ifv.alive || ifv.kind!=="ifv" || ifv.team!==u.team){ u.wantsBoard=null; }
      else{
        const d2 = dist2(u.x,u.y,ifv.x,ifv.y);
        if (d2 <= 120*120){
          if (!ifv.passengerId) boardUnitIntoIFV(u, ifv);
          else u.wantsBoard=null;
        }
      }
    }
    
    // Units inside transports do not move/act.
          if (u.inTransport){
            const carrier = getEntityById(u.inTransport);
            if (!carrier || !carrier.alive){ u.inTransport=null; u.hidden=false; u.selectable=true; }
            else { u.x = carrier.x; u.y = carrier.y; }
            continue;
          }
    
    
          // Passive regen: Harvester slowly repairs itself if not taking damage for 1s.
          if (u.kind==="harvester" && u.hp<u.hpMax){
            if (state.t - (u.lastDamaged ?? -1e9) >= 1.0){
              const regenRate = 18; // hp per second (slow)
              u.hp = Math.min(u.hpMax, u.hp + regenRate*dt);
            }
          }
    
          // Tank damage state: below 30% HP -> crippled (slower) until healed above 50%.
          if (u.kind==="tank"){
            const hpPct = (u.hpMax>0) ? (u.hp/u.hpMax) : 1;
            if (u.crippled){
              if (hpPct>=0.50) u.crippled=false;
            } else {
              if (hpPct<=0.30) u.crippled=true;
            }
          }
    
          // Combat target priority for ALL teams:
    // 1) If we were recently attacked, retaliate (sniper doctrine: only vs infantry).
    // 2) If idle/guarding/moving without a target, auto-acquire nearby enemy UNITS.
    // 3) If attacking a building, switch to a nearby enemy unit (non-sniper only).
    if (u.range>0 && u.kind!=="harvester" && u.kind!=="engineer"){
      const enemyTeam = (u.team===TEAM.PLAYER) ? TEAM.ENEMY : TEAM.PLAYER;
      const sniperMode = (u.kind==="sniper" || (u.kind==="ifv" && u.passKind==="sniper"));
      const manualLock = !!(u.order && u.order.manual && u.order.allowAuto!==true);
      // 교전중 이동명령 시: forceMoveUntil 동안 보복/자동탐색으로 덮어쓰지 않음 (경전차 등)
      const forceMoveActive = !!(u.order && u.order.type==="move" && u.forceMoveUntil && state.t < u.forceMoveUntil);
    
      // (1) Retaliation (ONLY when no player manual-locked order, and not during force-move window)
      // 적군 attackmove/guard 시: 보복보다 선제공격 우선 (침투·기지수호 시 적극 공격)
      const enemyCombatOrder = (u.team===TEAM.ENEMY && u.order && (u.order.type==="attackmove" || u.order.type==="guard"));
      if (!enemyCombatOrder && !manualLock && !forceMoveActive && u.aggroCd<=0 && u.lastAttacker!=null){
        const a = getEntityById(u.lastAttacker);
        if (a && a.alive && a.team===enemyTeam){
          if (!sniperMode || isEnemyInf(a)){
            const vis = Math.max(UNIT[u.kind]?.vision || 280, u.range || 0); // 저격IFV: u.range 사용
            if (dist2(u.x,u.y,a.x,a.y) <= vis*vis){
              u.target = a.id;
              u.order = {type:"attack", x:u.x,y:u.y, tx:null,ty:null};
              setPathTo(u, a.x, a.y);
              u.repathCd = 0.35;
              u.aggroCd = aggroDelay(u, 0.35);
            }
          }
        }
      }
    
      // (3) If attacking a building, but a unit is nearby, switch to that unit (non-sniper only)
      // Player manual-locked attack must NOT retarget. Throttle to reduce cost in mass combat.
      if (!sniperMode && u.aggroCd<=0 && state.t >= (u._nextAcquire||0) && u.order && u.order.type==="attack" && !(u.order.manual && u.order.lockTarget)){
        const cur = getEntityById(u.target);
        if (cur && BUILD[cur.kind]){
          const retargetThrottle = (u.team===TEAM.ENEMY && (u.kind==="infantry" || u.kind==="sniper")) ? 0.42 + (u.id % 11)*0.03 : 0.18 + (u.id % 7)*0.02;
          u._nextAcquire = state.t + retargetThrottle;
          const vis = UNIT[u.kind].vision || 280;
          const cand = findNearestEnemyFor(u.team, u.x, u.y, vis, false, true); // unitOnly
          if (cand){
            u.target = cand.id;
            setPathTo(u, cand.x, cand.y);
            u.repathCd = 0.35;
            u.aggroCd = aggroDelay(u, 0.35);
          }
        }
      }
    
      // (2) Auto-acquire if we don't have a target and are not currently committed to a building attack
      const committed = (u.order && u.order.type==="attack" && u.target!=null);
      const okAuto = (!committed) && !u.target && !manualLock &&
        (u.order.type==="idle" || u.order.type==="guard" || u.order.type==="guard_return" ||
         (u.order.type==="move" && !(u.forceMoveUntil && state.t < u.forceMoveUntil)));
    
      if (u.aggroCd<=0 && okAuto && state.t >= (u._nextAcquire||0)){
        const okAutoThrottle = (u.team===TEAM.ENEMY && (u.kind==="infantry" || u.kind==="sniper")) ? 0.42 + (u.id % 11)*0.03 : 0.18 + (u.id % 7)*0.02;
        u._nextAcquire = state.t + okAutoThrottle;
        const vis = Math.max(UNIT[u.kind]?.vision || 280, u.range || 0); // 저격IFV: u.range 사용
        const cand = findNearestEnemyFor(u.team, u.x, u.y, vis, sniperMode, true); // unitOnly
        if (cand){
          if (!sniperMode || isEnemyInf(cand)){
            u.order = {type:"attack", x:u.x,y:u.y, tx:null,ty:null};
            u.target = cand.id;
            setPathTo(u, cand.x, cand.y);
            u.repathCd = 0.35;
            u.aggroCd = aggroDelay(u, 0.35);
          }
        }
      }
    }
    const moved=Math.hypot(u.x-u.lastPosX, u.y-u.lastPosY);
          const tryingToMove = (u.order && (u.order.type==="move" || u.order.type==="attackmove" || u.order.type==="attack") && !u.holdAttack);
          if (tryingToMove){
            if (moved<0.55) u.stuckTime += dt;
            else { u.stuckTime=0; u.lastPosX=u.x; u.lastPosY=u.y; }
          } else {
            u.stuckTime = 0;
            u.lastPosX=u.x; u.lastPosY=u.y;
          }
    
          // Strong de-jam: repath early, warp sooner if needed. Goal: never permanent jams.
          if (u.stuckTime>0.45 && u.repathCd<=0){
            if (u.order && u.order.type==="move"){
              const dd = dist2(u.x,u.y,u.order.x,u.order.y);
              if (dd < 18*18){
                u.order = {type:"idle", x:u.x, y:u.y, tx:null, ty:null};
                u.path = null; u.pathI = 0;
                  clearReservation(u);
                u.stuckTime = 0;
                u.repathCd = 0.35;
              } else {
                const jx = u.order.x + rnd(-36,36);
                const jy = u.order.y + rnd(-36,36);
                setPathTo(u, jx, jy);
                u.repathCd = 0.25;
    
                if (u.stuckTime > 1.05){
                  const fp = findNearestFreePoint(u.x, u.y, u, 28);
                  u.x = fp.x; u.y = fp.y;
                  u.path = null; u.pathI = 0;
                  u.repathCd = 0.45;
                  u.stuckTime = 0;
                } else {
                  u.stuckTime = 0;
                }
              }
            } else {
              u.x = clamp(u.x + rnd(-6,6), 0, WORLD_W);
              u.y = clamp(u.y + rnd(-6,6), 0, WORLD_H);
              u.stuckTime = 0;
              u.repathCd = 0.25;
            }
          }
    
    
          // Combat behavior: guard + attack-move
          if (u.kind!=="harvester"){
            // Guard mode (G): hold position, chase kills, then return to guard point.
            if (u.order.type==="guard" || u.order.type==="guard_return"){
              // returning to origin
              if (u.order.type==="guard_return"){
                followPath(u, dt);
                if (dist2(u.x,u.y,u.guard?.x0||u.x,u.guard?.y0||u.y) < 70*70){
                  // snap back and resume scanning
                  if (u.guard){ u.x=u.guard.x0; u.y=u.guard.y0; }
                  u.order.type="guard";
                  u.guardFrom=false;
                  u.path=null;
                }
                continue;
              }
    
              // scan for enemy in vision, then engage. Throttle to reduce cost in mass combat.
              if (state.t < (u._nextAcquire||0)) { settleInfantryToSubslot(u, dt); continue; }
              const guardThrottle = (u.team===TEAM.ENEMY && (u.kind==="infantry" || u.kind==="sniper")) ? 0.42 + (u.id % 11)*0.03 : 0.18 + (u.id % 7)*0.02;
              u._nextAcquire = state.t + guardThrottle;
              const scanR = Math.max(u.vision||0, (u.range||0));
              const atkKind = (u.kind==="ifv" && u.passKind==="sniper") ? "sniper" : u.kind;
              const enemy = findNearestAttackMoveTargetFor(u.team, u.x, u.y, scanR, atkKind);
              if (enemy){
                const lock = (u.team===TEAM.ENEMY);
                u.order={type:"attack", x:u.x, y:u.y, tx:null,ty:null, manual:lock, allowAuto:!lock, lockTarget:lock};
                u.target=enemy.id;
                // mark that this attack came from guard
                u.guardFrom=true;
                setPathTo(u, enemy.x, enemy.y);
                u.repathCd=0.25;
              }
              // otherwise, just stay put
              settleInfantryToSubslot(u, dt);
              continue;
            }
    
            // Attack-move: march toward destination, but engage enemies on the way.
    
            if (u.order.type==="attackmove"){
              if (state.t >= (u._nextAcquire||0)) {
                const atkMoveThrottle = (u.team===TEAM.ENEMY && (u.kind==="infantry" || u.kind==="sniper")) ? 0.42 + (u.id % 11)*0.03 : 0.18 + (u.id % 7)*0.02;
                u._nextAcquire = state.t + atkMoveThrottle;
                const atkKind = (u.kind==="ifv" && u.passKind==="sniper") ? "sniper" : u.kind;
                const scanR = Math.max(520, UNIT[u.kind]?.vision || 400, u.range || 0); // 터렛(520)보다 넓게 선제 탐색
                const enemy = findNearestAttackMoveTargetFor(u.team, u.x, u.y, scanR, atkKind);
                if (enemy){
                  const lock = (u.team===TEAM.ENEMY);
                  u.order={type:"attack", x:u.x, y:u.y, tx:null,ty:null, manual:lock, allowAuto:!lock, lockTarget:lock};
                  u.target=enemy.id;
                  setPathTo(u, enemy.x, enemy.y);
                  u.repathCd=0.25;
                } else {
                  followPath(u, dt);
                  crushInfantry(u);
                }
              } else {
                followPath(u, dt);
                crushInfantry(u);
              }
              continue;
            }

            // Keep infantry glued to its tile sub-slot after arrival (prevents post-arrival vibration when stacked).
            settleInfantryToSubslot(u, dt);
    
            // Guard/idle auto-acquire: if standing idle and an enemy enters range, engage. Throttle in mass combat.
            if (u.order.type==="idle" && (u.range||0)>0 && u.kind!=="engineer" && state.t >= (u._nextAcquire||0)){
              const idleThrottle = (u.team===TEAM.ENEMY && (u.kind==="infantry" || u.kind==="sniper")) ? 0.42 + (u.id % 11)*0.03 : 0.18 + (u.id % 7)*0.02;
              u._nextAcquire = state.t + idleThrottle;
              const sniperMode = (u.kind==="sniper" || (u.kind==="ifv" && u.passKind==="sniper"));
      const manualLock = !!(u.order && u.order.manual && u.order.allowAuto!==true);
              const enemy = findNearestEnemyFor(u.team, u.x, u.y, u.range||0, sniperMode, true);
              if (enemy){
              const lock = (u.team===TEAM.ENEMY);
              if (sniperMode){
                if (BUILD[enemy.kind]) { /* ignore */ }
                else {
                  const cls = (UNIT[enemy.kind] && UNIT[enemy.kind].cls) ? UNIT[enemy.kind].cls : "";
                  if (cls!=="inf") { /* ignore */ }
                  else {
                u.order={type:"attack", x:u.x, y:u.y, tx:null,ty:null, manual:lock, allowAuto:!lock, lockTarget:lock};
                u.target=enemy.id;
                setPathTo(u, enemy.x, enemy.y);
                u.repathCd=0.3;
              }
                  }
                }
              }
            }
          }
    
    if (u.kind==="harvester"){
            if (u.crushUntil && state.t < u.crushUntil){
              const tgt = (u.crushTargetId!=null) ? getEntityById(u.crushTargetId) : null;
              if (tgt && isInfantryUnit(tgt) && dist2(u.x,u.y,tgt.x,tgt.y) < 820*820){
                u.order = { type:"move", x:tgt.x, y:tgt.y, tx:null, ty:null };
                if (u.repathCd<=0){
                  setPathTo(u, tgt.x, tgt.y);
                  u.repathCd = 0.20;
                }
              } else {
                u.crushUntil = 0;
                u.crushTargetId = null;
                // 위협 제거: idle로 전환 → 아래 idle 블록이 carry/ore에 따라 즉시 harvest/return으로 복구
                u.order = {type:"idle", x:u.x, y:u.y, tx:null, ty:null};
                u.path = null; u.pathI = 0;
              }
            }
            const findBestOrePatch = (center) => {
              // Auto-find ore/gem patch (ore와 gem 모두 ore[] 배열에 저장됨)
              // 나무/건물 등으로 막힌 타일 제외 (isWalkableTile)
              // 다른 하베스터가 선점한 타일 우선 제외 (occVeh) - 여러 하베스터가 1 제련소 공유 시 분산
              // center: optional {x,y} for search origin (e.g. refinery when harvester at dock)
              const wx = (center && center.x != null) ? center.x : u.x;
              const wy = (center && center.y != null) ? center.y : u.y;
              let best=null, bestD=Infinity;
              const cx=tileOfX(wx), cy=tileOfY(wy);
              const skipOccupied = (ii) => (occVeh && (occVeh[ii]||0) > 0);

              // 1) Nearby scan (cheap) - 비어있는 ore 우선
              const R=18;
              for (let dy=-R; dy<=R; dy++){
                for (let dx=-R; dx<=R; dx++){
                  const tx=cx+dx, ty=cy+dy;
                  if (!inMap(tx,ty)) continue;
                  if (!isWalkableTile(tx,ty)) continue;
                  const ii=idx(tx,ty);
                  if (ore[ii]<=0) continue;
                  if (skipOccupied(ii)) continue; // 다른 하베스터가 채굴 중인 타일 제외
                  const pTile=tileToWorldCenter(tx,ty);
                  const px=pTile.x, py=pTile.y;
                  const d=dist2(wx,wy,px,py);
                  if (d<bestD){ bestD=d; best={tx,ty}; }
                }
              }

              // 2) Global fallback - 비어있는 ore
              if (!best){
                for (let ty=0; ty<MAP_H; ty++){
                  for (let tx=0; tx<MAP_W; tx++){
                    if (!isWalkableTile(tx,ty)) continue;
                    const ii=idx(tx,ty);
                    if (ore[ii]<=0) continue;
                    if (skipOccupied(ii)) continue;
                    const pTile=tileToWorldCenter(tx,ty);
                    const px=pTile.x, py=pTile.y;
                    const d=dist2(wx,wy,px,py);
                    if (d<bestD){ bestD=d; best={tx,ty}; }
                  }
                }
              }
              // 3) Fallback: occupied ore도 허용 (다른 하베스터가 곧 비울 수 있음)
              if (!best){
                for (let dy=-R; dy<=R; dy++){
                  for (let dx=-R; dx<=R; dx++){
                    const tx=cx+dx, ty=cy+dy;
                    if (!inMap(tx,ty)) continue;
                    if (!isWalkableTile(tx,ty)) continue;
                    const ii=idx(tx,ty);
                    if (ore[ii]<=0) continue;
                    const pTile=tileToWorldCenter(tx,ty);
                    const px=pTile.x, py=pTile.y;
                    const d=dist2(wx,wy,px,py);
                    if (d<bestD){ bestD=d; best={tx,ty}; }
                  }
                }
              }
              return best;
            };
            // Harvester orders: move, harvest, return (deposit)
            if (u.order.type==="move"){
              followPath(u,dt);
              crushInfantry(u);
              continue;
            }
    
            if (u.order.type==="return"){
              // Force-return to refinery and deposit carry.
              let ref = getEntityById(u.target);
              if (!ref || !ref.alive || ref.kind!=="refinery" || ref.team!==u.team){
                ref = findNearestRefinery(u.team,u.x,u.y);
                u.target = ref ? ref.id : null;
              }
              if (!ref){
                u.target = null; // 파괴된 제련소 참조 제거
                if (hasAnyRefinery(u.team)){
                  const best = findBestOrePatch();
                  if (best){
                    u.order = {type:"harvest", x:u.x,y:u.y, tx:best.tx, ty:best.ty};
                    setPathTo(u, (best.tx+0.5)*TILE, (best.ty+0.5)*TILE);
                    u.repathCd=0.25;
                  } else {
                    u._harvestNoOreTicks = (u._harvestNoOreTicks||0) + 1;
                    if ((u._harvestNoOreTicks||0) >= 48){ u.order.type="idle"; u._harvestNoOreTicks=0; }
                    else u.repathCd = 0.15;
                  }
                } else {
                  u.order.type="idle";
                }
                continue;
              }
    
              const dock=getDockPoint(ref,u);
    
              if (u.repathCd<=0){
                const gTx=(dock.x/TILE)|0, gTy=(dock.y/TILE)|0;
                const pathLost = !u.path || !u.path.length;
                if (pathLost || u.lastGoalTx!==gTx || u.lastGoalTy!==gTy){
                  setPathTo(u, dock.x, dock.y);
                  u.repathCd = pathLost ? 0.25 : 0.55;
                }
              }
              followPath(u,dt);
              crushInfantry(u);
    
              const nearDock = dist2(u.x,u.y,dock.x,dock.y) < 70*70;
              const refR = (Math.max(ref.w, ref.h)*0.55 + 90);
              const nearRef = dist2(u.x,u.y,ref.x,ref.y) < refR*refR;
              if (nearDock || nearRef){
                if (u.carry>0){
                  const add = Math.floor(u.carry);
                  if (u.team===TEAM.PLAYER) state.player.money += add;
                  else state.enemy.money += add;
                  if (state.stats) state.stats.harvest[u.team] = (state.stats.harvest[u.team]||0) + add;
                  u.carry = 0;
                  u._needsRef = false;
                  // Trigger refinery "active" animation (deposit pulse)
                  if (ref && ref.kind==="refinery"){
                    ref._activeT0 = state.t;
                    ref._activePulse = (ref._activePulse||0) + 1;
                  }
                }
                // Back to manual ore if set, otherwise auto.
                if (u.manualOre){
                  u.order={type:"harvest", x:u.x,y:u.y, tx:u.manualOre.tx, ty:u.manualOre.ty};
                  setPathTo(u, (u.manualOre.tx+0.5)*TILE, (u.manualOre.ty+0.5)*TILE);
                  u.repathCd=0.25;
                } else {
                  // After deposit: immediately resume auto-harvest; retry a few times before idle.
                  // Refinery-on-ore: harvester at dock may not see ore (blocked by building); try multiple origins.
                  let best = findBestOrePatch();
                  if (!best && ref){
                    best = findBestOrePatch({x:ref.x, y:ref.y});
                    if (!best){
                      const pad = TILE * 1.5;
                      const origins = [
                        {x: ref.x + pad, y: ref.y}, {x: ref.x - pad, y: ref.y},
                        {x: ref.x, y: ref.y + pad}, {x: ref.x, y: ref.y - pad}
                      ];
                      for (const o of origins){ best = findBestOrePatch(o); if (best) break; }
                    }
                  }
                  if (best){
                    u.order={type:"harvest", x:u.x,y:u.y, tx:best.tx, ty:best.ty};
                    setPathTo(u, (best.tx+0.5)*TILE, (best.ty+0.5)*TILE);
                    u.repathCd=0.25;
                    u._harvestNoOreTicks = 0;
                  } else {
                    // findBestOrePatch null: switch to harvest so harvest block can retry (seekNearbyOre, path loss recovery).
                    // Refinery-on-ore edge case: at dock after deposit, nearby ore depleted/blocked; harvest block has better retry.
                    const cx = tileOfX(u.x), cy = tileOfY(u.y);
                    u.order = {type:"harvest", x:u.x, y:u.y, tx:cx, ty:cy};
                    u.path = null; u.pathI = 0;
                    u._harvestNoOreTicks = (u._harvestNoOreTicks||0) + 1;
                    if ((u._harvestNoOreTicks||0) >= 48){
                      u.order = {type:"idle", x:u.x, y:u.y, tx:null, ty:null};
                      u.target = null;
                      u.path = null; u.pathI = 0;
                      u.manualOre = null;
                      u._harvestNoOreTicks = 0;
                    }
                    u.repathCd = 0.12;
                  }
                }
              }
              continue;
            }

            if (u.order.type==="idle"){
              u._harvestNoOreTicks = 0;
              // 제련소 복구 시 즉시 복귀 (적군 제련소 파괴 후 재건 대응)
              if ((u.carry||0) > 0 && hasAnyRefinery(u.team)){
                const ref = findNearestRefinery(u.team,u.x,u.y);
                if (ref){
                  u.target = ref.id;
                  u.order.type="return";
                  const dock=getDockPoint(ref,u);
                  setPathTo(u,dock.x,dock.y);
                  u.repathCd=0.25;
                  continue;
                }
              }
              // 현재 타일에 ore 있으면 즉시 채굴
              const curTx0 = tileOfX(u.x), curTy0 = tileOfY(u.y);
              if (inMap(curTx0, curTy0) && isWalkableTile(curTx0, curTy0) && ore[idx(curTx0, curTy0)]>0){
                u.order = {type:"harvest", x:u.x,y:u.y, tx:curTx0, ty:curTy0};
                if (!u.path || !u.path.length){
                  setPathTo(u, (curTx0+0.5)*TILE, (curTy0+0.5)*TILE);
                  u.repathCd=0.25;
                }
                continue;
              }
              // carry 있으면 정제소로 복귀
              if ((u.carry||0) > 0 && hasAnyRefinery(u.team)){
                const ref = findNearestRefinery(u.team,u.x,u.y);
                if (ref){
                  u.target = ref.id;
                  u.order.type="return";
                  const dock=getDockPoint(ref,u);
                  setPathTo(u,dock.x,dock.y);
                  u.repathCd=0.25;
                  continue;
                }
              }
              // ore 찾아서 채굴 (정제소 있으면 계속 재시도, 절대 포기 안 함)
              const best = findBestOrePatch();
              if (best){
                u.order={type:"harvest", x:u.x,y:u.y, tx:best.tx, ty:best.ty};
                setPathTo(u, (best.tx+0.5)*TILE, (best.ty+0.5)*TILE);
                u.repathCd=0.25;
              } else if (hasAnyRefinery(u.team)){
                u.repathCd = 0.08; // ore 없어도 다음 틱에 재시도
              }
              continue;
            }
            if (u.order.type==="harvest"){
              // v27: Harvester will keep mining nearby ore until full,
              // unless there is no ore left in the nearby area.
    
              const seekNearbyOre = () => {
                const cx=tileOfX(u.x), cy=tileOfY(u.y);
                const R=7;
                let best=null, bestD=Infinity;
                const skipOcc = (ii) => (occVeh && (occVeh[ii]||0) > 0);
                for (let dy=-R; dy<=R; dy++){
                  for (let dx=-R; dx<=R; dx++){
                    const ax=cx+dx, ay=cy+dy;
                    if (!inMap(ax,ay)) continue;
                    if (!isWalkableTile(ax,ay)) continue;
                    const ii=idx(ax,ay);
                    if (ore[ii]<=0) continue; // ore/gem 공통
                    if (skipOcc(ii)) continue; // 다른 하베스터 선점 타일 제외
                    const pA=tileToWorldCenter(ax,ay);
                    const px=pA.x, py=pA.y;
                    const d=dist2(u.x,u.y,px,py);
                    if (d<bestD){ bestD=d; best={tx:ax, ty:ay}; }
                  }
                }
                if (!best){
                  for (let dy=-R; dy<=R; dy++){
                    for (let dx=-R; dx<=R; dx++){
                      const ax=cx+dx, ay=cy+dy;
                      if (!inMap(ax,ay)) continue;
                      if (!isWalkableTile(ax,ay)) continue;
                      const ii=idx(ax,ay);
                      if (ore[ii]<=0) continue;
                      const pA=tileToWorldCenter(ax,ay);
                      const px=pA.x, py=pA.y;
                      const d=dist2(u.x,u.y,px,py);
                      if (d<bestD){ bestD=d; best={tx:ax, ty:ay}; }
                    }
                  }
                }
                return best;
              };
    
              let tx=u.order.tx, ty=u.order.ty;
              const curOk = inMap(tx,ty) && ore[idx(tx,ty)]>0;

              // If we lost the path to ore, re-pick a valid ore patch.
              if (!u.path || !u.path.length){
                // If we're already on ore, keep mining without path.
                const cx = tileOfX(u.x), cy = tileOfY(u.y);
                if (inMap(cx,cy) && isWalkableTile(cx,cy) && ore[idx(cx,cy)]>0){
                  u.order.tx = cx; u.order.ty = cy;
                  u._harvestNoOreTicks = 0;
                } else {
                  const best = findBestOrePatch();
                  if (best){
                    u.order.tx=best.tx; u.order.ty=best.ty;
                    if (setPathTo(u, (best.tx+0.5)*TILE, (best.ty+0.5)*TILE)) u._harvestNoOreTicks = 0;
                    u.repathCd=0.25;
                  } else {
                    // Don't go idle on first failure: retry for several ticks (pathfinding/race).
                    u._harvestNoOreTicks = (u._harvestNoOreTicks||0) + 1;
                    if ((u._harvestNoOreTicks||0) >= 48){ u.order.type="idle"; u._harvestNoOreTicks=0; }
                    u.repathCd = 0.12;
                    continue;
                  }
                }
              }

              if (!curOk){
                if (u.carry < u.carryMax-1){
                  const n=seekNearbyOre();
                  if (n){
                    u.order.tx=n.tx; u.order.ty=n.ty;
                    setPathTo(u, (n.tx+0.5)*TILE, (n.ty+0.5)*TILE);
                    u.repathCd=0.25;
                    continue;
                  }
                  // No nearby ore: try global findBestOrePatch before giving up.
                  const best = findBestOrePatch();
                  if (best){
                    u.order.tx=best.tx; u.order.ty=best.ty;
                    setPathTo(u, (best.tx+0.5)*TILE, (best.ty+0.5)*TILE);
                    u.repathCd=0.25;
                    continue;
                  }
                }
                if (u.carry>0){
                  const ref=findNearestRefinery(u.team,u.x,u.y);
                  if (ref){
                    u.target = ref.id;
                    u.order.type="return";
                    const dock=getDockPoint(ref,u);
                    setPathTo(u,dock.x,dock.y);
                    u.repathCd=0.25;
                  } else {
                    u._needsRef = true;
                    if (hasAnyRefinery(u.team)) {
                      u.order.type="harvest";
                      const best = findBestOrePatch();
                      if (best){ setPathTo(u, (best.tx+0.5)*TILE, (best.ty+0.5)*TILE); u.repathCd=0.25; }
                    } else u.order.type="idle";
                  }
                } else {
                  u.order.type="idle";
                  u.manualOre=null;
                }
                continue;
              }
    
              // Travel to ore
              followPath(u,dt);
              crushInfantry(u);
              tx=u.order.tx; ty=u.order.ty;
              const pTile=tileToWorldCenter(tx,ty);
                  const px=pTile.x, py=pTile.y;
    
              if (dist2(u.x,u.y,px,py) < (TILE*0.75)*(TILE*0.75)){
                // Mine ONLY when standing still on the ore tile (no mining while moving).
                if (u.path && u.pathI < u.path.length-1) { continue; }
    
                const ii=idx(tx,ty);
                const take=Math.min(55*dt, ore[ii], u.carryMax-u.carry);
                ore[ii] -= take;
                const credit = (isGem && isGem[ii]) ? take*2 : take;
                u.carry = Math.min(u.carryMax, u.carry + credit);
    
                // If full, go deposit.
                if (u.carry >= u.carryMax-1){
                  const ref=findNearestRefinery(u.team,u.x,u.y);
                  if (ref){
                    u.target = ref.id;
                    u.order.type="return";
                    const dock=getDockPoint(ref,u);
                    setPathTo(u,dock.x,dock.y);
                    u.repathCd=0.25;
                  } else {
                    u.order.type="idle";
                  }
                } else if (ore[ii] <= 0){
                  // Current tile depleted: nearby ore, then global ore, then return or idle.
                  const n=seekNearbyOre();
                  if (n){
                    u.order.tx=n.tx; u.order.ty=n.ty;
                    setPathTo(u, (n.tx+0.5)*TILE, (n.ty+0.5)*TILE);
                    u.repathCd=0.25;
                  } else if (u.carry>0){
                    const ref=findNearestRefinery(u.team,u.x,u.y);
                    if (ref){
                      u.target = ref.id;
                      u.order.type="return";
                      const dock=getDockPoint(ref,u);
                      setPathTo(u,dock.x,dock.y);
                      u.repathCd=0.25;
                    } else {
                      u._needsRef = true;
                      if (hasAnyRefinery(u.team)) {
                        u.order.type="harvest";
                        const best = findBestOrePatch();
                        if (best){ setPathTo(u, (best.tx+0.5)*TILE, (best.ty+0.5)*TILE); u.repathCd=0.25; }
                      } else u.order.type="idle";
                    }
                  } else {
                    // No carry: try global findBestOrePatch before giving up to idle.
                    const best = findBestOrePatch();
                    if (best){
                      u.order.tx=best.tx; u.order.ty=best.ty;
                      setPathTo(u, (best.tx+0.5)*TILE, (best.ty+0.5)*TILE);
                      u.repathCd=0.25;
                    } else {
                      u.order.type="idle";
                      u.manualOre=null;
                    }
                  }
                }
                }
              }
              continue;
            }
          if (u.kind==="engineer"){
            if (u.order.type==="move"){
              followPath(u,dt);
              crushInfantry(u);
            } else if (u.order.type==="repairenter"){
              const t=getEntityById(u.target);
              if (!t || !BUILD[t.kind] || t.civ || t.team!==u.team){ u.order.type="idle"; u.target=null; continue; }
              const dock=getClosestPointOnBuilding(t,u);
              if (u.repathCd<=0){
                const gTx=(dock.x/TILE)|0, gTy=(dock.y/TILE)|0;
                if (u.lastGoalTx!==gTx || u.lastGoalTy!==gTy){
                  setPathTo(u,dock.x,dock.y);
                  u.repathCd=0.55;
                }
              }
              followPath(u,dt);
              const edgeD2 = dist2PointToRect(u.x,u.y, t.x, t.y, t.w, t.h);
              const dock2 = dist2(u.x,u.y, dock.x, dock.y);
              if (edgeD2 < 85*85 || dock2 < 90*90){
                // instant full repair, consume engineer
                t.hp = t.hpMax;
                t.repairOn = false;
                u.alive=false;
                state.selection.delete(u.id);
                u.order.type="idle";
                u.target=null;
              }
            } else if (u.order.type==="capture"){
    
              const t=getEntityById(u.target);
              if (!t || !BUILD[t.kind] || t.civ){ u.order.type="idle"; u.target=null; continue; }
              const dock=getClosestPointOnBuilding(t,u);
              if (u.repathCd<=0){
                const gTx=(dock.x/TILE)|0, gTy=(dock.y/TILE)|0;
                if (u.lastGoalTx!==gTx || u.lastGoalTy!==gTy){
                  setPathTo(u,dock.x,dock.y);
                  u.repathCd=0.55;
                }
              }
              followPath(u,dt);
              const edgeD2 = dist2PointToRect(u.x,u.y, t.x, t.y, t.w, t.h);
              const dock2 = dist2(u.x,u.y, dock.x, dock.y);
              if (edgeD2 < 85*85 || dock2 < 90*90){
                if (t.team!==u.team) captureBuilding(u,t);
                else { u.order.type="idle"; u.target=null; }
              }
            }
            continue;
          }
    
          // Auto-acquire: combat units will engage enemies that enter vision while idle.
          // Sniper rule: do NOT pre-emptively attack buildings or vehicle-class units (tanks/IFV/harvester, etc).
          if (u.order.type==="idle" && u.dmg>0 && u.range>0){
            const enemyTeam = u.team===TEAM.PLAYER ? TEAM.ENEMY : TEAM.PLAYER;
            const sniperLike = (u.kind==="sniper" || (u.kind==="ifv" && u.passKind==="sniper"));
            let best=null, bestD2=Infinity;
    
            // Enemy units
            for (const eu of units){
              if (!eu.alive || eu.team!==enemyTeam) continue;
    
              if (sniperLike){
                const cls = UNIT[eu.kind]?.cls;
                if (cls==="veh") continue; // ignore vehicles for auto-acquire
              }
    
              // Player units don't auto-target into unexplored fog.
              if (u.team===TEAM.PLAYER){
                const tx=(eu.x/TILE)|0, ty=(eu.y/TILE)|0;
                if (inMap(tx,ty) && !explored[TEAM.PLAYER][idx(tx,ty)]) continue;
              }
    
              const d2=dist2(u.x,u.y,eu.x,eu.y);
              if (d2 <= u.vision*u.vision && d2 < bestD2){ best=eu; bestD2=d2; }
            }
    
            // Enemy buildings (snipers never auto-acquire buildings)
            if (!sniperLike){
              for (const eb of buildings){
                if (!eb.alive || eb.attackable===false) continue;
                if (eb.team!==enemyTeam) continue;
                if (u.team===TEAM.PLAYER){
                  const tx=(eb.x/TILE)|0, ty=(eb.y/TILE)|0;
                  if (inMap(tx,ty) && !explored[TEAM.PLAYER][idx(tx,ty)]) continue;
                }
                const d2=dist2(u.x,u.y,eb.x,eb.y);
                if (d2 <= u.vision*u.vision && d2 < bestD2){ best=eb; bestD2=d2; }
              }
            }
    
            if (best){
              u.order.type="attack";
              u.target = best.id;
              setPathTo(u, best.x, best.y);
              u.repathCd=0.25;
            }
          }
    
    if (u.order.type==="move"){
            const gx = u.order.x, gy = u.order.y;
            followPath(u,dt);
            crushInfantry(u);
    
            const hasPath = (u.path && u.pathI < u.path.length);
            if (!hasPath && u.order && u.order.type==="move"){
              const d2 = dist2(u.x, u.y, u.order.x, u.order.y);
              if (d2 < 16*16){
                u.order = {type:"idle", x:u.x, y:u.y, tx:null, ty:null};
                u.target = null;
                u.path = null; u.pathI = 0;
                u.vx = 0; u.vy = 0;
                u.stuckT = 0; u.stuckTime = 0; u.yieldCd = 0; u.avoidCd = 0;
                u.restX = u.x; u.restY = u.y;
              } else if (u.repathCd <= 0){
                setPathTo(u, u.order.x, u.order.y);
                u.repathCd = 0.22;
              }
            }
    
          } else if (u.order.type==="forcefire"){
            // Persistently fire at a ground position (Ctrl+Click). If out of range, walk closer.
            const tx = u.order.x, ty = u.order.y;
            const d2 = dist2(u.x,u.y, tx, ty);
            const dEff = Math.sqrt(d2);
            // Lite tank: rotate turret toward ground target too (Ctrl+Click force-fire)
            let _ffAimDir = null;
            if (u.kind==="tank" && !u.inTransport){
              _ffAimDir = worldVecToDir8(tx - u.x, ty - u.y);
              _tankUpdateTurret(u, _ffAimDir, dt);
              u.fireDir = _ffAimDir;
              u.faceDir = _ffAimDir;
            }
            if (u.repathCd<=0){
              const gTx=(tx/TILE)|0, gTy=(ty/TILE)|0;
              if (u.lastGoalTx!==gTx || u.lastGoalTy!==gTy){
                setPathTo(u, tx, ty);
                u.repathCd=0.45;
              }
            }
            if (dEff > (u.range||0)){
              followPath(u,dt);
              crushInfantry(u);
            } else {
              u.path=null;
              if (u.shootCd<=0 && (u.kind!=="tank" || (_ffAimDir!=null && u.turretDir===_ffAimDir && !u.turretTurn))){
                u.shootCd=u.rof*getVeteranROF(u);
                u.holdPosT = 0.10;
                u.fireHoldT = Math.max(u.fireHoldT||0, 0.28);
                if (u.kind==="sniper"){ u.cloakBreak = Math.max(u.cloakBreak, 1.15); }
                // Visual + light splash damage.
                if (isHitscanUnit(u)){
                  // Make ground-fire consistent with unit-fire visuals for all hitscan weapons (sniper/infantry/IFV passenger).
                  hitscanShot(u, { x: tx, y: ty, cls:"inf" });
                  const d = Math.max(1, u.dmg*0.35);
                  applyAreaDamageAt(tx,ty, 18, d, u.id, u.team);
                  applyOreDamageInRadius(tx, ty, 18, d);
                } else if (u.kind==="tank") {
                  spawnBullet(u.team, u.x, u.y, tx, ty, Math.max(1, u.dmg*0.6), u.id, { kind:"shell", dur: 0.12, h: 18 });
                  const d = Math.max(1, u.dmg*0.45);
                  applyAreaDamageAt(tx,ty, 22, d, u.id, u.team, true);
                  applyOreDamageInRadius(tx, ty, 22, d);
                } else if (u.kind==="ifv") {
                  // IFV force-fire should use its normal weapon visuals (no tank arc).
                  if (isHitscanUnit(u)){
                    if (u.passKind==="sniper"){
                      spawnTrace(u.x, u.y, tx, ty, u.team, { kind:"tmg", life:0.12, delay:0, fx:"sniper" });
                      const d = Math.max(1, u.dmg*0.20);
                      applyAreaDamageAt(tx,ty, 14, d, u.id, u.team);
                      applyOreDamageInRadius(tx, ty, 14, d);
                    } else {
                      spawnMGTracers(u, { x: tx, y: ty, cls:"inf" });
                      const d = Math.max(1, u.dmg*0.35);
                      applyAreaDamageAt(tx,ty, 18, d, u.id, u.team);
                      applyOreDamageInRadius(tx, ty, 18, d);
                    }
                  } else {
                    // unloaded IFV missile mode (ground fire): missiles handle impact FX + damage on arrival
                    fireIFVMissiles(u, {x:tx, y:ty, id:null, _ground:true});
                  }
                } else {
                  spawnBullet(u.team, u.x, u.y, tx, ty, Math.max(1, u.dmg*0.6), u.id, { sp: 720 });
                  const d = Math.max(1, u.dmg*0.35);
                  applyAreaDamageAt(tx,ty, 20, d, u.id, u.team, true);
                  applyOreDamageInRadius(tx, ty, 20, d);
                }
              }
            }
    
          } else if (u.order.type==="attack"){
            const t=getEntityById(u.target);
            const enemySniper = (u.team===TEAM.ENEMY && (u.kind==="sniper" || (u.kind==="ifv" && u.passKind==="sniper")));
            if (!t || t.attackable===false || !t.alive || (enemySniper && (BUILD[t.kind] || (UNIT[t.kind]?.cls==="veh")))){
              u.target=null;
              if (u.guard && u.guard.on && u.guardFrom){
                u.order={type:"guard_return", x:u.guard.x0, y:u.guard.y0, tx:null,ty:null};
                setPathTo(u, u.guard.x0, u.guard.y0);
                u.repathCd=0.35;
                continue;
              }
              u.order.type="idle";
              u.guardFrom=false;
              continue;
            }
    
            // v1413: stable standoff slot seed per target to prevent orbit/jitter.
            if (u.atkSeedTgt !== u.target){
              u.atkSeedTgt = u.target;
              u.atkSeedAng = Math.atan2(u.y - t.y, u.x - t.x);
            } else if (u.atkSeedAng==null || !isFinite(u.atkSeedAng)){
              u.atkSeedAng = Math.atan2(u.y - t.y, u.x - t.x);
            }
    
    
    // Face the aim point while attacking (infantry/sniper).
    // Use projected direction (worldVecToDir8) so sprite matches on-screen compass.
    if ((u.kind==="infantry" || u.kind==="sniper") && !u.inTransport){
      // Aim point: use target's current world position.
      const aimX = t.x;
      const aimY = t.y;
      const fdx = (aimX - u.x);
      const fdy = (aimY - u.y);
      const fd = worldVecToDir8(fdx, fdy);
      u.faceDir = fd;
      u.dir = fd;
      u.fireDir = fd;
    }
    
            const isB = !!BUILD[t.kind];
            // Effective distance to target boundary (unit radius or building footprint)
            const dEff = _effDist(u, t, u.x, u.y);
    
            // Movement while attacking:
            //  - For UNIT targets: once in range, STOP moving/repathing completely (prevents '움찔' jitter)
            //  - For BUILDING targets: keep standoff positioning (ok to adjust)
            // Hysteresis to prevent "in range" flicker causing micro step-jitter.
            // Once we enter hold, we stay holding until target moves clearly out of range.
            const enterHold = 0.0; // px margin (enter as soon as we are in nominal range)
            // Hysteresis: big margin prevents jitter, but against fast moving vehicles (IFV) it can cause
            // infantry to 'give up' pursuit while target kites just outside range. So shrink hysteresis
            // for moving unit targets.
            let exitHold  = 14.0;
            if (!isB && t && t.type==="unit"){
              const tv = Math.hypot(t.vx||0, t.vy||0);
              if (tv > 8) exitHold = 8.0; // chase sooner when target is moving
            }
            if (u.team===TEAM.ENEMY && u.kind==="infantry"){
              // Enemy infantry: stick to target more, reduce "shoot-move-shoot" jitter.
              exitHold = Math.max(exitHold, 28.0);
            }
            if (u.holdAttack==null) u.holdAttack=false;
            if (!u.holdAttack) u.holdAttack = (dEff <= (u.range - enterHold));
            else u.holdAttack = !(dEff > (u.range + exitHold));
    
            let deadZone = 1.5; // smaller deadzone: prevents "stare" when slightly out of range in crowds
            if (u.team===TEAM.ENEMY && u.kind==="infantry"){
              deadZone = 6.0;
            }
            const needMove = (!u.holdAttack) && (dEff > (u.range + deadZone));
            // If we entered holdAttack right at max range and then got nudged / target drifted,
            // hysteresis could keep us "holding" while actually out of range, causing a stare-lock.
            if (dEff > u.range){
              u._oorT = (u._oorT||0) + dt;
            } else {
              u._oorT = 0;
            }
            const oorLimit = (u.team===TEAM.ENEMY && u.kind==="infantry") ? 0.35 : 0.12;
            if (u.holdAttack && (u._oorT||0) > oorLimit){
              u.holdAttack = false;
              u.atkX = null; u.atkY = null;
            }
    
    
            if (u.holdAttack){
    // Hard-hold position when already in range vs a unit.
    // v130: also clear any leftover path progress and pin a per-attack anchor to eliminate micro "움찔".
    u.path = null; u.pathI = 0;
    u.vx = 0; u.vy = 0;
    u.repathCd = Math.max(u.repathCd||0, 0.20);
    // Record an attack anchor when we enter in-range hold.
    if (u.atkX==null || u.atkY==null){ u.atkX = u.x; u.atkY = u.y; }
    // Keep a small hold timer so other systems won't micro-adjust this frame.
    u.holdPosT = Math.max(u.holdPosT||0, 0.25);
        u.combatGoalT = Math.max(0, (u.combatGoalT||0) - dt);
    
            } else {
              // Combat approach:
    //  - UNIT targets: simple chase toward center until in range.
    //  - BUILDING targets: move to a stable standoff point near max range.
    //    This avoids picking a goal inside/too close to the blocked building footprint (which causes jitter/dance).
    u.atkX = null; u.atkY = null;
    
    let goalX, goalY;
    if (isB){
      const targetRad = Math.max(t.w||0, t.h||0) * 0.5;
      const wantDist = u.range * 0.88;
      const g = getStandoffPoint(u, t, wantDist, true, targetRad, u.atkSeedAng);
      goalX = g.x; goalY = g.y;
    } else {
      // Use target TILE center as chase goal to avoid constant repath "움찔" on moving targets.
      const ttX = tileOfX(t.x), ttY = tileOfY(t.y);
      const tc = tileToWorldCenter(ttX, ttY);
      goalX = tc.x; goalY = tc.y;
    }
    
    // If we are out of range, keep pushing in. If path is missing or we're stuck, repath promptly.
      if (needMove){
      const spd = Math.hypot(u.vx||0, u.vy||0);
      u._atkStuckT = (u._atkStuckT||0) + ((spd < 1.0) ? dt : 0);
    
      const gTx=(goalX/TILE)|0, gTy=(goalY/TILE)|0;
      const goalChanged = (u.lastGoalTx!==gTx || u.lastGoalTy!==gTy);
      const stuck = ((u._atkStuckT||0) > 0.45);
      // Repath rules (anti-"댄스" / anti-"움찔"):
      // - If we have no path: path now.
      // - If we're stuck: path now.
      // - If repath timer elapsed: ONLY repath when the goal tile actually changed.
      if (!u.path || stuck || (u.repathCd<=0 && goalChanged)){
          setPathTo(u, goalX, goalY);
          // Buildings repath slower; moving unit targets also slower now because goal is tile-centered.
          u.repathCd = isB ? 0.35 : 0.26;
          u._atkStuckT = 0;
      }
      followPath(u,dt);
      crushInfantry(u);
    } else {
      // In (or very near) range: stop cleanly and let firing logic handle shots.
      u.path = null;
      u.vx = 0; u.vy = 0;
      u._atkStuckT = 0;
    }
    
    
            }
            // Turret aim (lite tank): rotate turret independently of hull.
            let _tankAimDir = null;
            if (u.kind==="tank" && !u.inTransport){
              _tankAimDir = worldVecToDir8(t.x - u.x, t.y - u.y);
              _tankUpdateTurret(u, _tankAimDir, dt);
              u.fireDir = _tankAimDir;
              u.faceDir = _tankAimDir;
            }
    
            // Fire whenever in range (even if we are still sliding into position).
            if (dEff <= u.range && u.shootCd<=0 && (u.kind!=="tank" || (u.turretDir===_tankAimDir && !u.turretTurn))){
              u.shootCd=u.rof*getVeteranROF(u);
              u.holdPosT = 0.12;
              u.fireHoldT = Math.max(u.fireHoldT||0, 0.28);
              if (u.kind==="sniper"){ u.cloakBreak = Math.max(u.cloakBreak, 1.15); u._justShot = true; }
              if (u.kind==="ifv" && u.passKind==="sniper"){ /* revealed via passenger */ }
              if (isHitscanUnit(u)) hitscanShot(u,t);
              else {
                if (u.kind==="tank") fireTankShell(u,t);
                else if (u.kind==="ifv" && !u.passKind) fireIFVMissiles(u,t);
                else spawnBullet(u.team,u.x,u.y,t.x,t.y,u.dmg,u.id);
              }
              u._justShot = true;
            }
          }
    
        }
    
        // Tank post-FX: turret idle tracking + dust trail + damage smoke
        for (const u of units){
          if (!u.alive || u.inTransport) continue;
    
          // Dust trail for vehicles (tank/ifv/etc) while moving
          const _uDef = (typeof UNIT!=="undefined" && UNIT) ? UNIT[u.kind] : null;
          const _isVeh = (u.cls==="veh") || (_uDef && _uDef.cls==="veh");
          if (_isVeh){
            // Velocity estimate from actual displacement (movement code may not maintain u.vx/u.vy consistently)
            let vx = 0, vy = 0;
            if (u._fxLastX!=null && u._fxLastY!=null && dt>0){
              vx = (u.x - u._fxLastX) / dt;
              vy = (u.y - u._fxLastY) / dt;
            }
            u._fxLastX = u.x; u._fxLastY = u.y;
            // Keep legacy fields updated for other systems
            u.vx = vx; u.vy = vy;
    
            const spd = Math.hypot(vx, vy);
            if (spd > 6){
              u._dustAcc = (u._dustAcc || 0) + dt;
              const interval = 0.04;
              if (u._dustAcc >= interval){
                u._dustAcc = 0;
    
                const backx = -vx / spd, backy = -vy / spd;
    
                // Track smoke should come from the *rear* of the hull (visible behind the sprite).
                const backOff = TILE * 0.42;
    
                // Alternate left/right to feel like two tracks.
                u._dustSide = (u._dustSide || 0) ^ 1;
                const sideSign = u._dustSide ? 1 : -1;
    
                const px = -backy, py = backx; // perpendicular unit (since backx/backy is unit)
                const sideOff = TILE * 0.16 * sideSign;
    
                const wx = u.x + backx * backOff + px * sideOff;
                const wy = u.y + backy * backOff + py * sideOff;
    
                // Subtle track haze (uses the same soft gradient style as building smoke)
                spawnTrailPuff(wx, wy, vx, vy, 0.85);
                spawnTrailPuff(wx + px*(TILE*0.10), wy + py*(TILE*0.10), vx, vy, 0.65);
    }
            } else {
              u._dustAcc = 0;
            }
    
            // Damage smoke when HP is in yellow/red (spawned at the time, does NOT follow unit)
            const hpPct = (u.hpMax>0) ? (u.hp / u.hpMax) : 1;
            if (hpPct < 0.50 && (UNIT[u.kind] && UNIT[u.kind].cls==="veh")){
              u._dmgSmokeAcc = (u._dmgSmokeAcc || 0) + dt;
              const interval = (hpPct < 0.20) ? 0.08 : 0.14;
              if (u._dmgSmokeAcc >= interval){
                u._dmgSmokeAcc = 0;
                // Rough turret/top origin (good enough visually, and stays world-fixed)
                const wx = u.x;
                const wy = u.y - (TILE * 0.06);
                spawnDmgSmokePuff(wx, wy, 1.0);
              }
            } else {
              u._dmgSmokeAcc = 0;
            }
          }
    
          // Tank turret auto facing:
          // - If no valid unit target in range, turret looks where the hull is moving.
          // - If an enemy unit is in range, turret tracks that unit.
          // - Buildings are ignored for auto-tracking.
          if (u.kind === "tank"){
            const ot = u.order ? u.order.type : null;
            if (ot !== "attack" && ot !== "forcefire"){
              let desired = null;
              if (state.t >= (u._nextTurretScan||0)){
                u._nextTurretScan = state.t + 0.08;
                const tgt = findNearestEnemyFor(u.team, u.x, u.y, u.range, false, true);
                if (tgt && tgt.alive && tgt.kind !== "harvester"){
                  desired = worldVecToDir8(tgt.x - u.x, tgt.y - u.y);
                  u._lastTurretDesired = desired;
                } else u._lastTurretDesired = null;
              }
              if (desired == null) desired = u._lastTurretDesired;
              if (desired == null){
                const vx = u.vx || 0, vy = u.vy || 0;
                const spd = Math.hypot(vx, vy);
                if (spd > 20) desired = worldVecToDir8(vx, vy);
                else if (typeof u.bodyDir === "number") desired = u.bodyDir;
                else if (typeof u.dir === "number") desired = u.dir;
              }

              if (desired != null){
                _tankUpdateTurret(u, desired, dt);
              }
            }
          }
        }
    
        // Resolve overlaps after movement so units don't clump forever.
        resolveUnitOverlaps();
      }
      if (units.length>0){
        const last = units[units.length-1];
        if (last.alive && !last.inTransport && last._occOldTx!=null && last._occOldTy!=null){
          const nTx=tileOfX(last.x), nTy=tileOfY(last.y);
          if (last._occOldTx!==nTx || last._occOldTy!==nTy){
            updateOccForUnitMove(last, last._occOldTx, last._occOldTy, nTx, nTy);
          }
        }
      }

    let _pathFindBudget = 0;
    const MAX_PATHFINDS_PER_FRAME = 32;

    function tickSim(dt) {
      _pathFindBudget = MAX_PATHFINDS_PER_FRAME;
      tickUnits(dt);
      tickTurrets(dt);
      tickBullets(dt);
    }

    return {
      tickSim,
      clearOcc,
      resolveUnitOverlaps,
      getStandoffPoint,
      updateVision,
      isReservedByOther,
      reserveTile,
      isSqueezedTile,
      findNearestFreeStep,
      canEnterTile,
      canEnterTileGoal,
      heuristic,
      aStarPath,
      aStarPathOcc,
      setPathTo,
      clearReservation,
      settleInfantryToSubslot,
      findNearestFreePoint,
      findNearestRefinery,
      getDockPoint,
      getClosestPointOnBuilding,
      dist2PointToRect,
      recordKill,
      recordLoss,
      recordConstruction,
      recordCapture,
      recordProduction
    };
  };
})(window);





















