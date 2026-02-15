/*
  Project-Outrage: Barracks module (buildings.js)
  Patch: v27 (fix drawBuilding signature + kind + no hook loop)

  What this fixes:
  - game.js expects PO.buildings.drawBuilding(ent, ctx, cam, helpers, state)
  - game.js uses kind 'barracks' (plural)
  - Old patches tried to "hook" a drawBuilding that doesn't exist -> install timed out

  This file defines PO.buildings.* directly and falls back safely.
*/

(() => {
  'use strict';

  const TAG = '[barracks:v27]';
  const log = (...a) => console.log(TAG, ...a);
  const warn = (...a) => console.warn(TAG, ...a);

  const PO = (window.PO = window.PO || {});
  PO.buildings = PO.buildings || {};

  // --- Config knobs (can be tweaked in console via localStorage) ---
  const CFG = {
    // Visual scale of the barracks sprite
    scale: () => {
      const v = Number(localStorage.getItem('po_barracks_scale'));
      return Number.isFinite(v) && v > 0 ? v : 0.14;
    },
    // Pixel nudges after worldToScreen anchor (screen-space)
    offX: () => Number(localStorage.getItem('po_barracks_offx') || 0),
    offY: () => Number(localStorage.getItem('po_barracks_offy') || 0),

    // Animation FPS
    idleFps: 8,
    fxFps: 10,

    // Ghost lifetimes (ms)
    buildDur: 1100,
    sellDur: 900,
    destroyDur: 1100,
  };

  // --- Team palette helpers (copied logic style from game.js, but self-contained) ---
  function _teamId(team) {
    const t = (team | 0);
    try {
      if (window.LINK_ENEMY_TO_PLAYER_COLOR && t === 2) return 1;
    } catch (_) {}
    return t;
  }

  function _teamAccent(team) {
    const t = _teamId(team);
    const m = window.TEAM_ACCENT;
    if (m && Array.isArray(m[t])) return m[t];
    // fallback: cyan-ish
    return [0, 170, 255];
  }

  function _isAccentPixel(r, g, b, a) {
    if (a < 20) return false;

    // near-magenta OR magenta-ish / pink-ish
    const isMagenta = (r > 200 && g < 80 && b > 200);

    // also accept "bright purple" even if not perfect #ff00ff
    const isPurple = (r > 150 && b > 150 && g < 120);

    return isMagenta || isPurple;
  }

  function _applyTeamPaletteToCanvas(srcCanvas, team, opts = {}) {
    const w = srcCanvas.width | 0;
    const h = srcCanvas.height | 0;
    if (w <= 0 || h <= 0) return null;

    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(srcCanvas, 0, 0);

    const imgData = g.getImageData(0, 0, w, h);
    const d = imgData.data;

    const [tr, tg, tb] = _teamAccent(team);

    // Optional exclude rects: [{x,y,w,h}, ...]
    const ex = Array.isArray(opts.excludeRects) ? opts.excludeRects : [];
    const inExclude = (x, y) => {
      for (const r of ex) {
        if (x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h) return true;
      }
      return false;
    };

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (inExclude(x, y)) continue;
        const i = (y * w + x) * 4;
        const r = d[i], gg = d[i + 1], b = d[i + 2], a = d[i + 3];
        if (!_isAccentPixel(r, gg, b, a)) continue;

        // intensity based on luminance, similar vibe to game.js
        const lum = (r + gg + b) / 3;
        const v = Math.min(1, Math.max(0.25, lum / 255));
        d[i] = Math.round(tr * v);
        d[i + 1] = Math.round(tg * v);
        d[i + 2] = Math.round(tb * v);
      }
    }

    g.putImageData(imgData, 0, 0);
    return c;
  }

  // --- Atlas handling ---
  const assets = {
    booted: false,
    loading: false,
    ready: false,
    lastErr: null,

    idle: null,
    build: null,
    destr: null,

    idleFrames: [],
    buildFrames: [],
    destrFrames: [],

    // cache key: `${team}|${atlasKey}|${frameName}` -> canvas
    tinted: new Map(),

    ghosts: [],
    _lastGhostDrawT: -1,
  };

  function _sortedFrameKeys(keys) {
    const rx = /(\d+)(?!.*\d)/;
    return keys.slice().sort((a, b) => {
      const ma = a.match(rx);
      const mb = b.match(rx);
      if (ma && mb) return (parseInt(ma[1], 10) - parseInt(mb[1], 10)) || a.localeCompare(b);
      if (ma) return -1;
      if (mb) return 1;
      return a.localeCompare(b);
    });
  }

  function _chooseFrames(atlas, tokens) {
    const keys = Object.keys(atlas.frames || {});
    if (!keys.length) return [];

    for (const t of tokens) {
      const hit = keys.filter(k => k.includes(t));
      if (hit.length) return _sortedFrameKeys(hit);
    }
    return _sortedFrameKeys(keys);
  }

  function _urlCandidates(roots, files) {
    const out = [];
    for (const r of roots) {
      for (const f of files) {
        try {
          out.push(new URL(`${r.replace(/\/$/, '')}/${f}`, document.baseURI).toString());
        } catch (_) {}
      }
    }
    return out;
  }

  async function _loadFirstAtlas(candidates) {
    const loader = PO.atlasTP && PO.atlasTP.loadAtlasMulti;
    if (typeof loader !== 'function') throw new Error('atlasTP.loadAtlasMulti missing');

    let last = null;
    for (const url of candidates) {
      try {
        const a = await loader(url);
        a.__srcUrl = url;
        return a;
      } catch (e) {
        last = e;
      }
    }
    throw last || new Error('no atlas candidates worked');
  }

  function _cropFromAtlasFrame(atlas, frameName) {
    const f = atlas.frames && atlas.frames[frameName];
    if (!f || !atlas.image) return null;

    const srcSize = f.sourceSize || { w: f.frame.w, h: f.frame.h };
    const canvas = document.createElement('canvas');
    canvas.width = srcSize.w;
    canvas.height = srcSize.h;
    const ctx = canvas.getContext('2d');

    const fx = f.frame.x, fy = f.frame.y, fw = f.frame.w, fh = f.frame.h;
    const dx = (f.spriteSourceSize && f.spriteSourceSize.x) || 0;
    const dy = (f.spriteSourceSize && f.spriteSourceSize.y) || 0;

    if (!f.rotated) {
      ctx.drawImage(atlas.image, fx, fy, fw, fh, dx, dy, fw, fh);
      return canvas;
    }

    // rotated frame (TexturePacker style)
    // draw rotated sprite into the untrimmed canvas
    ctx.save();
    ctx.translate(dx, dy);
    ctx.translate(fw / 2, fh / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.drawImage(atlas.image, fx, fy, fw, fh, -fh / 2, -fw / 2, fh, fw);
    ctx.restore();

    return canvas;
  }

  function _getTintedFrameCanvas(atlasKey, atlas, frameName, team) {
    const teamId = _teamId(team);
    const key = `${teamId}|${atlasKey}|${frameName}`;
    const cached = assets.tinted.get(key);
    if (cached) return cached;

    const base = _cropFromAtlasFrame(atlas, frameName);
    if (!base) return null;

    // If team is unknown, keep base.
    let out = base;
    if (Number.isFinite(teamId)) {
      out = _applyTeamPaletteToCanvas(base, teamId) || base;
    }

    assets.tinted.set(key, out);
    return out;
  }

  function _isBarracksKind(kind) {
    return kind === 'barracks' || kind === 'barrack';
  }

  function _pushGhost(type, b, state) {
    if (!b || !_isBarracksKind(b.kind)) return;
    const t0 = (state && state.t) || performance.now();

    const dur = type === 'build' ? CFG.buildDur : (type === 'sell' ? CFG.sellDur : CFG.destroyDur);

    assets.ghosts.push({
      type,
      team: b.team,
      tx: b.tx, ty: b.ty, tw: b.tw, th: b.th,
      t0,
      dur,
    });
  }

  function _worldAnchorScreen(b, helpers) {
    // Prefer tileToWorldOrigin if available (it's defined in game.js)
    try {
      if (typeof window.tileToWorldOrigin === 'function') {
        const w = window.tileToWorldOrigin(b.tx + b.tw, b.ty + b.th);
        return helpers.worldToScreen(w.x, w.y);
      }
    } catch (_) {}

    // Fallback: assume tiles are 110px (matches game.js default)
    const TILE_FALLBACK = 110;
    return helpers.worldToScreen((b.tx + b.tw) * TILE_FALLBACK, (b.ty + b.th) * TILE_FALLBACK);
  }

  function _drawCanvasBottomCentered(ctx, spriteCanvas, anchorX, anchorY, scale, offX, offY) {
    const w = spriteCanvas.width;
    const h = spriteCanvas.height;
    const dw = w * scale;
    const dh = h * scale;
    const x = anchorX - dw / 2 + offX;
    const y = anchorY - dh + offY;
    ctx.drawImage(spriteCanvas, x, y, dw, dh);
  }

  function _frameIdx(t, fps, len) {
    if (!len) return 0;
    const step = 1000 / fps;
    return Math.floor(t / step) % len;
  }

  function _drawGhostsOncePerFrame(ctx, helpers, state) {
    const now = state && state.t ? state.t : performance.now();
    if (assets._lastGhostDrawT === now) return;
    assets._lastGhostDrawT = now;

    if (!assets.ghosts.length) return;

    const scale = CFG.scale();
    const offX = CFG.offX();
    const offY = CFG.offY();

    const alive = [];
    for (const g of assets.ghosts) {
      const age = now - g.t0;
      if (age < 0 || age > g.dur) continue;

      const b = g; // shape-compatible for _worldAnchorScreen
      const p = _worldAnchorScreen(b, helpers);
      if (!p) continue;

      if (!assets.ready) continue;

      let atlas = null;
      let frames = null;
      let fps = CFG.fxFps;
      let idx = 0;

      if (g.type === 'build') {
        atlas = assets.build;
        frames = assets.buildFrames;
        idx = Math.min(frames.length - 1, Math.floor((age / g.dur) * frames.length));
      } else if (g.type === 'sell') {
        atlas = assets.build;
        frames = assets.buildFrames;
        // reverse
        idx = Math.max(0, Math.min(frames.length - 1, (frames.length - 1) - Math.floor((age / g.dur) * frames.length)));
      } else {
        atlas = assets.destr;
        frames = assets.destrFrames;
        idx = Math.min(frames.length - 1, Math.floor((age / g.dur) * frames.length));
      }

      if (!atlas || !frames || !frames.length) {
        alive.push(g);
        continue;
      }

      const frameName = frames[idx] || frames[0];
      const sprite = _getTintedFrameCanvas(g.type, atlas, frameName, g.team);
      if (sprite) _drawCanvasBottomCentered(ctx, sprite, p.x, p.y, scale, offX, offY);

      alive.push(g);
    }

    assets.ghosts = alive;
  }

  function _kickLoadIfNeeded() {
    if (assets.loading || assets.ready) return;
    assets.loading = true;
    assets.lastErr = null;

    const rootsNormal = [
      'asset/sprite/const/normal/barrack',
      'asset/sprite/const/normal/barracks',
      'client/asset/sprite/const/normal/barrack',
      'client/asset/sprite/const/normal/barracks',
    ];
    const rootsBuild = [
      'asset/sprite/const/const_anim/barrack',
      'asset/sprite/const/const_anim/barracks',
      'client/asset/sprite/const/const_anim/barrack',
      'client/asset/sprite/const/const_anim/barracks',
    ];
    const rootsDestr = [
      'asset/sprite/const/destruct/barrack',
      'asset/sprite/const/destruct/barracks',
      'asset/sprite/const/distruct/barrack',
      'asset/sprite/const/distruct/barracks',
      'client/asset/sprite/const/destruct/barrack',
      'client/asset/sprite/const/destruct/barracks',
      'client/asset/sprite/const/distruct/barrack',
      'client/asset/sprite/const/distruct/barracks',
    ];

    const idleFiles = [
      'barrack_idle.json',
      'barracks_idle.json',
      'idle.json',
      'atlas.json',
    ];
    const buildFiles = [
      'barrack_const.json',
      'barracks_const.json',
      'const.json',
      'atlas.json',
    ];
    const destrFiles = [
      'barrack_distruct.json',
      'barracks_distruct.json',
      'barrack_destruct.json',
      'barracks_destruct.json',
      'barrack_destruction.json',
      'barracks_destruction.json',
      'destruct.json',
      'distruct.json',
      'atlas.json',
    ];

    const idleCandidates = _urlCandidates(rootsNormal, idleFiles);
    const buildCandidates = _urlCandidates(rootsBuild, buildFiles);
    const destrCandidates = _urlCandidates(rootsDestr, destrFiles);

    (async () => {
      try {
        const [idle, build, destr] = await Promise.all([
          _loadFirstAtlas(idleCandidates),
          _loadFirstAtlas(buildCandidates),
          _loadFirstAtlas(destrCandidates),
        ]);

        assets.idle = idle;
        assets.build = build;
        assets.destr = destr;

        assets.idleFrames = _chooseFrames(idle, ['barrack_idle', 'barracks_idle', 'idle']);
        assets.buildFrames = _chooseFrames(build, ['barrack_const', 'barracks_const', 'const']);
        assets.destrFrames = _chooseFrames(destr, ['barrack_distruct', 'barracks_distruct', 'distruct', 'destruct']);

        assets.ready = true;
        assets.loading = false;

        log('atlases ready', {
          idle: idle.__srcUrl,
          build: build.__srcUrl,
          destr: destr.__srcUrl,
          idleFrames: assets.idleFrames.length,
          buildFrames: assets.buildFrames.length,
          destrFrames: assets.destrFrames.length,
        });
      } catch (e) {
        assets.lastErr = e;
        assets.loading = false;
        warn('atlas load failed (falling back to prism)', String(e && e.message ? e.message : e));
      }
    })();
  }

  // --- PO.buildings API expected by game.js ---

  // Used by the build menu logic (safe even if ignored elsewhere)
  PO.buildings.tunerKinds = function tunerKinds() {
    return ['barracks'];
  };

  PO.buildings.onPlaced = function onPlaced(b, state) {
    _kickLoadIfNeeded();
    _pushGhost('build', b, state);
  };

  PO.buildings.onSold = function onSold(b, state) {
    _kickLoadIfNeeded();
    _pushGhost('sell', b, state);
  };

  PO.buildings.onDestroyed = function onDestroyed(b, state) {
    _kickLoadIfNeeded();
    _pushGhost('destroy', b, state);
  };

  // Main draw hook called by game.js
  PO.buildings.drawBuilding = function drawBuilding(ent, ctx, cam, helpers, state) {
    // Always draw ghosts first (once per frame)
    try {
      _drawGhostsOncePerFrame(ctx, helpers, state);
    } catch (_) {}

    if (!ent || !_isBarracksKind(ent.kind)) return false;

    _kickLoadIfNeeded();
    if (!assets.ready || !assets.idleFrames.length) return false;

    // Pick idle frame
    const now = state && state.t ? state.t : performance.now();
    const idx = _frameIdx(now, CFG.idleFps, assets.idleFrames.length);
    const frameName = assets.idleFrames[idx] || assets.idleFrames[0];

    const sprite = _getTintedFrameCanvas('idle', assets.idle, frameName, ent.team);
    if (!sprite) return false;

    const p = _worldAnchorScreen(ent, helpers);
    if (!p) return false;

    const scale = CFG.scale();
    const offX = CFG.offX();
    const offY = CFG.offY();

    _drawCanvasBottomCentered(ctx, sprite, p.x, p.y, scale, offX, offY);
    return true;
  };

  if (!assets.booted) {
    assets.booted = true;
    log('boot (defines PO.buildings.drawBuilding / tunerKinds / onPlaced / onSold / onDestroyed)');
    // start loading early, but safely
    _kickLoadIfNeeded();
  }
})();
