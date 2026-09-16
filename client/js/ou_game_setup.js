// Match placement owns start locations, while MCV deployment remains in mcv.js.
(function (global) {
  "use strict";

  const OUGameSetup = global.OUGameSetup || (global.OUGameSetup = {});

  OUGameSetup.create = function create(r) {
    const { clearWorld, addUnit, isBlockedFootprint, state, BUILD, TEAM, TILE,
      MAP_W, MAP_H, updateVision, recomputePower, centerCameraOn,
      updateSelectionUI, getStartBeaconTiles } = r;

    // Search nearest first, then every legal origin. Never return an unchecked
    // fallback: a mobile start must be able to deploy without moving first.
    function findFootprintSpotNear(kind, nearTx, nearTy, reserved = []) {
      const spec = BUILD[kind];
      if (!spec || spec.tw > MAP_W || spec.th > MAP_H) return null;
      const maxTx = MAP_W - spec.tw, maxTy = MAP_H - spec.th;
      const cx = Math.max(0, Math.min(maxTx, Math.floor(nearTx)));
      const cy = Math.max(0, Math.min(maxTy, Math.floor(nearTy)));
      function candidate(tx, ty) {
        if (tx < 0 || ty < 0 || tx > maxTx || ty > maxTy) return null;
        // Keep the two future HQ footprints separate before either MCV exists.
        if (reserved.some(p => tx < p.tx + p.tw + 1 && tx + spec.tw + 1 > p.tx &&
          ty < p.ty + p.th + 1 && ty + spec.th + 1 > p.ty)) return null;
        return isBlockedFootprint(tx, ty, spec.tw, spec.th, kind) ? null : { tx, ty };
      }
      const center = candidate(cx, cy);
      if (center) return center;
      for (let radius = 1; radius <= Math.max(MAP_W, MAP_H); radius++) {
        for (let dx = -radius; dx <= radius; dx++) {
          const top = candidate(cx + dx, cy - radius);
          if (top) return top;
          const bottom = candidate(cx + dx, cy + radius);
          if (bottom) return bottom;
        }
        for (let dy = -radius + 1; dy < radius; dy++) {
          const left = candidate(cx - radius, cy + dy);
          if (left) return left;
          const right = candidate(cx + radius, cy + dy);
          if (right) return right;
        }
      }
      return null;
    }

    function startAnchors(spawn) {
      const side = spawn === "random" ? (Math.random() < 0.5 ? "left" : "right") : spawn;
      const beacons = getStartBeaconTiles();
      if (beacons.length >= 2) {
        // Tile index order and isometric screen left/right run in reverse.
        return side === "left" ? [beacons[1], beacons[0]] : [beacons[0], beacons[1]];
      }
      return side === "left"
        ? [{ tx: Math.floor(MAP_W * 0.22), ty: Math.floor(MAP_H * 0.62) },
           { tx: Math.floor(MAP_W * 0.78), ty: Math.floor(MAP_H * 0.38) }]
        : [{ tx: Math.floor(MAP_W * 0.86), ty: Math.floor(MAP_H * 0.72) },
           { tx: Math.floor(MAP_W * 0.14), ty: Math.floor(MAP_H * 0.28) }];
    }

    function placeStart(spawn) {
      clearWorld();
      const spec = BUILD.hq;
      if (!spec) return false;
      const anchors = startAnchors(spawn), spots = [];
      for (const anchor of anchors) {
        const spot = findFootprintSpotNear("hq", anchor.tx - Math.floor(spec.tw / 2),
          anchor.ty - Math.floor(spec.th / 2), spots);
        if (!spot) return false;
        spots.push({ ...spot, tw: spec.tw, th: spec.th });
      }
      const mcvs = spots.map((spot, i) => addUnit(i === 0 ? TEAM.PLAYER : TEAM.ENEMY,
        "mcv", (spot.tx + spec.tw / 2) * TILE, (spot.ty + spec.th / 2) * TILE,
        { skipMvp: true }));
      state.selection.add(mcvs[0].id);
      // Use ordinary unit vision, including the fog-off option, on the first frame.
      updateVision();
      recomputePower();
      centerCameraOn(mcvs[0].x, mcvs[0].y);
      updateSelectionUI();
      return true;
    }

    return { placeStart, findFootprintSpotNear };
  };
})(window);
