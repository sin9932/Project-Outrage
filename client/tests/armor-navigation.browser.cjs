/* Real game command/navigation regressions. The normal render loop is paused;
 * exported simulation ticks run at 60 Hz so results do not depend on GPU speed. */
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const engine = process.env.OUTRAGE_BROWSER || 'chromium';
const browserType = require(process.env.OUTRAGE_PLAYWRIGHT)[engine];
const prefix = process.argv[2] || 'docs/armor-navigation';

(async () => {
  fs.mkdirSync(path.dirname(prefix), {recursive: true});
  const browser = await browserType.launch({headless: true,
    ...(engine === 'chromium' ? {executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe'} : {})});
  try {
    const page = await browser.newPage({viewport: {width: 1440, height: 900}});
    const errors = [];
    page.on('pageerror', error => errors.push(error.stack));
    await page.goto(process.env.OUTRAGE_URL || 'http://127.0.0.1:8765/index.html?debug=1');
    await page.waitForFunction(() => window.OUTankTest, null, {timeout: 60000});
    await page.locator('#fogOff').check();
    await page.locator('#startBtn').click();
    await page.waitForFunction(() => OUTankTest.running);
    await page.waitForFunction(() => OUTank3D.mcvReady || OUTank3D.assetError, null, {timeout: 120000});
    assert(await page.evaluate(() => OUTank3D.mcvReady), await page.evaluate(() => OUTank3D.assetError));
    await page.keyboard.press('Escape');

    await page.evaluate(() => {
      const g = OUTankTest, T = g.TILE, dt = 1 / 60;
      const cx = Math.floor(g.MAP_W / 2), cy = Math.floor(g.MAP_H / 2);
      const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
      const dir8 = OU.createWorldVecToDir8(T / 2, T / 4, T);
      g.ai.tick = () => {};
      for (const b of g.buildings) { b.alive = false; b.hp = 0; g.footprint.setBuildingOcc(b, 0); }
      g.buildings.length = 0;
      g.terrain.fill(0); g.treeHp.fill(0); g.ore.fill(0); g.buildOcc.fill(0);
      function reset() {
        for (const u of g.units) { g.sim.clearReservation(u); u.alive = false; }
        g.units.length = 0;
        g.state.selection.clear();
        g.sim.clearOcc(0);
      }
      function spawn(kind, tx, ty, yaw = 0) {
        const u = g.addUnit(g.TEAM.PLAYER, kind, (tx + .5) * T, (ty + .5) * T, {skipMvp: true});
        u.bodyYaw = u.turretYaw = yaw;
        u.bodyDir = u.turretDir = u.dir = u.faceDir = dir8(Math.cos(yaw), Math.sin(yaw));
        return u;
      }
      function move(units, tx, ty) {
        g.sim.clearOcc(0);
        g.state.selection = new Set(units.map(u => u.id));
        g.commands.issueMoveAll((tx + .5) * T, (ty + .5) * T);
        return units.map(u => ({id: u.id, x: u.order.x, y: u.order.y, tx: u.order.tx, ty: u.order.ty}));
      }
      function tick() { g.state.t += dt; g.sim.tickSim(dt); }
      function observe(u, before, metrics, checkGrid = true) {
        const distance = Math.hypot(u.x - before.x, u.y - before.y);
        metrics.maxStep = Math.max(metrics.maxStep, distance);
        if (distance > u.speed * dt + .01) metrics.jumps++;
        if (u.travelPhase === 'hull' || u.travelPhase === 'turret') {
          metrics.turnFrames++;
          if (distance > .001) metrics.turnSlides++;
        }
        const speed = Math.hypot(u.vx || 0, u.vy || 0);
        if (speed > 1) {
          metrics.movingFrames++;
          const yaw = Math.atan2(u.vy, u.vx);
          if (['tank', 'mcv', 'harvester'].includes(u.kind))
            metrics.maxYawError = Math.max(metrics.maxYawError, Math.abs(wrap(yaw - u.bodyYaw)));
          if (checkGrid) metrics.maxGridError = Math.max(metrics.maxGridError,
            Math.abs(wrap(yaw - Math.round(yaw / (Math.PI / 4)) * Math.PI / 4)));
        }
      }
      function run(units, goals, seconds = 20, checkGrid = true) {
        const metrics = {maxStep: 0, jumps: 0, turnSlides: 0, turnFrames: 0,
          movingFrames: 0, maxYawError: 0, maxGridError: 0};
        let frames = 0, changedGoal = false;
        for (; frames < seconds / dt; frames++) {
          const previous = units.map(u => ({x: u.x, y: u.y}));
          tick();
          units.forEach((u, i) => {
            observe(u, previous[i], metrics, checkGrid);
            if (u.order?.type === 'move' && Math.hypot(u.order.x - goals[i].x, u.order.y - goals[i].y) > .001)
              changedGoal = true;
          });
          if (units.every(u => u.order?.type === 'idle' && !u.path && !u.flowGoal)) break;
        }
        return {...metrics, seconds: (frames + 1) * dt, changedGoal,
          arrived: units.map((u, i) => ({id: u.id, kind: u.kind, order: u.order?.type,
            error: Math.hypot(u.x - goals[i].x, u.y - goals[i].y), x: u.x, y: u.y,
            dir: u.dir, bodyYaw: u.bodyYaw, path: u.path?.slice(u.pathI, u.pathI + 3),
            flow: u.flowGoal, blocked: u.blockT, stuck: u.stuckTime}))};
      }
      window.armorNav = {g, T, dt, cx, cy, reset, spawn, move, tick, run, observe};
      reset();
    });

    const directions = await page.evaluate(() => {
      const f = armorNav, out = [];
      const dirs = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
      for (const kind of ['tank', 'ifv', 'mcv', 'harvester']) {
        for (const [dx, dy] of dirs) {
          f.reset();
          const yaw = Math.atan2(dy, dx), u = f.spawn(kind, f.cx, f.cy, yaw + Math.PI);
          const goals = f.move([u], f.cx + dx, f.cy + dy);
          const result = f.run([u], goals, 8);
          out.push({kind, dx, dy, expectedDir: OU.createWorldVecToDir8(f.T / 2, f.T / 4, f.T)(dx, dy), ...result});
        }
      }
      return out;
    });
    function verify(result, label, grid = true) {
      assert(result.arrived.every(u => u.order === 'idle' && u.error < .01), `${label}: did not settle at assigned tile ${JSON.stringify(result)}`);
      assert(result.movingFrames > 0, `${label}: never moved`);
      assert.equal(result.changedGoal, false, `${label}: silently changed destination`);
      assert.equal(result.jumps, 0, `${label}: position jumped ${JSON.stringify(result)}`);
      assert.equal(result.turnSlides, 0, `${label}: moved during in-place rotation`);
      assert(result.maxYawError < .045, `${label}: movement/hull disagreement ${result.maxYawError}`);
      if (grid) assert(result.maxGridError < .001, `${label}: intermediate grid heading ${result.maxGridError}`);
    }
    directions.forEach(r => { verify(r, `${r.kind} ${r.dx},${r.dy}`); assert.equal(r.arrived[0].dir, r.expectedDir); });
    const longTurn = directions.find(r => r.kind === 'harvester' && r.dx === 1 && r.dy === 0);
    assert(longTurn.turnFrames >= 65, 'Opposite-facing harvester did not exercise a long stationary turn');
    console.log('EIGHT_DIRECTIONS_PASS', directions.length);

    const formation = await page.evaluate(() => {
      const f = armorNav; f.reset();
      const kinds = ['tank', 'ifv', 'mcv', 'harvester', 'tank', 'ifv', 'mcv', 'harvester'];
      const units = kinds.map((kind, i) => f.spawn(kind, f.cx - 7 + (i % 4), f.cy - 3 + Math.floor(i / 4) * 2, Math.PI));
      const goals = f.move(units, f.cx + 4, f.cy + 1);
      const result = f.run(units, goals, 45);
      f.g.cam.zoom = 1.2; f.g.centerCameraOn((f.cx + 4.5) * f.T, (f.cy + 1.5) * f.T);
      return {goals, ...result};
    });
    assert.equal(new Set(formation.goals.map(p => `${p.tx},${p.ty}`)).size, 8, 'Formation reused destination cells');
    verify(formation, 'mixed formation');
    await page.screenshot({path: prefix + '-formation.png'});
    console.log('MIXED_FORMATION_PASS', formation.seconds);

    const retarget = await page.evaluate(() => {
      const f = armorNav; f.reset();
      const u = f.spawn('tank', f.cx - 4, f.cy + 6, 0), start = u.x;
      f.move([u], f.cx + 4, f.cy + 6);
      for (let i = 0; i < 300 && u.x - start < f.T * .3; i++) f.tick();
      const offset = (u.x / f.T - .5) - Math.round(u.x / f.T - .5);
      const goals = f.move([u], f.cx - 1, f.cy + 3);
      return {offset, ...f.run([u], goals, 20, false)};
    });
    assert(Math.abs(retarget.offset) > .15 && Math.abs(retarget.offset) < .49, 'Retarget was not issued between tile centers');
    verify(retarget, 'mid-cell retarget', false);

    const headOnSwap = await page.evaluate(() => {
      const f = armorNav; f.reset();
      const units = [f.spawn('tank', f.cx, f.cy, 0), f.spawn('tank', f.cx + 1, f.cy, Math.PI)];
      const goals = units.map((u, i) => ({id: u.id, x: units[1 - i].x, y: units[1 - i].y,
        tx: Math.floor(units[1 - i].x / f.T), ty: Math.floor(units[1 - i].y / f.T)}));
      // UI placement normally selects a free cell. These explicit engine orders
      // exercise the traffic case where routes acquire each other's occupied cell.
      units.forEach((u, i) => {
        u.order = {type: 'move', ...goals[i], manual: true, allowAuto: false};
        f.g.sim.setPathTo(u, goals[i].x, goals[i].y);
      });
      return {goals, ...f.run(units, goals, 25)};
    });
    verify(headOnSwap, 'head-on occupied-cell swap');
    console.log('HEAD_ON_SWAP_PASS', headOnSwap.seconds);

    const midYieldRetarget = await page.evaluate(() => {
      const f = armorNav; f.reset();
      const a = f.spawn('tank', f.cx, f.cy, 0), u = f.spawn('tank', f.cx + 1, f.cy, Math.PI);
      const originalGoal = {x: a.x, y: a.y};
      for (const [unit, destination] of [[a, {x: u.x, y: u.y}], [u, originalGoal]]) {
        unit.order = {type: 'move', ...destination, tx: Math.floor(destination.x / f.T),
          ty: Math.floor(destination.y / f.T), manual: true, allowAuto: false};
        f.g.sim.setPathTo(unit, destination.x, destination.y);
      }
      for (let i = 0; i < 600 && !u._trafficGoal; i++) f.tick();
      const yielded = !!u._trafficGoal;
      a.order = {type: 'idle', x: a.x, y: a.y};
      a.path = null; a.flowGoal = null; a.vx = a.vy = 0;
      f.g.sim.clearReservation(a);
      const goals = f.move([u], f.cx + 4, f.cy + 3);
      const clearedImmediately = u._trafficGoal == null;
      const result = f.run([u], goals, 20, false);
      for (let i = 0; i < 120; i++) f.tick();
      return {yielded, clearedImmediately, originalGoal, goals,
        stayedAtNewGoal: Math.hypot(u.x - goals[0].x, u.y - goals[0].y) < .01 && !u._trafficGoal, ...result};
    });
    assert(midYieldRetarget.yielded, 'Retarget fixture never entered traffic yield');
    assert(midYieldRetarget.clearedImmediately, 'New command retained old temporary traffic destination');
    verify(midYieldRetarget, 'mid-yield retarget', false);
    assert(midYieldRetarget.stayedAtNewGoal, 'Original traffic destination resumed after new command completed');

    const temporaryBlock = await page.evaluate(() => {
      const f = armorNav; f.reset();
      // A normal one-tile passage between solid terrain rows, with an initially
      // clear route. An idle friendly vehicle temporarily occupies the passage.
      for (let x = 0; x < f.g.MAP_W; x++) {
        f.g.terrain[(f.cy - 1) * f.g.MAP_W + x] = 1;
        f.g.terrain[(f.cy + 1) * f.g.MAP_W + x] = 1;
      }
      const u = f.spawn('tank', f.cx - 4, f.cy, 0);
      const goals = f.move([u], f.cx + 4, f.cy);
      const blocker = f.spawn('ifv', f.cx - 2, f.cy, 0);
      for (let i = 0; i < 180; i++) f.tick();
      const waiting = {order: u.order?.type, x: u.x, y: u.y,
        goalError: Math.hypot(u.order.x - goals[0].x, u.order.y - goals[0].y),
        distanceToBlocker: Math.hypot(u.x - blocker.x, u.y - blocker.y)};
      blocker.alive = false; f.g.sim.clearReservation(blocker);
      const result = f.run([u], goals, 20);
      return {waiting, ...result};
    });
    assert.equal(temporaryBlock.waiting.order, 'move', `Blocked vehicle discarded move order: ${JSON.stringify(temporaryBlock)}`);
    assert(temporaryBlock.waiting.goalError < .01, 'Blocked vehicle discarded commanded destination');
    verify(temporaryBlock, 'temporary passage blocker');
    assert.equal(errors.length, 0, errors.join('\n'));
    const result = {pass: true, browser: engine, deterministicSimulationHz: 60,
      directions, longHarvesterTurnSeconds: longTurn.turnFrames / 60, formation, retarget, headOnSwap, midYieldRetarget, temporaryBlock, errors};
    fs.writeFileSync(prefix + '.json', JSON.stringify(result, null, 2));
    console.log('ARMOR_NAVIGATION_PASS', JSON.stringify({directions: directions.length,
      formationSeconds: formation.seconds, longHarvesterTurnSeconds: result.longHarvesterTurnSeconds,
      retargetSeconds: retarget.seconds, headOnSwapSeconds: headOnSwap.seconds, blockedRecoverySeconds: temporaryBlock.seconds}));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
