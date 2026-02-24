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
      // build queue for enemy
      build: { queue: null, ready: null, readySince: 0 },
      // high-level mode
      mode: "build", // build | rally | attack | defend
      attackUntil: 0,
      harassNext: 0,
      engineerNext: 0,
      engRushNext: 0,
      nextWave: 0,
      apmMul: 3.2,
      underRushUntil: 0,
      lastRallyIssue: 0,
      lastRallyX: -1e9,
      lastRallyY: -1e9,
      // Reused arrays to avoid .filter() allocations every tick
      _eUnits: [], _eUnitsAll: [], _playerInf: [], _enemyInf: [],
      _combat: [], _engs: [], _snipers: [], _idleIFVs: [],
      _infFromEUnitsAll: [], _eIFVsWithEng: [], _eIFVsAll: [], _eEngSnip: [],
      _enemyCenters: [], _playerUnits: [], _tankCount: 0,
      _playerTurrets: [], _playerCombat: []
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
        // If hanging near own barracks/HQ, force to rally so it doesn't block exits.
        const nearProd = buildings.some(
          (b) => b.alive && !b.civ && b.team === TEAM.ENEMY && (b.kind === "barracks" || b.kind === "hq") && dist2(u.x, u.y, b.x, b.y) < (420 * 420)
        );
        const inCooldown = (u._noProdUntil && state.t < u._noProdUntil);
        if (nearProd && !inCooldown) {
          const rx = ai.rally.x + rnd(-TILE * 1.2, TILE * 1.2);
          const ry = ai.rally.y + rnd(-TILE * 1.2, TILE * 1.2);
          u.order = { type: "move", x: rx, y: ry, tx: null, ty: null };
          setPathTo(u, rx, ry);
          u.repathCd = 0.5;
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
      const turrets = ai._playerTurrets;
      if (!turrets.length) return getClosestPointOnBuilding(target, eng);
      const spec = BUILD[target.kind] || { tw: 1, th: 1 };
      const pCombat = ai._playerCombat;
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
      // Rally를 안정화: 매 틱 rnd()로 흔들리면 유닛들이 계속 재경로 → 이동질 발생
      const RALLY_UPDATE_INTERVAL = 5.5;
      if (state.t < (ai.rallyUpdateAt || 0)) return;
      ai.rallyUpdateAt = state.t + RALLY_UPDATE_INTERVAL;

      const ehq = buildings.find(b => b.alive && !b.civ && b.team === TEAM.ENEMY && b.kind === "hq");
      const phq = buildings.find(b => b.alive && !b.civ && b.team === TEAM.PLAYER && b.kind === "hq");
      let tx = phq ? phq.x : WORLD_W * 0.5;
      let ty = phq ? phq.y : WORLD_H * 0.5;
      if (!phq) {
        const pb = buildings.find(b => b.alive && !b.civ && b.team === TEAM.PLAYER);
        if (pb) { tx = pb.x; ty = pb.y; }
      }
      if (ehq) {
        ai.rally.x = ehq.x + (tx - ehq.x) * 0.25 + rnd(-TILE * 0.8, TILE * 0.8);
        ai.rally.y = ehq.y + (ty - ehq.y) * 0.25 + rnd(-TILE * 0.8, TILE * 0.8);
      } else {
        ai.rally.x = tx + rnd(-TILE * 0.8, TILE * 0.8);
        ai.rally.y = ty + rnd(-TILE * 0.8, TILE * 0.8);
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
      return ai._enemyCenters;
    }
    function aiDefendPoint() {
      const ehq = buildings.find(b => b.alive && !b.civ && b.team === TEAM.ENEMY && b.kind === "hq");
      if (ehq) return { x: ehq.x, y: ehq.y };
      const center = ai._enemyCenters[0];
      return center ? { x: center.x, y: center.y } : { x: WORLD_W * 0.5, y: WORLD_H * 0.5 };
    }

    function aiEmergencyDefend(eUnits){
      const alert = state.aiAlert;
      if (!alert || state.t > (alert.until||-1e9)) return false;
      const dp = aiDefendPoint();
      const defendR = TILE * 12; // "near base" radius
      const unitsNearBase = eUnits.filter(u => {
        if (!u.alive) return false;
        if (u.kind==="harvester" || u.kind==="engineer") return false;
        if (u.kind==="ifv" && u.passengerId && u.passKind==="engineer") return false;
        return dist2(u.x, u.y, dp.x, dp.y) <= defendR*defendR;
      });
      for (const u of unitsNearBase){
        u.order = { type: "attackmove", x: alert.x, y: alert.y, tx: null, ty: null };
        u.target = null;
        u.repathCd = 0.25;
      }
      ai.mode = "defend";
      return unitsNearBase.length > 0;
    }

    function aiUnstickEngineers(){
      const dp = aiDefendPoint();
      for (const eng of ai._engs){
        if (eng.inTransport) continue;
        const ot = eng.order && eng.order.type;
        if (ot && ot !== "idle" && ot !== "guard") continue;
        // If hanging near own base (HQ/refinery), push to rally to avoid "rubbing"
        const nearRally = dist2(eng.x, eng.y, ai.rally.x, ai.rally.y) < (TILE * 3) * (TILE * 3);
        if (!nearRally && dist2(eng.x, eng.y, dp.x, dp.y) < (TILE*6)*(TILE*6)){
          const rx = ai.rally.x + rnd(-TILE * 1.0, TILE * 1.0);
          const ry = ai.rally.y + rnd(-TILE * 1.0, TILE * 1.0);
          eng.order = { type: "move", x: rx, y: ry, tx: null, ty: null };
          setPathTo(eng, rx, ry);
          eng.repathCd = 0.5;
        }
      }
    }
    function playerDefenseHeavy() {
      return ai._playerTurrets.length >= 4;
    }

    function aiTryStartBuild(kind) {
      // Only one building build at a time (simple sidebar)
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

    const READY_PLACE_TIMEOUT = 12; // 배치 실패 시 이 시간(초) 후 포기·환불
    function aiTryPlaceReady() {
      if (!ai.build.ready) return false;
      if (!aiEnemyHas("hq")) { ai.build.ready = null; ai.build.readySince = 0; ai.build.queue = null; return false; }

      const kind = ai.build.ready;
      const spec = BUILD[kind];
      if (!spec) { ai.build.ready = null; ai.build.readySince = 0; return false; }

      // 배치 실패가 너무 오래 지속되면 포기·환불 (테크 진행 차단 방지)
      const readyAge = state.t - (ai.build.readySince || 0);
      if (readyAge > READY_PLACE_TIMEOUT) {
        const costTotal = COST[kind] || 0;
        if (costTotal > 0 && state.enemy) state.enemy.money = (state.enemy.money || 0) + costTotal;
        ai.build.ready = null;
        ai.build.readySince = 0;
        return false;
      }

      const centers = aiEnemyCenters();
      if (!centers.length) return false;

      // Choose a center: prefer HQ, else first center
      let center = centers.find(b => b.kind === "hq") || centers[0];

      // Placement: 건설 반경 내에서만 시도. tries 축소로 연산 부하 감소.
      const tries = (kind === "turret") ? 180 : 200;
      const turCount = aiEnemyCount("turret");
      const ehq = buildings.find(b => b.alive && !b.civ && b.team === TEAM.ENEMY && b.kind === "hq");
      const phq = buildings.find(b => b.alive && !b.civ && b.team === TEAM.PLAYER && b.kind === "hq");
      let frontAnchor = null;
      if (kind === "turret" && ehq && phq){
        const fx = ehq.x + (phq.x - ehq.x) * 0.45;
        const fy = ehq.y + (phq.y - ehq.y) * 0.45;
        frontAnchor = { x: fx, y: fy, tx: Math.round(fx / TILE), ty: Math.round(fy / TILE) };
      }
      const isBig = (kind === "refinery" || kind === "factory");
      const gapTiles = isBig ? 1 : 2;
      // 건설 반경 내로만 검색 (나무/불가 구역·구역 밖 시도 방지)
      const maxProvideTiles = centers.length ? Math.max(...centers.map(b => (b.provideR || 0) / TILE)) : 10;
      const searchRad = Math.min(10, Math.max(6, maxProvideTiles));


      for (let i = 0; i < tries; i++) {
        let tx, ty;

        if (kind === "turret") {
          const baseAnchor = buildings.find(b => b.alive && !b.civ && b.team === TEAM.ENEMY && (b.kind === "refinery" || b.kind === "hq")) || center;
          const useFront = (turCount < 4 && frontAnchor && inBuildRadius(TEAM.ENEMY, frontAnchor.x, frontAnchor.y));
          const anchor = useFront ? frontAnchor : baseAnchor;
          const r0 = Math.min(5 + ((Math.random() * 7) | 0), searchRad);
          const ang = Math.random() * Math.PI * 2;
          tx = anchor.tx + Math.round(Math.cos(ang) * r0);
          ty = anchor.ty + Math.round(Math.sin(ang) * r0);
        } else {
          tx = center.tx + ((Math.random() * (searchRad * 2 + 1)) | 0) - searchRad;
          ty = center.ty + ((Math.random() * (searchRad * 2 + 1)) | 0) - searchRad;
        }

        if (!inMap(tx, ty)) continue;

        const wpos = buildingWorldFromTileOrigin(tx, ty, spec.tw, spec.th);
        if (!inBuildRadius(TEAM.ENEMY, wpos.cx, wpos.cy)) continue;

        if (isBlockedFootprint(tx, ty, spec.tw, spec.th)) continue;
        if (isTooCloseToOtherBuildings(tx, ty, spec.tw, spec.th, gapTiles)) continue;

        addBuilding(TEAM.ENEMY, kind, tx, ty);
        ai.build.ready = null;
        ai.build.readySince = 0;
        return true;
      }
      return false;
    }

    function tickEnemySidebarBuild(dt) {
      // Mirrors tickSidebarBuild() but for TEAM.ENEMY (no UI)
      if (!aiEnemyHas("hq")) { ai.build.queue = null; ai.build.ready = null; ai.build.readySince = 0; return; }
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
        ai.build.readySince = state.t;
        ai.build.queue = null;
      }
    }

    const RALLY_ISSUE_INTERVAL = 3.5;
    const RALLY_MOVE_THRESH2 = (TILE * 4) * (TILE * 4);
    const RALLY_ARRIVED_D2 = (TILE * 2.5) * (TILE * 2.5); // 이미 도착 근처면 재명령 안 함
    function aiCommandMoveToRally(list) {
      const rallyDx = ai.rally.x - ai.lastRallyX, rallyDy = ai.rally.y - ai.lastRallyY;
      const rallyMoved = (rallyDx * rallyDx + rallyDy * rallyDy) > RALLY_MOVE_THRESH2;
      if (!rallyMoved && state.t < ai.lastRallyIssue + RALLY_ISSUE_INTERVAL) return;
      ai.lastRallyIssue = state.t;
      ai.lastRallyX = ai.rally.x;
      ai.lastRallyY = ai.rally.y;
      const spacing = 52;
      let k = 0;
      for (const u of list) {
        if (u.kind === "ifv" && !u.passengerId) continue;
        const d2 = dist2(u.x, u.y, ai.rally.x, ai.rally.y);
        if (d2 < RALLY_ARRIVED_D2 && u.order && u.order.type === "attackmove") continue; // 이미 집결 근처면 스킵
        const col = k % 5, row = (k / 5) | 0;
        const ox = (col - 2) * spacing;
        const oy = row * spacing - spacing;
        let gx = ai.rally.x + ox, gy = ai.rally.y + oy;
        const spot = findNearestFreePoint(gx, gy, u, 4);
        if (spot && spot.found) { gx = spot.x; gy = spot.y; }
        u.order = { type: "attackmove", x: gx, y: gy, tx: null, ty: null, manual:true, allowAuto:true, lockTarget:false };
        u.restX = null; u.restY = null;
        setPathTo(u, gx, gy);
        u.repathCd = 0.7;
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
        u.order = { type: "attack", x: u.x, y: u.y, tx: null, ty: null, manual:true, allowAuto:false, lockTarget:true };
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
    function aiPickNearestPlayerInfantryTo(unit) {
      const inf = ai._playerInf;
      if (!inf.length) return null;
      let best = null, bestD = Infinity;
      for (let i = 0; i < inf.length; i++) {
        const u = inf[i];
        const d = dist2(unit.x, unit.y, u.x, u.y);
        if (d < bestD) { bestD = d; best = u; }
      }
      return best;
    }

    function aiThreatNearBase() {
      const centers = ai._enemyCenters;
      if (!centers.length) return 0;
      const anchor = centers.find(b => b.kind === "hq") || centers[0];
      const r2 = 520 * 520;
      let n = 0;
      for (let i = 0; i < ai._playerUnits.length; i++) {
        const u = ai._playerUnits[i];
        if (dist2(u.x, u.y, anchor.x, anchor.y) <= r2) n++;
      }
      return n;
    }

    function aiPlayerInfNearEnemyBase(){
      const centers = ai._enemyCenters;
      if (!centers.length) return 0;
      const anchor = centers.find(b => b.kind === "hq") || centers[0];
      const r2 = (TILE*12) * (TILE*12);
      let n = 0;
      for (let i = 0; i < ai._playerInf.length; i++) {
        const u = ai._playerInf[i];
        if (dist2(u.x, u.y, anchor.x, anchor.y) <= r2) n++;
      }
      return n;
    }

    function aiEnsureTechAndEco(e, underPower) {
      // Tech progression: power -> barracks -> refinery -> factory (우선) -> turrets -> radar
      // 제련소/군수공장을 터렛보다 먼저 가져가서 보병만 뽑는 현상 방지
      const hasRef = aiEnemyHas("refinery");
      const hasPow = aiEnemyHas("power");
      const hasBar = aiEnemyHas("barracks");
      const hasFac = aiEnemyHas("factory");
      const hasRad = aiEnemyHas("radar");
      const powerMargin = (e.powerProd || 0) - (e.powerUse || 0);

      if (!hasPow) { aiTryStartBuild("power"); return true; }
      if (underPower || powerMargin < 6) { aiTryStartBuild("power"); return true; }

      if (!hasBar) { aiTryStartBuild("barracks"); return true; }

      // refinery/factory 먼저 (테크 핵심)
      if (!hasRef) { aiTryStartBuild("refinery"); return true; }
      if (!hasFac) { aiTryStartBuild("factory"); return true; }

      // 그 다음 터렛
      const tur = aiEnemyCount("turret");
      if (hasBar && tur < 2 && e.money > 450) { aiTryStartBuild("turret"); return true; }

      if (!hasRad && e.money > COST.radar * 0.25) { aiTryStartBuild("radar"); return true; }

      // Late eco scaling
      if (hasFac && aiEnemyCount("refinery") < 2 && e.money > 900) { aiTryStartBuild("refinery"); return true; }

      return false;
    }

    function aiPlaceDefenseIfRich(e) {
      // Place turrets around base. Early: around barracks timing. Late: turret spam.
      const tur = aiEnemyCount("turret");
      const hasBar = aiEnemyHas("barracks");
      if (!hasBar) return false;

      const lateGame = state.t > 720;
      const wantTur = lateGame ? 10 : (state.t < 240 ? 2 : 4);
      const threat = aiThreatNearBase();
      if (!lateGame && threat < 2 && tur >= 1) return false;
      if (tur >= wantTur) return false;

      const minMoney = lateGame ? 550 : 700;
      if (e.money > minMoney) return aiTryStartBuild("turret");
      return false;
    }

    function aiQueueUnits(e, rushDefense, infRushThreat) {
      const pf = getPowerFactor(TEAM.ENEMY);
      const bar = buildings.find(b => b.alive && !b.civ && b.team === TEAM.ENEMY && b.kind === "barracks");
      const fac = buildings.find(b => b.alive && !b.civ && b.team === TEAM.ENEMY && b.kind === "factory");

      const poor = e.money < 200;
      const rich = e.money > 800;

      const playerHasInf = ai._playerInf.length > 0;
      const earlyRush = state.t < 120;

      const eEng = ai._engs;
      const eSnp = ai._snipers;
      const eIFV = ai._eIFVsAll;

      const countQueued = (q, kind) => q.reduce((n, it) => n + (it && it.kind === kind ? 1 : 0), 0);

      const hasFac = !!fac;
      if (bar) {
        if (!playerHasInf && bar.buildQ && bar.buildQ.length) {
          // If no player infantry, cancel queued snipers.
          bar.buildQ = bar.buildQ.filter(it => it && it.kind !== "sniper");
        }
        const queuedInf = countQueued(bar.buildQ, "infantry");
        const queuedEng = countQueued(bar.buildQ, "engineer");
        const queuedSnp = countQueued(bar.buildQ, "sniper");

        // Early phase: mass infantry rush until factory is up.
        // After factory: keep small infantry count and mostly defend base.
        let wantInf = 0;
        if (infRushThreat && !hasFac) {
          // Pre-factory counter: hold with more infantry + turrets (vehicles unavailable yet).
          wantInf = poor ? 16 : 20;
        } else if (infRushThreat) {
          // Post-factory counter: stop flooding infantry, pivot to vehicles.
          wantInf = poor ? 2 : 4;
        } else if (earlyRush || rushDefense) {
          wantInf = poor ? 14 : 18;
        } else if (playerHasInf) {
          if (!hasFac) {
            wantInf = poor ? 8 : 12;
          } else {
            wantInf = poor ? 2 : 3;
          }
        } else {
          wantInf = poor ? 4 : 8;
        }
        const eInfCount = ai._enemyInf.length;
        while (bar.buildQ.length < 8 && (eInfCount + queuedInf) < wantInf) {
          bar.buildQ.push({ kind: "infantry", t: 0, tNeed: getBaseBuildTime("infantry") / pf, cost: COST.infantry, paid: 0 });
          if (poor) break; // conserve
        }

        // Engineers: IFV 탑승용. IFV 없으면 과다 생산 방지 (막사 앞 꼬라박 방지)
        const rawDesired = (earlyRush || rushDefense || infRushThreat) ? 0 : (hasFac ? Math.max(6, Math.min(14, 4 + eIFV.length * 2)) : 2);
        const desiredEng = (eIFV.length < 2) ? Math.min(rawDesired, 2) : rawDesired;
        if (bar.buildQ.length < 8 && (eEng.length + queuedEng) < desiredEng) {
          bar.buildQ.push({ kind: "engineer", t: 0, tNeed: getBaseBuildTime("engineer") / pf, cost: COST.engineer, paid: 0 });
        }

        // Snipers: only if player infantry exists, cap at 2~3 total.
        if (playerHasInf && fac && bar.buildQ.length < 8) {
          const maxSnp = rich ? 3 : 2;
          const totalSnp = eSnp.length + queuedSnp;
          // Only build snipers if there is IFV capacity to use them.
          if (totalSnp < maxSnp && eIFV.length > 0) {
            bar.buildQ.push({ kind: "sniper", t: 0, tNeed: getBaseBuildTime("sniper") / pf, cost: COST.sniper, paid: 0 });
          }
        }
      }

      if (fac) {
        const haveHarv = ai._eUnits.some(u => u.kind === "harvester");
        if (!haveHarv) {
          // Emergency eco: always try to rebuild a harvester first.
          if (fac.buildQ.length < 1) fac.buildQ.push({ kind: "harvester", t: 0, tNeed: getBaseBuildTime("harvester") / pf, cost: COST.harvester, paid: 0 });
          return;
        }
        const lateGame = state.t > 900;
        const wantVeh = infRushThreat ? (poor ? 8 : 12) : (lateGame ? 12 : (poor ? 5 : (rich ? 10 : 7)));
        // Mix IFV + tanks. Tanks are mainline; IFV is support (passenger carriers / utility).
        while (fac.buildQ.length < wantVeh) {
          const countIFV = eIFV.length;
          const countTank = ai._tankCount;
          const desiredIFV = infRushThreat ? Math.max(5, Math.floor((eEng.length + eSnp.length) / 2)) : Math.max(3, Math.floor((eEng.length + eSnp.length) / 3));
          const needIFV = (countIFV < desiredIFV);

          // Also bias to tanks in general
          const roll = Math.random();
          if (!lateGame && needIFV && roll < (infRushThreat ? 0.70 : 0.45)) {
            fac.buildQ.push({ kind: "ifv", t: 0, tNeed: getBaseBuildTime("ifv") / pf, cost: COST.ifv, paid: 0 });
          } else {
            // Tank-rush baseline: always prioritize tanks.
            fac.buildQ.push({ kind: "tank", t: 0, tNeed: getBaseBuildTime("tank") / pf, cost: COST.tank, paid: 0 });
          }
          if (poor) break;
        }
      }
    }

    function aiUseIFVPassengers() {
      // Ensure engineer/sniper are IFV-passengers (AI preference: no independent ops). Use cached lists from aiTick.
      const eIFVs = ai._eIFVsAll;
      const emptyIFVs = ai._idleIFVs;
      const eInf = ai._eEngSnip;

      if (!emptyIFVs.length || !eInf.length) return;

      // Pair IFVs to the nearest waiting passenger (one-to-one).
      const infPool = eInf.slice();
      for (const ifv of emptyIFVs) {
        if (!infPool.length) break;
        let bestIdx = -1;
        let bestD = Infinity;
        for (let i = 0; i < infPool.length; i++) {
          const inf = infPool[i];
          const d2 = dist2(inf.x, inf.y, ifv.x, ifv.y);
          if (d2 < bestD) { bestD = d2; bestIdx = i; }
        }
        if (bestIdx < 0) break;
        const inf = infPool.splice(bestIdx, 1)[0];
        const d = Math.sqrt(bestD);
        if (d <= 140) {
          if (boardUnitIntoIFV(inf, ifv)) {
            ifv._pickupTargetId = null;
          }
        } else {
          // Move IFV toward the infantry to pick up
          ifv.order = { type: "move", x: inf.x, y: inf.y };
          ifv.target = null;
          ifv._pickupTargetId = inf.id;
          // Passenger should hold position and wait for pickup (do NOT chase IFV).
          inf.order = { type: "move", x: inf.x, y: inf.y, tx: null, ty: null };
          inf.target = null;
          inf.repathCd = 0.5;
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

        // Sniper-IFV: 플레이어 보병 있으면 적극 사냥, 없으면 기지 방어
        if (ifv.passKind === "sniper") {
          const prey = aiPickNearestPlayerInfantryTo(ifv);
          if (prey) {
            ifv.order = { type: "attackmove", x: prey.x, y: prey.y, tx: null, ty: null };
            ifv.target = null;
          } else {
            const dp = aiDefendPoint();
            ifv.order = { type: "move", x: dp.x, y: dp.y, tx: null, ty: null };
            ifv.target = null;
          }
        }
      }
    }

    function aiEngineerRush(){
      const now = state.t;
      if (now < (ai.engRushNext||0)) return;
      ai.engRushNext = now + rnd(18, 26);

      const phq = ai._phq;
      if (!phq) return;

      const eIFVs = ai._eIFVsWithEng;
      if (!eIFVs.length) return;

      const rush = eIFVs.length <= 3 ? eIFVs : eIFVs.slice(0, 3);
      for (const ifv of rush){
        ifv.order = { type: "attackmove", x: phq.x, y: phq.y, tx: null, ty: null };
        ifv.target = null;
        ifv.repathCd = 0.35;
      }
    }

    function aiParkEmptyIFVs() {
      // Keep empty IFVs near rally to pick up passengers (avoid solo rushing). Use cached list from aiTick.
      const eIFVs = ai._idleIFVs;
      const dp = aiDefendPoint();
      for (const ifv of eIFVs) {
        // If we are actively picking up a passenger, don't override.
        if (ifv._pickupTargetId) {
          const t = units.find(u => u.alive && u.id === ifv._pickupTargetId && u.team === TEAM.ENEMY && !u.inTransport);
          if (!t) {
            ifv._pickupTargetId = null;
          } else {
            continue;
          }
        }
        // Override any attack/attackmove orders so empty IFVs don't rush.
        ifv.order = { type: "move", x: dp.x, y: dp.y };
        ifv.target = null;
        ifv.repathCd = 0.35;
      }
    }

    function aiTick() {
      // Throttle: run less often to reduce CPU spikes (~0.6–0.9s between thinks).
      if (state.t < ai.nextThink) return;
      ai.nextThink = state.t + rnd(0.60, 0.90) / (ai.apmMul || 1);

      const e = state.enemy;

      // Single pass over buildings: cache hasHQ, hasFac, hasBar, phq, enemyCenters, playerTurrets.
      let hasHQ = false, hasFac = false, hasBar = false, phq = null;
      ai._enemyCenters.length = 0;
      ai._playerTurrets.length = 0;
      for (const b of buildings) {
        if (!b.alive || b.civ) continue;
        if (b.team === TEAM.ENEMY) {
          if (b.kind === "hq") hasHQ = true;
          if (b.kind === "factory") hasFac = true;
          if (b.kind === "barracks") hasBar = true;
          if (b.provideR > 0) ai._enemyCenters.push(b);
        } else if (b.team === TEAM.PLAYER) {
          if (b.kind === "hq") phq = b;
          if (b.kind === "turret") ai._playerTurrets.push(b);
        }
      }
      ai._phq = phq;

      // If no HQ, shut down construction + focus on whatever units exist (defend/attack), but no new buildings.
      if (!hasHQ) {
        ai.build.queue = null;
        ai.build.ready = null;
        ai.build.readySince = 0;
      }

      aiPickRally();

      // Place READY building if possible (doesn't block other decisions).
      aiTryPlaceReady();

      // Keep the build queue fed toward a sane tech/econ baseline (but never blocks unit production).
      const underPower = e.powerUse > e.powerProd;
      aiEnsureTechAndEco(e, underPower);

      const rushInfNear = aiPlayerInfNearEnemyBase();
      // Single pass: fill reused arrays and counts (avoids many .filter() allocations).
      ai._eUnits.length = 0; ai._eUnitsAll.length = 0; ai._playerInf.length = 0; ai._enemyInf.length = 0;
      ai._combat.length = 0; ai._engs.length = 0; ai._snipers.length = 0; ai._idleIFVs.length = 0; ai._infFromEUnitsAll.length = 0; ai._eIFVsWithEng.length = 0; ai._eIFVsAll.length = 0; ai._eEngSnip.length = 0;
      ai._playerUnits.length = 0; ai._playerCombat.length = 0;
      let playerInfCount = 0, enemyInfCount = 0, tankCount = 0, playerSniperCount = 0, playerSniperIFVCount = 0;
      for (const u of units) {
        if (!u.alive) continue;
        if (u.team === TEAM.ENEMY) {
          ai._eUnits.push(u);
          if (!u.inTransport && !u.hidden) { ai._eUnitsAll.push(u); if (u.kind === "infantry") ai._infFromEUnitsAll.push(u); }
          if (u.kind !== "harvester" && u.kind !== "engineer" && u.kind !== "sniper") ai._combat.push(u);
          else if (u.kind === "engineer") ai._engs.push(u);
          else if (u.kind === "sniper") ai._snipers.push(u);
          if (u.kind === "ifv") { ai._eIFVsAll.push(u); if (!u.passengerId) ai._idleIFVs.push(u); else if (u.passKind === "engineer") ai._eIFVsWithEng.push(u); }
          if ((u.kind === "engineer" || u.kind === "sniper") && !u.inTransport && !u.hidden) ai._eEngSnip.push(u);
          if (u.kind === "tank") tankCount++;
          if (u.kind === "infantry") { ai._enemyInf.push(u); enemyInfCount++; }
        } else if (u.team === TEAM.PLAYER && !u.inTransport && !u.hidden) {
          ai._playerUnits.push(u);
          if (u.kind !== "harvester" && u.kind !== "engineer") ai._playerCombat.push(u);
          if (u.kind === "sniper") playerSniperCount++;
          if (u.kind === "ifv" && u.passengerId && u.passKind === "sniper") playerSniperIFVCount++;
          if (UNIT[u.kind] && UNIT[u.kind].cls === "inf") { ai._playerInf.push(u); playerInfCount++; }
        }
      }
      ai._tankCount = tankCount;
      const playerHasSniperThreat = (playerSniperCount > 0 || playerSniperIFVCount > 0);
      const ENEMY_INF_RUSH_MIN = 5; // 적 보병이 이 수 이상일 때만 저격 대응 러시
      const eUnits = ai._eUnits, playerInf = ai._playerInf, enemyInf = ai._enemyInf;
      const combat = ai._combat, engs = ai._engs, snipers = ai._snipers, idleIFVs = ai._idleIFVs;
      const infRushThreat = (playerInfCount >= 10 || (playerInfCount >= enemyInfCount + 6));
      const isEarly = state.t < 180;
      if (isEarly && rushInfNear >= 4){
        ai.underRushUntil = Math.max(ai.underRushUntil || 0, state.t + 18);
      }
      if (state.t < 200 && playerInfCount >= enemyInfCount + 3){
        ai.underRushUntil = Math.max(ai.underRushUntil || 0, state.t + 18);
      }
      if (state.t < 220 && infRushThreat){
        ai.underRushUntil = Math.max(ai.underRushUntil || 0, state.t + 22);
      }
      const rushDefense = state.t < (ai.underRushUntil || 0);

      // Defense placement when rich (non-blocking)
      aiPlaceDefenseIfRich(e);
      if (rushDefense || infRushThreat){
        if (e.money > 220) aiTryStartBuild("turret");
      }

      // Unit production should ALWAYS run (this was the big "AI builds only" failure mode).
      aiQueueUnits(e, rushDefense, infRushThreat);
      aiUseIFVPassengers();
      aiParkEmptyIFVs();
      aiUnstickEngineers();
      aiEngineerRush();

      // Emergency defense: if base took a hit, pull nearby units to defend.
      aiEmergencyDefend(eUnits);

      // 적 저격병: 항상 먼저 적용 (rushDefense 등 early return 전). 플레이어 보병 있으면 사냥, 없으면 기지 방어.
      const playerHasInf = playerInf.length > 0;
      if (snipers.length) {
        const dp = aiDefendPoint();
        if (playerHasInf) {
          for (const s of snipers) {
            if (s.inTransport) continue;
            const prey = aiPickNearestPlayerInfantryTo(s);
            if (prey) {
              s.order = { type: "attack", x: s.x, y: s.y, tx: null, ty: null, manual: true, allowAuto: false, lockTarget: true };
              s.target = prey.id;
              setPathTo(s, prey.x, prey.y);
              s.repathCd = 0.25;
            } else {
              s.order = { type: "move", x: dp.x, y: dp.y, tx: null, ty: null };
              setPathTo(s, dp.x, dp.y);
              s.repathCd = 0.35;
            }
          }
        } else {
          for (const s of snipers) {
            if (s.inTransport) continue;
            s.order = { type: "move", x: dp.x, y: dp.y, tx: null, ty: null };
            setPathTo(s, dp.x, dp.y);
            s.repathCd = 0.35;
          }
        }
      }

      if (rushDefense){
        ai.mode = "defend";
        aiCommandMoveToRally(eUnits.filter(u => u.kind !== "harvester" && u.kind !== "sniper"));
      }

      // Vehicle crush response: if harvester/tank is attacked by infantry, force-move into them.
      for (const v of eUnits){
        if (v.kind!=="tank" && v.kind!=="harvester") continue;
        const atk = (v.lastAttacker!=null) ? getEntityById(v.lastAttacker) : null;
        if (!atk || !atk.alive || atk.team !== TEAM.PLAYER) continue;
        const cls = (UNIT[atk.kind] && UNIT[atk.kind].cls) ? UNIT[atk.kind].cls : "";
        if (cls!=="inf") continue;
        const d2 = dist2(v.x, v.y, atk.x, atk.y);
        if (d2 > 520*520) continue;
        v.order = { type:"move", x: atk.x, y: atk.y, tx:null, ty:null };
        v.target = null;
        v.forceMoveUntil = state.t + 2.2;
        v.crushUntil = state.t + 3.5;
        v.crushTargetId = atk.id;
        setPathTo(v, atk.x, atk.y);
        v.repathCd = 0.18;
      }

      // If we're countering a heavy infantry rush before factory, stay defensive.
      if (infRushThreat && !hasFac){
        ai.mode = "defend";
        aiCommandMoveToRally(eUnits.filter(u => u.kind !== "harvester" && u.kind !== "sniper"));
        return;
      }

      // Mainline rush waves. Early: infantry rush. Late: tank/IFV waves.
      const rallyT = phq ? { x: phq.x, y: phq.y } : ai.rally;
      if (state.t >= ai.nextWave) {
        const eUnitsAll = ai._eUnitsAll;
        const dest = rallyT || ai.rally;
        if (!hasFac && hasBar) {
          ai.nextWave = state.t + rnd(7, 12) / (ai.apmMul || 1);
          const inf = ai._infFromEUnitsAll;
          const canEarlyPush = (enemyInfCount >= Math.max(6, Math.ceil(playerInfCount * 1.1)));
          if (inf.length >= 7 && canEarlyPush) {
            const pack = inf.slice(0, Math.min(12, inf.length));
            for (const u of pack) {
        u.order = { type: "attackmove", x: dest.x, y: dest.y, tx:null, ty:null, manual:true, allowAuto:true, lockTarget:false };
        u.target = null;
            }
          }
        } else {
          ai.nextWave = state.t + rnd(8, 14) / (ai.apmMul || 1);
          const tanks = [], ifvs = [];
          for (const u of eUnitsAll) { if (u.kind === "tank") tanks.push(u); else if (u.kind === "ifv" && u.passengerId && u.passKind !== "sniper") ifvs.push(u); }
          if (tanks.length >= 3) {
            const pack = [];
            tanks.sort((a, b) => a.id - b.id);
            for (let i = 0; i < Math.min(8, tanks.length); i++) pack.push(tanks[i]);
            ifvs.sort((a, b) => a.id - b.id);
            for (let i = 0; i < Math.min(3, ifvs.length); i++) pack.push(ifvs[i]);
            for (const u of pack) {
              if (u.kind === "tank") {
          u.order = { type: "attackmove", x: dest.x, y: dest.y, tx:null, ty:null, manual:true, allowAuto:true, lockTarget:false };
          u.target = null;
              } else if (u.kind === "ifv") {
                if (!u.passengerId) {
            u.order = { type: "attackmove", x: dest.x, y: dest.y, tx:null, ty:null, manual:true, allowAuto:true, lockTarget:false };
            u.target = null;
                }
              }
            }
          }
        }
      }

      // 플레이어에게 저격병/저격IFV가 있고, 적 보병이 일정량 이상일 때: 현재 보병으로 러시. 목표는 본진(attackmove라 길목 유닛/건물 우선 격파 후 저격 제거). 저격/저격IFV가 없어지면 이 블록 미적용 → 평상시 AI.
      if (playerHasSniperThreat && enemyInfCount >= ENEMY_INF_RUSH_MIN) {
        const dest = phq ? { x: phq.x, y: phq.y } : { x: WORLD_W * 0.5, y: WORLD_H * 0.5 };
        for (const u of enemyInf) {
          if (u.inTransport) continue;
          u.order = { type: "attackmove", x: dest.x, y: dest.y, tx: null, ty: null, manual: true, allowAuto: true, lockTarget: false };
          u.target = null;
        }
      }

      // Army behavior: rally -> attack waves, plus engineer harassment (combat/engs/snipers/idleIFVs from single pass above)
      // playerHasInf already defined above (sniper block)

      // Engineer harassment (value-aware) - keep trying to capture high-value and sell.
      if (engs.length && state.t > 140 && combat.length >= 4) {
        if (playerDefenseHeavy() || idleIFVs.length > 0) {
          const dp = aiDefendPoint();
          for (const eng of engs) {
            if (eng.inTransport) continue;
            eng.order = { type: "move", x: dp.x, y: dp.y, tx: null, ty: null };
            setPathTo(eng, dp.x, dp.y);
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
            const pNear = ai._playerCombat.some(pu => dist2(eng.x, eng.y, pu.x, pu.y) < 220 * 220);
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
        ai.harassNext = state.t + rnd(12, 18) / (ai.apmMul || 1);

        if (playerInf.length) {
          // Keep a persistent small squad
          if (!ai.harassSquadIds) ai.harassSquadIds = [];
          let squad = ai.harassSquadIds
            .map(id => units.find(u => u.alive && u.id === id && u.team === TEAM.ENEMY))
            .filter(Boolean);

          // Refill squad up to 3
          if (squad.length < 3) {
            const poolIFV = combat
              .filter(u => u.kind === "ifv" && u.passengerId)
              .filter(u => !(u.kind === "ifv" && u.passKind === "engineer"))
              .filter(u => !squad.includes(u))
              .filter(u => !(ai.mode === "attack" && u.order && u.order.type === "attack"))
              .sort((a, b) => dist2(ai.rally.x, ai.rally.y, a.x, a.y) - dist2(ai.rally.x, ai.rally.y, b.x, b.y));
            const poolTank = combat
              .filter(u => u.kind === "tank")
              .filter(u => !squad.includes(u))
              .filter(u => !(ai.mode === "attack" && u.order && u.order.type === "attack"))
              .sort((a, b) => a.id - b.id);
            const pool = poolIFV.slice();
            // Only allow tanks for harass if we can send a small group (2-3).
            if (poolTank.length >= 2) {
              pool.push(...poolTank.slice(0, 3));
            }
            while (squad.length < 3 && pool.length) {
              const u = pool.shift();
              squad.push(u);
            }
          }

          ai.harassSquadIds = squad.map(u => u.id);

          if (squad.length) {
            // Target the nearest player infantry to our rally
            let bestH = null, bestD = Infinity;
            for (const h of playerInf) {
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

      // 목표 병력 규모: 병력만 모으고 러시 안 오는 문제 해결 - 목표 완화
      // Army size goal: lower thresholds so AI actually pushes.
      const goal = (!hasFac && hasBar) ? 3 : ((state.t < 160) ? 4 : (state.t < 360 ? 6 : 8));

      // If we have basically no army, don't "attack", keep rallying while producing.
      if (combat.length < 2) {
        ai.mode = "rally";
        return;
      }

      if (poor || threat >= 5 || rushDefense) {
        ai.mode = "defend";
        aiCommandMoveToRally(combat);
        return;
      }

      // 탱크 1대만 있어도 러시 허용 (무한 대기 방지)
      if (hasFac && tankCount < 1) {
        ai.mode = "defend";
        aiCommandMoveToRally(combat);
        return;
      }

      // 오래 모였으면 강제 러시 (rally 25초 초과 시 goal 80%만 있어도 푸시)
      const rallyDuration = state.t - (ai.waveT || 0);
      const forcePush = rallyDuration > 25 && combat.length >= Math.max(4, Math.floor(goal * 0.8));

      // Attack cadence: 웨이브 쿨다운 단축
      if (ai.mode !== "attack") {
        ai.mode = "rally";
        // idle/guard만 집결로 당김 (attackmove 재명령 방지 → 이동질 감소)
        const strays = combat.filter(u => !u.order || u.order.type === "idle" || u.order.type === "guard");
        if (strays.length) aiCommandMoveToRally(strays);
        const earlyOK = (!hasFac && hasBar) ? (state.t > 45) : (state.t > 55);
        const waveCooldown = forcePush ? 0 : 5.0;
        const meetsGoal = (forcePush && combat.length >= Math.max(4, Math.floor(goal * 0.8))) || combat.length >= goal;
        if (earlyOK && meetsGoal && state.t > ai.waveT + waveCooldown) {
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
      // sniper block already handled above (before rushDefense)
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
