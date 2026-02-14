/* buildings.js (barracks sprite hook) v8
   - Atlas URL auto-detect: tries multiple likely paths until one returns valid JSON
   - Avoids "Unexpected token '<'" when your deploy rewrites missing JSON to index.html
   - Sync draw entry: PO.buildings.drawBuilding(...) returns boolean
   - Applies pivot tuner overrides from localStorage key: PO_PIVOT_OVERRIDES
*/
(function(){
  const PO = (window.PO = window.PO || {});
  PO.buildings = PO.buildings || {};
  PO.atlasTP = PO.atlasTP || {};

  const TAG = "[barracks:v8]";
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
    "/asset/sprite/const/normal/barrack/atlas_tp.json",
    "asset/sprite/const/normal/barrack/atlas_tp.json",
    "/asset/sprite/const/normal/barracks/atlas_tp.json",
    "asset/sprite/const/normal/barracks/atlas_tp.json",
    "/asset/sprite/const/normal/barrack_const/atlas_tp.json",
    "asset/sprite/const/normal/barrack_const/atlas_tp.json",
    "/asset/sprite/const/normal/barrack%20const/atlas_tp.json",
    "asset/sprite/const/normal/barrack%20const/atlas_tp.json",
  ];

  const CONST_URLS = [
    "/asset/sprite/const/const_anim/barrack/atlas_tp.json",
    "asset/sprite/const/const_anim/barrack/atlas_tp.json",
    "/asset/sprite/const/const_anim/barracks/atlas_tp.json",
    "asset/sprite/const/const_anim/barracks/atlas_tp.json",
    "/asset/sprite/const/const_anim/barrack_const/atlas_tp.json",
    "asset/sprite/const/const_anim/barrack_const/atlas_tp.json",
    "/asset/sprite/const/const_anim/barrack%20const/atlas_tp.json",
    "asset/sprite/const/const_anim/barrack%20const/atlas_tp.json",
  ];

  const DESTR_URLS = [
    "/asset/sprite/const/destruct/barrack/atlas_tp.json",
    "asset/sprite/const/destruct/barrack/atlas_tp.json",
    "/asset/sprite/const/destruct/barracks/atlas_tp.json",
    "asset/sprite/const/destruct/barracks/atlas_tp.json",
    "/asset/sprite/const/destruct/barrack_const/atlas_tp.json",
    "asset/sprite/const/destruct/barrack_const/atlas_tp.json",
    "/asset/sprite/const/destruct/barrack%20const/atlas_tp.json",
    "asset/sprite/const/destruct/barrack%20const/atlas_tp.json",
  ];

  async function tryLoadAny(urls, label){
    const loader = PO.atlasTP && PO.atlasTP.loadTPAtlasMulti;
    if (typeof loader !== "function") throw new Error("atlas_tp.js missing loadTPAtlasMulti");

    let lastErr = null;
    for (const u of urls){
      try{
        // NOTE: if u doesn't exist and your deploy rewrites to HTML with 200,
        // res.json() throws SyntaxError; we treat that as failure and keep trying.
        const atlas = await loader(u);
        console.log(TAG, label, "using", u);
        return atlas;
      }catch(e){
        lastErr = e;
      }
    }

    // If nothing worked, throw with the final error.
    const msg = `${label} atlas_tp.json not found. Tried: ${urls.join(" | ")}`;
    const err = new Error(msg);
    err.cause = lastErr;
    throw err;
  }

  const BarracksAtlas = {
    ready:false,
    failed:false,
    loading:false,
    promise:null,
    normal:null,
    construct:null,
    destruct:null,

    kickLoad(){
      if (this.ready || this.failed || this.loading) return;
      this.loading = true;
      this.promise = Promise.all([
        tryLoadAny(NORMAL_URLS, "normal"),
        tryLoadAny(CONST_URLS,  "construct"),
        tryLoadAny(DESTR_URLS,  "destruct"),
      ]).then(([n,c,d])=>{
        this.normal=n; this.construct=c; this.destruct=d;
        this.ready=true;
        this.loading=false;
        logOnce("ready", TAG, "atlases ready");
      }).catch((e)=>{
        this.failed=true;
        this.loading=false;
        console.error(TAG, "atlas load failed", e);
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
    if (which==="construct") return BarracksAtlas.construct;
    if (which==="destruct") return BarracksAtlas.destruct;
    return BarracksAtlas.normal;
  }

  function footprintAnchor(ent, helpers){
    const TILE = (helpers && helpers.TILE) || 300;
    const tx0 = ent.tx|0, ty0 = ent.ty|0;
    const tx1 = (ent.tx + ent.tw)|0;
    const ty1 = (ent.ty + ent.th)|0;

    const wx = ((tx0 + tx1) * 0.5) * TILE;
    const wy = (ty1) * TILE;

    if (helpers && typeof helpers.worldToScreen === "function") return helpers.worldToScreen(wx, wy);
    return { x: ent.x||0, y: ent.y||0 };
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
      PO.atlasTP.drawFrame(ctx, atlas, frame, x, y, 1.0);
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
      return drawBarracksSync(ctx, ent, p.x, p.y);
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
