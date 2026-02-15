/* barrack_fix_v26_patch
   - Fix atlas URL fallback (tries asset/ and client/asset/ roots)
   - Never "vanish": if atlas isn't ready, fall back to original draw
   - Safer pivot/scale (validate localStorage values)
   - Better tile coordinate inference to avoid "teleport pivot"
   - Lightweight sell/destroy "ghost" playback (best-effort)
*/
(() => {
  "use strict";

  const VER = "v26";
  const TAG = `[barrack:${VER}]`;
  const LS_SCALE = "po_barrack_scale";
  const LS_PX = "po_barrack_pivot_x";
  const LS_PY = "po_barrack_pivot_y";
  const LS_OX = "po_barrack_off_x";
  const LS_OY = "po_barrack_off_y";

  const S = {
    installed: false,
    installing: false,
    tried: 0,
    maxTries: 240, // ~4s @60fps
    origDrawBuilding: null,
    atlases: { idle: null, const: null, distruct: null },
    ready: { idle: false, const: false, distruct: false },
    failed: { idle: false, const: false, distruct: false },
    loading: { idle: false, const: false, distruct: false },
    chosenUrl: { idle: null, const: null, distruct: null },
    seenThisFrame: new Set(),
    lastFrameKey: null,
    tracked: new Map(), // id -> { lastSeen, tx, ty, hp, team, lastState }
    ghosts: [], // { kind:'sell'|'destroy', start, tx, ty, team }
    lastSellClickMs: 0,
    debugPrinted: false,
  };

  function log(...a){ console.log(TAG, ...a); }
  function warn(...a){ console.warn(TAG, ...a); }

  function getPO(){ return (typeof window !== "undefined" ? window.PO : null); }
  function nowMs(state){
    if (state && typeof state.t === "number") return state.t;
    if (state && typeof state.time === "number") return state.time;
    if (typeof performance !== "undefined" && performance.now) return performance.now();
    return Date.now();
  }

  function clamp(n, lo, hi){ return Math.max(lo, Math.min(hi, n)); }
  function readNumLS(key, fallback){
    try{
      const v = window.localStorage.getItem(key);
      if (v == null) return fallback;
      const n = Number(v);
      return Number.isFinite(n) ? n : fallback;
    }catch(_){ return fallback; }
  }
  function readPivot(){
    // if user previously stored pixels (e.g. 32), ignore
    let x = readNumLS(LS_PX, 0.50);
    let y = readNumLS(LS_PY, 0.44);
    if (!(x >= 0 && x <= 1)) x = 0.50;
    if (!(y >= 0 && y <= 1)) y = 0.44;
    return { x, y };
  }
  function readScale(){
    let s = readNumLS(LS_SCALE, 0.14);
    if (!(s > 0.01 && s < 2.5)) s = 0.14;
    return s;
  }
  function readOffset(){
    let ox = readNumLS(LS_OX, 0);
    let oy = readNumLS(LS_OY, 0);
    if (!Number.isFinite(ox)) ox = 0;
    if (!Number.isFinite(oy)) oy = 0;
    // offsets are pixels; allow wider but clamp extreme junk
    ox = clamp(ox, -5000, 5000);
    oy = clamp(oy, -5000, 5000);
    return { ox, oy };
  }

  function isBarrack(ent){
    if (!ent) return false;
    const k = (ent.kind || ent.type || ent.name || "").toString().toLowerCase();
    return k === "barrack" || k === "barracks" || k.includes("barrack");
  }

  function entId(ent){
    const cands = ["id","uid","_id","entityId","guid","uuid"];
    for (const k of cands){
      if (ent && (typeof ent[k] === "string" || typeof ent[k] === "number")) return String(ent[k]);
    }
    // last resort: stable-ish identity via WeakMap
    if (!entId._wm) entId._wm = new WeakMap();
    const wm = entId._wm;
    if (!wm.has(ent)) wm.set(ent, `wm_${Math.random().toString(36).slice(2)}_${Date.now()}`);
    return wm.get(ent);
  }

  function pickTile(ent){
    // Prefer explicit tile coords if present
    const preferPairs = [
      ["tx","ty"], ["tileX","tileY"], ["gridX","gridY"], ["cellX","cellY"], ["mapX","mapY"]
    ];
    for (const [ax, ay] of preferPairs){
      const x = ent?.[ax], y = ent?.[ay];
      if (Number.isFinite(x) && Number.isFinite(y)) return { tx: x, ty: y, src: `${ax}/${ay}` };
    }
    // Sometimes nested
    const nests = ["pos","tile","grid","cell"];
    for (const n of nests){
      const o = ent?.[n];
      if (o && Number.isFinite(o.x) && Number.isFinite(o.y)) return { tx: o.x, ty: o.y, src: `${n}.x/.y` };
      if (o && Number.isFinite(o.tx) && Number.isFinite(o.ty)) return { tx: o.tx, ty: o.ty, src: `${n}.tx/.ty` };
      if (o && Number.isFinite(o.tileX) && Number.isFinite(o.tileY)) return { tx: o.tileX, ty: o.tileY, src: `${n}.tileX/.tileY` };
    }
    // Fall back to x/y only if they look like tile coords (small numbers)
    if (Number.isFinite(ent?.x) && Number.isFinite(ent?.y)){
      const x = ent.x, y = ent.y;
      // heuristics: tiles typically within a few hundred; pixels often larger
      if (Math.abs(x) <= 256 && Math.abs(y) <= 256) return { tx: x, ty: y, src: "x/y(small)" };
    }
    return { tx: 0, ty: 0, src: "fallback(0,0)" };
  }

  function pickTeam(ent){
    // best-effort; if no data, return null and skip recolor
    const cands = ["team","side","owner","player","faction","factionId"];
    for (const k of cands){
      const v = ent?.[k];
      if (typeof v === "number" && Number.isFinite(v)) return v;
      if (typeof v === "string" && v.trim() !== "" && !Number.isNaN(Number(v))) return Number(v);
    }
    return null;
  }

  function pathJoin(root, sub){
    const r = (root || "").replace(/\/+$/,"");
    const s = (sub || "").replace(/^\/+/,"");
    return (r ? (r + "/") : "") + s;
  }

  function buildCandidates(subpath){
    const clean = (subpath || "").replace(/^\/+/,"");
    const roots = [
      "", ".", "./",  // relative
      "client", "client/", "./client", "./client/", "/client", "/client/",
      "/", // absolute
    ];
    // normalize roots to either "" or endswith "/"
    const out = [];
    const push = (u) => { if (u && !out.includes(u)) out.push(u); };
    for (let r of roots){
      if (r === ".") r = "./";
      if (r === "client") r = "client/";
      if (r === "./client") r = "./client/";
      if (r === "/client") r = "/client/";
      if (r === "/") push("/" + clean);
      else push(pathJoin(r, clean));
    }
    // also try without leading "./" if we have it
    return out;
  }

  async function loadAnyAtlas(kind, subpath){
    const PO = getPO();
    if (!PO || !PO.atlasTP) throw new Error("PO.atlasTP missing");
    if (S.ready[kind] || S.loading[kind]) return S.atlases[kind];

    S.loading[kind] = true;
    const candidates = buildCandidates(subpath);
    // prefer "asset/..." and "client/asset/..."
    // (buildCandidates already covers this by roots)
    let lastErr = null;
    for (const url of candidates){
      try{
        // loadAtlasTP is alias to loadTPAtlas in atlas_tp_v6
        const fn = PO.atlasTP.loadTPAtlasMulti || PO.atlasTP.loadAtlasTP || PO.atlasTP.loadTPAtlas;
        if (!fn) throw new Error("no atlas loader");
        const atlas = await fn(url);
        if (atlas && atlas.frames){
          S.atlases[kind] = atlas;
          S.ready[kind] = true;
          S.chosenUrl[kind] = url;
          log(`${kind} atlas loaded from`, url);
          return atlas;
        }
      }catch(e){
        lastErr = e;
        // silence most candidate failures; keep one line
      }
    }
    S.failed[kind] = true;
    warn(`${kind} atlas load failed (tried ${candidates.length} urls). last error:`, lastErr?.message || lastErr);
    return null;
  }

  function listFrames(atlas, prefix){
    const PO = getPO();
    if (!atlas || !PO?.atlasTP?.listFramesByPrefix) return [];
    return PO.atlasTP.listFramesByPrefix(atlas, prefix) || [];
  }

  function frameByTime(frames, t, fps){
    if (!frames || !frames.length) return null;
    const idx = Math.floor((t / 1000) * fps) % frames.length;
    return frames[idx];
  }

  function drawAtlasFrame(ctx, atlas, frameName, x, y, scale, pivot){
    const PO = getPO();
    if (!PO?.atlasTP?.drawFrame || !atlas || !frameName) return false;
    try{
      // Try passing pivot+scale through opts if supported; otherwise rely on atlas defaults
      PO.atlasTP.drawFrame(ctx, atlas, frameName, x, y, scale, pivot);
      return true;
    }catch(e){
      // fallback: old signature without pivot
      try{
        PO.atlasTP.drawFrame(ctx, atlas, frameName, x, y, scale);
        return true;
      }catch(_){
        return false;
      }
    }
  }

  function setupSellClickHook(){
    // If there's a 매각 버튼, record last click timestamp so we can label disappearance as "sell"
    if (setupSellClickHook._done) return;
    setupSellClickHook._done = true;
    document.addEventListener("click", (ev) => {
      const t = ev?.target;
      if (!t) return;
      const txt = (t.innerText || t.textContent || "").trim();
      if (txt === "매각" || txt.toLowerCase() === "sell"){
        S.lastSellClickMs = (typeof performance !== "undefined" ? performance.now() : Date.now());
      }
    }, true);
  }

  function beginFrame(frameKey){
    if (S.lastFrameKey === frameKey) return;
    // new frame boundary
    S.lastFrameKey = frameKey;
    // GC disappeared barracks into ghosts (best-effort)
    const now = frameKey;
    for (const [id, info] of S.tracked.entries()){
      if (!S.seenThisFrame.has(id)){
        const age = now - info.lastSeen;
        if (age > 80){ // missed at least one render pass
          const isSell = (now - S.lastSellClickMs) < 600; // recent sell click
          const kind = isSell ? "sell" : (info.hp != null && info.hp <= 0 ? "destroy" : "destroy");
          S.ghosts.push({ kind, start: now, tx: info.tx, ty: info.ty, team: info.team });
          S.tracked.delete(id);
        }
      }
    }
    S.seenThisFrame.clear();
  }

  function updateTrack(ent, tx, ty, stateTime){
    const id = entId(ent);
    S.seenThisFrame.add(id);
    const hp = (Number.isFinite(ent?.hp) ? ent.hp : (Number.isFinite(ent?.health) ? ent.health : null));
    const team = pickTeam(ent);
    S.tracked.set(id, { lastSeen: stateTime, tx, ty, hp, team });
  }

  function drawGhosts(ctx, helpers, state){
    const t = nowMs(state);
    if (!S.ghosts.length) return;

    const pivot = readPivot();
    const scale = readScale();
    const off = readOffset();

    const keep = [];
    for (const g of S.ghosts){
      const age = t - g.start;
      const ttl = 1200; // ms
      if (age > ttl) continue;

      // choose atlas + prefix
      if (g.kind === "sell"){
        const atlas = S.atlases.const;
        const frames = listFrames(atlas, "barrack_const_");
        if (frames.length){
          // reverse playback
          const idx = frames.length - 1 - (Math.floor(age / (1000/14)) % frames.length);
          const frame = frames[idx];
          const p = helpers.worldToScreen({ x: g.tx, y: g.ty });
          drawAtlasFrame(ctx, atlas, frame, p.x + off.ox, p.y + off.oy, scale, pivot);
        }
      } else {
        const atlas = S.atlases.distruct || S.atlases.const;
        const frames = listFrames(atlas, "barrack_distruct_").length
          ? listFrames(atlas, "barrack_distruct_")
          : listFrames(atlas, "barrack_const_");
        if (frames.length){
          const frame = frameByTime(frames, age, 14);
          const p = helpers.worldToScreen({ x: g.tx, y: g.ty });
          drawAtlasFrame(ctx, atlas, frame, p.x + off.ox, p.y + off.oy, scale, pivot);
        }
      }

      keep.push(g);
    }
    S.ghosts = keep;
  }

  async function ensureAllAtlases(){
    // Note: folder names from your asset tree (from earlier zips)
    // idle:   client/asset/sprite/const/normal/barrack/barrack_idle.json
    // const:  client/asset/sprite/const/const_anim/barrack/barrack_const.json
    // distr:  client/asset/sprite/const/distruct/barrack/barrack_distruct.json
    await loadAnyAtlas("idle",    "asset/sprite/const/normal/barrack/barrack_idle.json");
    await loadAnyAtlas("const",   "asset/sprite/const/const_anim/barrack/barrack_const.json");
    // typo-safe: try distruct first, then destruct if exists
    const d1 = await loadAnyAtlas("distruct", "asset/sprite/const/distruct/barrack/barrack_distruct.json").catch(()=>null);
    if (!d1) await loadAnyAtlas("distruct", "asset/sprite/const/destruct/barrack/barrack_distruct.json").catch(()=>null);
    // normalize key
    if (S.atlases.distruct) S.ready.distruct = true;
  }

  function drawBarrack(ctx, ent, helpers, state){
    const t = nowMs(state);
    beginFrame(t);

    // ensure helper exists
    if (!helpers || typeof helpers.worldToScreen !== "function") return false;

    // Track placement
    const tile = pickTile(ent);
    // Optional footprint centering (best-effort)
    let tx = tile.tx, ty = tile.ty;
    const fx = Number.isFinite(ent?.w) ? ent.w : (Number.isFinite(ent?.sizeX) ? ent.sizeX : null);
    const fy = Number.isFinite(ent?.h) ? ent.h : (Number.isFinite(ent?.sizeY) ? ent.sizeY : null);
    if (fx && fy){
      tx = tx + (fx - 1) * 0.5;
      ty = ty + (fy - 1) * 0.5;
    }

    updateTrack(ent, tx, ty, t);

    // Lazy-load atlases in background
    if (!S.ready.idle || !S.ready.const || !S.ready.distruct){
      ensureAllAtlases().catch(()=>{});
    }

    const pivot = readPivot();
    const scale = readScale();
    const off = readOffset();

    const p = helpers.worldToScreen({ x: tx, y: ty });
    const x = p.x + off.ox;
    const y = p.y + off.oy;

    // choose state
    const prog = Number.isFinite(ent?.buildProgress) ? ent.buildProgress :
                 (Number.isFinite(ent?.progress) ? ent.progress : null);
    const isBuilding = (prog != null && prog < 1) || ent?.state === "construct" || ent?.constructing === true;

    if (isBuilding && S.atlases.const){
      const frames = listFrames(S.atlases.const, "barrack_const_");
      const frame = frames.length ? frames[Math.floor((prog != null ? prog : (t/1000)) * frames.length) % frames.length] : null;
      if (frame && drawAtlasFrame(ctx, S.atlases.const, frame, x, y, scale, pivot)) return true;
    }

    if (S.atlases.idle){
      const frames = listFrames(S.atlases.idle, "barrack_idle_");
      const frame = frameByTime(frames, t, 10);
      if (frame && drawAtlasFrame(ctx, S.atlases.idle, frame, x, y, scale, pivot)) return true;
    }

    // If not ready, tell caller to fall back to original draw (box) rather than vanish
    return false;
  }

  function tryInstall(){
    const PO = getPO();
    if (!PO) return false;
    setupSellClickHook();

    if (S.installed || S.installing) return S.installed;
    S.installing = true;

    // Wait for PO.buildings.drawBuilding to exist (likely defined in game.js)
    if (!PO.buildings || typeof PO.buildings.drawBuilding !== "function"){
      S.installing = false;
      return false;
    }

    const orig = PO.buildings.drawBuilding.bind(PO.buildings);
    S.origDrawBuilding = orig;

    PO.buildings.drawBuilding = function(ctx, ent, helpers, state){
      try{
        if (isBarrack(ent)){
          // Draw ghosts on top (once per frame) using the same ctx
          // (ghosts can render even if barrack entity already deleted)
          drawGhosts(ctx, helpers, state);

          const ok = drawBarrack(ctx, ent, helpers, state);
          if (ok) return true; // suppress original box render
          // else fall back to original (no vanish)
          return orig(ctx, ent, helpers, state);
        }
        // non-barrack: still draw ghosts (so sell/destroy plays even off-screen)
        drawGhosts(ctx, helpers, state);
        return orig(ctx, ent, helpers, state);
      }catch(e){
        warn("drawBuilding hook error:", e);
        return orig(ctx, ent, helpers, state);
      }
    };

    S.installed = true;
    S.installing = false;
    log("script loaded + drawBuilding hooked");
    log("pivot/scale LS keys:", LS_SCALE, LS_PX, LS_PY, "offset keys:", LS_OX, LS_OY);
    return true;
  }

  function loop(){
    if (S.installed) return;
    S.tried++;
    if (tryInstall()) return;
    if (S.tried < S.maxTries) {
      // rAF install retry
      if (typeof requestAnimationFrame === "function") requestAnimationFrame(loop);
      else setTimeout(loop, 16);
    } else {
      warn("install timed out: PO.buildings.drawBuilding not found");
    }
  }

  // entry
  log("boot");
  if (typeof requestAnimationFrame === "function") requestAnimationFrame(loop);
  else setTimeout(loop, 0);

})();
