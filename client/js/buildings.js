
/* Barracks atlas building module (standalone)
 * - Handles: barracks idle / construction complete / destruction atlases (TexturePacker JSON)
 * - Adds: team palette recolor (magenta -> team accent)
 * - Adds: simple in-game tune helper (F8) to tweak pivot/offset nudges and print numbers
 *
 * Expected globals:
 *   window.PO.atlasTP  (from atlas_tp.js) with: loadTPAtlasMulti(jsonUrl, baseUrl), drawFrame(), getFrameSourceSize()
 * Game integration:
 *   PO.buildings.onPlaced(ent)
 *   PO.buildings.onDestroyed(ent)
 *   PO.buildings.onSold(ent)   (optional)
 *   PO.buildings.tick(dt)
 *   PO.buildings.drawBuilding(ctx, cam, helpers, ent)
 *   PO.buildings.drawGhosts(ctx, cam, helpers)
 */

(function(){
  "use strict";
  const PO = (typeof window!=="undefined" ? (window.PO = window.PO || {}) : {});
  const atlasTP = PO.atlasTP;

  const PATHS = {
    idle: [
      { json: "asset/sprite/const/normal/barrack/barrack_idle.json", base: "asset/sprite/const/normal/barrack/" },
      { json: "asset/sprite/const/normal/barrack/Barrack_idle.json", base: "asset/sprite/const/normal/barrack/" }
    ],
    cons: [
      { json: "asset/sprite/const/normal/barrack/barrack_const.json", base: "asset/sprite/const/normal/barrack/" }
    ],
    dest: [
      { json: "asset/sprite/const/const_anim/barrack/barrack_distruction.json", base: "asset/sprite/const/const_anim/barrack/" }
    ]
  };

  const CFG = {
    fps: 12,
    anchor: { x: 0.5, y: 0.52 }, // from your TP JSON frames
    magentaKey: { r:255, g:0, b:255 },
    magentaTol: 48
  };

  const stById = new Map();
  const ghosts = [];
  const cache = {
    loaded: false,
    loading: null,
    idleAtlas: null,
    consAtlas: null,
    destAtlas: null,
    idleSeq: [],
    consSeq: [],
    destSeq: [],
    distFrame: null,
    teamAtlases: new Map() // key: `${teamKey}|idle|cons|dest`
  };

  function _teamKey(team){
    // Accept: 0/1, "PLAYER"/"ENEMY", or objects.
    if (team==null) return "NEUTRAL";
    if (typeof team==="string"){
      const t = team.toUpperCase();
      if (t.includes("PLAY")) return "PLAYER";
      if (t.includes("ENEM")) return "ENEMY";
      return t;
    }
    if (typeof team==="number"){
      if (team===0) return "PLAYER";
      if (team===1) return "ENEMY";
      return "NEUTRAL";
    }
    // game might store {id:0}
    if (typeof team==="object" && typeof team.id==="number"){
      return _teamKey(team.id);
    }
    return "NEUTRAL";
  }

  function _teamRGB(team){
    const key = _teamKey(team);
    const t = (typeof window!=="undefined" && window.TEAM_ACCENT) ? window.TEAM_ACCENT : {
      PLAYER:[80,180,255],
      ENEMY:[255,60,60],
      NEUTRAL:[170,170,170]
    };
    return (t && t[key]) ? t[key] : (t.NEUTRAL || [170,170,170]);
  }

  function _scanSeq(atlas, ...patterns){
    if (!atlas || !atlas.frames) return [];
    const names = Object.keys(atlas.frames);
    const hits = [];
    for (const n of names){
      for (const p of patterns){
        if (p && p.test(n)){ hits.push(n); break; }
      }
    }
    hits.sort((a,b)=>_numSuffix(a)-_numSuffix(b));
    return hits;
  }
  function _numSuffix(name){
    const m = name.match(/(\d+)(?=\.png$)/i);
    return m ? parseInt(m[1],10) : 0;
  }
  function _first(atlas, name){
    if (!atlas || !atlas.frames) return null;
    if (atlas.frames[name]) return name;
    const key = Object.keys(atlas.frames).find(k=>k.toLowerCase()===name.toLowerCase());
    return key || null;
  }

  async function _loadFirst(paths){
    let lastErr = null;
    for (const p of paths){
      try{
        return await atlasTP.loadTPAtlasMulti(p.json, p.base);
      }catch(e){
        lastErr = e;
      }
    }
    throw lastErr || new Error("atlas load failed");
  }

  function _cloneRecolorAtlas(atlas, rgb){
    // Recolor the *sheet image* once, reuse frames metadata.
    // atlasTP returns { frames, images:[Image], meta? } depending implementation.
    // We will clone shallow and replace images[] with recolored canvases-as-Images.
    if (!atlas) return null;
    if (!atlas.images || !atlas.images.length) return atlas;

    const keyRgb = `${rgb[0]},${rgb[1]},${rgb[2]}`;
    const out = { ...atlas, images: atlas.images.slice(), __recolor: keyRgb };

    for (let i=0;i<atlas.images.length;i++){
      const img = atlas.images[i];
      const c = document.createElement("canvas");
      c.width = img.width; c.height = img.height;
      const cctx = c.getContext("2d");
      cctx.drawImage(img, 0, 0);
      const id = cctx.getImageData(0,0,c.width,c.height);
      const data = id.data;

      const kr=CFG.magentaKey.r, kg=CFG.magentaKey.g, kb=CFG.magentaKey.b, tol=CFG.magentaTol;
      for (let p=0; p<data.length; p+=4){
        const r=data[p], g=data[p+1], b=data[p+2], a=data[p+3];
        if (a===0) continue;
        // magenta-ish key
        if (Math.abs(r-kr)<=tol && Math.abs(g-kg)<=tol && Math.abs(b-kb)<=tol){
          data[p]   = rgb[0];
          data[p+1] = rgb[1];
          data[p+2] = rgb[2];
        }
      }
      cctx.putImageData(id,0,0);

      // Convert canvas to Image for drawImage fast path
      const newImg = new Image();
      newImg.src = c.toDataURL("image/png");
      out.images[i] = newImg;
    }
    return out;
  }

  function _teamAtlas(which, team){
    const key = _teamKey(team);
    const rgb = _teamRGB(team);
    const cacheKey = `${key}|${which}|${rgb[0]},${rgb[1]},${rgb[2]}`;
    if (cache.teamAtlases.has(cacheKey)) return cache.teamAtlases.get(cacheKey);

    const base = (which==="idle") ? cache.idleAtlas : (which==="cons") ? cache.consAtlas : cache.destAtlas;
    const cloned = _cloneRecolorAtlas(base, rgb);
    cache.teamAtlases.set(cacheKey, cloned);
    return cloned;
  }

  async function ensureLoaded(){
    if (cache.loaded) return true;
    if (cache.loading) return cache.loading;
    if (!atlasTP) throw new Error("PO.atlasTP missing. Load atlas_tp.js first.");
    cache.loading = (async()=>{
      cache.idleAtlas = await _loadFirst(PATHS.idle);
      cache.consAtlas = await _loadFirst(PATHS.cons);
      cache.destAtlas = await _loadFirst(PATHS.dest);

      cache.idleSeq = _scanSeq(cache.idleAtlas, /^barrack_idle_?\d+\.png$/i, /^barrack_idle\d+\.png$/i);
      cache.consSeq = _scanSeq(cache.consAtlas, /^barrack_con_complete_?\d+\.png$/i, /^barrack_const_?\d+\.png$/i, /^barrack_const\d+\.png$/i);
      cache.destSeq = _scanSeq(cache.destAtlas, /^barrack_distruction_?\d+\.png$/i, /^barrack_destruction_?\d+\.png$/i);
      cache.distFrame = _first(cache.idleAtlas, "barrack_dist.png");

      cache.loaded = true;
      return true;
    })();
    return cache.loading;
  }

  function onPlaced(ent){
    if (!ent || ent.kind!=="barracks") return;
    stById.set(ent.id, { mode:"cons", t:0 });
    ensureLoaded().catch(()=>{});
  }
  function onSold(ent){
    // optional: treat as destroyed (no dest anim) or do nothing
    if (!ent || ent.kind!=="barracks") return;
    stById.delete(ent.id);
  }
  function onDestroyed(ent){
    if (!ent || ent.kind!=="barracks") return;
    const st = stById.get(ent.id);
    stById.delete(ent.id);

    ghosts.push({
      kind:"barracks",
      team: ent.team,
      t:0,
      x: ent.x, y: ent.y, tw: ent.tw, th: ent.th,
      mode:"dest"
    });
    ensureLoaded().catch(()=>{});
  }

  function tick(dt){
    if (!dt || dt<=0) return;

    // live states
    for (const [id, st] of stById){
      if (PO.__tune && PO.__tune.on && PO.__tune.freeze && (PO.__tune.targetId==null || PO.__tune.targetId===id)){
        // frozen for tuning
      }
      if (st.mode==="cons" && cache.consSeq.length){
        const dur = cache.consSeq.length / CFG.fps;
        if (st.t >= dur){
          st.mode = "idle";
          st.t = 0;
        }
      }
    }

    // ghosts
    for (let i=ghosts.length-1;i>=0;i--){
      const g = ghosts[i];
      g.t += dt;
      const seq = cache.destSeq;
      const dur = (seq.length ? seq.length/CFG.fps : 0.5);
      if (g.t >= dur){
        ghosts.splice(i,1);
      }
    }
  }

  function _tune(kind){
    PO.SPRITE_TUNE = PO.SPRITE_TUNE || {};
    return PO.SPRITE_TUNE[kind] || (PO.SPRITE_TUNE[kind] = {});
  }
  function _applyTune(kind, pivX, pivY, offX, offY){
    const t = _tune(kind);
    const px = pivX + (t.pivNudgeX||0);
    const py = pivY + (t.pivNudgeY||0);
    const ox = offX + (t.offNudgeX||0);
    const oy = offY + (t.offNudgeY||0);
    return { px, py, ox, oy, t };
  }

  function _pickFrame(ent){
    const st = stById.get(ent.id) || {mode:"idle", t:0};
    const seq = (st.mode==="cons" && cache.consSeq.length) ? cache.consSeq : cache.idleSeq;
    if (!seq.length) return null;

    // damaged frame override (optional)
    if (cache.distFrame && typeof ent.hp==="number" && typeof ent.hpMax==="number"){
      const ratio = ent.hpMax>0 ? (ent.hp/ent.hpMax) : 1;
      if (ratio <= 0.5){
        return { atlas:"idle", name: cache.distFrame, st };
      }
    }

    const idx = Math.floor(st.t * CFG.fps) % seq.length;
    const which = (st.mode==="cons" && cache.consSeq.length) ? "cons" : "idle";
    return { atlas: which, name: seq[idx], st };
  }

  function drawBuilding(ctx, cam, helpers, ent){
    if (!ent || ent.kind!=="barracks") return false;
    if (!cache.loaded) return false;

    const pick = _pickFrame(ent);
    if (!pick) return false;

    const atlas = _teamAtlas(pick.atlas, ent.team);
    const sz = atlasTP.getFrameSourceSize(atlas, pick.name) || {w:0,h:0};

    // world to screen
    const p = helpers.worldToScreen(ent.x, ent.y, cam);
    const dx = 0;
    const dy = 0;

    const basePivX = sz.w * CFG.anchor.x;
    const basePivY = sz.h * CFG.anchor.y;

    // offsets (fine tune here if needed)
    const tuned = _applyTune(ent.kind, basePivX, basePivY, 0, 0);

    const scale = 1;
    const x = p.x + dx + tuned.ox - tuned.px * scale;
    const y = p.y + dy + tuned.oy - tuned.py * scale;

    atlasTP.drawFrame(ctx, atlas, pick.name, x, y, scale, 1);

    // tune overlay
    if (PO.__tune && PO.__tune.on){
      PO.__tune.lastBarracksId = ent.id;
      const isTarget = (PO.__tune.targetId==null) || (PO.__tune.targetId===ent.id);
      if (isTarget){
        ctx.save();
        ctx.globalAlpha = 0.9;
        // pivot crosshair
        const cx = x + tuned.px*scale;
        const cy = y + tuned.py*scale;
        ctx.strokeStyle = "#00ffff";
        ctx.beginPath();
        ctx.moveTo(cx-10, cy); ctx.lineTo(cx+10, cy);
        ctx.moveTo(cx, cy-10); ctx.lineTo(cx, cy+10);
        ctx.stroke();
        // text
        ctx.fillStyle = "#00ffff";
        ctx.font = "12px monospace";
        const t = _tune("barracks");
        const msg1 = `barracks tune | pivNudge=(${t.pivNudgeX||0},${t.pivNudgeY||0}) offNudge=(${t.offNudgeX||0},${t.offNudgeY||0}) freeze=${PO.__tune.freeze? "ON":"OFF"} (Space) step(Q/E) print(C)`;
        ctx.fillText(msg1, cx + 14, cy - 14);
        ctx.restore();
      }
    }

    return true;
  }

  function drawGhosts(ctx, cam, helpers){
    if (!cache.loaded) return;
    if (!ghosts.length) return;

    for (const g of ghosts){
      const seq = cache.destSeq;
      if (!seq.length) continue;
      const idx = Math.floor(g.t * CFG.fps);
      const name = seq[Math.min(idx, seq.length-1)];
      const atlas = _teamAtlas("dest", g.team);

      const sz = atlasTP.getFrameSourceSize(atlas, name) || {w:0,h:0};
      const basePivX = sz.w * CFG.anchor.x;
      const basePivY = sz.h * CFG.anchor.y;
      const tuned = _applyTune("barracks", basePivX, basePivY, 0, 0);

      const p = helpers.worldToScreen(g.x, g.y, cam);
      const dx = 0;
      const x = p.x + dx + tuned.ox - tuned.px;
      const y = p.y + tuned.oy - tuned.py;
      atlasTP.drawFrame(ctx, atlas, name, x, y, 1, 1);
    }
  }

  // ===== Tune helper (F8) =====
  (function installTuneHelper(){
    if (PO.__tuneInstalled) return;
    PO.__tuneInstalled = true;
    PO.__tune = { on:false, targetId:null, lastBarracksId:null, lastPrint:0, freeze:false };

    function _print(){
      const t = _tune("barracks");
      console.log("[tune]", JSON.stringify({ barracks: {
        pivNudgeX: t.pivNudgeX||0,
        pivNudgeY: t.pivNudgeY||0,
        offNudgeX: t.offNudgeX||0,
        offNudgeY: t.offNudgeY||0
      }}, null, 2));
    }
    function _step(e){
      if (e.altKey) return 1;
      if (e.shiftKey) return 20;
      return 5;
    }

    window.addEventListener("keydown", (e)=>{
      if (e.code==="F8"){
        PO.__tune.on = !PO.__tune.on;
        if (!PO.__tune.on) PO.__tune.targetId = null;
        console.log("[tune]", PO.__tune.on ? "ON" : "OFF");
        return;
      }
      if (!PO.__tune.on) return;

      const t = _tune("barracks");
      const s = _step(e);
      let used = false;

      if (e.code==="ArrowLeft"){ t.pivNudgeX = (t.pivNudgeX||0) - s; used=true; }
      if (e.code==="ArrowRight"){ t.pivNudgeX = (t.pivNudgeX||0) + s; used=true; }
      if (e.code==="ArrowUp"){ t.pivNudgeY = (t.pivNudgeY||0) - s; used=true; }
      if (e.code==="ArrowDown"){ t.pivNudgeY = (t.pivNudgeY||0) + s; used=true; }

      if (e.code==="KeyA"){ t.offNudgeX = (t.offNudgeX||0) - s; used=true; }
      if (e.code==="KeyD"){ t.offNudgeX = (t.offNudgeX||0) + s; used=true; }
      if (e.code==="KeyW"){ t.offNudgeY = (t.offNudgeY||0) - s; used=true; }
      if (e.code==="KeyS"){ t.offNudgeY = (t.offNudgeY||0) + s; used=true; }

      if (e.code==="KeyC"){ _print(); used=true; }

      // frame control while frozen
      if (e.code==="Space"){
        PO.__tune.freeze = !PO.__tune.freeze;
        console.log("[tune] freeze", PO.__tune.freeze);
        used = true;
      }
      if (e.code==="KeyQ" || e.code==="KeyE"){
        const dir = (e.code==="KeyQ") ? -1 : 1;
        const target = PO.__tune.targetId;
        if (target!=null && stById.has(target)){
          const sst = stById.get(target);
          // step by one frame at CFG.fps
          sst.t = Math.max(0, sst.t + dir*(1/CFG.fps));
        }
        used = true;
      }

      if (used){ e.preventDefault(); }
    }, {passive:false});

    const cv = document.getElementById("c") || document.querySelector("canvas");
    if (cv){
      cv.addEventListener("mousedown", ()=>{
        if (!PO.__tune.on) return;
        if (PO.__tune.lastBarracksId!=null){
          PO.__tune.targetId = PO.__tune.lastBarracksId;
          console.log("[tune] target barracks id=", PO.__tune.targetId);
        }
      });
    }
  })();

  PO.buildings = PO.buildings || {};
  PO.buildings.ensureLoaded = ensureLoaded;
  PO.buildings.onPlaced = onPlaced;
  PO.buildings.onDestroyed = onDestroyed;
  PO.buildings.onSold = onSold;
  PO.buildings.tick = tick;
  PO.buildings.drawBuilding = drawBuilding;
  PO.buildings.drawGhosts = drawGhosts;
})();
