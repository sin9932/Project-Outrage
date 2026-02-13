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
    barracks: { ready:false, loading:false, idle:null, cons:null, dest:null, err:null }
  };

  const _live = new Map();
  const _ghosts = [];

  function _numSuffix(name){
    const m = /(\d+)(?=\.png$)/i.exec(name);
    return m ? parseInt(m[1],10) : 0;
  }
  function _sorted(list){
    return list.slice().sort((a,b)=>_numSuffix(a)-_numSuffix(b));
  }

  const BARR = {
    idleLoop: _sorted(Array.from({length:18}, (_,i)=>`barrack_idle${i+1}.png`)),
    idleDamaged: ["barrack_dist.png"],
    cons: _sorted(Array.from({length:23}, (_,i)=>`barrack_const${i+1}.png`)),
    dest: _sorted(Array.from({length:22}, (_,i)=>`barrack_distruction${i+1}.png`)),
  };

  const PATH = {
    barracks: {
      idle: { json:"asset/sprite/const/normal/barrack/Barrack_idle.json", base:"asset/sprite/const/normal/barrack/" },
      cons: { json:"asset/sprite/const/const_anim/barrack/barrack_const.json", base:"asset/sprite/const/const_anim/barrack/" },
      dest: { json:"asset/sprite/const/destruct/barrack/barrack_distruction.json", base:"asset/sprite/const/destruct/barrack/" },
    }
  };

  function _kickLoadBarracks(){
    const slot = _loaded.barracks;
    if (slot.ready || slot.loading) return;
    slot.loading = true;
    (async ()=>{
      try{
        if (!atlasTP || !atlasTP.loadTPAtlasMulti) throw new Error("atlas_tp.js not loaded");
        const idle = await atlasTP.loadTPAtlasMulti(PATH.barracks.idle.json, PATH.barracks.idle.base);
        const cons = await atlasTP.loadTPAtlasMulti(PATH.barracks.cons.json, PATH.barracks.cons.base);
        const dest = await atlasTP.loadTPAtlasMulti(PATH.barracks.dest.json, PATH.barracks.dest.base);
        slot.idle = idle; slot.cons = cons; slot.dest = dest;
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
        atlas = slot.dest; name = BARR.dest[idx];
      } else if (g.mode==="sell"){
        const idx = Math.min(BARR.cons.length-1, Math.floor(g.t / g.spf));
        const rev = (BARR.cons.length-1) - idx;
        atlas = slot.cons; name = BARR.cons[rev];
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
