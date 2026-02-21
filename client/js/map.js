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
          if (terrain[idx(tx,ty)] === 2) ore[idx(tx,ty)] = 520;
        }
      }
    }

    return { genMap, regenOre };
  };
})(window);


