// ai.js
// - Enemy AI logic (build/production/harass/attack decisions)
// - No DOM dependencies. Call tick() from game loop.

(function (global) {
  "use strict";

  const OUAi = global.OUAi || (global.OUAi = {});

  OUAi.create = function create(refs) {
    const r = refs || {};

    const buildings = r.buildings || [];
    const units = r.units || [];
    const state = r.state || {};
    const TEAM = r.TEAM || {};
    const BUILD = r.BUILD || {};
    const DEFENSE = r.DEFENSE || {};
    const UNIT = r.UNIT || {};
    const COST = r.COST || {};
    const TILE = r.TILE || 48;
    const WORLD_W = r.WORLD_W || 0;
    const WORLD_H = r.WORLD_H || 0;
    const GAME_SPEED = r.GAME_SPEED || 1;
    const BUILD_PROD_MULT = r.BUILD_PROD_MULT || 1;

    const clamp = r.clamp;
    const rnd = r.rnd;
    const dist2 = r.dist2;
    const getPowerFactor = r.getPowerFactor;
    const getBaseBuildTime = r.getBaseBuildTime;
    const inMap = r.inMap;
    const isBlockedFootprint = r.isBlockedFootprint;
    const isTooCloseToOtherBuildings = r.isTooCloseToOtherBuildings;
    const buildingWorldFromTileOrigin = r.buildingWorldFromTileOrigin;
    const inBuildRadius = r.inBuildRadius;
    const addBuilding = r.addBuilding;
    const findNearestFreePoint = r.findNearestFreePoint;
    const setPathTo = r.setPathTo;
    const getEntityById = r.getEntityById;
    const boardUnitIntoIFV = r.boardUnitIntoIFV;
    const unboardIFV = r.unboardIFV;
    const getClosestPointOnBuilding = r.getClosestPointOnBuilding;
    const dist2PointToRect = r.dist2PointToRect;
    const tileToWorldCenter = r.tileToWorldCenter;

    const ai = {
      nextThink: 0,
      rally: { x: 0, y: 0 },
      waveT: 0,
      // build queue for enemy (RA2-ish money drain)
      build: { queue: null, ready: null },
      // high-level mode
      mode: "build", // build | rally | attack | defend
      attackUntil: 0,
      harassNext: 0,
      engineerNext: 0,
      nextWave: 0
    };

    // ===== ENEMY AGGRESSION / ANTI-CLUSTER HELPERS =====
    function enemyAttackTarget() {
      // Prefer player HQ if alive, else any player building, else any player unit.
      for (const b of buildings) {
        if (b.alive && !b.civ && b.team === TEAM.PLAYER && b.kind === "hq") return { x: b.x, y: b.y };
      }

      // ===== ENGINEER BEHAVIOR FIX (v10) =====
      function pushEngineerOut(u) {
        if (!u || !u.alive || u.kind !== "engineer" || u.team !== TEAM.ENEMY) return;
        // If hanging near own barracks/HQ, force it to rally so it doesn't block exits.
        const nearProd = buildings.some(
          (b) => b.alive && !b.civ && b.team === TEAM.ENEMY && (b.kind === "barracks" || b.kind === "hq") && dist2(u.x, u.y, b.x, b.y) < (420 * 420)
        );
        const noProd = (u._noProdUntil && state.t < u._noProdUntil);
        if (nearProd || noProd) {
          const rx = ai.rally.x + rnd(-TILE * 2.4, TILE * 2.4);
          const ry = ai.rally.y + rnd(-TILE * 2.4, TILE * 2.4);
          u.order = { type: "move", x: rx, y: ry, tx: null, ty: null };
          setPathTo(u, rx, ry);
          u.repathCd = 0.06;
          u._noProdUntil = state.t + 7.0;
        }
      }

      for (const b of buildings) {
        if (b.alive && !b.civ && b.team === TEAM.PLAYER) return { x: b.x, y: b.y };
      }
      for (const u of units) {
        if (u.alive && u.team === TEAM.ENEMY && u.kind === "engineer") pushEngineerOut(u);
        if (u.alive && u.team === TEAM.PLAYER) return { x: u.x, y: u.y };
      }
      return { x: WORLD_W * 0.5, y: WORLD_H * 0.5 };
    }

    function enemyRallyPoint() {
      const t = enemyAttackTarget();
      const ox = rnd(-TILE * 1.6, TILE * 1.6);
      const oy = rnd(-TILE * 1.6, TILE * 1.6);
      return { x: clamp(t.x + ox, 0, WORLD_W), y: clamp(t.y + oy, 0, WORLD_H) };
    }

    function enemyUnstuck(u, dt) {
      // track movement
      if (u._stuckT == null) { u._stuckT = 0; u._lx = u.x; u._ly = u.y; }
      const moved = dist2(u.x, u.y, u._lx, u._ly);
      if (moved < 6 * 6) u._stuckT += dt;
      else { u._stuckT = 0; u._lx = u.x; u._ly = u.y; }
      // If stuck for >1.6s, reissue attackmove with a fresh offset
      if (u._stuckT > 1.6) {
        const p = enemyRallyPoint();
        u.order = { type: "attackmove", x: p.x, y: p.y, tx: null, ty: null };
        u.path = null; u.pathI = 0;
      }
    }

    // AI helper: pick an engineer docking point that tries to avoid player turret range.
    function aiEngineerDockAvoidTurrets(target, eng) {
      const spec = BUILD[target.kind] || { tw: 1, th: 1 };
      const turrets = buildings.filter(b => b.alive && !b.civ && b.team === TEAM.PLAYER && b.kind === "turret");
      const pCombat = units.filter(u => u.alive && u.team === TEAM.PLAYER && u.kind !== "harvester" && u.kind !== "engineer");
      const range = (DEFENSE.turret && DEFENSE.turret.range) ? DEFENSE.turret.range : 520;

      // Sample a thicker perimeter so the engineer has a chance to choose a genuinely safer side.
      const padTiles = 3;

      const candidates = [];
      const x0 = target.tx - padTiles;
      const y0 = target.ty - padTiles;
      const x1 = target.tx + spec.tw + padTiles - 1;
      const y1 = target.ty + spec.th + padTiles - 1;

      for (let ty = y0; ty <= y1; ty++) {
        for (let tx = x0; tx <= x1; tx++) {
          const onPerim = (tx === x0 || tx === x1 || ty === y0 || ty === y1);
          if (!onPerim) continue;
          if (!inMap(tx, ty)) continue;
          if (isBlockedFootprint(tx, ty, 1, 1)) continue;
          const pW = tileToWorldCenter(tx, ty);
          const wx = pW.x, wy = pW.y;
          candidates.push({ x: wx, y: wy });
        }
      }
      if (!candidates.length) return getClosestPointOnBuilding(target, eng);

      // Danger model: penalize being inside turret range, and also prefer points with a larger
      // "clearance" from the nearest turret even if all points are technically unsafe.
      const hardR2 = (range + 120) * (range + 120); // conservative
      function nearestTurretDist2(x, y) {
        let best = Infinity;
        for (const t of turrets) {
          const d2 = dist2(x, y, t.x, t.y);
          if (d2 < best) best = d2;
        }
        return best;
      }

      let best = null, bestScore = Infinity;
      for (const c of candidates) {
        const d = Math.sqrt(dist2(eng.x, eng.y, c.x, c.y));
        const nd2 = turrets.length ? nearestTurretDist2(c.x, c.y) : Infinity;
        const inRange = (nd2 < hardR2) ? 1 : 0;

        // If in range: big penalty.
        // Otherwise: prefer higher clearance (larger nd2) slightly, but distance still matters.
        const clearanceBonus = turrets.length ? (1 / Math.max(1, nd2)) : 0;
        // Avoid running through player combat blobs.
        let unitPenalty = 0;
        for (const pu of pCombat) {
          const ud2 = dist2(c.x, c.y, pu.x, pu.y);
          if (ud2 < 260 * 260) unitPenalty += (260 * 260 - ud2) / (260 * 260);
        }
        const score = inRange * 1e9 + d + clearanceBonus * 2e7 + unitPenalty * 600;

        if (score < bestScore) { bestScore = score; best = c; }
      }
      return best || getClosestPointOnBuilding(target, eng);
    }

    function aiPickRally() {
      // Aggressive rally: stage forward toward player HQ/buildings (avoid HQ-hugging)
      const ehq = buildings.find(b => b.alive && !b.civ && b.team === TEAM.ENEMY && b.kind === "hq");
      const phq = buildings.find(b => b.alive && !b.civ && b.team === TEAM.PLAYER && b.kind === "hq");
      let tx = phq ? phq.x : WORLD_W * 0.5;
      let ty = phq ? phq.y : WORLD_H * 0.5;
      if (!phq) {
        const pb = buildings.find(b => b.alive && !b.civ && b.team === TEAM.PLAYER);
        if (pb) { tx = pb.x; ty = pb.y; }
      }
      if (ehq) {
        // Keep rally closer to enemy base to avoid overextension.
        ai.rally.x = ehq.x + (tx - ehq.x) * 0.25 + rnd(-TILE * 1.2, TILE * 1.2);
        ai.rally.y = ehq.y + (ty - ehq.y) * 0.25 + rnd(-TILE * 1.2, TILE * 1.2);
      } else {
        ai.rally.x = tx + rnd(-TILE * 1.2, TILE * 1.2);
        ai.rally.y = ty + rnd(-TILE * 1.2, TILE * 1.2);
      }
      ai.rally.x = clamp(ai.rally.x, 0, WORLD_W);
      ai.rally.y = clamp(ai.rally.y, 0, WORLD_H);
    }

    function aiEnemyHas(kind) {
      return buildings.some(b => b.alive && !b.civ && b.team === TEAM.ENEMY && b.kind === kind);
    }
    function aiEnemyCount(kind) {
      let n = 0;
      for (const b of buildings) if (b.alive && !b.civ && b.team === TEAM.ENEMY && b.kind === kind) n++;
      return n;
    }
    function aiEnemyCenters() {
      return buildings.filter(b => b.alive && !b.civ && b.team === TEAM.ENEMY && b.provideR > 0);
    }
    function playerDefenseHeavy() {
      const tur = buildings.filter(b => b.alive && !b.civ && b.team === TEAM.PLAYER && b.kind === "turret").length;
      return tur >= 4;
    }

    function aiTryStartBuild(kind) {
      // Only one building build at a time (simple, RA2-ish sidebar)
      if (ai.build.queue || ai.build.ready) return false;
      if (!aiEnemyHas("hq")) return false;

      const centers = aiEnemyCenters();
      if (!centers.length) return false;

      ai.build.queue = {
        kind,
        t: 0,
        tNeed: getBaseBuildTime(kind),
        cost: (COST[kind] || 0),
        paid: 0
      };
      return true;
    }

    function aiTryPlaceReady() {
      if (!ai.build.ready) return false;
      if (!aiEnemyHas("hq")) { ai.build.ready = null; ai.build.queue = null; return false; }

      const kind = ai.build.ready;
      const spec = BUILD[kind];
      if (!spec) { ai.build.ready = null; return false; }

      const centers = aiEnemyCenters();
      if (!centers.length) return false;

      // Choose a center: prefer HQ, else first center
      let center = centers.find(b => b.kind === "hq") || centers[0];

      // Placement heuristics:
      // - Turrets: prefer near HQ/refinery perimeter
      // - Others: near centers but not overlapping
      const tries = (kind === "turret") ? 260 : 200;
      for (let i = 0; i < tries; i++) {
        let tx, ty;

        if (kind === "turret") {
          // ring-ish placement around HQ/refinery
          const anchor = buildings.find(b => b.alive && !b.civ && b.team === TEAM.ENEMY && (b.kind === "refinery" || b.kind === "hq")) || center;
          const r0 = 5 + ((Math.random() * 7) | 0);
          const ang = Math.random() * Math.PI * 2;
          tx = anchor.tx + Math.round(Math.cos(ang) * r0);
          ty = anchor.ty + Math.round(Math.sin(ang) * r0);
        } else {
          tx = center.tx + ((Math.random() * 30) | 0) - 15;
          ty = center.ty + ((Math.random() * 30) | 0) - 15;
        }

        if (!inMap(tx, ty)) continue;
        if (isBlockedFootprint(tx, ty, spec.tw, spec.th)) continue;
        if (isTooCloseToOtherBuildings(tx, ty, spec.tw, spec.th, 1)) continue;

        const wpos = buildingWorldFromTileOrigin(tx, ty, spec.tw, spec.th);
        if (!inBuildRadius(TEAM.ENEMY, wpos.cx, wpos.cy)) continue;

        addBuilding(TEAM.ENEMY, kind, tx, ty);
        ai.build.ready = null;
        return true;
      }
      return false;
    }

    function tickEnemySidebarBuild(dt) {
      // Mirrors tickSidebarBuild() but for TEAM.ENEMY (no UI)
      if (!aiEnemyHas("hq")) { ai.build.queue = null; ai.build.ready = null; return; }
      if (!ai.build.queue) return;
      const q = ai.build.queue;
      const pf = getPowerFactor(TEAM.ENEMY);
      const speed = pf * GAME_SPEED * BUILD_PROD_MULT;

      const want = dt * speed;
      const costTotal = q.cost || 0;
      const tNeed = q.tNeed || 0.001;
      const payRate = (costTotal <= 0) ? 0 : (costTotal / tNeed);

      const e = state.enemy;
      const canByMoney = (payRate <= 0) ? want : (e.money / payRate);
      const delta = Math.min(want, canByMoney);
      if (delta <= 0) return;

      const pay = payRate * delta;
      e.money -= pay;
      q.paid = (q.paid || 0) + pay;
      q.t += delta;

      if (q.t >= tNeed - 1e-6) {
        q.t = tNeed; q.paid = costTotal;
        ai.build.ready = q.kind;
        ai.build.queue = null;
      }
    }

    function aiCommandMoveToRally(list) {
      let k = 0; const spacing = 46;
      for (const u of list) {
        const col = k % 5, row = (k / 5) | 0;
        const ox = (col - 2) * spacing;
        const oy = row * spacing - spacing;
        let gx = ai.rally.x + ox, gy = ai.rally.y + oy;
        const spot = findNearestFreePoint(gx, gy, u, 5);
        if (spot && spot.found) { gx = spot.x; gy = spot.y; }
        u.order = { type: "move", x: gx, y: gy, tx: null, ty: null };
        u.restX = null; u.restY = null;
        setPathTo(u, gx, gy);
        u.repathCd = 0.55;
        k++;
      }
    }

    function aiCommandAttackWave(list, target) {
      for (const u of list) {
        // Don't override engineer-IFV harassment/capture logic.
        if (u.kind === "ifv" && u.passengerId && u.passKind === "engineer") continue;
        // Keep snipers out of frontal waves (they should IFV-harass instead).
        if (u.kind === "sniper") continue;
        // Avoid sending empty IFVs to frontal waves (keep them for passenger pickup).
        if (u.kind === "ifv" && !u.passengerId) continue;
        u.order = { type: "attack", x: u.x, y: u.y, tx: null, ty: null };
        u.target = target ? target.id : null;
        if (target) setPathTo(u, target.x, target.y);
        u.repathCd = 0.55;
      }
    }

    function aiPickPlayerTarget() {
      // Priority: harvester (eco) -> refinery -> HQ -> nearest building
      const pHarv = units.find(u => u.alive && u.team === TEAM.PLAYER && u.kind === "harvester");
      if (pHarv) return pHarv;

      const pRef = buildings.find(b => b.alive && !b.civ && b.team === TEAM.PLAYER && b.kind === "refinery");
      if (pRef) return pRef;

      const pHQ = buildings.find(b => b.alive && !b.civ && b.team === TEAM.PLAYER && b.kind === "hq");
      if (pHQ) return pHQ;

      const candidates = buildings.filter(b => b.alive && !b.civ && b.team === TEAM.PLAYER);
      if (!candidates.length) return null;
      candidates.sort((a, b) => dist2(ai.rally.x, ai.rally.y, a.x, a.y) - dist2(ai.rally.x, ai.rally.y, b.x, b.y));
      return candidates[0];
    }

    function aiPickPlayerInfantry() {
      const inf = units.filter(u => u.alive && u.team === TEAM.PLAYER && (UNIT[u.kind] && UNIT[u.kind].cls === "inf") && !u.inTransport && !u.hidden);
      if (!inf.length) return null;
      inf.sort((a, b) => dist2(ai.rally.x, ai.rally.y, a.x, a.y) - dist2(ai.rally.x, ai.rally.y, b.x, b.y));
      return inf[0];
    }

    function aiThreatNearBase() {
      const centers = aiEnemyCenters();
      if (!centers.length) return 0;
      const anchor = centers.find(b => b.kind === "hq") || centers[0];
      let n = 0;
      for (const u of units) {
        if (!u.alive || u.team !== TEAM.PLAYER) continue;
        if (dist2(u.x, u.y, anchor.x, anchor.y) <= (520 * 520)) n++;
      }
      return n;
    }

    function aiEnsureTechAndEco(e, underPower) {
      // Tech progression + "if production missing, rebuild it" behavior.
      // Priority is dynamic based on what's missing.
      const hasRef = aiEnemyHas("refinery");
      const hasPow = aiEnemyHas("power");
      const hasBar = aiEnemyHas("barracks");
      const hasFac = aiEnemyHas("factory");
      const hasRad = aiEnemyHas("radar");

      // If only HQ, don't get stuck: power -> refinery -> barracks -> factory -> radar
      const powerMargin = (e.powerProd || 0) - (e.powerUse || 0);
      if (!hasPow) { aiTryStartBuild("power"); return true; }
      if (!hasRef) { aiTryStartBuild("refinery"); return true; }
      if (underPower || powerMargin < 6) { aiTryStartBuild("power"); return true; }
      if (!hasBar) { aiTryStartBuild("barracks"); return true; }
      if (!hasFac) { aiTryStartBuild("factory"); return true; }
      if (!hasRad && e.money > COST.radar * 0.25) { aiTryStartBuild("radar"); return true; }

      // Once tech is up, scale economy (2nd refinery) if rich enough
      if (hasRad && aiEnemyCount("refinery") < 2 && e.money > 900) { aiTryStartBuild("refinery"); return true; }

      return false;
    }

    function aiPlaceDefenseIfRich(e) {
      // Place turrets around base when wealthy and not already decent.
      const tur = aiEnemyCount("turret");
      const hasRad = aiEnemyHas("radar");
      if (!hasRad) return false;

      const wantTur = (state.t < 240) ? 2 : 4;
      const threat = aiThreatNearBase();
      if (threat < 2 && tur >= 1) return false;
      if (tur >= wantTur) return false;

      // Start building a turret when money buffer exists.
      if (e.money > 700) return aiTryStartBuild("turret");
      return false;
    }

    function aiQueueUnits(e) {
      const pf = getPowerFactor(TEAM.ENEMY);
      const bar = buildings.find(b => b.alive && !b.civ && b.team === TEAM.ENEMY && b.kind === "barracks");
      const fac = buildings.find(b => b.alive && !b.civ && b.team === TEAM.ENEMY && b.kind === "factory");

      // Don't queue endlessly: keep a rolling queue size.
      // IMPORTANT: do NOT subtract money here. Production drains money gradually in tickBuildingQueues().
      const poor = e.money < 200;
      const rich = e.money > 800;

      const playerInf = units.filter(u => u.alive && u.team === TEAM.PLAYER && (UNIT[u.kind] && UNIT[u.kind].cls === "inf") && !u.inTransport && !u.hidden);
      const playerHasInf = playerInf.length > 0;

      const eEng = units.filter(u => u.alive && u.team === TEAM.ENEMY && u.kind === "engineer");
      const eSnp = units.filter(u => u.alive && u.team === TEAM.ENEMY && u.kind === "sniper");
      const eIFV = units.filter(u => u.alive && u.team === TEAM.ENEMY && u.kind === "ifv");

      const countQueued = (q, kind) => q.reduce((n, it) => n + (it && it.kind === kind ? 1 : 0), 0);

      if (bar) {
        const queuedInf = countQueued(bar.buildQ, "infantry");
        const queuedEng = countQueued(bar.buildQ, "engineer");
        const queuedSnp = countQueued(bar.buildQ, "sniper");

        // If no player infantry on map, stop basic infantry/sniper production and focus vehicles.
        const wantInf = playerHasInf ? (poor ? 3 : 6) : 0;
        while (bar.buildQ.length < 8 && (eUnits.filter(u => u.kind==="infantry").length + queuedInf) < wantInf) {
          bar.buildQ.push({ kind: "infantry", t: 0, tNeed: getBaseBuildTime("infantry") / pf, cost: COST.infantry, paid: 0 });
          if (poor) break; // conserve
        }

        // Engineers: keep them cycling for IFV capture play.
        const desiredEng = Math.max(5, Math.min(12, 3 + eIFV.length * 2));
        if (bar.buildQ.length < 8 && (eEng.length + queuedEng) < desiredEng) {
          bar.buildQ.push({ kind: "engineer", t: 0, tNeed: getBaseBuildTime("engineer") / pf, cost: COST.engineer, paid: 0 });
        }

        // Snipers: only if player infantry exists, cap at 2~3 total.
        if (playerHasInf && fac && bar.buildQ.length < 8) {
          const maxSnp = rich ? 3 : 2;
          if ((eSnp.length + queuedSnp) < maxSnp) {
            bar.buildQ.push({ kind: "sniper", t: 0, tNeed: getBaseBuildTime("sniper") / pf, cost: COST.sniper, paid: 0 });
          }
        }
      }

      if (fac) {
        const haveHarv = units.some(u => u.alive && u.team === TEAM.ENEMY && u.kind === "harvester");
        if (!haveHarv) {
          // Emergency eco: always try to rebuild a harvester first.
          if (fac.buildQ.length < 1) fac.buildQ.push({ kind: "harvester", t: 0, tNeed: getBaseBuildTime("harvester") / pf, cost: COST.harvester, paid: 0 });
          return;
        }
        const wantVeh = poor ? 3 : (rich ? 6 : 4);
        // Mix IFV + tanks. Tanks are mainline; IFV is support (passenger carriers / utility).
        while (fac.buildQ.length < wantVeh) {
          const countIFV = eIFV.length;
          const countTank = units.filter(u => u.alive && u.team === TEAM.ENEMY && u.kind === "tank").length;
          const desiredIFV = 3 + Math.floor((eEng.length + eSnp.length) / 2);
          const needIFV = (countIFV < desiredIFV);

          // Also bias to tanks in general
          const roll = Math.random();
          if (needIFV && roll < 0.90) {
            fac.buildQ.push({ kind: "ifv", t: 0, tNeed: getBaseBuildTime("ifv") / pf, cost: COST.ifv, paid: 0 });
          } else {
            // Avoid tank spam: only sprinkle tanks occasionally.
            if (countTank < Math.max(2, Math.floor(countIFV / 3))) {
              fac.buildQ.push({ kind: "tank", t: 0, tNeed: getBaseBuildTime("tank") / pf, cost: COST.tank, paid: 0 });
            } else {
              fac.buildQ.push({ kind: "ifv", t: 0, tNeed: getBaseBuildTime("ifv") / pf, cost: COST.ifv, paid: 0 });
            }
          }
          if (poor) break;
        }
      }
    }

    function aiUseIFVPassengers() {
      // Ensure engineer/sniper are IFV-passengers (AI preference: no independent ops).
      const eIFVs = units.filter(u => u.alive && u.team === TEAM.ENEMY && u.kind === "ifv");
      const eInf = units.filter(u => u.alive && u.team === TEAM.ENEMY && (u.kind === "engineer" || u.kind === "sniper") && !u.inTransport && !u.hidden);

      // Boarding logic (IFV moves to passenger; passenger should not chase IFV)
      for (const inf of eInf) {
        // Find nearest empty IFV
        let best = null, bestD = Infinity;
        for (const ifv of eIFVs) {
          if (!ifv.alive || ifv.passengerId) continue;
          const d2 = dist2(inf.x, inf.y, ifv.x, ifv.y);
          if (d2 < bestD) { bestD = d2; best = ifv; }
        }
        if (!best) break;
        const d = Math.sqrt(bestD);
        if (d <= 140) {
          boardUnitIntoIFV(inf, best);
        } else {
          // Move IFV toward the infantry to pick up
          best.order = { type: "move", x: inf.x, y: inf.y };
          best.target = null;
        }
      }

      // Harassment plans
      const pHQ = buildings.find(b => b.alive && b.team === TEAM.PLAYER && b.kind === "hq");
      const high = buildings.filter(b => b.alive && b.team === TEAM.PLAYER && ["hq", "factory", "refinery", "power", "barracks"].includes(b.kind));
      const targetB = (pHQ || high[0] || null);

      for (const ifv of eIFVs) {
        if (!ifv.alive) continue;
        if (!ifv.passengerId) continue;

        // Engineer-IFV: rush high value building and unload to capture
        if (ifv.passKind === "engineer" && targetB) {
          // If player defenses are heavy, avoid engineer rush until defenses are reduced.
          if (playerDefenseHeavy()) {
            ifv.order = { type: "move", x: ai.rally.x, y: ai.rally.y };
            ifv.target = null;
            continue;
          }
          const dock = getClosestPointOnBuilding(targetB, ifv);
          const edgeD2 = dist2PointToRect(ifv.x, ifv.y, targetB.x, targetB.y, targetB.w, targetB.h);
          const dDock = Math.sqrt(dist2(ifv.x, ifv.y, dock.x, dock.y));
          // Drive to a realistic docking point (not the building center), then unload.
          if (dDock > 280 && edgeD2 > 240 * 240) {
            ifv.order = { type: "move", x: dock.x, y: dock.y };
          } else {
            const eng = getEntityById(ifv.passengerId);
            unboardIFV(ifv);
            if (eng && eng.alive) {
              eng.target = targetB.id;
              eng.order = { type: "capture", x: eng.x, y: eng.y, tx: null, ty: null };
              // Immediately path toward the building edge to avoid "stand still after unload".
              setPathTo(eng, dock.x, dock.y);
              eng.repathCd = 0.15;
            }
          }
        }

        // Sniper-IFV: hunt player infantry then kite away to rally
        if (ifv.passKind === "sniper") {
          const prey = aiPickPlayerInfantry();
          if (prey) {
            ifv.order = { type: "attackmove", x: prey.x, y: prey.y };
          } else {
            // default to rally/pressure toward center
            ifv.order = { type: "move", x: ai.rally.x, y: ai.rally.y };
          }
        }
      }
    }

    function aiParkEmptyIFVs() {
      // Keep empty IFVs near rally to pick up passengers (avoid solo rushing).
      const eIFVs = units.filter(u => u.alive && u.team === TEAM.ENEMY && u.kind === "ifv" && !u.passengerId);
      for (const ifv of eIFVs) {
        if (!ifv.order || ifv.order.type !== "move") {
          ifv.order = { type: "move", x: ai.rally.x, y: ai.rally.y };
          ifv.target = null;
          ifv.repathCd = 0.35;
        }
      }
    }

    function aiTick() {
      // frequent decisions, but not every frame
      if (state.t < ai.nextThink) return;
      ai.nextThink = state.t + rnd(0.55, 0.95);

      const e = state.enemy;

      // If no HQ, shut down construction + focus on whatever units exist (defend/attack), but no new buildings.
      const hasHQ = aiEnemyHas("hq");
      if (!hasHQ) {
        ai.build.queue = null;
        ai.build.ready = null;
      }

      aiPickRally();

      // Place READY building if possible (doesn't block other decisions).
      aiTryPlaceReady();

      // Keep the build queue fed toward a sane tech/econ baseline (but never blocks unit production).
      const underPower = e.powerUse > e.powerProd;
      aiEnsureTechAndEco(e, underPower);

      // Defense placement when rich (non-blocking)
      aiPlaceDefenseIfRich(e);

      // Unit production should ALWAYS run (this was the big "AI builds only" failure mode).
      aiQueueUnits(e);
      aiUseIFVPassengers();
      aiParkEmptyIFVs();

      // Mainline tank rush waves (IFV escorts). Keep pressure up.
      const phq = buildings.find(b => b.alive && !b.civ && b.team === TEAM.PLAYER && b.kind === "hq");
      const rallyT = phq ? { x: phq.x, y: phq.y } : ai.rally;
      if (state.t >= ai.nextWave) {
        ai.nextWave = state.t + rnd(22, 34);
        const eUnitsAll = units.filter(u => u.alive && u.team === TEAM.ENEMY && !u.inTransport && !u.hidden);
        const tanks = eUnitsAll.filter(u => u.kind === "tank");
        const ifvs = eUnitsAll.filter(u => u.kind === "ifv" && u.passengerId);
        const pack = [];
        // take up to 8 tanks
        tanks.sort((a, b) => a.id - b.id);
        for (let i = 0; i < Math.min(8, tanks.length); i++) pack.push(tanks[i]);
        // add up to 3 IFV escorts
        ifvs.sort((a, b) => a.id - b.id);
        for (let i = 0; i < Math.min(3, ifvs.length); i++) pack.push(ifvs[i]);

        // If too small, just rally forward
        const dest = rallyT || ai.rally;
        for (const u of pack) {
          if (u.kind === "tank") {
            u.order = { type: "attackmove", x: dest.x, y: dest.y };
            u.target = null;
          } else if (u.kind === "ifv") {
            // if sniper/eng passenger, keep harassment logic; otherwise escort
            if (!u.passengerId) {
              u.order = { type: "attackmove", x: dest.x, y: dest.y };
              u.target = null;
            }
          }
        }
      }

      // Army behavior: rally -> attack waves, plus engineer harassment
      const eUnits = units.filter(u => u.alive && u.team === TEAM.ENEMY);
      const combat = eUnits.filter(u => u.kind !== "harvester" && u.kind !== "engineer" && u.kind !== "sniper");
      const engs = eUnits.filter(u => u.kind === "engineer");
      const snipers = eUnits.filter(u => u.kind === "sniper");
      const idleIFVs = units.filter(u => u.alive && u.team === TEAM.ENEMY && u.kind === "ifv" && !u.passengerId);
      const playerInf = units.filter(u => u.alive && u.team === TEAM.PLAYER && (UNIT[u.kind] && UNIT[u.kind].cls === "inf") && !u.inTransport && !u.hidden);
      const playerHasInf = playerInf.length > 0;

      // Engineer harassment (value-aware) - keep trying to capture high-value and sell.
      if (engs.length && state.t > 140 && combat.length >= 4) {
        if (playerDefenseHeavy()) {
          for (const eng of engs) {
            if (eng.inTransport) continue;
            eng.order = { type: "move", x: ai.rally.x, y: ai.rally.y, tx: null, ty: null };
            setPathTo(eng, ai.rally.x, ai.rally.y);
            eng.repathCd = 0.35;
          }
        } else {
        const targets = buildings.filter(b => b.alive && !b.civ && b.team === TEAM.PLAYER && b.attackable !== false);
        if (targets.length) {
          const valueOf = (b) => {
            const c = COST[b.kind] || 0;
            const pr = (b.kind === "hq") ? 1000000 :
              (b.kind === "factory") ? 900000 :
                (b.kind === "refinery") ? 700000 :
                  (b.kind === "radar") ? 500000 :
                    (b.kind === "barracks") ? 350000 : 0;
            return pr + Math.max(0, c - (COST.engineer || 800)) + (c * 0.1);
          };
          for (const eng of engs) {
            // Don't suicide into nearby player combat blobs; pull back and wait for escort.
            const pNear = units.filter(u => u.alive && u.team === TEAM.PLAYER && u.kind !== "harvester").some(pu => dist2(eng.x, eng.y, pu.x, pu.y) < 220 * 220);
            if (pNear) {
              eng.order = { type: "move", x: ai.rally.x, y: ai.rally.y, tx: null, ty: null };
              setPathTo(eng, ai.rally.x, ai.rally.y);
              eng.repathCd = 0.35;
              continue;
            }
            // If already capturing something valid, don't thrash orders
            const curT = eng.target ? getEntityById(eng.target) : null;
            const curOk = curT && curT.alive && curT.team === TEAM.PLAYER && curT.kind && !curT.civ;
            if (eng.order && eng.order.type === "capture" && curOk) continue;

            let best = null, bestS = -Infinity;
            for (const tb of targets) {
              const d = Math.sqrt(dist2(eng.x, eng.y, tb.x, tb.y));
              const score = valueOf(tb) - d * 1.2;
              if (score > bestS) { bestS = score; best = tb; }
            }
            if (best) {
              eng.order = { type: "capture", x: eng.x, y: eng.y, tx: null, ty: null };
              eng.target = best.id;
              const dock = aiEngineerDockAvoidTurrets(best, eng);
              setPathTo(eng, dock.x, dock.y);
              eng.repathCd = 0.25;
            }
          }
        }
        }
      }

      // Periodic harvester terror: small strike team only (do NOT drag the whole army).
      if (state.t >= (ai.harassNext || 0)) {
        ai.harassNext = state.t + rnd(18, 26);

        const pHarvs = units.filter(u => u.alive && u.team === TEAM.PLAYER && u.kind === "harvester");
        if (pHarvs.length) {
          // Keep a persistent small squad
          if (!ai.harassSquadIds) ai.harassSquadIds = [];
          let squad = ai.harassSquadIds
            .map(id => units.find(u => u.alive && u.id === id && u.team === TEAM.ENEMY))
            .filter(Boolean);

          // Refill squad up to 3
          if (squad.length < 3) {
          const pool = combat
            .filter(u => u.kind !== "harvester" && u.kind !== "engineer")
            .filter(u => u.kind !== "sniper")
            .filter(u => !(u.kind === "ifv" && u.passengerId && u.passKind === "engineer"))
            .filter(u => !(u.kind === "ifv" && !u.passengerId))
            .filter(u => !squad.includes(u))
              // Prefer units that are not currently committed to a main-base attack
              .filter(u => !(ai.mode === "attack" && u.order && u.order.type === "attack"))
              .sort((a, b) => dist2(ai.rally.x, ai.rally.y, a.x, a.y) - dist2(ai.rally.x, ai.rally.y, b.x, b.y));
            while (squad.length < 3 && pool.length) {
              const u = pool.shift();
              squad.push(u);
            }
          }

          ai.harassSquadIds = squad.map(u => u.id);

          if (squad.length) {
            // Target the nearest player harvester to our rally
            let bestH = null, bestD = Infinity;
            for (const h of pHarvs) {
              const d = dist2(ai.rally.x, ai.rally.y, h.x, h.y);
              if (d < bestD) { bestD = d; bestH = h; }
            }
            if (bestH) {
              aiCommandAttackWave(squad, bestH);
            }
          }
        }
      }

      const threat = aiThreatNearBase();
      const poor = e.money < 250;
      const rich = e.money > 900;

      // 목표 병력 규모: 시간이 지날수록 올라감
      const goal = (state.t < 160) ? 8 : (state.t < 360 ? 12 : 16);

      // If we have basically no army, don't "attack", keep rallying while producing.
      if (combat.length < 2) {
        ai.mode = "rally";
        return;
      }

      if (poor || threat >= 4) {
        ai.mode = "defend";
        aiCommandMoveToRally(combat);
        return;
      }

      // Attack cadence: keep sending waves (this was too timid before).
      if (ai.mode !== "attack") {
        ai.mode = "rally";
        // gently pull strays back to rally
        aiCommandMoveToRally(combat.filter(u => !u.order || u.order.type !== "move"));
        if (state.t > 95 && combat.length >= goal && state.t > ai.waveT + 14.0) {
          ai.waveT = state.t;
          const target = aiPickPlayerTarget();
          if (target) {
            ai.mode = "attack";
            ai.attackUntil = state.t + (rich ? 30 : 22);
            aiCommandAttackWave(combat, target);
          }
        }
        return;
      }

      // While attacking, keep pressure; if time is up, go back to rally and rebuild wave.
      if (state.t > ai.attackUntil) {
        ai.mode = "rally";
        aiCommandMoveToRally(combat);
        return;
      }

      // Occasionally retarget
      if (Math.random() < 0.06) {
        const target = aiPickPlayerTarget();
        if (target) aiCommandAttackWave(combat, target);
      }

      // Snipers should avoid solo engagements and prefer IFV usage.
      if (snipers.length) {
        // If no player infantry, stay in defensive posture near rally.
        if (!playerHasInf) {
          for (const s of snipers) {
            if (s.inTransport) continue;
            s.order = { type: "move", x: ai.rally.x, y: ai.rally.y, tx: null, ty: null };
            setPathTo(s, ai.rally.x, ai.rally.y);
            s.repathCd = 0.35;
          }
        }
        for (const s of snipers) {
          if (s.inTransport) continue;
          const prey = aiPickPlayerInfantry();
          // Let IFVs come pick snipers up (do not chase IFVs).
          // No IFV available: target player infantry only (may move near tanks/turrets but doesn't target them).
          if (prey) {
            s.order = { type: "attack", x: s.x, y: s.y, tx: null, ty: null };
            s.target = prey.id;
            setPathTo(s, prey.x, prey.y);
            s.repathCd = 0.25;
          } else {
            // Fallback: keep near rally, do not attack harvesters.
            s.order = { type: "move", x: ai.rally.x, y: ai.rally.y, tx: null, ty: null };
            setPathTo(s, ai.rally.x, ai.rally.y);
            s.repathCd = 0.35;
          }
        }
      }
    }

    return {
      tick: aiTick,
      tickEnemySidebarBuild,
      enemyAttackTarget,
      enemyRallyPoint,
      enemyUnstuck,
      getState: () => ai
    };
  };
})(window);
