// ou_utils.js
// Small shared helpers for Project-Outrage.
// Safe: only defines globals if they don't already exist.

(function (global) {
  'use strict';

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const dist2 = (ax, ay, bx, by) => {
    const dx = ax - bx, dy = ay - by;
    return dx * dx + dy * dy;
  };
  const rnd = (a, b) => a + Math.random() * (b - a);

  // DOM helper (optional)
  const $ = (id) => document.getElementById(id);

  // Expose as a namespace too (for cleanliness)
  const OU = global.OU || (global.OU = {});
  OU.clamp = OU.clamp || clamp;
  OU.dist2 = OU.dist2 || dist2;
  OU.rnd = OU.rnd || rnd;
  OU.$ = OU.$ || $;

  // Tile/world helpers (require TILE, MAP_W, MAP_H)
  function createTileHelpers(TILE, MAP_W, MAP_H) {
    return {
      tileToWorldCenter: (tx, ty) => ({ x: (tx + 0.5) * TILE, y: (ty + 0.5) * TILE }),
      tileToWorldOrigin: (tx, ty) => ({ x: tx * TILE, y: ty * TILE }),
      snapWorldToTileCenter: (wx, wy) => {
        const tx = clamp(Math.floor(wx / TILE), 0, MAP_W - 1);
        const ty = clamp(Math.floor(wy / TILE), 0, MAP_H - 1);
        const p = { x: (tx + 0.5) * TILE, y: (ty + 0.5) * TILE };
        return { tx, ty, x: p.x, y: p.y };
      },
      buildingWorldFromTileOrigin: (tx, ty, tw, th) => {
        const w = tw * TILE, h = th * TILE;
        return { cx: tx * TILE + w / 2, cy: ty * TILE + h / 2, w, h };
      }
    };
  }
  OU.createTileHelpers = createTileHelpers;

  // Back-compat globals (only if missing)
  if (!global.clamp) global.clamp = clamp;
  if (!global.dist2) global.dist2 = dist2;
  if (!global.rnd) global.rnd = rnd;
  if (!global.$) global.$ = $;

})(window);
