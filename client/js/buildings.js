
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
  const PO = G.PO2 || G.PO || (G.PO2 = {});
  const atlasTP = (PO && PO.atlasTP) || (G.PO && G.PO.atlasTP) || null;

  if (!atlasTP || typeof atlasTP.loadTPAtlasMulti !== "function" || typeof atlasTP.drawFrame !== "function") {
    console.warn("[barracks:v5] atlasTP not found. Make sure atlas_tp.js is loaded before this file.");
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
        console.log("[barracks:v5] loading atlases...");
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
        console.log("[barracks:v5] atlases ready:",
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

  // ---- Optional: team tinting (uses your game's existing helper if present) ----
  // We try these function names because your project has used a few variants.
  const tintFn =
    G._applyTeamPaletteToImage ||
    G.applyTeamPaletteToImage ||
    G.replaceMagentaWithTeamColor ||
    null;

  async function _ensureTeamAtlas(teamId, teamColor) {
    // If no tint function, just reuse base atlases.
    if (!tintFn) return {
      idle: BarracksAtlas.idleAtlas,
      cons: BarracksAtlas.constAtlas,
      dist: BarracksAtlas.distructAtlas,
    };

    if (BarracksAtlas.teamAtlases[teamId]) return BarracksAtlas.teamAtlases[teamId];

    // Create shallow copies with tinted spritesheet images.
    // tintFn is expected to return an Image (or Promise<Image>).
    const makeTinted = async (baseAtlas) => {
      const tintedImg = await tintFn(baseAtlas.img, teamColor);
      return { ...baseAtlas, img: tintedImg };
    };

    const tinted = {
      idle: await makeTinted(BarracksAtlas.idleAtlas),
      cons: await makeTinted(BarracksAtlas.constAtlas),
      dist: await makeTinted(BarracksAtlas.distructAtlas),
    };
    BarracksAtlas.teamAtlases[teamId] = tinted;
    return tinted;
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
  PO.drawBarracks = async function drawBarracks(ctx, ent, x, y, teamColor) {
    await BarracksAtlas.ensureLoaded();

    const now = (typeof performance !== "undefined" && performance.now) ? performance.now() : Date.now();
    const { phase, t } = _getPhase(ent, now);

    // Decide which animation to show
    let atlas = BarracksAtlas.idleAtlas;
    let frameName = null;

    if (phase === "dead") {
      // play distruct once, then show ruin still
      const fps = 12;
      frameName = _pickFrame(BarracksAtlas.distructFrames, t, fps, false);
      atlas = BarracksAtlas.distructAtlas;
      const done = (BarracksAtlas.distructFrames.length > 0) && (t * fps >= BarracksAtlas.distructFrames.length);
      if (!frameName || done) {
        atlas = BarracksAtlas.idleAtlas;
        frameName = BarracksAtlas.distStillFrame;
      }
    } else {
      // Spawn: show "const complete" for the first ~1.2s, then idle loop
      const spawnSec = 1.2;
      if (BarracksAtlas.constFrames.length > 0 && t < spawnSec) {
        const fps = Math.max(10, Math.round(BarracksAtlas.constFrames.length / spawnSec));
        frameName = _pickFrame(BarracksAtlas.constFrames, t, fps, false);
        atlas = BarracksAtlas.constAtlas;
      } else {
        frameName = _pickFrame(BarracksAtlas.idleFrames, t, 6, true);
        atlas = BarracksAtlas.idleAtlas;
      }
    }

    if (!frameName) return false;

    // Team tint (optional)
    let useAtlas = atlas;
    if (teamColor) {
      const teamId = (ent.team != null) ? ent.team : 0;
      const tinted = await _ensureTeamAtlas(teamId, teamColor);
      if (useAtlas === BarracksAtlas.idleAtlas) useAtlas = tinted.idle;
      if (useAtlas === BarracksAtlas.constAtlas) useAtlas = tinted.cons;
      if (useAtlas === BarracksAtlas.distructAtlas) useAtlas = tinted.dist;
    }

    // Draw
    const ok = atlasTP.drawFrame(ctx, useAtlas, frameName, x, y);
    return ok;
  };

  // Handy debug exposure
  PO.__BarracksAtlas = BarracksAtlas;

  console.log("[barracks:v5] patch loaded. Next: call PO.drawBarracks(...) from your building renderer.");
})();
