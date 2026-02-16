/* buildings.js - Barracks renderer plugin (pivot + team palette + build anim + death ghost)
   Drop-in: load after atlas_tp.js and before game.js
*/
(() => {
  const PO = (window.PO = window.PO || {});
  PO.buildings = PO.buildings || {};
  const st = PO.buildings._barracks = PO.buildings._barracks || {};

  // PATCH VERSION: v3
  st.version = "v3";
  console.log("[buildings] barracks pivot patch v4 loaded");


  // Tuned to your in-game pivot/scale screenshot
  const BASE_SCALE = 0.22;
  const IDLE_FPS   = 20;
  const BUILD_FPS  = 24;
  const DEATH_FPS  = 20;
  const LOW_HP_RATIO = 0.20;
  const FORCE_PIVOT = { x: 0.4969, y: 0.3302 };
  console.log("[buildings] BASE_SCALE=", BASE_SCALE, "FORCE_PIVOT=", FORCE_PIVOT);
 // from pivot tuner v13 (ingame exact)

  st.ready = false;
  st.loading = false;
  st.atlases = st.atlases || {};
  st.frames  = st.frames  || {};
  st.ghosts  = st.ghosts  || [];
  st._teamTexCache = st._teamTexCache || new Map(); // key: `${atlasKey}|${texIndex}|${team}` => tintedImg

  // --- helpers ---
  const _numSuffix = (name) => {
    const m = name.match(/(\d+)\.png$/);
    return m ? parseInt(m[1], 10) : 0;
  };

  function listFramesByPrefixSorted(atlas, prefix) {
    if (!atlas || !atlas.frames) return [];
    const out = [];
    for (const k of atlas.frames.keys()) if (k.startsWith(prefix)) out.push(k);
    out.sort((a,b) => _numSuffix(a) - _numSuffix(b));
    return out;
  }

  function forcePivotOnAtlas(atlas, pivot) {
    if (!atlas || !atlas.frames) return;
    for (const fr of atlas.frames.values()) {
      fr.pivot = pivot;
      // Some tools/exports may keep this name around; harmless if unused.
      fr.anchor = pivot;
    }
  }

  function _getTeamTextureImg(atlasKey, atlas, texIndex, team) {
    const texArr = atlas && atlas.textures ? atlas.textures : [];
    const tex = texArr[texIndex] || texArr[0];
    const img = tex && tex.img;
    if (!img) return null;

    const key = `${atlasKey}|${texIndex}|${team}`;
    const cached = st._teamTexCache.get(key);
    if (cached) return cached;

    // Prefer the same palette swap algo as the rest of the game, if available.
    // (It lives in game.js and is attached to window.applyTeamPaletteToImage)
    const applyFn =
      (typeof window.applyTeamPaletteToImage === "function" && window.applyTeamPaletteToImage) ||
      (typeof window.replaceMagentaWithTeamColor === "function" && window.replaceMagentaWithTeamColor) ||
      (typeof window.PO?.applyTeamPaletteToImage === "function" && window.PO.applyTeamPaletteToImage) ||
      null;

    if (!applyFn) {
      st._teamTexCache.set(key, img);
      return img;
    }

    const w = img.naturalWidth || img.width;
    const h = img.naturalHeight || img.height;
    if (!w || !h) {
      st._teamTexCache.set(key, img);
      return img;
    }

    const acc = window.TEAM_ACCENT || { PLAYER: [48, 160, 255], ENEMY: [255, 80, 80], NEUTRAL: [200, 200, 200] };
    const arr = (team === 0 ? acc.PLAYER : (team === 1 ? acc.ENEMY : acc.NEUTRAL)) || [255, 255, 255];
    const teamColor = { r: arr[0] | 0, g: arr[1] | 0, b: arr[2] | 0 };

    // applyTeamPaletteToImage reads width/height from the source. Canvas is safest.
    const src = document.createElement('canvas');
    src.width = w; src.height = h;
    const sctx = src.getContext('2d', { willReadFrequently: true });
    sctx.drawImage(img, 0, 0);

    // Tune to match the in-game look (brighter, less muddy).
    const tinted = applyFn(src, teamColor, { gain: 1.65, bias: 0.18, gamma: 0.78, minV: 0.42 }) || img;
    st._teamTexCache.set(key, tinted);
    return tinted;
  }

  function drawFrameTeam(atlasKey, atlas, ctx, filename, x, y, team, scale) {
    if (!atlas || !atlas.frames) return false;
    const fr = atlas.frames.get(filename);
    if (!fr) return false;

    const texIndex = (fr.texIndex != null) ? fr.texIndex : 0;
    const img = _getTeamTextureImg(atlasKey, atlas, texIndex, team);
    if (!img) return false;

    const frame = fr.frame || { x:0, y:0, w:0, h:0 };
    const sss   = fr.spriteSourceSize || { x:0, y:0, w:frame.w, h:frame.h };
    const srcSz = fr.sourceSize || { w: sss.w, h: sss.h };
    const pv    = fr.pivot || FORCE_PIVOT;

    const dx = x - (pv.x * srcSz.w - sss.x) * scale;
    const dy = y - (pv.y * srcSz.h - sss.y) * scale;
    const dw = frame.w * scale;
    const dh = frame.h * scale;

    ctx.drawImage(img, frame.x, frame.y, frame.w, frame.h, dx, dy, dw, dh);
    return true;
  }

  async function ensureAtlasesLoaded() {
    if (st.ready || st.loading) return;
    st.loading = true;

    const atlasTP = PO.atlasTP;
    if (!atlasTP) {
      console.warn("[barracks] atlasTP not loaded yet");
      st.loading = false;
      return;
    }

    const defs = {
      idle: {
        jsonUrl: "asset/sprite/const/normal/barrack/barrack_idle.json",
        base:   "asset/sprite/const/normal/barrack/"
      },
      build: {
        jsonUrl: "asset/sprite/const/const_anim/barrack/barrack_const.json",
        base:   "asset/sprite/const/const_anim/barrack/"
      },
      distruct: {
        jsonUrl: "asset/sprite/const/distruct/barrack/barrack_distruct.json",
        base:   "asset/sprite/const/distruct/barrack/"
      }
    };

    try {
      const [idleA, buildA, dieA] = await Promise.all([
        atlasTP.loadTPAtlasMulti(defs.idle.jsonUrl, defs.idle.base),
        atlasTP.loadTPAtlasMulti(defs.build.jsonUrl, defs.build.base),
        atlasTP.loadTPAtlasMulti(defs.distruct.jsonUrl, defs.distruct.base),
      ]);

      st.atlases.idle = idleA;
      st.atlases.build = buildA;
      st.atlases.distruct = dieA;

      // Frames lists (numeric order)
      const idleAll = listFramesByPrefixSorted(idleA, "barrack_idle");
      st.frames.idleLoop = idleAll.filter(n => n !== "barrack_dist.png");
      st.frames.idleDamage = idleA.frames.has("barrack_dist.png") ? "barrack_dist.png" : null;

      st.frames.build = listFramesByPrefixSorted(buildA, "barrack_con_complete_");
      st.frames.distruct = listFramesByPrefixSorted(dieA, "barrack_distruction_");

      // Pivot: force ALL barracks atlases to the exact pivot from the Pivot Tuner
      const pv = FORCE_PIVOT;
      forcePivotOnAtlas(idleA, pv);
      forcePivotOnAtlas(buildA, pv);
      forcePivotOnAtlas(dieA, pv);

      st.ready = true;
      console.log("[barracks] atlases ready", {
        idle: st.frames.idleLoop.length,
        build: st.frames.build.length,
        distruct: st.frames.distruct.length,
        pivot: pv
      });
    } catch (e) {
      console.error("[barracks] atlas load failed", e);
    } finally {
      st.loading = false;
    }
  }

  // --- public hooks ---
  // Called when an actual building entity is created (construction finished).
  // We use this to start timers at the correct moment (NOT first time drawn).
  PO.buildings.onPlaced = function(b, state){
    if (!b || b.kind!=="barracks") return;
    const now = (state && state.t!=null) ? state.t : (performance.now()/1000);
    b._barrackSeen = true;
    b._barrackIdleT0 = now;
    if (!b._barrackNoBuildAnim){
      b._barrackBuildT0 = now;
      b._barrackBuildDone = false;
    }else{
      b._barrackBuildT0 = null;
      b._barrackBuildDone = true;
    }
  };

  // Selling: replay build animation in reverse, then game.js removes footprint.
  PO.buildings.onSold = function(b, state){
    if (!b || b.kind!=="barracks") return;
    // Ensure atlases are loading; if not ready yet, game.js will still delay a bit.
    if (!st.ready) ensureAtlasesLoaded();
    const now = (state && state.t!=null) ? state.t : (performance.now()/1000);
    const n = (st.frames && st.frames.build && st.frames.build.length) ? st.frames.build.length : 17;
    const dur = n / BUILD_FPS;
    b._barrackSelling = true;
    b._barrackSellT0 = now;
    b._barrackSellFinalizeAt = now + dur;
    // While selling, ignore build->idle state machine
    b._barrackBuildDone = true;
    b._barrackBuildT0 = null;
  };

  PO.buildings.onDestroyed = function(b, state){
    // Called from game.js destroyBuilding() after removing the entity from state.
    // We spawn a ghost that replays distruct frames at the old position.
    // Guard: do not affect other buildings.
    if (!b || b.kind !== "barracks") return;
    try {
      const now = (state && state.t!=null) ? state.t : (performance.now() / 1000);
      st.ghosts.push({
        x: b.x, y: b.y,
        tw: b.tw, th: b.th,
        team: b.team ?? 0,
        t0: now
      });
    } catch (e) {
      console.warn("[barracks] onDestroyed failed", e);
    }
  };

  PO.buildings.drawGhosts = function(ctx, cam, helpers, state) {
    if (!st.ready || !st.frames.distruct.length) return;
    const now = state && state.t != null ? state.t : (performance.now() / 1000);
    const scale = BASE_SCALE * (cam && cam.zoom ? cam.zoom : 1);

    // Iterate backwards so splice is safe
    for (let i = st.ghosts.length - 1; i >= 0; i--) {
      const g = st.ghosts[i];
      const dt = Math.max(0, now - g.t0);
      const idx = Math.floor(dt * DEATH_FPS);

      if (idx >= st.frames.distruct.length) {
        st.ghosts.splice(i, 1);
        continue;
      }

      const p = helpers.worldToScreen(g.x, g.y);
      const z = (cam && cam.zoom ? cam.zoom : 1);
      const dz = Math.max(g.tw, g.th) * helpers.ISO_Y * (BASE_SCALE * z);
      const sx = p.x;
      const sy = p.y - dz;

      drawFrameTeam("distruct", st.atlases.distruct, ctx, st.frames.distruct[idx], sx, sy, g.team, scale);
    }
  };

  PO.buildings.drawBuilding = function(ent, ctx, cam, helpers, state) {
    // Only handle barracks; let default renderer do other buildings.
    if (!ent || ent.kind !== "barracks") return false;

    // Fire and forget load (first draw will show prism; next draw will show sprite)
    if (!st.ready) {
      ensureAtlasesLoaded();
      return false;
    }

    const now = state && state.t != null ? state.t : (performance.now() / 1000);
    const z = cam && cam.zoom ? cam.zoom : 1;
    const scale = BASE_SCALE * z;

    const p = helpers.worldToScreen(ent.x, ent.y);
    const dz = Math.max(ent.tw, ent.th) * helpers.ISO_Y * (BASE_SCALE * z);
    const sx = p.x;
    const sy = p.y - dz;

    const team = ent.team ?? 0;

    // One-time build animation (when the building first becomes a real building)
    // If you ever want to skip build anim for starting buildings, set ent._barrackNoBuildAnim=true in spawn.
    if (!ent._barrackSeen) {
      ent._barrackSeen = true;
      ent._barrackIdleT0 = now;
      if (!ent._barrackNoBuildAnim) ent._barrackBuildT0 = now;
    }

        // Selling (reverse of build animation)
    if (ent._barrackSelling && st.frames.build.length){
      const t0s = ent._barrackSellT0 != null ? ent._barrackSellT0 : (ent._barrackSellT0 = now);
      const dtS = Math.max(0, now - t0s);
      const idxR = (st.frames.build.length - 1) - Math.floor(dtS * BUILD_FPS);
      if (idxR >= 0){
        return drawFrameTeam("build", st.atlases.build, ctx, st.frames.build[idxR], sx, sy, team, scale);
      }
      // Done: keep returning true (draw nothing). game.js will remove footprint/alive.
      return true;
    }

// If dead, do not draw here; ghost will play (destroyBuilding calls onDestroyed)
    if ((ent.hp ?? 1) <= 0) return true;

    // Build -> Idle state machine
    if (ent._barrackBuildT0 != null && !ent._barrackBuildDone && st.frames.build.length) {
      const dt = Math.max(0, now - ent._barrackBuildT0);
      const idx = Math.floor(dt * BUILD_FPS);
      if (idx < st.frames.build.length) {
        return drawFrameTeam("build", st.atlases.build, ctx, st.frames.build[idx], sx, sy, team, scale);
      }
      ent._barrackBuildDone = true;
      // continue to idle
    }

    // Idle loop vs damaged sprite
    const hp = ent.hp ?? 1;
    const hpMax = ent.hpMax ?? ent.maxHp ?? 1;
    const ratio = hpMax > 0 ? (hp / hpMax) : 1;

    if (ratio <= LOW_HP_RATIO && st.frames.idleDamage) {
      return drawFrameTeam("idle", st.atlases.idle, ctx, st.frames.idleDamage, sx, sy, team, scale);
    }

    if (!st.frames.idleLoop.length) return false;
    const t0 = ent._barrackIdleT0 != null ? ent._barrackIdleT0 : (ent._barrackIdleT0 = now);
    const idx = Math.floor(Math.max(0, now - t0) * IDLE_FPS) % st.frames.idleLoop.length;
    return drawFrameTeam("idle", st.atlases.idle, ctx, st.frames.idleLoop[idx], sx, sy, team, scale);
  };

})();
