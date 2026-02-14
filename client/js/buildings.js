/*
  buildings_v17.js
  Barracks renderer (TexturePacker JSON multipack).

  Key fixes vs v16:
  - No global can/cam/state/TILE_* reads (all passed in).
  - Correct path: /asset/sprite/const/distruct/... (not /destruct).
  - Atlas has no frameNames; we build frame lists via listFramesByPrefix.
  - Draw uses bottom-center pivot so the building sits on the ground.
*/
(() => {
  const PO = (window.PO = window.PO || {});
  const VER = 'v17';
  const KEY = 'barrack';

  if (!PO.atlasTP) {
    console.warn(`[${KEY}:${VER}] PO.atlasTP missing. Load atlas_tp.js before buildings.js`);
    return;
  }

  // ---- tiny helpers ----
  const _once = new Set();
  function logOnce(tag, ...args) {
    const k = `${tag}`;
    if (_once.has(k)) return;
    _once.add(k);
    console.log(...args);
  }

  function nowSec(state) {
    if (state && typeof state.t === 'number') return state.t;
    return performance.now() / 1000;
  }

  // ---- atlas cache ----
  const A = {
    promise: null,
    ready: false,
    failed: false,
    atlases: { normal: null, construct: null, distruct: null },
    frames: { normal: [], construct: [], distruct: [] },
  };

  function _allFrameNames(atlas) {
    try {
      if (!atlas || !atlas.frames) return [];
      return Array.from(atlas.frames.keys());
    } catch (_) {
      return [];
    }
  }

  function _prepAtlas(kind, atlas) {
    if (!atlas) return;

    let prefix = '';
    if (kind === 'normal') prefix = 'barrack_idle';
    if (kind === 'construct') prefix = 'barrack_con';
    if (kind === 'distruct') prefix = 'barrack_distruction';

    let list = PO.atlasTP.listFramesByPrefix(atlas, prefix, { sortNumeric: true });
    if (!list || !list.length) list = _allFrameNames(atlas);

    A.frames[kind] = list;

    // bottom-center pivot for all frames of this atlas
    try {
      PO.atlasTP.applyPivotToFrames(atlas, list, { x: 0.5, y: 1.0 });
    } catch (_) {
      // not fatal
    }
  }

  function ensureLoaded() {
    if (A.promise) return A.promise;

    const urls = {
      normal: '/asset/sprite/const/normal/barrack/barrack_idle.json',
      construct: '/asset/sprite/const/const_anim/barrack/barrack_const.json',
      distruct: '/asset/sprite/const/distruct/barrack/barrack_distruct.json',
    };

    console.log(`[${KEY}:${VER}] loading atlases...`);
    console.log(`[${KEY}:${VER}] normal   ${urls.normal}`);
    console.log(`[${KEY}:${VER}] construct ${urls.construct}`);
    console.log(`[${KEY}:${VER}] distruct  ${urls.distruct}`);

    A.promise = Promise.allSettled([
      PO.atlasTP.loadTPAtlasMulti(urls.normal),
      PO.atlasTP.loadTPAtlasMulti(urls.construct),
      PO.atlasTP.loadTPAtlasMulti(urls.distruct),
    ]).then((res) => {
      const [rN, rC, rD] = res;
      A.atlases.normal = rN.status === 'fulfilled' ? rN.value : null;
      A.atlases.construct = rC.status === 'fulfilled' ? rC.value : null;
      A.atlases.distruct = rD.status === 'fulfilled' ? rD.value : null;

      _prepAtlas('normal', A.atlases.normal);
      _prepAtlas('construct', A.atlases.construct);
      _prepAtlas('distruct', A.atlases.distruct);

      // Only normal is required to show something.
      A.ready = !!A.atlases.normal && A.frames.normal.length > 0;
      A.failed = !A.ready;

      if (A.ready) {
        console.log(
          `[${KEY}:${VER}] READY. frames: normal=${A.frames.normal.length}, construct=${A.frames.construct.length}, distruct=${A.frames.distruct.length}`
        );
      } else {
        console.warn(`[${KEY}:${VER}] FAILED to load normal atlas. (If the JSON URL shows the game screen, you are getting index.html instead of JSON)`);
      }

      return A;
    });

    return A.promise;
  }

  // ---- animation selection ----
  function _kindFor(ent) {
    // death takes priority
    if (ent && (ent.hp <= 0 || ent.alive === false || ent.dead === true)) return 'distruct';
    // construction flag (optional)
    if (ent && (ent._constructing || ent.constructing || (typeof ent.buildProgress === 'number' && ent.buildProgress < 1))) return 'construct';
    return 'normal';
  }

  function _pickFrame(kind, ent, state) {
    const list = A.frames[kind] || [];
    if (!list.length) return null;

    const t = nowSec(state);

    // play-once for distruct
    if (kind === 'distruct') {
      const fps = 14;
      if (ent._barrackDeadAt == null) ent._barrackDeadAt = t;
      const dt = Math.max(0, t - ent._barrackDeadAt);
      const idx = Math.min(list.length - 1, Math.floor(dt * fps));
      return list[idx];
    }

    const fps = kind === 'construct' ? 12 : 8;
    const idx = Math.floor(t * fps) % list.length;
    return list[idx];
  }

  function drawBarrack(ent, ctx, cam, helpers, state) {
    // fire loading once
    if (!A.promise) ensureLoaded();

    const kind = _kindFor(ent);
    const atlas = A.atlases[kind];

    if (!atlas) return false; // let prism fallback draw

    const frameName = _pickFrame(kind, ent, state);
    if (!frameName) return false;

    const s = helpers.worldToScreen(ent.x, ent.y);
    const sc = cam && typeof cam.zoom === 'number' ? cam.zoom : 1;

    // bottom-center
    PO.atlasTP.drawFrame(ctx, atlas, frameName, s.x, s.y, {
      scale: sc,
      pivotX: 0.5,
      pivotY: 1.0,
      alpha: 1,
      snap: true,
    });

    return true;
  }

  // ---- plugin hook ----
  PO.buildings = PO.buildings || {};

  PO.buildings.drawBuilding = function (ent, ctx, cam, helpers, state) {
    try {
      if (!ent) return false;
      const k = String(ent.kind || '').toLowerCase();
      if (k !== 'barrack' && k !== 'barracks') return false; // only intercept barracks
      return drawBarrack(ent, ctx, cam, helpers, state);
    } catch (e) {
      logOnce('draw_err', `[${KEY}:${VER}] draw error (logged once):`, e);
      return false;
    }
  };

  console.log(`[${KEY}:${VER}] patch loaded. (Barracks only)`);
})();
