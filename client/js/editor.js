window.addEventListener("DOMContentLoaded", () => {
  const c = document.getElementById("c");
  if (!c) { console.error("editor: canvas not found"); return; }
  const ctx = c.getContext("2d");
  const right = document.getElementById("right");
  const mini = document.getElementById("minimap");
  const miniCtx = mini ? mini.getContext("2d") : null;

  const mapWEl = document.getElementById("mapW");
  const mapHEl = document.getElementById("mapH");
  if (!mapWEl || !mapHEl) { console.error("editor: inputs not found"); return; }
  const btnResize = document.getElementById("btnResize");
  const fileEl = document.getElementById("file");
  const btnExport = document.getElementById("btnExport");
  const brushBtns = Array.from(document.querySelectorAll("[data-brush]"));

  const qs = new URLSearchParams(location.search);
  let W = Math.max(4, parseInt(qs.get("mapw") || mapWEl.value, 10));
  let H = Math.max(4, parseInt(qs.get("maph") || mapHEl.value, 10));

  const ISO_X = parseFloat(qs.get("isox") || "55");
  const ISO_Y = parseFloat(qs.get("isoy") || "27.5");

  mapWEl.value = W;
  mapHEl.value = H;

  let terrain = new Uint8Array(W * H);
  let tex = new Uint16Array(W * H);
  let roads = new Uint8Array(W * H);

  const colors = {
    0: "#0f1522",
    1: "#3a3f4b",
    2: "#caa23a",
    3: "#0f2a44"
  };

  const TEX = {
    GRASS: 1,
    SAND: 2,
    BREEK1: 3,
    BREEK2: 4,
    WATER1: 5,
    WATER2: 6,
    ORE: 7
  };

  const ROAD = {
    CLEAR: 0,
    R1: 1, R2: 2, R3: 3, R4: 4,
    R5: 5, R6: 6, R7: 7, R8: 8,
    R9: 9, R10: 10, R11: 11, R12: 12,
    R13: 13, R14: 14, R15: 15, R16: 16
  };

  const texPaths = {
    [TEX.GRASS]: "asset/sprite/map/grass1.jpg",
    [TEX.SAND]: "asset/sprite/map/sand1.jpg",
    [TEX.BREEK1]: "asset/sprite/map/breek_tile1.jpg",
    [TEX.BREEK2]: "asset/sprite/map/breek_tile2.jpg",
    [TEX.WATER1]: "asset/sprite/map/water.jpg",
    [TEX.WATER2]: "asset/sprite/map/water2.jpg",
    [TEX.ORE]: "asset/sprite/map/sand1.jpg"
  };

  const roadPaths = {
    [ROAD.R1]: "asset/sprite/map/road1.jpg",
    [ROAD.R2]: "asset/sprite/map/road2.jpg",
    [ROAD.R3]: "asset/sprite/map/road3.jpg",
    [ROAD.R4]: "asset/sprite/map/road4.jpg",
    [ROAD.R5]: "asset/sprite/map/road5.jpg",
    [ROAD.R6]: "asset/sprite/map/road6.JPG",
    [ROAD.R7]: "asset/sprite/map/road7.jpg",
    [ROAD.R8]: "asset/sprite/map/road8.jpg",
    [ROAD.R9]: "asset/sprite/map/road9.jpg",
    [ROAD.R10]: "asset/sprite/map/road10.jpg",
    [ROAD.R11]: "asset/sprite/map/road11.jpg",
    [ROAD.R12]: "asset/sprite/map/road12.jpg",
    [ROAD.R13]: "asset/sprite/map/road13.jpg",
    [ROAD.R14]: "asset/sprite/map/road14.jpg",
    [ROAD.R15]: "asset/sprite/map/road15.jpg",
    [ROAD.R16]: "asset/sprite/map/road16.jpg"
  };

  const texImgs = {};
  const texPats = {};
  const blendCache = new Map();

  const brushDefs = {
    grass:   { kind: "terrain", terrain: 0, tex: TEX.GRASS },
    sand:    { kind: "terrain", terrain: 1, tex: TEX.SAND },
    breek1:  { kind: "terrain", terrain: 1, tex: TEX.BREEK1 },
    breek2:  { kind: "terrain", terrain: 1, tex: TEX.BREEK2 },
    ore:     { kind: "terrain", terrain: 2, tex: TEX.ORE },
    water1:  { kind: "terrain", terrain: 3, tex: TEX.WATER1 },
    water2:  { kind: "terrain", terrain: 3, tex: TEX.WATER2 },
    road1:   { kind: "road", road: ROAD.R1 },
    road2:   { kind: "road", road: ROAD.R2 },
    road3:   { kind: "road", road: ROAD.R3 },
    road4:   { kind: "road", road: ROAD.R4 },
    road5:   { kind: "road", road: ROAD.R5 },
    road6:   { kind: "road", road: ROAD.R6 },
    road7:   { kind: "road", road: ROAD.R7 },
    road8:   { kind: "road", road: ROAD.R8 },
    road9:   { kind: "road", road: ROAD.R9 },
    road10:  { kind: "road", road: ROAD.R10 },
    road11:  { kind: "road", road: ROAD.R11 },
    road12:  { kind: "road", road: ROAD.R12 },
    road13:  { kind: "road", road: ROAD.R13 },
    road14:  { kind: "road", road: ROAD.R14 },
    road15:  { kind: "road", road: ROAD.R15 },
    road16:  { kind: "road", road: ROAD.R16 },
    road_clear: { kind: "road", road: ROAD.CLEAR }
  };

  let brush = brushDefs.grass;
  let painting = false;
  let wheelActive = false;
  let wheelLock = false;
  let brushRadius = 0;

  let selecting = false;
  let selStart = null;
  let selEnd = null;
  let selection = null;
  let hoverTile = null;
  let lastHoverKey = "";
  let lastPointer = { x: 0, y: 0 };
  const DEBUG = new URLSearchParams(location.search).get("debug") === "1";
  let clipboard = null;

  const view = { zoom: 1, min: 0.35, max: 3.0 };
  let dirty = true;
  const mapCache = document.createElement("canvas");
  const mapCtx = mapCache.getContext("2d");
  function isoX(){ return ISO_X * view.zoom; }
  function isoY(){ return ISO_Y * view.zoom; }
  function mapPixelSizeBase(){
    const baseW = (W + H) * ISO_X + ISO_X * 2;
    const baseH = (W + H) * ISO_Y + ISO_Y * 2;
    return { baseW, baseH };
  }

  const undoStack = [];
  const redoStack = [];
  const MAX_UNDO = 60;

  function idx(x,y){ return y*W + x; }

  function cloneSnapshot(){
    return {
      terrain: new Uint8Array(terrain),
      tex: new Uint16Array(tex),
      roads: new Uint8Array(roads)
    };
  }

  function applySnapshot(s){
    terrain = new Uint8Array(s.terrain);
    tex = new Uint16Array(s.tex);
    roads = new Uint8Array(s.roads);
  }

  function pushUndo(){
    undoStack.push(cloneSnapshot());
    if (undoStack.length > MAX_UNDO) undoStack.shift();
    redoStack.length = 0;
  }

  function undo(){
    if (!undoStack.length) return;
    redoStack.push(cloneSnapshot());
    const snap = undoStack.pop();
    applySnapshot(snap);
    render();
  }

  function redo(){
    if (!redoStack.length) return;
    undoStack.push(cloneSnapshot());
    const snap = redoStack.pop();
    applySnapshot(snap);
    render();
  }

  function mapPixelSize(){
    const baseW = (W + H) * isoX() + isoX() * 2;
    const baseH = (W + H) * isoY() + isoY() * 2;
    return { baseW, baseH };
  }

  function setCanvasSize(){
    const s = mapPixelSize();
    c.width = Math.ceil(s.baseW);
    c.height = Math.ceil(s.baseH);
  }

  function resizeMap(nw, nh){
    const nTerrain = new Uint8Array(nw*nh);
    const nTex = new Uint16Array(nw*nh);
    const nRoads = new Uint8Array(nw*nh);
    const minW = Math.min(W, nw);
    const minH = Math.min(H, nh);
    for (let y=0; y<minH; y++){
      for (let x=0; x<minW; x++){
        const i0 = idx(x,y);
        const i1 = y*nw + x;
        nTerrain[i1] = terrain[i0];
        nTex[i1] = tex[i0];
        nRoads[i1] = roads[i0];
      }
    }
    W = nw; H = nh;
    terrain = nTerrain;
    tex = nTex;
    roads = nRoads;
    mapWEl.value = W; mapHEl.value = H;
    selection = null;
    setCanvasSize();
    render();
  }

  function getImage(path){
    if (!path) return null;
    if (!texImgs[path]){
      const img = new Image();
      img.onload = () => { texPats[path] = null; blendCache.clear(); render(); };
      img.src = path;
      texImgs[path] = img;
    }
    const img = texImgs[path];
    if (img && img.complete) return img;
    return null;
  }

  function textureForTile(tx, ty){
    const tId = tex[idx(tx,ty)];
    const path = texPaths[tId];
    return getImage(path);
  }

  function roadForTile(tx, ty){
    const rId = roads[idx(tx,ty)];
    const path = roadPaths[rId];
    return getImage(path);
  }

  function origin(){
    const s = mapPixelSize();
    const midx = (W - 1) * 0.5;
    const midy = (H - 1) * 0.5;
    const ox = (s.baseW * 0.5) - ((midx - midy) * isoX());
    const oy = (s.baseH * 0.5) - ((midx + midy) * isoY());
    return { ox, oy };
  }

  function tileCenterScreen(tx, ty, ox, oy){
    return {
      x: (tx - ty) * isoX() + ox,
      y: (tx + ty) * isoY() + oy
    };
  }

  function pointInDiamond(px, py, cx, cy){
    const dx = Math.abs(px - cx);
    const dy = Math.abs(py - cy);
    return (dx / isoX() + dy / isoY()) <= 1;
  }

  function screenToTile(px, py){
    const { ox, oy } = origin();
    const lx = px - ox;
    const ly = py - oy;
    const fx = (lx / isoX() + ly / isoY()) * 0.5;
    const fy = (ly / isoY() - lx / isoX()) * 0.5;
    const tx0 = Math.floor(fx);
    const ty0 = Math.floor(fy);
    let best = null;
    for (let dy=-1; dy<=1; dy++){
      for (let dx=-1; dx<=1; dx++){
        const tx = tx0 + dx;
        const ty = ty0 + dy;
        if (tx<0 || ty<0 || tx>=W || ty>=H) continue;
        const c0 = tileCenterScreen(tx, ty, ox, oy);
        if (pointInDiamond(lx + ox, ly + oy, c0.x, c0.y)) return { tx, ty };
        const dd = (lx + ox - c0.x) * (lx + ox - c0.x) + (ly + oy - c0.y) * (ly + oy - c0.y);
        if (!best || dd < best.dd) best = { tx, ty, dd };
      }
    }
    return best ? { tx: best.tx, ty: best.ty } : null;
  }

  function drawDiamondPath(cx, cy){
    ctx.beginPath();
    ctx.moveTo(cx, cy - isoY());
    ctx.lineTo(cx + isoX(), cy);
    ctx.lineTo(cx, cy + isoY());
    ctx.lineTo(cx - isoX(), cy);
    ctx.closePath();
  }

  function drawDiamondImage(cx, cy, img){
    const iw = img && img.width ? img.width : 0;
    const ih = img && img.height ? img.height : 0;
    if (!iw || !ih){
      drawDiamondFill(cx, cy, "#000");
      return;
    }
    drawDiamondPath(cx, cy);
    ctx.save();
    ctx.clip();
    const a = isoX() / iw;
    const b = isoY() / iw;
    const cM = -isoX() / ih;
    const d = isoY() / ih;
    ctx.setTransform(a, b, cM, d, cx, cy);
    ctx.drawImage(img, -iw * 0.5, -ih * 0.5);
    ctx.restore();
  }

  function drawDiamondFill(cx, cy, fillStyle){
    drawDiamondPath(cx, cy);
    ctx.fillStyle = fillStyle;
    ctx.fill();
  }

  function isBrick(texId){
    return texId === TEX.BREEK1 || texId === TEX.BREEK2;
  }

  function isBlendable(texId){
    return texId !== 0 && !isBrick(texId);
  }

  function edgeKey(texId, dir){
    return texId + ":" + dir + ":" + view.zoom.toFixed(3);
  }

  function getEdgeBlendCanvas(texId, dir){
    const key = edgeKey(texId, dir);
    if (blendCache.has(key)) return blendCache.get(key);
    const path = texPaths[texId];
    const img = getImage(path);
    if (!img){ blendCache.set(key, null); return null; }

    const w = isoX() * 2;
    const h = isoY() * 2;
    const cnv = document.createElement("canvas");
    cnv.width = Math.ceil(w);
    cnv.height = Math.ceil(h);
    const g = cnv.getContext("2d");

    g.drawImage(img, 0, 0, w, h);
    g.globalCompositeOperation = "destination-in";
    g.beginPath();
    g.moveTo(w * 0.5, 0);
    g.lineTo(w, h * 0.5);
    g.lineTo(w * 0.5, h);
    g.lineTo(0, h * 0.5);
    g.closePath();
    g.fillStyle = "#fff";
    g.fill();

    g.globalCompositeOperation = "destination-in";
    const feather = Math.max(6, Math.round(Math.min(isoX(), isoY()) * 0.70));
    let grad;
    if (dir === "N"){
      grad = g.createLinearGradient(0, 0, 0, feather);
      grad.addColorStop(0, "rgba(255,255,255,1)");
      grad.addColorStop(1, "rgba(255,255,255,0)");
    } else if (dir === "S"){
      grad = g.createLinearGradient(0, h - feather, 0, h);
      grad.addColorStop(0, "rgba(255,255,255,0)");
      grad.addColorStop(1, "rgba(255,255,255,1)");
    } else if (dir === "E"){
      grad = g.createLinearGradient(w - feather, 0, w, 0);
      grad.addColorStop(0, "rgba(255,255,255,0)");
      grad.addColorStop(1, "rgba(255,255,255,1)");
    } else {
      grad = g.createLinearGradient(0, 0, feather, 0);
      grad.addColorStop(0, "rgba(255,255,255,1)");
      grad.addColorStop(1, "rgba(255,255,255,0)");
    }
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);

    g.globalCompositeOperation = "source-over";
    blendCache.set(key, cnv);
    return cnv;
  }

  function renderMini(){
    if (!miniCtx || !mini) return;
    const s = mapPixelSizeBase();
    const scale = Math.min(mini.width / s.baseW, mini.height / s.baseH);
    const offX = (mini.width - s.baseW * scale) * 0.5;
    const offY = (mini.height - s.baseH * scale) * 0.5;

    miniCtx.setTransform(1,0,0,1,0,0);
    miniCtx.clearRect(0,0,mini.width,mini.height);
    miniCtx.setTransform(scale,0,0,scale,offX,offY);

    const midx = (W - 1) * 0.5;
    const midy = (H - 1) * 0.5;
    const ox = (s.baseW * 0.5) - ((midx - midy) * ISO_X);
    const oy = (s.baseH * 0.5) - ((midx + midy) * ISO_Y);

    for (let y=0; y<H; y++){
      for (let x=0; x<W; x++){
        const t = terrain[idx(x,y)];
        const cx = (x - y) * ISO_X + ox;
        const cy = (x + y) * ISO_Y + oy;
        miniCtx.beginPath();
        miniCtx.moveTo(cx, cy - ISO_Y);
        miniCtx.lineTo(cx + ISO_X, cy);
        miniCtx.lineTo(cx, cy + ISO_Y);
        miniCtx.lineTo(cx - ISO_X, cy);
        miniCtx.closePath();
        miniCtx.fillStyle = colors[t] || "#000";
        miniCtx.fill();
      }
    }

    if (right){
      const vx = right.scrollLeft / view.zoom;
      const vy = right.scrollTop / view.zoom;
      const vw = right.clientWidth / view.zoom;
      const vh = right.clientHeight / view.zoom;
      miniCtx.setTransform(scale,0,0,scale,offX,offY);
      miniCtx.strokeStyle = "rgba(255,255,255,0.9)";
      miniCtx.lineWidth = 2 / scale;
      miniCtx.strokeRect(vx, vy, vw, vh);
    }
  }

    function drawBase(){
    const { ox, oy } = origin();
    for (let y=0; y<H; y++){
      for (let x=0; x<W; x++){
        const i = idx(x,y);
        const t = terrain[i];
        const c0 = tileCenterScreen(x, y, ox, oy);
        const baseImg = textureForTile(x, y);
        if (baseImg){
          drawDiamondImage(c0.x, c0.y, baseImg);
        } else {
          const fill = colors[t] || "#000";
          drawDiamondFill(c0.x, c0.y, fill);
        }

        if (t === 2){
          ctx.save();
          ctx.globalAlpha = 0.35;
          drawDiamondFill(c0.x, c0.y, colors[2]);
          ctx.restore();
        }

        const roadImg = roadForTile(x, y);
        if (roadImg){
          ctx.save();
          ctx.globalAlpha = 0.95;
          drawDiamondImage(c0.x, c0.y, roadImg);
          ctx.restore();
        }

        const texId = tex[i];
        if (isBlendable(texId) && roads[i] === 0){
          const n = [
            { dx: 0, dy: -1, dir: "N" },
            { dx: 1, dy: 0, dir: "E" },
            { dx: 0, dy: 1, dir: "S" },
            { dx: -1, dy: 0, dir: "W" }
          ];
          for (const nb of n){
            const nx = x + nb.dx;
            const ny = y + nb.dy;
            if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
            const ni = idx(nx, ny);
            if (roads[ni] !== 0) continue;
            const nt = tex[ni];
            if (nt === texId) continue;
            if (!isBlendable(nt)) continue;
            const edge = getEdgeBlendCanvas(nt, nb.dir);
            if (edge){
              ctx.drawImage(edge, c0.x - ISO_X, c0.y - ISO_Y, ISO_X*2, ISO_Y*2);
            }
          }
        }

        ctx.strokeStyle = "rgba(255,255,255,0.10)";
        ctx.lineWidth = 1;
        drawDiamondPath(c0.x, c0.y);
        ctx.stroke();
      }
    }
  }

  function render(){
    if (dirty){
      ctx.setTransform(1,0,0,1,0,0);
      ctx.clearRect(0,0,c.width,c.height);
      drawBase();
      mapCache.width = c.width;
      mapCache.height = c.height;
      mapCtx.setTransform(1,0,0,1,0,0);
      mapCtx.clearRect(0,0,mapCache.width,mapCache.height);
      mapCtx.drawImage(c, 0, 0);
      dirty = false;
    } else {
      ctx.setTransform(1,0,0,1,0,0);
      ctx.clearRect(0,0,c.width,c.height);
      ctx.drawImage(mapCache, 0, 0);
    }

    if (hoverTile && !selecting){
      const { ox, oy } = origin();
      ctx.save();
      ctx.globalAlpha = 0.20;
      ctx.fillStyle = "rgba(0,200,255,0.35)";
      const r = Math.max(0, brushRadius|0);
      if (r === 0){
        const cH = tileCenterScreen(hoverTile.tx, hoverTile.ty, ox, oy);
        drawDiamondFill(cH.x, cH.y, ctx.fillStyle);
        ctx.globalAlpha = 0.85;
        ctx.strokeStyle = "rgba(0,255,255,0.9)";
        ctx.lineWidth = 2;
        drawDiamondPath(cH.x, cH.y);
        ctx.stroke();
      } else {
        for (let dy=-r; dy<=r; dy++){
          for (let dx=-r; dx<=r; dx++){
            if (dx*dx + dy*dy > r*r) continue;
            const tx = hoverTile.tx + dx;
            const ty = hoverTile.ty + dy;
            if (tx<0 || ty<0 || tx>=W || ty>=H) continue;
            const cH = tileCenterScreen(tx, ty, ox, oy);
            drawDiamondFill(cH.x, cH.y, ctx.fillStyle);
          }
        }
        ctx.globalAlpha = 0.85;
        ctx.strokeStyle = "rgba(0,255,255,0.9)";
        ctx.lineWidth = 2;
        const cH = tileCenterScreen(hoverTile.tx, hoverTile.ty, ox, oy);
        drawDiamondPath(cH.x, cH.y);
        ctx.stroke();
      }
      ctx.restore();
    }

    if (selection){
      const { ox, oy } = origin();
      ctx.save();
      ctx.strokeStyle = "rgba(255,215,0,0.9)";
      ctx.lineWidth = 2;
      for (let y=selection.y; y<selection.y+selection.h; y++){
        for (let x=selection.x; x<selection.x+selection.w; x++){
          const c0 = tileCenterScreen(x, y, ox, oy);
          drawDiamondPath(c0.x, c0.y);
          ctx.stroke();
        }
      }
      ctx.restore();
    }

    if (DEBUG){
      ctx.save();
      ctx.setTransform(1,0,0,1,0,0);
      ctx.fillStyle = "rgba(0,0,0,0.55)";
      ctx.fillRect(12, 12, 360, 86);
      ctx.fillStyle = "#9ef";
      ctx.font = "12px monospace";
      const hx = hoverTile ? hoverTile.tx : "-";
      const hy = hoverTile ? hoverTile.ty : "-";
      ctx.fillText(`ptr: ${lastPointer.x.toFixed(1)},${lastPointer.y.toFixed(1)}`, 20, 32);
      ctx.fillText(`hover: ${hx},${hy}  paint:${painting} wheelLock:${wheelLock}`, 20, 48);
      ctx.fillText(`zoom:${view.zoom.toFixed(2)} scroll:${right?right.scrollLeft:0},${right?right.scrollTop:0}`, 20, 64);
      ctx.restore();
    }

    renderMini();
  }

  function applyBrush(tx, ty){
    if (tx<0 || ty<0 || tx>=W || ty>=H) return false;
    const i = idx(tx,ty);
    if (brush.kind === "road"){
      if (roads[i] === brush.road) return false;
      roads[i] = brush.road;
      return true;
    }
    let changed = false;
    if (terrain[i] !== brush.terrain){
      terrain[i] = brush.terrain;
      changed = true;
    }
    if (tex[i] !== brush.tex){
      tex[i] = brush.tex;
      changed = true;
    }
    return changed;
  }

  function paintAt(px, py){
    const hit = screenToTile(px, py);
    if (!hit) return false;
    let changed = false;
    const r = Math.max(0, brushRadius|0);
    if (r === 0){
      changed = applyBrush(hit.tx, hit.ty) || changed;
    } else {
      for (let dy=-r; dy<=r; dy++){
        for (let dx=-r; dx<=r; dx++){
          if (dx*dx + dy*dy > r*r) continue;
          changed = applyBrush(hit.tx + dx, hit.ty + dy) || changed;
        }
      }
    }
    return changed;
  }

  function normalizeSelection(){
    if (!selStart || !selEnd) return null;
    const x0 = Math.min(selStart.tx, selEnd.tx);
    const y0 = Math.min(selStart.ty, selEnd.ty);
    const x1 = Math.max(selStart.tx, selEnd.tx);
    const y1 = Math.max(selStart.ty, selEnd.ty);
    return { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
  }

  function copySelection(){
    if (!selection) return;
    const data = new Uint8Array(selection.w * selection.h);
    const tdata = new Uint16Array(selection.w * selection.h);
    const rdata = new Uint8Array(selection.w * selection.h);
    for (let y=0; y<selection.h; y++){
      for (let x=0; x<selection.w; x++){
        const src = idx(selection.x + x, selection.y + y);
        const dst = y*selection.w + x;
        data[dst] = terrain[src];
        tdata[dst] = tex[src];
        rdata[dst] = roads[src];
      }
    }
    clipboard = { w: selection.w, h: selection.h, terrain: data, tex: tdata, roads: rdata };
  }

  function pasteClipboard(){
    if (!clipboard || !hoverTile) return;
    pushUndo();
    for (let y=0; y<clipboard.h; y++){
      for (let x=0; x<clipboard.w; x++){
        const tx0 = hoverTile.tx + x;
        const ty0 = hoverTile.ty + y;
        if (tx0<0 || ty0<0 || tx0>=W || ty0>=H) continue;
        const dst = idx(tx0, ty0);
        const src = y*clipboard.w + x;
        terrain[dst] = clipboard.terrain[src];
        tex[dst] = clipboard.tex[src];
        roads[dst] = clipboard.roads[src];
      }
    }
    render();
  }

  function initTexFromTerrain(){
    for (let y=0; y<H; y++){
      for (let x=0; x<W; x++){
        const i = idx(x,y);
        const t = terrain[i];
        if (t === 0) tex[i] = TEX.GRASS;
        else if (t === 1) tex[i] = TEX.SAND;
        else if (t === 2) tex[i] = TEX.ORE;
        else if (t === 3) tex[i] = TEX.WATER1;
      }
    }
  }

  c.addEventListener("pointerdown", (e)=>{
    const r = c.getBoundingClientRect();
    const px = e.clientX - r.left;
    const py = e.clientY - r.top;
    lastPointer = { x: px, y: py };
    if (wheelLock) return;
    if (e.button !== 0) return;
    if (e.shiftKey){
      selecting = true;
      selStart = screenToTile(px, py);
      selEnd = selStart;
      selection = normalizeSelection();
      render();
      return;
    }

    if (wheelActive) return;
    painting = true;
    c.setPointerCapture(e.pointerId);
    pushUndo();
    paintAt(px, py);
    render();
  });

  window.addEventListener("pointerup", (e)=>{
    try{ c.releasePointerCapture(e.pointerId); }catch(_){ }
    painting = false;
    if (selecting){
      selecting = false;
      selection = normalizeSelection();
      render();
    }
  });

  c.addEventListener("pointermove", (e)=>{
    const r = c.getBoundingClientRect();
    const px = e.clientX - r.left;
    const py = e.clientY - r.top;
    lastPointer = { x: px, y: py };
    hoverTile = screenToTile(px, py);
    const key = hoverTile ? (hoverTile.tx + "," + hoverTile.ty) : "";

    if (selecting){
      selEnd = hoverTile;
      selection = normalizeSelection();
      render();
      return;
    }

    if (!painting){
      if (key !== lastHoverKey){
        lastHoverKey = key;
        render();
      }
      return;
    }

    if (!(e.buttons & 1)){
      painting = false;
      return;
    }

    const did = paintAt(px, py);
    if (did) dirty = true;
    if (did) render();
  });

  brushBtns.forEach(btn=>{
    btn.addEventListener("click", ()=>{
      brushBtns.forEach(b=>b.classList.remove("active"));
      btn.classList.add("active");
      const key = btn.dataset.brush;
      brush = brushDefs[key] || brushDefs.grass;
    });
  });

  btnResize.addEventListener("click", ()=>{
    const nw = Math.max(4, parseInt(mapWEl.value,10));
    const nh = Math.max(4, parseInt(mapHEl.value,10));
    resizeMap(nw, nh);
  });

  btnExport.addEventListener("click", ()=>{
    const data = { w: W, h: H, terrain: Array.from(terrain), tex: Array.from(tex), roads: Array.from(roads) };
    const blob = new Blob([JSON.stringify(data)], {type:"application/json"});
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `map_${W}x${H}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  });

  fileEl.addEventListener("change", async (e)=>{
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    const txt = await f.text();
    const data = JSON.parse(txt);
    if (!data || !data.w || !data.h || !data.terrain) return;
    W = data.w|0; H = data.h|0;
    terrain = new Uint8Array(data.terrain);
    tex = data.tex ? new Uint16Array(data.tex) : new Uint16Array(W * H);
    roads = data.roads ? new Uint8Array(data.roads) : new Uint8Array(W * H);
    mapWEl.value = W; mapHEl.value = H;
    selection = null;
    if (!data.tex) initTexFromTerrain();
    setCanvasSize();
    render();
  });

  window.addEventListener("keydown", (e)=>{
    const key = e.key.toLowerCase();
    if (e.ctrlKey && key === "z"){
      e.preventDefault();
      undo();
      return;
    }
    if (e.ctrlKey && (key === "y" || (key === "z" && e.shiftKey))){
      e.preventDefault();
      redo();
      return;
    }
    if (e.ctrlKey && key === "c"){
      e.preventDefault();
      copySelection();
      return;
    }
    if (e.ctrlKey && key === "v"){
      e.preventDefault();
      pasteClipboard();
      return;
    }
    if (key === "+" || key === "="){
      e.preventDefault();
      brushRadius = Math.min(8, brushRadius + 1);
      render();
      return;
    }
    if (key === "-"){
      e.preventDefault();
      brushRadius = Math.max(0, brushRadius - 1);
      render();
      return;
    }
  });

  if (right){
    right.addEventListener("scroll", () => {
      renderMini();
    });
  }

    c.addEventListener("wheel", (e)=>{
    if (!right) return;
    e.preventDefault();
    wheelActive = true;
    wheelLock = true;
    painting = false;
    clearTimeout(wheelActive._t);
    wheelActive._t = setTimeout(()=>{ wheelActive = false; }, 120);
    clearTimeout(wheelLock._t);
    wheelLock._t = setTimeout(()=>{ wheelLock = false; }, 200);

    const delta = Math.sign(e.deltaY);
    const factor = (delta > 0) ? 0.90 : 1.10;
    const old = view.zoom;
    const next = Math.min(view.max, Math.max(view.min, old * factor));
    if (Math.abs(next - old) < 1e-4) return;

    const cx = (right.scrollLeft + right.clientWidth * 0.5) / old;
    const cy = (right.scrollTop + right.clientHeight * 0.5) / old;

    view.zoom = next;
    setCanvasSize();

    const maxX = Math.max(0, c.width - right.clientWidth);
    const maxY = Math.max(0, c.height - right.clientHeight);
    let nx = cx * next - right.clientWidth * 0.5;
    let ny = cy * next - right.clientHeight * 0.5;
    if (nx < 0) nx = 0; else if (nx > maxX) nx = maxX;
    if (ny < 0) ny = 0; else if (ny > maxY) ny = maxY;
    right.scrollLeft = nx;
    right.scrollTop = ny;

    dirty = true;
    render();
  }, { passive: false });

  initTexFromTerrain();
  setCanvasSize();
  render();
});







