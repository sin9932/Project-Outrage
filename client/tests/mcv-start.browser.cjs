const engine = process.env.OUTRAGE_BROWSER || 'chromium';
const bt = require(process.env.OUTRAGE_PLAYWRIGHT)[engine];
const fs = require('node:fs');
const assert = require('node:assert/strict');

(async () => {
  const browser = await bt.launch({ headless: true, ...(engine === 'chromium'
    ? { executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' } : {}) });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.stack));
    await page.goto(process.env.OUTRAGE_URL || 'http://127.0.0.1:8765/index.html?debug=1');

    async function start(side, shortGame) {
      await page.waitForFunction(() => window.OUTankTest, null, { timeout: 60000 });
      // Capture the synchronous initialized world before AI gets its first turn.
      // The real button, terrain, fog, unit constructors and placement run normally.
      await page.evaluate(() => {
        const g = window.g = OUTankTest;
        window.readStart = () => {
          const mobile = g.units.filter(u => u.alive && u.kind === 'mcv');
          const player = mobile.find(u => u.team === g.TEAM.PLAYER);
          const view = player && g.worldToScreen(player.x, player.y);
          return {
            hqs: g.buildings.filter(b => b.alive && b.kind === 'hq').length, hqHp: g.BUILD.hq.hp,
            units: mobile.map(u => {
              const site = g.mcv.site(u), tile = Math.floor(u.y / g.TILE) * g.MAP_W + Math.floor(u.x / g.TILE);
              return { id: u.id, team: u.team, x: u.x, y: u.y, hp: u.hp, hpMax: u.hpMax,
                valid: g.mcv.valid(u, site), site,
                explored: g.explored[u.team][tile], visible: g.visible[u.team][tile] };
            }),
            selection: [...g.state.selection], money: [g.state.player.money, g.state.enemy.money],
            power: [g.state.player.powerProd, g.state.enemy.powerProd],
            occupied: g.buildOcc.reduce((n, v) => n + (v ? 1 : 0), 0),
            view, canvas: { w: document.querySelector('#c').width, h: document.querySelector('#c').height },
            seenTiles: g.explored[g.TEAM.PLAYER].reduce((n, v) => n + v, 0),
            mapTiles: g.MAP_W * g.MAP_H,
            end: !!(g.state.gameOverPending || g.state.gameOverFade || g.state.gameOverVictory != null)
          };
        };
        const original = g.setup.placeStart;
        g.setup.placeStart = function (...args) {
          const result = original(...args);
          window.startSnapshot = readStart();
          return result;
        };
      });
      await page.locator(`.spawn-badge[data-spawn="${side}"]`).click();
      await page.locator('#fogOff').uncheck();
      await page.locator('#shortGame').setChecked(shortGame);
      await page.locator('#startBtn').click();
      await page.waitForFunction(() => OUTankTest.running, null, { timeout: 120000 });
      const snapshot = await page.evaluate(() => startSnapshot);
      checkStart(snapshot);
      return snapshot;
    }
    function checkStart(s) {
      assert.equal(s.hqs, 0, 'A new match must create MCVs directly');
      assert.deepEqual(s.units.map(u => u.team).sort(), [0, 1]);
      assert(s.units.every(u => u.valid && u.explored === 1 && u.visible === 1));
      assert(s.units.every(u => u.hp === s.hqHp && u.hpMax === s.hqHp));
      assert.deepEqual(s.selection, [s.units.find(u => u.team === 0).id]);
      assert.deepEqual(s.money, [10000, 10000]);
      assert.deepEqual(s.power, [0, 0]);
      assert.equal(s.occupied, 0, 'MCV starts must not leave building occupancy');
      assert(s.seenTiles > 1 && s.seenTiles < s.mapTiles, 'Normal MCV vision must reveal only nearby tiles');
      assert(s.view.x > 0 && s.view.x < s.canvas.w && s.view.y > 0 && s.view.y < s.canvas.h);
      assert.equal(s.end, false);
    }

    const left = await start('left', true);
    // Let a real short-game match run with the player's only asset still mobile.
    await page.waitForFunction(() => g.state.t > 2 &&
      g.buildings.some(b => b.alive && b.team === 1 && b.kind === 'hq' && !b._mcvPhase), null, { timeout: 15000 });
    assert(await page.evaluate(() => g.units.some(u => u.alive && u.team === 0 && u.kind === 'mcv') &&
      !g.state.gameOverPending && !g.state.gameOverFade && g.state.gameOverVictory == null));
    await page.screenshot({ path: process.argv[2] + '-mobile-start.png' });
    await page.keyboard.press('d');
    await page.waitForFunction(id => g.buildings.some(b => b.alive && b._mcvOriginId === id && !b._mcvPhase),
      left.units.find(u => u.team === 0).id, { timeout: 10000 });
    assert(await page.evaluate(() => {
      const yard = g.buildings.find(b => b.alive && b.team === 0 && b.kind === 'hq');
      return g.state.selection.has(yard.id) && yard.hp === g.BUILD.hq.hp && OUTech.operational(yard) &&
        !g.units.some(u => u.alive && u.team === 0 && u.kind === 'mcv');
    }));
    // The ordinary enemy building planner must continue after the initial deploy.
    await page.waitForFunction(() => g.buildings.some(b => b.alive && b.team === 1 && b.kind !== 'hq' && !b.civ),
      null, { timeout: 35000 });

    // Actual pause-menu exit/reload and start from the opposite beacon.
    await page.keyboard.press('Escape');
    await Promise.all([page.waitForEvent('load'), page.locator('#pmExit').click()]);
    const right = await start('right', false);
    assert.notDeepEqual(right.units.find(u => u.team === 0).site, left.units.find(u => u.team === 0).site);
    const point = await page.evaluate(() => {
      const u = g.units.find(u => u.alive && u.team === 0 && u.kind === 'mcv');
      const c = document.querySelector('#c'), r = c.getBoundingClientRect(), v = g.worldToScreen(u.x, u.y);
      return { x: r.left + v.x * r.width / c.width, y: r.top + (v.y - 15 * g.cam.zoom) * r.height / c.height };
    });
    await page.mouse.dblclick(point.x, point.y, { delay: 80 });
    await page.waitForFunction(id => g.buildings.some(b => b.alive && b._mcvOriginId === id),
      right.units.find(u => u.team === 0).id, { timeout: 10000 });

    // Exercise placement fallback against the loaded map while the simulation is paused.
    await page.keyboard.press('Escape');
    const fallback = await page.evaluate(leftSite => {
      const i = leftSite.ty * g.MAP_W + leftSite.tx, old = g.ore[i];
      g.ore[i] = 100;
      const placed = g.setup.placeStart('left'), blockedBeacon = readStart();
      g.ore[i] = old;
      const random = [];
      for (let n = 0; n < 4; n++) { g.setup.placeStart('random'); random.push(readStart()); }
      return { placed, blockedBeacon, random };
    }, left.units.find(u => u.team === 0).site);
    assert(fallback.placed);
    checkStart(fallback.blockedBeacon);
    assert.notDeepEqual(fallback.blockedBeacon.units.find(u => u.team === 0).site, left.units.find(u => u.team === 0).site);
    fallback.random.forEach(checkStart);
    assert.equal(errors.length, 0, errors.join('\n'));
    fs.writeFileSync(process.argv[2] + '.json', JSON.stringify({
      initialMobile: true, selected: true, fog: true, validSites: true, shortGameNoPrematureEnd: true,
      keyboardDeploy: true, enemyDeployAndBuild: true, pauseMenuRestart: true, oppositeBeacon: true,
      doubleClickDeploy: true, blockedBeaconFallback: true, randomStart: true, left, right, fallback, errors
    }, null, 2));
    console.log('MCV_START_PASS');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
