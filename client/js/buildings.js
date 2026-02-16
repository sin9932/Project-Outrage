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


  
  // Tuned to your in-game pivot/scale screenshots
  // Barracks (기존): BASE_SCALE=0.22, pivot≈(0.5000,0.4850)
  // Power (발전소):  BASE_SCALE=0.25, pivot≈(0.4889,0.5048)
  const TYPE_CFG = {
    barracks: {
      baseScale: 0.22,
      forcePivot: { x: 0.5000, y: 0.4850 },
      fps: { idle: 20, build: 24, death: 20 },
      lowHpRatio: 0.20,
      // Asset locations (same convention as your barracks)
      atlas: {
        idle:  { json: "asset/sprite/const/normal/barrack/barrack_idle.json",        base: "asset/sprite/const/normal/barrack/" },
        build: { json: "asset/sprite/const/const_anim/barrack/barrack_const.json",   base: "asset/sprite/const/const_anim/barrack/" },
        death: { json: "asset/sprite/const/distruct/barrack/barrack_distruction.json", base: "asset/sprite/const/distruct/barrack/" }
      },
      prefix: { idle: "barrack_idle", build: "barrack_const", death: "barrack_distruction" },
      entKey: { buildT0: "_barrackBuildT0", buildDone: "_barrackBuildDone" }
    },

    power: {
      baseScale: 0.25,
      forcePivot: { x: 0.4889, y: 0.5048 },
      fps: { idle: 20, build: 24, death: 20 },
      lowHpRatio: 0.20,
      atlas: {
        idle:  { json: "asset/sprite/const/normal/power/power_idle.json",        base: "asset/sprite/const/normal/power/" },
        build: { json: "asset/sprite/const/const_anim/power/power_const.json",   base: "asset/sprite/const/const_anim/power/" },
        death: { json: "asset/sprite/const/distruct/power/power_distruction.json", base: "asset/sprite/const/distruct/power/" }
      },
      prefix: { idle: "power_idle", build: "power_const", death: "power_distruction" },
      entKey: { buildT0: "_powerBuildT0", buildDone: "_powerBuildDone" }
    }
  };

  // ===== Internal state per building kind =====
  function makeState(kind){
    return {
      kind,
      ready: false,
      atlases: { idle:null, build:null, death:null },
      frames:  { idle:[],   build:[],   death:[] },
      // per-kind team texture cache: key -> canvas/image
      teamTexCache: new Map(),
    };
  }

  const ST = {
    kinds: {
      barracks: makeState("barracks"),
      power: makeState("power"),
    },
    ghosts: [], // { kind, x,y, tw,th, team, t0 }
  };

  // ===== Helpers =====
  function _numSuffix(name){
    // Extract trailing number before extension: foo_12.png / foo12.png
    const m = /(\d+)(?=\.[a-zA-Z0-9]+$)/.exec(name);
    return m ? parseInt(m[1], 10) : NaN;
  }

  function listFramesSmart(atlas, prefix){
    if (!atlas || !atlas.frames) return [];
    const all = Array.from(atlas.frames.keys());
    if (!all.length) return [];

    let arr = all;
    if (prefix) {
      const hasPref = all.some(n => n.startsWith(prefix));
      if (hasPref) arr = all.filter(n => n.startsWith(prefix));
    }

    arr.sort((a,b)=>{
      const na=_numSuffix(a), nb=_numSuffix(b);
      const aN = Number.isFinite(na), bN = Number.isFinite(nb);
      if (aN && bN) return na-nb;
      if (aN && !bN) return -1;
      if (!aN && bN) return 1;
      return a.localeCompare(b);
    });
    return arr;
  }

  function _getTeamColor(state, team){
    // game.js uses state.colors.player/enemy, but fallback to default if missing
    const c = (state && state.colors) ? (team===0 ? state.colors.player : state.colors.enemy) : (team===0 ? "#00b7ff" : "#ff3b3b");
    // normalize to {r,g,b}
    if (typeof c === "string"){
      const hex = c.startsWith("#") ? c.slice(1) : c;
      const v = parseInt(hex, 16);
      return { r:(v>>16)&255, g:(v>>8)&255, b:v&255 };
    }
    return c && typeof c==="object" ? c : { r:0, g:183, b:255 };
  }

  function _getApplyFn(){
    // game.js patch provides _applyTeamPaletteToImage on window (not guaranteed)
    // Prefer PO.applyTeamPaletteToImage if you exposed it, else use global function if present.
    return (window._applyTeamPaletteToImage || (window.PO && PO.applyTeamPaletteToImage) || null);
  }

  function _getTeamTextureImg(stKind, atlasKey, atlas, texIndex, team, state){
    const tex = atlas.textures && atlas.textures[texIndex];
    const img = tex && tex.img;
    if (!img) return null;

    const key = `${stKind.kind}|${atlasKey}|${texIndex}|${team}`;
    if (stKind.teamTexCache.has(key)) return stKind.teamTexCache.get(key);

    const applyFn = _getApplyFn();
    if (!applyFn){
      // No palette function available; just use original
      stKind.teamTexCache.set(key, img);
      return img;
    }

    const teamColor = _getTeamColor(state, team);
    const tinted = applyFn(img, teamColor, { gain: 1.65, bias: 0.18, gamma: 0.78, minV: 0.42 }) || img;
    stKind.teamTexCache.set(key, tinted);
    return tinted;
  }

  function drawFrameTeam(kind, atlasKey, atlas, ctx, filename, x, y, team, scale, state){
    if (!atlas || !atlas.frames) return false;
    const fr = atlas.frames.get(filename);
    if (!fr) return false;

    const stKind = ST.kinds[kind];
    const cfg = TYPE_CFG[kind];

    const texIndex = (fr.texIndex != null) ? fr.texIndex : 0;
    const img = _getTeamTextureImg(stKind, atlasKey, atlas, texIndex, team, state);
    if (!img) return false;

    const frame = fr.frame || { x:0, y:0, w:0, h:0 };
    const sss   = fr.spriteSourceSize || { x:0, y:0, w:frame.w, h:frame.h };
    const srcSz = fr.sourceSize || { w: sss.w, h: sss.h };
    const pv    = fr.pivot || fr.anchor || cfg.forcePivot;

    // drawFrame (no rotation support) – your atlases are unrotated
    const dx = x - (pv.x * srcSz.w - sss.x) * scale;
    const dy = y - (pv.y * srcSz.h - sss.y) * scale;
    const dw = frame.w * scale;
    const dh = frame.h * scale;

    ctx.drawImage(img, frame.x, frame.y, frame.w, frame.h, dx, dy, dw, dh);
    return true;
  }

  // ===== Load atlases per kind =====
  async function ensureKindLoaded(kind){
    const stKind = ST.kinds[kind];
    if (!stKind || stKind.ready) return;
    const cfg = TYPE_CFG[kind];
    const atp = (window.PO && PO.atlasTP) || null;
    if (!atp || !atp.loadAtlasTPMulti) return;

    try{
      const [idleA, buildA, deathA] = await Promise.all([
        atp.loadAtlasTPMulti(cfg.atlas.idle.json,  cfg.atlas.idle.base),
        atp.loadAtlasTPMulti(cfg.atlas.build.json, cfg.atlas.build.base),
        atp.loadAtlasTPMulti(cfg.atlas.death.json, cfg.atlas.death.base),
      ]);

      stKind.atlases.idle  = idleA;
      stKind.atlases.build = buildA;
      stKind.atlases.death = deathA;

      stKind.frames.idle  = listFramesSmart(idleA,  cfg.prefix.idle);
      stKind.frames.build = listFramesSmart(buildA, cfg.prefix.build);
      stKind.frames.death = listFramesSmart(deathA, cfg.prefix.death);

      stKind.ready = true;
      console.log(`[buildings] ${kind} atlases loaded`, stKind.frames);
    }catch(e){
      console.warn(`[buildings] ${kind} atlas load failed`, e);
    }
  }

  function ensureAllKindsLoaded(){
    ensureKindLoaded("barracks");
    ensureKindLoaded("power");
  }

  // ===== Hooks =====
  PO.buildings.onPlaced = function(b, state){
    if (!b || !TYPE_CFG[b.kind]) return;
    const now = (state && state.t!=null) ? state.t : (performance.now()/1000);
    const ek = TYPE_CFG[b.kind].entKey;
    b[ek.buildT0] = now;
    b[ek.buildDone] = false;
  };

  PO.buildings.onDestroyed = function(b, state){
    if (!b || !TYPE_CFG[b.kind]) return;
    const now = (state && state.t!=null) ? state.t : (performance.now()/1000);

    // push a ghost destruction animation at the building's world position
    try{
      ST.ghosts.push({
        kind: b.kind,
        x: b.x, y: b.y,
        tw: b.tw, th: b.th,
        team: b.team ?? 0,
        t0: now
      });
    }catch(e){
      console.warn("[buildings] onDestroyed failed", e);
    }
  };

  // ===== Draw =====
  PO.buildings.drawGhosts = function(ctx, cam, helpers, state){
    const now = (state && state.t!=null) ? state.t : (performance.now()/1000);
    const z = (cam && cam.zoom) ? cam.zoom : 1;

    for (let i = ST.ghosts.length - 1; i >= 0; i--){
      const g = ST.ghosts[i];
      const cfg = TYPE_CFG[g.kind];
      const stKind = ST.kinds[g.kind];
      if (!cfg || !stKind || !stKind.ready || !stKind.frames.death.length){
        ST.ghosts.splice(i,1);
        continue;
      }

      const dt = Math.max(0, now - g.t0);
      const idx = Math.floor(dt * cfg.fps.death);
      if (idx >= stKind.frames.death.length){
        ST.ghosts.splice(i,1);
        continue;
      }

      const scale = cfg.baseScale * z;
      const p = helpers.worldToScreen(g.x, g.y);
      // Align to building base (same as barracks: origin at ent.x/y)
      const sx = p.x;
      const sy = p.y;

      drawFrameTeam(g.kind, "death", stKind.atlases.death, ctx, stKind.frames.death[idx], sx, sy, g.team, scale, state);
    }
  };

  PO.buildings.drawBuilding = function(ent, ctx, cam, helpers, state){
    if (!ent || !TYPE_CFG[ent.kind]) return false;

    // lazy load atlases
    ensureAllKindsLoaded();
    const stKind = ST.kinds[ent.kind];
    if (!stKind || !stKind.ready) return false;

    const cfg = TYPE_CFG[ent.kind];
    const now = (state && state.t!=null) ? state.t : (performance.now()/1000);
    const z = (cam && cam.zoom) ? cam.zoom : 1;
    const scale = cfg.baseScale * z;

    const p = helpers.worldToScreen(ent.x, ent.y);
    const sx = p.x;
    const sy = p.y;

    const team = ent.team ?? 0;

    // If dead, do not draw here; ghost will play.
    if ((ent.hp ?? 1) <= 0) return true;

    // Build -> Idle
    const ek = cfg.entKey;
    if (ent[ek.buildT0] != null && !ent[ek.buildDone] && stKind.frames.build.length){
      const dt = Math.max(0, now - ent[ek.buildT0]);
      const idx = Math.floor(dt * cfg.fps.build);
      if (idx < stKind.frames.build.length){
        return drawFrameTeam(ent.kind, "build", stKind.atlases.build, ctx, stKind.frames.build[idx], sx, sy, team, scale, state);
      }
      ent[ek.buildDone] = true;
    }

    // Low HP: optionally show last idle frame (or same idle) – keep simple
    const frames = stKind.frames.idle;
    if (!frames.length) return false;

    const idx = Math.floor(now * cfg.fps.idle) % frames.length;
    return drawFrameTeam(ent.kind, "idle", stKind.atlases.idle, ctx, frames[idx], sx, sy, team, scale, state);
  };

  console.log("[buildings] barracks+power pivot patch v5 loaded");
})();
