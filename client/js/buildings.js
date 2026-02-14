/* buildings.js (barracks sprite hook) v7
   - Sync draw API: PO.buildings.drawBuilding(...) returns boolean
   - Kicks off async atlas load once, then draws when ready
   - Compatible with game.js that checks PO.buildings.drawBuilding
*/
(function(){
  const PO = (window.PO = window.PO || {});
  PO.buildings = PO.buildings || {};
  PO.atlasTP = PO.atlasTP || {};

  const TAG = "[barracks:v7]";
  let _loggedLoaded = false;
  let _loggedDrawCall = false;
  let _loggedReady = false;

  // Atlas URLs (keep identical to your folder layout)
  const URL_NORMAL = "/asset/sprite/const/normal/barrack/atlas_tp.json";
  const URL_CONST  = "/asset/sprite/const/const_anim/barrack/atlas_tp.json";
  const URL_DESTR  = "/asset/sprite/const/destruct/barrack/atlas_tp.json";

  function logOnce(flagName, ...args){
    try{
      if (!flagName) return;
      if (flagName==="loaded" && _loggedLoaded) return;
      if (flagName==="draw"   && _loggedDrawCall) return;
      if (flagName==="ready"  && _loggedReady) return;
      console.log(...args);
      if (flagName==="loaded") _loggedLoaded = true;
      if (flagName==="draw")   _loggedDrawCall = true;
      if (flagName==="ready")  _loggedReady = true;
    }catch(_e){}
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
      if (!PO.atlasTP || typeof PO.atlasTP.loadTPAtlasMulti !== "function"){
        console.warn(TAG, "atlas_tp.js not loaded or missing loadTPAtlasMulti");
        this.failed = true;
        return;
      }

      this.loading = true;
      this.promise = Promise.all([
        PO.atlasTP.loadTPAtlasMulti(URL_NORMAL),
        PO.atlasTP.loadTPAtlasMulti(URL_CONST),
        PO.atlasTP.loadTPAtlasMulti(URL_DESTR),
      ]).then(([n,c,d])=>{
        this.normal = n; this.construct = c; this.destruct = d;
        this.ready = true;
        this.loading = false;
        logOnce("ready", TAG, "atlases ready");
      }).catch((e)=>{
        this.failed = true;
        this.loading = false;
        console.error(TAG, "atlas load failed", e);
      });
    }
  };

  // Pick frame names
  function pickFrame(ent){
    // If you later add real construction timing, branch here.
    // For now: normal unless dead.
    const dead = (!ent || ent.hp <= 0 || ent.alive === false);
    if (dead) return { atlas: "destruct", frame: "barrack_distruction-0" };

    // Optionally: show "const" while being placed if you add a flag
    if (ent && (ent.placing === true || ent.construction === true || ent.constAnim === true)){
      return { atlas: "construct", frame: "barrack_const-0" };
    }
    return { atlas: "normal", frame: "barrack-0" };
  }

  function resolveAtlas(which){
    if (!BarracksAtlas.ready) return null;
    if (which==="normal") return BarracksAtlas.normal;
    if (which==="construct") return BarracksAtlas.construct;
    if (which==="destruct") return BarracksAtlas.destruct;
    return BarracksAtlas.normal;
  }

  // Compute a sane anchor point for building sprites:
  // bottom-center of footprint south edge (works well with pivot tuning)
  function footprintAnchor(ent, helpers){
    const TILE = (helpers && helpers.TILE) || 300;
    const tx0 = ent.tx|0, ty0 = ent.ty|0;
    const tx1 = (ent.tx + ent.tw)|0;
    const ty1 = (ent.ty + ent.th)|0;

    const wx = ((tx0 + tx1) * 0.5) * TILE;
    const wy = (ty1) * TILE;

    if (helpers && typeof helpers.worldToScreen === "function"){
      return helpers.worldToScreen(wx, wy);
    }
    // fallback: use ent.x/y if helpers missing
    return { x: ent.x||0, y: ent.y||0 };
  }

  function teamColorFor(ent, state){
    try{
      if (state && state.colors && state.colors.team){
        return state.colors.team[ent.team] || "#55aaff";
      }
      if (state && state.colors && state.colors.player && ent.team===0) return state.colors.player;
      if (state && state.colors && state.colors.enemy  && ent.team===1) return state.colors.enemy;
    }catch(_e){}
    return "#55aaff";
  }

  function drawBarracksSync(ctx, ent, x, y, teamColor){
    if (!BarracksAtlas.ready){
      BarracksAtlas.kickLoad();
      return false;
    }
    if (BarracksAtlas.failed) return false;

    const pick = pickFrame(ent);
    const atlas = resolveAtlas(pick.atlas);
    if (!atlas) return false;

    // apply per-frame pivot overrides if stored (pivot tuner writes these)
    try{
      if (PO.atlasTP && typeof PO.atlasTP.applyPivotOverrides==="function"){
        PO.atlasTP.applyPivotOverrides(atlas);
      }
    }catch(_e){}

    try{
      // Optional: tint handling can be added later; currently just draw
      PO.atlasTP.drawFrame(ctx, atlas, pick.frame, x, y, 1.0);
      return true;
    }catch(e){
      console.error(TAG, "draw failed", e);
      return false;
    }
  }

  // The entry point that game.js calls.
  // Must be SYNC and return boolean.
  PO.buildings.drawBuilding = function drawBuilding(ent, ctx, cam, helpers, state){
    try{
      if (!ent || !ent.kind) return false;
      const k = String(ent.kind).toLowerCase();
      if (!(k==="barracks" || k==="barrack" || k.indexOf("barrack")>=0)) return false;

      logOnce("draw", TAG, "drawBuilding called", k);

      const p = footprintAnchor(ent, helpers);
      const col = teamColorFor(ent, state);
      return drawBarracksSync(ctx, ent, p.x, p.y, col);
    }catch(e){
      console.error(TAG, "drawBuilding error", e);
      return false;
    }
  };

  // Optional: also expose direct draw, but keep it sync now
  PO.drawBarracks = function(ctx, ent, x, y, teamColor){
    return drawBarracksSync(ctx, ent, x, y, teamColor);
  };

  logOnce("loaded", TAG, "patch loaded. Expect: game.js calls PO.buildings.drawBuilding(...)");
})();
