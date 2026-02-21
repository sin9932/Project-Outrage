// map.js
// - Map presets + terrain/ore generation
// - No DOM dependencies

(function (global) {
  "use strict";

  const OUMap = global.OUMap || (global.OUMap = {});

  // === Tiled (JSON .tmj) helpers ===
  // Goal: let the game read special marker tiles (start beacons, etc.) from a tile layer.
  // Usage:
  //   const starts = OUMap.tiled.findStarts(tiledJson);
  //   // pick team==1 start and spawn your Construction Yard there.
  OUMap.tiled = OUMap.tiled || {};

  function _propsArrToObj(arr){
    const out = {};
    if (!Array.isArray(arr)) return out;
    for (const p of arr){
      if (!p || !p.name) continue;
      out[p.name] = (p.value !== undefined) ? p.value : p;
    }
    return out;
  }

  // Build: gid -> { ...properties }
  // Works best when you export as JSON (tmj) with embedded tilesets (or external tilesets that still include tiles[].properties).
  OUMap.tiled.buildGidPropsIndex = function buildGidPropsIndex(tiled){
    const idx = new Map();
    if (!tiled || !Array.isArray(tiled.tilesets)) return idx;
    for (const ts of tiled.tilesets){
      const firstgid = ts.firstgid|0;
      const tiles = ts.tiles;
      if (!firstgid || !Array.isArray(tiles)) continue;
      for (const t of tiles){
        if (!t || t.id == null) continue;
        const gid = firstgid + (t.id|0);
        const props = _propsArrToObj(t.properties);
        if (Object.keys(props).length) idx.set(gid, props);
      }
    }
    return idx;
  };

  // Find all "start" beacons painted on any tile layer.
  // Returns [{tx,ty,team,spawn,gid,layerName}]
  OUMap.tiled.findStarts = function findStarts(tiled){
    const out = [];
    if (!tiled || !Array.isArray(tiled.layers)) return out;
    const W = tiled.width|0;
    const H = tiled.height|0;
    if (!W || !H) return out;

    const gidProps = OUMap.tiled.buildGidPropsIndex(tiled);

    for (const layer of tiled.layers){
      if (!layer || layer.type !== "tilelayer") continue;
      const data = layer.data;
      if (!Array.isArray(data) || data.length !== W*H) continue;
      for (let i=0;i<data.length;i++){
        const gid = data[i]>>>0;
        if (!gid) continue;
        const props = gidProps.get(gid);
        if (!props) continue;
        if (props.kind !== "start") continue;
        const tx = i % W;
        const ty = (i / W) | 0;
        out.push({
          tx, ty,
          team: (props.team==null ? 1 : (props.team|0)),
          spawn: (props.spawn || "conyard"),
          gid,
          layerName: layer.name || "",
        });
      }
    }
    return out;
  };

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
          if (terrain[idx(tx,ty)] === 2) ore[idx(tx,ty)] = 520;
        }
      }
    }

    return { genMap, regenOre };
  };
})(window);


