// buildings.js patch: Barrack atlases + pivot/scale + sell/destroy FX (v21)
// - Loads 3 TexturePacker atlases for Barrack:
//   normal (idle), construct (build complete / also used reverse for sell), distruct (destroy)
// - Applies pivot from localStorage (or defaults) to ALL barrack frames at runtime
// - Applies per-building render scale (defaults from localStorage or 0.14)
// - Adds "ghost" one-shot animations so sell/destroy can still animate even if entity is removed instantly
//
// Drop-in: replace your existing client/js/buildings.js (or merge the relevant parts).
// Assumes atlas_tp.js provides: loadAtlasTP(), drawFrame(), applyPivotByPrefix().

(function(){
  if (!window.PO) window.PO = {};
  const PO = window.PO;

  // ---------- user-tunable defaults ----------
  // If you use the pivot tuner, you can also just set localStorage keys:
  //   barrack_pivot_x / barrack_pivot_y / barrack_scale
  const DEFAULT_BARRACK_PIVOT = { x: 0.4955, y: 0.4370 };
  const DEFAULT_BARRACK_SCALE = 0.14;

  // Animation speeds (frames per second)
  const BARRACK_CONSTRUCT_FPS = 12;
  const BARRACK_DISTRUCT_FPS  = 12;

  // ---------- helpers ----------
  function safeNum(v){ const n = Number(v); return Number.isFinite(n) ? n : null; }

  function readPivot(){
    try{
      const x = safeNum(localStorage.getItem('barrack_pivot_x'));
      const y = safeNum(localStorage.getItem('barrack_pivot_y'));
      if (x !== null && y !== null) return { x, y };
    }catch(_){/* ignore */}
    return { ...DEFAULT_BARRACK_PIVOT };
  }

  function readScale(){
    try{
      const s = safeNum(localStorage.getItem('barrack_scale'));
      if (s !== null && s > 0) return s;
    }catch(_){/* ignore */}
    return DEFAULT_BARRACK_SCALE;
  }

  function nowSec(state){
    const t = state && (state.t ?? state.time ?? state.now ?? state.nowSec ?? null);
    if (typeof t === 'number' && isFinite(t)) return t;
    return performance.now() / 1000;
  }

  function clamp01(x){ return Math.max(0, Math.min(1, x)); }

  function isBarrack(ent){
    if (!ent) return false;
    const k = (ent.kind ?? ent.type ?? ent.name ?? ent.id ?? '').toString().toLowerCase();
    return k === 'barrack' || k === 'barracks' || k === 'rax' || k === 'barrack1' || ent._isBarrack === true;
  }

  // Convert tile coords -> world coords (center-ish)
  function entWorld(ent, helpers){
    // Prefer helper if exists
    if (helpers && typeof helpers.buildingWorldXY === 'function') {
      const p = helpers.buildingWorldXY(ent);
      if (p && isFinite(p.x) && isFinite(p.y)) return p;
    }

    // Common fields
    const tx = ent.tx ?? ent.x ?? ent.tileX ?? 0;
    const ty = ent.ty ?? ent.y ?? ent.tileY ?? 0;

    // Tile sizes (fallback)
    const tileW = (PO.cfg && PO.cfg.tileW) || 64;
    const tileH = (PO.cfg && PO.cfg.tileH) || 32;

    // Isometric-ish projection: many engines already store world coords,
    // but if you're giving tile coords, this makes it at least consistent.
    const wx = (ent.wx ?? ent.worldX ?? (tx - ty) * (tileW/2))
    const wy = (ent.wy ?? ent.worldY ?? (tx + ty) * (tileH/2))

    return { x: wx, y: wy };
  }

  // ---------- Barrack atlas loader state ----------
  const S = {
    ver: 'v21',
    loaded: { normal:false, construct:false, distruct:false },
    atlas : { normal:null,  construct:null,  distruct:null },
    frames: { normal:[],    construct:[],    distruct:[] },
    dur: { construct: 1.5, distruct: 1.5, sell: 1.5 },
    promises: { normal:null, construct:null, distruct:null },
    pivotApplied: { normal:false, construct:false, distruct:false },

    ghosts: [],
    _ghostDrawStamp: -1,

    // Optional: expose runtime config
    cfg: {
      get pivot(){ return readPivot(); },
      get scale(){ return readScale(); },
    },
  };

  function setPaths(){
    // Your deployed structure (from your screenshots)
    return {
      normal:   '/asset/sprite/const/normal/barrack/barrack_idle.json',
      construct:'/asset/sprite/const/const_anim/barrack/barrack_const.json',
      distruct: '/asset/sprite/const/distruct/barrack/barrack_distruct.json',
    };
  }

  async function ensureAtlas(kind){
    if (S.loaded[kind]) return true;
    if (S.promises[kind]) { await S.promises[kind]; return S.loaded[kind]; }

    const paths = setPaths();
    const url = paths[kind];
    if (!url) return false;

    S.promises[kind] = (async () => {
      try{
        const atlas = await PO.atlasTP.loadAtlasTP(url);
        S.atlas[kind] = atlas;
        S.loaded[kind] = true;

        // Cache frame names with numeric suffix sorting.
        if (kind === 'normal') {
          S.frames.normal = PO.atlasTP.listFramesByPrefix(atlas, 'barrack_idle', { sort: true });
        } else if (kind === 'construct') {
          S.frames.construct = PO.atlasTP.listFramesByPrefix(atlas, 'barrack_con_complete_', { sort: true });
          S.dur.construct = (S.frames.construct.length || 1) / BARRACK_CONSTRUCT_FPS;
          S.dur.sell = S.dur.construct;
        } else if (kind === 'distruct') {
          S.frames.distruct = PO.atlasTP.listFramesByPrefix(atlas, 'barrack_dist', { sort: true });
          S.dur.distruct = (S.frames.distruct.length || 1) / BARRACK_DISTRUCT_FPS;
        }

        // Apply pivot to all barrack frames (runtime, so you don't need to bake it into JSON)
        try{
          const piv = readPivot();
          PO.atlasTP.applyPivotByPrefix(atlas, 'barrack_', piv.x, piv.y);
          S.pivotApplied[kind] = true;
        }catch(_){ /* ignore */ }
      }catch(e){
        console.error('[barrack:'+S.ver+'] failed to load '+kind+' atlas', url, e);
        S.loaded[kind] = false;
      }
    })();

    await S.promises[kind];
    return S.loaded[kind];
  }

  function kickLoad(){
    // Start all loads ASAP (do not await)
    ensureAtlas('normal');
    ensureAtlas('construct');
    ensureAtlas('distruct');
  }

  // ---------- animation selection ----------
  function kindFor(ent, state){
    // Destroy flags (try lots of names to match your codebase)
    const hp = (ent.hp ?? ent.HP ?? ent.health ?? ent.life ?? null);
    const dead = ent.dead || ent.destroyed || ent.isDead || ent.isDestroyed || ent._dead || ent._destroyed;
    const st = (ent.state ?? ent.mode ?? ent.phase ?? '').toString().toLowerCase();

    const now = nowSec(state);

    // Auto-expire our "first-seen" construct FX without depending on your build system.
    if (ent._autoConstructFx && typeof ent._constructStart === 'number') {
      if ((now - ent._constructStart) >= (S.dur.construct || 1.5)) {
        ent._constructing = false;
        ent._autoConstructFx = false;
      }
    }

    if (dead || st.includes('destroy') || st.includes('dead') || st.includes('distruct') || (typeof hp === 'number' && hp <= 0)) {
      return 'distruct';
    }

    // Sell flags
    const selling = ent._selling || ent.selling || ent.isSelling || ent.sell || ent.toSell || ent.wantSell || ent.pendingSell;
    if (selling || st.includes('sell') || st.includes('refund')) {
      return 'sell';
    }

    // Constructing flags
    const prog = (ent.progress ?? ent.buildProgress ?? ent.buildProg ?? ent.constructProgress ?? ent.constructProg ?? null);
    const constructing = ent._constructing || ent.constructing || ent.isConstructing || st.includes('construct') || st.includes('build');
    if ((typeof prog === 'number' && prog < 1) || constructing) {
      return 'construct';
    }

    return 'normal';
  }

  function frameAt(kind, tSec){
    const frames = S.frames[kind] || [];
    if (!frames.length) return null;

    if (kind === 'normal') {
      return frames[0];
    }

    const fps = (kind === 'distruct') ? BARRACK_DISTRUCT_FPS : BARRACK_CONSTRUCT_FPS;
    const idx = Math.floor(Math.max(0, tSec) * fps);

    if (kind === 'construct') {
      // Play once then hold last
      return frames[Math.min(idx, frames.length - 1)];
    }

    if (kind === 'distruct') {
      // Play once then hold last
      return frames[Math.min(idx, frames.length - 1)];
    }

    if (kind === 'sell') {
      // Reverse of construct
      const r = Math.min(idx, frames.length - 1);
      return frames[Math.max(0, frames.length - 1 - r)];
    }

    return frames[0];
  }

  function durSec(kind){
    const frames = S.frames[kind] || [];
    if (!frames.length) return 0.5;
    const fps = (kind === 'distruct') ? BARRACK_DISTRUCT_FPS : BARRACK_CONSTRUCT_FPS;
    return (frames.length / fps) + 0.05;
  }

  // ---------- ghost FX (sell/destroy even if entity is removed instantly) ----------
  function spawnGhost(ent, fxKind, state, helpers){
    if (!ent || !isBarrack(ent)) return;

    const w = entWorld(ent, helpers);
    const start = nowSec(state);

    // Deduplicate: same ent id + same fx kind within a short window
    const id = ent.id ?? ent.uid ?? ent.guid ?? ent._id ?? null;
    const key = String(id ?? (w.x+','+w.y)) + ':' + fxKind;

    // If a ghost with same key started within 0.1s, ignore
    for (let i = S.ghosts.length - 1; i >= 0; i--) {
      const g = S.ghosts[i];
      if (g.key === key && Math.abs(g.start - start) < 0.1) return;
    }

    // Map FX kind to atlas kind
    const atlasKind = (fxKind === 'sell') ? 'construct' : (fxKind === 'distruct') ? 'distruct' : fxKind;

    S.ghosts.push({
      key,
      fxKind,
      atlasKind,
      x: w.x,
      y: w.y,
      start,
      end: start + durSec(fxKind === 'sell' ? 'construct' : atlasKind),
    });
  }

  function drawGhostsOncePerFrame(ctx, cam, helpers, state){
    // Draw ghosts at most once per visual frame.
    const stamp = Math.floor(nowSec(state) * 60);
    if (S._ghostDrawStamp === stamp) return;
    S._ghostDrawStamp = stamp;

    if (!S.ghosts.length) return;

    // Need atlases loaded
    if (!S.loaded.construct) ensureAtlas('construct');
    if (!S.loaded.distruct) ensureAtlas('distruct');

    const z = (cam && cam.z) ? cam.z : (PO.cam && PO.cam.z) ? PO.cam.z : 1;
    const scale = readScale() * z;

    const t = nowSec(state);

    // Draw and filter
    const out = [];
    for (const g of S.ghosts) {
      if (t > g.end) continue;

      const atlas = S.atlas[g.atlasKind];
      if (!atlas) { out.push(g); continue; }

      const dt = t - g.start;
      const frame = (g.fxKind === 'sell')
        ? frameAt('sell', dt)
        : frameAt(g.atlasKind, dt);

      if (!frame) { out.push(g); continue; }

      // Helpers may have world->screen transform
      let sx = g.x, sy = g.y;
      if (helpers && typeof helpers.worldToScreen === 'function') {
        const p = helpers.worldToScreen(g.x, g.y);
        if (p && isFinite(p.x) && isFinite(p.y)) { sx = p.x; sy = p.y; }
      }

      PO.atlasTP.drawFrame(ctx, atlas, frame, sx, sy, { scale });
      out.push(g);
    }

    S.ghosts = out;
  }

  // ---------- draw (Barrack only) ----------
  function drawBarrack(ent, state, ctx, cam, helpers){
    // Make sure ghosts render (once per frame)
    drawGhostsOncePerFrame(ctx, cam, helpers, state);

    // Auto play build-complete animation once when a barrack is first seen
    if (!ent._barrackSeen) {
      ent._barrackSeen = true;
      const hp = (ent.hp ?? ent.HP ?? ent.health ?? ent.life ?? 1);
      const selling = !!(ent._selling || ent.selling || ent.isSelling || ent.sell || ent.toSell || ent.pendingSell);
      if (hp > 0 && !selling) {
        ent._constructing = true;
        ent._autoConstructFx = true;
        ent._constructStart = nowSec(state);
      }
    }

    const kind = kindFor(ent, state);

    // Ensure needed atlases
    const needNormal = ensureAtlas('normal');
    const needConst  = ensureAtlas('construct');
    const needDist   = ensureAtlas('distruct');

    // If any are missing, do not draw fallback box. Just skip drawing this frame.
    if (!S.loaded.normal || !S.loaded.construct || !S.loaded.distruct) {
      return true; // handled
    }

    const z = (cam && cam.z) ? cam.z : (PO.cam && PO.cam.z) ? PO.cam.z : 1;
    const scale = readScale() * z;

    // Choose atlas for this kind
    let atlasKind = 'normal';
    if (kind === 'construct' || kind === 'sell') atlasKind = 'construct';
    if (kind === 'distruct') atlasKind = 'distruct';

    const atlas = S.atlas[atlasKind];
    if (!atlas) return true;

    // Time base
    const t = nowSec(state);

    // Start times stored per-entity to make one-shot deterministic
    if (kind === 'construct') {
      if (!ent._constructStart) ent._constructStart = t;
    } else {
      ent._constructStart = null;
    }

    if (kind === 'distruct') {
      if (!ent._distructStart) ent._distructStart = t;
    } else {
      ent._distructStart = null;
    }

    if (kind === 'sell') {
      if (!ent._sellStart) ent._sellStart = t;
    } else {
      ent._sellStart = null;
    }

    const start = (kind === 'construct') ? ent._constructStart
               : (kind === 'distruct') ? ent._distructStart
               : (kind === 'sell')     ? ent._sellStart
               : t;

    const dt = Math.max(0, t - (start || t));

    const frame = (kind === 'sell')
      ? frameAt('sell', dt)
      : frameAt(atlasKind, dt);

    if (!frame) return true;

    // World->screen
    let w = entWorld(ent, helpers);
    let sx = w.x, sy = w.y;
    if (helpers && typeof helpers.worldToScreen === 'function') {
      const p = helpers.worldToScreen(w.x, w.y);
      if (p && isFinite(p.x) && isFinite(p.y)) { sx = p.x; sy = p.y; }
    }

    // Draw with atlas pivot (applied by applyPivotByPrefix)
    PO.atlasTP.drawFrame(ctx, atlas, frame, sx, sy, { scale });

    return true;
  }

  // ---------- patch install ----------
  function install(){
    if (!PO.atlasTP || !PO.atlasTP.loadAtlasTP || !PO.atlasTP.drawFrame) {
      console.warn('[barrack:'+S.ver+'] atlas_tp.js not ready yet; retrying...');
      setTimeout(install, 250);
      return;
    }

    if (!PO.buildings) PO.buildings = {};

    // Wrap existing drawBuilding so only barrack uses atlases; others remain unchanged
    const prevDrawBuilding = PO.buildings.drawBuilding;
    PO.buildings.drawBuilding = function(...args){
      const { ent, state, ctx, cam, helpers } = getArgs(args);

      // Always draw ghosts once per frame even if no barrack is drawn this call
      if (ctx) drawGhostsOncePerFrame(ctx, cam, helpers, state);

      if (ent && isBarrack(ent) && ctx) {
        const handled = drawBarrack(ent, state, ctx, cam, helpers);
        if (handled) return;
      }

      if (typeof prevDrawBuilding === 'function') {
        return prevDrawBuilding.apply(this, args);
      }
    };

    // Add best-effort hooks to spawn ghosts on sell/remove calls
    bestEffortHooks();

    kickLoad();

    console.log('[barrack:'+S.ver+'] installed. pivot=', readPivot(), 'scale=', readScale());
  }

  function getArgs(args){
    // Try to discover the typical signature:
    // drawBuilding(ent, state, ctx, cam, helpers)
    // or drawBuilding(ctx, cam, ent, state, helpers)
    let ent = null, state = null, ctx = null, cam = null, helpers = null;

    for (const a of args) {
      if (!ctx && a && a.canvas && a.fillRect && a.drawImage) ctx = a;
      else if (!cam && a && typeof a === 'object' && ('z' in a) && ('x' in a) && ('y' in a)) cam = a;
      else if (!helpers && a && typeof a === 'object' && (typeof a.worldToScreen === 'function' || typeof a.buildingWorldXY === 'function')) helpers = a;
    }

    // Entity likely has hp/owner/kind
    for (const a of args) {
      if (ent) break;
      if (a && typeof a === 'object' && (('hp' in a) || ('kind' in a) || ('type' in a) || ('owner' in a) || ('team' in a))) {
        // avoid grabbing ctx/cam/helpers
        if (a !== ctx && a !== cam && a !== helpers) ent = a;
      }
    }

    // State likely has t/time/dt
    for (const a of args) {
      if (state) break;
      if (a && typeof a === 'object' && (('t' in a) || ('time' in a) || ('dt' in a) || ('now' in a) || ('nowSec' in a))) {
        if (a !== ctx && a !== cam && a !== helpers && a !== ent) state = a;
      }
    }

    return { ent, state, ctx, cam, helpers };
  }

  function wrapFn(obj, name, fn){
    if (!obj || typeof obj[name] !== 'function') return false;
    const orig = obj[name];
    if (orig._barrackWrapped) return true;
    const wrapped = function(...args){ return fn.call(this, orig, args); };
    wrapped._barrackWrapped = true;
    obj[name] = wrapped;
    return true;
  }

  function bestEffortHooks(){
    // Hook sell paths
    const sellNames = ['sellBuilding','sellSelected','sell','sellCurrent','onSell','doSell'];
    const killNames = ['destroyBuilding','killBuilding','removeBuilding','removeEntity','deleteBuilding','onBuildingDestroyed','destroy','kill'];

    const targets = [];
    if (PO.buildings) targets.push(PO.buildings);
    if (PO.ui) targets.push(PO.ui);
    if (PO.game) targets.push(PO.game);

    for (const t of targets) {
      for (const n of sellNames) {
        wrapFn(t, n, (orig, args) => {
          const ent = args.find(a => a && typeof a === 'object' && isBarrack(a));
          const state = null;
          if (ent) spawnGhost(ent, 'sell', state, null);
          return orig.apply(this, args);
        });
      }

      for (const n of killNames) {
        wrapFn(t, n, (orig, args) => {
          // If args include reason string, try to classify
          const reason = args.find(a => typeof a === 'string');
          const ent = args.find(a => a && typeof a === 'object' && isBarrack(a));
          if (ent) {
            const r = (reason || '').toLowerCase();
            if (r.includes('sell')) spawnGhost(ent, 'sell', null, null);
            else if (r.includes('destroy') || r.includes('dead') || r.includes('kill')) spawnGhost(ent, 'distruct', null, null);
            else {
              // default: treat as destroy only if hp<=0
              const hp = (ent.hp ?? ent.health ?? null);
              if (typeof hp === 'number' && hp <= 0) spawnGhost(ent, 'distruct', null, null);
            }
          }
          return orig.apply(this, args);
        });
      }
    }

    // DOM fallback for the Sell button (Korean label: "매각")
    try{
      document.addEventListener('click', (ev) => {
        const btn = ev.target && ev.target.closest ? ev.target.closest('button') : null;
        if (!btn) return;
        const txt = (btn.textContent || '').trim();
        if (txt !== '매각') return;

        // Try common selected references
        const ent = PO.selected || PO.sel || (PO.ui && (PO.ui.selected || PO.ui.sel || PO.ui.currentSelected)) || (PO.game && (PO.game.selected || PO.game.sel));
        if (ent && isBarrack(ent)) spawnGhost(ent, 'sell', null, null);
      }, true);
    }catch(_){/* ignore */}
  }

  // Install when DOM is ready-ish
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', install);
  } else {
    install();
  }

})();
