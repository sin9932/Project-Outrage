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

  const colors = {
    0: "#0f1522", // ground fallback
    1: "#3a3f4b", // rock fallback
    2: "#caa23a", // ore overlay
    3: "#0f2a44"  // water fallback
  };

  const texSets = {
    0: ["asset/sprite/map/grass1.jpg"],
    1: [
      "asset/sprite/map/sand1.jpg",
      "asset/sprite/map/breek_tile1.jpg",
      "asset/sprite/map/breek_tile2.jpg",
      "asset/sprite/map/road1.jpg",
      "asset/sprite/map/road2.jpg",
      "asset/sprite/map/road3.jpg",
      "asset/sprite/map/road4.jpg",
      "asset/sprite/map/road5.jpg",
      "asset/sprite/map/road6.JPG",
      "asset/sprite/map/road7.jpg",
      "asset/sprite/map/road8.jpg",
      "asset/sprite/map/road9.jpg",
      "asset/sprite/map/road10.jpg",
      "asset/sprite/map/road11.jpg",
      "asset/sprite/map/road12.jpg",
      "asset/sprite/map/road13.jpg",
      "asset/sprite/map/road14.jpg",
      "asset/sprite/map/road15.jpg",
      "asset/sprite/map/road16.jpg"
    ],
    2: [
      "asset/sprite/map/sand1.jpg",
      "asset/sprite/map/breek_tile1.jpg",
      "asset/sprite/map/breek_tile2.jpg"
    ],
    3: ["asset/sprite/map/water.jpg", "asset/sprite/map/water2.jpg"]
  };
  const texImgs = {};
  const texPats = {};

  let brush = 0;
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

  function cloneTerrain(){
    return new Uint8Array(terrain);
  }

  function pushUndo(){
    undoStack.push(cloneTerrain());
    if (undoStack.length > MAX_UNDO) undoStack.shift();
    redoStack.length = 0;
  }

  function undo(){
    if (!undoStack.length) return;
    redoStack.push(cloneTerrain());
    terrain = undoStack.pop();
    render();
  }

  function redo(){
    if (!redoStack.length) return;
    undoStack.push(cloneTerrain());
    terrain = redoStack.pop();
    render();
  }

  function resizeMap(nw, nh){
    const n = new Uint8Array(nw*nh);
    const minW = Math.min(W, nw);
    const minH = Math.min(H, nh);
    for (let y=0; y<minH; y++){
      for (let x=0; x<minW; x++){
        n[y*nw + x] = terrain[idx(x,y)];
      }
    }
    W = nw; H = nh; terrain = n;
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

  function chooseTexture(type, tx, ty){
    const list = texSets[type] || [];
    if (!list.length) return null;
    const h = ((tx * 73856093) ^ (ty * 19349663)) >>> 0;
    const path = list[h % list.length];
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
        const t = terrain[idx(x,y)];
        const c0 = tileCenterScreen(x, y, ox, oy);
        const pat = chooseTexture(t, x, y);
        const fill = pat || (colors[t] || "#000");
        drawDiamond(c0.x, c0.y, fill);

        if (t === 2){
          ctx.save();
          ctx.globalAlpha = 0.35;
          drawDiamond(c0.x, c0.y, colors[2]);
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
    if (terrain[i] === brush) return false;
    terrain[i] = brush;
    return true;
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
    for (let y=0; y<selection.h; y++){
      for (let x=0; x<selection.w; x++){
        data[y*selection.w + x] = terrain[idx(selection.x + x, selection.y + y)];
      }
    }
    clipboard = { w: selection.w, h: selection.h, data };
  }

  function pasteClipboard(){
    if (!clipboard || !hoverTile) return;
    pushUndo();
    for (let y=0; y<clipboard.h; y++){
      for (let x=0; x<clipboard.w; x++){
        const tx = hoverTile.tx + x;
        const ty = hoverTile.ty + y;
        if (tx<0 || ty<0 || tx>=W || ty>=H) continue;
        terrain[idx(tx,ty)] = clipboard.data[y*clipboard.w + x];
      }
    }
    render();
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
      brush = parseInt(btn.dataset.brush,10);
    });
  });

  btnResize.addEventListener("click", ()=>{
    const nw = Math.max(4, parseInt(mapWEl.value,10));
    const nh = Math.max(4, parseInt(mapHEl.value,10));
    resizeMap(nw, nh);
  });

  btnExport.addEventListener("click", ()=>{
    const data = { w: W, h: H, terrain: Array.from(terrain) };
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
    mapWEl.value = W; mapHEl.value = H;
    selection = null;
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

  render();
});
