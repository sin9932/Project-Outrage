window.addEventListener("DOMContentLoaded", () => {
  const c = document.getElementById("c");
  if (!c) { console.error("editor: canvas not found"); return; }
  const ctx = c.getContext("2d");
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
  let selecting = false;
  let selStart = null;
  let selEnd = null;
  let selection = null;
  let hoverTile = null;
  let clipboard = null;

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
    render();
  }

  function ensurePattern(path){
    if (!path) return null;
    if (!texImgs[path]){
      const img = new Image();
      img.onload = () => { texPats[path] = null; render(); };
      img.src = path;
      texImgs[path] = img;
    }
    const img = texImgs[path];
    if (img && img.complete && !texPats[path]){
      texPats[path] = ctx.createPattern(img, "repeat");
    }
    return texPats[path] || null;
  }

  function textureForTile(tx, ty){
    const tId = tex[idx(tx,ty)];
    const path = texPaths[tId];
    return ensurePattern(path);
  }

  function roadForTile(tx, ty){
    const rId = roads[idx(tx,ty)];
    const path = roadPaths[rId];
    return ensurePattern(path);
  }

  function origin(){
    const midx = (W - 1) * 0.5;
    const midy = (H - 1) * 0.5;
    const ox = (c.width * 0.5) - ((midx - midy) * ISO_X);
    const oy = (c.height * 0.5) - ((midx + midy) * ISO_Y);
    return { ox, oy };
  }

  function tileCenterScreen(tx, ty, ox, oy){
    return {
      x: (tx - ty) * ISO_X + ox,
      y: (tx + ty) * ISO_Y + oy
    };
  }

  function pointInDiamond(px, py, cx, cy){
    const dx = Math.abs(px - cx);
    const dy = Math.abs(py - cy);
    return (dx / ISO_X + dy / ISO_Y) <= 1;
  }

  function screenToTile(px, py){
    const { ox, oy } = origin();
    const lx = px - ox;
    const ly = py - oy;
    const fx = (lx / ISO_X + ly / ISO_Y) * 0.5;
    const fy = (ly / ISO_Y - lx / ISO_X) * 0.5;
    const tx0 = Math.floor(fx);
    const ty0 = Math.floor(fy);
    let best = null;
    for (let dy=-1; dy<=1; dy++){
      for (let dx=-1; dx<=1; dx++){
        const tx = tx0 + dx;
        const ty = ty0 + dy;
        if (tx<0 || ty<0 || tx>=W || ty>=H) continue;
        const c0 = tileCenterScreen(tx, ty, ox, oy);
        if (pointInDiamond(px, py, c0.x, c0.y)) return { tx, ty };
        const dd = (px - c0.x) * (px - c0.x) + (py - c0.y) * (py - c0.y);
        if (!best || dd < best.dd) best = { tx, ty, dd };
      }
    }
    return best ? { tx: best.tx, ty: best.ty } : null;
  }

  function drawDiamond(cx, cy, fillStyle){
    ctx.beginPath();
    ctx.moveTo(cx, cy - ISO_Y);
    ctx.lineTo(cx + ISO_X, cy);
    ctx.lineTo(cx, cy + ISO_Y);
    ctx.lineTo(cx - ISO_X, cy);
    ctx.closePath();
    ctx.fillStyle = fillStyle;
    ctx.fill();
  }

  function render(){
    ctx.clearRect(0,0,c.width,c.height);
    const { ox, oy } = origin();

    for (let y=0; y<H; y++){
      for (let x=0; x<W; x++){
        const i = idx(x,y);
        const t = terrain[i];
        const c0 = tileCenterScreen(x, y, ox, oy);
        const basePat = textureForTile(x, y);
        const fill = basePat || (colors[t] || "#000");
        drawDiamond(c0.x, c0.y, fill);

        if (t === 2){
          ctx.save();
          ctx.globalAlpha = 0.35;
          drawDiamond(c0.x, c0.y, colors[2]);
          ctx.restore();
        }

        const roadPat = roadForTile(x, y);
        if (roadPat){
          ctx.save();
          ctx.globalAlpha = 0.95;
          drawDiamond(c0.x, c0.y, roadPat);
          ctx.restore();
        }

        ctx.strokeStyle = "rgba(255,255,255,0.10)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(c0.x, c0.y - ISO_Y);
        ctx.lineTo(c0.x + ISO_X, c0.y);
        ctx.lineTo(c0.x, c0.y + ISO_Y);
        ctx.lineTo(c0.x - ISO_X, c0.y);
        ctx.closePath();
        ctx.stroke();
      }
    }

    if (selection){
      ctx.save();
      ctx.strokeStyle = "rgba(255,215,0,0.9)";
      ctx.lineWidth = 2;
      for (let y=selection.y; y<selection.y+selection.h; y++){
        for (let x=selection.x; x<selection.x+selection.w; x++){
          const c0 = tileCenterScreen(x, y, ox, oy);
          ctx.beginPath();
          ctx.moveTo(c0.x, c0.y - ISO_Y);
          ctx.lineTo(c0.x + ISO_X, c0.y);
          ctx.lineTo(c0.x, c0.y + ISO_Y);
          ctx.lineTo(c0.x - ISO_X, c0.y);
          ctx.closePath();
          ctx.stroke();
        }
      }
      ctx.restore();
    }
  }

  function paintAt(px, py){
    const hit = screenToTile(px, py);
    if (!hit) return false;
    const { tx, ty } = hit;
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
    if (e.shiftKey){
      selecting = true;
      selStart = screenToTile(px, py);
      selEnd = selStart;
      selection = normalizeSelection();
      render();
      return;
    }

    painting = true;
    c.setPointerCapture(e.pointerId);
    pushUndo();
    if (paintAt(px, py)) render();
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
    hoverTile = screenToTile(px, py);

    if (selecting){
      selEnd = hoverTile;
      selection = normalizeSelection();
      render();
      return;
    }
    if (!painting) return;
    if (paintAt(px, py)) render();
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
  });

  initTexFromTerrain();
  render();
});
