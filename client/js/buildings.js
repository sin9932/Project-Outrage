
/*
  Barracks atlas hookup (v5)
  - Uses TexturePacker Multi Atlas JSON (textures[0].frames)
  - Builds frame lists from the atlas contents (no hard-coded numbering)
  - Fixes filename mismatches: barrack_con_complete_*.png / barrack_distruction_*.png
  - Works even if some numbers are missing (it sorts by the trailing _N.png when present)
  - Keeps file count low: single patch file. Include AFTER atlas_tp.js and AFTER game.js.
*/
(() => {
  const G = (typeof window !== "undefined") ? window : globalThis;

  // Try common globals your project used in earlier patches.
  const PO = (G.PO = G.PO || {});
  const atlasTP = (PO && PO.atlasTP) || (G.PO && G.PO.atlasTP) || null;

  if (!atlasTP || typeof atlasTP.loadTPAtlasMulti !== "function" || typeof atlasTP.drawFrame !== "function") {
    console.warn("[barracks:v6] atlasTP not found. Make sure atlas_tp.js is loaded before this file.");
    return;
  }

  // ---- Paths (YOU already confirmed these 200 OK on your local host) ----
  const URL_IDLE     = "/asset/sprite/const/normal/barrack/barrack_idle.json";
  const URL_CONST    = "/asset/sprite/const/const_anim/barrack/barrack_const.json";
  const URL_DISTRUCT = "/asset/sprite/const/distruct/barrack/barrack_distruct.json";

  // ---- Small helpers ----
  function _suffixNumber(name) {
    // "..._12.png" -> 12, otherwise NaN
    const m = /_(\d+)\.png$/i.exec(name);
    return m ? parseInt(m[1], 10) : Number.NaN;
  }

  function _sortFrames(a, b) {
    const an = _suffixNumber(a);
    const bn = _suffixNumber(b);
    if (Number.isFinite(an) && Number.isFinite(bn)) return an - bn;
    // fallback stable-ish
    return a.localeCompare(b);
  }

  function _collectFrames(atlas, prefix) {
    // Prefer atlas_tp helper (handles Map + numeric-suffix order)
    if (window.PO && PO.atlasTP && typeof PO.atlasTP.listFramesByPrefix === "function") {
      return PO.atlasTP.listFramesByPrefix(atlas, prefix, { sortNumeric: true });
    }

    // Fallback: object keys + local sorter
    const framesObj = atlas && atlas.frames;
    const keys = framesObj
      ? (framesObj.keys ? Array.from(framesObj.keys()) : Object.keys(framesObj))
      : [];
    const list = keys.filter(k => String(k).startsWith(prefix));
    list.sort(_sortFrames);
    return list;
  }

  // ---- Lazy-loaded atlas bundle ----
  const BarracksAtlas = {
    ready: false,
    loading: null,
    idleAtlas: null,
    constAtlas: null,
    distructAtlas: null,
    idleFrames: [],
    constFrames: [],
    distructFrames: [],
    distStillFrame: "barrack_dist.png", // fallback

    // team tinted atlases cache: { [teamId]: {idle, cons, dist} }
    teamAtlases: Object.create(null),

    async ensureLoaded() {
      if (this.ready) return this;
      if (this.loading) return this.loading;

      this.loading = (async () => {
        console.log("[barracks:v6] loading atlases...");
        const [idleA, consA, distA] = await Promise.all([
          atlasTP.loadTPAtlasMulti(URL_IDLE),
          atlasTP.loadTPAtlasMulti(URL_CONST),
          atlasTP.loadTPAtlasMulti(URL_DISTRUCT),
        ]);

        this.idleAtlas = idleA;
        this.constAtlas = consA;
        this.distructAtlas = distA;

        this.idleFrames = _collectFrames(idleA, "barrack_idle");               // barrack_idle1.png ...
        this.constFrames = _collectFrames(consA, "barrack_con_complete_");     // barrack_con_complete_1.png ...
        this.distructFrames = _collectFrames(distA, "barrack_distruction_");   // barrack_distruction_5.png ...

        // "ruin still" usually sits in idle atlas (barrack_dist.png)
        if (idleA.frames && idleA.frames["barrack_dist.png"]) {
          this.distStillFrame = "barrack_dist.png";
        } else {
          // fallback: first frame that looks like dist
          const k = Object.keys(idleA.frames || {}).find(x => x.toLowerCase().includes("dist"));
          if (k) this.distStillFrame = k;
        }

        this.ready = true;
        console.log("[barracks:v6] atlases ready:",
          "idle", this.idleFrames.length,
          "const", this.constFrames.length,
          "distruct", this.distructFrames.length,
          "still", this.distStillFrame
        );
        return this;
      })();

      return this.loading;
    }
  };


  // ---- Pivot overrides from localStorage (hot reload) ----
  BarracksAtlas.pivotKey = "PO_PIVOT_OVERRIDES";
  BarracksAtlas._pivotRaw = null;

  BarracksAtlas._applyPivotOverridesIfChanged = function _applyPivotOverridesIfChanged() {
    // note: safe no-op if localStorage not available
    let raw = null;
    try { raw = localStorage.getItem(BarracksAtlas.pivotKey); } catch (_e) {}
    if (raw === BarracksAtlas._pivotRaw) return;

    BarracksAtlas._pivotRaw = raw;

    let obj = {};
    if (raw) {
      try { obj = JSON.parse(raw) || {}; } catch (_e) { obj = {}; }
    }

    try {
      atlasTP.applyPivotOverrides(BarracksAtlas.idle, obj);
      atlasTP.applyPivotOverrides(BarracksAtlas.cons, obj);
      atlasTP.applyPivotOverrides(BarracksAtlas.dist, obj);
      // pivot changes invalidate team-tinted atlases (anchors live in frames)
      for (const k in teamAtlases) delete teamAtlases[k];
      // console.log("[barracks:v6] applied pivot overrides:", Object.keys(obj));
    } catch (e) {
      console.warn("[barracks:v6] applyPivotOverrides failed:", e);
    }
  };

  // ---- Optional: team tinting (uses your game's existing helper if present) ----
  // We try these function names because your project has used a few variants.
  const tintFn =
    G._applyTeamPaletteToImage ||
    G.applyTeamPaletteToImage ||
    G.replaceMagentaWithTeamColor ||
    null;

  
  function _ensureTeamAtlas(teamId, teamColor) {
    const baseKey = teamId == null ? "na" : String(teamId);
    const key = baseKey + ":" + (teamColor ? (teamColor.r + "," + teamColor.g + "," + teamColor.b) : "null");
    if (teamAtlases[key]) return teamAtlases[key];

    // tint fn may be defined later (game.js may load after this file)
    const tintFn = G.applyTeamPaletteToImage || G.replaceMagentaWithTeamColor || (G.PO && G.PO.applyTeamPaletteToImage) || null;
    if (!tintFn || !teamColor) {
      teamAtlases[key] = { idle: BarracksAtlas.idle, cons: BarracksAtlas.cons, dist: BarracksAtlas.dist };
      return teamAtlases[key];
    }

    const makeTinted = (baseAtlas) => {
      try {
        // multi-texture: tint each texture image
        const textures = (baseAtlas.textures || []).map((t) => {
          const tintedImg = tintFn(t.img, teamColor);
          return { ...t, img: tintedImg };
        });

        // copy frames map to avoid shared mutation surprises
        const frames = new Map();
        if (baseAtlas.frames && typeof baseAtlas.frames.forEach === "function") {
          baseAtlas.frames.forEach((fr, name) => {
            const anchor = fr.anchor ? { ...fr.anchor } : undefined;
            frames.set(name, { ...fr, anchor });
          });
        }

        return { ...baseAtlas, textures, frames };
      } catch (e) {
        console.warn("[barracks:v6] tint failed, using base atlas:", e);
        return baseAtlas;
      }
    };

    teamAtlases[key] = {
      idle: makeTinted(BarracksAtlas.idle),
      cons: makeTinted(BarracksAtlas.cons),
      dist: makeTinted(BarracksAtlas.dist),
    };
    return teamAtlases[key];
  }

  // ---- Frame picker (no build-progress in your building object, so we fake a "spawn anim") ----
  function _pickFrame(list, tSec, fps, loop) {
    if (!list || list.length === 0) return null;
    const idx = Math.floor(tSec * fps);
    if (loop) return list[idx % list.length];
    return list[Math.min(idx, list.length - 1)];
  }

  function _getPhase(ent, nowMs) {
    // Fields we add non-destructively on the building object
    if (ent.__barracksBornAt == null) ent.__barracksBornAt = nowMs;
    const dead = (ent.alive === false) || (ent.hp != null && ent.hp <= 0);

    if (dead) {
      if (ent.__barracksDeadAt == null) ent.__barracksDeadAt = nowMs;
      return { phase: "dead", t: (nowMs - ent.__barracksDeadAt) / 1000 };
    }
    return { phase: "alive", t: (nowMs - ent.__barracksBornAt) / 1000 };
  }

  // ---- Public draw hook ----
  // You call this from your building renderer:
  //   PO.drawBarracks(ctx, ent, anchorX, anchorY, teamColor)
  /**
   * Draw barracks sprite on the main game canvas.
   * IMPORTANT: this is sync. If atlases aren't loaded yet, it will kick off loading and return false this frame.
   *
   * @param {CanvasRenderingContext2D} ctx
   * @param {object} ent - building entity (expects ent.team, ent.bornAt, ent.deadAt, ent.alive, ent.tx/ty/tw/th etc)
   * @param {number} anchorX - screen-space anchor X (typically south corner of footprint)
   * @param {number} anchorY - screen-space anchor Y (typically south corner of footprint)
   * @param {{r:number,g:number,b:number}|null} teamColor - optional tint color
   * @param {number} scale - usually cam.zoom
   * @returns {boolean} drew?
   */
  PO.drawBarracks = function drawBarracks(ctx, ent, anchorX, anchorY, teamColor, scale = 1) {
    if (!BarracksAtlas.ready) {
      // start loading in background; draw fallback prism for now
      BarracksAtlas.ensureLoaded();
      return false;
    }

    // hot-reload pivot overrides (from tuner)
    if (BarracksAtlas._applyPivotOverridesIfChanged) BarracksAtlas._applyPivotOverridesIfChanged();

    const now = performance.now();
    const phase = _getPhase(ent, now);

    const teamId = ent.team;
    const tinted = _ensureTeamAtlas(teamId, teamColor);

    let useAtlas = tinted.idle;
    let frameName = null;

    if (phase === "dead") {
      useAtlas = tinted.dist;
      frameName = _pickFrame(BarracksAtlas.distFrames, now - (ent.deadAt || now), 30, "barrack_distruction_", BarracksAtlas.distStillFrame);
    } else if (phase === "spawn") {
      useAtlas = tinted.cons;
      frameName = _pickFrame(BarracksAtlas.consFrames, now - (ent.bornAt || now), 45, "barrack_const_complete_", null);
    } else {
      useAtlas = tinted.idle;
      frameName = _pickFrame(BarracksAtlas.idleFrames, now, 20, "barrack_idle_", null);
    }

    if (!frameName) return false;

    atlasTP.drawFrame(ctx, useAtlas, frameName, anchorX, anchorY, scale);
    return true;
  };


  
  // ---- Hook into game.js building renderer (sync) ----
  PO.buildings = PO.buildings || {};
  PO.buildings.drawBuilding = function drawBuilding(ent, ctx, cam, helpers, state) {
    if (!ent || !ctx) return false;

    // only barracks for now
    if (ent.kind !== "barracks") return false;

    // ground shadow (matches HQ shadow style)
    try { helpers.drawFootprintDiamond(ent, "rgba(0,0,0,0.22)", "rgba(0,0,0,0)"); } catch (_e) {}

    // anchor at south corner of footprint (same as drawBuildingSprite anchorMode: "south")
    const sx = ent.x + (ent.w * 0.5);
    const sy = ent.y + (ent.h * 0.5);
    const p = helpers.worldToScreen(sx, sy);

    // teamColor: derive from state.colors if available (hex -> {r,g,b})
    let teamColor = null;
    try {
      const hex = (state && state.colors) ? (ent.team === 0 ? state.colors.player : state.colors.enemy) : null;
      if (hex && typeof hex === "string" && hex[0] === "#" && hex.length >= 7) {
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        teamColor = { r, g, b };
      }
    } catch (_e) {}

    return PO.drawBarracks(ctx, ent, p.x, p.y, teamColor, cam && cam.zoom ? cam.zoom : 1);
  };


// Handy debug exposure
  PO.__BarracksAtlas = BarracksAtlas;

  console.log("[barracks:v6] patch loaded. Auto-hooked: PO.buildings.drawBuilding (barracks)(...) from your building renderer.");
})();
