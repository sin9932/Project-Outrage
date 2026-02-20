(() => {
  const c = document.getElementById("c");
  const ctx = c.getContext("2d");
  const mapWEl = document.getElementById("mapW");
  const mapHEl = document.getElementById("mapH");
  const btnResize = document.getElementById("btnResize");
  const fileEl = document.getElementById("file");
  const btnExport = document.getElementById("btnExport");
  const brushBtns = Array.from(document.querySelectorAll("[data-brush]"));

  const qs = new URLSearchParams(location.search);
  let W = Math.max(4, parseInt(qs.get("mapw") || mapWEl.value, 10));
  let H = Math.max(4, parseInt(qs.get("maph") || mapHEl.value, 10));

  mapWEl.value = W;
  mapHEl.value = H;

  let terrain = new Uint8Array(W * H);

  const colors = {
    0: "#0f1522", // ground
    1: "#3a3f4b", // rock
    2: "#caa23a", // ore
    3: "#0f2a44"  // water
  };

  let brush = 0;
  let painting = false;

  function idx(x,y){ return y*W + x; }

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
    render();
  }

  function render(){
    const tile = Math.floor(Math.min(c.width / W, c.height / H));
    ctx.clearRect(0,0,c.width,c.height);
    for (let y=0; y<H; y++){
      for (let x=0; x<W; x++){
        ctx.fillStyle = colors[terrain[idx(x,y)]] || "#000";
        ctx.fillRect(x*tile, y*tile, tile, tile);
      }
    }
    // grid
    ctx.strokeStyle = "rgba(255,255,255,0.08)";
    for (let x=0; x<=W; x++){
      ctx.beginPath(); ctx.moveTo(x*tile,0); ctx.lineTo(x*tile,H*tile); ctx.stroke();
    }
    for (let y=0; y<=H; y++){
      ctx.beginPath(); ctx.moveTo(0,y*tile); ctx.lineTo(W*tile,y*tile); ctx.stroke();
    }
  }

  function paintAt(px, py){
    const tile = Math.floor(Math.min(c.width / W, c.height / H));
    const x = Math.floor(px / tile);
    const y = Math.floor(py / tile);
    if (x<0||y<0||x>=W||y>=H) return;
    terrain[idx(x,y)] = brush;
    render();
  }

  c.addEventListener("mousedown", (e)=>{
    painting = true;
    const r = c.getBoundingClientRect();
    paintAt(e.clientX - r.left, e.clientY - r.top);
  });
  window.addEventListener("mouseup", ()=> painting=false);
  c.addEventListener("mousemove", (e)=>{
    if (!painting) return;
    const r = c.getBoundingClientRect();
    paintAt(e.clientX - r.left, e.clientY - r.top);
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
    render();
  });

  render();
})();
