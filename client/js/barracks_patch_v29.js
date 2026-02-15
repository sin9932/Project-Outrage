/* Barracks sprite renderer patch v29
   - Safe wrapper: only affects ent.kind === "barracks"
   - Loads TexturePacker atlas JSON/PNG via PO.atlasTP.loadTPAtlasMulti
   - Tries both base roots: "asset/..." and "client/asset/..." to match deploy setups
*/
(function(){
  "use strict";

  var LOG = "[barracks:v29]";

  function nowMs(){ return (typeof performance !== "undefined" && performance.now) ? performance.now() : Date.now(); }

  function pickFrames(atlas, prefixes){
    if (!atlas || !atlas.frames) return [];
    var keys = Object.keys(atlas.frames);
    if (!keys.length) return [];

    // Try prefixes first
    if (window.PO && PO.atlasTP && typeof PO.atlasTP.listFramesByPrefix === "function"){
      for (var i=0;i<prefixes.length;i++){
        var pre = prefixes[i];
        if (!pre) continue;
        var list = PO.atlasTP.listFramesByPrefix(atlas, pre);
        if (list && list.length) return list;
      }
    }

    // Fallback: sort all frames by numeric suffix if any
    keys.sort(function(a,b){
      var an = a.match(/(\d+)(?!.*\d)/);
      var bn = b.match(/(\d+)(?!.*\d)/);
      var ai = an ? parseInt(an[1],10) : -1;
      var bi = bn ? parseInt(bn[1],10) : -1;
      if (ai !== -1 && bi !== -1 && ai !== bi) return ai - bi;
      return a.localeCompare(b);
    });
    return keys;
  }

  function computeFootprintCorners(ent, helpers){
    // mirror drawFootprintDiamond math: c0, c1, c2, c3
    var tx0 = ent.tx, ty0 = ent.ty;
    var tx1 = ent.tx + ent.tw;
    var ty1 = ent.ty + ent.th;
    var c0 = helpers.tileToScreen(tx0, ty0);
    var c1 = helpers.tileToScreen(tx1, ty0);
    var c2 = helpers.tileToScreen(tx1, ty1);
    var c3 = helpers.tileToScreen(tx0, ty1);
    return [c0,c1,c2,c3];
  }

  var Barracks = {
    status: "idle", // idle|loading|ready|error
    base: "",
    atlasIdle: null,
    framesIdle: null,
    err: null,
    lastWarnMs: 0
  };

  function warnThrottled(msg){
    var t = nowMs();
    if (t - Barracks.lastWarnMs > 1500){
      Barracks.lastWarnMs = t;
      console.warn(LOG, msg);
    }
  }

  function buildUrls(base){
    // Files are inside client/asset in repo, but on deploy root might be client/ or already inside root
    return {
      idle: base + "asset/sprite/const/normal/barrack/barrack_idle.json",
      construct: base + "asset/sprite/const/const_anim/barrack/barrack_const.json",
      destroy: base + "asset/sprite/const/distruct/barrack/barrack_distruct.json"
    };
  }

  async function tryLoadIdleAtlas(url){
    // Add cache buster to avoid stale SPA fallbacks
    var bust = (url.indexOf("?") >= 0 ? "&" : "?") + "v=" + Date.now();
    return await PO.atlasTP.loadTPAtlasMulti(url + bust);
  }

  async function ensureLoaded(){
    if (Barracks.status === "ready" || Barracks.status === "loading" || Barracks.status === "error") return;
    Barracks.status = "loading";

    var bases = ["", "client/"];
    var prefixes = ["barracks_idle", "barrack_idle", "barracks", "barrack", "idle", "Idle"];

    for (var i=0;i<bases.length;i++){
      var base = bases[i];
      var urls = buildUrls(base);

      try {
        var atlas = await tryLoadIdleAtlas(urls.idle);
        var frames = pickFrames(atlas, prefixes);
        if (!frames.length) throw new Error("atlas loaded but frames empty: " + urls.idle);

        Barracks.base = base;
        Barracks.atlasIdle = atlas;
        Barracks.framesIdle = frames;
        Barracks.status = "ready";
        console.log(LOG, "idle atlas ready", "base=\"" + base + "\"", "frames=" + frames.length);
        return;
      } catch (e){
        Barracks.err = e;
        console.warn(LOG, "idle atlas load failed for", urls.idle, e && e.message ? e.message : e);
      }
    }

    Barracks.status = "error";
    console.error(LOG, "FAILED to load barracks atlases.", "Make sure these files exist on the deployed site:",
      buildUrls("").idle, "or", buildUrls("client/").idle);
  }

  function drawBarracks(ent, ctx, cam, helpers, state){
    if (Barracks.status !== "ready"){
      if (Barracks.status === "idle") ensureLoaded();
      if (Barracks.status === "loading") warnThrottled("loading barracks atlas...");
      if (Barracks.status === "error") warnThrottled("barracks atlas load error (see earlier console error)");
      return false;
    }

    var atlas = Barracks.atlasIdle;
    var frames = Barracks.framesIdle;

    // Pick a frame (simple loop)
    var fps = 8;
    var t = (state && typeof state.t === "number") ? state.t : (Date.now() / 1000);
    var idx = frames.length ? Math.floor(t * fps) % frames.length : 0;
    var frameName = frames[idx] || frames[0];
    var f = atlas && atlas.frames ? atlas.frames[frameName] : null;
    if (!f || !f.sourceSize){
      warnThrottled("missing frame data for " + frameName);
      return false;
    }

    // Compute footprint
    var corners = computeFootprintCorners(ent, helpers);
    var c0 = corners[0], c1 = corners[1], c2 = corners[2], c3 = corners[3];

    var minX = Math.min(c0.x, c1.x, c2.x, c3.x);
    var maxX = Math.max(c0.x, c1.x, c2.x, c3.x);
    var minY = Math.min(c0.y, c1.y, c2.y, c3.y);
    var maxY = Math.max(c0.y, c1.y, c2.y, c3.y);

    var bboxW = Math.max(1, (maxX - minX));

    // Anchor at bottom edge center
    var ax = (c2.x + c3.x) * 0.5;
    var ay = (c2.y + c3.y) * 0.5;

    // Scale sprite to roughly match footprint width
    var srcW = Math.max(1, f.sourceSize.w || 1);
    var scale = (bboxW / srcW) * 1.05; // tiny bump so it is not underfit

    PO.atlasTP.drawFrame(atlas, frameName, ctx, ax, ay, {
      pivotX: 0.5,
      pivotY: 1.0,
      scale: scale
    });

    return true;
  }

  function install(){
    if (!window.PO || !PO.buildings || !PO.atlasTP) return false;
    if (typeof PO.buildings.drawBuilding !== "function") return false;
    if (typeof PO.atlasTP.loadTPAtlasMulti !== "function") return false;

    if (PO.buildings.drawBuilding && PO.buildings.drawBuilding.__barracks_v29) return true;

    var orig = PO.buildings.drawBuilding;
    function wrapped(ent, ctx, cam, helpers, state){
      try {
        if (ent && ent.kind === "barracks"){
          var ok = drawBarracks(ent, ctx, cam, helpers, state);
          if (ok) return true;
          // fallback to original if our draw not ready
        }
      } catch (e){
        console.error(LOG, "draw error", e);
      }
      return orig ? orig(ent, ctx, cam, helpers, state) : false;
    }
    wrapped.__barracks_v29 = true;
    PO.buildings.drawBuilding = wrapped;
    console.log(LOG, "installed drawBuilding wrapper (barracks only)");
    return true;
  }

  // Boot loop (no infinite spam)
  (function boot(){
    var start = nowMs();
    var tries = 0;
    var timer = setInterval(function(){
      tries++;
      if (install()){
        clearInterval(timer);
        return;
      }
      if (nowMs() - start > 12000){
        clearInterval(timer);
        console.warn(LOG, "install timed out (PO.buildings not ready?)");
      }
    }, 120);
  })();
})();
