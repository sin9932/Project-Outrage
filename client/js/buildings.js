// buildings_v18.js - Barrack renderer patch (sync draw + robust load/retry + path fallbacks)
// Drop-in replacement for your client/js/buildings.js (or whichever file defines PO.buildings.drawBuilding)

(() => {
  'use strict';

  const KEY = 'barrack';
  const VER = 'v18';

  // --- PATHS (only these should exist) ---
  // Your repo: client/asset/sprite/const/
  //   normal/barrack/barrack_idle.json
  //   const_anim/barrack/barrack_const.json
  //   distruct/barrack/barrack_distruct.json
  // NOTE: Cloudflare Pages returns index.html (HTML) for missing files (status 200). We detect that.
  let ROOT = '/asset/sprite/const';
  // Some deployments serve from repo root where assets live under /client/asset/...
  // Detect once at runtime so JSON/PNG requests don't get rewritten to index.html.
  async function detectRootOnce() {
    if (detectRootOnce._done) return ROOT;
    detectRootOnce._done = true;
    const testPaths = [
      '/asset/sprite/const',
      '/client/asset/sprite/const',
      'asset/sprite/const'
    ];
    const testRel = '/normal/barrack/barrack_idle.json';
    for (const base of testPaths) {
      const url = (base.endsWith('/') ? base.slice(0,-1) : base) + testRel;
      try {
        const r = await fetch(url, { cache: 'no-store' });
        const t = await r.text();
        if (r.ok && !looksLikeHTML(t) && t.trimStart().startsWith('{')) {
          ROOT = base.startsWith('/') ? base : '/' + base;
          break;
        }
      } catch {}
    }
    return ROOT;
  }
  const URLS = {
    normal: [`${ROOT}/normal/barrack/barrack_idle.json`],
    construct: [`${ROOT}/const_anim/barrack/barrack_const.json`],
    // try new correct path first, then the old misspelled folder (destruct) just in case old builds are cached
    distruct: [`${ROOT}/distruct/barrack/barrack_distruct.json`, `${ROOT}/destruct/barrack/barrack_distruct.json`],
  };

  // --- state ---
  const S = {
    atlases: { normal: null, construct: null, distruct: null },
    frames: { normal: [], construct: [], distruct: [] },
    loading: { normal: false, construct: false, distruct: false },
    ready: { normal: false, construct: false, distruct: false },
    tries: { normal: 0, construct: 0, distruct: 0 },
    maxTries: 25,
    nextRetryMs: 200,
    started: false,
    logged: new Set(),
  };

  const PO = (window.PO = window.PO || {});
  PO.buildings = PO.buildings || {};

  function logOnce(id, ...args) {
    if (S.logged.has(id)) return;
    S.logged.add(id);
    console.log(...args);
  }

  function warnOnce(id, ...args) {
    if (S.logged.has(id)) return;
    S.logged.add(id);
    console.warn(...args);
  }

  function errOnce(id, ...args) {
    if (S.logged.has(id)) return;
    S.logged.add(id);
    console.error(...args);
  }

  function hasAtlasTP() {
    return !!(PO && PO.atlasTP && typeof PO.atlasTP.loadTPAtlasMulti === 'function' && typeof PO.atlasTP.drawFrame === 'function');
  }

  function nowSec(state) {
    if (state && typeof state.t === 'number') return state.t;
    if (state && typeof state.time === 'number') return state.time;
    if (state && typeof state.now === 'number') return state.now;
    return performance.now() / 1000;
  }

  // Try to detect HTML fallback quickly without touching atlas_tp internals.
  async function looksLikeHTML(url) {
    try {
      const res = await fetch(url, { cache: 'no-store' });
      const ct = (res.headers.get('content-type') || '').toLowerCase();
      if (ct.includes('text/html')) return true;
      // If content-type lies, peek the first bytes.
      const txt = await res.text();
      const head = txt.slice(0, 80).trimStart().toLowerCase();
      return head.startsWith('<!doctype') || head.startsWith('<html') || head.includes('<head');
    } catch {
      return false;
    }
  }

  async function loadFirstWorking(kind) {
    const candidates = URLS[kind];
    const errors = [];

    for (const url of candidates) {
      // If it is HTML fallback, skip immediately and record.
      if (await looksLikeHTML(url)) {
        errors.push({ url, reason: 'got HTML (index.html fallback)' });
        continue;
      }
      try {
        const atlas = await PO.atlasTP.loadTPAtlasMulti(url);
        return { atlas, url, errors };
      } catch (e) {
        errors.push({ url, reason: (e && e.message) ? e.message : String(e) });
      }
    }

    return { atlas: null, url: null, errors };
  }

  function scheduleRetry() {
    if (S._retryTimer) return;
    S._retryTimer = setTimeout(() => {
      S._retryTimer = null;
      kickLoad();
    }, S.nextRetryMs);
    S.nextRetryMs = Math.min(2000, Math.floor(S.nextRetryMs * 1.35));
  }

  async function ensureKind(kind) {
    if (S.ready[kind]) return true;
    if (S.loading[kind]) return false;

    if (!hasAtlasTP()) {
      // atlas_tp not ready yet: do NOT mark as failed. just retry later.
      scheduleRetry();
      return false;
    }

    if (S.tries[kind] >= S.maxTries) {
      warnOnce(`${kind}_giveup`, `[${KEY}:${VER}] giving up loading '${kind}' after ${S.tries[kind]} tries.`);
      return false;
    }

    S.loading[kind] = true;
    S.tries[kind]++;

    try {
      const { atlas, url, errors } = await loadFirstWorking(kind);
      if (!atlas) {
        // Print useful diagnostics once per kind.
        if (errors && errors.length) {
          errOnce(
            `${kind}_errors`,
            `[${KEY}:${VER}] '${kind}' atlas load failed. Tried:`,
            errors
          );
        } else {
          errOnce(`${kind}_errors`, `[${KEY}:${VER}] '${kind}' atlas load failed (no details).`);
        }
        scheduleRetry();
        return false;
      }

      S.atlases[kind] = atlas;
      S.frames[kind] = PO.atlasTP.listFramesByPrefix(atlas, kind === 'construct' ? 'barrack_con_complete_' : (kind === 'distruct' ? 'barrack_distruction_' : 'barrack_idle'));

      // normal atlas sometimes includes a single "barrack_dist.png" frame that is the best static idle.
      if (kind === 'normal') {
        const dist = 'barrack_dist.png';
        if (atlas.frames && atlas.frames[dist] && !S.frames.normal.includes(dist)) {
          S.frames.normal.unshift(dist);
        }
      }

      // Apply bottom-center pivot to all barrack frames
      try {
        PO.atlasTP.applyPivotByPrefix(atlas, 'barrack_', 0.5, 1.0);
      } catch {}

      S.ready[kind] = true;
      logOnce(`${kind}_ok`, `[${KEY}:${VER}] loaded '${kind}' atlas from ${url}`);
      return true;
    } finally {
      S.loading[kind] = false;
    }
  }

  function kickLoad() {
    if (!S.started) {
      S.started = true;
      console.log(`[${KEY}:${VER}] patch loaded. (Barrack only) trying to load atlases...`);
    }

    // fire and forget; retries are scheduled internally
    ensureKind('normal');
    ensureKind('construct');
    ensureKind('distruct');
  }

  // --- animation selection ---
  function kindFor(ent) {
    if (!ent) return 'normal';
    if (ent.hp <= 0 || ent.alive === false || ent.dead === true) return 'distruct';
    if (ent._constructing || ent.constructing || (typeof ent.buildProgress === 'number' && ent.buildProgress < 1)) return 'construct';
    return 'normal';
  }

  function pickFrame(kind, ent, state) {
    const list = S.frames[kind] || [];
    if (!list.length) return null;

    const t = nowSec(state);

    if (kind === 'distruct') {
      const fps = 14;
      if (ent && ent._barrackDeadAt == null) ent._barrackDeadAt = t;
      const dt = Math.max(0, t - (ent ? ent._barrackDeadAt : t));
      const idx = Math.min(list.length - 1, Math.floor(dt * fps));
      return list[idx];
    }

    const fps = kind === 'construct' ? 12 : 8;
    const idx = Math.floor(t * fps) % list.length;
    return list[idx];
  }

  function getCtxFromArgs(args) {
    for (const a of args) {
      if (a && typeof a.drawImage === 'function') return a;
    }
    return null;
  }

  function getEntFromArgs(args) {
    for (const a of args) {
      if (!a || typeof a !== 'object') continue;
      if (typeof a.drawImage === 'function') continue; // ctx
      const k = (a.kind || a.type || a.name);
      if (k) return a;
    }
    return null;
  }

  function getCamFromArgs(args) {
    for (const a of args) {
      if (!a || typeof a !== 'object') continue;
      if (typeof a.zoom === 'number' && (a.x != null || a.y != null || a.scrollX != null)) return a;
    }
    return PO.camera || null;
  }

  function getHelpersFromArgs(args) {
    for (const a of args) {
      if (!a || typeof a !== 'object') continue;
      if (typeof a.worldToScreen === 'function') return a;
    }
    if (PO.world && typeof PO.world.worldToScreen === 'function') {
      return { worldToScreen: PO.world.worldToScreen.bind(PO.world) };
    }
    if (PO.iso && typeof PO.iso.worldToScreen === 'function') {
      return { worldToScreen: PO.iso.worldToScreen.bind(PO.iso) };
    }
    return null;
  }

  function getStateFromArgs(args) {
    for (const a of args) {
      if (!a || typeof a !== 'object') continue;
      if (typeof a.t === 'number' || typeof a.time === 'number' || typeof a.now === 'number') return a;
    }
    return null;
  }

  function drawBarrack(ent, ctx, cam, helpers, state) {
    // Start loading in the background as soon as we ever try to draw a barrack.
    if (!S.started) kickLoad();

    const kind = kindFor(ent);
    const atlas = S.atlases[kind];
    if (!atlas) return false; // let fallback box draw

    const frameName = pickFrame(kind, ent, state);
    if (!frameName) return false;

    const w2s = helpers && typeof helpers.worldToScreen === 'function' ? helpers.worldToScreen : null;
    if (!w2s) {
      warnOnce('no_w2s', `[${KEY}:${VER}] no worldToScreen() found. Barrack will fallback to box.`);
      return false;
    }

    const pos = w2s(ent.x, ent.y);

    // Zoom
    const z = cam && typeof cam.zoom === 'number' ? cam.zoom : 1;

    // Draw. Pivot bottom-center (0.5, 1.0) so it sits on the tile.
    PO.atlasTP.drawFrame(ctx, atlas, frameName, pos.x, pos.y, {
      scale: z,
      pivotX: 0.5,
      pivotY: 1.0,
      alpha: 1,
      snap: true,
    });

    return true;
  }

  // --- hook into existing drawBuilding without breaking other buildings ---
  const prevDrawBuilding = PO.buildings.drawBuilding;

  PO.buildings.drawBuilding = function (...args) {
    try {
      const ctx = getCtxFromArgs(args);
      const ent = getEntFromArgs(args);
      const cam = getCamFromArgs(args);
      const helpers = getHelpersFromArgs(args);
      const state = getStateFromArgs(args);

      if (ent) {
        const k = String(ent.kind || ent.type || '').toLowerCase();
        if (k === 'barrack' || k === 'barracks') {
          if (ctx && drawBarrack(ent, ctx, cam, helpers, state)) return true;
          // If we failed to draw (atlas not ready), fall through to previous drawer (it might draw a placeholder box).
        }
      }

      return typeof prevDrawBuilding === 'function' ? prevDrawBuilding.apply(this, args) : false;
    } catch (e) {
      errOnce('drawBuilding_err', `[${KEY}:${VER}] drawBuilding wrapper error (logged once):`, e);
      return typeof prevDrawBuilding === 'function' ? prevDrawBuilding.apply(this, args) : false;
    }
  };

  // Optional: manual reload from console
  PO.buildings.reloadBarrackAtlases = function () {
    S.atlases.normal = S.atlases.construct = S.atlases.distruct = null;
    S.frames.normal = []; S.frames.construct = []; S.frames.distruct = [];
    S.ready.normal = S.ready.construct = S.ready.distruct = false;
    S.loading.normal = S.loading.construct = S.loading.distruct = false;
    S.tries.normal = S.tries.construct = S.tries.distruct = 0;
    S.nextRetryMs = 200;
    S.logged.clear();
    S.started = false;
    kickLoad();
  };

  // Kick once (but it will retry if atlas_tp isn't ready yet)
  kickLoad();
})();
