/* buildings.js - barracks TP atlas loader + renderer plugin (v28)
   - Defines PO.buildings.drawBuilding(ctx, b, x, y, dz, now)
   - Loads TexturePacker JSON from your repo paths:
     normal:    asset/sprite/const/normal/barrack/barrack_idle.json
     const:     asset/sprite/const/const_anim/barrack/barrack_const.json
     distruct:  asset/sprite/const/distruct/barrack/barrack_distruct.json
*/
(() => {
  const TAG = "[barracks:v28]";
  const W = (typeof window !== "undefined") ? window : globalThis;

  W.PO = W.PO || {};
  PO.buildings = PO.buildings || {};

  const st = {
    promise: null,
    ready: false,
    failed: false,
    prefix: null,
    atlases: { idle: null, const: null, distruct: null },
    frameLists: { idle: [], const: [], distruct: [] },
    teamAtlases: { idle: {}, const: {}, distruct: {} },
    logged: { boot: false, ok: false, fail: false }
  };

  function logOnce(kind, ...args) {
    if (st.logged[kind]) return;
    st.logged[kind] = true;
    (kind === "fail" ? console.error : console.log)(TAG, ...args);
  }

  function looksLikeJsonAtlas(text) {
    if (!text) return false;
    const t = String(text).trim();
    if (!t.startsWith("{")) return false;
    if (t.startsWith("<")) return false;
    // TexturePacker "multi atlas" has "textures" usually
    return t.includes('"textures"') || t.includes('"frames"');
  }

  async function probePrefix() {
    // Try a small set of likely repo-root layouts.
    // Your local path: D:\repos\project_outrage\Project-Outrage\client\asset\...
    const sub = "sprite/const/normal/barrack/barrack_idle.json";
    const prefixes = [
      "asset",
      "client/asset",
      "Project-Outrage/client/asset",
      "Project-Outrage/Project-Outrage/client/asset",
      "/asset",
      "/client/asset",
      "/Project-Outrage/client/asset",
      "/Project-Outrage/Project-Outrage/client/asset",
    ];

    for (const pref of prefixes) {
      const url = `${pref}/${sub}`.replaceAll("//", "/");
      try {
        const r = await fetch(url, { cache: "no-store" });
        if (!r.ok) continue;

        // Some hosts return index.html (SPA fallback) as 200, detect it.
        const txt = await r.text();
        if (looksLikeJsonAtlas(txt)) {
          return pref.replace(/\/$/, "");
        }
      } catch (_) {
        // ignore
      }
    }
    return null;
  }

  function mkPaths(prefix) {
    // NOTE: folder name is "barrack" but building kind is usually "barracks" in game.js
    const base = (p) => `${prefix}/${p}`.replaceAll("//", "/");

    return {
      idle: {
        jsonUrl: base("sprite/const/normal/barrack/barrack_idle.json"),
        baseDir: base("sprite/const/normal/barrack/"),
      },
      const: {
        jsonUrl: base("sprite/const/const_anim/barrack/barrack_const.json"),
        baseDir: base("sprite/const/const_anim/barrack/"),
      },
      distruct: {
        jsonUrl: base("sprite/const/distruct/barrack/barrack_distruct.json"),
        baseDir: base("sprite/const/distruct/barrack/"),
      },
    };
  }

  async function loadAtlases() {
    if (st.promise) return st.promise;

    st.promise = (async () => {
      logOnce("boot", "boot");

      if (!PO.atlasTP || typeof PO.atlasTP.loadTPAtlasMulti !== "function") {
        st.failed = true;
        logOnce("fail", "PO.atlasTP.loadTPAtlasMulti missing. atlas_tp.js not loaded?");
        return;
      }

      const pref = await probePrefix();
      if (!pref) {
        st.failed = true;
        logOnce(
          "fail",
          "Could not locate barracks JSON via known prefixes.",
          "Tried: asset/, client/asset/, Project-Outrage/client/asset/ ..."
        );
        return;
      }
      st.prefix = pref.replace(/\/$/, "");
      const P = mkPaths(st.prefix);

      // Load in parallel; if one fails, still allow others to work.
      const tasks = [
        PO.atlasTP.loadTPAtlasMulti(P.idle.jsonUrl, P.idle.baseDir).then(a => (st.atlases.idle = a)).catch(e => { console.warn(TAG, "idle atlas load failed", e); }),
        PO.atlasTP.loadTPAtlasMulti(P.const.jsonUrl, P.const.baseDir).then(a => (st.atlases.const = a)).catch(e => { console.warn(TAG, "const atlas load failed", e); }),
        PO.atlasTP.loadTPAtlasMulti(P.distruct.jsonUrl, P.distruct.baseDir).then(a => (st.atlases.distruct = a)).catch(e => { console.warn(TAG, "distruct atlas load failed", e); }),
      ];
      await Promise.all(tasks);

      // Build frame lists (sorted) for animation.
      for (const k of ["idle", "const", "distruct"]) {
        const a = st.atlases[k];
        if (a && a.frames && typeof a.frames.keys === "function") {
          st.frameLists[k] = Array.from(a.frames.keys()).sort();
        }
      }

      st.ready = !!st.atlases.idle; // require at least idle
      if (st.ready) logOnce("ok", "ready", { prefix: st.prefix, idleFrames: st.frameLists.idle.length });
      else {
        st.failed = true;
        logOnce("fail", "Atlas load finished but idle atlas is missing. Check file names/paths.");
      }
    })();

    return st.promise;
  }

  function getCamZoom() {
    // game.js uses global `cam.zoom`. In browsers, top-level const is still in global lexical env.
    try {
      if (typeof cam !== "undefined" && cam && typeof cam.zoom === "number") return cam.zoom;
    } catch (_) {}
    return 1;
  }

  function getIsoX() {
    try { if (typeof ISO_X !== "undefined") return ISO_X; } catch (_) {}
    return 40; // fallback
  }

  function getTeamAtlas(key, team) {
    const base = st.atlases[key];
    if (!base) return null;

    // If team tint helper exists in game.js, tint the whole sheet once per team.
    const t = (team == null) ? 0 : team;
    const cache = st.teamAtlases[key];
    if (cache && cache[t]) return cache[t];

    if (typeof _getTeamCroppedSprite === "function" && base.img) {
      const w = base.img.naturalWidth || base.img.width;
      const h = base.img.naturalHeight || base.img.height;
      if (w && h) {
        const tinted = _getTeamCroppedSprite(base.img, { x: 0, y: 0, w, h }, t);
        if (tinted) {
          cache[t] = { ...base, img: tinted };
          return cache[t];
        }
      }
    }

    // Fallback: no tinting
    cache[t] = base;
    return base;
  }

  function pickFrame(key, now) {
    const list = st.frameLists[key];
    if (!list || list.length === 0) return null;
    // Slow-ish loop for buildings
    const t = (typeof now === "number") ? now : performance.now();
    const idx = Math.floor(t / 120) % list.length;
    return list[idx];
  }

  // Main plugin: only handles barracks. Return false for others so game.js draws prism fallback.
  PO.buildings.drawBuilding = function drawBuilding(ctx, b, x, y, dz, now) {
    // Kind in your game.js seems to be "barracks" (plural).
    const kind = b && b.kind;
    if (kind !== "barracks" && kind !== "barrack") return false;
    if (!ctx || !b) return false;

    if (st.failed) return false;

    // Kick off async load once; until ready, use fallback prism.
    if (!st.promise) {
      loadAtlases();
      return false;
    }
    if (!st.ready) return false;

    // State selection (your current game.js has no construction progress fields).
    let state = "idle";
    if (typeof b.hp === "number" && b.hp <= 0) state = "distruct";
    if (!st.atlases[state]) state = "idle";

    const frameName = pickFrame(state, now) || st.frameLists[state][0];
    if (!frameName) return false;

    const atlas = getTeamAtlas(state, b.team);
    if (!atlas) return false;

    // Scale to footprint width.
    const isoX = getIsoX();
    const footprintW = ((b.tw || 1) + (b.th || 1)) * isoX;

    const fr = st.atlases[state].frames && st.atlases[state].frames.get ? st.atlases[state].frames.get(frameName) : null;
    const srcW = fr && fr.src ? fr.src.w : null;
    const zoom = getCamZoom();

    let scale = zoom;
    if (srcW && srcW > 0) {
      scale *= (footprintW / srcW);
    } else {
      // fallback scale
      scale *= 1.0;
    }

    // Draw using bottom-center anchoring.
    const dx = x;
    const dy = (y - dz);

    try {
      PO.atlasTP.drawFrame(ctx, atlas, frameName, dx, dy, scale, { anchorX: 0.5, anchorY: 1.0 });
      return true;
    } catch (e) {
      console.warn(TAG, "drawFrame failed", e);
      return false;
    }
  };
})();
