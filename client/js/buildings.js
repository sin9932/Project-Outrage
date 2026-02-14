/* buildings.js (barracks sprite hook) v16
   - Atlas URL auto-detect: tries multiple likely paths until one returns valid JSON
   - Avoids "Unexpected token '<'" when your deploy rewrites missing JSON to index.html
   - Sync draw entry: PO.buildings.drawBuilding(...) returns boolean
   - Applies pivot tuner overrides from localStorage key: PO_PIVOT_OVERRIDES
*/
(function(){
  const PO = (window.PO = window.PO || {});
  PO.buildings = PO.buildings || {};
  PO.atlasTP = PO.atlasTP || {};

  const TAG = "[barrack:v16]";

  // Resolve deployment base path (handles /, /client/, /Project-Outrage/, etc.)
  const BASE_PATH = (() => {
    const p = (location && location.pathname) ? location.pathname : "/";
    if (p.endsWith("/")) return p;
    const i = p.lastIndexOf("/");
    return (i >= 0) ? p.slice(0, i + 1) : "/";
  })();

  function _withBasePath(url) {
    if (!url) return url;
    // Keep absolute URLs as-is
    if (url.startsWith("http://") || url.startsWith("https://") || url.startsWith("/")) return url;
    // Prefix relative URLs with the current directory (e.g. /Project-Outrage/)
    const bp = BASE_PATH.startsWith("/") ? BASE_PATH : ("/" + BASE_PATH);
    return (bp.endsWith("/") ? bp : (bp + "/")) + url;
  }

  function _expandUrls(urls) {
    const out = [];
    const seen = new Set();
    for (const u of (urls || [])) {
      if (!u) continue;
      const a = u;
      const b = _withBasePath(u);
      for (const x of [a, b]) {
        if (!x) continue;
        if (seen.has(x)) continue;
        seen.add(x);
        out.push(x);
      }
    }
    return out;
  }

  let _loggedLoaded=false, _loggedDraw=false, _loggedReady=false;

  function logOnce(which, ...args){
    try{
      if (which==="loaded" && _loggedLoaded) return;
      if (which==="draw"   && _loggedDraw) return;
      if (which==="ready"  && _loggedReady) return;
      console.log(...args);
      if (which==="loaded") _loggedLoaded=true;
      if (which==="draw") _loggedDraw=true;
      if (which==="ready") _loggedReady=true;
    }catch(_e){}
  }

  // --- URL candidates ---
  // Why: on some deploys, absolute paths (/asset/...) fail if you serve under a subpath,
  // or your folder is named slightly differently (barrack vs barracks etc.).
  // We'll try a short list and stop at the first one that loads valid JSON.

  const NORMAL_URLS = [
    "/asset/sprite/const/normal/barrack/barrack_idle.json",
  ];

  const CONST_URLS = [
    "/asset/sprite/const/const_anim/barrack/barrack_const.json",
  ];

  const DESTR_URLS = [
    // preferred current path (repo uses "distruct")
    "/asset/sprite/const/distruct/barrack/barrack_distruct.json",
    // legacy typo path some older builds used
    "/asset/sprite/const/destruct/barrack/barrack_distruct.json",
  ];

  function baseDirFromUrl(u){
    try{
      const noHash = String(u).split("#")[0];
      const noQ = noHash.split("?")[0];
      const i = noQ.lastIndexOf("/");
      return (i>=0) ? noQ.slice(0,i+1) : "";
    }catch(_e){
      return "";
    }
  }

  async function tryLoadAny(urls, label){
    const loader = PO.atlasTP && PO.atlasTP.loadTPAtlasMulti;
    if (typeof loader !== "function") throw new Error("atlas_tp.js missing loadTPAtlasMulti");

    let lastErr = null;
    for (const u of urls){
      try{
        // NOTE: if u doesn't exist and your deploy rewrites to HTML with 200,
        // res.json() throws SyntaxError; we treat that as failure and keep trying.
        const atlas = await loader(u, baseDirFromUrl(u));
        console.log(TAG, label, "using", u);
        return atlas;
      }catch(e){
        lastErr = e;
      }
    }

    // If nothing worked, throw with the final error.
    const msg = `${label} atlas JSON not found. Tried: ${urls.join(" | ")}`;
    const err = new Error(msg);
    err.cause = lastErr;
    throw err;
  }

  const BarracksAtlas = {
    ready: false,
    failed: false,
    loading: false,
    promise: null,

    normal: null,
    construct: null,
    destruct: null,

    kickLoad(){
      if (this.ready || this.failed || this.loading) return;

      // NOTE: We consider "normal" (idle) REQUIRED.
      // "construct" / "destruct" are OPTIONAL. If missing on the deployed site,
      // we will fall back to normal so you still see the sprite instead of the debug box.
      this.loading = true;

      const loadOptional = (urls, label) => {
        return tryLoadAny(_expandUrls(urls), label)
          .then(atlas => ({ ok: true, atlas, label }))
          .catch(err => {
            console.warn(TAG, `[barrack] optional atlas missing: ${label}`, err);
            return { ok: false, atlas: null, label, err };
          });
      };

      const loadRequired = (urls, label) => {
        return tryLoadAny(_expandUrls(urls), label)
          .then(atlas => ({ ok: true, atlas, label }))
          .catch(err => {
            console.error(TAG, `[barrack] REQUIRED atlas missing: ${label}`, err);
            return { ok: false, atlas: null, label, err };
          });
      };

      this.promise = Promise.all([
        loadRequired(NORMAL_URLS, "normal"),
        loadOptional(CONST_URLS, "construct"),
        loadOptional(DESTR_URLS, "destruct"),
      ]).then((results)=>{
        const map = Object.create(null);
        for (const r of results) map[r.label] = r;

        this.normal   = map.normal?.atlas || null;
        this.construct= map.construct?.atlas || null;
        this.destruct = map.destruct?.atlas || null;

        this.loading = false;

        if (!this.normal){
          this.failed = true;
          this.ready = false;
          console.error(TAG, "[barrack] normal atlas NOT loaded => will render fallback box.");
          return;
        }

        this.failed = false;
        this.ready = true;

        logOnce("ready", TAG,
          `[barrack] atlases ready. normal:${!!this.normal} construct:${!!this.construct} destruct:${!!this.destruct}`
        );
      });
    }
  };

  // --- pivot overrides (from tuner) ---
  let _ovRaw = null;
  let _ovObj = null;
  function refreshOverrides(){
    try{
      const raw = localStorage.getItem('PO_PIVOT_OVERRIDES');
      if (raw === _ovRaw) return _ovObj;
      _ovRaw = raw;
      _ovObj = raw ? JSON.parse(raw) : null;
      return _ovObj;
    }catch(_e){
      _ovRaw = null;
      _ovObj = null;
      return null;
    }
  }

  function applyOverridesIfAny(atlas){
    try{
      const fn = PO.atlasTP && PO.atlasTP.applyPivotOverrides;
      if (typeof fn !== 'function') return;
      const ov = refreshOverrides();
      if (!ov) return;
      fn(atlas, ov, { sortNumeric: true });
    }catch(_e){}
  }

  // --- frame picking: be tolerant to naming differences ---
  function firstFrame(atlas, preferRe){
    try{
      const keys = atlas && atlas.frames && (atlas.frames.keys ? Array.from(atlas.frames.keys()) : Object.keys(atlas.frames));
      if (!keys || !keys.length) return null;
      if (preferRe){
        const hit = keys.find(k => preferRe.test(String(k)));
        if (hit) return hit;
      }
      return keys[0];
    }catch(_e){
      return null;
    }
  }

  function pickFrame(ent){
    const dead = (!ent || ent.hp <= 0 || ent.alive === false);
    if (dead) return { atlas: "destruct" };
    if (ent && (ent.placing === true || ent.construction === true || ent.constAnim === true)) return { atlas: "construct" };
    return { atlas: "normal" };
  }

  function resolveAtlas(which){
    if (!BarracksAtlas.ready) return null;
    if (which==="normal") return BarracksAtlas.normal;
    if (which==="construct") return (BarracksAtlas.construct || BarracksAtlas.normal);
    if (which==="destruct") return (BarracksAtlas.destruct || BarracksAtlas.normal);
    return BarracksAtlas.normal;
  }

  function footprintAnchor(ent, helpers){
    // Prefer engine-provided world center (ent.x/ent.y). Fall back to tile coords.
    const ISO_X = helpers && typeof helpers.ISO_X === 'number' ? helpers.ISO_X : null;
    const TILE = (helpers && typeof helpers.TILE === 'number') ? helpers.TILE
               : (ISO_X ? (ISO_X * 2) : 110);

    const wx = (typeof ent.x === 'number')
      ? ent.x
      : ((ent.tx + (ent.tw * 0.5)) * TILE);

    // ent.y is center of building AABB in world space. We want the south edge.
    const wy = (typeof ent.y === 'number')
      ? (ent.y + (ent.th * TILE * 0.5))
      : ((ent.ty + ent.th) * TILE);

    return { wx, wy, TILE };
}

  function teamColorFor(ent, state){
    try{
      if (state && state.colors && state.colors.team) return state.colors.team[ent.team] || "#55aaff";
      if (state && state.colors && state.colors.player && ent.team===0) return state.colors.player;
      if (state && state.colors && state.colors.enemy  && ent.team===1) return state.colors.enemy;
    }catch(_e){}
    return "#55aaff";
  }

  function drawBarracksSync(ctx, ent, x, y){
    if (!BarracksAtlas.ready){
      BarracksAtlas.kickLoad();
      return false;
    }
    if (BarracksAtlas.failed) return false;

    const pick = pickFrame(ent);
    const atlas = resolveAtlas(pick.atlas);
    if (!atlas) return false;

    applyOverridesIfAny(atlas);

    // try smart-ish preferred frame names first
    let frame = null;
    if (pick.atlas === 'normal') frame = firstFrame(atlas, /barrack(?!.*(const|distr|dest))/i);
    if (pick.atlas === 'construct') frame = firstFrame(atlas, /(const|build|construct)/i);
    if (pick.atlas === 'destruct') frame = firstFrame(atlas, /(distr|dest|destroy|death)/i);
    if (!frame) frame = firstFrame(atlas, /barrack/i) || firstFrame(atlas);
    if (!frame) return false;

    try{
      // Make sure canvas state isn't accidentally transparent from previous draws.
      ctx.save();
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
      const sc = (cam && typeof cam.zoom === 'number') ? cam.zoom : 1.0;
      const ok = PO.atlasTP.drawFrame(ctx, atlas, frame, x, y, sc);
      ctx.restore();

      if (!ok) {
        if (!state._barracksOnceLogged) {
          state._barracksOnceLogged = true;
          const keys = (atlas && atlas.frames && atlas.frames.keys) ? Array.from(atlas.frames.keys()) : [];
          console.warn(TAG, 'drawFrame failed. frame=', frame, 'keys(sample)=', keys.slice(0, 10));
        }
        return false; // let engine fall back to footprint prism
      }
      return true;
    }catch(e){
      console.error(TAG, "draw failed", e);
      return false;
    }
  }

  PO.buildings.drawBuilding = function(ent, ctx, cam, helpers, state){
    try{
      if (!ent || !ent.kind) return false;
      const k = String(ent.kind).toLowerCase();
      if (!(k==="barracks" || k==="barrack" || k.indexOf("barrack")>=0)) return false;
      logOnce("draw", TAG, "drawBuilding called", k);
      const p = footprintAnchor(ent, helpers);
      // teamColor reserved for future tint; currently unused
      void teamColorFor(ent, state);
      const s = (helpers && typeof helpers.worldToScreen === "function")
        ? helpers.worldToScreen(p.x, p.y)
        : p;
      return drawBarracksSync(ctx, ent, s.x, s.y);
    }catch(e){
      console.error(TAG, "drawBuilding error", e);
      return false;
    }
  };

  PO.drawBarracks = function(ctx, ent, x, y){
    return drawBarracksSync(ctx, ent, x, y);
  };

  logOnce("loaded", TAG, "patch loaded. Expect: game.js calls PO.buildings.drawBuilding(...)");
})();
