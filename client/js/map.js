// map.js
// - Map presets + terrain/ore generation
// - No DOM dependencies

(function (global) {
  "use strict";

  const OUMap = global.OUMap || (global.OUMap = {});

  OUMap.create = function create(env) {
    const e = env || {};

    const __m = new URLSearchParams(location.search);
    const MAP_W = e.MAP_W || parseInt(__m.get("mapw")||"64",10);
    const MAP_H = e.MAP_H || parseInt(__m.get("maph")||"40",10);
    const terrain = e.terrain;
    const ore = e.ore;
    const idx = e.idx;
    const inMap = e.inMap;
    const clamp = e.clamp;

    function addOreCircle(cx, cy, r){
      for (let y=-r;y<=r;y++){
        for (let x=-r;x<=r;x++){
          const tx=cx+x, ty=cy+y;
          if (!inMap(tx,ty)) continue;
          if (x*x+y*y <= r*r){
            const ii = idx(tx,ty);
            if (terrain[ii]===0) terrain[ii] = 2;
          }
        }
      }
    }

    function addRockRect(x0,y0,x1,y1){
      const ax = clamp(Math.min(x0,x1), 0, MAP_W-1);
      const ay = clamp(Math.min(y0,y1), 0, MAP_H-1);
      const bx = clamp(Math.max(x0,x1), 0, MAP_W-1);
      const by = clamp(Math.max(y0,y1), 0, MAP_H-1);
      for (let ty=ay; ty<=by; ty++){
        for (let tx=ax; tx<=bx; tx++){
          terrain[idx(tx,ty)] = 1;
        }
      }
    }

    function addWaterRect(x0,y0,x1,y1){
      const ax = clamp(Math.min(x0,x1), 0, MAP_W-1);
      const ay = clamp(Math.min(y0,y1), 0, MAP_H-1);
      const bx = clamp(Math.max(x0,x1), 0, MAP_W-1);
      const by = clamp(Math.max(y0,y1), 0, MAP_H-1);
      for (let ty=ay; ty<=by; ty++){
        for (let tx=ax; tx<=bx; tx++){
          terrain[idx(tx,ty)] = 3;
        }
      }
    }

    function addGroundRect(x0,y0,x1,y1){
      const ax = clamp(Math.min(x0,x1), 0, MAP_W-1);
      const ay = clamp(Math.min(y0,y1), 0, MAP_H-1);
      const bx = clamp(Math.max(x0,x1), 0, MAP_W-1);
      const by = clamp(Math.max(y0,y1), 0, MAP_H-1);
      for (let ty=ay; ty<=by; ty++){
        for (let tx=ax; tx<=bx; tx++){
          terrain[idx(tx,ty)] = 0;
        }
      }
    }

    function genMap(kind){
      if (!terrain) return;
      terrain.fill(0);
      const k = kind || "plains";
      const midX = (MAP_W/2)|0;
      const midY = (MAP_H/2)|0;

      if (k==="canyon"){
        addRockRect(midX-2, 0, midX+2, midY-8);
        addRockRect(midX-2, midY+8, midX+2, MAP_H-1);
        addOreCircle(Math.floor(MAP_W*0.20), Math.floor(MAP_H*0.72), 9);
        addOreCircle(Math.floor(MAP_W*0.80), Math.floor(MAP_H*0.28), 9);
        addOreCircle(midX-12, midY+9, 7);
        addOreCircle(midX+12, midY-9, 7);
      } else if (k==="lake"){
        addWaterRect(midX-12, midY-7, midX+12, midY+7);
        addGroundRect(midX-2, midY-1, midX+2, midY+1);
        addGroundRect(midX-1, midY-3, midX+1, midY+3);
        addOreCircle(Math.floor(MAP_W*0.18), Math.floor(MAP_H*0.72), 9);
        addOreCircle(Math.floor(MAP_W*0.82), Math.floor(MAP_H*0.28), 9);
        addOreCircle(midX-16, midY, 7);
        addOreCircle(midX+16, midY, 7);
      } else if (k==="bridges"){
        addWaterRect(0, midY-6, MAP_W-1, midY-4);
        addWaterRect(0, midY+4, MAP_W-1, midY+6);
        addGroundRect(midX-2, midY-6, midX+2, midY+6);
        addOreCircle(Math.floor(MAP_W*0.20), Math.floor(MAP_H*0.72), 9);
        addOreCircle(Math.floor(MAP_W*0.80), Math.floor(MAP_H*0.28), 9);
        addOreCircle(midX-18, midY, 7);
        addOreCircle(midX+18, midY, 7);
      } else {
        addOreCircle(Math.floor(MAP_W*0.20), Math.floor(MAP_H*0.72), 9);
        addOreCircle(Math.floor(MAP_W*0.80), Math.floor(MAP_H*0.28), 9);
        addOreCircle(midX-12, midY+6, 7);
        addOreCircle(midX+12, midY-6, 7);
        addOreCircle(midX-22, midY+10, 6);
        addOreCircle(midX+22, midY-10, 6);
      }
    }

    function regenOre(){
      if (!ore) return;
      ore.fill(0);
      for (let ty=0; ty<MAP_H; ty++){
        for (let tx=0; tx<MAP_W; tx++){
          if (terrain[idx(tx,ty)] === 2) ore[idx(tx,ty)] = 1200;
        }
      }
    }

    return { genMap, regenOre };
  };

  /**
   * loadFromTMJ(url, refs) -> Promise
   * Loads Tiled TMJ map, fills terrain/ore/isGem/treeHp, populates startBeaconTiles.
   * refs: { terrain, ore, isGem, treeHp, startBeaconTiles, MAP_W, MAP_H, idx, oreAmountFromGid, TREE_HP_MAX }
   */
  OUMap.loadFromTMJ = async function loadFromTMJ(url, refs) {
    const r = refs || {};
    const terrain = r.terrain;
    const ore = r.ore;
    const isGem = r.isGem;
    const treeHp = r.treeHp;
    const startBeaconTiles = r.startBeaconTiles || [];
    const MAP_W = r.MAP_W || 40;
    const MAP_H = r.MAP_H || 40;
    const idx = r.idx || ((tx, ty) => ty * MAP_W + tx);
    const oreAmountFromGid = r.oreAmountFromGid || (() => 1200);
    const TREE_HP_MAX = r.TREE_HP_MAX ?? 5;

    if (terrain) terrain.fill(0);
    if (ore) ore.fill(0);
    if (isGem) isGem.fill(0);
    if (treeHp) treeHp.fill(0);
    startBeaconTiles.length = 0;

    try {
      const resp = await fetch(url, { cache: "force-cache" });
      const data = await resp.json();
      const w = data.width | 0;
      const h = data.height | 0;
      const layers = Array.isArray(data.layers) ? data.layers : [];
      const baseLayer = layers.find((l) => l.type === "tilelayer" && l.name === "base");
      const oreLayer = layers.find((l) => l.type === "tilelayer" && l.name === "ore");
      const startLayer = layers.find((l) => l.type === "tilelayer" && l.name === "start");

      if (baseLayer && Array.isArray(baseLayer.data)) {
        for (let ty = 0; ty < MAP_H; ty++) {
          for (let tx = 0; tx < MAP_W; tx++) {
            const gi = ty < h && tx < w ? baseLayer.data[ty * w + tx] : 0;
            if (terrain) terrain[idx(tx, ty)] = gi > 0 ? 0 : 0;
          }
        }
      }

      if (oreLayer && Array.isArray(oreLayer.data)) {
        for (let ty = 0; ty < MAP_H; ty++) {
          for (let tx = 0; tx < MAP_W; tx++) {
            const gi = ty < h && tx < w ? oreLayer.data[ty * w + tx] : 0;
            if (gi > 0 && ore) {
              if (terrain) terrain[idx(tx, ty)] = 2;
              ore[idx(tx, ty)] = oreAmountFromGid(gi, false);
            }
          }
        }
        const gemLayer = layers.find((l) => l.type === "tilelayer" && (l.name || "").toLowerCase() === "gem");
        if (gemLayer && Array.isArray(gemLayer.data)) {
          const gw = gemLayer.width || w;
          const gh = gemLayer.height || h;
          for (let ty = 0; ty < Math.min(MAP_H, gh); ty++) {
            for (let tx = 0; tx < Math.min(MAP_W, gw); tx++) {
              const gid = gemLayer.data[ty * gw + tx] & 0x1ffffff;
              if (gid > 0 && ore) {
                if (terrain) terrain[idx(tx, ty)] = 2;
                ore[idx(tx, ty)] = oreAmountFromGid(gid, true);
                if (isGem) isGem[idx(tx, ty)] = 1;
              }
            }
          }
        }
      }

      if (startLayer && Array.isArray(startLayer.data)) {
        const START_BEACON_FIRSTGID = 235;
        for (let ty = 0; ty < h; ty++) {
          for (let tx = 0; tx < w; tx++) {
            const gid = startLayer.data[ty * w + tx] & 0x1ffffff;
            if (gid >= START_BEACON_FIRSTGID) startBeaconTiles.push({ tx, ty });
          }
        }
        startBeaconTiles.sort((a, b) => a.ty * MAP_W + a.tx - (b.ty * MAP_W + b.tx));
        if (startBeaconTiles.length > 2) startBeaconTiles.length = 2;
      }

      const treeLayer = layers.find((l) => l.type === "tilelayer" && (l.name || "").toLowerCase() === "tree");
      if (treeLayer && Array.isArray(treeLayer.data) && treeHp) {
        const tw = treeLayer.width || w;
        const th = treeLayer.height || h;
        for (let ty = 0; ty < Math.min(MAP_H, th); ty++) {
          for (let tx = 0; tx < Math.min(MAP_W, tw); tx++) {
            const gid = treeLayer.data[ty * tw + tx] & 0x1ffffff;
            if (gid > 0) treeHp[idx(tx, ty)] = TREE_HP_MAX;
          }
        }
      }
    } catch (e) {
      console.error("TMJ load failed:", url, e);
    }
  };
})(window);


