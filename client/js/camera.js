// camera.js
// - Camera, isometric projection, screen/world conversion, shake
// - Created by game.js with refs: { TILE, MAP_W, MAP_H, canvas, clamp }

(function (global) {
  "use strict";

  const OUCamera = global.OUCamera || (global.OUCamera = {});

  OUCamera.create = function create(refs) {
    const { TILE, MAP_W, MAP_H, canvas, clamp } = refs || {};
    if (!TILE || !MAP_W || !MAP_H || !canvas || typeof clamp !== "function") {
      const noop = () => {};
      const noopObj = () => ({ x: 0, y: 0 });
      return {
        cam: { x: 0, y: 0, speed: 900, zoom: 1.0 },
        camShake: { t: 0, dur: 0, mag: 0, freq: 0, ox: 0, oy: 0, active: false },
        worldToIso: noopObj,
        isoToWorld: noopObj,
        clampCamera: noop,
        worldToScreen: noopObj,
        screenToWorld: noopObj,
        centerCameraOn: noop,
        startCamShake: noop,
        updateCamShake: noop,
        isoCorners: [],
        isoMinX: 0, isoMaxX: 0, isoMinY: 0, isoMaxY: 0
      };
    }

    const WORLD_W = MAP_W * TILE;
    const WORLD_H = MAP_H * TILE;
    const ISO_X = TILE / 2;
    const ISO_Y = TILE / 4;

    function worldToIso(wx, wy) {
      return { x: (wx - wy) * (ISO_X / TILE), y: (wx + wy) * (ISO_Y / TILE) };
    }

    function isoToWorld(ix, iy) {
      const a = ix * (TILE / ISO_X);
      const b = iy * (TILE / ISO_Y);
      return { x: (a + b) / 2, y: (b - a) / 2 };
    }

    function getBaseOffset() {
      return { x: canvas.width * 0.5, y: canvas.height * 0.22 };
    }

    const cam = { x: WORLD_W * 0.5, y: WORLD_H * 0.5, speed: 900, zoom: 1.0 };

    const isoCorners = [
      worldToIso(0, 0),
      worldToIso(WORLD_W, 0),
      worldToIso(0, WORLD_H),
      worldToIso(WORLD_W, WORLD_H)
    ];
    const isoMinX = Math.min(...isoCorners.map(p => p.x));
    const isoMaxX = Math.max(...isoCorners.map(p => p.x));
    const isoMinY = Math.min(...isoCorners.map(p => p.y));
    const isoMaxY = Math.max(...isoCorners.map(p => p.y));

    function clampCamera() {
      const base = getBaseOffset();
      const camIso = worldToIso(cam.x, cam.y);
      const margin = 220;

      const minCamIsoX = isoMinX - base.x - margin;
      const maxCamIsoX = isoMaxX - base.x + margin;
      const minCamIsoY = isoMinY - base.y - margin;
      const maxCamIsoY = isoMaxY - base.y + margin;

      camIso.x = clamp(camIso.x, minCamIsoX, maxCamIsoX);
      camIso.y = clamp(camIso.y, minCamIsoY, maxCamIsoY);

      const w = isoToWorld(camIso.x, camIso.y);
      cam.x = w.x;
      cam.y = w.y;
    }

    function worldToScreen(wx, wy) {
      const base = getBaseOffset();
      const iso = worldToIso(wx, wy);
      const camIso = worldToIso(cam.x, cam.y);
      return {
        x: (iso.x - camIso.x) * cam.zoom + base.x + (camShake.active ? camShake.ox : 0),
        y: (iso.y - camIso.y) * cam.zoom + base.y + (camShake.active ? camShake.oy : 0)
      };
    }

    function screenToWorld(px, py) {
      const base = getBaseOffset();
      const camIso = worldToIso(cam.x, cam.y);
      const isoX = (px - base.x) / cam.zoom + camIso.x;
      const isoY = (py - base.y) / cam.zoom + camIso.y;
      return isoToWorld(isoX, isoY);
    }

    function centerCameraOn(wx, wy) {
      const base = getBaseOffset();
      const iso = worldToIso(wx, wy);
      const cx = canvas.width * 0.5;
      const cy = canvas.height * 0.5;
      const camIsoX = iso.x + base.x - cx;
      const camIsoY = iso.y + base.y - cy;
      const w = isoToWorld(camIsoX, camIsoY);
      cam.x = w.x;
      cam.y = w.y;
      clampCamera();
    }

    const camShake = { t: 0, dur: 0, mag: 0, freq: 0, ox: 0, oy: 0, active: false };

    function startCamShake(dur = 0.55, mag = 18, freq = 34) {
      camShake.t = 0;
      camShake.dur = Math.max(0.05, dur);
      camShake.mag = mag;
      camShake.freq = freq;
      camShake.active = true;
      camShake.ox = 0;
      camShake.oy = 0;
    }

    function updateCamShake(dt) {
      if (!camShake.active) return;
      camShake.t += dt;
      const k = 1 - camShake.t / Math.max(0.001, camShake.dur);
      if (k <= 0) {
        camShake.active = false;
        camShake.ox = 0;
        camShake.oy = 0;
        return;
      }
      const a = camShake.t * camShake.freq;
      const amp = camShake.mag * (k * k);
      camShake.ox = (Math.sin(a * 1.7) + Math.sin(a * 2.9) * 0.55) * amp;
      camShake.oy = (Math.cos(a * 1.3) + Math.cos(a * 2.3) * 0.55) * amp;
    }

    return {
      cam,
      camShake,
      worldToIso,
      isoToWorld,
      clampCamera,
      worldToScreen,
      screenToWorld,
      centerCameraOn,
      startCamShake,
      updateCamShake,
      isoCorners,
      isoMinX,
      isoMaxX,
      isoMinY,
      isoMaxY
    };
  };
})(window);
