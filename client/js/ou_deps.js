// ou_deps.js
// Bootstrap: create safe stubs for global namespaces to prevent crashes when
// module load order is wrong or a module fails to load (e.g. syntax error).
// Real modules overwrite these when they load. Load this FIRST in index.html.

(function (global) {
  "use strict";

  const noop = () => {};
  const noopRet = (v) => v;

  // FX: game.js expects arrays + functions. Stub prevents "Cannot read property of undefined".
  if (!global.FX) {
    global.FX = {
      _stub: true, // cleared when fx_all.js overwrites
      setTile: noop,
      setGetTime: noop,
      explosions: [],
      debris: [],
      debrisTrail: [],
      exp1Fxs: [],
      smokeWaves: [],
      smokePuffs: [],
      smokeEmitters: [],
      dustPuffs: [],
      dmgSmokePuffs: [],
      bloodStains: [],
      bloodPuffs: [],
      addBloodBurst: noop,
      addDebris: noop,
      addBuildingExplosion: noop,
      addSmokeEmitter: noop,
      spawnSmokePuff: noop,
      spawnSmokeHaze: noop,
      spawnExp1FxAt: noop,
      spawnTrailPuff: noop,
      spawnDmgSmokePuff: noop,
      updateExplosions: noop,
      updateDebris: noop,
      updateSmoke: noop,
      updateBlood: noop,
      pushClickWave: noop,
      pushOrderFx: noop
    };
  }

  // OU: ou_utils.js namespace
  if (!global.OU) {
    global.OU = {};
  }

  // OUMap: map.js
  if (!global.OUMap) {
    global.OUMap = {};
  }

  // OUGameSetup, OUPregame: optional modules
  if (!global.OUGameSetup) global.OUGameSetup = {};
  if (!global.OUPregame) global.OUPregame = {};

  // PO (Project Outrage): 통합 네임스페이스. 이름 충돌 방지, 향후 ES Module 전환 시 마이그레이션 포인트.
  // getter 사용으로 실제 모듈 로드 후 최신 참조 유지.
  if (!global.PO) {
    global.PO = {};
    try {
      Object.defineProperties(global.PO, {
        FX: { get: () => global.FX, enumerable: true },
        OU: { get: () => global.OU, enumerable: true },
        OUMap: { get: () => global.OUMap, enumerable: true },
        OUUI: { get: () => global.OUUI, enumerable: true },
        OUEconomy: { get: () => global.OUEconomy, enumerable: true },
        OUSelection: { get: () => global.OUSelection, enumerable: true },
        OUSim: { get: () => global.OUSim, enumerable: true },
        OUAi: { get: () => global.OUAi, enumerable: true },
        OUCommands: { get: () => global.OUCommands, enumerable: true },
        OUCamera: { get: () => global.OUCamera, enumerable: true },
        OUGameSetup: { get: () => global.OUGameSetup, enumerable: true },
        OUPregame: { get: () => global.OUPregame, enumerable: true },
        OUFlowField: { get: () => global.OUFlowField, enumerable: true }
      });
    } catch (_) {}
  }

})(typeof window !== "undefined" ? window : globalThis);
