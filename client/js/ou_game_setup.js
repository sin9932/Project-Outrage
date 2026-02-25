// ou_game_setup.js
// [refactor] Game start placement logic extracted from game.js
// - findFootprintSpotNear: find valid tile for building footprint
// - placeStart: clear world, place HQ for both teams, reveal fog

(function (global) {
  "use strict";

  const OUGameSetup = global.OUGameSetup || (global.OUGameSetup = {});

  /**
   * create(refs) -> { placeStart, findFootprintSpotNear }
   * refs: { clearWorld, addBuilding, isBlockedFootprint, buildings, BUILD, TEAM,
   *         clamp, MAP_W, MAP_H, inMap, idx, explored, visible,
   *         recomputePower, centerCameraOn, updateSelectionUI, getStartBeaconTiles }
   */
  OUGameSetup.create = function create(refs) {
    const r = refs || {};
    const clearWorld = r.clearWorld;
    const addBuilding = r.addBuilding;
    const isBlockedFootprint = r.isBlockedFootprint;
    const buildings = r.buildings || [];
    const BUILD = r.BUILD || {};
    const TEAM = r.TEAM || {};
    const clamp = r.clamp || ((v, a, b) => Math.max(a, Math.min(b, v)));
    const MAP_W = r.MAP_W || 40;
    const MAP_H = r.MAP_H || 40;
    const inMap = r.inMap || (() => false);
    const idx = r.idx || (() => 0);
    const explored = r.explored || [];
    const visible = r.visible || [];
    const recomputePower = r.recomputePower || (() => {});
    const centerCameraOn = r.centerCameraOn || (() => {});
    const updateSelectionUI = r.updateSelectionUI || (() => {});
    const getStartBeaconTiles = r.getStartBeaconTiles || (() => []);

    function findFootprintSpotNear(kind, nearTx, nearTy, tries) {
      tries = tries || 260;
      const spec = BUILD[kind];
      if (!spec) return { tx: clamp(nearTx, 0, MAP_W - 1), ty: clamp(nearTy, 0, MAP_H - 1) };
      const tw = spec.tw || 1;
      const th = spec.th || 1;
      for (let i = 0; i < tries; i++) {
        const tx = nearTx + ((Math.random() * 18) | 0) - 9;
        const ty = nearTy + ((Math.random() * 18) | 0) - 9;
        if (!isBlockedFootprint(tx, ty, tw, th)) return { tx, ty };
      }
      return { tx: clamp(nearTx, 0, MAP_W - tw), ty: clamp(nearTy, 0, MAP_H - th) };
    }

    function placeStart(spawn) {
      if (typeof clearWorld === "function") clearWorld();

      const startBeaconTiles = getStartBeaconTiles();
      let a, b;

      if (startBeaconTiles.length >= 2) {
        if (spawn === "left") {
          a = { tx: startBeaconTiles[0].tx, ty: startBeaconTiles[0].ty };
          b = { tx: startBeaconTiles[1].tx, ty: startBeaconTiles[1].ty };
        } else {
          a = { tx: startBeaconTiles[1].tx, ty: startBeaconTiles[1].ty };
          b = { tx: startBeaconTiles[0].tx, ty: startBeaconTiles[0].ty };
        }
      } else {
        if (spawn === "left") {
          a = { tx: Math.floor(MAP_W * 0.22), ty: Math.floor(MAP_H * 0.62) };
          b = { tx: Math.floor(MAP_W * 0.78), ty: Math.floor(MAP_H * 0.38) };
        } else {
          a = { tx: Math.floor(MAP_W * 0.86), ty: Math.floor(MAP_H * 0.72) };
          b = { tx: Math.floor(MAP_W * 0.14), ty: Math.floor(MAP_H * 0.28) };
        }
      }

      function safePlace(team, kind, nearTx, nearTy) {
        const spot = findFootprintSpotNear(kind, nearTx, nearTy, 420);
        if (!spot) return null;
        const b = addBuilding(team, kind, spot.tx, spot.ty);
        if (b && kind === "barracks") {
          b._barrackNoBuildAnim = true;
          b._barrackBuildT0 = null;
          b._barrackBuildDone = true;
        }
        return b;
      }

      const hqSpec = BUILD.hq;
      if (!hqSpec) return;

      const hqCenterOffTx = (hqSpec.tw / 2) | 0;
      const hqCenterOffTy = (hqSpec.th / 2) | 0;
      const useBeacon = startBeaconTiles.length >= 2;
      let pHQ = null;
      let eHQ = null;

      if (useBeacon) {
        const playerHQtx = a.tx - hqCenterOffTx;
        const playerHQty = a.ty - hqCenterOffTy;
        if (!isBlockedFootprint(playerHQtx, playerHQty, hqSpec.tw, hqSpec.th)) {
          pHQ = addBuilding(TEAM.PLAYER, "hq", playerHQtx, playerHQty);
        } else {
          pHQ = safePlace(TEAM.PLAYER, "hq", playerHQtx, playerHQty);
        }
        const enemyHQtx = b.tx - hqCenterOffTx;
        const enemyHQty = b.ty - hqCenterOffTy;
        if (!isBlockedFootprint(enemyHQtx, enemyHQty, hqSpec.tw, hqSpec.th)) {
          eHQ = addBuilding(TEAM.ENEMY, "hq", enemyHQtx, enemyHQty);
        } else {
          eHQ = safePlace(TEAM.ENEMY, "hq", enemyHQtx, enemyHQty);
        }
      } else {
        pHQ = safePlace(TEAM.PLAYER, "hq", a.tx - hqCenterOffTx, a.ty - hqCenterOffTy);
        eHQ = safePlace(TEAM.ENEMY, "hq", b.tx - hqCenterOffTx, b.ty - hqCenterOffTy);
      }

      // Reveal HQ footprints immediately (avoid black tiles on first frame)
      for (const b of buildings) {
        if (!b || !b.alive || (b.team !== TEAM.PLAYER && b.team !== TEAM.ENEMY)) continue;
        const tw = b.tw ?? (BUILD[b.kind] && BUILD[b.kind].tw) ?? 1;
        const th = b.th ?? (BUILD[b.kind] && BUILD[b.kind].th) ?? 1;
        for (let ty = b.ty; ty < b.ty + th; ty++) {
          for (let tx = b.tx; tx < b.tx + tw; tx++) {
            if (inMap(tx, ty)) {
              const i = idx(tx, ty);
              if (explored[b.team]) explored[b.team][i] = 1;
              if (visible[b.team]) visible[b.team][i] = 1;
            }
          }
        }
      }

      recomputePower();
      if (pHQ) centerCameraOn(pHQ.x, pHQ.y);
      updateSelectionUI();
    }

    return { placeStart, findFootprintSpotNear };
  };
})(window);
