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

  // Point-in-polygon (ray casting)
  function pointInPoly(x, y, poly) {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const xi = poly[i].x, yi = poly[i].y;
      const xj = poly[j].x, yj = poly[j].y;
      const intersect = ((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / ((yj - yi) || 1e-9) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
  }
  OU.pointInPoly = pointInPoly;

  // Vector to 8-direction index (E,NE,N,NW,W,SW,S,SE). +y=down, north=dy<0.
  function vecToDir8(dx, dy) {
    if (!dx && !dy) return 6;
    const ang = Math.atan2(dy, dx);
    const targets = [0, -45, -90, -135, 180, 135, 90, 45];
    const deg = ang * 180 / Math.PI;
    let bestI = 0, bestD = 1e9;
    for (let i = 0; i < 8; i++) {
      let d = deg - targets[i];
      d = ((d + 540) % 360) - 180;
      const ad = Math.abs(d);
      if (ad < bestD) { bestD = ad; bestI = i; }
    }
    return bestI;
  }
  OU.vecToDir8 = vecToDir8;

  // World-space vector to 8-dir (needs isometric scale factors)
  function createWorldVecToDir8(ISO_X, ISO_Y, TILE) {
    return (dx, dy) => {
      const sx = (dx - dy) * (ISO_X / TILE);
      const sy = (dx + dy) * (ISO_Y / TILE);
      return vecToDir8(sx, sy);
    };
  }
  OU.createWorldVecToDir8 = createWorldVecToDir8;

  // Back-compat globals (only if missing)
  if (!global.clamp) global.clamp = clamp;
  if (!global.dist2) global.dist2 = dist2;
  if (!global.rnd) global.rnd = rnd;
  if (!global.$) global.$ = $;

})(window);
