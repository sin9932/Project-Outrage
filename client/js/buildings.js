/* buildings.js
   Building sprite/animation module (TexturePacker atlases).
   Current scope: Barracks.
*/
(function(){
  "use strict";
  const PO = (window.PO = window.PO || {});
  const atlasTP = PO.atlasTP;

  const MOD = {};
  PO.buildings = MOD;

  const _loaded = {
    barracks: { ready:false, loading:false, idle:null, cons:null, dest:null, idleT:null, consT:null, destT:null, err:null }
  };

  const _live = new Map();
  const _ghosts = [];


  // Team accent recolor for TexturePacker atlases (magenta -> team accent).
  // Uses the same heuristic as game.js: detect "magenta band" pixels and recolor by luminance.
  const TEAM_ACCENT = (typeof window !== "undefined" && window.TEAM_ACCENT) ? window.TEAM_ACCENT : {
    PLAYER: [80,  180, 255],  // blue-ish
    ENEMY:  [255, 80,  90],   // red-ish
    NEUTRAL:[140, 140, 140]
  };
  const TEAM_ACCENT_LUMA_GAMMA = (typeof window !== "undefined" && window.TEAM_ACCENT_LUMA_GAMMA!=null) ? window.TEAM_ACCENT_LUMA_GAMMA : 0.70;
  const TEAM_ACCENT_LUMA_GAIN  = (typeof window !== "undefined" && window.TEAM_ACCENT_LUMA_GAIN!=null) ? window.TEAM_ACCENT_LUMA_GAIN : 1.35;
  const TEAM_ACCENT_LUMA_BIAS  = (typeof window !== "undefined" && window.TEAM_ACCENT_LUMA_BIAS!=null) ? window.TEAM_ACCENT_LUMA_BIAS : 0.06;

  function _isAccentPixel(r,g,b,a){
    if (a < 8) return false;
    const magentaBand = (r >= 150 && b >= 150 && g <= 140);
    const gNotDominant = (g <= Math.min(r,b) + 35);
    const rbPresence = (r + b) >= 160;
    return magentaBand && gNotDominant && rbPresence;
  }

  function _applyTeamPaletteToImage(img, teamRGB){
    const w = img.width, h = img.height;
    const c = document.createElement("canvas"); c.width = w; c.height = h;
    const ctx = c.getContext("2d", { willReadFrequently:true });
    ctx.drawImage(img, 0, 0);
    const im = ctx.getImageData(0,0,w,h);
    const d = im.data;
    const tr = teamRGB[0]||0, tg = teamRGB[1]||0, tb = teamRGB[2]||0;

    for (let i=0;i<d.length;i+=4){
      const r=d[i], g=d[i+1], b=d[i+2], a=d[i+3];
      if (!_isAccentPixel(r,g,b,a)) continue;
      const l = (0.2126*r + 0.7152*g + 0.0722*b)/255; // perceived luma
      const l2 = Math.min(1, Math.pow(l, TEAM_ACCENT_LUMA_GAMMA) * TEAM_ACCENT_LUMA_GAIN + TEAM_ACCENT_LUMA_BIAS);
      d[i]   = Math.max(0, Math.min(255, tr * l2));
      d[i+1] = Math.max(0, Math.min(255, tg * l2));
      d[i+2] = Math.max(0, Math.min(255, tb * l2));
      // alpha preserved
    }
    ctx.putImageData(im,0,0);
    // Return as an Image-like object usable in drawImage
    return c;
  }

  function _cloneAtlasWithRecoloredTextures(atlas, teamRGB){
    if (!atlas || !atlas.textures) return atlas;
    // Shallow clone object and textures array; keep frames Map (frame rects identical)
    const out = { textures: [], frames: atlas.frames };
    for (const t of atlas.textures){
      const nt = Object.assign({}, t);
      if (t && t.img){
        nt.img = _applyTeamPaletteToImage(t.img, teamRGB);
      }
      out.textures.push(nt);
    }
    return out;
  }


  function _numSuffix(name){
    const m = /(\d+)(?=\.png$)/i.exec(name);
    return m ? parseInt(m[1],10) : 0;
  }
  function _sorted(list){
    return list.slice().sort((a,b)=>_numSuffix(a)-_numSuffix(b));
  }


  function _pickTeamAtlas(slot, mode, team){
    const t = (team==null) ? 0 : team;
    if (mode==="idle" && slot.idleT) return slot.idleT[t] || slot.idle;
    if (mode==="cons" && slot.consT) return slot.consT[t] || slot.cons;
    if (mode==="dest" && slot.destT) return slot.destT[t] || slot.dest;
    return (mode==="cons") ? slot.cons : (mode==="dest") ? slot.dest : slot.idle;
  }

  
// Frame name sequences are auto-detected from atlas contents to avoid hard-coded filename/count mismatches.
let BARR = {
  idleLoop: _sorted(Array.from({length:18}, (_,i)=>`barrack_idle${i+1}.png`)),
  idleDamaged: ["barrack_dist.png"],
  cons: _sorted(Array.from({length:23}, (_,i)=>`barrack_const${i+1}.png`)),
  dest: _sorted(Array.from({length:22}, (_,i)=>`barrack_distruction${i+1}.png`)),
};

function _numSuffix(name){
  const m = String(name).match(/(\d+)(?=\.[a-z]+$)/i) || String(name).match(/(\d+)$/);
  return m ? parseInt(m[1],10) : 0;
}
function _scanSeq(atlas, patterns){
  if (!atlas || !atlas.frames) return [];
  const keys = Array.from(atlas.frames.keys());
  let out = [];
  for (const k of keys){
    for (const re of patterns){
      if (re.test(k)) { out.push(k); break; }
    }
  }
  out.sort((a,b)=>_numSuffix(a)-_numSuffix(b));
  return out;
}
function _rebuildBarrFrames(slot){
  if (!slot) return;
  const idleAtlas = slot.idle;
  const consAtlas = slot.cons;
  const destAtlas = slot.dest;

  const idleSeq = _scanSeq(idleAtlas, [/^barrack_idle\d+\.png$/i, /^barracks?_idle\d+\.png$/i]);
  const dmgSeq  = _scanSeq(idleAtlas, [/^barrack_(dist|damaged)\.png$/i, /^barrack_idle_damaged\.png$/i]);
  const consSeq = _scanSeq(consAtlas, [
  // legacy naming: barrack_const1.png, barrack_build12.png ...
  /^barrack_(const|cons|construction|build)\d+\.png$/i,
  /^barracks?_(const|cons|construction|build)\d+\.png$/i,

  // your current naming: barrack_con_complete_1.png ...
  /^barrack_con_complete_?\d+\.png$/i,
  /^barracks?_con_complete_?\d+\.png$/i,
]);
const destSeq = _scanSeq(destAtlas, [
  // legacy naming: barrack_distruction1.png ...
  /^barrack_(distruction|destruction|destroy|dest)\d+\.png$/i,
  /^barracks?_(distruction|destruction|destroy|dest)\d+\.png$/i,

  // your current naming: barrack_distruction_35.png ...
  /^barrack_(distruction|destruction|destroy|dest)_?\d+\.png$/i,
  /^barracks?_(distruction|destruction|destroy|dest)_?\d+\.png$/i,
]);

if (idleSeq.length) BARR.idleLoop = idleSeq;
  if (dmgSeq.length)  BARR.idleDamaged = [dmgSeq[0]];
  if (consSeq.length) BARR.cons = consSeq;
  if (destSeq.length) BARR.dest = destSeq;

  // Safety: if dest atlas missing, prevent 0-length maxT instant remove from feeling like "no anim".
  if (!destAtlas) BARR.dest = [];
}

  const PATH = {
    // Your described folder layout:
    // idle(평시): asset/sprite/const/destruct/barrack/Barrack_idle.json
    // (건축완료): asset/sprite/const/normal/barrack/barrack_const.json
    // (건물파괴): asset/sprite/const/const_anim/barrack/barrack_distruction.json
    barracks: {
      idle: { json:"asset/sprite/const/destruct/barrack/Barrack_idle.json", base:"asset/sprite/const/destruct/barrack/" },
      cons: { json:"asset/sprite/const/normal/barrack/barrack_const.json", base:"asset/sprite/const/normal/barrack/" },
      dest: { json:"asset/sprite/const/const_anim/barrack/barrack_distruction.json", base:"asset/sprite/const/const_anim/barrack/" },
    }
  };

  
// Barracks atlas path fallbacks (your folder layout can vary)
const BARRACK_CAND = {
  idle: [
    { json: PATH.barracks.idle.json, base: PATH.barracks.idle.base },
    { json: "asset/sprite/const/destruct/barrack/Barrack_idle.json",   base: "asset/sprite/const/destruct/barrack/" },
    { json: "asset/sprite/const/const_anim/barrack/Barrack_idle.json", base: "asset/sprite/const/const_anim/barrack/" },
  ],
  cons: [
    { json: PATH.barracks.cons.json, base: PATH.barracks.cons.base },
    { json: "asset/sprite/const/normal/barrack/barrack_const.json",    base: "asset/sprite/const/normal/barrack/" },
    { json: "asset/sprite/const/destruct/barrack/barrack_const.json",  base: "asset/sprite/const/destruct/barrack/" },
  ],
  dest: [
    { json: "asset/sprite/const/destruct/barrack/barrack_distruction.json",  base: "asset/sprite/const/destruct/barrack/" },
    { json: "asset/sprite/const/const_anim/barrack/barrack_distruction.json",base: "asset/sprite/const/const_anim/barrack/" },
    { json: "asset/sprite/const/normal/barrack/barrack_distruction.json",    base: "asset/sprite/const/normal/barrack/" },

    // common spelling variant
    { json: "asset/sprite/const/destruct/barrack/barrack_destruction.json",   base: "asset/sprite/const/destruct/barrack/" },
    { json: "asset/sprite/const/const_anim/barrack/barrack_destruction.json",base: "asset/sprite/const/const_anim/barrack/" },
    { json: "asset/sprite/const/normal/barrack/barrack_destruction.json",    base: "asset/sprite/const/normal/barrack/" },
  ]
};

async function _tryLoadTPMulti(cands){
  let lastErr = null;
  for (const c of cands){
    try{
      return await atlasTP.loadTPAtlasMulti(c.json, c.base);
    }catch(e){
      lastErr = e;
      // Helpful debug: show which URL is returning HTML / failing
      console.warn("[buildings] atlas candidate failed:", c.json, "base:", c.base, "err:", (e && e.message) ? e.message : e);
    }
  }
  throw lastErr || new Error("Atlas load failed (no candidates)");
}
function _kickLoadBarracks(){
    const slot = _loaded.barracks;
    if (slot.ready || slot.loading) return;
    slot.loading = true;
    (async ()=>{
      try{
        if (!atlasTP || !atlasTP.loadTPAtlasMulti) throw new Error("atlas_tp.js not loaded");
        const idle = await _tryLoadTPMulti(BARRACK_CAND.idle);
const cons = await _tryLoadTPMulti(BARRACK_CAND.cons);
let dest = null;
try{
  dest = await _tryLoadTPMulti(BARRACK_CAND.dest);
}catch(_e){
  // If still missing, degrade gracefully (no destruction frames)
  dest = null;
}

slot.idle = idle; slot.cons = cons; slot.dest = dest;

        // Build per-team recolored atlases (PLAYER=0, ENEMY=1).
        try{
          const pRGB = TEAM_ACCENT.PLAYER || [80,180,255];
          const eRGB = TEAM_ACCENT.ENEMY  || [255,80,90];
          slot.idleT = { 0:_cloneAtlasWithRecoloredTextures(idle, pRGB), 1:_cloneAtlasWithRecoloredTextures(idle, eRGB) };
          slot.consT = { 0:_cloneAtlasWithRecoloredTextures(cons, pRGB), 1:_cloneAtlasWithRecoloredTextures(cons, eRGB) };
          slot.destT = dest ? { 0:_cloneAtlasWithRecoloredTextures(dest, pRGB), 1:_cloneAtlasWithRecoloredTextures(dest, eRGB) } : null;
        }catch(_e){
          // If recolor fails (tainted canvas etc), fall back to base atlases.
          slot.idleT = null; slot.consT = null; slot.destT = null;
        }

        _rebuildBarrFrames(slot);

        slot.ready = true;
      }catch(e){
        slot.err = e;
        console.error("[buildings] barracks atlas load failed", e);
      }finally{
        slot.loading = false;
      }
    })();
  }

  function init(){
    _kickLoadBarracks();
  }

  function tunerKinds(){
    return ["hq","barracks"];
  }

  function getTunerCrop(kind){
    if (kind !== "barracks") return null;
    const slot = _loaded.barracks;
    if (!slot.ready || !slot.idle) return { w:1652, h:1252 };
    const name = BARR.idleLoop[0];
    const sz = atlasTP.getFrameSourceSize(slot.idle, name);
    return sz || { w:1652, h:1252 };
  }

  function _applyTune(ent, cam){
        const t = (window.PO && window.PO.SPRITE_TUNE && window.PO.SPRITE_TUNE[ent.kind]) ? window.PO.SPRITE_TUNE[ent.kind] : null;
    const z = (cam && typeof cam.zoom==="number") ? cam.zoom : 1;
    const scaleMul = (t && typeof t.scaleMul==="number") ? t.scaleMul : 1.0;
    const offX = (t && t.offsetNudge) ? (t.offsetNudge.x||0) * z : 0;
    const offY = (t && t.offsetNudge) ? (t.offsetNudge.y||0) * z : 0;
    const pivX = (t && t.pivotNudge) ? (t.pivotNudge.x||0) : 0;
    const pivY = (t && t.pivotNudge) ? (t.pivotNudge.y||0) : 0;
    return { scaleMul, offX, offY, pivX, pivY };
  }

  function _pickBarracksFrame(ent, st){
    const ratio = (ent.hpMax>0) ? (ent.hp/ent.hpMax) : 1;
    const damaged = (ratio <= 0.33);
    if (st && st.mode==="cons"){
      const idx = Math.min(BARR.cons.length-1, Math.floor(st.t / st.spf));
      return { atlas:"cons", name:BARR.cons[idx], done:(idx===BARR.cons.length-1) };
    }
    if (damaged) return { atlas:"idle", name:BARR.idleDamaged[0], done:false };
    const idx = Math.floor((st ? st.t : 0) / (st ? st.spf : 0.09)) % BARR.idleLoop.length;
    return { atlas:"idle", name:BARR.idleLoop[idx], done:false };
  }

  function onPlaced(b){
    if (!b || !b.id) return;
    if (b.kind==="barracks"){
      _kickLoadBarracks();
      _live.set(b.id, { mode:"cons", t:0, spf:0.06 });
    }
  }

  function onDestroyed(b){
    if (!b) return;
    if (b.kind==="barracks"){
      _kickLoadBarracks();
      _ghosts.push({
        kind:"barracks",
        mode:"dest",
        t:0,
        spf:0.05,
        x:b.x, y:b.y,
        tx:b.tx, ty:b.ty, tw:b.tw, th:b.th,
        team:b.team
      });
      _live.delete(b.id);
    }
  }

  function onSold(b){
    if (!b) return;
    if (b.kind==="barracks"){
      _kickLoadBarracks();
      _ghosts.push({
        kind:"barracks",
        mode:"sell",
        t:0,
        spf:0.045,
        x:b.x, y:b.y,
        tx:b.tx, ty:b.ty, tw:b.tw, th:b.th,
        team:b.team
      });
      _live.delete(b.id);
    }
  }

  function tick(dt, state){
    for (const [id, st] of _live){
      st.t += dt;
      if (st.mode==="cons"){
        const maxT = BARR.cons.length * st.spf;
        if (st.t >= maxT){
          st.mode="idle";
          st.t = 0;
          st.spf = 0.09;
        }
      } else {
        if (st.t > 9999) st.t = 0;
      }
    }

    for (let i=_ghosts.length-1;i>=0;i--){
      const g=_ghosts[i];
      g.t += dt;
      if (g.mode==="dest"){
        const maxT = BARR.dest.length * g.spf;
        if (g.t >= maxT) _ghosts.splice(i,1);
      } else if (g.mode==="sell"){
        const maxT = BARR.cons.length * g.spf;
        if (g.t >= maxT) _ghosts.splice(i,1);
      }
    }
  }

  function drawGhosts(ctx, cam, helpers, state){
    const slot = _loaded.barracks;
    if (!slot.ready) return;
    const worldToScreen = helpers.worldToScreen;
    const z = (cam && typeof cam.zoom==="number") ? cam.zoom : 1;

    for (const g of _ghosts){
      if (g.kind!=="barracks") continue;
      const p = worldToScreen(g.x, g.y);

      const footprintW = (g.tw + g.th) * helpers.ISO_X;
      const baseName = BARR.idleLoop[0];
      const sz = atlasTP.getFrameSourceSize(slot.idle, baseName) || { w:1652, h:1252 };
      const baseScale = (footprintW / (sz.w || 1)) * z;

      const tune = _applyTune({kind:"barracks"}, cam);
      const scale = baseScale * (tune.scaleMul || 1);
      const dx = tune.offX || 0;
      const dy = tune.offY || 0;
      const px = tune.pivX || 0;
      const py = tune.pivY || 0;

      let atlas=null, name=null;
      if (g.mode==="dest"){
        const idx = Math.min(BARR.dest.length-1, Math.floor(g.t / g.spf));
        atlas = _pickTeamAtlas(slot,'dest', g.team); name = BARR.dest[idx];
      } else if (g.mode==="sell"){
        const idx = Math.min(BARR.cons.length-1, Math.floor(g.t / g.spf));
        const rev = (BARR.cons.length-1) - idx;
        atlas = _pickTeamAtlas(slot,'cons', g.team); name = BARR.cons[rev];
      }
      if (!atlas || !name) continue;

      const x = p.x + dx - (px * scale);
      const y = p.y + dy - (py * scale);

      atlasTP.drawFrame(ctx, atlas, name, x, y, scale, 1);
    }
  }

  function drawBuilding(ent, ctx, cam, helpers, state){
    if (!ent || ent.kind!=="barracks") return false;
    const slot = _loaded.barracks;
    _kickLoadBarracks();
    if (!slot.ready || !slot.idle) return false;

    const worldToScreen = helpers.worldToScreen;
    const z = (cam && typeof cam.zoom==="number") ? cam.zoom : 1;
    const p = worldToScreen(ent.x, ent.y);

    const footprintW = (ent.tw + ent.th) * helpers.ISO_X;
    const baseName = BARR.idleLoop[0];
    const sz = atlasTP.getFrameSourceSize(slot.idle, baseName) || { w:1652, h:1252 };
    const baseScale = (footprintW / (sz.w || 1)) * z;

    const tune = _applyTune(ent, cam);
    const scale = baseScale * (tune.scaleMul || 1.0);
    const dx = tune.offX || 0;
    const dy = tune.offY || 0;
    const px = tune.pivX || 0;
    const py = tune.pivY || 0;

    try{
      if (helpers.drawFootprintDiamond){
        helpers.drawFootprintDiamond(ent, "rgba(0,0,0,0.20)", "rgba(0,0,0,0)");
      }
    }catch(_e){}

    let st = _live.get(ent.id);
    if (!st){
      st = { mode:"idle", t: (Math.random()*0.2), spf:0.09 };
      _live.set(ent.id, st);
    }

    const pick = _pickBarracksFrame(ent, st);
    const atlas = (pick.atlas==="cons") ? slot.cons : slot.idle;
    const name = pick.name;

    const x = p.x + dx - (px * scale);
    const y = p.y + dy - (py * scale);

    atlasTP.drawFrame(ctx, atlas, name, x, y, scale, 1);
    return true;
  }

  MOD.init = init;
  MOD.onPlaced = onPlaced;
  MOD.onDestroyed = onDestroyed;
  MOD.onSold = onSold;
  MOD.tick = tick;
  MOD.drawBuilding = drawBuilding;
  MOD.drawGhosts = drawGhosts;
  MOD.getTunerCrop = getTunerCrop;
  MOD.tunerKinds = tunerKinds;

  init();
})();
