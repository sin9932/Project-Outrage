/* buildings.js - Barracks renderer plugin (pivot + team palette + build anim + death ghost)
   Drop-in: load after atlas_tp.js and before game.js
*/
(() => {
  const PO = (window.PO = window.PO || {});
  const DEBUG = false; // set true to see building/atlas logs
  PO.buildings = PO.buildings || {};
  const st = PO.buildings._barracks = PO.buildings._barracks || {};

  // PATCH VERSION: v3
  st.version = "v6";
  console.log("[buildings] barracks+power pivot patch v6 loaded");


  
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
    ,
      sellKey: { flag: "_barrackSelling", t0: "_barrackSellT0", finalizeAt: "_barrackSellFinalizeAt" }
    },

    power: {
      baseScale: 0.25,
      forcePivot: { x: 0.4889, y: 0.5048 },
      fps: { idle: 20, build: 24, death: 20 },
      lowHpRatio: 0.30,
      atlas: {
        idle:  { json: "asset/sprite/const/normal/power/power_idle.json",        base: "asset/sprite/const/normal/power/" },
        build: { json: "asset/sprite/const/const_anim/power/power_const.json",   base: "asset/sprite/const/const_anim/power/" },
        death: { json: "asset/sprite/const/distruct/power/power_distruction.json", base: "asset/sprite/const/distruct/power/" }
      },
      prefix: { idle: "power_idle", build: "power_const", death: "power_distruction" },
      entKey: { buildT0: "_powerBuildT0", buildDone: "_powerBuildDone" }
    ,
      sellKey: { flag: "_powerSelling", t0: "_powerSellT0", finalizeAt: "_powerSellFinalizeAt" }
    }
    ,
    refinery: {
      baseScale: 0.3,
      forcePivot: { x: 0.4911, y: 0.6424 },
      fps: { idle: 20, build: 24, death: 20, active: 24 },
      lowHpRatio: 0.30,
      teamColorMode: "frame",
      // Exclude chimney area from team palette (coords in SOURCE size px)
      teamExclude: [
        { x: 980, y: 40, w: 520, h: 420 }
      ],
      atlas: {
        idle:  { json: "asset/sprite/const/normal/refinery/refinery_idle.json",        base: "asset/sprite/const/normal/refinery/" },
        build: { json: "asset/sprite/const/const_anim/refinery/refinery_const.json",   base: "asset/sprite/const/const_anim/refinery/" },
        death: { json: "asset/sprite/const/distruct/refinery/refinery_distruction.json", base: "asset/sprite/const/distruct/refinery/" }
      },
      prefix: { idle: "refinery", build: "refinery_con_complete", death: "refinery_distruction" },
      entKey: { buildT0: "_refineryBuildT0", buildDone: "_refineryBuildDone" }
    ,
      sellKey: { flag: "_refinerySelling", t0: "_refinerySellT0", finalizeAt: "_refinerySellFinalizeAt" }
    }
  };

  // ===== Internal state per building kind =====
  function makeState(kind){
    return {
      kind,
      ready: false,
      atlases: { idle:null, build:null, death:null },
      frames:  { idle:[], build:[], death:[], idleOk:[], idleBad:[] },
      // per-kind team texture cache: key -> canvas/image
      teamTexCache: new Map(),
      // per-frame tint cache (for large atlases)
      frameTexCache: new Map(),
    };
  }

  const ST = {
    kinds: {
      barracks: makeState("barracks"),
      power: makeState("power"),
      refinery: makeState("refinery"),
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
    const all = Array.from(atlas.frames.keys()).filter(n => typeof n === 'string');
    if (!all.length) return [];

    let arr = all;
    if (prefix) {
      const hasPref = all.some(n => typeof n === 'string' && n.startsWith(prefix));
      if (hasPref) arr = all.filter(n => typeof n === 'string' && n.startsWith(prefix));
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

    const cfg = TYPE_CFG[stKind.kind];
    if (cfg && cfg.teamColorMode === "frame"){
      // Skip full-atlas tint for heavy sheets (use per-frame tint instead).
      stKind.teamTexCache.set(key, img);
      return img;
    }

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
    let img = _getTeamTextureImg(stKind, atlasKey, atlas, texIndex, team, state);
    if (!img) return false;

    const tex = atlas.textures && atlas.textures[texIndex];
    const origImg = tex && tex.img ? tex.img : img;
    let didTint = (img !== origImg);

    // Per-frame tint for large atlases (e.g. refinery) to avoid huge one-time cost.
    if (!didTint && cfg && cfg.teamColorMode === "frame"){
      const fKey = `${atlasKey}|${filename}|t${team}`;
      if (stKind.frameTexCache.has(fKey)){
        img = stKind.frameTexCache.get(fKey);
        didTint = (img && img !== origImg);
      } else {
        const applyFn = _getApplyFn();
        if (applyFn){
          const c = document.createElement("canvas");
          c.width = fr.frame.w;
          c.height = fr.frame.h;
          const cctx = c.getContext("2d", { willReadFrequently:true });
          cctx.drawImage(origImg, fr.frame.x, fr.frame.y, fr.frame.w, fr.frame.h, 0, 0, fr.frame.w, fr.frame.h);
          const teamColor = _getTeamColor(state, team);
          const tinted = applyFn(c, teamColor, { gain: 1.65, bias: 0.18, gamma: 0.78, minV: 0.42 }) || c;
          stKind.frameTexCache.set(fKey, tinted);
          img = tinted;
          didTint = true;
        }
      }
    }

    const frame = fr.frame || { x:0, y:0, w:0, h:0 };
    const sss   = fr.spriteSourceSize || { x:0, y:0, w:frame.w, h:frame.h };
    const srcSz = fr.sourceSize || { w: sss.w, h: sss.h };
    // For death frames, force pivot to match idle/build (avoid atlas pivot drift).
    const pv    = (kind === "refinery")
      ? cfg.forcePivot
      : ((atlasKey === "death")
        ? cfg.forcePivot
        : (fr.pivot || fr.anchor || cfg.forcePivot));

    // drawFrame (no rotation support) – your atlases are unrotated
    const dx = x - (pv.x * srcSz.w - sss.x) * scale;
    const dy = y - (pv.y * srcSz.h - sss.y) * scale;
    const dw = frame.w * scale;
    const dh = frame.h * scale;

    const useFrameImg = (cfg && cfg.teamColorMode === "frame" && img !== origImg);
    if (useFrameImg){
      ctx.drawImage(img, 0, 0, frame.w, frame.h, dx, dy, dw, dh);
    } else {
      ctx.drawImage(img, frame.x, frame.y, frame.w, frame.h, dx, dy, dw, dh);
    }

    // Restore original pixels for excluded regions (e.g. refinery chimney)
    if (didTint && cfg && cfg.teamExclude && cfg.teamExclude.length){
      for (const r of cfg.teamExclude){
        if (!r) continue;
        const ex0 = r.x, ey0 = r.y, ex1 = r.x + r.w, ey1 = r.y + r.h;
        const ix0 = Math.max(0, ex0 - sss.x);
        const iy0 = Math.max(0, ey0 - sss.y);
        const ix1 = Math.min(sss.w, ex1 - sss.x);
        const iy1 = Math.min(sss.h, ey1 - sss.y);
        if (ix1 <= ix0 || iy1 <= iy0) continue;

        const sw = ix1 - ix0;
        const sh = iy1 - iy0;
        const sx = frame.x + ix0;
        const sy = frame.y + iy0;
        const dx2 = dx + ix0 * scale;
        const dy2 = dy + iy0 * scale;
        ctx.drawImage(origImg, sx, sy, sw, sh, dx2, dy2, sw * scale, sh * scale);
      }
    }
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

      // Split idle frames into "normal" vs "damaged" variants.
      // Some atlases (e.g. refinery_idle.json) pack n_active + d_active together.
      const _idleAll = stKind.frames.idle || [];
      if (kind === "refinery"){
        const activeN = _idleAll.filter(n => /_n_active_/i.test(String(n||"")));
        const activeD = _idleAll.filter(n => /_d_active_/i.test(String(n||"")));
        let idleOnly = _idleAll.filter(n => /refinery_idle/i.test(String(n||"")));
        if (!idleOnly.length){
          idleOnly = _idleAll.filter(n => !/_n_active_|_d_active_/i.test(String(n||"")));
        }

        const buildNumMap = (arr)=>{
          const map = new Map();
          const nums = [];
          for (const n of arr){
            const num = _numSuffix(n);
            if (Number.isFinite(num)){
              map.set(num, n);
              nums.push(num);
            }
          }
          nums.sort((a,b)=>a-b);
          return { map, nums };
        };
        const nMap = buildNumMap(activeN);
        const dMap = buildNumMap(activeD);
        const commonNums = nMap.nums.filter(x => dMap.map.has(x));
        const activeNums = commonNums.length ? commonNums : (nMap.nums.length ? nMap.nums : dMap.nums);

        stKind.frames.activeN = activeN;
        stKind.frames.activeD = activeD;
        stKind.frames.activeMapN = nMap.map;
        stKind.frames.activeMapD = dMap.map;
        stKind.frames.activeNums = activeNums;

        // Refinery idle: idle1 = normal, idle2 = damaged (per your definition)
        const idle1 = idleOnly.filter(n => /refinery_idle1/i.test(String(n||"")));
        const idle2 = idleOnly.filter(n => /refinery_idle2/i.test(String(n||"")));
        if (idle1.length || idle2.length){
          stKind.frames.idleOk  = idle1.length ? idle1 : idleOnly;
          stKind.frames.idleBad = idle2;
        } else {
          stKind.frames.idleOk  = idleOnly.length ? idleOnly : _idleAll;
          stKind.frames.idleBad = [];
        }
      } else {
        const _hasNActive = _idleAll.some(n => /_n_active_/i.test(String(n||"")));
        const _hasDActive = _idleAll.some(n => /_d_active_/i.test(String(n||"")));
        let _idleOk = [];
        let _idleBad = [];
        if (_hasNActive || _hasDActive){
          _idleOk  = _idleAll.filter(n => /_n_active_/i.test(String(n||"")));
          _idleBad = _idleAll.filter(n => /_d_active_/i.test(String(n||"")));
          if (!_idleOk.length){
            _idleOk = _idleAll.filter(n => !/_d_active_/i.test(String(n||"")));
          }
        } else {
          const _isDamagedName = (n)=>/dist|distruct|destroy|wreck|ruin/i.test(String(n||""));
          _idleBad = _idleAll.filter(_isDamagedName);
          _idleOk  = _idleAll.filter(n=>!_isDamagedName(n));
        }
        stKind.frames.idleOk  = _idleOk.length ? _idleOk : _idleAll;
        stKind.frames.idleBad = _idleBad;
      }
      stKind.ready = true;
      DEBUG && console.log(`[buildings] ${kind} atlases loaded`, stKind.frames);
    }catch(e){
      console.warn(`[buildings] ${kind} atlas load failed`, e);
    }
  }

  let _preloadAllPromise = null;
  function ensureAllKindsLoaded(){
    if (_preloadAllPromise) return _preloadAllPromise;
    _preloadAllPromise = Promise.all([
      ensureKindLoaded("barracks"),
      ensureKindLoaded("power"),
      ensureKindLoaded("refinery")
    ]);
    return _preloadAllPromise;
  }

  // ===== Hooks =====
  PO.buildings.onPlaced = function(b, state){
    if (!b || !TYPE_CFG[b.kind]) return;
    const now = (state && state.t!=null) ? state.t : (performance.now()/1000);
    const ek = TYPE_CFG[b.kind].entKey;
    b[ek.buildT0] = now;
    b[ek.buildDone] = false;
  };

  // Selling: play build animation in reverse, then let game.js remove it when finalizeAt hits.
  PO.buildings.onSold = function(b, state){
    if (!b || !TYPE_CFG[b.kind]) return;
    ensureAllKindsLoaded();

    const cfg = TYPE_CFG[b.kind];
    const stKind = ST.kinds[b.kind];
    const now = (state && state.t!=null) ? state.t : (performance.now()/1000);

    const sk = cfg.sellKey || {};
    const flag = sk.flag || ("_" + b.kind + "Selling");
    const t0   = sk.t0   || ("_" + b.kind + "SellT0");
    const fin  = sk.finalizeAt || ("_" + b.kind + "SellFinalizeAt");

    // duration based on build frames (fallback 0.9s)
    const n = (stKind && stKind.frames && stKind.frames.build && stKind.frames.build.length) ? stKind.frames.build.length : 0;
    const dur = (n>0) ? (n / (cfg.fps.build || 24)) : 0.9;

    b[flag] = true;
    b[t0] = now;
    b[fin] = now + dur;

    // Freeze build state so it doesn't restart
    const ek = cfg.entKey;
    if (ek && ek.buildT0)   b[ek.buildT0] = null;
    if (ek && ek.buildDone) b[ek.buildDone] = true;
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

    // Selling: reverse-play the build animation (like barracks), then game.js will delete it at finalizeAt.
    const sk = cfg.sellKey || {};
    if (sk.flag && ent[sk.flag] && stKind.frames.build.length){
      const t0 = (sk.t0 && ent[sk.t0]!=null) ? ent[sk.t0] : now;
      if (sk.t0 && ent[sk.t0]==null) ent[sk.t0] = t0;
      const dt = Math.max(0, now - t0);
      const idxF = Math.floor(dt * (cfg.fps.build || 24));
      const rev = (stKind.frames.build.length - 1) - idxF;
      const clamped = Math.max(0, Math.min(stKind.frames.build.length - 1, rev));
      return drawFrameTeam(ent.kind, "build", stKind.atlases.build, ctx, stKind.frames.build[clamped], sx, sy, team, scale, state);
    }

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

    // Idle/Active: choose normal vs damaged variant based on HP ratio
    const maxHp = (ent.maxHp ?? ent.maxHP ?? ent.hpMax ?? ent.hp_max ?? ent.hp ?? 1);
    const hpNow = (ent.hp ?? maxHp);
    const hpRatio = (maxHp>0) ? (hpNow / maxHp) : 1;

    // Refinery: play active animation only on deposit (harvester attached).
    if (ent.kind === "refinery" && ent._activeT0 != null){
      const activeNums = stKind.frames.activeNums || [];
      const activeN = stKind.frames.activeN || [];
      const activeD = stKind.frames.activeD || [];
      if (activeNums.length || activeN.length || activeD.length){
        const fpsA = cfg.fps.active || cfg.fps.idle || 20;
        const len = activeNums.length || activeN.length || activeD.length || 1;
        const dt = Math.max(0, now - ent._activeT0);
        const dur = len / fpsA;
        if (dt <= dur){
          const idx = Math.floor(dt * fpsA) % len;
          const num = activeNums.length ? activeNums[idx] : null;
          const useDamaged = (hpRatio < cfg.lowHpRatio) && activeD.length;
          const map = useDamaged ? stKind.frames.activeMapD : stKind.frames.activeMapN;
          let fname = (num!=null && map && map.get(num)) ? map.get(num) : null;
          if (!fname){
            const arr = useDamaged ? activeD : activeN;
            if (arr && arr.length) fname = arr[idx % arr.length];
          }
          if (fname){
            return drawFrameTeam(ent.kind, "idle", stKind.atlases.idle, ctx, fname, sx, sy, team, scale, state);
          }
        }
      }
    }

    const useDamaged = (hpRatio < cfg.lowHpRatio) && (stKind.frames.idleBad && stKind.frames.idleBad.length);
    const frames = useDamaged
      ? stKind.frames.idleBad
      : ((stKind.frames.idleOk && stKind.frames.idleOk.length) ? stKind.frames.idleOk : stKind.frames.idle);

    if (!frames || !frames.length) return false;

    const idx = (frames.length <= 1) ? 0 : (Math.floor(now * (cfg.fps.idle || 1)) % frames.length);
    return drawFrameTeam(ent.kind, "idle", stKind.atlases.idle, ctx, frames[idx], sx, sy, team, scale, state);
};

  console.log("[buildings] barracks+power pivot patch v8 loaded");
  // Expose preload for boot-time asset warmup
  PO.buildings.preload = ensureAllKindsLoaded;

})();
