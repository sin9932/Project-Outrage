;(function(){
  // Debug/validation mode: add ?debug=1 to URL
  const DEV_VALIDATE = /(?:\?|&)debug=1(?:&|$)/.test(location.search);
  const DEV_VALIDATE_THROW = false; // if true, throws on first invariant failure

  function _assert(cond, msg){
    if (cond) return;
    console.error("[ASSERT]", msg);
    if (DEV_VALIDATE_THROW) throw new Error(msg);
  }


;(() => {
  window.addEventListener("error", (e) => {
    document.body.innerHTML =
      `<pre style="white-space:pre-wrap;padding:16px;color:#fff;background:#000;">
JS ERROR:
${e.message}
${e.filename}:${e.lineno}:${e.colno}
</pre>`;
  });

  const canvas = document.getElementById("c");
  const ctx = canvas.getContext("2d");
  const mmCanvas = document.getElementById("mmc");
  const mmCtx = mmCanvas.getContext("2d");
  const $ = (id) => document.getElementById(id);

  const uiMoney = $("money");
  const uiPower = $("power");
  const uiFps = $("fps");
  const uiBuildMode = $("buildMode");
  const uiSelCount = $("selCount");
  const uiSelInfo = $("selInfo");
  const uiToast = $("toast");

  function toast(text, dur=1.0){
    if (!uiToast) return;
    uiToast.textContent = text;
    uiToast.style.display = "block";
    uiToast.style.opacity = "1";
    clearTimeout(toast._t);
    toast._t = setTimeout(()=>{
      uiToast.style.opacity="0";
      setTimeout(()=>{ uiToast.style.display="none"; }, 140);
    }, Math.max(250, dur*1000));
  }

  const uiRadarStat = $("radarStat");
  const uiMmHint = $("mmHint");
  const uiPowerFill = $("powerFill");
  const uiPowerNeed = $("powerNeed");
  const uiPTip = $("pTip");
  const powerBarEl = $("powerBar");
  if (powerBarEl && uiPTip){
    const showTip = (e)=>{
      const prod = state.player.powerProd|0;
      const use  = state.player.powerUse|0;
      uiPTip.textContent = `전력: ${prod} / ${use}`;
      uiPTip.style.display = "block";
      uiPTip.style.left = (e.clientX + 14) + "px";
      uiPTip.style.top  = (e.clientY + 12) + "px";
    };
    powerBarEl.addEventListener("mouseenter", showTip);
    powerBarEl.addEventListener("mousemove", showTip);
    powerBarEl.addEventListener("mouseleave", ()=>{ uiPTip.style.display="none"; });
  }

  const qFillMain = $("qFillMain");
  const qFillDef  = $("qFillDef");
  const qFillInf  = $("qFillInf");
  const qFillVeh  = $("qFillVeh");
  const qTxtMain = $("qTxtMain");
  const qTxtDef  = $("qTxtDef");
  const qTxtInf  = $("qTxtInf");
  const qTxtVeh  = $("qTxtVeh");

  const btnRef = $("bRef");
  const btnPow = $("bPow");
  const btnBar = $("bBar");
  const btnFac = $("bFac");
  const btnTur = $("bTur");
  const btnRad = $("bRad");
  const btnCan = $("bCan");
  const btnToHQ = $("toHQ");
  const btnSell = $("sell");

  const btnInf = $("pInf");
  const btnEng = $("pEng");
  const btnSnp = $("pSnp");
  const btnTnk = $("pTnk");
  const btnHar = $("pHar");
  const btnIFV = $("pIFV");
  const btnRepair = $("repair");
  const btnStop = $("stop");
  const btnScatter = $("scatter");
  const btnCancelSel = $("cancelSel");
  const btnSelAllKind = $("selAllKind");
  const btnRepair2 = $("repair2");
  const btnStop2 = $("stop2");
  const btnScatter2 = $("scatter2");

  // v53: normalize production buttons so badges don't duplicate/overwrite labels
  function normalizeProdButton(btn, label, kind){
    if (!btn) return;
    btn.innerHTML = `<span class="lbl">${label}</span><span class="badge" style="display:none"></span>`;
    btn.dataset.kind = kind;
  }
  normalizeProdButton(btnInf, "보병", "infantry");
  normalizeProdButton(btnEng, "엔지니어", "engineer");
  normalizeProdButton(btnSnp, "저격병", "sniper");
  normalizeProdButton(btnTnk, "경전차", "tank");
  normalizeProdButton(btnHar, "굴착기", "harvester");
  normalizeProdButton(btnIFV, "IFV", "ifv");

  const pregame = $("pregame");
  const startBtn = $("startBtn");
  const pColorInput = $("pColor");
  const eColorInput = $("eColor");
  const fogOffChk = $("fogOff");
  const fastProdChk = $("fastProd");

  let spawnChoice = "left";
  for (const chip of document.querySelectorAll(".chip.spawn")) {
    chip.addEventListener("click", () => {
      for (const c of document.querySelectorAll(".chip.spawn")) c.classList.remove("on");
      chip.classList.add("on");
      spawnChoice = chip.dataset.spawn;
    });
  }

  let startMoney = 10000;
  for (const chip of document.querySelectorAll(".chip.money")) {
    chip.addEventListener("click", () => {
      for (const c of document.querySelectorAll(".chip.money")) c.classList.remove("on");
      chip.classList.add("on");
      startMoney = parseInt(chip.dataset.money, 10) || 10000;
    });
  }

  // shared start money used by reset/start
  let START_MONEY = 10000;

  let DPR = 1;
  function fitCanvas() {
    const rect = canvas.getBoundingClientRect();
    DPR = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    const w = Math.max(1, Math.floor(rect.width * DPR));
    const h = Math.max(1, Math.floor(rect.height * DPR));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
  }
  window.addEventListener("resize", fitCanvas);
  fitCanvas();

  
  // ===== Player attack alerts (toast + minimap triangle + SPACE camera) =====
  // NOTE: initialized after `state` is created (see below)

  function ensureAttackState(){
    if (!state) return;
    if (!state.attackAlert) state.attackAlert = { cooldownUntil:-1e9, windowUntil:-1e9, nextEmit:-1e9 };
    if (!state.attackEvents) state.attackEvents = [];
    if (state.attackCycle==null) state.attackCycle = 0;
    if (!state.alertFx) state.alertFx = [];
  }

  function startNewAttackEvent(x,y,type){
    ensureAttackState();
    state.attackEvents.unshift({t:state.t, x, y, type, until: state.t + 4.0});
    if (state.attackEvents.length>2) state.attackEvents.length=2;
    state.attackCycle = 0;
  }
  function updateLatestAttackEvent(x,y,type){
    ensureAttackState();
    if (!state.attackEvents.length){ startNewAttackEvent(x,y,type); return; }
    state.attackEvents[0].t = state.t;
    state.attackEvents[0].x = x;
    state.attackEvents[0].y = y;
    state.attackEvents[0].type = type;
    state.attackEvents[0].until = state.t + 4.0;
  }
  function spawnMiniAlertFx(x,y){
    ensureAttackState();
    state.alertFx.push({x,y,t0:state.t});
  }
  function notifyPlayerAttacked(target){
    ensureAttackState();
    const now = state.t;
    const type = (target.kind==="harvester") ? "harvester" : "base";
    const A = state.attackAlert || (state.attackAlert={cooldownUntil:-1e9, windowUntil:-1e9, nextEmit:-1e9});

    // Collect events continuously (max 2). If last event is older than 4s, push a new slot; otherwise refresh the latest.
    if (!state.attackEvents || !state.attackEvents.length){
      startNewAttackEvent(target.x, target.y, type);
    } else {
      const last = state.attackEvents[0];
      if (now - (last.t||-1e9) >= 4.0){
        startNewAttackEvent(target.x, target.y, type);
      } else {
        updateLatestAttackEvent(target.x, target.y, type);
      }
    }

    // Refresh blink window for the latest event (always 4 seconds from last hit)
    if (state.attackEvents && state.attackEvents.length){
      state.attackEvents[0].until = now + 4.0;
    }

    // Throttle toast + minimap big square FX to once per 4 seconds.
    // Even while throttled, we still keep collecting/updating events above.
    if (now >= A.nextEmit){
      A.nextEmit = now + 4.0;
      toast(type==="harvester" ? "광물굴착기가 공격 당합니다!" : "아군기지가 공격 당합니다!");
      spawnMiniAlertFx(target.x, target.y);
    }
  }

  function goToLastHit(){
    ensureAttackState();
    const evs = state.attackEvents || [];
    if (!evs.length){
      toast("최근 공격 이벤트 없음", 1.0);
      return;
    }
    const n = Math.min(2, evs.length);
    const i = (state.attackCycle||0) % n;
    const ev = evs[i];
    centerCameraOn(ev.x, ev.y);
    toast("최근 피격 지점으로 이동", 0.8);
    state.attackCycle = (i+1) % n;
  }

function fitMini() {
    const rect = mmCanvas.getBoundingClientRect();
    const w = Math.max(1, Math.floor(rect.width * DPR));
    const h = Math.max(1, Math.floor(rect.height * DPR));
    if (mmCanvas.width !== w || mmCanvas.height !== h) {
      mmCanvas.width = w;
      mmCanvas.height = h;
    }
  }
  window.addEventListener("resize", fitMini);
  fitMini();

  // TV noise for minimap when low power
  const mmNoise = document.createElement("canvas");
  const mmNoiseCtx = mmNoise.getContext("2d");
  let mmNoiseT = 0;
  function drawMinimapNoise(W,H){
    const s = 96; // small buffer, scaled up
    if (mmNoise.width!==s || mmNoise.height!==s){ mmNoise.width=s; mmNoise.height=s; }
    const img = mmNoiseCtx.getImageData(0,0,s,s);
    const d = img.data;
    // refresh every frame (cheap due to small buffer)
    for (let i=0; i<d.length; i+=4){
      const v = (Math.random()*255)|0;
      d[i]=v; d[i+1]=v; d[i+2]=v; d[i+3]=255;
    }
    mmNoiseCtx.putImageData(img,0,0);
    mmCtx.save();
    mmCtx.imageSmoothingEnabled = false;
    mmCtx.globalAlpha = 0.95;
    mmCtx.drawImage(mmNoise, 0,0, W,H);
    mmCtx.globalAlpha = 1;
    mmCtx.fillStyle="rgba(0,0,0,0.35)";
    mmCtx.fillRect(0,0,W,H);
    mmCtx.fillStyle="rgba(255,210,110,0.9)";
    mmCtx.font="bold 12px system-ui";
    mmCtx.fillText("LOW POWER", 10, 20);
    mmCtx.restore();
  }

  function getPointerCanvasPx(e) {
    const rect = canvas.getBoundingClientRect();
    // Use actual canvas-to-CSS scale to avoid selection/drag offset on different DPR/zoom.
    const sx = canvas.width / Math.max(1, rect.width);
    const sy = canvas.height / Math.max(1, rect.height);
    return { x: (e.clientX - rect.left) * sx, y: (e.clientY - rect.top) * sy };
  }

  const TILE = 110;
  const GAME_SPEED = 1.30;
  const BUILD_PROD_MULT = 1.30; // additional +30% for building & unit production speed
  // Enemy AI cheats (difficulty)
  const ENEMY_PROD_SPEED = 1.65;
  const ENEMY_ECON_MULT  = 1.50;
  const MAP_W = 64;
  const MAP_H = 40;
  const WORLD_W = MAP_W * TILE;
  const WORLD_H = MAP_H * TILE;

  const ISO_X = TILE / 2;
  const ISO_Y = TILE / 4;

  // Tile/world helpers (isometric diamond tile center coordinates)
  function tileToWorldCenter(tx, ty){ return { x:(tx+0.5)*TILE, y:(ty+0.5)*TILE }; }
  function tileToWorldOrigin(tx, ty){ return { x:tx*TILE, y:ty*TILE }; }
  function snapWorldToTileCenter(wx, wy){
    // Snap to the NEAREST tile center (rounding), not the tile corner (floor).
    const tx = clamp(Math.floor(wx / TILE), 0, MAP_W-1);
    const ty = clamp(Math.floor(wy / TILE), 0, MAP_H-1);
    const p = tileToWorldCenter(tx, ty);
    return { tx, ty, x:p.x, y:p.y };
  }

  const TEAM = { PLAYER: 0, ENEMY: 1, NEUTRAL: 2 };

  

  // === Team palette (accent recolor) ===
  // You can override from HTML by defining:
  //   window.TEAM_ACCENT = { PLAYER:[r,g,b], ENEMY:[r,g,b], NEUTRAL:[r,g,b] };
  const TEAM_ACCENT = (typeof window !== "undefined" && window.TEAM_ACCENT) ? window.TEAM_ACCENT : {
    PLAYER: [80,  180, 255],  // default: BLUE (player)
    ENEMY:  [255, 60,  60],   // default: RED  (enemy)
    NEUTRAL:[170, 170, 170]
  };

  function _teamAccentRGB(team){
    if (team === TEAM.ENEMY) return TEAM_ACCENT.ENEMY;
    if (team === TEAM.NEUTRAL) return TEAM_ACCENT.NEUTRAL;
    return TEAM_ACCENT.PLAYER;
  }
// Debug option: disable fog-of-war rendering & logic (show whole map)
  let fogEnabled = true;
  const clamp = (v,a,b)=>Math.max(a,Math.min(b,v));
  const dist2 = (ax,ay,bx,by)=>{ const dx=ax-bx, dy=ay-by; return dx*dx+dy*dy; };
  const rnd = (a,b)=> a + Math.random()*(b-a);


  // ===== ENEMY AGGRESSION / ANTI-CLUSTER HELPERS =====
  function enemyAttackTarget(){
    // Prefer player HQ if alive, else any player building, else any player unit.
    for (const b of buildings){
      if (b.alive && !b.civ && b.team===TEAM.PLAYER && b.kind==="hq") return {x:b.x, y:b.y};
    }

  // ===== ENGINEER BEHAVIOR FIX (v10) =====
  function pushEngineerOut(u){
    if (!u || !u.alive || u.kind!=="engineer" || u.team!==TEAM.ENEMY) return;
    // If hanging near own barracks/HQ, force it to rally so it doesn't block exits.
    const nearProd = buildings.some(b=>b.alive && !b.civ && b.team===TEAM.ENEMY && (b.kind==="barracks"||b.kind==="hq") && dist2(u.x,u.y,b.x,b.y) < (420*420));
    const noProd = (u._noProdUntil && state.t < u._noProdUntil);
    if (nearProd || noProd){
      const rx = ai.rally.x + rnd(-TILE*2.4, TILE*2.4);
      const ry = ai.rally.y + rnd(-TILE*2.4, TILE*2.4);
      u.order = {type:"move", x:rx, y:ry, tx:null, ty:null};
      setPathTo(u, rx, ry);
      u.repathCd = 0.06;
      u._noProdUntil = state.t + 7.0;
    }
  }
    for (const b of buildings){
      if (b.alive && !b.civ && b.team===TEAM.PLAYER) return {x:b.x, y:b.y};
    }
    for (const u of units){
      if (u.alive && u.team===TEAM.ENEMY && u.kind==="engineer") pushEngineerOut(u);
      if (u.alive && u.team===TEAM.PLAYER) return {x:u.x, y:u.y};
    }
    return {x:WORLD_W*0.5, y:WORLD_H*0.5};
  }

  function enemyRallyPoint(){
    const t = enemyAttackTarget();
    const ox = rnd(-TILE*1.6, TILE*1.6);
    const oy = rnd(-TILE*1.6, TILE*1.6);
    return {x: clamp(t.x+ox, 0, WORLD_W), y: clamp(t.y+oy, 0, WORLD_H)};
  }

  function enemyUnstuck(u, dt){
    // track movement
    if (u._stuckT==null){ u._stuckT=0; u._lx=u.x; u._ly=u.y; }
    const moved = dist2(u.x,u.y,u._lx,u._ly);
    if (moved < 6*6) u._stuckT += dt;
    else { u._stuckT = 0; u._lx=u.x; u._ly=u.y; }
    // If stuck for >1.6s, reissue attackmove with a fresh offset
    if (u._stuckT > 1.6){
      const p = enemyRallyPoint();
      u.order = {type:"attackmove", x:p.x, y:p.y, tx:null, ty:null};
      u.path = null; u.pathI = 0;
      u.repathCd = 0.01;
      u._stuckT = 0;
    }
  }


  function worldToIso(wx, wy) { return { x: (wx - wy) * (ISO_X / TILE), y: (wx + wy) * (ISO_Y / TILE) }; }
  function isoToWorld(ix, iy) {
    const a = ix * (TILE / ISO_X);
    const b = iy * (TILE / ISO_Y);
    return { x: (a + b) / 2, y: (b - a) / 2 };
  }
  function getBaseOffset() { return { x: canvas.width * 0.5, y: canvas.height * 0.22 }; }

  const cam = { x: WORLD_W*0.5, y: WORLD_H*0.5, speed: 900, zoom: 1.0 };

  const isoCorners = [
    worldToIso(0,0), worldToIso(WORLD_W,0), worldToIso(0,WORLD_H), worldToIso(WORLD_W,WORLD_H),
  ];
  const isoMinX = Math.min(...isoCorners.map(p=>p.x));
  const isoMaxX = Math.max(...isoCorners.map(p=>p.x));
  const isoMinY = Math.min(...isoCorners.map(p=>p.y));
  const isoMaxY = Math.max(...isoCorners.map(p=>p.y));

  function clampCamera() {
    const base = getBaseOffset();
    const camIso = worldToIso(cam.x, cam.y);
    const margin = 220;

    const minCamIsoX = isoMinX - base.x - margin;
    const maxCamIsoX = isoMaxX - base.x + margin;
    const minCamIsoY = isoMinY - base.y - margin;
    const maxCamIsoY = isoMaxY - base.y + margin;

    camIso.x = clamp(camIso.x, minCamIsoX, maxCamIsoX);
    camIso.y = clamp(camIso.y, minCamIsoY, maxCamIsoY);

    const w = isoToWorld(camIso.x, camIso.y);
    cam.x = w.x; cam.y = w.y;
  }

  function worldToScreen(wx, wy) {
    const base = getBaseOffset();
    const iso = worldToIso(wx, wy);
    const camIso = worldToIso(cam.x, cam.y);
    return { x: (iso.x - camIso.x)*cam.zoom + base.x + (camShake.active?camShake.ox:0), y: (iso.y - camIso.y)*cam.zoom + base.y + (camShake.active?camShake.oy:0) };
  }
  function screenToWorld(px, py) {
    const base = getBaseOffset();
    const camIso = worldToIso(cam.x, cam.y);
    const isoX = (px - base.x)/cam.zoom + camIso.x;
    const isoY = (py - base.y)/cam.zoom + camIso.y;
    return isoToWorld(isoX, isoY);
  }
  function centerCameraOn(wx, wy) {
    const base = getBaseOffset();
    const iso = worldToIso(wx, wy);
    const cx = canvas.width*0.5, cy = canvas.height*0.5;
    const camIsoX = iso.x + base.x - cx;
    const camIsoY = iso.y + base.y - cy;
    const w = isoToWorld(camIsoX, camIsoY);
    cam.x = w.x; cam.y = w.y;
    clampCamera();
  }

  

  let running = false;
  let gameOver = false;

  // NOTE: use `var` to avoid Temporal Dead Zone issues if any code path
  // references `state` before this declaration finishes initializing.
  var state = {
    t: 0,
    suppressClickUntil: 0,
    debug: { fastProd: false },
    player: { money: 10000, powerProd: 0, powerUse: 0 },
    enemy:  { money: 10000, powerProd: 0, powerUse: 0 },
    build:{ active:false, kind:null, lane:null },
    buildLane:{ main:{queue:null,ready:null,fifo:[]}, def:{queue:null,ready:null,fifo:[]} },
    primary:{ player:{ barracks:null, factory:null }, enemy:{ barracks:null, factory:null } },
    lastClick:{ t:0, id:null },
    selection: new Set(),
    hover: { px:0, py:0, wx:0, wy:0, entId:null, t0:0 },
    drag: { on:false, moved:false, x0:0, y0:0, x1:0, y1:0 },
    pan:  { on:false, x0:0, y0:0, camIsoX:0, camIsoY:0 },
    colors: { player:"#0000ff", enemy:"#ff0000" },
    fx: { paths: [], clicks: [], orders: [] },
    lastSingleId: null,
    lastSingleKind: null,
    lastHit: { t: -1e9, x: 0, y: 0 },
    mouseMode: "normal" // normal | repair | sell
  };
  // init attack alert containers (safe, after state exists)
  state.attackAlert = { cooldownUntil:-1e9, windowUntil:-1e9 };
  state.attackEvents = [];
  state.attackCycle = 0;
  state.alertFx = [];


  const controlGroups = Array.from({length:10}, ()=>[]);

  const terrain = new Uint8Array(MAP_W*MAP_H); // 0 ground, 1 rock, 2 ore
  const ore = new Uint16Array(MAP_W*MAP_H);
  const buildOcc = new Uint8Array(MAP_W*MAP_H); // 1=blocked
  const idx = (tx,ty)=> ty*MAP_W + tx;
  const inMap = (tx,ty)=> tx>=0 && ty>=0 && tx<MAP_W && ty<MAP_H;

  const tileOfX = (x)=> clamp(Math.floor(x/TILE), 0, MAP_W-1);
  const tileOfY = (y)=> clamp(Math.floor(y/TILE), 0, MAP_H-1);


  function genMap() {
    terrain.fill(0);
    for (let i=0;i<520;i++){
      const tx=(Math.random()*MAP_W)|0, ty=(Math.random()*MAP_H)|0;
      terrain[idx(tx,ty)] = 1;
    }
    const patches = [
      {x: 16, y: 12, r:8},
      {x: 42, y: 25, r:11},
      {x: 28, y: 30, r:7},
      {x: 50, y: 10, r:8},
    ];
    for (const p of patches){
      for (let y=-p.r;y<=p.r;y++){
        for (let x=-p.r;x<=p.r;x++){
          const tx=p.x+x, ty=p.y+y;
          if (!inMap(tx,ty)) continue;
          if (x*x+y*y <= p.r*p.r) terrain[idx(tx,ty)] = 2;
        }
      }
    }
  }
  genMap();

  ore.fill(0);
  for (let ty=0; ty<MAP_H; ty++){
    for (let tx=0; tx<MAP_W; tx++){
      if (terrain[idx(tx,ty)] === 2) ore[idx(tx,ty)] = 300 + ((Math.random()*220)|0);
    }
  }

  const explored = [new Uint8Array(MAP_W*MAP_H), new Uint8Array(MAP_W*MAP_H)];
  const visible  = [new Uint8Array(MAP_W*MAP_H), new Uint8Array(MAP_W*MAP_H)];

  let nextId=1;
  const units=[];
  const buildings=[];
  const bullets=[];
  const traces=[];
  const impacts=[]; // MG bullet impact sparks
  const fires=[]; // building fire particles (low HP)
  const explosions=[]; // building destruction explosions

  const healMarks=[]; // red-cross marks for repairs
  const flashes=[]; // muzzle flashes
  const casings=[]; // MG shell casings
  const repairWrenches=[]; // building repair wrench FX
  const infDeathFxs=[]; // infantry death animation FX


const snipDeathFxs=[]; // sniper death animation FX (3x3 = 9 frames)

function updateSnipDeathFx(){
  const dt=state.dt??1/60;

  const FRAME_DUR=0.06;
  const FRAMES=9;
  const HOLD_LAST=0.12;
  const FADE_DUR=0.22;

  // derive per-tile size from texture (expects 3x3 sheet, each 1200x1200)
  const cols=3;
  const tw=(SNIP_DIE_IMG.naturalWidth/cols)|0;
  const th=(SNIP_DIE_IMG.naturalHeight/cols)|0;

  for(let i=snipDeathFxs.length-1;i>=0;i--){
    const fx=snipDeathFxs[i];
    fx.t=(fx.t??0)+dt;

    const playT=FRAMES*FRAME_DUR;
    const holdEnd=playT+HOLD_LAST;
    const fadeEnd=holdEnd+FADE_DUR;

    let fi=0, alpha=1;
    if(fx.t<playT){
      fi=Math.min(FRAMES-1, (fx.t/FRAME_DUR)|0);
      alpha=1;
    }else if(fx.t<holdEnd){
      fi=FRAMES-1; alpha=1;
    }else if(fx.t<fadeEnd){
      fi=FRAMES-1; alpha=1-((fx.t-holdEnd)/FADE_DUR);
    }else{
      snipDeathFxs.splice(i,1);
      continue;
    }

    const sx=(fi%cols)*tw;
    const sy=((fi/cols)|0)*th;

    fx._rd = { sx, sy, sw: tw, sh: th, alpha, fi };
  }
}

function getSnipDieTeamSheet(teamId){
  const key=teamId;
  let c=SNIP_DIE_TEAM_SHEET.get(key);
  if(!c){
    // buildInfTeamSheet(srcImg, cacheMap, teamId)
    // Passing (srcImg, teamId) would make cacheMap a number and crash on .has()
    c=buildInfTeamSheet(SNIP_DIE_IMG, SNIP_DIE_TEAM_SHEET, teamId);
    SNIP_DIE_TEAM_SHEET.set(key,c);
  }
  return c;
}

function drawSnipDeathFxOne(fx){
  const z=cam.zoom;
  const p=worldToScreen(fx.x,fx.y);

  const rd=fx._rd;
  if(!rd || !rd.sw || !rd.sh) return;

  // same overall size as infantry death (both use 1200x1200 frames)
  const s = (INF_SPRITE_SCALE * 1.9) * z;

  const sheet=getSnipDieTeamSheet(fx.team);

  // centered, with the same slight "feet-bias" as infantry death
  const x = p.x - (rd.sw*s)/2;
  const y = (p.y - 18*z) - (rd.sh*s)/2;

  ctx.save();
  ctx.globalAlpha = rd.alpha;
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(sheet, rd.sx, rd.sy, rd.sw, rd.sh, x, y, rd.sw*s, rd.sh*s);
  ctx.restore();
}

  const COST = {
    power:600, refinery:2000, barracks:500, factory:2000, radar:1000, turret:500,
    infantry:100, engineer:875, sniper:600, tank:900, ifv:600,
    harvester:2450, hq:0
  };


  // ===== PRICE TOOLTIP (hover to see cost) =====
  const priceTip = document.createElement("div");
  priceTip.style.position = "fixed";
  priceTip.style.padding = "10px 14px";
  priceTip.style.borderRadius = "12px";
  priceTip.style.background = "rgba(0,0,0,0.86)";
  priceTip.style.color = "#ffe9a6";
  priceTip.style.fontSize = "18px";
  priceTip.style.fontWeight = "950";
  priceTip.style.pointerEvents = "none";
  priceTip.style.border = "1px solid rgba(255,233,166,0.35)";
  priceTip.style.boxShadow = "0 10px 30px rgba(0,0,0,0.45)";
  priceTip.style.zIndex = "9999";
  priceTip.style.display = "none";
  document.body.appendChild(priceTip);

  function bindPriceTip(btn, kind){
    if (!btn) return;
    btn.addEventListener("mouseenter", (e)=>{
      const cost = COST[kind] ?? 0;
      priceTip.textContent = `$ ${cost}`;
      priceTip.style.display = "block";
      priceTip.style.left = (e.clientX + 16) + "px";
      priceTip.style.top  = (e.clientY + 16) + "px";
    });
    btn.addEventListener("mousemove", (e)=>{
      priceTip.style.left = (e.clientX + 16) + "px";
      priceTip.style.top  = (e.clientY + 16) + "px";
    });
    btn.addEventListener("mouseleave", ()=>{
      priceTip.style.display = "none";
    });
  }


  // Sidebar-style build time (seconds). Simple deterministic rule: time scales with cost.
  // RA2/YR-style base build speed: "minutes to produce a 1000-credit item"
// See: BuildSpeed / Build time references.
const BUILD_SPEED_MIN_PER_1000 = 0.8; // rules(md).ini 기본값: 1000크레딧 생산에 걸리는 시간(분) (BuildSpeed)
const MULTIPLE_FACTORY = 0.8; // rules(md).ini MultipleFactory: 공장/막사 등 같은 생산시설 추가 시 빌드타임 누적 곱 (0.8^(n-1))

function getBaseBuildTime(kind){
  const c = COST[kind] || 0;
  // (cost/1000) * BuildSpeed * 60 seconds
  // keep a small floor so ultra-cheap items still have visible progress
  return clamp((c/1000) * BUILD_SPEED_MIN_PER_1000 * 60, 2.2, 90);
}

  if (DEV_VALIDATE){
    window.addEventListener("error", (ev)=>{
      try{
        console.error("[RUNTIME ERROR]", ev.error || ev.message);
      }catch(_){}
      running = false;
      toast("런타임 오류로 중지됨 (콘솔 확인)");
    });
    window.addEventListener("unhandledrejection", (ev)=>{
      try{
        console.error("[UNHANDLED REJECTION]", ev.reason);
      }catch(_){}
      running = false;
      toast("런타임 오류로 중지됨 (콘솔 확인)");
    });
  }



// RA2-ish multi-factory bonus: effective build time scales ~ 1 / (#producers).
// Example ref: community tables show ~13s at 1 factory for 1000-cost, ~6s at 2, ~4s at 3. (rounded)



  const POWER = {
    hqProd:20, powerPlant:150,
    refineryUse:50, barracksUse:10, factoryUse:25, radarUse:50, turretUse:25
  };

  const BUILD = {
    // height levels: 0 = flat, 1 = low, 2 = medium, 3 = tall
    hq:       { hLevel:3, tw:5, th:5, hp:3000, vision:640, provideR: 750 },
    power:    { hLevel:2, tw:2, th:2, hp:750,  vision:420, provideR: 600 },
    refinery: { hLevel:2, tw:3, th:4, hp:1000, vision:520, provideR: 650 },
    factory:  { hLevel:2, tw:3, th:4, hp:1000, vision:500, provideR: 650 },
    barracks: { hLevel:2, tw:2, th:3, hp:500,  vision:460, provideR: 600 },
    radar:    { hLevel:3, tw:2, th:2, hp:1000, vision:600, provideR: 650 },
    turret:   { hLevel:1, tw:1, th:1, hp:400,  vision:560, provideR: 0   },
    civ_oregen: { hLevel:0, tw:2, th:2, hp:999999, vision:0, provideR:0, attackable:false, selectable:false, hideUI:true }
  };

  // Defense tower table (range FX & combat stats)
  // NOTE: This is also used by the range-ellipse renderer, so future towers should be added here.
  const DEFENSE = {
    // basic machinegun turret
    turret: {
      range: 540,
      dmg: 22,
      dmgInf: 40,
      // base ROF before power factor scaling (tickTurrets uses rof/powerFactor)
      rofBase: 0.65,

      // range ellipse rendering
      ring: { alphaFill: 0.08, alphaStroke: 0.75, strokeW: 3.0 },

      // MG tracer rendering (thicker & brighter than infantry)
      fx: {
        blips: 4,          // number of on/off tracer blips per shot
        blipGap: 0.06,     // seconds between blips
        coreW: 6.0,
        glowW: 16.0,
        coreA: 0.98,
        glowA: 0.26,
        muzzleR: 42,
        muzzleA: 0.45,
        impactA: 0.55
      }
    },

    // future: add high-tier towers here, e.g.
    // prism: { range: 360, dmg: 90, rofBase: 1.6, ring:{...}, fx:{...} },
    // tesla: { range: 290, dmg: 60, rofBase: 1.1, ring:{...}, fx:{...} },
  };

  // === Unit specs (split to ./js/units.js) ===
  // If ./js/units.js is loaded, it provides window.G.Units.UNIT.
  const DEFAULT_UNIT = {
    infantry: { r:17, hp:125, speed:230, range:330, dmg:15, rof:0.55, vision:420, hitscan:true,  cls:"inf" },
    engineer: { r:17, hp:100, speed:272, range:0,   dmg:0,  rof:0,    vision:420, cls:"inf" },
    sniper:   { r:17, hp:125, speed:205, range:1200, dmg:125, rof:2.20, vision:1200, hitscan:true,  cls:"inf", cloak:false },
    tank:     { r:25, hp:400, speed:320, range:360, dmg:34, rof:0.90, vision:  680, hitscan:false, cls:"veh" },
    ifv:      { r:24, hp:200, speed:480, range:360, dmg:25, rof:0.85, vision: 520, hitscan:false, cls:"veh", transport:1 },
    harvester:{ r:28, hp:1000, speed:250, range:0,   dmg:0,  rof:0,    vision: 520, carryMax:1000, cls:"veh" }
  };

  const UNIT = (window.G && window.G.Units && window.G.Units.UNIT) ? window.G.Units.UNIT : DEFAULT_UNIT;

  const DEFAULT_NAME_KO = {
    hq:"건설소(HQ)", power:"발전소", refinery:"정제소", barracks:"막사",
    factory:"군수공장", radar:"레이더", turret:"터렛",
    infantry:"보병", engineer:"엔지니어", sniper:"저격병", tank:"경전차", ifv:"IFV", harvester:"굴착기"
  };

  const NAME_KO = (window.G && window.G.Units && window.G.Units.NAME_KO) ? window.G.Units.NAME_KO : DEFAULT_NAME_KO;


  // === Centralized assets (refactor) ===
  const ASSET = {
    music: {
      peace: ["asset/music/peace1.mp3","asset/music/peace2.mp3","asset/music/peace3.mp3","asset/music/peace4.mp3"],
      battle:["asset/music/battle1.mp3","asset/music/battle2.mp3","asset/music/battle3.mp3","asset/music/battle4.mp3","asset/music/battle5.mp3"],
      all:   [] // filled below
    },
    sprite: {
      const: { normal: { con_yard: "asset/sprite/const/normal/con_yard_n.png" } },
      unit: {
        inf: {
          idle:   "asset/sprite/unit/inf/inf_idle.png",
          atk:    "asset/sprite/unit/inf/inf_atk.png",
          die:    "asset/sprite/unit/inf/inf_die.png",
          wrench: "asset/sprite/unit/inf/repair_wrench.png",
          mov: {
            E:"asset/sprite/unit/inf/inf_mov.png",
            NE:"asset/sprite/unit/inf/inf_mov_ne.png",
            N:"asset/sprite/unit/inf/inf_mov_n.png",
            NW:"asset/sprite/unit/inf/inf_mov_nw.png",
            W:"asset/sprite/unit/inf/inf_mov_w.png",
            SW:"asset/sprite/unit/inf/inf_mov_sw.png",
            S:"asset/sprite/unit/inf/inf_mov_s.png",
            SE:"asset/sprite/unit/inf/inf_mov_se.png",
          }
        },
        snip: {
          idle: "asset/sprite/unit/inf/snip_idle.png",
          die:  "asset/sprite/unit/inf/snip_die.png",
          mov: {
            E:"asset/sprite/unit/inf/snip_mov.png",
            NE:"asset/sprite/unit/inf/snip_mov_ne.png",
            N:"asset/sprite/unit/inf/snip_mov_n.png",
            NW:"asset/sprite/unit/inf/snip_mov_nw.png",
            W:"asset/sprite/unit/inf/snip_mov_w.png",
            SW:"asset/sprite/unit/inf/snip_mov_sw.png",
            S:"asset/sprite/unit/inf/snip_mov_s.png",
            SE:"asset/sprite/unit/inf/snip_mov_se.png",
          }
        }
      },
      eff: {
        exp1: {
          png:  "asset/sprite/eff/exp1/exp1_anim.png",
          json: "asset/sprite/eff/exp1/exp1_anim.json",
        }
      }
    }
  };
  ASSET.music.all = ASSET.music.peace.concat(ASSET.music.battle);


  // === Infantry sprite (idle 8-dir) embedded ===
  const INF_IDLE_PNG = ASSET.sprite.unit.inf.idle;
  const INF_IMG = new Image();
  INF_IMG.src = INF_IDLE_PNG;

  // === Sniper idle sprite (8-dir) embedded ===
  const SNIP_IDLE_PNG = ASSET.sprite.unit.snip.idle;
  const SNIP_DIE_PNG = ASSET.sprite.unit.snip.die;
  const SNIP_IMG = new Image();
  SNIP_IMG.src = SNIP_IDLE_PNG;
  const SNIP_DIE_IMG = new Image();
  SNIP_DIE_IMG.src = SNIP_DIE_PNG;

  // === Construction Yard (HQ) sprite (5x5 footprint) ===
  // Source: asset/sprite/const/normal/con_yard_n.png
  // Measured (offline) from the PNG:
  //  - non-transparent bbox width ≈ 1536px
  //  - pivot is SOUTH corner center (bottom-most point) at x=1024, y=1381 (in original image px)
  const CON_YARD_IMG = new Image();
  CON_YARD_IMG.src = ASSET.sprite.const.normal.con_yard;

  const BUILD_SPRITE = {
    hq: {
      img: CON_YARD_IMG,
      // We draw ONLY the non-transparent bbox (crop), so all numbers below are bbox-relative.
      // Measured from con_yard_n.png:
      //  bbox: x=256, y=130, w=1536, h=1251
      //  south-tip pivot (full image): x≈1016.5, y=1380
      //  pivot in bbox-space: x≈760.5, y=1250
      crop:  { x: 256, y: 130, w: 1536, h: 1251 },
      pivot: null, // pivot is controlled via SPRITE_TUNE (see below)
      teamColor: true // apply team palette to accent pixels
    }
  };
  

  // === Sprite tuning knobs (YOU edit these) ===
  // pivotNudge is in SOURCE pixels (bbox-space, before scaling).
  // offsetNudge is in SCREEN pixels (after scaling, before zoom).
  // anchor: "center" to stick the sprite to the 5x5 footprint center (what you asked).
  const SPRITE_TUNE = {
    hq: {
      anchor: "center",
      scaleMul: 1.20,
      pivotNudge: { x: 0, y: 0 },
      offsetNudge:{ x: 94, y: -26 }
    }
  };

  // === In-game Sprite Tuner (mouse-adjust pivot/offset/scale) ===
  // Toggle with F2. While enabled and HQ is selected:
  // - Drag (LMB): move offset (screen px)
  // - Shift + Drag (LMB): move pivot (source px, auto scaled)
  // - Mouse wheel: scale (scaleMul)
  // - R: reset, C: copy current tuning JSON to clipboard, Esc/F2: exit
  const TUNER = {
    on: false,
    dragging: false,
    dragMode: "offset", // "offset" | "pivot"
    lastPx: 0,
    lastPy: 0,
    targetKind: "hq"
  };

  function _tuneObj(kind){
    if (!SPRITE_TUNE[kind]) SPRITE_TUNE[kind] = { anchor:"center", scaleMul:1.0, pivotNudge:{x:0,y:0}, offsetNudge:{x:0,y:0} };
    const t = SPRITE_TUNE[kind];
    if (!t.pivotNudge) t.pivotNudge = {x:0,y:0};
    if (!t.offsetNudge) t.offsetNudge = {x:0,y:0};
    if (t.scaleMul==null) t.scaleMul = 1.0;
    if (!t.anchor) t.anchor = "center";
    return t;
  }

  function _selectedBuildingOfKind(kind){
    for (const id of state.selection){
      const e = getEntityById(id);
      if (!e || !e.alive) continue;
      const isB = (e.type==="building") || !!BUILD[e.kind];
      if (!isB) continue;
      if (e.kind === kind) return e;
    }
    return null;
  }

  function _ensureTuneOverlay(){
    let el = document.getElementById("tuneOverlay");
    if (el) return el;
    el = document.createElement("div");
    el.id = "tuneOverlay";
    el.style.position = "fixed";
    el.style.left = "12px";
    el.style.top = "12px";
    el.style.zIndex = "99999";
    el.style.padding = "10px 12px";
    el.style.borderRadius = "10px";
    el.style.background = "rgba(0,0,0,0.62)";
    el.style.border = "1px solid rgba(255,255,255,0.18)";
    el.style.color = "#e6eef7";
    el.style.font = "12px/1.35 system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
    el.style.pointerEvents = "none";
    document.body.appendChild(el);
    return el;
  }

  function _saveTune(){
    try{
      localStorage.setItem("SPRITE_TUNE", JSON.stringify(SPRITE_TUNE));
    }catch(_e){}
  }

  function _loadTune(){
    try{
      const raw = localStorage.getItem("SPRITE_TUNE");
      if (!raw) return;
      const obj = JSON.parse(raw);
      if (obj && typeof obj === "object"){
        // shallow merge
        for (const k in obj){
          if (!obj[k]) continue;
          SPRITE_TUNE[k] = Object.assign(_tuneObj(k), obj[k]);
        }
      }
    }catch(_e){}
  }

  function _updateTuneOverlay(){
    const el = _ensureTuneOverlay();
    if (!TUNER.on){
      el.style.display = "none";
      return;
    }
    el.style.display = "block";
    const t = _tuneObj(TUNER.targetKind);
    el.innerHTML =
      "<b>SPRITE TUNER (F2)</b><br/>" +
      "target: " + TUNER.targetKind + "<br/>" +
      "anchor: " + (t.anchor||"center") + "<br/>" +
      "scaleMul: " + (t.scaleMul||1).toFixed(3) + "<br/>" +
      "offsetNudge(px): " + (t.offsetNudge?.x||0).toFixed(1) + ", " + (t.offsetNudge?.y||0).toFixed(1) + "<br/>" +
      "pivotNudge(src): " + (t.pivotNudge?.x||0).toFixed(1) + ", " + (t.pivotNudge?.y||0).toFixed(1) + "<br/>" +
      "<span style='opacity:.85'>Drag=offset | Shift+Drag=pivot | Wheel=scale | R=reset | C=copy</span>";
  }

  async function _copyTune(){
    try{
      const t = _tuneObj(TUNER.targetKind);
      const payload = JSON.stringify(t, null, 2);
      await navigator.clipboard.writeText(payload);
      toast("TUNE 복사됨");
    }catch(_e){
      toast("복사 실패");
    }
  }

  function _resetTune(){
    const t = _tuneObj(TUNER.targetKind);
    t.scaleMul = 1.0;
    t.pivotNudge.x = 0; t.pivotNudge.y = 0;
    t.offsetNudge.x = 0; t.offsetNudge.y = 0;
    _saveTune();
    _updateTuneOverlay();
    toast("TUNE 리셋");
  }

  // load persisted tuning once
  _loadTune();

  // apply HTML-provided preset (overrides persisted storage)
  ;(function(){
    try{
      const preset = (typeof window !== "undefined") ? window.SPRITE_TUNE_PRESET : null;
      if (!preset || typeof preset !== "object") return;
      for (const k in preset){
        if (!preset[k] || typeof preset[k] !== "object") continue;
        SPRITE_TUNE[k] = Object.assign(_tuneObj(k), preset[k]);
      }
      _saveTune();
    }catch(_e){}
  })();
  _updateTuneOverlay();

  // === Team palette swap cache (for building sprites) ===
  // Team-color brightness tuning (higher = brighter team stripes).
  const TEAM_ACCENT_LUMA_GAIN = 1.35; // try 1.15~1.60
  const TEAM_ACCENT_LUMA_BIAS = 0.10; // try 0.00~0.20
  const TEAM_ACCENT_LUMA_GAMMA = 0.80; // <1 brightens midtones; 1 = linear
  // Recolors only "neon magenta" accent pixels into team color.
  const _teamSpriteCache = new Map(); // key -> canvas

    function _rgb2hsv(r,g,b){
    r/=255; g/=255; b/=255;
    const max=Math.max(r,g,b), min=Math.min(r,g,b);
    const d=max-min;
    let h=0;
    if(d!==0){
      if(max===r) h=((g-b)/d)%6;
      else if(max===g) h=(b-r)/d + 2;
      else h=(r-g)/d + 4;
      h*=60;
      if(h<0) h+=360;
    }
    const s=max===0?0:d/max;
    const v=max;
    return {h,s,v};
  }

  function _isAccentPixel(r,g,b,a){
    if(a < 8) return false;

    const max=Math.max(r,g,b), min=Math.min(r,g,b);
    const sat = max===0 ? 0 : (max-min)/max;

    // Strong magenta/pink key, including anti-aliased edges (pink mixed with grey).
    // Score is high when R+B dominates and G is suppressed.
    const rbAvg = (r + b) * 0.5;
    const magScore = (r + b) - 2*g; // e.g. #ff00ff => 510

    // Very likely key color (and its edge blends)
    if(rbAvg > 110 && magScore > 105 && g < rbAvg) return true;

    // Extra coverage for bright hot-pink highlights that may have a bit more green from filtering
    if(rbAvg > 165 && magScore > 65 && g < 170) return true;


    // Extra coverage for darker magenta stripes (some sheets have "dirty" magenta with more green)
    // Condition: R and B both present, G suppressed relative to them.
    if (r > 70 && b > 70 && (r + b) > 220 && g < (r * 0.72) && g < (b * 0.72)) return true;

    // If it's basically grey, don't treat as key color.
    if(sat < 0.10) return false;

    const {h}=_rgb2hsv(r,g,b);

    // Wider hue band for magenta/purple-ish key colors.
    const magentaBand = (h>=235 && h<=358);

    // Green must not be the dominant channel (allow more slack for filtered pixels)
    const gNotDominant = g <= Math.min(r,b) + 130;

    // Prevent weird false-positives from pure blues/reds by requiring some R+B presence
    const rbPresence = (r + b) >= 160;

    return magentaBand && gNotDominant && rbPresence;
  }

  function _applyTeamPaletteToImage(img, teamColor, opts={}){
    const excludeRects = opts.excludeRects || null; // [{x,y,w,h}] in image pixel coords
    const w=img.width, h=img.height;
    const c=document.createElement('canvas'); c.width=w; c.height=h;
    const ctx=c.getContext('2d', {willReadFrequently:true});
    ctx.drawImage(img,0,0);
    const id=ctx.getImageData(0,0,w,h);
    const d=id.data;

    // Team color (linear-ish blend)
    const tr=teamColor.r, tg=teamColor.g, tb=teamColor.b;

    // Brighten like unit tint: stronger gain + slight bias, softer gamma
    const GAIN = (opts.gain ?? 1.65);
    const BIAS = (opts.bias ?? 0.18);
    const GAMMA = (opts.gamma ?? 0.78);
    const MINV = (opts.minV ?? 0.42);

    function inExclude(x,y){
      if(!excludeRects) return false;
      for(const r of excludeRects){
        if(x>=r.x && x<r.x+r.w && y>=r.y && y<r.y+r.h) return true;
      }
      return false;
    }

    for(let y=0;y<h;y++){
      for(let x=0;x<w;x++){
        const i=(y*w+x)*4;
        const a=d[i+3];
        if(a<8) continue;
        if(inExclude(x,y)) continue;

        const r=d[i], g=d[i+1], b=d[i+2];
        if(!_isAccentPixel(r,g,b,a)) continue;

        // Preserve shading using luminance, but keep it bright enough
        const l=(0.2126*r + 0.7152*g + 0.0722*b)/255;
        // If pixel is strongly saturated magenta, force a brighter base so key-color doesn't look dirty
        const max=Math.max(r,g,b), min=Math.min(r,g,b);
        const sat = max===0 ? 0 : (max-min)/max;
        let l2 = (Math.pow(l, GAMMA) * GAIN) + BIAS;
        if(sat > 0.45) l2 = Math.max(l2, 0.65);
        l2 = Math.max(MINV, Math.min(1, l2));

        // Blend toward team color (keep some original detail)
        d[i]   = Math.min(255, Math.round(tr * l2));
        d[i+1] = Math.min(255, Math.round(tg * l2));
        d[i+2] = Math.min(255, Math.round(tb * l2));
      }
    }
    ctx.putImageData(id,0,0);

    const out=new Image();
    out.src=c.toDataURL();
    return out;
  }

  function _getTeamCroppedSprite(img, crop, team){
    const key = img.src + "|" + crop.x + "," + crop.y + "," + crop.w + "," + crop.h + "|t" + team;
    const cached = _teamSpriteCache.get(key);
    if (cached) return cached;

    const cvs = document.createElement("canvas");
    cvs.width = crop.w;
    cvs.height = crop.h;
    const c = cvs.getContext("2d", { willReadFrequently: true });
    try{
      c.clearRect(0, 0, crop.w, crop.h);
      c.drawImage(img, crop.x, crop.y, crop.w, crop.h, 0, 0, crop.w, crop.h);

      const id = c.getImageData(0, 0, crop.w, crop.h);
      const d = id.data;
      const tc = _teamAccentRGB(team);
      const tr = tc[0], tg = tc[1], tb = tc[2];

      for (let i = 0; i < d.length; i += 4){
        const r = d[i], g = d[i+1], b = d[i+2], a = d[i+3];

        if (!_isAccentPixel(r, g, b, a)) continue;


        // brightness keeps shading; luma is stable for highlights
        const l = (0.2126*r + 0.7152*g + 0.0722*b) / 255;
        // brighten team accents so they pop like unit stripes
        const l2 = Math.min(1, Math.pow(l, TEAM_ACCENT_LUMA_GAMMA) * TEAM_ACCENT_LUMA_GAIN + TEAM_ACCENT_LUMA_BIAS);
        d[i]   = Math.max(0, Math.min(255, tr * l2));
        d[i+1] = Math.max(0, Math.min(255, tg * l2));
        d[i+2] = Math.max(0, Math.min(255, tb * l2));
        // alpha unchanged
      }

      c.putImageData(id, 0, 0);
    }catch(e){
      // If canvas becomes tainted for any reason, just fall back to original sprite.
      _teamSpriteCache.set(key, null);
      return null;
    }

    _teamSpriteCache.set(key, cvs);
    return cvs;
  }

  function drawBuildingSprite(ent){
    const cfg = BUILD_SPRITE[ent.kind];
    if (!cfg) return false;
    const img = cfg.img;
    if (!img || !img.complete || !img.naturalWidth || !img.naturalHeight) return false;

    const z = cam.zoom || 1;

    // Footprint width in SCREEN pixels for current tile size:
    // isometric footprint width = (tw + th) * ISO_X
    const footprintW = (ent.tw + ent.th) * ISO_X;

    // Use the cropped bbox as our "source size" to fit-to-footprint scaling.
    const tune = SPRITE_TUNE[ent.kind] || {};
    const crop = cfg.crop || { x: 0, y: 0, w: img.naturalWidth, h: img.naturalHeight };
    const scale = (footprintW / (crop.w || img.naturalWidth)) * (tune.scaleMul ?? 1.0);

    const dw = crop.w * scale * z;
    const dh = crop.h * scale * z;

    // Anchor point (matches your placement box math)

    const anchorMode = tune.anchor || "south";

    let anchorX, anchorY;
    if (anchorMode === "center") {
      // Footprint center in tile-space
      const cx = (ent.tx + ent.tw * 0.5) * TILE;
      const cy = (ent.ty + ent.th * 0.5) * TILE;
      const cW = worldToScreen(cx, cy);
      anchorX = cW.x;
      anchorY = cW.y;
    } else {
      // Footprint SOUTH corner (tx+tw, ty+th)
      const southW = worldToScreen((ent.tx + ent.tw) * TILE, (ent.ty + ent.th) * TILE);
      anchorX = southW.x;
      anchorY = southW.y;
    }

    // Pivot is bbox-space (source crop). Defaults depend on anchor mode.
    const basePivotX = (cfg.pivot?.x ?? (crop.w * 0.5));
    const basePivotY = (cfg.pivot?.y ?? (anchorMode === "center" ? (crop.h * 0.5) : crop.h));

    const nudgeX = (tune.pivotNudge?.x ?? 0);
    const nudgeY = (tune.pivotNudge?.y ?? 0);

    const px = (basePivotX + nudgeX) * scale * z;
    const py = (basePivotY + nudgeY) * scale * z;

    const dx = (anchorX - px) + ((tune.offsetNudge?.x ?? 0) * z);
    const dy = (anchorY - py) + ((tune.offsetNudge?.y ?? 0) * z);

    ctx.save();
    ctx.imageSmoothingEnabled = true;

    let srcImg = img;
    let sx = crop.x, sy = crop.y, sw = crop.w, sh = crop.h;

    if (cfg.teamColor) {
      const tinted = _getTeamCroppedSprite(img, crop, ent.team ?? TEAM.PLAYER);
      if (tinted) {
        srcImg = tinted;
        sx = 0; sy = 0; sw = crop.w; sh = crop.h;
      }
    }

    ctx.drawImage(
      srcImg,
      sx, sy, sw, sh,
      dx, dy, dw, dh
    );
    ctx.restore();
    return true;
  }

  // === Large explosion FX (exp1) atlas (json + png) ===
  const EXP1_PNG  = ASSET.sprite.eff.exp1.png;
  const EXP1_JSON = ASSET.sprite.eff.exp1.json;
  const EXP1_IMG = new Image();
  EXP1_IMG.src = EXP1_PNG;

  // Parsed frames: [{x,y,w,h}]
  let EXP1_FRAMES = null;

  // Runtime fx instances
  const exp1Fxs = [];

  // EXP1 pivot tuning:
  // (fx.x, fx.y) is "바닥 정중앙" 기준. 아래 값으로 폭발 중심을 맞춘다.
  // pivot: 0..1 (0=left/top, 1=right/bottom)
  let EXP1_PIVOT_X = 0.50;
  let EXP1_PIVOT_Y = 0.52;
  // screen-pixel offset (scaled by zoom). negative = up
  let EXP1_Y_OFFSET = -8;

  function _parseAtlasFrames(json){
    // Return: [{x,y,w,h}] sorted in a stable order.
    // Supports: Aseprite array, TexturePacker dict, plus "frames" nested in common wrappers.
    const tryParseFramesValue = (fr)=>{
      try{
        if (!fr) return null;

        // Aseprite: frames is array
        if (Array.isArray(fr)){
          const arr = fr.map((it, idx)=>({
            name: it?.filename ?? String(idx),
            // frame rect inside atlas
            x: (it?.frame?.x ?? it?.x ?? 0) | 0,
            y: (it?.frame?.y ?? it?.y ?? 0) | 0,
            w: (it?.frame?.w ?? it?.w ?? 0) | 0,
            h: (it?.frame?.h ?? it?.h ?? 0) | 0,

            // trim-aware offsets (Aseprite/TexturePacker style)
            ox: (it?.spriteSourceSize?.x ?? it?.spriteSourceSizeX ?? 0) | 0,
            oy: (it?.spriteSourceSize?.y ?? it?.spriteSourceSizeY ?? 0) | 0,
            sw: (it?.sourceSize?.w ?? it?.sourceW ?? (it?.frame?.w ?? it?.w ?? 0)) | 0,
            sh: (it?.sourceSize?.h ?? it?.sourceH ?? (it?.frame?.h ?? it?.h ?? 0)) | 0
          })).filter(f=>f.w>0 && f.h>0 && f.sw>0 && f.sh>0);

          // Sort by trailing number if possible
          arr.sort((a,b)=>{
            const na = (a.name.match(/(\d+)(?!.*\d)/)||[])[1];
            const nb = (b.name.match(/(\d+)(?!.*\d)/)||[])[1];
            if (na!=null && nb!=null) return (+na) - (+nb);
            return a.name.localeCompare(b.name);
          });

          return arr.map(({x,y,w,h,ox,oy,sw,sh})=>({x,y,w,h,ox,oy,sw,sh}));
        }

        // TexturePacker: frames is dict
        if (typeof fr === "object"){
          const keys = Object.keys(fr);
          keys.sort((a,b)=>{
            const na = (a.match(/(\d+)(?!.*\d)/)||[])[1];
            const nb = (b.match(/(\d+)(?!.*\d)/)||[])[1];
            if (na!=null && nb!=null) return (+na) - (+nb);
            return a.localeCompare(b);
          });
          const arr = [];
          for (const k of keys){
            const v = fr[k];
            const f = v && (v.frame || v);
            if (!f) continue;
            const x = (f.x ?? 0) | 0;
            const y = (f.y ?? 0) | 0;
            const w = (f.w ?? 0) | 0;
            const h = (f.h ?? 0) | 0;
            if (w>0 && h>0){
              const sss = v && (v.spriteSourceSize || v.spriteSource || v.spritesourcesize);
              const ss  = v && (v.sourceSize || v.source || v.sourcesize);
              const ox = (sss && (sss.x ?? sss[0]) ? (sss.x ?? sss[0]) : 0) | 0;
              const oy = (sss && (sss.y ?? sss[1]) ? (sss.y ?? sss[1]) : 0) | 0;
              const sw = (ss && (ss.w ?? ss[0]) ? (ss.w ?? ss[0]) : w) | 0;
              const sh = (ss && (ss.h ?? ss[1]) ? (ss.h ?? ss[1]) : h) | 0;
              arr.push({x,y,w,h, ox,oy, sw,sh});
            }
          }
          return arr.length ? arr : null;
        }
      }catch(_e){}
      return null;
    };

    try{
      // 1) Standard top-level
      let out = tryParseFramesValue(json && json.frames);
      if (out && out.length) return out;

      // 2) Deep search for any nested `.frames` field
      const candidates = [];
      const walk = (node, depth)=>{
        if (!node || depth > 8) return;
        if (typeof node !== "object") return;
        if (Array.isArray(node)){
          for (const it of node) walk(it, depth+1);
          return;
        }
        if (node.frames){
          const cand = tryParseFramesValue(node.frames);
          if (cand && cand.length) candidates.push(cand);
        }
        for (const k in node){
          if (!Object.prototype.hasOwnProperty.call(node, k)) continue;
          if (k === "frames") continue;
          walk(node[k], depth+1);
        }
      };
      walk(json, 0);

      if (candidates.length){
        candidates.sort((a,b)=>b.length - a.length);
        return candidates[0];
      }
    }catch(_e){}
    return null;
  }


  // === TexturePacker "textures":[{frames:[...]}] atlas parser (trim + anchor aware) ===
  function _parseTPTexturesAtlas(json){
    // Returns: { image: string|null, frames: Map<filename, frameObj> }
    // frameObj includes: frame{x,y,w,h}, spriteSourceSize{x,y,w,h}, sourceSize{w,h}, anchor{x,y}
    try{
      if (!json || !Array.isArray(json.textures) || !json.textures.length) return null;
      const tex = json.textures[0];
      const image = tex.image || (json.meta && json.meta.image) || null;
      const framesArr = tex.frames || [];
      const map = new Map();
      for (const fr of framesArr){
        if (!fr || !fr.filename || !fr.frame) continue;
        map.set(fr.filename, fr);
      }
      return { image, frames: map };
    }catch(_e){
      return null;
    }
  }

  async function _loadTPAtlasFromUrl(jsonUrl, baseDir){
    // baseDir: prefix to prepend to atlas image name.
    const r = await fetch(jsonUrl, { cache:"no-store" });
    if (!r.ok) throw new Error("HTTP "+r.status);
    const j = await r.json();
    const parsed = _parseTPTexturesAtlas(j);
    if (!parsed || !parsed.frames || !parsed.frames.size) throw new Error("atlas parse failed");
    const imgName = parsed.image || null;
    if (!imgName) throw new Error("atlas image missing");
    const img = new Image();
    img.src = (baseDir || "") + imgName;
    return { img, frames: parsed.frames, image: imgName };
  }

  // === Lite Tank (RA2-style hull turn + independent turret) ===
  const LITE_TANK_BASE = "asset/sprite/unit/tank/lite_tank/";
  const LITE_TANK_BASE_SCALE = 0.13; // base scale for TILE=48, sourceSize=600 (tweak via Units.UNIT.tank.spriteScale)
  const LITE_TANK = {
    ok:false,
    bodyIdle:null,
    bodyMov:null,
    muzzleIdle:null,
    muzzleMov:null
  };

  // Harvester (no turret) uses same 8-dir + 32-frame turning law as lite tank hull.
  const HARVESTER_BASE = "asset/sprite/unit/tank/harvester/";
  const HARVESTER_BASE_SCALE = 0.13; // match lite tank baseline; tweak via Units.UNIT.harvester.spriteScale
  const HARVESTER = {
    ok:false,
    idle:null,
    mov:null
  };


  // Force turret frames to align to the same ground pivot as the hull.
  // TexturePacker anchors differ between hull and turret; using a shared anchor prevents the turret from sitting on the ground.
  const LITE_TANK_TURRET_ANCHOR = { x: 0.5, y: 0.555 };
  const LITE_TANK_TURRET_NUDGE  = { x: 0,   y: 0   }; // source-pixel nudges (optional)


  const _dirToIdleIdx = { 6:1, 7:2, 0:3, 1:4, 2:5, 3:6, 4:7, 5:8 }; // dir8 -> idle1..8
  const _muzzleDirToIdleIdx = { 2:1, 1:2, 0:3, 7:4, 6:5, 5:6, 4:7, 3:8 }; // dir8 -> tank_muzzle_idle1..8 (N..)

  const _cwSeq = [6,7,0,1,2,3,4,5];
  const _muzzleCwSeq = [2,1,0,7,6,5,4,3]; // turret cw order (N->NE->E->SE->S->SW->W->NW)
  const _cwStartFrame = { 6:1, 7:5, 0:9, 1:13, 2:17, 3:21, 4:25, 5:29 }; // mov segment starts (4 frames each)
  const _muzzleCwStartFrame = { 2:1, 1:5, 0:9, 7:13, 6:17, 5:21, 4:25, 3:29 }; // tank_muzzle_mov segment starts


  function _cwNextDir(d){
    const i = _cwSeq.indexOf(d);
    return _cwSeq[(i+1) & 7];
  }
  function _ccwPrevDir(d){
    const i = _cwSeq.indexOf(d);
    return _cwSeq[(i+7) & 7];
  }

  function _tankTurnFrameNum(fromDir, toDir, fi){ // fi:0..3
    // We only have clockwise segments in the sprite sheet.
    // Counterclockwise uses the corresponding clockwise segment played backwards.
    if (toDir === _cwNextDir(fromDir)){
      const start = _cwStartFrame[fromDir] || 1;
      return start + fi;
    }
    if (toDir === _ccwPrevDir(fromDir)){
      const prev = toDir; // prev -> from is clockwise
      const start = _cwStartFrame[prev] || 1;
      return start + (3 - fi);
    }
    return null;
  }

  function _turretTurnFrameNum(fromDir, toDir, fi){ // fi:0..3
    // tank_muzzle_mov is authored in clockwise segments: N->NE->E->SE->S->SW->W->NW->N
    const a = _muzzleCwSeq.indexOf(fromDir);
    if (a < 0) return null;
    const next = _muzzleCwSeq[(a+1) & 7];
    const prev = _muzzleCwSeq[(a+7) & 7];
    if (toDir === next){
      const start = _muzzleCwStartFrame[fromDir] || 1;
      return start + fi;
    }
    if (toDir === prev){
      const start = _muzzleCwStartFrame[toDir] || 1; // prev -> from is clockwise
      return start + (3 - fi);
    }
    return null;
  }

  function _turnStepTowardSeq(seq, fromDir, goalDir){
    // returns {nextDir, stepDir} where stepDir: +1 cw, -1 ccw
    const a = seq.indexOf(fromDir);
    const b = seq.indexOf(goalDir);
    if (a < 0 || b < 0) return { nextDir: goalDir, stepDir: +1 };
    const cw = (b - a + 8) % 8;
    const ccw = (a - b + 8) % 8;
    if (cw <= ccw){
      return { nextDir: seq[(a+1) & 7], stepDir: +1 };
    }
    return { nextDir: seq[(a+7) & 7], stepDir: -1 };
  }

  function _turnStepToward(fromDir, goalDir){
    // Hull turning (RA2-ish): uses S->SE->E->NE->N->NW->W->SW sequence.
    return _turnStepTowardSeq(_cwSeq, fromDir, goalDir);
  }

  function _turnStepTowardTurret(fromDir, goalDir){
    // Turret turning: uses N->NE->E->SE->S->SW->W->NW sequence.
    return _turnStepTowardSeq(_muzzleCwSeq, fromDir, goalDir);
  }

  function _advanceTurnState(turn, fromDir, toDir, dt, frameDur, frameFn){
    // Mutates turn and returns {done:boolean, frameNum:int|null}
    turn.t = (turn.t || 0) + dt;
    const fi = Math.min(3, Math.floor(turn.t / Math.max(0.001, frameDur)));
    const frameNum = (frameFn || _tankTurnFrameNum)(fromDir, toDir, fi);
    const done = turn.t >= frameDur*4;
    return { done, frameNum };
  }

  function _tankUpdateHull(u, desiredDir, dt){
    if (u.bodyDir == null) u.bodyDir = (u.dir!=null ? u.dir : 6);

    if (desiredDir == null || desiredDir === u.bodyDir){
      u.bodyTurn = null;
      return;
    }

    // Continue current step if valid
    if (!u.bodyTurn || u.bodyTurn.fromDir==null || u.bodyTurn.toDir==null){
      const step = _turnStepToward(u.bodyDir, desiredDir);
      u.bodyTurn = { fromDir: u.bodyDir, toDir: step.nextDir, stepDir: step.stepDir, t: 0 };
    }

    const { done, frameNum } = _advanceTurnState(u.bodyTurn, u.bodyTurn.fromDir, u.bodyTurn.toDir, dt, 0.055);
    u.bodyTurn.frameNum = frameNum;

    if (done){
      u.bodyDir = u.bodyTurn.toDir;
      u.dir = u.bodyDir;
      u.bodyTurn = null;
    }
  }

  function _tankUpdateTurret(u, desiredDir, dt){
    if (u.turretDir == null) u.turretDir = (u.dir!=null ? u.dir : 6);

    if (desiredDir == null || desiredDir === u.turretDir){
      u.turretTurn = null;
      return;
    }

    if (!u.turretTurn || u.turretTurn.fromDir==null || u.turretTurn.toDir==null){
      const step = _turnStepTowardTurret(u.turretDir, desiredDir);
      u.turretTurn = { fromDir: u.turretDir, toDir: step.nextDir, stepDir: step.stepDir, t: 0 };
    }

    const { done, frameNum } = _advanceTurnState(u.turretTurn, u.turretTurn.fromDir, u.turretTurn.toDir, dt, 0.045, _turretTurnFrameNum);
    u.turretTurn.frameNum = frameNum;

    if (done){
      u.turretDir = u.turretTurn.toDir;
      u.turretTurn = null;
    }
  }

  function _tankBodyFrameName(u){
    const prefix = (u.kind==="harvester") ? "hav" : "lightank";
    if (u.bodyTurn && u.bodyTurn.frameNum){
      return prefix + "_mov" + u.bodyTurn.frameNum + ".png";
    }
    const idx = _dirToIdleIdx[u.bodyDir ?? u.dir ?? 6] || 1;
    return prefix + "_idle" + idx + ".png";
  }

  function _tankMuzzleFrameName(u){
    if (u.turretTurn && u.turretTurn.frameNum){
      return "tank_muzzle_mov" + u.turretTurn.frameNum + ".png";
    }
    const idx = _muzzleDirToIdleIdx[u.turretDir ?? u.dir ?? 6] || 1;
    return "tank_muzzle_idle" + idx + ".png";
  }

  function _drawTPFrame(atlas, filename, screenX, screenY, scale, team, anchorOverride=null, offsetOverride=null){
    if (!atlas || !atlas.img || !atlas.img.complete || !atlas.frames) return false;
    const fr = atlas.frames.get(filename);
    if (!fr) return false;

    const crop = fr.frame || fr;
    const sss = fr.spriteSourceSize || { x:0, y:0, w: crop.w, h: crop.h };
    const srcS = fr.sourceSize || { w: crop.w, h: crop.h };
    const anc = anchorOverride || fr.anchor || { x:0.5, y:0.5 };

    const sx = (crop.x|0), sy = (crop.y|0), sw = (crop.w|0), sh = (crop.h|0);

    // Team tint only inside this cropped rect
    let srcImg = atlas.img;
    let ssx = sx, ssy = sy;
    const tinted = _getTeamCroppedSprite(atlas.img, { x:sx, y:sy, w:sw, h:sh }, team);
    if (tinted){
      srcImg = tinted;
      ssx = 0; ssy = 0;
    }

    const dx = screenX - (anc.x * srcS.w * scale) + (sss.x * scale);
    const dy = screenY - (anc.y * srcS.h * scale) + (sss.y * scale);
    const odx = (offsetOverride && offsetOverride.x) ? (offsetOverride.x * scale) : 0;
    const ody = (offsetOverride && offsetOverride.y) ? (offsetOverride.y * scale) : 0;
    ctx.drawImage(srcImg, ssx, ssy, sw, sh, dx + odx, dy + ody, sw*scale, sh*scale);
    return true;
  }

  function drawLiteTankSprite(u, p){
    if (!LITE_TANK.ok) return false;
    const specScale = (window.G && G.Units && typeof G.Units.getSpec==="function") ? (G.Units.getSpec("tank")?.spriteScale ?? 1) : 1;
    const s = (cam.zoom || 1) * LITE_TANK_BASE_SCALE * specScale;
    const bodyName = _tankBodyFrameName(u);
    const muzzleName = _tankMuzzleFrameName(u);

    // Hull first, turret on top
    const bodyAtlas = (bodyName.indexOf("_mov")>=0) ? LITE_TANK.bodyMov : LITE_TANK.bodyIdle;
    const muzzleAtlas = (muzzleName.indexOf("_mov")>=0) ? LITE_TANK.muzzleMov : LITE_TANK.muzzleIdle;

    const ok1 = _drawTPFrame(bodyAtlas, bodyName, p.x, p.y, s, u.team);
    const ok2 = _drawTPFrame(muzzleAtlas, muzzleName, p.x, p.y, s, u.team, LITE_TANK_TURRET_ANCHOR, LITE_TANK_TURRET_NUDGE);

    // If frame lookup failed because of atlas mismatch, try the other atlas.
    if (!ok1){
      _drawTPFrame(LITE_TANK.bodyMov, bodyName, p.x, p.y, s, u.team);
      _drawTPFrame(LITE_TANK.bodyIdle, bodyName, p.x, p.y, s, u.team);
    }
    if (!ok2){
      _drawTPFrame(LITE_TANK.muzzleMov, muzzleName, p.x, p.y, s, u.team, LITE_TANK_TURRET_ANCHOR, LITE_TANK_TURRET_NUDGE);
      _drawTPFrame(LITE_TANK.muzzleIdle, muzzleName, p.x, p.y, s, u.team, LITE_TANK_TURRET_ANCHOR, LITE_TANK_TURRET_NUDGE);
    }
    return true;
  }


  function drawHarvesterSprite(u, p){
    if (!HARVESTER.ok) return false;
    const getSpec = (window.G && G.Units && typeof G.Units.getSpec==="function") ? G.Units.getSpec.bind(G.Units) : null;
    const specScale = getSpec ? (getSpec("harvester")?.spriteScale ?? getSpec("tank")?.spriteScale ?? 1) : 1;
    const s = (cam.zoom || 1) * HARVESTER_BASE_SCALE * specScale;

    const bodyName = _tankBodyFrameName(u);
    const atlas = (bodyName.indexOf("_mov")>=0) ? HARVESTER.mov : HARVESTER.idle;

    const ok = _drawTPFrame(atlas, bodyName, p.x, p.y, s, u.team);
    if (!ok){
      // atlas mismatch fallback
      _drawTPFrame(HARVESTER.mov, bodyName, p.x, p.y, s, u.team);
      _drawTPFrame(HARVESTER.idle, bodyName, p.x, p.y, s, u.team);
    }
    return true;
  }

  // Kick off lite tank atlas loads early (non-blocking)
  ;(async()=>{
    try{
      const [bodyIdle, bodyMov, muzzleIdle, muzzleMov] = await Promise.all([
        _loadTPAtlasFromUrl(LITE_TANK_BASE + "lite_tank.json", LITE_TANK_BASE),
        _loadTPAtlasFromUrl(LITE_TANK_BASE + "lite_tank_body_mov.json", LITE_TANK_BASE),
        _loadTPAtlasFromUrl(LITE_TANK_BASE + "lite_tank_muzzle.json", LITE_TANK_BASE),
        _loadTPAtlasFromUrl(LITE_TANK_BASE + "lite_tank_muzzle_mov.json", LITE_TANK_BASE),
      ]);
      LITE_TANK.bodyIdle = bodyIdle;
      LITE_TANK.bodyMov = bodyMov;
      LITE_TANK.muzzleIdle = muzzleIdle;
      LITE_TANK.muzzleMov = muzzleMov;
      LITE_TANK.ok = true;
      console.log("[lite_tank] atlases ready");
    }catch(e){
      console.warn("[lite_tank] atlas load failed:", e);
      LITE_TANK.ok = false;
    }
  })();

  // Kick off harvester atlas loads early (non-blocking)
  ;(async()=>{
    try{
      const [idle, mov] = await Promise.all([
        _loadTPAtlasFromUrl(HARVESTER_BASE + "harvester_idle.json", HARVESTER_BASE),
        _loadTPAtlasFromUrl(HARVESTER_BASE + "harvester_mov.json", HARVESTER_BASE),
      ]);
      HARVESTER.idle = idle;
      HARVESTER.mov = mov;
      HARVESTER.ok = true;
      console.log("[sprite] harvester atlases loaded");
    }catch(err){
      console.warn("[sprite] harvester atlas load failed", err);
    }
  })();
;



  // Kick off json load early (non-blocking)
  ;(async()=>{
    try{
      const r = await fetch(EXP1_JSON, {cache:"no-store"});
      if (!r.ok) throw new Error("HTTP "+r.status);
      const j = await r.json();
      EXP1_FRAMES = _parseAtlasFrames(j);
      if (!EXP1_FRAMES || !EXP1_FRAMES.length){
        console.warn("[EXP1] frames parse failed");
      } else {
        //console.log("[EXP1] frames:", EXP1_FRAMES.length);
      }
    }catch(e){
      console.warn("[EXP1] load failed:", e);
      EXP1_FRAMES = null;
    }
  })();

  function spawnExp1FxAt(wx, wy, scale=1.0, frameDur=0.05){
    // If not ready yet, just skip (base particle explosion still happens).
    if (!EXP1_FRAMES || !EXP1_FRAMES.length) return;
    exp1Fxs.push({ x: wx, y: wy, t0: state.t, scale, frameDur });
  }

  function updateExp1Fxs(dt){
    if (!exp1Fxs.length) return;
    for (let i=exp1Fxs.length-1;i>=0;i--){
      const fx = exp1Fxs[i];
      const age = state.t - fx.t0;
      const idx = Math.floor(age / Math.max(0.001, fx.frameDur));
      if (idx >= EXP1_FRAMES.length) exp1Fxs.splice(i,1);
    }
  }

  function drawExp1Fxs(ctx){
    if (!exp1Fxs.length) return;
    if (!EXP1_FRAMES || !EXP1_FRAMES.length) return;
    if (!EXP1_IMG || !EXP1_IMG.complete) return;

    const z = (typeof cam !== "undefined" && cam && typeof cam.zoom==="number") ? cam.zoom : 1;

    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = 1;

    for (const fx of exp1Fxs){
      const age = state.t - fx.t0;
      const fi = Math.floor(age / Math.max(0.001, fx.frameDur));
      if (fi < 0 || fi >= EXP1_FRAMES.length) continue;

      const fr = EXP1_FRAMES[fi];
      const p = worldToScreen(fx.x, fx.y);

      const dw = (fr.sw ?? fr.w) * fx.scale * z;
      const dh = (fr.sh ?? fr.h) * fx.scale * z;

      // Anchor: pivoted (tunable) at (fx.x, fx.y) == "바닥 정중앙"
      const dx = p.x - dw * EXP1_PIVOT_X;
      const dy = p.y - dh * EXP1_PIVOT_Y + (EXP1_Y_OFFSET * z);

      // Trim-aware placement:
      const ox = (fr.ox ?? 0) * fx.scale * z;
      const oy = (fr.oy ?? 0) * fx.scale * z;
      const fw = fr.w * fx.scale * z;
      const fh = fr.h * fx.scale * z;

      ctx.drawImage(EXP1_IMG, fr.x, fr.y, fr.w, fr.h, dx + ox, dy + oy, fw, fh);
    }

    ctx.restore();
  }

  // === Camera shake (world only, UI unaffected) ===
  const camShake = { t:0, dur:0, mag:0, freq:0, ox:0, oy:0, active:false };

  function startCamShake(dur=0.55, mag=18, freq=34){
    camShake.t = 0;
    camShake.dur = Math.max(0.05, dur);
    camShake.mag = mag;
    camShake.freq = freq;
    camShake.active = true;
    camShake.ox = 0;
    camShake.oy = 0;
  }

  function updateCamShake(dt){
    if (!camShake.active) return;
    camShake.t += dt;
    const k = 1 - (camShake.t / Math.max(0.001, camShake.dur));
    if (k <= 0){
      camShake.active = false;
      camShake.ox = 0;
      camShake.oy = 0;
      return;
    }
    // Screen-space wobble, eased out
    const a = camShake.t * camShake.freq;
    const amp = camShake.mag * (k*k);
    camShake.ox = (Math.sin(a*1.7) + Math.sin(a*2.9)*0.55) * amp;
    camShake.oy = (Math.cos(a*1.3) + Math.cos(a*2.3)*0.55) * amp;
  }

  // === Sniper movement sprite sheets (8-dir) 12f (600x600 tiles, 6x2) ===
  // NOTE: filenames per user assets (no _e suffix; east uses snip_mov.png)
  const SNIP_MOV_PNG    = ASSET.sprite.unit.snip.mov.E;
  const SNIP_MOV_N_PNG  = ASSET.sprite.unit.snip.mov.N;
  const SNIP_MOV_NE_PNG = ASSET.sprite.unit.snip.mov.NE;
  const SNIP_MOV_NW_PNG = ASSET.sprite.unit.snip.mov.NW;
  const SNIP_MOV_S_PNG  = ASSET.sprite.unit.snip.mov.S;
  const SNIP_MOV_SE_PNG = ASSET.sprite.unit.snip.mov.SE;
  const SNIP_MOV_SW_PNG = ASSET.sprite.unit.snip.mov.SW;
  const SNIP_MOV_W_PNG  = ASSET.sprite.unit.snip.mov.W;

  const SNIP_MOV_IMG    = new Image(); SNIP_MOV_IMG.src    = SNIP_MOV_PNG;
  const SNIP_MOV_N_IMG  = new Image(); SNIP_MOV_N_IMG.src  = SNIP_MOV_N_PNG;
  const SNIP_MOV_NE_IMG = new Image(); SNIP_MOV_NE_IMG.src = SNIP_MOV_NE_PNG;
  const SNIP_MOV_NW_IMG = new Image(); SNIP_MOV_NW_IMG.src = SNIP_MOV_NW_PNG;
  const SNIP_MOV_S_IMG  = new Image(); SNIP_MOV_S_IMG.src  = SNIP_MOV_S_PNG;
  const SNIP_MOV_SE_IMG = new Image(); SNIP_MOV_SE_IMG.src = SNIP_MOV_SE_PNG;
  const SNIP_MOV_SW_IMG = new Image(); SNIP_MOV_SW_IMG.src = SNIP_MOV_SW_PNG;
  const SNIP_MOV_W_IMG  = new Image(); SNIP_MOV_W_IMG.src  = SNIP_MOV_W_PNG;



  // === Infantry sprite (attack 8-dir) embedded ===
  const INF_ATK_PNG = ASSET.sprite.unit.inf.atk;
  const INF_ATK_IMG = new Image();
  INF_ATK_IMG.src = INF_ATK_PNG;

  // === Repair wrench FX sprite sheet (7 frames, 602x602 each) ===
  const REPAIR_WRENCH_PNG = ASSET.sprite.unit.inf.wrench;
  const REPAIR_WRENCH_IMG = new Image();
  REPAIR_WRENCH_IMG.src = REPAIR_WRENCH_PNG;



  // === Infantry death FX sprite sheet (7 frames, 1200x1200 each) ===
  const INF_DIE_PNG = ASSET.sprite.unit.inf.die;
  const INF_DIE_IMG = new Image();
  INF_DIE_IMG.src = INF_DIE_PNG;



  // === Infantry movement sprite (east) 6f (600x600 tiles) embedded ===
  const INF_MOV_PNG = ASSET.sprite.unit.inf.mov.E;
  const INF_MOV_IMG = new Image();
  INF_MOV_IMG.src = INF_MOV_PNG;

  // === Infantry move NE (north-east) 6-frame sheet (600x600 each) ===
  const INF_MOV_NE_PNG = ASSET.sprite.unit.inf.mov.NE;
  const INF_MOV_NE_IMG = new Image();
  INF_MOV_NE_IMG.src = INF_MOV_NE_PNG;

  // === Infantry move N (north) 6-frame sheet (600x600 each) ===
  const INF_MOV_N_PNG = ASSET.sprite.unit.inf.mov.N;
  const INF_MOV_N_IMG = new Image();
  INF_MOV_N_IMG.src = INF_MOV_N_PNG;

  // === Infantry move NW (north-west) 6-frame sheet (600x600 each) ===
  const INF_MOV_NW_PNG = ASSET.sprite.unit.inf.mov.NW;
  const INF_MOV_NW_IMG = new Image();
  INF_MOV_NW_IMG.src = INF_MOV_NW_PNG;

  // === Infantry move W (west) 6-frame sheet (600x600 each) ===
  const INF_MOV_W_PNG = ASSET.sprite.unit.inf.mov.W;
  const INF_MOV_W_IMG = new Image();
  INF_MOV_W_IMG.src = INF_MOV_W_PNG;

  // === Infantry move SW (south-west) 6-frame sheet (600x600 each) ===
  const INF_MOV_SW_PNG = ASSET.sprite.unit.inf.mov.SW;
  const INF_MOV_SW_IMG = new Image();
  INF_MOV_SW_IMG.src = INF_MOV_SW_PNG;

  // === Infantry move S (south) 6-frame sheet (600x600 each) ===
  const INF_MOV_S_PNG = ASSET.sprite.unit.inf.mov.S;
  const INF_MOV_S_IMG = new Image();
  INF_MOV_S_IMG.src = INF_MOV_S_PNG;

  // === Infantry move SE (south-east) 6-frame sheet (600x600 each) ===
  const INF_MOV_SE_PNG = ASSET.sprite.unit.inf.mov.SE;
  const INF_MOV_SE_IMG = new Image();
  INF_MOV_SE_IMG.src = INF_MOV_SE_PNG;

  // === Team palette swap (magenta -> team color) ===
  // Recolors magenta-ish pixels in the infantry sheet into the team's color.
  // Performance: builds one recolored cached sheet per team (draw-time stays fast).
  const INF_TEAM_SHEET_IDLE = new Map(); // teamId -> <canvas>
  const INF_TEAM_SHEET_ATK  = new Map(); // teamId -> <canvas>
  const INF_TEAM_SHEET_DIE  = new Map(); // teamId -> <canvas>
  const INF_TEAM_SHEET_MOV  = new Map(); // teamId -> <canvas>
  const INF_TEAM_SHEET_MOV_NE = new Map(); // teamId -> <canvas>
  const INF_TEAM_SHEET_MOV_N  = new Map(); // teamId -> <canvas>
  const INF_TEAM_SHEET_MOV_NW = new Map(); // teamId -> <canvas>
  const INF_TEAM_SHEET_MOV_W  = new Map(); // teamId -> <canvas>
  const INF_TEAM_SHEET_MOV_SW = new Map(); // teamId -> <canvas>
  const INF_TEAM_SHEET_MOV_S  = new Map(); // teamId -> <canvas>
  const INF_TEAM_SHEET_MOV_SE = new Map(); // teamId -> <canvas>

  function hexToRgb(hex){
    if (!hex) return null;
    const h = String(hex).trim();
    const m = /^#?([0-9a-f]{6})$/i.exec(h);
    if (!m) return null;
    const n = parseInt(m[1],16);
    return [(n>>16)&255, (n>>8)&255, n&255];
  }
  function isMagentaish(r,g,b){
    // More tolerant magenta detector (catches dark magenta shading too).
    // Idea: magenta has R and B both noticeably higher than G, and enough saturation.
    const maxv = (r>g ? (r>b?r:b) : (g>b?g:b));
    const minv = (r<g ? (r<b?r:b) : (g<b?g:b));
    const sat = maxv - minv; // simple saturation proxy
    if (maxv < 40) return false;      // too dark to care (noise)
    if (sat < 25) return false;       // too gray
    if (r < g + 18) return false;     // R not above G enough
    if (b < g + 18) return false;     // B not above G enough
    if (Math.abs(r - b) > 140) return false; // keep near-magenta (avoid pure red/blue)
    return true;
  }
  function buildInfTeamSheet(srcImg, cacheMap, teamId){
  if (!cacheMap) cacheMap = INF_TEAM_SHEET_IDLE;
  if (cacheMap.has(teamId)) return cacheMap.get(teamId);
  if (!srcImg || !srcImg.complete || !srcImg.naturalWidth) return srcImg;

  // Pick teamId color from existing UI colors if available.
  let col = "#ffffff";
  try{
    if (teamId===TEAM.PLAYER) col = state?.colors?.player || state?.player?.color || "#66aaff";
    else if (teamId===TEAM.ENEMY) col = state?.colors?.enemy || state?.enemy?.color || "#ff5555";
    else col = "#cccccc";
  }catch(_err){ col = "#ffffff"; }
  const rgb = hexToRgb(col) || [255,255,255];

  const c = document.createElement('canvas');
  c.width = srcImg.naturalWidth;
  c.height = srcImg.naturalHeight;
  const cctx = c.getContext('2d', { willReadFrequently:true });
  cctx.drawImage(srcImg, 0, 0);

  const imgd = cctx.getImageData(0,0,c.width,c.height);
  const d = imgd.data;
  for (let i=0;i<d.length;i+=4){
    const a = d[i+3];
    if (a===0) continue;
    const r=d[i], g=d[i+1], b=d[i+2];
    if (!isMagentaish(r,g,b)) continue;

    // Keep shading by mapping magenta brightness to team color brightness.
    const shade = Math.max(0, Math.min(1, (r + b) / 510));
    d[i  ] = (rgb[0] * shade) | 0;
    d[i+1] = (rgb[1] * shade) | 0;
    d[i+2] = (rgb[2] * shade) | 0;
  }
  cctx.putImageData(imgd,0,0);
  cacheMap.set(teamId, c);
  return c;
}



  // The PNG contains 8 poses (idle), arranged in a 3x3 grid with the bottom-right cell empty.
  // Order definition (USER-LOCKED): start at top-left and go right:
  // [0]=동(E), [1]=동북(NE), [2]=북(N), [3]=북서(NW), [4]=서(W), [5]=남서(SW), [6]=남(S), [7]=동남(SE)
  // Bounding boxes were auto-trimmed from the provided file (inf_idle_tex.png 1800x1800).
  const INF_IDLE_ATLAS = [
    { x:226, y: 90, w:199, h:420 }, // 0 E
    { x:794, y: 89, w:204, h:436 }, // 1 NE
    { x:1363,y: 90, w:245, h:425 }, // 2 N
    { x:207, y:689, w:204, h:436 }, // 3 NW
    { x:776, y:690, w:199, h:420 }, // 4 W
    { x:1398,y:691, w:209, h:429 }, // 5 SW
    { x:191, y:1289,w:283, h:422 }, // 6 S (front)
    { x:809, y:1291,w:209, h:429 }, // 7 SE
  ];

// === Infantry attack atlas (auto-trim from 3x3 grid; bottom-right empty) ===
// We auto-build boxes at runtime so you can swap sheets without re-measuring pixels.
let INF_ATK_ATLAS = null;
function buildAtlasFromGrid(img, cols=3, rows=3){
  if (!img || !img.complete || !img.naturalWidth) return null;
  const W = img.naturalWidth, H = img.naturalHeight;
  const cellW = Math.floor(W/cols), cellH = Math.floor(H/rows);

  const c = document.createElement("canvas");
  c.width=W; c.height=H;
  const cctx=c.getContext("2d",{willReadFrequently:true});
  cctx.clearRect(0,0,W,H);
  cctx.drawImage(img,0,0);

  const atlas=[];
  for (let i=0;i<8;i++){
    const cx = i % cols;
    const cy = (i/cols)|0;
    const x0 = cx*cellW, y0 = cy*cellH;
    const imgd = cctx.getImageData(x0,y0,cellW,cellH);
    const d = imgd.data;

    let minx=cellW, miny=cellH, maxx=-1, maxy=-1;
    for (let y=0; y<cellH; y++){
      for (let x=0; x<cellW; x++){
        const a = d[(y*cellW + x)*4 + 3];
        if (a>0){
          if (x<minx) minx=x;
          if (y<miny) miny=y;
          if (x>maxx) maxx=x;
          if (y>maxy) maxy=y;
        }
      }
    }
    if (maxx<0){
      // empty cell (shouldn't happen for 0..7)
      atlas.push({x:x0, y:y0, w:1, h:1});
    } else {
      // small padding to match idle feel
      const pad=2;
      minx=Math.max(0, minx-pad); miny=Math.max(0, miny-pad);
      maxx=Math.min(cellW-1, maxx+pad); maxy=Math.min(cellH-1, maxy+pad);
      atlas.push({x:x0+minx, y:y0+miny, w:(maxx-minx+1), h:(maxy-miny+1)});
    }
  }
  return atlas;
}

// === Sniper atlas/cache ===
let SNIP_IDLE_ATLAS = null;
const SNIP_TEAM_SHEET = new Map();

const SNIP_TEAM_SHEET_MOV    = new Map();
const SNIP_TEAM_SHEET_MOV_NE = new Map();
const SNIP_TEAM_SHEET_MOV_N  = new Map();
const SNIP_TEAM_SHEET_MOV_NW = new Map();
const SNIP_TEAM_SHEET_MOV_W  = new Map();
const SNIP_TEAM_SHEET_MOV_SW = new Map();
const SNIP_TEAM_SHEET_MOV_S  = new Map();
const SNIP_TEAM_SHEET_MOV_SE = new Map();

  const SNIP_DIE_TEAM_SHEET = new Map();
function ensureSnipAtlases(){
  if (!SNIP_IMG || !SNIP_IMG.complete || !SNIP_IMG.naturalWidth) return;
  if (!SNIP_IDLE_ATLAS){
    SNIP_IDLE_ATLAS = buildAtlasFromGrid(SNIP_IMG,3,3);
  }
}


function ensureInfAtlases(){
  if (!INF_ATK_ATLAS && INF_ATK_IMG && INF_ATK_IMG.complete && INF_ATK_IMG.naturalWidth){
    INF_ATK_ATLAS = buildAtlasFromGrid(INF_ATK_IMG, 3, 3);
  }
}

  // Scale for in-game rendering (can be tuned)
  const INF_SPRITE_SCALE = 0.12;

  // Sprite dir remap (fix 1-step offset reported by user)
  // Engine dir order is expected: 0=E,1=NE,2=N,3=NW,4=W,5=SW,6=S,7=SE
  // If sprites appear shifted by one, we compensate here.
  const INF_DIR_OFFSET = 0; // user-calibrated sprite index offset
 // 0 means direct mapping (E,NE,N,NW,W,SW,S,SE)
  function infRemapDir(dir){
    dir = (dir|0) % 8; if (dir<0) dir += 8;
    let d = (dir + INF_DIR_OFFSET) % 8; if (d<0) d += 8;
    return d;
  }


  // Convert a movement vector (dx,dy) to our 8-dir index (E,NE,N,NW,W,SW,S,SE).
  // Note: screen/world coordinates use +y = down. North is dy < 0.
  function vecToDir8(dx, dy){
    if (!dx && !dy) return 6; // default South/front
    const ang = Math.atan2(dy, dx); // -PI..PI
    // target angles in degrees for indices 0..7
    const targets = [0, -45, -90, -135, 180, 135, 90, 45];
    const deg = ang * 180 / Math.PI;
    let bestI = 0, bestD = 1e9;
    for (let i=0;i<8;i++){
      let d = deg - targets[i];
      // wrap to [-180,180]
      d = ((d + 540) % 360) - 180;
      const ad = Math.abs(d);
      if (ad < bestD){ bestD = ad; bestI = i; }
    }
    return bestI;
  }

  // Convert a world/tile-space vector to a screen-space direction, then map to our 8-dir index.
// This matches your on-screen compass (E=right, N=up, W=left, S=down) even under isometric projection.
// World vector (dx,dy) -> iso screen vector (sx,sy) where:
//   sx ~ (dx - dy)
//   sy ~ (dx + dy) * 0.5   (scale doesn't matter for angle)
function worldVecToDir8(dx, dy){
  // IMPORTANT: direction must match what you see on screen.
  // Use the same projection as rendering (worldToIso delta), not a hardcoded 0.5.
  // Screen-space delta (in iso space):
  //   sx = (dx - dy) * (ISO_X / TILE)
  //   sy = (dx + dy) * (ISO_Y / TILE)
  const sx = (dx - dy) * (ISO_X / TILE);
  const sy = (dx + dy) * (ISO_Y / TILE);
  return vecToDir8(sx, sy);
}

  function drawInfantrySprite(ctx, px, py, dir, alpha, teamId, isFiring=false){
  ensureInfAtlases();
  const atlas = (isFiring && INF_ATK_ATLAS) ? INF_ATK_ATLAS : INF_IDLE_ATLAS;
  const img   = (isFiring && INF_ATK_ATLAS) ? INF_ATK_IMG   : INF_IMG;
  const cache = (isFiring && INF_ATK_ATLAS) ? INF_TEAM_SHEET_ATK : INF_TEAM_SHEET_IDLE;

  const f = atlas[infRemapDir(dir)] || atlas[6];
  const z = (typeof cam !== "undefined" && cam && typeof cam.zoom==="number") ? cam.zoom : 1;
  const sc = INF_SPRITE_SCALE * z;
  const dw = f.w * sc, dh = f.h * sc;

  // Pivot: bottom-center (feet)
  const pivotX = f.w * 0.5;
  const pivotY = f.h * 1.0;

  const dx = Math.floor(px - pivotX*sc);
  const dy = Math.floor(py - pivotY*sc);

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(buildInfTeamSheet(img, cache, teamId), f.x, f.y, f.w, f.h, dx, dy, dw, dh);
  ctx.restore();
}


  
function drawSniperSprite(ctx, wx, wy, dir, alpha=1, teamId=0){
  // Uses an 8-direction 3x3 sheet like infantry idle (snip_idle_tex.png). We build a trimmed atlas once.
  ensureSnipAtlases();
  if (!SNIP_IDLE_ATLAS || !SNIP_IDLE_ATLAS[dir]) return;

  const atlas = SNIP_IDLE_ATLAS;
  const f = atlas[dir];

  const sheet = buildInfTeamSheet(SNIP_IMG, SNIP_TEAM_SHEET, teamId);
  // buildInfTeamSheet may return an Image (not yet cached) or an offscreen Canvas (cached).
  // Canvas doesn't have .complete/.naturalWidth, so guard using width/naturalWidth.
  const sheetW = (sheet && (sheet.naturalWidth || sheet.width)) || 0;
  if (!sheetW) return;

  // Render pivot: bottom-center (same as infantry idle); movement sprites use FEET_NUDGE but idle does not.
  const z = (typeof cam !== "undefined" && cam && typeof cam.zoom==="number") ? cam.zoom : 1;
  const scale = INF_SPRITE_SCALE * z;
  const dx = Math.round(wx - (f.w * scale)/2);
  const dy = Math.round(wy - (f.h * scale));
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(sheet, f.x, f.y, f.w, f.h, dx, dy, f.w*scale, f.h*scale);
  ctx.restore();
}

function drawInfantryMoveEast(ctx, px, py, alpha, teamId, t){
    // 6-frame loop, 600x600 tiles, frame 1 at top-left, row-major.
    if (!INF_MOV_IMG || !INF_MOV_IMG.complete || !INF_MOV_IMG.naturalWidth) {
      // fallback to idle
      drawInfantrySprite(ctx, px, py, 0, alpha, teamId, false);
      return;
    }
    const z = (typeof cam !== "undefined" && cam && typeof cam.zoom==="number") ? cam.zoom : 1;
    const sc = INF_SPRITE_SCALE * z * 1.0; // same as infantry scale
    const TILEW = 600, TILEH = 600;
    const cols = Math.max(1, Math.floor(INF_MOV_IMG.naturalWidth / TILEW));
    const frameDur = 0.04;
    // Small per-unit phase offset to reduce marching-in-sync.
    const phase = ((teamId||0)*0.37 + (Math.abs(((px*0.01)|0)+((py*0.01)|0))%97)*0.011);
    const fi = (Math.floor((t + phase) / frameDur) % 6 + 6) % 6;

    const sx = (fi % cols) * TILEW;
    const sy = Math.floor(fi / cols) * TILEH;

    const dw = TILEW * sc, dh = TILEH * sc;

    // Pivot: bottom-center (feet)
    const pivotX = TILEW * 0.5;
    const FEET_NUDGE = 52; // move sprite slightly down to match idle grounding
    const pivotY = TILEH * 1.0 - FEET_NUDGE;

    const dx = Math.floor(px - pivotX*sc);
    const dy = Math.floor(py - pivotY*sc);

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(buildInfTeamSheet(INF_MOV_IMG, INF_TEAM_SHEET_MOV, teamId), sx, sy, TILEW, TILEH, dx, dy, dw, dh);
    ctx.restore();
  }

  function drawInfantryMoveNE(ctx, px, py, alpha, teamId, t){
    // 6-frame loop, 600x600 tiles, frame 1 at top-left, row-major.
    if (!INF_MOV_NE_IMG || !INF_MOV_NE_IMG.complete || !INF_MOV_NE_IMG.naturalWidth) {
      // fallback to idle (NE dir = 1)
      drawInfantrySprite(ctx, px, py, 1, alpha, teamId, false);
      return;
    }
    const z = (typeof cam !== "undefined" && cam && typeof cam.zoom==="number") ? cam.zoom : 1;
    const sc = INF_SPRITE_SCALE * z * 1.0; // same as infantry scale
    const TILEW = 600, TILEH = 600;
    const cols = Math.max(1, Math.floor(INF_MOV_NE_IMG.naturalWidth / TILEW));
    const frameDur = 0.04;
    // Small per-unit phase offset to reduce marching-in-sync.
    const phase = ((teamId||0)*0.37 + (Math.abs(((px*0.01)|0)+((py*0.01)|0))%97)*0.011);
    const fi = (Math.floor((t + phase) / frameDur) % 6 + 6) % 6;

    const sx = (fi % cols) * TILEW;
    const sy = Math.floor(fi / cols) * TILEH;

    const dw = TILEW * sc, dh = TILEH * sc;

    // Pivot: bottom-center (feet)
    const pivotX = TILEW * 0.5;
    const FEET_NUDGE = 52; // keep identical to E so pivot policy stays consistent
    const pivotY = TILEH * 1.0 - FEET_NUDGE;

    const dx = Math.floor(px - pivotX*sc);
    const dy = Math.floor(py - pivotY*sc);

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(buildInfTeamSheet(INF_MOV_NE_IMG, INF_TEAM_SHEET_MOV_NE, teamId), sx, sy, TILEW, TILEH, dx, dy, dw, dh);
    ctx.restore();
  }



  function drawInfantryMoveSheet(ctx, px, py, alpha, teamId, t, img, cache, fallbackDir){
    // Shared helper for 6-frame loop sheets (600x600 per frame), row-major, looping 1..6.
    if (!img || !img.complete || !img.naturalWidth) {
      drawInfantrySprite(ctx, px, py, fallbackDir, alpha, teamId, false);
      return;
    }
    const z = (typeof cam !== "undefined" && cam && typeof cam.zoom==="number") ? cam.zoom : 1;
    const sc = INF_SPRITE_SCALE * z * 1.0; // same as infantry scale
    const TILEW = 600, TILEH = 600;
    const cols = Math.max(1, Math.floor(img.naturalWidth / TILEW));
    const frameDur = 0.04;

    // Small per-unit phase offset to reduce marching-in-sync.
    const phase = ((teamId||0)*0.37 + (Math.abs(((px*0.01)|0)+((py*0.01)|0))%97)*0.011);
    const fi = (Math.floor((t + phase) / frameDur) % 6 + 6) % 6;

    const sx = (fi % cols) * TILEW;
    const sy = Math.floor(fi / cols) * TILEH;

    const dw = TILEW * sc, dh = TILEH * sc;

    // Pivot: bottom-center (feet) using the established move pivot policy.
    const pivotX = TILEW * 0.5;
    const FEET_NUDGE = 52; // standard move feet grounding
    const pivotY = TILEH * 1.0 - FEET_NUDGE;

    const dx = Math.floor(px - pivotX*sc);
    const dy = Math.floor(py - pivotY*sc);

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(buildInfTeamSheet(img, cache, teamId), sx, sy, TILEW, TILEH, dx, dy, dw, dh);
    ctx.restore();
  }

  function drawInfantryMoveN(ctx, px, py, alpha, teamId, t){
    return drawInfantryMoveSheet(ctx, px, py, alpha, teamId, t, INF_MOV_N_IMG, INF_TEAM_SHEET_MOV_N, 2);
  }
  function drawInfantryMoveNW(ctx, px, py, alpha, teamId, t){
    return drawInfantryMoveSheet(ctx, px, py, alpha, teamId, t, INF_MOV_NW_IMG, INF_TEAM_SHEET_MOV_NW, 3);
  }
  function drawInfantryMoveW(ctx, px, py, alpha, teamId, t){
    return drawInfantryMoveSheet(ctx, px, py, alpha, teamId, t, INF_MOV_W_IMG, INF_TEAM_SHEET_MOV_W, 4);
  }
  function drawInfantryMoveSW(ctx, px, py, alpha, teamId, t){
    return drawInfantryMoveSheet(ctx, px, py, alpha, teamId, t, INF_MOV_SW_IMG, INF_TEAM_SHEET_MOV_SW, 5);
  }
  function drawInfantryMoveS(ctx, px, py, alpha, teamId, t){
    return drawInfantryMoveSheet(ctx, px, py, alpha, teamId, t, INF_MOV_S_IMG, INF_TEAM_SHEET_MOV_S, 6);
  }
  function drawInfantryMoveSE(ctx, px, py, alpha, teamId, t){
    return drawInfantryMoveSheet(ctx, px, py, alpha, teamId, t, INF_MOV_SE_IMG, INF_TEAM_SHEET_MOV_SE, 7);
  }



  
  // === Sniper movement rendering (12-frame 600x600 tiles, 6x2, row-major) ===
  function drawSniperMoveSheet(ctx, px, py, alpha, teamId, t, img, cache, fallbackDir){
    // 12-frame loop sheets, 600x600 per tile, row-major (left->right, top row then next row).
    if (!img || !img.complete || !img.naturalWidth) {
      // fallback to idle sniper facing
      drawSniperSprite(ctx, px, py, fallbackDir, alpha, teamId);
      return;
    }
    const z = (typeof cam !== "undefined" && cam && typeof cam.zoom==="number") ? cam.zoom : 1;
    const sc = INF_SPRITE_SCALE * z * 1.0; // EXACTLY same policy as infantry move
    const TILEW = 600, TILEH = 600;
    const cols = Math.max(1, Math.floor(img.naturalWidth / TILEW)); // should be 6
    const frames = 12;
    const frameDur = 0.04;

    // phase offset (same idea as infantry)
    const phase = ((teamId||0)*0.37 + (Math.abs(((px*0.01)|0)+((py*0.01)|0))%97)*0.011);
    const fi = (Math.floor((t + phase) / frameDur) % frames + frames) % frames;

    const sx = (fi % cols) * TILEW;
    const sy = Math.floor(fi / cols) * TILEH;

    const dw = TILEW * sc, dh = TILEH * sc;

    // Pivot: bottom-center with FEET_NUDGE=52 (same as infantry move)
    const pivotX = TILEW * 0.5;
    const FEET_NUDGE = 52;
    const pivotY = TILEH * 1.0 - FEET_NUDGE;

    const dx = Math.floor(px - pivotX*sc);
    const dy = Math.floor(py - pivotY*sc);

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(buildInfTeamSheet(img, cache, teamId), sx, sy, TILEW, TILEH, dx, dy, dw, dh);
    ctx.restore();
  }

  function drawSniperMoveByDir(ctx, px, py, dir, alpha, teamId, t){
    // dir mapping is the same as infantry: 0:E,1:NE,2:N,3:NW,4:W,5:SW,6:S,7:SE
    if (dir===0)      return drawSniperMoveSheet(ctx, px, py, alpha, teamId, t, SNIP_MOV_IMG,    SNIP_TEAM_SHEET_MOV,    0);
    else if (dir===1) return drawSniperMoveSheet(ctx, px, py, alpha, teamId, t, SNIP_MOV_NE_IMG, SNIP_TEAM_SHEET_MOV_NE, 1);
    else if (dir===2) return drawSniperMoveSheet(ctx, px, py, alpha, teamId, t, SNIP_MOV_N_IMG,  SNIP_TEAM_SHEET_MOV_N,  2);
    else if (dir===3) return drawSniperMoveSheet(ctx, px, py, alpha, teamId, t, SNIP_MOV_NW_IMG, SNIP_TEAM_SHEET_MOV_NW, 3);
    else if (dir===4) return drawSniperMoveSheet(ctx, px, py, alpha, teamId, t, SNIP_MOV_W_IMG,  SNIP_TEAM_SHEET_MOV_W,  4);
    else if (dir===5) return drawSniperMoveSheet(ctx, px, py, alpha, teamId, t, SNIP_MOV_SW_IMG, SNIP_TEAM_SHEET_MOV_SW, 5);
    else if (dir===6) return drawSniperMoveSheet(ctx, px, py, alpha, teamId, t, SNIP_MOV_S_IMG,  SNIP_TEAM_SHEET_MOV_S,  6);
    else if (dir===7) return drawSniperMoveSheet(ctx, px, py, alpha, teamId, t, SNIP_MOV_SE_IMG, SNIP_TEAM_SHEET_MOV_SE, 7);
    return drawSniperSprite(ctx, px, py, dir, alpha, teamId);
  }

function buildingWorldFromTileOrigin(tx,ty,tw,th){
    const w=tw*TILE, h=th*TILE;
    // Buildings occupy an integer tile footprint [tx..tx+tw-1, ty..ty+th-1].
    // Use the footprint's true world AABB center (aligned to tile grid intersections).
    return { cx: (tx*TILE + w/2), cy: (ty*TILE + h/2), w, h };
  }
  function setBuildingOcc(b, v){
    for (let ty=b.ty; ty<b.ty+b.th; ty++){
      for (let tx=b.tx; tx<b.tx+b.tw; tx++){
        if (inMap(tx,ty)) buildOcc[idx(tx,ty)] = v;
      }
    }
  }

  function addBuilding(team, kind, tx, ty){
    const spec=BUILD[kind];
    const tw=spec.tw, th=spec.th;
    const wpos = buildingWorldFromTileOrigin(tx,ty,tw,th);
    const b = {
      id: nextId++,
      team, kind,
      grp: 0,
      tx, ty, tw, th,
      x: wpos.cx, y: wpos.cy,
      w: wpos.w, h: wpos.h,
      hp: spec.hp, hpMax: spec.hp,
      buildQ: [],
      rally: null,
      shootCd: 0,
      vx:0, vy:0,
      cloakBreak: 0,
      cloaked: false,
      repairOn: false,
      repairFxCd: 0,
      alive: true,
      provideR: spec.provideR || 0,
      attackable: (spec.attackable !== false),
      selectable: (spec.selectable !== false),
      hideUI: !!spec.hideUI,
      civ: (kind==="civ_oregen"),
      oregenT:0
    };
    buildings.push(b);
    // Auto-assign PRIMARY producer if none.
    if (team===TEAM.PLAYER){
      if (kind==="barracks" && !state.primary.player.barracks) state.primary.player.barracks = b.id;
      if (kind==="factory"  && !state.primary.player.factory)  state.primary.player.factory  = b.id;
    }
    setBuildingOcc(b, 1);
    recomputePower();
    onBuildingPlaced(b);
    return b;
  }

  
function hasBuilding(team, kind){
  for (const b of buildings){
    if (b.alive && !b.civ && b.team===team && b.kind===kind) return true;
  }
  return false;
}

function findHarvesterSpawnNearBuilding(b){
  // Find a nearby free tile to spawn a vehicle-sized unit.
  // Prefer tiles around the footprint perimeter.
  const cx = b.tx + (b.tw>>1);
  const cy = b.ty + (b.th>>1);
  const maxR = 12;
  for (let r=1; r<=maxR; r++){
    for (let dy=-r; dy<=r; dy++){
      for (let dx=-r; dx<=r; dx++){
        if (Math.abs(dx)!==r && Math.abs(dy)!==r) continue; // perimeter only
        const tx = cx + dx;
        const ty = cy + dy;
        if (!inMap(tx,ty)) continue;
        const i=idx(tx,ty);
        if (terrain[i]!==0) continue;
        if (buildOcc[i]===1) continue;
        if (ore[i]>0) continue;
        if ((occAll[i]||0)>0) continue;
        const p = tileToWorldCenter(tx,ty);
        return { x:p.x, y:p.y };
      }
    }
  }
  // Fallback: just outside the building center
  return { x: b.x + TILE, y: b.y + TILE };
}

function spawnFreeHarvester(team, nearBuilding){
  const p = findHarvesterSpawnNearBuilding(nearBuilding);
  const u = addUnit(team, "harvester", p.x, p.y);
  // Immediately start auto-harvest (idle triggers ore search)
  u.order = {type:"idle", x:u.x, y:u.y, tx:null, ty:null};
  u.manualOre = null;
  u.returning = false;
  u.target = null;
      u.holdPos = false;
  u.path = null; u.pathI=0;
  u.repathCd = 0.10;
  return u;
}

function onBuildingPlaced(b){
  // Refinery spawns a free harvester nearby (RA2-ish).
  if (b.kind==="refinery"){
    spawnFreeHarvester(b.team, b);
  }
  // No other buildings auto-spawn units.
}

function addUnit(team, kind, x, y){
    const spec = UNIT[kind] || UNIT.infantry;
    const u = {
      type:"unit",
      id: nextId++,
      team, kind,
      cls: spec.cls || "",
      grp: 0,
      guard: null,
      guardFrom: false,
      x, y,
      subSlot: 0,
      r: spec.r,
      hp: spec.hp, hpMax: spec.hp,
      speed: spec.speed*GAME_SPEED,
      lastDamaged: -1e9,
      lastAttacker: null,
      lastAttackerTeam: null,
      lastAttackedAt: -1e9,
      aggroCd: 0,
      crippled: false,
      range: spec.range,
      dmg: spec.dmg,
      rof: spec.rof,
      hitscan: !!spec.hitscan,
      canAttack: ((spec.dmg||0)>0 && (spec.range||0)>0),
      shootCd: 0,
      alive:true,
      target:null,
      order:{ type:"idle", x, y, tx:null, ty:null },
      resTx:null, resTy:null,
      carry:0,
      carryMax: spec.carryMax || 0,
      returning:false,
      path: null, pathI:0,
      repathCd:0,
      avoidCd:0,
      lastGoalTx:null, lastGoalTy:null,
      stuckTime:0, lastPosX:x, lastPosY:y,
      manualOre:null,
      blockT:0,
      detourUntil:0,
      detourGoal:null,
      wantsBoard:null,
      repairCd:0,
      yieldCd:0,
      inTransport:null,
      hidden:false,
      selectable:true,
      dir:6,
      faceDir:6,
      bodyDir:null,
      turretDir:null,
      bodyTurn:null,
      turretTurn:null
    };

    if (kind === "tank"){
      u.bodyDir = 6;
      u.turretDir = 6;
    } else if (kind === "harvester"){
      u.bodyDir = 6;
      u.turretDir = null;
    }
    units.push(u);
    return u;
  }

  function getEntityById(id){
    for (const u of units) if (u.alive && u.id===id) return u;
    for (const b of buildings) if (b.alive && b.id===id) return b;
    return null;
  }

  function isBlockedFootprint(tx,ty,tw,th){
    // Any blocked tile inside footprint makes placement invalid.
    // Blocked if: out of bounds, existing building, impassable terrain, ore, or any unit occupying the tile.
    if (tx<0||ty<0||tx+tw>MAP_W||ty+th>MAP_H) return true;
    for (let y=ty; y<ty+th; y++){
      for (let x=tx; x<tx+tw; x++){
        if (!inMap(x,y)) return true;
        const ti = idx(x,y);
        if (buildOcc[ti]===1) return true;
        if (terrain[ti] !== 0) return true;
        if (ore[ti] > 0) return true;
        if ((occAll[ti]||0) > 0) return true; // units block placement
      }
    }
    
    // Extra safety: block if ANY unit's collision circle overlaps the footprint AABB,
    // even if its center tile is just outside (prevents "build over unit" edge cases).
    const wpos = buildingWorldFromTileOrigin(tx,ty,tw,th);
    for (const u of units){
      if (!u.alive || u.inTransport || u.hidden) continue;
      const rr = (u.r||18) + 2;
      if (dist2PointToRect(u.x,u.y, wpos.cx, wpos.cy, wpos.w, wpos.h) <= rr*rr) return true;
    }

    return false;
  }

  
  function isTooCloseToOtherBuildings(tx,ty,tw,th, gapTiles=1){
    // Enforce a small gap between buildings (AI de-clumping).
    const x0 = tx - gapTiles, y0 = ty - gapTiles;
    const x1 = tx + tw + gapTiles - 1, y1 = ty + th + gapTiles - 1;
    for (let y=y0; y<=y1; y++){
      for (let x=x0; x<=x1; x++){
        if (!inMap(x,y)) continue;
        if (buildOcc[idx(x,y)]===1) return true;
      }
    }
    return false;
  }

function footprintBlockedMask(tx,ty,tw,th){
    // Returns {blocked:boolean, mask:Uint8Array} where mask[i]=1 if the footprint tile is blocked.
    const mask = new Uint8Array(tw*th);
    let any=false;
    if (tx<0||ty<0||tx+tw>MAP_W||ty+th>MAP_H){
      mask.fill(1);
      return {blocked:true, mask};
    }
    let k=0;
    for (let y=ty; y<ty+th; y++){
      for (let x=tx; x<tx+tw; x++){
        let b=false;
        if (!inMap(x,y)) b=true;
        else{
          const ti=idx(x,y);
          if (buildOcc[ti]===1) b=true;
          else if (terrain[ti] !== 0) b=true;
          else if (ore[ti] > 0) b=true;
          else if ((occAll[ti]||0) > 0) b=true;
        }
        mask[k++] = b?1:0;
        if (b) any=true;
      }
    }
    return {blocked:any, mask};
  }


  function inBuildRadius(team, wx, wy){
  // If the side has lost its HQ, it cannot place ANY buildings until HQ is rebuilt.
    if (!buildings.some(b=>b.alive && !b.civ && b.team===team && b.kind==='hq')) return false;

    for (const b of buildings){
      if (!b.alive) continue;
      if (b.team !== team) continue;
      if (b.civ) continue;
      if ((b.provideR||0) <= 0) continue;
      const r = b.provideR;
      if (dist2(b.x,b.y,wx,wy) <= r*r) return true;
    }
    return false;
  }

  function isWalkableTile(tx,ty){
    if (!inMap(tx,ty)) return false;
    if (terrain[idx(tx,ty)]===1) return false;
    if (buildOcc[idx(tx,ty)]===1) return false;
    return true;
  }

  function isBlockedWorldPoint(u, x, y){
    // Hard block: if the destination tile is occupied by a building footprint, it's blocked.
    const tx = tileOfX(x), ty = tileOfY(y);
    if (inMap(tx,ty) && buildOcc[idx(tx,ty)]===1) return true;

    // Continuous collision against placed buildings to prevent slipping through corners
    // even if tile mapping drifts slightly.
    const ur = (UNIT[u.kind] && UNIT[u.kind].r) ? UNIT[u.kind].r : ( (UNIT[u.kind]&&UNIT[u.kind].cls==="veh") ? 12 : 8 );
    const pad = 3; // extra padding to prevent "under the roof" penetration
    for (let i=0;i<buildings.length;i++){
      const b = buildings[i];
      if (!b || b.hp<=0) continue;
      const hw = (b.w||0)/2 + ur + pad;
      const hh = (b.h||0)/2 + ur + pad;
      if (x >= b.x-hw && x <= b.x+hw && y >= b.y-hh && y <= b.y+hh) return true;
    }
    return false;
  }
// Variant with adjustable padding (used for combat goal tiles near buildings)
function isBlockedWorldPointEx(u, x, y, padExtra){
    const tx = tileOfX(x), ty = tileOfY(y);
    if (inMap(tx,ty) && buildOcc[idx(tx,ty)]===1) return true;

    const ur = (UNIT[u.kind] && UNIT[u.kind].r) ? UNIT[u.kind].r : ( (UNIT[u.kind]&&UNIT[u.kind].cls==="veh") ? 12 : 8 );
    const pad = (padExtra==null ? 3 : padExtra);
    for (let i=0;i<buildings.length;i++){
      const b = buildings[i];
      if (!b || b.hp<=0) continue;
      const hw = (b.w||0)/2 + ur + pad;
      const hh = (b.h||0)/2 + ur + pad;
      if (x >= b.x-hw && x <= b.x+hw && y >= b.y-hh && y <= b.y+hh) return true;
    }
    return false;
  }

// Enter check for combat/docking goals: relax building padding so infantry can stand close enough to shoot.
function canEnterTileGoal(u, tx, ty, t){
    if (!inMap(tx,ty)) return false;
    if (!isWalkableTile(tx,ty)) return false;
    if (isSqueezedTile(tx,ty)) return false;

    // When attacking a building, we must allow tight approach.
    // Generic collision checks (unit radius vs building rect) can reject valid near-edge tiles,
    // causing the infamous in-place jitter/dance. For building targets:
    // - forbid tiles INSIDE the building footprint
    // - otherwise skip the world-point collision check
    const isB = !!(t && BUILD[t.kind]);
    if (isB && t && t.tx!=null && t.ty!=null && t.tw!=null && t.th!=null){
      if (tx>=t.tx && tx<(t.tx+t.tw) && ty>=t.ty && ty<(t.ty+t.th)) return false;
    } else {
      const c = tileToWorldCenter(tx,ty);
      if (isBlockedWorldPoint(u, c.x, c.y)) return false;
    }

    // tile occupancy / yielding rules (same as canEnterTile)
    const i = idx(tx,ty);
// Infantry sub-slot capacity: allow up to 4 infantry per tile (same-team).
{
  const ucls = (UNIT[u.kind] && UNIT[u.kind].cls) ? UNIT[u.kind].cls : "";
  if (ucls==="inf"){
    if (occVeh[i] > 0) return false;
    if (occTeam[i]!==0 && occTeam[i]!==u.team) return false;
    if (occInf[i] >= INF_SLOT_MAX) return false;
    // do not use occId/occTeam single-occupant gate for infantry
    return true;
  }
}
    if (occTeam[i]===0) return true;
    if (occTeam[i]===u.team && occId[i]===u.id) return true;

    const otherId = occId[i];
    if (otherId!=null){
      const other = getEntityById(otherId);
      if (other && other.alive && other.type==="unit"){
        const ocls = (UNIT[other.kind] && UNIT[other.kind].cls) ? UNIT[other.kind].cls : "";
        const ucls = (UNIT[u.kind] && UNIT[u.kind].cls) ? UNIT[u.kind].cls : "";
        if (ucls==="veh" && ocls!=="veh"){
          // vehicles can push through infantry only if that infantry yields
        } else if (ucls!=="veh" && ocls==="veh"){
          if (!other.yieldCd || other.yieldCd<=0){
            other.yieldCd = 0.18;
            // nudge the infantry one step aside
            const step = findNearestFreeStep(other);
            if (step){
              setPathTo(other, (step.tx+0.5)*TILE, (step.ty+0.5)*TILE);
            }
          }
        }
      }
    }
    return (occTeam[i]===0);
  }


  const occInf = new Uint8Array(MAP_W*MAP_H);
  const occVeh = new Uint8Array(MAP_W*MAP_H);
  const occAll = new Uint8Array(MAP_W*MAP_H);
  const occTeam = new Uint8Array(MAP_W*MAP_H);
  // Store one occupant id per tile for head-on yield resolution.
  const occAnyId = new Int32Array(MAP_W*MAP_H);
  // Back-compat alias used by combat goal logic
  const occId = occAnyId;
  // Reservation grid for next-tile claims to prevent deadlocks at intersections.
  const occResId = new Int32Array(MAP_W*MAP_H);

// Infantry sub-slot system (4 infantry per tile, arranged as 4 points inside the diamond)
// We assign a stable-ish subSlot per infantry per frame based on per-tile counters (team-separated).
// This is primarily to eliminate "tile contention" jitter and to visually place infantry as 4 dots within one diamond.
const INF_SLOT_MAX = 4;
const INF_HOLD_EPS = 6.0; // px: snap-to-slot threshold to kill orbiting/jitter
// 2x2 micro-formation inside one tile (diamond grid); tuned to look like "4 in a tile".
const INF_SUBOFFS = [
  {x: -TILE*0.18, y: -TILE*0.12},
  {x:  TILE*0.18, y: -TILE*0.12},
  {x: -TILE*0.18, y:  TILE*0.12},
  {x:  TILE*0.18, y:  TILE*0.12},
];
function infSubslotWorld(tx, ty, slot){
  const cx = (tx+0.5)*TILE, cy = (ty+0.5)*TILE;
  const off = INF_SUBOFFS[(slot|0) & 3];
  return {x: cx + off.x, y: cy + off.y};
}
const infSlotNext0 = new Uint8Array(MAP_W*MAP_H);
const infSlotNext1 = new Uint8Array(MAP_W*MAP_H);
// Per-tile, per-team 4-bit mask to keep infantry sub-slots STABLE (prevents slot roulette -> orbiting).
const infSlotMask0 = new Uint8Array(MAP_W*MAP_H);
const infSlotMask1 = new Uint8Array(MAP_W*MAP_H);

// Sub-slot offsets are defined in ISO space for correct diamond placement.
const INF_SLOT_ISO = Math.round(TILE * 0.18); // tweakable
const INF_SLOT_ISO_OFF = [
  {ix: 0,              iy: -INF_SLOT_ISO}, // N
  {ix: INF_SLOT_ISO,   iy: 0},             // E
  {ix: 0,              iy: INF_SLOT_ISO},  // S
  {ix: -INF_SLOT_ISO,  iy: 0},             // W
];
function tileToWorldSubslot(tx, ty, slot){
  const c = tileToWorldCenter(tx, ty);
  const iso = worldToIso(c.x, c.y);
  const o = INF_SLOT_ISO_OFF[slot & 3];
  const w = isoToWorld(iso.x + o.ix, iso.y + o.iy);
  return w;
}
  function clearOcc(dt){
    occAll.fill(0);
    occInf.fill(0);
    occVeh.fill(0);
    occAnyId.fill(0);
    occTeam.fill(0);
    occResId.fill(0);
    infSlotNext0.fill(0);
    infSlotNext1.fill(0);
    infSlotMask0.fill(0);
    infSlotMask1.fill(0);
    // Rebuild reservations from units (kept in u.resTx/u.resTy)
    for (const u of units){
      if (!u.alive) continue;
      if (u.resTx!=null && u.resTy!=null && inMap(u.resTx,u.resTy)){
        const ri = idx(u.resTx,u.resTy);
        if ((occResId[ri]|0)===0) occResId[ri]=u.id;
      }
    }
    for (const u of units){
      if (!u.alive) continue;
      if (u.sepCd && u.sepCd>0){ u.sepCd -= dt; if (u.sepCd<=0){ u.sepCd=0; u.sepOx=0; u.sepOy=0; } }
      const tx=tileOfX(u.x), ty=tileOfY(u.y);
      if (!inMap(tx,ty)) continue;
      const i=idx(tx,ty);
      if (occAnyId[i]===0){ occAnyId[i]=u.id; occTeam[i]=u.team; }
      const cls = (UNIT[u.kind] && UNIT[u.kind].cls) ? UNIT[u.kind].cls : "";
      if (cls==="inf") {
  // Allow up to 4 infantry per tile (same-team only via canEnterTile rules)
  occInf[i] = Math.min(255, occInf[i]+1);

  // Stable per-unit sub-slot: keep the same slot while staying in the same tile.
  // This prevents "slot roulette" (subSlot changing every frame) that creates orbiting/강강술래.
  let mask = (u.team===0) ? infSlotMask0[i] : infSlotMask1[i];

  let slot = -1;
  if (u.subSlot!=null && u.subSlotTx===tx && u.subSlotTy===ty) slot = (u.subSlot & 3);

  // keep existing slot if free this frame, else pick first free slot.
  if (slot>=0 && ((mask >> slot) & 1)===0){
    // ok
  } else {
    slot = -1;
    for (let s=0; s<INF_SLOT_MAX; s++){
      if (((mask >> s) & 1)===0){ slot=s; break; }
    }
    if (slot<0) slot = 0; // fallback (should be rare)
  }

  u.subSlot = slot;
  u.subSlotTx = tx; u.subSlotTy = ty;
  mask = (mask | (1<<slot)) & 0x0F;

  if (u.team===0) infSlotMask0[i] = mask;
  else infSlotMask1[i] = mask;
}
      else if (cls==="veh") occVeh[i] = Math.min(255, occVeh[i]+1);
      occAll[i] = Math.min(255, occAll[i]+1);
}
  }
  
  function isReservedByOther(u, tx, ty){
  if (!inMap(tx,ty)) return false;
  const cls = (UNIT[u.kind] && UNIT[u.kind].cls) ? UNIT[u.kind].cls : "";
  // Infantry uses sub-slots (up to 4 per tile). Reservations cause artificial "dancing" in groups,
  // so we disable reservation blocking for infantry.
  if (cls==="inf") return false;
  const i = idx(tx,ty);
  const rid = occResId[i]|0;
  return (rid!==0 && rid!==u.id);
}
  function reserveTile(u, tx, ty){
    if (!inMap(tx,ty)) return false;
    const cls = (UNIT[u.kind] && UNIT[u.kind].cls) ? UNIT[u.kind].cls : "";
    if (cls==="inf") { u.resTx=-1; u.resTy=-1; return true; }
    const i = idx(tx,ty);
    const rid = occResId[i]|0;
    if (rid===0 || rid===u.id){
      occResId[i]=u.id;
      u.resTx = tx; u.resTy = ty; // persist reservation across frames (rebuilt in clearOcc)
      return true;
    }
    return false;
  }
  function clearReservation(u){
    u.resTx = null; u.resTy = null;
  }

  const MAX_INF_PER_TILE = 1;
  const MAX_VEH_PER_TILE = 1;
  
  function isSqueezedTile(tx, ty){
    // Returns true if this tile is a "too-narrow" gap between building footprints or inside a building corner.
    // This prevents units from selecting waypoints that are geometrically impossible (causes corner-bounce).
    const B = (x,y)=> (inMap(x,y) && buildOcc[idx(x,y)]===1);
    // 1-tile corridor between two building tiles
    if (B(tx-1,ty) && B(tx+1,ty)) return true;
    if (B(tx,ty-1) && B(tx,ty+1)) return true;
    // inside corners (diagonal squeeze)
    if (B(tx-1,ty) && B(tx,ty-1)) return true;
    if (B(tx+1,ty) && B(tx,ty-1)) return true;
    if (B(tx-1,ty) && B(tx,ty+1)) return true;
    if (B(tx+1,ty) && B(tx,ty+1)) return true;
    return false;
  }


  // Find a nearby free tile for a short "yield" step (used when infantry yields to vehicles).
  // Returns {tx,ty} or null.
  function findNearestFreeStep(u){
    if (!u) return null;
    const s = snapWorldToTileCenter(u.x, u.y);
    const baseTx = s.tx, baseTy = s.ty;

    // Search a few rings around the unit. Keep it small/cheap.
    for (let r=1; r<=4; r++){
      let best = null;
      let bestD = 1e9;

      for (let dy=-r; dy<=r; dy++){
        for (let dx=-r; dx<=r; dx++){
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          const tx = baseTx + dx;
          const ty = baseTy + dy;
          if (!inMap(tx,ty)) continue;
          if (!isWalkableTile(tx,ty)) continue;
          if (isSqueezedTile(tx,ty)) continue;

          const i = idx(tx,ty);
          if (occAll[i] !== 0) continue;              // don't step onto occupied tiles
          if (isReservedByOther(u, tx, ty)) continue; // avoid reserved tiles

          // Keep the step away from building padding for this unit (prevents corner-bounce).
          const c = tileToWorldCenter(tx,ty);
          if (isBlockedWorldPoint(u, c.x, c.y)) continue;

          const d = dx*dx + dy*dy;
          if (d < bestD){
            bestD = d;
            best = {tx, ty};
          }
        }
      }
      if (best) return best;
    }
    return null;
  }


function canEnterTile(u, tx, ty){
    if (!inMap(tx,ty)) return false;
    if (!isWalkableTile(tx,ty)) return false;
    if (isSqueezedTile(tx,ty)) return false;
    // Reject tiles whose center is too close to a building footprint for this unit.
    // This prevents "bouncing" when a waypoint lands in a 1-tile gap between buildings.
    {
      const c = tileToWorldCenter(tx,ty);
      if (isBlockedWorldPoint(u, c.x, c.y)) return false;
    }
    // Harvesters have priority (others yield), but we still prevent stacking.
    if (u.kind==="harvester"){
      const i = idx(tx,ty);
      if (isReservedByOther(u, tx, ty)) return false;
      return occAll[i] < 1;
    }
    if (isReservedByOther(u, tx, ty)) return false;
    const i = idx(tx,ty);
    const cls = (UNIT[u.kind] && UNIT[u.kind].cls) ? UNIT[u.kind].cls : "";
    if (cls==="veh") return occAll[i] < 1;
    if (cls==="inf") {
      if (occVeh[i] > 0) return false;
      if (occTeam[i]!==0 && occTeam[i]!==u.team) return false;
      return occInf[i] < INF_SLOT_MAX;
    }
    return occAll[i] < 2;
  }

  function findNearestFreePoint(wx, wy, u, r=3){
    const cx=tileOfX(wx), cy=tileOfY(wy);
    let bestX=wx, bestY=wy, bestD=1e18, found=false;
    for (let dy=-r; dy<=r; dy++){
      for (let dx=-r; dx<=r; dx++){
        const tx=cx+dx, ty=cy+dy;
        if (!isWalkableTile(tx,ty)) continue;
        // allow staying on current tile
        const curTx=tileOfX(u.x), curTy=tileOfY(u.y);
        if (!(tx===curTx && ty===curTy) && !canEnterTile(u,tx,ty)) continue;
        const pTile=tileToWorldCenter(tx,ty);
              const px=pTile.x, py=pTile.y;
        const dd=dist2(wx,wy,px,py);
        if (dd<bestD){ bestD=dd; bestX=px; bestY=py; found=true; }
      }
    }
    return {x:bestX,y:bestY,found};
  }

function heuristic(ax,ay,bx,by){
    const dx=Math.abs(ax-bx), dy=Math.abs(ay-by);
    const D=10, D2=14;
    return D*(dx+dy) + (D2-2*D)*Math.min(dx,dy);
  }

  
// [moved] aStarPath -> movement.js
function aStarPath(...args){ return Movement.aStarPath(...args); }


  // Occupancy-aware A* for unit movement: treats other friendly units' occupied/reserved tiles as blocked.
  // This prevents infantry "강행돌파" into occupied tiles and reduces vehicle oscillation at chokepoints.
  function aStarPathOcc(u, sx, sy, gx, gy){
    if (!inMap(sx,sy) || !inMap(gx,gy)) return null;
    const W=MAP_W, H=MAP_H, N=W*H;
    const s=sy*W+sx, g=gy*W+gx;
    if (s===g) return [{tx:sx, ty:sy}];

    const open = new Int32Array(N);
    const inOpen = new Uint8Array(N);
    const closed = new Uint8Array(N);
    const came = new Int32Array(N);
    const gScore = new Float32Array(N);
    const fScore = new Float32Array(N);
    for (let i=0;i<N;i++){ came[i]=-1; gScore[i]=1e9; fScore[i]=1e9; }

    function heuristic(x,y, tx,ty){ return Math.abs(x-tx)+Math.abs(y-ty); }

    open[0]=s; inOpen[s]=1;
    gScore[s]=0; fScore[s]=heuristic(sx,sy,gx,gy);
    let openN=1;

    const dirs = [
      [1,0,1],[-1,0,1],[0,1,1],[0,-1,1],
      [1,1,1.42],[1,-1,1.42],[-1,1,1.42],[-1,-1,1.42],
    ];

    while (openN>0){
      // pop best fScore
      let bestI=0, best=open[0], bestF=fScore[best];
      for (let i=1;i<openN;i++){
        const n=open[i];
        const f=fScore[n];
        if (f<bestF){ bestF=f; best=n; bestI=i; }
      }
      openN--;
      open[bestI]=open[openN];
      inOpen[best]=0;

      const cx=best%W, cy=(best/W)|0;
      if (best===g) break;
      closed[best]=1;

      for (let di=0;di<dirs.length;di++){
        const nx=cx+dirs[di][0], ny=cy+dirs[di][1];
        if (!inMap(nx,ny)) continue;
        
        // Prevent "corner cutting" when moving diagonally past blocked tiles.
        if (dirs[di][0]!==0 && dirs[di][1]!==0){
          if (!isWalkableTile(cx+dirs[di][0], cy) || !isWalkableTile(cx, cy+dirs[di][1])) continue;
        }
const ni=ny*W+nx;
        if (closed[ni]) continue;
        if (!isWalkableTile(nx,ny)) continue;

        // Occupancy and reservation as obstacles (except allow current tile and goal tile).
        if (!(nx===sx && ny===sy) && !(nx===gx && ny===gy)){
          if (!canEnterTile(u, nx, ny)) continue;
          if (isReservedByOther(u, nx, ny)) continue;
        }

        const cost=dirs[di][2];
        const tent=gScore[best]+cost;
        if (tent < gScore[ni]){
          came[ni]=best;
          gScore[ni]=tent;
          fScore[ni]=tent + heuristic(nx,ny,gx,gy);
          if (!inOpen[ni]){
            open[openN++]=ni;
            inOpen[ni]=1;
            if (openN>=N-4) break;
          }
        }
      }
    }

    if (came[g]===-1 && g!==s) return null;

    const path=[];
    let cur=g;
    path.push(cur);
    while (cur!==s){
      cur=came[cur];
      if (cur===-1) break;
      path.push(cur);
    }
    path.reverse();

    const out=[];
    let last=-1;
    for (let i=0;i<path.length;i++){
      const n=path[i];
      if (n===last) continue;
      last=n;
      out.push({tx:n%W, ty:(n/W)|0});
    }
    return out;
  }


  // Alias expected by sanityCheck
  
// [moved] findPath -> movement.js
function findPath(...args){ return Movement.findPath(...args); }


  function setPathTo(u, goalX, goalY){
    // Temporary separation offset to reduce clump jitter
    if (u.sepCd && u.sepCd>0){ goalX += (u.sepOx||0); goalY += (u.sepOy||0); }
    const sTx=tileOfX(u.x), sTy=tileOfY(u.y);
    let gTx=tileOfX(goalX), gTy=tileOfY(goalY);

    if (!isWalkableTile(gTx,gTy)){
      let found=false;
      for (let r=1;r<=4 && !found;r++){
        for (let dy=-r;dy<=r && !found;dy++){
          for (let dx=-r;dx<=r && !found;dx++){
            const tx=gTx+dx, ty=gTy+dy;
            if (!inMap(tx,ty)) continue;
            if (isWalkableTile(tx,ty)){ gTx=tx; gTy=ty; found=true; }
          }
        }
      }
      if (!found) return false;
    }


    // If the goal tile is crowded, we only "snap" to a nearby free tile for non-combat move orders.
    // For combat orders we intentionally keep the goal stable and allow compression; otherwise backliners can "dance".
    const _combatOrder = (u && u.order && (u.order.type==="attack" || u.order.type==="attackmove"));
    if (true){
      if (!canEnterTile(u, gTx, gTy)){
        let best=null, bestD=1e9;
        for (let r=1;r<=6;r++){
          for (let dy=-r;dy<=r;dy++){
            for (let dx=-r;dx<=r;dx++){
              const tx=gTx+dx, ty=gTy+dy;
              if (!inMap(tx,ty)) continue;
              if (!isWalkableTile(tx,ty)) continue;
              if (!canEnterTile(u, tx, ty)) continue;
              const d = dx*dx+dy*dy;
              if (d<bestD){ bestD=d; best={tx,ty}; }
            }
          }
          if (best) break;
        }
        if (best){ gTx=best.tx; gTy=best.ty; }
      }
    }
// Persist intended goal tile for repath/anti-jitter decisions.
    u.order = u.order || {type:"move"};
    u.order.tx = gTx; u.order.ty = gTy;
    u.order.x = (gTx+0.5)*TILE; u.order.y = (gTy+0.5)*TILE;
    const path=aStarPathOcc(u, sTx, sTy, gTx, gTy);
    u.path=path;
    u.pathI=0;
    // Avoid the classic 'backstep' when a new order is issued.
    // If the path begins with our current tile, skip it so we immediately head toward the next tile
    // instead of re-centering on the current tile first.
    u.holdPos = false;
    if (u.path && u.path.length>1){
      const p0 = u.path[0];
      if (p0 && p0.tx===sTx && p0.ty===sTy) u.pathI = 1;
    }
    u.lastGoalTx=gTx; u.lastGoalTy=gTy;
    return !!path;
  }

  
  function findBypassStep(u, fromTx, fromTy, toTx, toTy){
    // Try a short sidestep when the next tile is temporarily blocked by other units.
    // We prefer tiles that are walkable, have capacity, and still move us generally toward the target.
    const goal = (u.path && u.path.length) ? u.path[u.path.length-1] : {tx:toTx, ty:toTy};
    const dirs = [
      [1,0],[-1,0],[0,1],[0,-1],
      [1,1],[1,-1],[-1,1],[-1,-1],
    ];
    let best=null, bestScore=1e9;
    for (let i=0;i<dirs.length;i++){
      const tx = fromTx + dirs[i][0];
      const ty = fromTy + dirs[i][1];
      if (tx===toTx && ty===toTy) continue;
      if (!isWalkableTile(tx,ty)) continue;
      if (!canEnterTile(u, tx, ty)) continue;
      const d1 = Math.hypot((tx-toTx),(ty-toTy));
      const d2 = Math.hypot((tx-goal.tx),(ty-goal.ty));
      // Tie-break bias to prevent left-right "wiggle" when units are queued in a line.
      u._bypassBias = (u._bypassBias!=null) ? u._bypassBias : ((u.id%2) ? 1 : -1);
      const dirX = dirs[i][0];
      const bias = (dirX===u._bypassBias ? -0.020 : (dirX===-u._bypassBias ? 0.020 : 0));
      const score = d1 + d2*0.35 + (i>=4?0.05:0) + bias;
      if (score < bestScore){ bestScore=score; best={tx,ty}; }
    }
    return best;
  }


  function getMoveSpeed(u){
    let s = u.speed;
    if (u.kind==="tank"){
      const hpPct = u.hpMax>0 ? (u.hp/u.hpMax) : 1;
      if (u.crippled){
        if (hpPct>=0.50) u.crippled=false;
      } else {
        if (hpPct<=0.30) u.crippled=true;
      }
      if (u.crippled) s = Math.max(0, s*0.75);
    }
    // Ore slow: tanks (except harvester) are slowed while traversing ore until they exit it.
    if (u.kind==="tank" && u.kind!=="harvester"){
      const tx=tileOfX(u.x), ty=tileOfY(u.y);
      const onOre = (inMap(tx,ty) && ore[idx(tx,ty)]>0);
      if (onOre && (u.order?.type && u.order.type!=="idle")) u.oreSlowed = true;
      if (u.oreSlowed && !onOre) u.oreSlowed = false;
      if (u.oreSlowed) s = s*0.70;
    }
    return s;
  }


  // Infantry settle: when multiple infantry share a tile and a unit has "arrived",
  // keep it glued to its sub-slot to prevent post-arrival vibration.
  function settleInfantryToSubslot(u, dt){
    const cls = (UNIT[u.kind] && UNIT[u.kind].cls) ? UNIT[u.kind].cls : "";
    if (cls!=="inf") return;
    if (!u.alive || u.inTransport) return;
    if (u.target!=null) return;
    const ot = u.order && u.order.type;
    if (ot!=="idle" && ot!=="guard") return;

    const tx = tileOfX(u.x), ty = tileOfY(u.y);
    if (!inMap(tx,ty)) return;

    // Ensure we have a valid subSlot assigned (filled in clearOcc()).
    const ss = (u.subSlot==null) ? 0 : (u.subSlot & 3);
    const sp = tileToWorldSubslot(tx, ty, ss);

    // Critically-damped snap (no overshoot).
    const dx = sp.x - u.x, dy = sp.y - u.y;
    const d2 = dx*dx + dy*dy;
    if (d2 < 0.25){
      u.x = sp.x; u.y = sp.y;
      u.vx = 0; u.vy = 0;
      u.holdPos = true;
      return;
    }

    // Move at a capped rate so we don't introduce new jitter.
    const d = Math.sqrt(d2);
    const maxStep = 120 * dt; // px/s
    const step = Math.min(maxStep, d);
    const nx = dx / (d||1), ny = dy / (d||1);
    u.x += nx * step;
    u.y += ny * step;

    // Kill residual drift
    u.vx = 0; u.vy = 0;
    u.holdPos = true;
  }

// [moved] followPath -> movement.js
function followPath(...args){ return Movement.followPath(...args); }
RClick(btnPow, "main", "power");
  attachLaneRClick(btnRef, "main", "refinery");
  attachLaneRClick(btnBar, "main", "barracks");
  attachLaneRClick(btnFac, "main", "factory");
  attachLaneRClick(btnRad, "main", "radar");
  attachLaneRClick(btnTur, "def", "turret");
  if (btnCan) btnCan.onclick = ()=>cancelBuild();
  if (btnToHQ) btnToHQ.onclick = ()=>goToHQ();
  if (btnSell) btnSell.onclick = ()=>sellSelectedBuildings();

  btnInf.onclick=()=>queueUnit("infantry");
  btnEng.onclick=()=>queueUnit("engineer");
  btnSnp.onclick=()=>queueUnit("sniper");
  btnTnk.onclick=()=>queueUnit("tank");
  btnHar.onclick=()=>queueUnit("harvester");
  btnIFV.onclick=()=>queueUnit("ifv");

  // Unit production right-click: 1st = pause(대기), 2nd (while paused) = cancel + refund spent.
  function attachUnitRClick(btn, kind){
    if (!btn) return;
    btn.addEventListener("contextmenu", (ev)=>{
      ev.preventDefault();
      const need = kindToProducer(kind);

      // 1) If this kind is currently being built at the front of some producer queue:
      //    - first right click: pause
      //    - second right click (while paused): cancel + refund paid
      let pb=null; let q=null;
      for (const b of buildings){
        if (!b.alive || b.civ || b.team!==TEAM.PLAYER || b.kind!==need) continue;
        const qq=b.buildQ && b.buildQ[0];
        if (qq && qq.kind===kind){ pb=b; q=qq; break; }
      }

      if (pb && q){
        if (!q.paused){
          q.paused = true;
          q.autoPaused = false;
          toast("대기");
          return;
        }
        const paid = q.paid || 0;
        state.player.money += paid;
        pb.buildQ.shift();
        prodTotal[kind] = Math.max(0, (prodTotal[kind]||0)-1);
        updateProdBadges();
        toast("취소 + 환불");
        return;
      }

      // 2) If it's queued in a producer buildQ but NOT at the front (i.e., reserved for later),
      // cancel the last one of this kind.
      for (const b of buildings){
        if (!b.alive || b.civ || b.team!==TEAM.PLAYER || b.kind!==need) continue;
        const ql = b.buildQ || [];
        for (let i=ql.length-1; i>=1; i--){ // skip index 0 (handled above)
          if (ql[i] && ql[i].kind===kind){
            const paid = ql[i].paid || 0;
            if (paid>0) state.player.money += paid;
            ql.splice(i,1);
            prodTotal[kind] = Math.max(0, (prodTotal[kind]||0)-1);
            updateProdBadges();
            toast("예약 취소");
            return;
          }
        }
      }

      // 3) Otherwise: cancel ONE queued reservation of this kind from the global FIFO (not yet started, so no refund needed).
      const fifo = prodFIFO[need];
      if (!fifo || !fifo.length) return;
      for (let i=fifo.length-1; i>=0; i--){
        if (fifo[i].kind===kind){
          fifo.splice(i,1);
          prodTotal[kind] = Math.max(0, (prodTotal[kind]||0)-1);
          updateProdBadges();
          toast("예약 취소");
          return;
        }
      }
    });
  }
  attachUnitRClick(btnInf, "infantry");
  attachUnitRClick(btnEng, "engineer");
  attachUnitRClick(btnSnp, "sniper");
  attachUnitRClick(btnTnk, "tank");
  attachUnitRClick(btnHar, "harvester");
  attachUnitRClick(btnIFV, "ifv");
  if (btnCancelSel) btnCancelSel.onclick = ()=>{ state.selection.clear(); updateSelectionUI(); };
  if (btnRepair) btnRepair.onclick = ()=>toggleRepair();
  if (btnStop) btnStop.onclick = ()=>stopUnits();
  if (btnScatter) btnScatter.onclick = ()=>scatterUnits();
  
  // Duplicate command buttons in VEH panel
  if (btnRepair2) btnRepair2.onclick = ()=>toggleRepair();
  if (btnStop2) btnStop2.onclick = ()=>stopUnits();
  if (btnScatter2) btnScatter2.onclick = ()=>scatterUnits();

  
  // Repair/Sell cursor modes (RA2 style)
  const btnRepairMode = $("btnRepairMode");
  const btnSellMode   = $("btnSellMode");

  function applyMouseMode(mode){
    state.mouseMode = mode;
    document.body.classList.toggle("cursor-repair", mode==="repair");
    document.body.classList.toggle("cursor-sell",   mode==="sell");
    if (btnRepairMode) btnRepairMode.classList.toggle("on", mode==="repair");
    if (btnSellMode)   btnSellMode.classList.toggle("on", mode==="sell");
  }

  if (btnRepairMode){
    btnRepairMode.onclick = ()=>{
      applyMouseMode(state.mouseMode==="repair" ? "normal" : "repair");
      toast(state.mouseMode==="repair" ? "수리 모드" : "수리 해제");
    };
  }
  if (btnSellMode){
    btnSellMode.onclick = ()=>{
      applyMouseMode(state.mouseMode==="sell" ? "normal" : "sell");
      toast(state.mouseMode==="sell" ? "매각 모드" : "매각 해제");
    };
  }


  // Production category tabs
  const tabBtns = Array.from(document.querySelectorAll(".tabbtn"));
  const panels = {
    main: $("panelMain"),
    def: $("panelDef"),
    inf: $("panelInf"),
    veh: $("panelVeh"),
  };
  let prodCat = "main";
  function setProdCat(cat){
    prodCat = cat;
    for (const b of tabBtns) b.classList.toggle("on", b.dataset.cat===cat);
    for (const [k,p] of Object.entries(panels)){
      if (!p) continue;
      p.style.display = (k===cat) ? "" : "none";
    }
  }
  for (const b of tabBtns){
    b.addEventListener("click", ()=>setProdCat(b.dataset.cat));
  }
  setProdCat("main");
if (btnSelAllKind) btnSelAllKind.onclick = ()=>selectAllUnitsScreenThenMap();

  function toggleRepair(){
    for (const id of state.selection){
      const b=getEntityById(id);
      if (b && b.alive && b.team===TEAM.PLAYER && BUILD[b.kind] && !b.civ){
        b.repairOn = !b.repairOn;
      }
    }
    updateSelectionUI();
  }

  function sellSelectedBuildings(){
    for (const id of [...state.selection]){
      const b=getEntityById(id);
      if (b && b.alive && BUILD[b.kind] && b.team===TEAM.PLAYER && !b.civ){
        sellBuilding(b);
      }
    }
    updateSelectionUI();
  }

  function stopUnits(){
    for (const id of state.selection){
      const e=getEntityById(id);
      if (!e || !e.alive || e.team!==TEAM.PLAYER) continue;

      // Units: clear orders/paths/targets.
      if (!BUILD[e.kind]){
        e.order={type:"idle", x:e.x,y:e.y, tx:null,ty:null};
        clearReservation(e);
        e.target=null;
        e.path=null; e.pathI=0;
        e.forceFire=null;
      } else {
        // Buildings (notably turrets): stop any force-fire / target locks.
        if (e.kind==="turret"){
          e.forceFire=null;
          e.target=null;
          e.shootCd = Math.max(e.shootCd||0, 0); // keep cooldown sane
        }
      }
    }
  }

  function scatterUnits(){
    const list=[...state.selection].map(getEntityById)
      .filter(e=>e && e.alive && e.team===TEAM.PLAYER && !BUILD[e.kind] && e.kind!=="harvester");
    if (!list.length) return;
    const c=list.reduce((a,e)=>({x:a.x+e.x,y:a.y+e.y}),{x:0,y:0});
    c.x/=list.length; c.y/=list.length;
    for (let i=0;i<list.length;i++){
      const e=list[i];
      const ang=(i/list.length)*Math.PI*2 + (Math.random()-0.5)*0.6;
      const rad=110 + Math.random()*90;
      const gx=c.x+Math.cos(ang)*rad, gy=c.y+Math.sin(ang)*rad;
      const p=findNearestFreePoint(gx,gy,e,6);
      e.order={type:"move", x:p.x, y:p.y, tx:null,ty:null};
      e.restX=null; e.restY=null;
      e.target=null;
      setPathTo(e,p.x,p.y);
      e.repathCd=0.18;
      // Add a short separation burst to kick units out of overlaps.
      e.sepCd=0.35;
      e.sepOx=(Math.cos(ang)*18);
      e.sepOy=(Math.sin(ang)*18);
    }
  }

  function snapHoverToTileOrigin(kind){
    const spec=BUILD[kind];
    let tx=(state.hover.wx/TILE)|0;
    let ty=(state.hover.wy/TILE)|0;
    tx = clamp(tx, 0, MAP_W-spec.tw);
    ty = clamp(ty, 0, MAP_H-spec.th);
    return {tx,ty};
  }

  function tryPlaceBuild(){
    const kind=state.build.kind;
    if (!kind) return;

    // Placement phase: cost is already paid during BUILD, so no upfront deduction here.
    const spec=BUILD[kind];
    const s = snapHoverToTileOrigin(kind);
    const tx=s.tx, ty=s.ty;

    const wpos=buildingWorldFromTileOrigin(tx,ty,spec.tw,spec.th);

    if (!inBuildRadius(TEAM.PLAYER, wpos.cx, wpos.cy)) return;
    if (isBlockedFootprint(tx,ty,spec.tw,spec.th)) return;

    addBuilding(TEAM.PLAYER, kind, tx,ty);

    // consume READY item (lane-based)
    if (state.build.lane){
      const lane = state.buildLane[state.build.lane];
      if (lane && lane.ready === kind) lane.ready = null;
    }

    // exit placement (no refund)
    state.build.active = false;
    state.build.kind = null;
    state.build.lane = null;
    state.suppressClickUntil = state.t + 0.12;
}

  function updateSelectionUI(){
    uiSelCount.textContent=String(state.selection.size);

    const pp=state.player.powerProd, pu=state.player.powerUse;
    const ok=pp>=pu;
    uiPower.textContent = `${pp} / ${pu}` + (ok ? "" : " (부족)");
    uiPower.className = "pill " + (ok ? "ok" : "danger");

    const radar = hasRadarAlive(TEAM.PLAYER);
    uiRadarStat.textContent = radar ? "ON" : "없음";
    uiRadarStat.className = "pill " + (radar ? "ok" : "danger");
    uiMmHint.textContent = radar ? "표시중" : "레이더 필요";
    uiMmHint.className = "pill " + (radar ? "ok" : "danger");
    // Keep button labels stable (do not overwrite textContent or badges will be removed).
    // Prices are shown via tooltip (title).
    btnInf.title = `보병  $${COST.infantry}`;
    btnEng.title = `엔지니어  $${COST.engineer}`;
    btnSnp.title = `저격병  $${COST.sniper}`;
    btnTnk.title = `탱크  $${COST.tank}`;
    btnHar.title = `굴착기  $${COST.harvester}`;
    btnIFV.title = `IFV  $${COST.ifv}`;
    const hasBar = buildings.some(b=>b.alive && !b.civ && b.team===TEAM.PLAYER && b.kind==="barracks");
    const hasFac = buildings.some(b=>b.alive && !b.civ && b.team===TEAM.PLAYER && b.kind==="factory");

    btnInf.disabled = !hasBar || state.player.money < COST.infantry || prodTotal.infantry>=QCAP;
    btnEng.disabled = !hasBar || state.player.money < COST.engineer || prodTotal.engineer>=QCAP;
    btnTnk.disabled = !hasFac || state.player.money < COST.tank || prodTotal.tank>=QCAP;

    const lines=[];
    for (const id of state.selection){
      const e=getEntityById(id);
      if (!e) continue;
      if (BUILD[e.kind]){
        if (e.hideUI) continue;
        lines.push(`[건물] ${NAME_KO[e.kind]||e.kind} (${e.tw}x${e.th}) HP ${Math.ceil(e.hp)}/${e.hpMax} repair:${e.repairOn?"ON":"OFF"} q:${e.buildQ.length}`);
      } else {
        const extra = (e.kind==="harvester") ? ` carry:${Math.floor(e.carry)}/${e.carryMax} (입금:정제소만)`
                    : (e.kind==="engineer") ? ` (점령)` : "";
        lines.push(`[유닛] ${NAME_KO[e.kind]||e.kind} HP ${Math.ceil(e.hp)}/${e.hpMax}${extra}`);
      }
    }
    uiSelInfo.textContent = lines.length ? lines.slice(0,12).join("\n") : "아무것도 선택 안 됨";
  }

  function drawIsoTile(tx,ty,type){
    const c=tileToWorldCenter(tx,ty);
    const wx=c.x, wy=c.y;
    const p=worldToScreen(wx,wy);
    const x=p.x, y=p.y;

    ctx.beginPath();
    const ox=ISO_X*cam.zoom, oy=ISO_Y*cam.zoom;

    ctx.moveTo(x, y-oy);
    ctx.lineTo(x+ox, y);
    ctx.lineTo(x, y+oy);
    ctx.lineTo(x-ox, y);
    ctx.closePath();

    ctx.fillStyle = (type===1) ? "#101621" : "#0c121a";
    ctx.fill();

    if (ore[idx(tx,ty)]>0){
      const a=clamp(ore[idx(tx,ty)]/520,0,1);
      ctx.fillStyle=`rgba(255,215,0,${0.10+0.28*a})`;
      ctx.fill();
    }

    ctx.strokeStyle="rgba(255,255,255,0.035)";
    ctx.stroke();
  }

  function drawFootprintDiamond(b, fill, stroke){
    const tx0=b.tx, ty0=b.ty, tx1=b.tx+b.tw, ty1=b.ty+b.th;
    // Footprint diamond aligned to tile grid intersections (matches drawIsoTile / buildOcc).
    const c0=worldToScreen(tx0*TILE, ty0*TILE);
    const c1=worldToScreen(tx1*TILE, ty0*TILE);
    const c2=worldToScreen(tx1*TILE, ty1*TILE);
    const c3=worldToScreen(tx0*TILE, ty1*TILE);


    ctx.beginPath();
    ctx.moveTo(c0.x,c0.y);
    ctx.lineTo(c1.x,c1.y);
    ctx.lineTo(c2.x,c2.y);
    ctx.lineTo(c3.x,c3.y);
    ctx.closePath();

    ctx.fillStyle=fill;
    ctx.strokeStyle=stroke;
    ctx.lineWidth=2;
    ctx.fill();
    ctx.stroke();
  }

  // 3D-ish prism building render (simple isometric extrusion)
  function drawFootprintPrism(b, fill, stroke){
    // Base is the building footprint sitting ON the ground (tile plane).
    // We extrude UP (screen -y) to avoid the "floating / sunk" look.
    const tx0=b.tx, ty0=b.ty, tx1=b.tx+b.tw, ty1=b.ty+b.th;

    const p0=worldToScreen(tx0*TILE, ty0*TILE);
    const p1=worldToScreen(tx1*TILE, ty0*TILE);
    const p2=worldToScreen(tx1*TILE, ty1*TILE);
    const p3=worldToScreen(tx0*TILE, ty1*TILE);

    // Height must remain visually consistent across camera zoom.
// We use discrete "height levels" per building kind:
// 0 = flat on ground, 1 = low, 2 = medium (C&C-ish requested).
const level = (BUILD[b.kind] && typeof BUILD[b.kind].hLevel === "number") ? BUILD[b.kind].hLevel : 2;
const unitH = 34 * cam.zoom;
const h = Math.max(0, level) * unitH;

    const t0={x:p0.x, y:p0.y-h};
    const t1={x:p1.x, y:p1.y-h};
    const t2={x:p2.x, y:p2.y-h};
    const t3={x:p3.x, y:p3.y-h};

    // Base (ground contact) : make it solid so it reads as "anchored"
    ctx.save();
    ctx.globalAlpha = 0.85;
    ctx.beginPath();
    ctx.moveTo(p0.x,p0.y);
    ctx.lineTo(p1.x,p1.y);
    ctx.lineTo(p2.x,p2.y);
    ctx.lineTo(p3.x,p3.y);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.restore();

    // Side faces
    ctx.save();
    ctx.fillStyle = fill;

    // right face (p1-p2 to t2-t1)
    ctx.globalAlpha = 0.45;
    ctx.beginPath();
    ctx.moveTo(p1.x,p1.y);
    ctx.lineTo(p2.x,p2.y);
    ctx.lineTo(t2.x,t2.y);
    ctx.lineTo(t1.x,t1.y);
    ctx.closePath();
    ctx.fill();

    // front/bottom face (p2-p3 to t3-t2)
    ctx.globalAlpha = 0.42;
    ctx.beginPath();
    ctx.moveTo(p2.x,p2.y);
    ctx.lineTo(p3.x,p3.y);
    ctx.lineTo(t3.x,t3.y);
    ctx.lineTo(t2.x,t2.y);
    ctx.closePath();
    ctx.fill();

    ctx.restore();

    // Roof (top face) - same tone as requested
    ctx.beginPath();
    ctx.moveTo(t0.x,t0.y);
    ctx.lineTo(t1.x,t1.y);
    ctx.lineTo(t2.x,t2.y);
    ctx.lineTo(t3.x,t3.y);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 2;
    ctx.fill();
    ctx.stroke();

    // Vertical edges + base outline for readability
    ctx.save();
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(p0.x,p0.y); ctx.lineTo(t0.x,t0.y);
    ctx.moveTo(p1.x,p1.y); ctx.lineTo(t1.x,t1.y);
    ctx.moveTo(p2.x,p2.y); ctx.lineTo(t2.x,t2.y);
    ctx.moveTo(p3.x,p3.y); ctx.lineTo(t3.x,t3.y);
    ctx.stroke();

    ctx.globalAlpha = 0.9;
    ctx.beginPath();
    ctx.moveTo(p0.x,p0.y);
    ctx.lineTo(p1.x,p1.y);
    ctx.lineTo(p2.x,p2.y);
    ctx.lineTo(p3.x,p3.y);
    ctx.closePath();
    ctx.stroke();
    ctx.restore();
  }


function drawFootprintTiles(tx, ty, tw, th, mask, okFill, badFill, okStroke, badStroke){
  // Per-tile footprint overlay: green tiles where buildable, red tiles where blocked.
  let k=0;
  for (let y=0; y<th; y++){
    for (let x=0; x<tw; x++){
      const ttx=tx+x, tty=ty+y;
      const blocked = mask ? (mask[k]===1) : false;
      k++;
      const p=worldToScreen((ttx+0.5)*TILE, (tty+0.5)*TILE);
      ctx.beginPath();
      ctx.moveTo(p.x, p.y-ISO_Y);
      ctx.lineTo(p.x+ISO_X, p.y);
      ctx.lineTo(p.x, p.y+ISO_Y);
      ctx.lineTo(p.x-ISO_X, p.y);
      ctx.closePath();
      ctx.fillStyle = blocked ? badFill : okFill;
      ctx.strokeStyle = blocked ? badStroke : okStroke;
      ctx.lineWidth = 2;
      ctx.fill();
      ctx.stroke();
    }
  }
}

  
  function drawRangeEllipseWorld(cx, cy, range, color, ringOpt=null){
    // draw an isometric-looking ellipse for a world-space circle range
    const p0 = worldToScreen(cx, cy);
    const px = worldToScreen(cx + range, cy);
    const py = worldToScreen(cx, cy + range);

    const rx = Math.abs(px.x - p0.x);
    const ry = Math.abs(py.y - p0.y);

    const fillA = ringOpt?.alphaFill ?? 0.08;
    const strokeA = ringOpt?.alphaStroke ?? 0.75;
    const strokeW = ringOpt?.strokeW ?? 3.0;

    ctx.save();
    ctx.beginPath();
    ctx.ellipse(p0.x, p0.y, rx, ry, 0, 0, Math.PI*2);

    ctx.fillStyle = rgbaFrom(color, fillA);
    ctx.strokeStyle = rgbaFrom(color, strokeA);
    ctx.lineWidth = strokeW;
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  
  // ===== Unit selection ring & segmented HP blocks (v139n) =====
  function drawSelectionEllipseAt(ent){
    // Draw a tilted ellipse on the ground at the unit's foot position (world-space).
    // Color: player=green, enemy=red
    const col = (ent.team===TEAM.PLAYER) ? "#28ff6a" : "#ff2a2a";
    const ringOpt = { alphaFill: 0.0, alphaStroke: 0.95, strokeW: 3.0 };
    // Range in world units: tweak to visually fit under infantry & vehicles.
    const base = (ent.kind==="infantry" || ent.kind==="engineer" || ent.kind==="sniper") ? TILE*0.26 : TILE*0.34;
    drawRangeEllipseWorld(ent.x, ent.y, base, col, ringOpt);
  }

  function drawHpBlocksAtScreen(px, py, blocks, ratio){
    // Draw C&C-ish small rectangular blocks (filled count = ceil(blocks*ratio))
    const z = (typeof cam !== "undefined" && cam && typeof cam.zoom==="number") ? cam.zoom : 1;
    const w = 10 * z;
    const h = 8 * z;
    const gap = 3 * z;

    const filled = Math.max(0, Math.min(blocks, Math.round(blocks * ratio)));
    const totalW = blocks*w + (blocks-1)*gap;

    const x0 = px - totalW/2;
    const y0 = py;

    ctx.save();
    // Background blocks
    ctx.fillStyle = "rgba(0,0,0,0.45)";
    for (let i=0;i<blocks;i++){
      const x = x0 + i*(w+gap);
      ctx.fillRect(x, y0, w, h);
    }
    // Filled (green)
    const fillColor = (ratio < 0.20) ? "rgba(255,70,60,0.95)"
                    : (ratio < 0.50) ? "rgba(255,220,70,0.95)"
                    : "rgba(40,255,90,0.95)";
    ctx.fillStyle = fillColor;
    for (let i=0;i<filled;i++){
      const x = x0 + i*(w+gap);
      ctx.fillRect(x, y0, w, h);
    }
    ctx.restore();
  }

  function drawUnitHpBlocks(ent, p){
    // Infantry: 5 blocks. Tanks/IFV/Harvester: 10 blocks.
    const isInf = (ent.kind==="infantry" || ent.kind==="engineer" || ent.kind==="sniper");
    const blocks = isInf ? 5 : 10;
    const ratio = clamp(ent.hp/ent.hpMax, 0, 1);

    const z = (typeof cam !== "undefined" && cam && typeof cam.zoom==="number") ? cam.zoom : 1;
    // Put blocks slightly below feet (and below selection ellipse visually)
    const y = p.y + (isInf ? 22*z : 24*z);
    drawHpBlocksAtScreen(p.x, y, blocks, ratio);
  }
function rgbaFrom(hexOrRgba, alpha){
    // accepts '#rrggbb' or 'rgba(...)' already
    if (!hexOrRgba) return `rgba(255,255,255,${alpha})`;
    if (hexOrRgba.startsWith("rgba")) return hexOrRgba.replace(/rgba\(([^)]+),\s*([0-9.]+)\)/, (m, body) => `rgba(${body}, ${alpha})`);
    if (hexOrRgba.startsWith("#") && hexOrRgba.length===7){
      const r=parseInt(hexOrRgba.slice(1,3),16);
      const g=parseInt(hexOrRgba.slice(3,5),16);
      const b=parseInt(hexOrRgba.slice(5,7),16);
      return `rgba(${r},${g},${b},${alpha})`;
    }
    return `rgba(255,255,255,${alpha})`;
  }

function drawLabel(text,x,y){
    ctx.font="12px system-ui";
    ctx.textAlign="center";
    ctx.textBaseline="middle";
    ctx.lineWidth=3;
    ctx.strokeStyle="rgba(0,0,0,0.68)";
    ctx.strokeText(text,x,y);
    ctx.fillStyle="rgba(255,255,255,0.92)";
    ctx.fillText(text,x,y);
  }

  function drawWrenchFx(){
    // Render repair wrench FX above buildings under repair using the provided sprite sheet.
    // Sheet: 602x602 per tile, starting at top-left, frames play 1-2-3-4-5-6-7 loop.
    const img = REPAIR_WRENCH_IMG;
    if (!img) return;

    const TILEPX = 602;
    const COLS = 3;
    const FRAMES = 7;
        const frameDur = 0.060; // seconds per frame (faster)

    for (let i=repairWrenches.length-1;i>=0;i--){
      const fx = repairWrenches[i];
      const age = state.t - fx.t0;
      const ttl = fx.ttl || 0.7;
      const since = state.t - ((fx.last!=null)?fx.last:fx.t0);
      const linger = 0.22;
      if (since > linger){ repairWrenches.splice(i,1); continue; }

      // If image not ready yet, skip drawing (FX list TTL will recycle soon anyway).
      if (!img.complete || img.naturalWidth <= 0) continue;

      const p = worldToScreen(fx.x, fx.y);
      const z = cam.zoom||1;

      // place slightly above roof
      const x = p.x;
      const y = p.y - 64*z;

            const a = clamp(age/ttl, 0, 1);
      // Avoid visible pulsing while actively repairing. Only fade out after repair stops.
      const activeHold = 0.14; // seconds: within this window we consider repair 'active'
      let fade = 1;
      if (since > activeHold){
        fade = clamp(1 - ((since - activeHold) / (linger - activeHold)), 0, 1);
      }

      const fi = (Math.floor(age / frameDur) % FRAMES);
      const sx = (fi % COLS) * TILEPX;
      const sy = ((fi / COLS) | 0) * TILEPX;

      // Size: keep visible but not huge. Sprite is high-res so we can scale freely.
      const size = 216 * z; // 3x for visibility

      ctx.save();
      ctx.globalAlpha = 0.95 * fade;

      // Snap to integer pixels to avoid subpixel shimmer.
      const dx = Math.round(x - size/2);
      const dy = Math.round(y - size/2);
      ctx.drawImage(img, sx, sy, TILEPX, TILEPX, dx, dy, size, size);

      ctx.restore();
    }
  }

  
function updateInfDeathFx(){
    // Prepare infantry death FX for depth-sorted rendering with buildings/units.
    // Playback: frameDur=0.05s, play up to frame #6 (index 5), then hold that frame and fade out.
    const baseImg = INF_DIE_IMG;
    if (!baseImg || !baseImg.complete || baseImg.naturalWidth<=0) return;

    const COLS = 3;
    const FRAMES_TOTAL = 6;

    const frameDur = 0.05; // requested
    const HOLD_INDEX = 5;  // "last 6th frame" (1-based 6) held for fade out
    const playFrames = Math.min(HOLD_INDEX+1, FRAMES_TOTAL); // 6 frames
    const playDur = playFrames * frameDur;

    const fadeDur = 0.65; // seconds to fade out (tunable, smooth)
    const totalDur = playDur + fadeDur;

    const imgW = baseImg.naturalWidth|0;
    const imgH = baseImg.naturalHeight|0;

    // Derive tile size from width, and allow non-multiple widths by distributing remainder.
    // We'll compute per-column boundaries so source rects don't drift.
    const colX = [0];
    for (let c=1;c<=COLS;c++){
      colX[c] = Math.round((imgW * c) / COLS);
    }
    const rowsGuess = 2; // detected layout: 3 cols x 2 rows (source may be downscaled)
    const rowY = [0];
    for (let r=1;r<=rowsGuess;r++){
      rowY[r] = Math.round((imgH * r) / rowsGuess);
    }

    const frames = [
      {cx:0, cy:0}, // 1
      {cx:1, cy:0}, // 2
      {cx:2, cy:0}, // 3
      {cx:0, cy:1}, // 4
      {cx:1, cy:1}, // 5
      {cx:2, cy:1}, // 6 (hold here)
    ];

    for (let i=infDeathFxs.length-1;i>=0;i--){
      const fx = infDeathFxs[i];
      const age = state.t - fx.t0;
      if (age >= totalDur){
        infDeathFxs.splice(i,1);
        continue;
      }

      // frame index (stop at HOLD_INDEX after playDur)
      let fi = Math.min(playFrames-1, Math.max(0, (age / frameDur)|0));
      if (age >= playDur) fi = Math.min(HOLD_INDEX, FRAMES_TOTAL-1);

      // alpha (fade only after playDur)
      let alpha = 1;
      if (age > playDur){
        alpha = clamp(1 - ((age - playDur) / fadeDur), 0, 1);
      }

      // Clamp frame coords to our assumed 3x3 grid bounds
      let cx = frames[fi].cx, cy = frames[fi].cy;
      cx = clamp(cx, 0, COLS-1);
      cy = clamp(cy, 0, rowsGuess-1);

      // Build src rect using boundary arrays (prevents wobble from rounding)
      const sx0 = colX[cx], sx1 = colX[cx+1];
      const sy0 = rowY[cy], sy1 = rowY[cy+1];
      const sw = Math.max(1, sx1 - sx0);
      const sh = Math.max(1, sy1 - sy0);

      // Cache render info on the fx object for use in the depth-sorted draw pass
      fx._rd = { sx:sx0, sy:sy0, sw, sh, alpha, fi };
    }
  }

  function drawInfDeathFxOne(fx){
    const baseImg = INF_DIE_IMG;
    if (!baseImg || !baseImg.complete || baseImg.naturalWidth<=0) return;

    const rd = fx._rd;
    if (!rd) return;

    // Palette swap (magenta -> team color), cached per team
    const sheet = buildInfTeamSheet(baseImg, INF_TEAM_SHEET_DIE, fx.team) || baseImg;

    const p = worldToScreen(fx.x, fx.y);
    const z = cam.zoom||1;

    // Draw near ground plane (corpse). Match infantry render scale so it doesn't look huge.
    const x = p.x;
    const y = p.y - 18*z;

    const sc = INF_SPRITE_SCALE * 1.9 * z; // death FX size (slightly reduced)
    const dw = rd.sw * sc;
    const dh = rd.sh * sc;

    ctx.save();
    ctx.globalAlpha = rd.alpha;
    const dx = Math.round(x - dw/2);
    const dy = Math.round(y - dh/2);
    ctx.drawImage(sheet, rd.sx, rd.sy, rd.sw, rd.sh, dx, dy, dw, dh);
    ctx.restore();
  }


  function drawBuildingHpBlocks(ent){
    const ratio = clamp(ent.hp/ent.hpMax, 0, 1);

    // Segment count: keep stable per-footprint (C&C-like chunky bar)
    const segN = clamp(Math.round((ent.tw + ent.th) * 2), 6, 14);
    const filled = clamp(Math.round(segN * ratio), 0, segN);
    const missing = segN - filled;

    const fillColor = (ratio < 0.20) ? "rgba(255,70,60,0.98)"
                    : (ratio < 0.50) ? "rgba(255,220,70,0.98)"
                    : "rgba(110,255,90,0.98)";

    // Roof height in screen-space (zoom-invariant relative to the building)
    const level = (BUILD[ent.kind] && typeof BUILD[ent.kind].hLevel === "number") ? BUILD[ent.kind].hLevel : 2;
    const unitH = 34 * cam.zoom;
    const h = Math.max(0, level) * unitH;

    // Ground corners (screen)
    const tx0 = ent.tx, ty0 = ent.ty, tx1 = ent.tx + ent.tw, ty1 = ent.ty + ent.th;
    const g0 = worldToScreen(tx0*TILE, ty0*TILE);
    const g1 = worldToScreen(tx1*TILE, ty0*TILE);
    const g2 = worldToScreen(tx1*TILE, ty1*TILE);
    const g3 = worldToScreen(tx0*TILE, ty1*TILE);

    // Roof corners
    const t0 = { x: g0.x, y: g0.y - h };
    const t1 = { x: g1.x, y: g1.y - h };
    const t2 = { x: g2.x, y: g2.y - h };
    const t3 = { x: g3.x, y: g3.y - h };

    // Anchor the bar to the LEFT roof edge (t0->t3), and push it outward from roof center.
    // Reference wants the HP bar on the "left" side in screen space (like RA2 building HP pips).
    const rcx = (t0.x + t1.x + t2.x + t3.x) * 0.25;
    const rcy = (t0.y + t1.y + t2.y + t3.y) * 0.25;
    const midx = (t0.x + t3.x) * 0.5;
    const midy = (t0.y + t3.y) * 0.5;

    // Outward direction from roof center toward the chosen edge midpoint
    let ox = (midx - rcx), oy = (midy - rcy);
    const oLen = Math.hypot(ox, oy) || 1;
    ox /= oLen; oy /= oLen;

    const off = 14 * cam.zoom;
    const b0 = { x: t0.x + ox*off, y: t0.y + oy*off };
    const b1 = { x: t3.x + ox*off, y: t3.y + oy*off };

    // Basis along the bar (u) and across the bar (v) using roof edges (keeps isometric "feel")
    let ux = (b1.x - b0.x), uy = (b1.y - b0.y);
    const uLen = Math.hypot(ux, uy) || 1;
    ux /= uLen; uy /= uLen;

    let vx = (t1.x - t0.x), vy = (t1.y - t0.y);
    const vLen = Math.hypot(vx, vy) || 1;
    vx /= vLen; vy /= vLen;

    const edgeLen = Math.hypot(b1.x - b0.x, b1.y - b0.y) || 1;

    // Visual sizes (screen px, scale with zoom so it stays glued to the building)
    const thick = 12 * cam.zoom;          // bar thickness
    const padU = 10 * cam.zoom;           // padding on both ends
    const padV = 6 * cam.zoom;            // padding across thickness
    const gap = 2.2 * cam.zoom;           // gap between segments

    // Compute usable length and per-segment length
    const usable = Math.max(1, edgeLen - padU*2);
    const segLen = Math.max(1, (usable - gap*(segN-1)) / segN);

    // --- Background "capsule" (dark plate) ---
    // Draw it in screen-space rotated to match u, so it reads like the reference.
    const ang = Math.atan2(uy, ux);
    ctx.save();
    // place origin at b0, then rotate around that
    ctx.translate(b0.x, b0.y);
    ctx.rotate(ang);

    const plateW = usable + padU*2;
    const plateH = thick + padV*2;
    const plateX = -padU;
    const plateY = -plateH*0.5;

    // rounded rect helper
    const rr = (x,y,w,h,r)=>{
      r = Math.min(r, w*0.5, h*0.5);
      ctx.beginPath();
      ctx.moveTo(x+r, y);
      ctx.lineTo(x+w-r, y);
      ctx.quadraticCurveTo(x+w, y, x+w, y+r);
      ctx.lineTo(x+w, y+h-r);
      ctx.quadraticCurveTo(x+w, y+h, x+w-r, y+h);
      ctx.lineTo(x+r, y+h);
      ctx.quadraticCurveTo(x, y+h, x, y+h-r);
      ctx.lineTo(x, y+r);
      ctx.quadraticCurveTo(x, y, x+r, y);
      ctx.closePath();
    };

    // subtle shadow
    rr(plateX + 2*cam.zoom, plateY + 2*cam.zoom, plateW, plateH, plateH*0.45);
    ctx.fillStyle = "rgba(0,0,0,0.30)";
    ctx.fill();

    // main plate
    rr(plateX, plateY, plateW, plateH, plateH*0.45);
    ctx.fillStyle = "rgba(12,16,24,0.72)";
    ctx.fill();

    // bevel highlight (top edge)
    rr(plateX, plateY, plateW, plateH, plateH*0.45);
    ctx.strokeStyle = "rgba(180,210,255,0.10)";
    ctx.lineWidth = Math.max(1, 1.1*cam.zoom);
    ctx.stroke();

    // --- Segments ---
    // We render segments in this rotated space as slightly "3D" blocks (top + side).
    // Missing HP is on the RIGHT (black), remaining on the LEFT (color).
    for (let i=0;i<segN;i++){
      const isMissing = (i >= filled);
      const base = isMissing ? "rgba(0,0,0,0.80)" : fillColor;

      const x0 = plateX + padU + i*(segLen + gap);
      const y0 = -thick*0.5;
      const w = segLen;
      const h0 = thick;

      // block fill
      ctx.fillStyle = base;
      ctx.fillRect(x0, y0, w, h0);

      // small bevel lines on each segment (C&C-ish chunk)
      ctx.strokeStyle = "rgba(0,0,0,0.35)";
      ctx.lineWidth = Math.max(1, 1.0*cam.zoom);
      ctx.strokeRect(x0, y0, w, h0);

      // top highlight
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x0+w, y0);
      ctx.strokeStyle = "rgba(255,255,255,0.10)";
      ctx.lineWidth = Math.max(1, 1.0*cam.zoom);
      ctx.stroke();
    }

    ctx.restore();
  }




  function drawGroupBadge(x,y,n){
    if (!n) return;
    ctx.save();
    ctx.font="11px system-ui";
    ctx.textAlign="center";
    ctx.textBaseline="middle";
    ctx.fillStyle="rgba(0,0,0,0.82)";
    ctx.strokeStyle="rgba(255,255,255,0.22)";
    ctx.lineWidth=1;
    const w=14,h=14;
    ctx.beginPath();
    ctx.rect(x-w/2, y-h/2, w, h);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle="rgba(255,255,255,0.92)";
    ctx.fillText(String(n), x, y+0.5);
    ctx.restore();
  }




  function roundRectPath(ctx, x, y, w, h, r){
    r = Math.max(0, Math.min(r, Math.min(w,h)/2));
    ctx.beginPath();
    ctx.moveTo(x+r, y);
    ctx.arcTo(x+w, y,   x+w, y+h, r);
    ctx.arcTo(x+w, y+h, x,   y+h, r);
    ctx.arcTo(x,   y+h, x,   y,   r);
    ctx.arcTo(x,   y,   x+w, y,   r);
    ctx.closePath();
  }

  function isPrimaryBuilding(b){
    if (!b || b.team!==TEAM.PLAYER) return false;
    if (b.kind==="barracks") return state.primary.player.barracks===b.id;
    if (b.kind==="factory")  return state.primary.player.factory===b.id;
    return false;
  }

function refreshPrimaryBuildingBadgesUI(){
  // UI badges inside production buttons must be screen-space (not camera dependent)
  const bar = document.getElementById("badgeBar");
  const fac = document.getElementById("badgeFac");
  if (bar) bar.style.display = (state.primary.player.barracks!=null && state.primary.player.barracks!==-1) ? "inline-block" : "none";
  if (fac) fac.style.display = (state.primary.player.factory!=null  && state.primary.player.factory!==-1)  ? "inline-block" : "none";
}


  function drawPrimaryBadgeForSelectedBuilding(b){
    if (!isPrimaryBuilding(b)) return;
    const p=worldToScreen(b.x,b.y);
    const yy = p.y - (Math.max(b.tw,b.th)*ISO_Y*cam.zoom) - 40;
    const xx = p.x + ISO_X*(b.tw*0.72)*cam.zoom;
    const text="주요건물";
    ctx.save();
    ctx.font="bold 12px system-ui";
    ctx.textAlign="left";
    ctx.textBaseline="middle";
    const padX=8;
    const w = ctx.measureText(text).width + padX*2;
    const h = 22;
    ctx.fillStyle="rgba(0,0,0,0.55)";
    ctx.strokeStyle="rgba(255,235,140,0.9)";
    ctx.lineWidth=1.5;
    roundRectPath(ctx, xx, yy, w, h, 7);
    ctx.fill(); ctx.stroke();
    ctx.fillStyle="rgba(255,235,140,0.95)";
    ctx.fillText(text, xx+padX, yy+h/2);
    ctx.restore();
  }

  function drawHoverNameTooltip(){
    if (!state.hover.entId) return;
    if ((state.t - state.hover.t0) < 0.8) return;
    if (state.drag.on || state.pan.on) return;
    if (state.build.active) return;

    const ent = getEntityById(state.hover.entId);
    if (!ent || !ent.alive) return;
    if (ent.hidden || ent.inTransport) return;

    const name = NAME_KO[ent.kind] || ent.kind;
    const W = canvas.width, H = canvas.height;
    const x = clamp(state.hover.px + 14, 10, W-10);
    const y = clamp(state.hover.py - 18, 10, H-10);

    ctx.save();
    ctx.font="12px system-ui";
    ctx.textAlign="left";
    ctx.textBaseline="middle";
    const padX=10;
    const tw = ctx.measureText(name).width;
    const bw = tw + padX*2;
    const bh = 24;

    ctx.fillStyle="rgba(0,0,0,0.62)";
    ctx.strokeStyle="rgba(255,255,255,0.25)";
    ctx.lineWidth=1;
    roundRectPath(ctx, x, y, bw, bh, 8);
    ctx.fill(); ctx.stroke();

    ctx.fillStyle="rgba(255,255,255,0.92)";
    ctx.fillText(name, x+padX, y+bh/2);
    ctx.restore();
  }
  function pushClickWave(wx, wy, color){
  state.fx.clicks.push({ x:wx, y:wy, color, t0: state.t, life: 0.4 });
}

function showUnitPathFx(u){ /* disabled */ }

function drawClickWaves(){
  const now=state.t;
  // prune old
  state.fx.clicks = state.fx.clicks.filter(w=> (now - w.t0) <= w.life);

  for (const w of state.fx.clicks){
    const a = clamp((now - w.t0) / w.life, 0, 1);
    const sp = worldToScreen(w.x, w.y);
    const r1 = 6 + a*34;
    const r2 = 2 + a*18;
    const alpha = (1-a);

    ctx.save();
    ctx.globalAlpha = 0.75 * alpha;
    ctx.lineWidth = 2.6;
    ctx.strokeStyle = w.color || "rgba(255,255,255,0.85)";

    ctx.beginPath(); ctx.arc(sp.x, sp.y, r1, 0, Math.PI*2); ctx.stroke();
    ctx.globalAlpha = 0.45 * alpha;
    ctx.beginPath(); ctx.arc(sp.x, sp.y, r2, 0, Math.PI*2); ctx.stroke();
    ctx.restore();
  }
}

function drawPathFx(){
  // Disabled: use transient order FX (move/attack/attackmove) so lines do not persist.
  return;
}





  function drawRallyPointsForSelection(){
    for (const id of state.selection){
      const b=getEntityById(id);
      if (!b || !b.alive || b.team!==TEAM.PLAYER) continue;
      if (!BUILD[b.kind] || b.civ) continue;
      if (b.kind!=="barracks" && b.kind!=="factory" && b.kind!=="hq") continue;
      if (!b.rally) continue;

      // Rally origin should be the building center (roof center), not the bottom tip.
      const level = (BUILD[b.kind] && typeof BUILD[b.kind].hLevel === "number") ? BUILD[b.kind].hLevel : 2;
      const unitH = 34 * cam.zoom;
      const h = Math.max(0, level) * unitH;

      const c = worldToScreen((b.tx + b.tw/2) * TILE, (b.ty + b.th/2) * TILE);
      const from = { x: c.x, y: c.y - h };

      const to   = worldToScreen(b.rally.x, b.rally.y);

      ctx.save();
      ctx.globalAlpha=0.95;
      ctx.strokeStyle="rgba(255,255,255,0.8)";
      ctx.lineWidth=2;

      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(to.x, to.y);
      ctx.stroke();

      // origin knot on the producer center
      ctx.fillStyle="rgba(255,255,255,0.95)";
      ctx.beginPath();
      ctx.moveTo(from.x, from.y-6.0);
      ctx.lineTo(from.x+6.0, from.y);
      ctx.lineTo(from.x, from.y+6.0);
      ctx.lineTo(from.x-6.0, from.y);
      ctx.closePath();
      ctx.fill();

      // marker
      ctx.fillStyle="rgba(255,255,255,0.95)";
      ctx.beginPath();
      ctx.arc(to.x, to.y, 5.2, 0, Math.PI*2);
      ctx.fill();

      ctx.restore();
    }
  }

  function tickSidebarBuild(dt){
    // Building production: two independent lanes (main/def) with reservation FIFO.
    // Each lane: can reserve many -> one active build -> READY (await placement) -> then next.
    const pf = getPowerFactor(TEAM.PLAYER);
    const speedBase = pf * GAME_SPEED * BUILD_PROD_MULT;
    const debugFastBuild = !!(state.debug && state.debug.fastProd); // player-only building fast-complete

    function startNextIfIdle(lane){
      if (!lane) return;
      if (lane.ready || lane.queue) return;
      if (lane.fifo && lane.fifo.length){
        const kind = lane.fifo.shift();
        lane.queue = { kind, t:0, tNeed:getBaseBuildTime(kind), cost:(COST[kind]||0), paid:0 };
      }
    }

    function tickLane(laneKey){
      const lane = state.buildLane[laneKey];
      if (!lane) return;

      // If idle, kick next reservation
      startNextIfIdle(lane);

      if (!lane.queue) return;
      if (lane.ready) return;

      const q = lane.queue;
      const debugFast = debugFastBuild; // buildings are player-only lanes
      if (debugFast){
        // Debug fast build: finish this build in ~1s real-time, ignore money/power throttles.
        q.paused = false; q.autoPaused = false; q._autoToast = false;
      }
      // Auto-resume if we were paused only because of insufficient money.
      if (q.paused){
        if (q.autoPaused){
          const costTotalTmp = q.cost || 0;
          const tNeedTmp = q.tNeed || 0.001;
          const payRateTmp = (costTotalTmp<=0) ? 0 : (costTotalTmp / tNeedTmp);
          const canByMoneyTmp = (payRateTmp<=0) ? 1 : (state.player.money / payRateTmp);
          if (canByMoneyTmp > 0){
            q.paused = false;
            q.autoPaused = false;
            q._autoToast = false;
          } else {
            return;
          }
        } else {
          return;
        }
      }
      const speed = debugFast ? (q.tNeed || 1) : speedBase;
      const want = dt * speed;
      const costTotal = q.cost || 0;
      const tNeed = q.tNeed || 0.001;
      const payRate = (costTotal<=0) ? 0 : (costTotal / tNeed);
      const canByMoney = debugFast ? want : ((payRate<=0) ? want : (state.player.money / payRate));
      const delta = Math.min(want, canByMoney);
      // Out of money => auto-pause (do NOT confuse 'no progress' with 'no money').
      // If want<=0, we are simply not progressing this frame (pause, power, etc). Don't force a money-wait state.
      if (delta <= 0){
        if (want <= 0){
          return;
        }
        // If build time is broken (0), don't auto-pause by money logic.
        if (tNeed <= 0){
          return;
        }
        if (payRate>0 && (state.player.money / payRate) <= 0){
          q.paused = true;
          q.autoPaused = true;
          if (!q._autoToast){ q._autoToast=true; toast("대기"); }
        }
        return;
      }

      let pay = payRate * delta;
      if (debugFast){
        pay = 0;
        q.paid = costTotal;
      } else {
        state.player.money -= pay;
        q.paid = (q.paid||0) + pay;
      }
      q.t += delta;

      if (q.t >= tNeed - 1e-6){
        q.t = tNeed; q.paid = costTotal;
        lane.ready = q.kind;
        lane.queue = null;
      }
    }

    tickLane("main");
    tickLane("def");

    // BuildMode pill (global placement state)
    const anyReady = !!(state.buildLane.main.ready || state.buildLane.def.ready);
    const anyBuilding = !!(state.buildLane.main.queue || state.buildLane.def.queue || (state.buildLane.main.fifo&&state.buildLane.main.fifo.length) || (state.buildLane.def.fifo&&state.buildLane.def.fifo.length));
    if (state.build.active) {
      uiBuildMode.textContent = "PLACE";
      uiBuildMode.className = "pill ok";
    } else if (anyReady) {
      uiBuildMode.textContent = "READY";
      uiBuildMode.className = "pill ok";
    } else if (anyBuilding) {
      uiBuildMode.textContent = "BUILD";
      uiBuildMode.className = "pill";
    } else {
      uiBuildMode.textContent = "OFF";
      uiBuildMode.className = "pill";
    }

    // Blink main/def tabs if there is a READY building waiting for placement.
    try{
      for (const b of tabBtns){
        if (!b) continue;
        if (b.dataset.cat==="main") b.classList.toggle("blink", !!state.buildLane.main.ready);
        if (b.dataset.cat==="def")  b.classList.toggle("blink", !!state.buildLane.def.ready);
      }
    }catch(_e){}
  }


  function updateSidebarButtons(){
    // --- Tech tree gating / hiding (icons should not appear if prereqs are not met) ---
    function hasP(kind){
      return buildings.some(b=>b.alive && !b.civ && b.team===TEAM.PLAYER && b.kind===kind);
    }
    const tech = {
      buildPrereq: {
        power: ["hq"],
        refinery: ["hq","power"],
        barracks: ["hq","refinery"],
        factory: ["hq","barracks"],
        radar: ["hq","factory"],
        turret: ["hq","barracks"],
      },
      unitPrereq: {
        infantry: ["barracks"],
        engineer: ["barracks"],
        tank: ["factory"],
        harvester: ["factory"],
      },
      tabProducer: {
        main: ["hq"],
        def:  ["hq","barracks"],
        inf:  ["barracks"],
        veh:  ["factory"],
      }
    };
    function prereqOk(list){
      if (!list || !list.length) return true;
      for (const k of list) if (!hasP(k)) return false;
      return true;
    }
    function tabOk(cat){
      const req = tech.tabProducer[cat] || [];
      return prereqOk(req);
    }

    // Hide whole category tabs if their required producer buildings don't exist.
    try{
      let firstAvail = null;
      for (const b of tabBtns){
        if (!b) continue;
        const cat = b.dataset.cat;
        const ok = tabOk(cat);
        b.style.display = ok ? "" : "none";
        if (ok && !firstAvail) firstAvail = cat;
      }
      if (!tabOk(prodCat) && firstAvail){
        // If current tab became unavailable, switch to the first available.
        setProdCat(firstAvail);
      }
    }catch(_e){}

    // Building buttons (two independent lanes)
    const buildBtns = {
      power: btnPow, refinery: btnRef, barracks: btnBar, factory: btnFac, radar: btnRad, turret: btnTur
    };
    const laneOf = (k)=> (k==="turret") ? "def" : "main";

    for (const [k, btn] of Object.entries(buildBtns)){
      if (!btn) continue;
      const show = prereqOk(tech.buildPrereq[k]);
      btn.style.display = show ? "" : "none";
      if (!show) continue;
      const laneKey = laneOf(k);
      const lane = state.buildLane[laneKey];
      let pct = 0;
      let ready = false;

      if (lane && lane.queue && lane.queue.kind === k){
        const c = lane.queue.cost || 1;
        pct = clamp((lane.queue.paid||0) / c, 0, 1);
      } else if (lane && lane.ready === k){
        pct = 1; ready = true;
      }

      if (pct>0){
        btn.style.background = `linear-gradient(180deg, rgba(60,45,18,0.92), rgba(18,14,8,0.96)), linear-gradient(90deg, rgba(90,220,140,0.55) ${pct*100}%, rgba(0,0,0,0) ${pct*100}%)`;
        btn.style.backgroundBlendMode = "overlay, normal";
      } else {
        btn.style.background = "";
        btn.style.backgroundBlendMode = "";
      }

      btn.style.outline = ready ? "2px solid rgba(90,220,140,0.75)" : "";
    }
    // Unit buttons: stable label + badge count + progress fill (never overwrite innerHTML/textContent)
    const unitBtns = {
      infantry: {btn: btnInf, label:"보병"},
      engineer: {btn: btnEng, label:"엔지니어"},
      sniper:   {btn: btnSnp, label:"저격병"},
      tank:     {btn: btnTnk, label:"탱크"},
      harvester:{btn: btnHar, label:"굴착기"},
      ifv:      {btn: btnIFV, label:"IFV"},
    };
    const ensureLabel = (btn, label)=>{
      if (!btn) return;
      // Keep a dedicated label span + badge span. Remove raw text nodes to avoid duplicate labels.
      let lbl = btn.querySelector(".lbl");
      if (!lbl){
        lbl = document.createElement("span");
        lbl.className = "lbl";
      }
      lbl.textContent = label;

      let badge = btn.querySelector(".badge");
      if (!badge){
        badge = document.createElement("span");
        badge.className = "badge";
        badge.textContent = "0";
        badge.style.display = "none";
      }

      // Rebuild children in stable order: [label][badge]
      while (btn.firstChild) btn.removeChild(btn.firstChild);
      btn.appendChild(lbl);
      btn.appendChild(badge);
    };

    for (const [k, meta] of Object.entries(unitBtns)){
      const btn = meta.btn;
      if (!btn) continue;
      const prereq = (tech.unitPrereq && tech.unitPrereq[k]) ? tech.unitPrereq[k] : [];
      const show = prereqOk(prereq);
      btn.style.display = show ? "" : "none";
      if (!show) continue;

      ensureLabel(btn, meta.label);

      // progress fill: best front-of-queue item among player producers
      let bestPct = -1;
      for (const b of buildings){
        if (!b.alive || b.civ) continue;
        if (b.team !== TEAM.PLAYER) continue;
        if (!b.buildQ || !b.buildQ.length) continue;
        const q = b.buildQ[0];
        if (!q || q.kind !== k) continue;
        const c = (q.cost ?? (COST[k]||1)) || 1;
        const pct = clamp((q.paid||0) / c, 0, 1);
        if (pct > bestPct) bestPct = pct;
      }
      if (bestPct>=0){
        btn.style.background = `linear-gradient(90deg, rgba(90,220,140,0.22) ${Math.floor(bestPct*100)}%, rgba(0,0,0,0.0) ${Math.floor(bestPct*100)}%)`;
        btn.style.backgroundBlendMode = "normal";
      } else {
        btn.style.background = "";
        btn.style.backgroundBlendMode = "";
      }
    }


    updateProdBars();

    updatePowerBar();
}

  
  function updatePowerBar(){
    if (!uiPowerFill) return;
    const prod = state.player.powerProd || 0;
    const use  = state.player.powerUse  || 0;

    // Green: production vs usage (how "healthy" power is).
    let pct = 1;
    if (use > 0){
      pct = clamp(prod / use, 0, 1);
    }
    uiPowerFill.style.height = `${Math.round(pct*100)}%`;

    // Red: consumption overlay (how much is being used).
    if (uiPowerNeed){
      let needPct = 0;
      if (prod > 0){
        needPct = clamp(use / prod, 0, 1);
      } else if (use > 0){
        needPct = 1;
      }
      uiPowerNeed.style.height = `${Math.round(needPct*100)}%`;
    }

    // Overload hint (orange-ish)
    if (use >= prod){
      uiPowerFill.style.background = "linear-gradient(180deg, rgba(255,190,90,0.78), rgba(140,70,20,0.78))";
    } else {
      uiPowerFill.style.background = "linear-gradient(180deg, rgba(90,220,140,0.75), rgba(40,120,80,0.75))";
    }
  }

  function updateProdBars(){
    // Building lanes
    function lanePct(lane){
      if (!lane) return 0;
      if (lane.ready) return 1;
      if (lane.queue){
        const c = lane.queue.cost || 1;
        return clamp((lane.queue.paid||0)/c, 0, 1);
      }
      if (lane.fifo && lane.fifo.length) return 0.01; // tiny hint
      return 0;
    }
    const mainLane = state.buildLane.main;
    const defLane  = state.buildLane.def;

    if (qFillMain) qFillMain.style.width = `${lanePct(mainLane)*100}%`;
    if (qFillDef)  qFillDef.style.width  = `${lanePct(defLane)*100}%`;

    if (qTxtMain) qTxtMain.textContent = mainLane.ready ? `READY: ${NAME_KO[mainLane.ready]}` :
      mainLane.queue ? `${NAME_KO[mainLane.queue.kind]} ${Math.round(lanePct(mainLane)*100)}%` :
      (mainLane.fifo && mainLane.fifo.length) ? `예약 ${mainLane.fifo.length}` : "-";

    if (qTxtDef) qTxtDef.textContent = defLane.ready ? `READY: ${NAME_KO[defLane.ready]}` :
      defLane.queue ? `${NAME_KO[defLane.queue.kind]} ${Math.round(lanePct(defLane)*100)}%` :
      (defLane.fifo && defLane.fifo.length) ? `예약 ${defLane.fifo.length}` : "-";

    // Unit producers
    // barracks: infantry+engineer share
    const pBarr = buildings.filter(b=>b.alive && !b.civ && b.team===TEAM.PLAYER && b.kind==="barracks");
    const pFac  = buildings.filter(b=>b.alive && !b.civ && b.team===TEAM.PLAYER && b.kind==="factory");

    const curBarr = pBarr.reduce((best,b)=>{
      if (!b.buildQ || !b.buildQ.length) return best;
      const q=b.buildQ[0]; const pct=clamp((q.paid||0)/((q.cost||1)),0,1);
      if (!best) return b;
      const qb=best.buildQ[0]; const pctb=clamp((qb.paid||0)/((qb.cost||1)),0,1);
      return (pct>pctb)?b:best;
    }, null);
    const curFac  = pFac.reduce((best,b)=>{
      if (!b.buildQ || !b.buildQ.length) return best;
      const q=b.buildQ[0]; const pct=clamp((q.paid||0)/((q.cost||1)),0,1);
      if (!best) return b;
      const qb=best.buildQ[0]; const pctb=clamp((qb.paid||0)/((qb.cost||1)),0,1);
      return (pct>pctb)?b:best;
    }, null);

    function unitPctFromProducer(prod){
      if (!prod || !prod.buildQ || !prod.buildQ.length) return 0;
      if (prod.team!==TEAM.PLAYER) return 0;
      const q = prod.buildQ[0];
      const c = q.cost || 1;
      return clamp((q.paid||0)/c, 0, 1);
    }
    const infPct = unitPctFromProducer(curBarr);
    const vehPct = unitPctFromProducer(curFac);

    if (qFillInf) qFillInf.style.width = `${infPct*100}%`;
    if (qFillVeh) qFillVeh.style.width = `${vehPct*100}%`;

    if (qTxtInf) qTxtInf.textContent = (prodFIFO.barracks.length || (curBarr && curBarr.buildQ.length)) ?
      `예약 ${prodFIFO.barracks.length + (curBarr?curBarr.buildQ.length:0)}` : "-";
    if (qTxtVeh) qTxtVeh.textContent = (prodFIFO.factory.length || (curFac && curFac.buildQ.length)) ?
      `예약 ${prodFIFO.factory.length + (curFac?curFac.buildQ.length:0)}` : "-";
  }

function draw(){
    const W=canvas.width, H=canvas.height;
    ctx.clearRect(0,0,W,H);
    uiMoney.textContent = "$ " + Math.floor(state.player.money);
    updateProdBadges();

    for (let s=0; s<=(MAP_W-1)+(MAP_H-1); s++){
      for (let ty=0; ty<MAP_H; ty++){
        const tx=s-ty;
        if (!inMap(tx,ty)) continue;
        const i=idx(tx,ty);

        drawIsoTile(tx,ty,terrain[i]);

        // Fog of war layers (zoom-correct, seamless):
        //  - Unexplored (shroud): fully opaque black (NEVER see inside, even when zoomed)
        //  - Explored but not currently visible: keep terrain visible (very light dim only)
        const iVis = visible[TEAM.PLAYER][i];
        const iExp = explored[TEAM.PLAYER][i];

        // Draw per-tile diamond in SCREEN space so zoom never reveals gaps or the inside.
        if (!iExp || !iVis){
          const c = tileToWorldCenter(tx,ty);
          const p = worldToScreen(c.x,c.y);
          const x = p.x, y = p.y;
          const ox = ISO_X*cam.zoom, oy = ISO_Y*cam.zoom;

          // Expand a bit (zoom-scaled) to kill seams at max zoom
          const eps = 2.4*cam.zoom;

          // Shroud must be truly opaque.
          // Fog (explored) should NOT hide the map, only a slight dim.
          if (!iExp){
            ctx.fillStyle = "rgba(0,0,0,1)";
          } else {
            ctx.fillStyle = "rgba(0,0,0,0.10)";
          }

          ctx.beginPath();
          ctx.moveTo(x, y-oy-eps);
          ctx.lineTo(x+ox+eps, y);
          ctx.lineTo(x, y+oy+eps);
          ctx.lineTo(x-ox-eps, y);
          ctx.closePath();
          ctx.fill();
        }
      }
    }

    if (state.build.active && state.build.kind){
      const kind=state.build.kind;
      const spec=BUILD[kind];
      const s = snapHoverToTileOrigin(kind);
      const tx=s.tx, ty=s.ty;
      const wpos=buildingWorldFromTileOrigin(tx,ty,spec.tw,spec.th);

      const ok = inBuildRadius(TEAM.PLAYER, wpos.cx, wpos.cy)
        && !isBlockedFootprint(tx,ty,spec.tw,spec.th);

      const ghost={tx,ty,tw:spec.tw,th:spec.th};

      // Per-tile placement feedback: only the blocked sub-area turns red.
      const fp = footprintBlockedMask(tx,ty,spec.tw,spec.th);

      // If outside build radius, make the whole footprint red to avoid confusion
      if (!inBuildRadius(TEAM.PLAYER, wpos.cx, wpos.cy)){
        fp.mask.fill(1);
        fp.blocked = true;
      }

      ctx.globalAlpha=0.62;
      drawFootprintTiles(
        tx, ty, spec.tw, spec.th,
        fp.mask,
        "rgba(120,255,170,0.22)", "rgba(255,120,120,0.22)",
        "rgba(120,255,170,0.78)", "rgba(255,120,120,0.78)"
      );
      ctx.globalAlpha=1;

      // Outline the whole footprint for clarity
      ctx.globalAlpha=0.78;
      drawFootprintDiamond(ghost, "rgba(0,0,0,0)", fp.blocked ? "rgba(255,120,120,0.90)" : "rgba(120,255,170,0.90)");
      ctx.globalAlpha=1;


      // preview range ring for defense buildings (isometric ellipse)
      const dspec = DEFENSE[kind];
      if (dspec && dspec.range){
        const ringColor = state.colors.player;
        drawRangeEllipseWorld(wpos.cx, wpos.cy, dspec.range, ringColor, dspec.ring);
      }
    }


    // Range rings for selected defense buildings (turret etc.)
    if (state.selection && state.selection.size){
      for (const id of state.selection){
        const ent = getEntityById(id);
        if (!ent) continue;
        if (!BUILD[ent.kind]) continue;
        const dspec = DEFENSE[ent.kind];
        if (!dspec || !dspec.range) continue;
        const col = ent.team===TEAM.PLAYER ? state.colors.player : state.colors.enemy;
        drawRangeEllipseWorld(ent.x, ent.y, dspec.range, col, dspec.ring);
      }
    }

    updateInfDeathFx();
    updateSnipDeathFx();

    const drawables=[];
    for (const b of buildings) if (b.alive) drawables.push(b);
    for (const u of units) if (u.alive) drawables.push(u);
    // Depth-sorted infantry death FX (so buildings can occlude it)
    for (let i=0;i<infDeathFxs.length;i++){
      const fx=infDeathFxs[i];
      if (!fx || !fx._rd) continue;
      drawables.push({ id: 9000000+i, kind: "_fx_inf_die", alive: true, team: fx.team, x: fx.x, y: fx.y, fxRef: fx });
    }
    for (let i=0;i<snipDeathFxs.length;i++){
      const fx=snipDeathFxs[i];
      if (!fx || !fx._rd) continue;
      drawables.push({ id: 9100000+i, kind: "_fx_snip_die", alive: true, team: fx.team, x: fx.x, y: fx.y, fxRef: fx });
    }

    drawables.sort((a,b)=>{
      const aIsB=!!BUILD[a.kind], bIsB=!!BUILD[b.kind];

      // Depth sort (painter's algorithm) in isometric:
      // Use "frontmost tile" for buildings (their footprint bottom edge),
      // and fractional (x+y)/TILE for units. If equal, draw buildings first so units sit on top.
      const aKey = aIsB ? ((a.tx + a.ty) + (a.tw + a.th - 2)) : ((a.x + a.y)/TILE);
      const bKey = bIsB ? ((b.tx + b.ty) + (b.tw + b.th - 2)) : ((b.x + b.y)/TILE);

      if (aKey !== bKey) return aKey - bKey;

      // Tie-break: buildings first, then units (units render on top at same depth)
      if (aIsB !== bIsB) return aIsB ? -1 : 1;

      // Final stable-ish tie-break by id
      return (a.id||0) - (b.id||0);
    });


    for (const ent of drawables){
      const isB=!!BUILD[ent.kind];
const tx=isB?ent.tx:(ent.x/TILE)|0;
const ty=isB?ent.ty:(ent.y/TILE)|0;
let rX = ent.x, rY = ent.y;

      if (ent.team===TEAM.ENEMY && inMap(tx,ty) && !explored[TEAM.PLAYER][idx(tx,ty)]) continue;

      if (isB){
        if (ent.civ) continue;

        let fill="#1b2636", stroke="#2b3d55";
        if (ent.team===TEAM.PLAYER){ fill="rgba(10,40,70,0.9)"; stroke=state.colors.player; }
        if (ent.team===TEAM.ENEMY){  fill="rgba(70,10,10,0.9)"; stroke=state.colors.enemy; }

        // Sprite-backed buildings (e.g., HQ / Construction Yard)
        if (BUILD_SPRITE[ent.kind]){
          // subtle ground shadow so it sits on the tiles
          drawFootprintDiamond(ent, "rgba(0,0,0,0.22)", "rgba(0,0,0,0)");
          drawBuildingSprite(ent);
        } else {
          drawFootprintPrism(ent, fill, stroke);
        }
        // Low power: powered defenses go offline visually (blink + ⚡) by overlaying the BUILDING itself.
        if (ent.kind==="turret" && POWER.turretUse>0 && isUnderPower(ent.team)){
          const blink = (Math.floor(state.t*6)%2)===0;

          if (blink){
            // Dark overlay on the whole turret prism (fixes "tile gap" look on zoom).
            drawFootprintPrism(ent, "rgba(0,0,0,0.55)", "rgba(0,0,0,0)");
          }

          const p2=worldToScreen(rX,rY);
          ctx.font=(16*cam.zoom).toFixed(0)+"px system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
          ctx.textAlign="center"; ctx.textBaseline="middle";
          ctx.fillStyle="rgba(255,235,120,0.95)";
          ctx.fillText("⚡", p2.x, p2.y-ISO_Y*0.25);
        }


        const p=worldToScreen(rX,rY);
        const ratio=clamp(ent.hp/ent.hpMax,0,1);
        const z = (typeof cam !== "undefined" && cam && typeof cam.zoom==="number") ? cam.zoom : 1;
        const yy = p.y - (Math.max(ent.tw,ent.th)*ISO_Y*z) - 22*z;
        // C&C-ish segmented building HP bar (blocks)
        // Show only when hovered or selected
        const showHp = (state.selection && state.selection.has(ent.id)) || (state.hover && state.hover.entId===ent.id);
        if (showHp) drawBuildingHpBlocks(ent);

        drawLabel(`${NAME_KO[ent.kind]||ent.kind}`, p.x, yy-14);
        if (ent.grp) drawGroupBadge(p.x + ISO_X*(ent.tw*0.55), yy-14, ent.grp);

        if (state.selection.has(ent.id)){
          drawPrimaryBadgeForSelectedBuilding(ent);
          ctx.lineWidth=2;
          drawFootprintDiamond(ent, "rgba(0,0,0,0)", "rgba(255,255,255,0.9)");
        }
      } else {
        if (ent.kind==="_fx_inf_die"){ drawInfDeathFxOne(ent.fxRef); continue; }
        if (ent.kind==="_fx_snip_die"){ drawSnipDeathFxOne(ent.fxRef); continue; }
        if (ent.hidden || ent.inTransport) continue;
        if (ent.kind==="sniper" && ent.cloaked && ent.team===TEAM.ENEMY) continue;
        const p=worldToScreen(rX,rY);
        let c = (ent.team===TEAM.PLAYER) ? state.colors.player : state.colors.enemy;

        // Selected unit ring (tilted ellipse on ground)
        if (state.selection && state.selection.has(ent.id)) drawSelectionEllipseAt(ent);
        if (ent.kind==="harvester") c = (ent.team===TEAM.PLAYER) ? "#a0ffbf" : "#ffb0b0";
        if (ent.kind==="engineer") c = (ent.team===TEAM.PLAYER) ? "#b7a8ff" : "#ffb7d9";

        const isInfantry = (ent.kind==="infantry" && typeof INF_IMG!=="undefined" && INF_IMG && INF_IMG.complete && INF_IMG.naturalWidth>0);
        const isSnip = (ent.kind==="sniper" && typeof SNIP_IMG!=="undefined" && SNIP_IMG && SNIP_IMG.complete && SNIP_IMG.naturalWidth>0);
        const isInf = isInfantry || isSnip;
        const infDir = isInf ? (
          // While firing, force render direction to the firing direction (prevents backwards-looking shots)
          (ent.fireHoldT>0 && ent.fireDir!=null) ? ent.fireDir :
          (ent.faceDir!=null) ? ent.faceDir :
          (ent.order && (ent.order.type==="move" || ent.order.type==="attackmove" || ent.order.type==="attack") && (ent.order.x!=null) && (ent.order.y!=null))
            ? worldVecToDir8(ent.order.x - ent.x, ent.order.y - ent.y)
            : 6
        ) : 6;

        ctx.save();
        if (ent.kind==="sniper" && ent.team===TEAM.PLAYER && ent.cloaked) ctx.globalAlpha = 0.45;
        if (ent.flash && ent.flash>0){
          // quick blink highlight for repairs
          if (((state.t*28)|0)%2===0) ctx.globalAlpha *= 0.55;
          ctx.shadowColor = "rgba(255,255,255,0.9)";
          ctx.shadowBlur = 12;
        }
        if (!isInf){
          // Vehicles default to circles, but lite tank uses proper sprite atlases.
          let drewSprite = false;
          if (ent.kind==="tank"){
            drewSprite = drawLiteTankSprite(ent, p);
          } else if (ent.kind==="harvester"){
            drewSprite = drawHarvesterSprite(ent, p);
          }

          if (!drewSprite){
            ctx.fillStyle=c;
            ctx.strokeStyle="rgba(0,0,0,0.4)";
            ctx.lineWidth=2;
            ctx.beginPath();
            ctx.arc(p.x,p.y,ent.r,0,Math.PI*2);
            ctx.fill(); ctx.stroke();
          }
        } else {
          // Infantry uses embedded sprite (idle pose) instead of a circle
          // Apply cloak alpha if needed (player sniper only already handled above, but keep consistent)
          let a = 1;
          if (ent.kind==="sniper" && ent.team===TEAM.PLAYER && ent.cloaked) a = 0.45;
          {
            if (ent.kind==="sniper"){
              const firing = ((ent.fireHoldT||0)>0);
              const isMoveOrder = !!(ent.order && (ent.order.type==="move" || ent.order.type==="attackmove"));
              const v2 = (ent.vx||0)*(ent.vx||0) + (ent.vy||0)*(ent.vy||0);
              const moving = isMoveOrder || v2 > 0.0004 || (ent.path && ent.path.length>0);
              if (!firing && moving){
                drawSniperMoveByDir(ctx, p.x, p.y, infDir, a, ent.team, state.t);
              } else {
                drawSniperSprite(ctx, p.x, p.y, infDir, a, ent.team);
              }
            } else {
            const firing = ((ent.fireHoldT||0)>0);
            const isMoveOrder = !!(ent.order && (ent.order.type==="move" || ent.order.type==="attackmove"));
            const v2 = (ent.vx||0)*(ent.vx||0) + (ent.vy||0)*(ent.vy||0);
            const moving = isMoveOrder || v2 > 0.0004 || (ent.path && ent.path.length>0);
            if (!firing && moving){
              if (infDir===0)      drawInfantryMoveEast(ctx, p.x, p.y, a, ent.team, state.t);
              else if (infDir===1) drawInfantryMoveNE(ctx, p.x, p.y, a, ent.team, state.t);
              else if (infDir===2) drawInfantryMoveN(ctx,  p.x, p.y, a, ent.team, state.t);
              else if (infDir===3) drawInfantryMoveNW(ctx, p.x, p.y, a, ent.team, state.t);
              else if (infDir===4) drawInfantryMoveW(ctx,  p.x, p.y, a, ent.team, state.t);
              else if (infDir===5) drawInfantryMoveSW(ctx, p.x, p.y, a, ent.team, state.t);
              else if (infDir===6) drawInfantryMoveS(ctx,  p.x, p.y, a, ent.team, state.t);
              else if (infDir===7) drawInfantryMoveSE(ctx, p.x, p.y, a, ent.team, state.t);
              else                 drawInfantrySprite(ctx, p.x, p.y, infDir, a, ent.team, firing);
            } else {
              drawInfantrySprite(ctx, p.x, p.y, infDir, a, ent.team, firing);
            }
          }
        }
        }

        // IFV passenger slot indicator (bottom-left)
        if (ent.kind==="ifv"){
          const s=8;
          const x0=p.x - ent.r - 2;
          const y0=p.y + ent.r - s + 2;
          ctx.lineWidth=1.5;
          ctx.strokeStyle="rgba(255,255,255,0.85)";
          ctx.strokeRect(x0,y0,s,s);
          if (ent.passKind){
            let fc="rgba(255,255,255,0.0)";
            if (ent.passKind==="infantry") fc="rgba(255,60,60,0.95)";
            else if (ent.passKind==="engineer") fc="rgba(60,140,255,0.95)";
            else if (ent.passKind==="sniper") fc="rgba(255,220,60,0.95)";
            ctx.fillStyle=fc;
            ctx.fillRect(x0+1,y0+1,s-2,s-2);
          }
        }
        ctx.restore();
        // Segmented HP blocks under unit
        drawUnitHpBlocks(ent, p);

        if (ent.grp) drawGroupBadge(p.x + ent.r*0.85, p.y - ent.r*0.85, ent.grp);

        if (ent.kind==="harvester"){
          const cr=clamp(ent.carry/(ent.carryMax||1),0,1);
          ctx.fillStyle="rgba(0,0,0,0.45)";
          ctx.fillRect(p.x-ent.r, p.y+ent.r+6, ent.r*2, 4);
          ctx.fillStyle="rgba(255,215,0,0.9)";
          ctx.fillRect(p.x-ent.r, p.y+ent.r+6, ent.r*2*cr, 4);
        }
      }
    }

    
    // Repair FX (wrench animation)
    drawWrenchFx();

    for (const bl of bullets){
      const p0=worldToScreen(bl.x,bl.y);

      if (bl.kind==="shell"){
        const t = Math.max(0, Math.min(1, bl.t||0));
        const z = Math.sin(Math.PI*t) * (bl.h||24); // fake height
        const p = {x:p0.x, y:p0.y - z};

        ctx.save();
        // glow
        ctx.globalAlpha = 0.95;
        ctx.shadowBlur = 26;
        ctx.shadowColor = "rgba(255,180,70,1.0)";
        ctx.fillStyle = "rgba(255,210,110,0.95)";
        ctx.beginPath();
        ctx.arc(p.x, p.y, 3.6, 0, Math.PI*2);
        ctx.fill();

        // core
        ctx.shadowBlur = 0;
        ctx.fillStyle = "rgba(255,245,190,1.0)";
        ctx.beginPath();
        ctx.arc(p.x, p.y, 1.6, 0, Math.PI*2);
        ctx.fill();
        ctx.restore();
      } else if (bl.kind==="missile"){
        const p=p0;
        const a=(bl.team===TEAM.PLAYER) ? "rgba(150,220,255,0.95)" : "rgba(255,150,150,0.95)";
        // trail
        ctx.strokeStyle=a;
        ctx.lineWidth=2;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - bl.vx*0.040, p.y - bl.vy*0.040);
        ctx.stroke();

        // missile body (small triangle pointing along velocity)
        const ang = Math.atan2(bl.vy, bl.vx);
        const len = 8.5;
        const wid = 4.2;
        const hx = Math.cos(ang), hy = Math.sin(ang);
        const px = -hy, py = hx;

        ctx.fillStyle=a;
        ctx.beginPath();
        ctx.moveTo(p.x + hx*len, p.y + hy*len);
        ctx.lineTo(p.x - hx*len*0.55 + px*wid, p.y - hy*len*0.55 + py*wid);
        ctx.lineTo(p.x - hx*len*0.55 - px*wid, p.y - hy*len*0.55 - py*wid);
        ctx.closePath();
        ctx.fill();
      } else {
        const p=p0;
        ctx.fillStyle=(bl.team===TEAM.PLAYER) ? "rgba(150,220,255,0.9)" : "rgba(255,150,150,0.9)";
        ctx.fillRect(p.x-2,p.y-2,4,4);
      }
    }

    for (const tr of traces){
      if ((tr.delay||0) > 0) continue;
      const a=worldToScreen(tr.x0,tr.y0);
      const b=worldToScreen(tr.x1,tr.y1);
      let alpha;
      if (tr.kind === "snip"){
        alpha = Math.min(1, tr.life / (tr.maxLife ?? 0.80));
      } else {
        alpha = Math.min(1, tr.life / (tr.kind==="mg" ? 0.14 : 0.09));
      }
      ctx.globalAlpha = alpha;

      if (tr.kind === "mg"){
        // Solid yellow tracer with glow (auto-rifle 느낌: 선이 깜빡이며 나감)
        ctx.save();
        ctx.lineCap = "round";

        // outer glow
        ctx.globalAlpha = alpha*0.85;
        ctx.shadowBlur = 22;
        ctx.shadowColor = "rgba(255, 195, 80, 1.0)";
        ctx.strokeStyle = "rgba(255, 220, 120, 0.70)";
        ctx.lineWidth = 6.2;
        ctx.beginPath(); ctx.moveTo(a.x,a.y); ctx.lineTo(b.x,b.y); ctx.stroke();

        // bright core
        ctx.shadowBlur = 0;
        ctx.globalAlpha = alpha;
        ctx.strokeStyle = "rgba(255, 248, 185, 1.0)";
        ctx.lineWidth = 2.6;
        ctx.beginPath(); ctx.moveTo(a.x,a.y); ctx.lineTo(b.x,b.y); ctx.stroke();

// tiny end-point glint for readability
ctx.globalAlpha = alpha;
ctx.fillStyle = "rgba(255, 245, 200, 1.0)";
ctx.beginPath();
ctx.arc(b.x, b.y, 2.2, 0, Math.PI*2);
ctx.fill();

        ctx.restore();
      } else if (tr.kind === "tmg"){
        // Turret MG tracer: thicker + brighter than infantry tracer
        ctx.save();
        ctx.lineCap = "round";

        // outer glow
        ctx.globalAlpha = alpha*0.95;
        ctx.shadowBlur = 34;
        ctx.shadowColor = "rgba(255, 170, 40, 1.0)";
        ctx.strokeStyle = "rgba(255, 210, 90, 0.85)";
        ctx.lineWidth = 10.5;
        ctx.beginPath(); ctx.moveTo(a.x,a.y); ctx.lineTo(b.x,b.y); ctx.stroke();

        // hot core
        ctx.shadowBlur = 0;
        ctx.globalAlpha = alpha;
        ctx.strokeStyle = "rgba(255, 250, 200, 1.0)";
        ctx.lineWidth = 4.8;
        ctx.beginPath(); ctx.moveTo(a.x,a.y); ctx.lineTo(b.x,b.y); ctx.stroke();

        // end glint
        ctx.globalAlpha = alpha;
        ctx.fillStyle = "rgba(255, 255, 220, 1.0)";
        ctx.beginPath(); ctx.arc(b.x, b.y, 3.0, 0, Math.PI*2); ctx.fill();

        ctx.restore();
      
      } else if (tr.kind === "snip"){
        // Sniper: glowing team-colored beam with thicker stroke + long afterimage
        ctx.save();
        ctx.lineCap = "round";
        const isP = (tr.team===TEAM.PLAYER);
        const glow = isP ? "rgba(0, 160, 255, 1.0)" : "rgba(255, 60, 60, 1.0)";
        const mid  = isP ? "rgba(0, 140, 255, 0.75)" : "rgba(255, 70, 70, 0.75)";
        const core = "rgba(255, 255, 255, 1.0)";

        // outer glow
        ctx.globalAlpha = alpha*0.80;
        ctx.shadowBlur = 28;
        ctx.shadowColor = glow;
        ctx.strokeStyle = mid;
        ctx.lineWidth = 7.2;
        ctx.beginPath(); ctx.moveTo(a.x,a.y); ctx.lineTo(b.x,b.y); ctx.stroke();

        // bright core
        ctx.shadowBlur = 0;
        ctx.globalAlpha = alpha;
        ctx.strokeStyle = core;
        ctx.lineWidth = 3.2;
        ctx.beginPath(); ctx.moveTo(a.x,a.y); ctx.lineTo(b.x,b.y); ctx.stroke();

        // end glint for readability
        ctx.globalAlpha = alpha;
        ctx.fillStyle = core;
        ctx.beginPath();
        ctx.arc(b.x, b.y, 3.2, 0, Math.PI*2);
        ctx.fill();

        ctx.restore();

      } else if (tr.kind === "impE"){
        // impact ellipse dodge (isometric)
        const c = worldToScreen(tr.x0, tr.y0);
        const range = tr.fx?.range ?? 48;
        const px = worldToScreen(tr.x0 + range, tr.y0);
        const py = worldToScreen(tr.x0, tr.y0 + range);
        const rx = Math.abs(px.x - c.x);
        const ry = Math.abs(py.y - c.y);

        ctx.save();
        ctx.beginPath();
        ctx.ellipse(c.x, c.y, rx, ry, 0, 0, Math.PI*2);

        ctx.fillStyle = (tr.team===TEAM.PLAYER) ? "rgba(255, 200, 90, 0.16)" : "rgba(255, 200, 90, 0.16)";
        ctx.strokeStyle = "rgba(255, 210, 110, 0.88)";
        ctx.lineWidth = tr.fx?.strokeW ?? 4.6;
        ctx.shadowBlur = 22;
        ctx.shadowColor = "rgba(255, 170, 60, 1.0)";
        ctx.fill();
        ctx.stroke();
        ctx.restore();
} else {
        ctx.strokeStyle=(tr.team===TEAM.PLAYER) ? "rgba(255,255,255,0.85)" : "rgba(255,210,210,0.85)";
        ctx.lineWidth=1.6;
        ctx.beginPath(); ctx.moveTo(a.x,a.y); ctx.lineTo(b.x,b.y); ctx.stroke();
      }

      ctx.globalAlpha=1;
    }

    
    // Muzzle flashes (soft radial gradient)
    for (const f of flashes){
      if ((f.delay||0) > 0) continue;
      const p=worldToScreen(f.x,f.y);
      const a = Math.min(1, f.life/0.06);
      ctx.globalAlpha = a;
      const r = f.r;
      const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
      g.addColorStop(0, "rgba(255, 245, 200, 0.95)");
      g.addColorStop(0.25, "rgba(255, 220, 120, 0.55)");
      g.addColorStop(1, "rgba(255, 200, 80, 0.0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI*2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }


    // Building destruction explosions
    drawExplosions(ctx);

    // Smoke ring (ground layer) should render *below* sprite FX like exp1
    drawSmokeWaves(ctx);

    // HQ sprite explosion (exp1) above the ground smoke ring
    drawDustPuffs(ctx);
    drawExp1Fxs(ctx);

    // Smoke plume (puffs) can sit above the explosion a bit
    drawSmokePuffs(ctx);
    drawDmgSmokePuffs(ctx);
// Building fire FX (critical HP)
    for (const f of fires){
      const p = worldToScreen(f.x, f.y);
      const a = clamp(f.life/0.6, 0, 1);
      const z = (typeof cam !== "undefined" && cam && typeof cam.zoom==="number") ? cam.zoom : 1;
      ctx.globalAlpha = a;
      // flame pillar (zoom-consistent)
      const h = (16 + f.rise*0.6) * z;
      ctx.fillStyle = "rgba(255, 120, 20, 0.95)";
      ctx.fillRect(p.x-1.6*z, p.y-h, 3.2*z, h);
      ctx.fillStyle = "rgba(255, 200, 80, 0.95)";
      ctx.fillRect(p.x-0.9*z, p.y-h*0.72, 1.8*z, h*0.72);
      ctx.globalAlpha = 1;
    }

// MG impact sparks (tiny yellow particles on ground)
    for (const p0 of impacts){
      const p=worldToScreen(p0.x,p0.y);
      ctx.globalAlpha = Math.min(1, p0.life/0.22);
      ctx.fillStyle = "rgba(255, 210, 90, 0.95)";
      ctx.fillRect(p.x-1.4, p.y-1.4, 2.8, 2.8);
      ctx.globalAlpha = 1;
    }

    // Blood (infantry death)
    drawBlood(ctx);

    // Repair mark (red cross) + subtle pulse
    for (const h of healMarks){
      const p = worldToScreen(h.x, h.y);
      const a = Math.min(1, h.life/0.45);
      const s = 10 + (1-a)*6;
      ctx.save();
      ctx.globalAlpha = a;
      ctx.strokeStyle = "rgba(255,255,255,0.85)";
      ctx.lineWidth = 3.2;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y - s);
      ctx.lineTo(p.x, p.y + s);
      ctx.moveTo(p.x - s, p.y);
      ctx.lineTo(p.x + s, p.y);
      ctx.stroke();
      ctx.strokeStyle = "rgba(220,40,40,0.95)";
      ctx.lineWidth = 2.0;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y - s);
      ctx.lineTo(p.x, p.y + s);
      ctx.moveTo(p.x - s, p.y);
      ctx.lineTo(p.x + s, p.y);
      ctx.stroke();
      ctx.restore();
    }

// Shell casings (small brass rectangles)
    for (const c of casings){
      if ((c.delay||0) > 0) continue;
      const p=worldToScreen(c.x, c.y);
      const y = p.y - (c.z||0)*0.18; // lift a bit while in air
      const a = Math.min(1, c.life/0.35);
      ctx.save();
      ctx.globalAlpha = a*0.95;
      ctx.translate(p.x, y);
      ctx.rotate(c.rot||0);
      // subtle glow for visibility
      ctx.shadowBlur = 8;
      ctx.shadowColor = "rgba(255, 210, 110, 0.55)";
      ctx.fillStyle = "rgba(255, 200, 90, 0.95)";
      ctx.fillRect(-(c.w||4)/2, -(c.h||2)/2, (c.w||4), (c.h||2));
      ctx.restore();
      ctx.globalAlpha = 1;
    }

    refreshPrimaryBuildingBadgesUI();
    drawClickWaves();
    drawPathFx();
    drawOrderFx();
    drawRallyPointsForSelection();
    drawHoverNameTooltip();

    if (state.drag.on && state.drag.moved){
      const r=rectFromDrag();
      ctx.strokeStyle="rgba(255,255,255,0.55)";
      ctx.lineWidth=1.5;
      ctx.strokeRect(r.x0,r.y0,r.x1-r.x0,r.y1-r.y0);
      ctx.fillStyle="rgba(255,255,255,0.06)";
      ctx.fillRect(r.x0,r.y0,r.x1-r.x0,r.y1-r.y0);
    }

    if (gameOver){
      ctx.fillStyle="rgba(0,0,0,0.55)";
      ctx.fillRect(0,0,W,H);
      ctx.fillStyle="#e6eef7";
      ctx.font="bold 44px system-ui";
      const msg="GAME OVER";
      ctx.fillText(msg, W/2-ctx.measureText(msg).width/2, H/2);
      ctx.font="16px system-ui";
      const sub="새로고침하면 재시작";
      ctx.fillText(sub, W/2-ctx.measureText(sub).width/2, H/2+28);
    }
  }

  function drawMini(){
    fitMini();
    const W=mmCanvas.width, H=mmCanvas.height;
    mmCtx.clearRect(0,0,W,H);

    const radar = hasRadarAlive(TEAM.PLAYER);
    const radarOff = !radar;
    if (radarOff){
      mmCtx.fillStyle="rgba(0,0,0,0.55)";
      mmCtx.fillRect(0,0,W,H);
      mmCtx.fillStyle="rgba(255,210,110,0.8)";
      mmCtx.font="bold 12px system-ui";
      mmCtx.fillText("RADAR REQUIRED", 10, 20);
      return; // minimap inactive without radar (no alert FX)
    }

    const lowPower = isUnderPower(TEAM.PLAYER);
    if (lowPower){
      drawMinimapNoise(W,H);
      return; // minimap disabled while low power
    }

    const sx=W/WORLD_W, sy=H/WORLD_H;

    mmCtx.fillStyle="rgba(0,0,0,0.35)";
    mmCtx.fillRect(0,0,W,H);

    mmCtx.fillStyle="rgba(0,0,0,0.55)";
    for (let ty=0; ty<MAP_H; ty+=2){
      for (let tx=0; tx<MAP_W; tx+=2){
        if (!explored[TEAM.PLAYER][idx(tx,ty)]) {
          mmCtx.fillRect(tx*TILE*sx, ty*TILE*sy, 2*TILE*sx, 2*TILE*sy);
        }
      }
    }
// Ore dots on minimap (only where explored)
mmCtx.fillStyle = "rgba(255,170,40,0.95)";
for (let ty=0; ty<MAP_H; ty+=2){
  for (let tx=0; tx<MAP_W; tx+=2){
    const ii = idx(tx,ty);
    if (!explored[TEAM.PLAYER][ii]) continue;
    if (ore[ii] > 0){
      mmCtx.fillRect((tx*TILE+TILE*0.5)*sx-1, (ty*TILE+TILE*0.5)*sy-1, 2, 2);
    }
  }
}



    for (const u of units){
      if (!u.alive) continue;
      const tx=tileOfX(u.x), ty=tileOfY(u.y);
      if (u.team===TEAM.ENEMY){
        if (radarOff) continue;
        if (inMap(tx,ty) && !explored[TEAM.PLAYER][idx(tx,ty)]) continue;
      }
      mmCtx.fillStyle = (u.team===TEAM.PLAYER) ? state.colors.player : state.colors.enemy;
      mmCtx.fillRect(u.x*sx-1, u.y*sy-1, 2, 2);
    }

    for (const b of buildings){
      if (!b.alive || b.civ) continue;
      if (b.team===TEAM.ENEMY){ if (radarOff) continue; if (!explored[TEAM.PLAYER][idx(b.tx,b.ty)]) continue; }
      mmCtx.fillStyle = (b.team===TEAM.PLAYER) ? state.colors.player : state.colors.enemy;
      mmCtx.fillRect(b.x*sx-2, b.y*sy-2, 4, 4);
    }


    
    // Blinking purple dot on minimap for recently hit player assets (4s)
    if (state.attackEvents && state.attackEvents.length){
      const now = state.t;
      const blinkA = 0.35 + 0.65*(0.5+0.5*Math.sin(now*10.0)); // fast blink
      for (let i=0;i<state.attackEvents.length;i++){
        const ev = state.attackEvents[i];
        if (!ev || now > (ev.until||-1e9)) continue;
        const px = ev.x * sx;
        const py = ev.y * sy;
        mmCtx.fillStyle = `rgba(200,0,255,${blinkA})`;
        mmCtx.beginPath();
        mmCtx.arc(px, py, 4.2, 0, Math.PI*2);
        mmCtx.fill();
        // subtle outer ring
        mmCtx.strokeStyle = `rgba(200,0,255,${0.25*blinkA})`;
        mmCtx.lineWidth = 2;
        mmCtx.beginPath();
        mmCtx.arc(px, py, 7.5, 0, Math.PI*2);
        mmCtx.stroke();
      }
    }

// Attack alert triangle FX (player assets hit)
    if (state.alertFx && state.alertFx.length){
      const now = state.t;
      const dur = 1.5;
      for (let i=state.alertFx.length-1;i>=0;i--){
        const fx = state.alertFx[i];
        const age = now - fx.t0;
        if (age > dur){ state.alertFx.splice(i,1); continue; }
        const p = 1 - (age/dur); // 1 -> 0
        const cx = fx.x * sx;
        const cy = fx.y * sy;

        const base = 34; // minimap px (half-size before scaling)
        // Start VERY large, shrink into the target dot
        const scale = 0.22 + 2.45*p; // ~2.67 -> 0.22
        const rot = age * 1.35;

        // Helper: point on square perimeter (clockwise), f in [0,1)
        const perimPt = (f)=>{
          f = (f%1+1)%1;
          const L = base*2;
          const P = L*4;
          let d = f*P;
          // top (-base,-base) -> (base,-base)
          if (d < L) return {x:-base + d, y:-base};
          d -= L;
          // right (base,-base) -> (base,base)
          if (d < L) return {x:base, y:-base + d};
          d -= L;
          // bottom (base,base) -> (-base,base)
          if (d < L) return {x:base - d, y:base};
          d -= L;
          // left (-base,base) -> (-base,-base)
          return {x:-base, y:base - d};
        };

        mmCtx.save();
        mmCtx.translate(cx, cy);
        mmCtx.rotate(rot);
        mmCtx.scale(scale, scale);

        const a = (0.25 + 0.75*p);
        // Purple square outline
        mmCtx.strokeStyle = `rgba(200,0,255,${a})`;
        mmCtx.lineWidth = 4.6;
        mmCtx.beginPath();
        mmCtx.rect(-base, -base, base*2, base*2);
        mmCtx.stroke();

        // Two bright white dots running along the outline (clockwise & counterclockwise)
        const spd = 0.95; // loops per second
        const f1 = (age*spd) % 1;
        const f2 = (1 - ((age*spd + 0.37) % 1));
        const dotR = 4.2;

        const drawDotTrail = (f, dir)=>{
          // dir: +1 clockwise, -1 counterclockwise
          for (let k=7;k>=0;k--){
            const ff = f - dir*(k*0.018);
            const pt = perimPt(ff);
            const aa = (0.06 + 0.14*p) * (k/8); // faint trail
            mmCtx.fillStyle = `rgba(255,255,255,${aa})`;
            mmCtx.beginPath();
            mmCtx.arc(pt.x, pt.y, dotR*(0.55 + 0.45*(k/8)), 0, Math.PI*2);
            mmCtx.fill();
          }
          const pt = perimPt(f);
          mmCtx.fillStyle = `rgba(255,255,255,${0.78 + 0.18*p})`;
          mmCtx.beginPath();
          mmCtx.arc(pt.x, pt.y, dotR, 0, Math.PI*2);
          mmCtx.fill();
        };

        drawDotTrail(f1, +1);
        drawDotTrail(f2, -1);

        mmCtx.restore();
      }
    }
  }

  function setButtonText(){
    btnRef.textContent=`정제소`;
    btnPow.textContent=`발전소`;
    btnBar.textContent=`막사`;
    btnFac.textContent=`군수공장`;
    btnRad.textContent=`레이더`;
    btnTur.textContent=`터렛`;
    if (btnSell) btnSell.textContent =`매각(D)`;
  }

  function clearWorld(){
    units.length=0; buildings.length=0; bullets.length=0; traces.length=0;
    buildOcc.fill(0);
    explored[TEAM.PLAYER].fill(0);
    visible[TEAM.PLAYER].fill(0);
    explored[TEAM.ENEMY].fill(0);
    visible[TEAM.ENEMY].fill(0);
    nextId=1;
    state.selection.clear();
    state.build.active=false; state.build.kind=null;
    prodFIFO.barracks.length=0; prodFIFO.factory.length=0;
    prodTotal.infantry=0; prodTotal.engineer=0; prodTotal.tank=0; prodTotal.harvester=0;
    state.player.money=START_MONEY; state.enemy.money=START_MONEY;
    gameOver=false;
    state.lastSingleId=null; state.lastSingleKind=null;
  }

  function findFootprintSpotNear(kind, nearTx, nearTy, tries=260){
    const spec=BUILD[kind];
    for (let i=0;i<tries;i++){
      const tx=nearTx + ((Math.random()*18)|0) - 9;
      const ty=nearTy + ((Math.random()*18)|0) - 9;
      if (!isBlockedFootprint(tx,ty,spec.tw,spec.th)) return {tx,ty};
    }
    return {tx: clamp(nearTx,0,MAP_W-spec.tw), ty: clamp(nearTy,0,MAP_H-spec.th)};
  }

  // v29: carve a buildable "base pad" so large structures can be placed near HQ.
  // This removes rocks/ore inside the pad area (RA2-like clear concrete zone).
  function carveBuildPad(centerTx, centerTy, rTiles){
    const x0 = clamp(centerTx - rTiles, 0, MAP_W-1);
    const x1 = clamp(centerTx + rTiles, 0, MAP_W-1);
    const y0 = clamp(centerTy - rTiles, 0, MAP_H-1);
    const y1 = clamp(centerTy + rTiles, 0, MAP_H-1);
    for (let ty=y0; ty<=y1; ty++){
      for (let tx=x0; tx<=x1; tx++){
        const i = idx(tx,ty);
        // Keep existing buildings intact (should be none at this moment, but safe).
        if (buildOcc[i]===1) continue;
        terrain[i] = 0;   // ground
        ore[i] = 0;       // no ore blocking construction
      }
    }
  }


  function placeStart(spawn){
    clearWorld();

    let a, b;
    if (spawn==="left"){
      a = {tx: Math.floor(MAP_W*0.22), ty: Math.floor(MAP_H*0.62)};
      b = {tx: Math.floor(MAP_W*0.78), ty: Math.floor(MAP_H*0.38)};
    } else if (spawn==="center"){
      // Spread bases farther apart to reduce early overlap/spawn blocking
      a = {tx: Math.floor(MAP_W*0.25), ty: Math.floor(MAP_H*0.65)};
      b = {tx: Math.floor(MAP_W*0.75), ty: Math.floor(MAP_H*0.35)};
    } else {
      a = {tx: Math.floor(MAP_W*0.78), ty: Math.floor(MAP_H*0.62)};
      b = {tx: Math.floor(MAP_W*0.22), ty: Math.floor(MAP_H*0.38)};
    }

    // v29: ensure enough buildable area around start bases
    carveBuildPad(a.tx, a.ty, 15);
    carveBuildPad(b.tx, b.ty, 15);


    function safePlace(team, kind, nearTx, nearTy){
      const spot=findFootprintSpotNear(kind, nearTx, nearTy, 420);
      return addBuilding(team, kind, spot.tx, spot.ty);
    }

    const pHQ = safePlace(TEAM.PLAYER,"hq", a.tx-2, a.ty-2);
    const eHQ = safePlace(TEAM.ENEMY, "hq", b.tx-2, b.ty-2);

    safePlace(TEAM.PLAYER,"power",    pHQ.tx+6, pHQ.ty-1);
    safePlace(TEAM.PLAYER,"barracks", pHQ.tx+6, pHQ.ty+4);
    const pRef = safePlace(TEAM.PLAYER,"refinery", pHQ.tx-1, pHQ.ty+7);

    safePlace(TEAM.ENEMY,"power",    eHQ.tx-3, eHQ.ty+4);
    safePlace(TEAM.ENEMY,"barracks", eHQ.tx-4, eHQ.ty-2);
    const eRef = safePlace(TEAM.ENEMY,"refinery", eHQ.tx+4, eHQ.ty-6);
    // 굴착기는 정제소 완성 시 무료 스폰으로만 생성됨

    placeCivOreGens();

    recomputePower();
    updateVision();
    centerCameraOn(pHQ.x,pHQ.y);
    updateSelectionUI();
  }

  // ✅ 시작 버튼 이벤트 복구 (이게 빠지면 "아무 버튼도 안눌림"처럼 보임)
  

function spawnStartingUnits(){
  // Spawn 3 snipers + 3 IFVs near player HQ, but NEVER inside building footprints.
  let hq=null;
  for (const b of buildings){
    if (!b || !b.alive) continue;
    if (b.team===TEAM.PLAYER && !b.civ && b.kind==="hq"){ hq=b; break; }
  }

  function inBounds(tx,ty){ return tx>=0 && ty>=0 && tx<MAP_W && ty<MAP_H; }
  function isTileFree(tx,ty){
    if (!inBounds(tx,ty)) return false;
    const k = ty*MAP_W + tx;
    if (buildOcc[k]) return false;          // building footprint
    if (occAll && occAll[k]) return false;  // any unit already here
    if (occResId && occResId[k]) return false; // reserved by someone else
    return true;
  }

  function collectSpawnTilesAroundFootprint(b, need){
    const tiles=[];
    const cx = b.tx + b.tw*0.5;
    const cy = b.ty + b.th*0.5;

    // ring around the building footprint (perimeter of expanded rect)
    for (let r=1; r<=14 && tiles.length<need*6; r++){
      const x0 = Math.floor(b.tx - r);
      const y0 = Math.floor(b.ty - r);
      const x1 = Math.ceil(b.tx + b.tw - 1 + r);
      const y1 = Math.ceil(b.ty + b.th - 1 + r);

      for (let ty=y0; ty<=y1; ty++){
        for (let tx=x0; tx<=x1; tx++){
          const onPerimeter = (tx===x0 || tx===x1 || ty===y0 || ty===y1);
          if (!onPerimeter) continue;
          if (!isTileFree(tx,ty)) continue;
          const dx = (tx+0.5) - cx, dy = (ty+0.5) - cy;
          tiles.push({tx,ty, d:dx*dx+dy*dy});
        }
      }
    }
    tiles.sort((a,b)=>a.d-b.d);
    // unique
    const out=[];
    const used=new Set();
    for (const t of tiles){
      const key=t.tx+","+t.ty;
      if (used.has(key)) continue;
      used.add(key);
      out.push(t);
      if (out.length>=need) break;
    }
    return out;
  }

  // refresh occupancy once (buildOcc already set by buildings)
  clearOcc();
  for (const u of units){
    if (!u || !u.alive) continue;
    const tx = tileOfX(u.x), ty = tileOfY(u.y);
    if (tx>=0 && ty>=0 && tx<MAP_W && ty<MAP_H){
      occAll[ty*MAP_W+tx] = 1;
    }
  }

  const need = 6;
  let spawnTiles=[];
  if (hq){
    spawnTiles = collectSpawnTilesAroundFootprint(hq, need);
  }
  // fallback: any free tiles around camera center
  if (spawnTiles.length<need){
    const c = tileOfX(cam.x + (W*0.5)/cam.z);
    const r = tileOfY(cam.y + (H*0.5)/cam.z);
    for (let rr=1; rr<=18 && spawnTiles.length<need; rr++){
      for (let ty=r-rr; ty<=r+rr; ty++){
        for (let tx=c-rr; tx<=c+rr; tx++){
          if (!isTileFree(tx,ty)) continue;
          spawnTiles.push({tx,ty});
          if (spawnTiles.length>=need) break;
        }
        if (spawnTiles.length>=need) break;
      }
    }
  }

  function spawnAt(kind, tile){
    const p = tileToWorldCenter(tile.tx, tile.ty);
    const u = addUnit(TEAM.PLAYER, kind, p.x, p.y);
    // mark occupancy immediately so later spawns don't collide
    const k = tile.ty*MAP_W + tile.tx;
    occAll[k]=1;
    return u;
  }

  // 3 snipers
  for (let i=0;i<3;i++){
    const t = spawnTiles[i] || spawnTiles[0];
    const u = spawnAt("sniper", t);
    u.cloaked=false; u.cloakBreak=999;
  }
  // 3 IFVs
  for (let i=0;i<3;i++){
    const t = spawnTiles[3+i] || spawnTiles[0];
    spawnAt("ifv", t);
  }
}


startBtn.addEventListener("click", () => {
    state.colors.player = pColorInput.value;
    state.colors.enemy  = eColorInput.value;

    // Apply chosen colors to team palette (for magenta->team recolor) and clear caches.
    try{
      const prgb = hexToRgb(state.colors.player) || [80,180,255];
      const ergb = hexToRgb(state.colors.enemy)  || [255,60,60];
      TEAM_ACCENT.PLAYER = prgb;
      TEAM_ACCENT.ENEMY  = ergb;

      // Sprite recolor caches are keyed only by teamId, so must be cleared when colors change.
      _teamSpriteCache.clear();
      INF_TEAM_SHEET_IDLE.clear();
      INF_TEAM_SHEET_ATK.clear();
      INF_TEAM_SHEET_DIE.clear();
      INF_TEAM_SHEET_MOV.clear();
      INF_TEAM_SHEET_MOV_NE.clear();
      INF_TEAM_SHEET_MOV_N.clear();
      INF_TEAM_SHEET_MOV_NW.clear();
      INF_TEAM_SHEET_MOV_W.clear();
      INF_TEAM_SHEET_MOV_SW.clear();
      INF_TEAM_SHEET_MOV_S.clear();
      INF_TEAM_SHEET_MOV_SE.clear();
    }catch(_e){}


    fogEnabled = !(fogOffChk && fogOffChk.checked);

    // Debug: player-only instant production/build completion (1s)
    state.debug = state.debug || {};
    state.debug.fastProd = !!(fastProdChk && fastProdChk.checked);

    START_MONEY = startMoney;
    state.player.money = START_MONEY;
    state.enemy.money  = START_MONEY;

    placeStart(spawnChoice);
    spawnStartingUnits();
    pregame.style.display = "none";
    // Start BGM on user gesture (autoplay-safe)
    BGM.userStart();
    running = true;
  });

  let last=performance.now();
  let fpsAcc=0, fpsN=0, fpsT=0;

  

  // =========================
  // Pause menu + BGM system
  // =========================
  let pauseMenuOpen = false;
  let pauseStartMs = null; // real-time ms when pause menu opened (for freezing battle timer)

  // IMPORTANT: pause overlay DOM is declared at the very bottom of the HTML,
  // so querying it here can return null depending on parse order.
  // We therefore do lazy lookup every time, with a small cache.
  const __pmCache = { overlay:null, refs:null };
  function getPauseMenuRefs(){
  return {
    overlay: document.getElementById("pauseOverlay"),
    track: document.getElementById("pmTrackName"),
    prev: document.getElementById("pmPrev"),
    play: document.getElementById("pmPlay"),
    next: document.getElementById("pmNext"),
    vol: document.getElementById("pmVol"),
    volVal: document.getElementById("pmVolVal"),
    bright: document.getElementById("pmBright"),
    brightVal: document.getElementById("pmBrightVal"),
    time: document.getElementById("pmTime"),
    eq: document.getElementById("pmEQ"),
    resume: document.getElementById("pmResume"),
    exit: document.getElementById("pmExit"),
  };
}

  function setGameBrightness(v){
    const val = Math.max(0.5, Math.min(1.6, v));
    document.documentElement.style.setProperty("--game-brightness", String(val));
    const refs = getPauseMenuRefs();
    if (refs.bright) refs.bright.value = String(val);
    if (refs.brightVal) refs.brightVal.textContent = val.toFixed(2);
    try { localStorage.setItem("rts_brightness", String(val)); } catch(_){}
  }
  // restore brightness

  try {
    let saved = 1;
    try { saved = parseFloat(localStorage.getItem("rts_brightness") || "1"); } catch(_){ saved = 1; }
    if (Number.isFinite(saved)) setGameBrightness(saved);
    else setGameBrightness(1);
  } catch(_){ setGameBrightness(1); }

  const BGM = (() => {
  // Tracks are local files (uploaded). Two playlists and auto-switch by combat.
  const peaceTracks = ASSET.music.peace;
  const battleTracks = ASSET.music.battle;

    const allTracks = ASSET.music.all;
const audio = new Audio();
  audio.preload = "auto";
  audio.loop = false; // we advance manually
  audio.volume = 0.70;

  // WebAudio analyser (for EQ bars). Created on user gesture.
  let _ctx = null;
  let _analyser = null;
  let _freq = null;

  function ensureAnalyser(){
    if (_analyser) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try {
      _ctx = new AC();
      const src = _ctx.createMediaElementSource(audio);
      _analyser = _ctx.createAnalyser();
      _analyser.fftSize = 64; // 32 bins
      _freq = new Uint8Array(_analyser.frequencyBinCount);
      src.connect(_analyser);
      _analyser.connect(_ctx.destination);
    } catch(e) {
      console.warn("[BGM] analyser init failed", e);
      _ctx = null; _analyser = null; _freq = null;
    }
  }

  function resumeCtx(){
    try { if (_ctx && _ctx.state === "suspended") _ctx.resume(); } catch(_e){}
  }

  // Two-cycle shuffles
  const state = {
    mode: "peace",        // current playback mode
    desiredMode: "peace", // what gameplay wants (battle while combat is active)
    order: { peace: [], battle: [], all: [] },
    idx:   { peace: 0,  battle: 0,  all: 0 },
    fade: { active:false, t:0, dur:0.55, from:0, to:0, nextSrc:null },
    viz:  { t:0 },
  };

  function shuffle(arr){
    for (let i=arr.length-1;i>0;i--) {
      const j = (Math.random()*(i+1))|0;
      const t = arr[i]; arr[i]=arr[j]; arr[j]=t;
    }
    return arr;
  }

  function tracksFor(mode){
    if (mode==="battle") return battleTracks;
    if (mode==="peace") return peaceTracks;
    return allTracks;
  }

  function refill(mode){
    const src = tracksFor(mode);
    state.order[mode] = shuffle(src.slice());
    state.idx[mode] = 0;
  }

  function getNextTrack(mode){
    if (!state.order[mode].length) refill(mode);
    if (state.idx[mode] >= state.order[mode].length) refill(mode);
    const tr = state.order[mode][state.idx[mode]++] || "";
    return tr;
  }

  function setTrackNow(src){
    if (!src) return;
    ensureAnalyser();
    resumeCtx();
    if (audio.src !== src) audio.src = src;
    try { audio.currentTime = 0; } catch(_e){}
    audio.play().catch(()=>{ /* autoplay policy, ignore */ });
  }

  function fadeToTrack(nextSrc) {
    if (!nextSrc) return;
    ensureAnalyser();
    resumeCtx();

    // If nothing is playing yet, just start.
    if (!audio.src) {
      setTrackNow(nextSrc);
      return;
    }

    // Start fade out
    state.fade.active = true;
    state.fade.t = 0;
    state.fade.from = audio.volume;
    state.fade.to = 0;
    state.fade.nextSrc = nextSrc;
  }

  function applyFade(dt){
    if (!state.fade.active) return;
    state.fade.t += dt;
    const a = Math.min(1, state.fade.t / Math.max(0.001, state.fade.dur));
    const v = state.fade.from + (state.fade.to - state.fade.from) * a;
    audio.volume = Math.max(0, Math.min(1, v));

    if (a >= 1) {
      if (state.fade.to === 0 && state.fade.nextSrc) {
        // switch track at silence, then fade in
        const next = state.fade.nextSrc;
        state.fade.nextSrc = null;
        try { audio.pause(); } catch(_e){}
        audio.src = next;
        try { audio.currentTime = 0; } catch(_e){}
        audio.play().catch(()=>{});
        state.fade.from = 0;
        state.fade.to = (window.__bgmUserVol!=null) ? window.__bgmUserVol : 0.55;
        state.fade.t = 0;
      } else {
        // finished fade in
        state.fade.active = false;
        // re-apply user volume
        if (window.__bgmUserVol!=null) audio.volume = window.__bgmUserVol;
      }
    }
  }

  function setVol(v){
    const vv = Math.max(0, Math.min(1, Number(v)||0));
    audio.volume = vv;
    updateUI();
  }

  // Manual controls
  function next(){
    const tr = getNextTrack("all");
    fadeToTrack(tr);
    updateUI();
  }
  function prev(){
    const mode = "all";
    state.idx[mode] = Math.max(0, state.idx[mode]-2);
    const tr = getNextTrack(mode);
    fadeToTrack(tr);
    updateUI();
  }
  function toggle(){
    ensureAnalyser();
    resumeCtx();
    if (audio.paused) audio.play().catch(()=>{}); else audio.pause();
    updateUI();
  }

  // Battle BGM sensitivity control:
  // - Entering battle: switch immediately (fade) from peace -> battle.
  // - Staying in battle: NEVER change track until it ends.
  // - Leaving battle: let current track finish; when it ends, go peace.
  function requestMode(desired){
    state.desiredMode = desired;
    if (desired === "battle" && state.mode !== "battle"){
      state.mode = "battle";
      const tr = getNextTrack("battle");
      fadeToTrack(tr);
      updateUI();
    }
  }

  // Called from game loop: (nowMs, combatUntilMs)
  function auto(nowMs, combatUntilMs){
    const desired = (nowMs < combatUntilMs) ? "battle" : "peace";
    requestMode(desired);
  }

  // UI wiring
  let ui = null; // {track, btnPlay, vol, time, eq}
  function mountUI(refs){
    ui = refs || null;
    if (!ui) return;

    // init EQ bars (multiple sticks)
    if (ui.eq){
      ui.eq.innerHTML = "";
      const bars = 12;
      for (let i=0;i<bars;i++){
        const b = document.createElement("div");
        b.className = "bar";
        ui.eq.appendChild(b);
      }
    }

    // seek bar
    if (ui.seek){
      ui.seek.value = 0;
      ui._seeking = false;
      ui.seek.addEventListener("pointerdown", ()=>{ ui._seeking = true; });
      window.addEventListener("pointerup", ()=>{ ui._seeking = false; });
      ui.seek.addEventListener("input", ()=>{
        if (!audio || !isFinite(audio.duration) || audio.duration <= 0) return;
        const v = Math.max(0, Math.min(1000, Number(ui.seek.value||0))) / 1000;
        audio.currentTime = v * audio.duration;
      });
    }

    updateUI();
  }

  function fmtTime(sec){
    if (!isFinite(sec) || sec < 0) return "0:00";
    sec = Math.floor(sec);
    const m = Math.floor(sec/60);
    const s = sec%60;
    return m + ":" + String(s).padStart(2,"0");
  }

  function prettyName(){
    const raw = audio.src ? audio.src.split("/").pop() : "";
    return raw ? raw.replace(/\.[^/.]+$/,"") : "";
  }

  function updateUI(){
    if (!ui) return;
    if (ui.track) ui.track.textContent = prettyName() || "(none)";
    if (ui.btnPlay) ui.btnPlay.textContent = audio.paused ? "▶" : "⏸";
    if (ui.vol) ui.vol.value = String((window.__bgmUserVol!=null?window.__bgmUserVol:audio.volume));
    if (ui.time) ui.time.textContent = fmtTime(audio.currentTime) + " / " + fmtTime(audio.duration);
    if (ui.seek && isFinite(audio.duration) && audio.duration>0 && !ui._seeking){
      ui.seek.value = String(Math.max(0, Math.min(1000, Math.round((audio.currentTime/audio.duration)*1000))));
    }
  }

  function updateViz(dt){
    if (!ui) return;
    if (ui.time) ui.time.textContent = fmtTime(audio.currentTime) + " / " + fmtTime(audio.duration);
    if (ui.seek && isFinite(audio.duration) && audio.duration>0 && !ui._seeking){
      ui.seek.value = String(Math.max(0, Math.min(1000, Math.round((audio.currentTime/audio.duration)*1000))));
    }
    if (!ui.eq) return;

    // animate at ~20fps
    state.viz.t += dt;
    if (state.viz.t < 0.05) return;
    state.viz.t = 0;

    if (!_analyser || !_freq) {
      // no analyser: gentle idle motion
      const kids = ui.eq.children;
      const n = kids.length||0;
      for (let i=0;i<n;i++) {
        const k = kids[i];
        const v = 0.25 + 0.55*Math.random();
        k.style.transform = `scaleY(${v.toFixed(3)})`;
      }
      return;
    }

    try {
      _analyser.getByteFrequencyData(_freq);
      const kids = ui.eq.children;
      const bars = kids.length || 0;
      const bins = _freq.length || 1;
      for (let i=0;i<bars;i++) {
        const bi = Math.min(bins-1, Math.floor(i * bins / bars));
        const v = _freq[bi] / 255;
        // make it pop a bit even at low volume
        const vv = Math.max(0.06, Math.min(1, Math.pow(v, 0.55) * 1.65));
        kids[i].style.transform = `scaleY(${vv.toFixed(3)})`;
      }
    } catch(_e) {}
  }

  function start(){
    // called on user gesture via shim (BGM.userStart)
    ensureAnalyser();
    resumeCtx();
    state.mode = "peace";
    state.desiredMode = "peace";
    const tr = getNextTrack("peace");
    setTrackNow(tr);
    updateUI();
  }

  function setMode(mode){
    // manual override: immediate switch
    const m = (mode==="battle") ? "battle" : "peace";
    state.mode = m;
    state.desiredMode = m;
    const tr = getNextTrack(m);
    fadeToTrack(tr);
    updateUI();
  }

  function monitor(dt=0.016){
    applyFade(dt);
    updateViz(dt);

    // Auto advance when track ends (and apply desiredMode at boundary)
    if (audio.ended && !state.fade.active){
      // If we were in battle but battle already ended, switch to peace on boundary.
      if (state.mode === "battle" && state.desiredMode === "peace") {
        state.mode = "peace";
      }
      // If we are in peace but battle became desired (rare because we switch immediately), honor it here.
      if (state.mode === "peace" && state.desiredMode === "battle") {
        state.mode = "battle";
      }

      const tr = getNextTrack(state.mode);
      setTrackNow(tr);
      updateUI();
    }
  }

  audio.addEventListener("ended", ()=>{ /* monitor() handles */ });

  return { audio, start, next, prev, toggle, setVol, setMode, auto, monitor, mountUI };
})();
// --- BGM compatibility shim (older code expects these) ---
BGM._started = false;
Object.defineProperty(BGM, "started", { get(){ return !!BGM._started; }});
Object.defineProperty(BGM, "master", {
  get(){ return (window.__bgmUserVol!=null) ? window.__bgmUserVol : BGM.audio.volume; },
  set(v){ window.__bgmUserVol = Math.max(0, Math.min(1, Number(v)||0)); BGM.setVol(window.__bgmUserVol); }
});
Object.defineProperty(BGM, "trackName", {
  get(){ return BGM.audio.src ? BGM.audio.src.split("/").pop() : ""; }
});
BGM.userStart = () => { if (BGM._started) return; BGM._started = true; BGM.start(); };
BGM.togglePlay = () => { BGM.toggle(); };
BGM.setMasterVolume = (v) => { BGM.master = v; };
BGM.stopAll = () => { try{ BGM.audio.pause(); BGM.audio.currentTime = 0; }catch(e){} };
const __bgmOldMonitor = BGM.monitor;
BGM.monitor = (dt=0.016) => __bgmOldMonitor(dt);
;;

  function togglePauseMenu(force){
    const next = (typeof force === "boolean") ? force : !pauseMenuOpen;
    if (next === pauseMenuOpen) return;

    // Freeze battle/peace switching while paused (do NOT let combat timer elapse during pause)
    if (next){
      pauseStartMs = performance.now();
      // latch combat state so it doesn't flip to peace while paused
      window.__combatLatchedWhilePaused = true;
    } else {
      if (pauseStartMs != null){
        const delta = performance.now() - pauseStartMs;
        if (typeof window.__combatUntil === "number" && isFinite(window.__combatUntil) && window.__combatUntil > 0){
          window.__combatUntil += delta;
        }
        pauseStartMs = null;
      }
      window.__combatLatchedWhilePaused = false;
    }

    pauseMenuOpen = next;

    const refs = getPauseMenuRefs();
    if (!refs.overlay) return;

    // Ensure visible regardless of CSS class order
    refs.overlay.classList.toggle("show", pauseMenuOpen);
    refs.overlay.style.display = pauseMenuOpen ? "flex" : "none";
    refs.overlay.setAttribute("aria-hidden", pauseMenuOpen ? "false" : "true");

    if (pauseMenuOpen){
      if (refs.track){ const n=(BGM.trackName||"(대기중)"); refs.track.textContent = n.replace(/\.[^/.]+$/,""); }
      if (refs.vol) refs.vol.value = String(BGM.master);
      if (refs.bright) refs.bright.value = String(parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--game-brightness")) || 1);
      if (refs.brightVal) refs.brightVal.textContent = (parseFloat(refs.bright.value)||1).toFixed(2);
      wirePauseMenuUI(); // lazy wire on first open
    }
  }

// Global ESC handler (capture): make sure pause/options always toggles
  document.addEventListener("keydown",(e)=>{
    const esc = (e.key==="Escape" || e.key==="Esc" || e.code==="Escape" || e.keyCode===27);
    if (!esc) return;
    togglePauseMenu();
    e.preventDefault();
    e.stopImmediatePropagation();
  }, true);

  let __pmWired = false;
  function wirePauseMenuUI(){
    if (__pmWired) return;
    const refs = getPauseMenuRefs();
    if (!refs.overlay) return;

    __pmWired = true;

    // Mount BGM UI (track title / play btn / volume / EQ / time)
    if (typeof BGM !== "undefined" && BGM && typeof BGM.mountUI === "function"){
      BGM.mountUI({ track: refs.track, btnPlay: refs.play, vol: refs.vol, time: refs.time, eq: refs.eq });
    }


    if (refs.vol) refs.vol.addEventListener("input", ()=> BGM.setMasterVolume(parseFloat(refs.vol.value)));
    if (refs.bright) refs.bright.addEventListener("input", ()=> setGameBrightness(parseFloat(refs.bright.value)));
    if (refs.resume) refs.resume.addEventListener("click", ()=> togglePauseMenu(false));
    if (refs.exit) refs.exit.addEventListener("click", ()=> {
      BGM.stopAll?.();
      location.reload();
    });
    if (refs.prev) refs.prev.addEventListener("click", ()=> BGM.prev());
    if (refs.next) refs.next.addEventListener("click", ()=> BGM.next());
    if (refs.play) refs.play.addEventListener("click", ()=> BGM.togglePlay ? BGM.togglePlay() : (BGM.toggle ? BGM.toggle() : null));

    // Do NOT auto-close when clicking the dark outside area.
    // (User explicitly wants pause/options to stay open unless they press ESC or click a button.)
    refs.overlay.addEventListener("mousedown", (e)=>{
      e.stopPropagation();
      if (e.target === refs.overlay){
        e.preventDefault();
      }
    });
    refs.overlay.addEventListener("wheel", (e)=>{ e.stopPropagation(); }, { passive:false });
  }

  // Make sure UI is wired after full parse
  window.addEventListener("load", wirePauseMenuUI);

function validateWorld(){
  // Lightweight invariants to catch "silent" logic bugs early.
  const seen = new Set();

  for (const u of units){
    if (!u) { _assert(false, "unit is null"); continue; }
    _assert(Number.isFinite(u.x) && Number.isFinite(u.y), "unit has invalid position");
    _assert(Number.isFinite(u.hp) && Number.isFinite(u.maxHp), "unit has invalid hp");
    _assert(u.maxHp>0, "unit maxHp <= 0");
    _assert(u.hp <= u.maxHp + 1e-6, "unit hp > maxHp");
    _assert(u.r != null, "unit missing radius");
    _assert(!seen.has(u.id), "duplicate entity id: "+u.id);
    seen.add(u.id);
  }

  for (const b of buildings){
    if (!b) { _assert(false, "building is null"); continue; }
    _assert(Number.isFinite(b.x) && Number.isFinite(b.y), "building has invalid position");
    _assert(Number.isFinite(b.hp) && Number.isFinite(b.maxHp), "building has invalid hp");
    _assert(b.maxHp>0, "building maxHp <= 0");
    _assert(b.hp <= b.maxHp + 1e-6, "building hp > maxHp");
    _assert(Number.isInteger(b.tx) && Number.isInteger(b.ty) && Number.isInteger(b.tw) && Number.isInteger(b.th),
            "building missing tile footprint");
    _assert(!seen.has(b.id), "duplicate entity id: "+b.id);
    seen.add(b.id);
  }

  // Occupancy array invariants (basic)
  _assert(Array.isArray(occAll) && occAll.length === W*H, "occAll size mismatch");
  _assert(Array.isArray(occBld) && occBld.length === W*H, "occBld size mismatch");
}

function sanityCheck(){
    const must = [
      'setPathTo','findPath','issueIFVRepair','boardUnitIntoIFV','unboardIFV','resolveUnitOverlaps'
    ];
    const missing = must.filter(n=> typeof window[n] !== 'function');
    if (missing.length){
      console.error('SanityCheck: missing functions:', missing);
      toast('스크립트 오류: '+missing.join(', '));
    }
  }

  function tick(now){
    fitCanvas();
    fitMini();

    const dt = Math.min(0.033, (now-last)/1000);
    last=now;

    if (running && !gameOver && !pauseMenuOpen){
      state.t += dt;
      updateCamShake(dt);
      updateExp1Fxs(dt);
      updateSmoke(dt);
      updateBlood(dt);


      const sp = cam.speed*dt;
      if (keys.has("arrowleft")) cam.x -= sp;
      if (keys.has("arrowright")) cam.x += sp;
      if (keys.has("arrowup")) cam.y -= sp;
      if (keys.has("arrowdown")) cam.y += sp;
      clampCamera();

      feedProducers();
      tickSidebarBuild(dt);
      tickEnemySidebarBuild(dt);
      updateSidebarButtons();

      updateVision();
      tickProduction(dt);
      tickRepairs(dt);
      tickCivOreGen(dt);
      tickUnits(dt);
      tickTurrets(dt);
      tickBullets(dt);

      for (let i=units.length-1;i>=0;i--) if (!units[i].alive) units.splice(i,1);
      for (let i=buildings.length-1;i>=0;i--) if (!buildings[i].alive) buildings.splice(i,1);

      if (DEV_VALIDATE){
        state._valAcc = (state._valAcc || 0) + dt;
        if (state._valAcc >= 0.5){
          state._valAcc = 0;
          validateWorld();
        }
      }

      aiTick();
      recomputePower();
      updateSelectionUI();
      sanityCheck();
  setButtonText();

  // bind price tooltips (one-time)
  bindPriceTip(btnPow, "power");
  bindPriceTip(btnRef, "refinery");
  bindPriceTip(btnBar, "barracks");
  bindPriceTip(btnFac, "factory");
  bindPriceTip(btnRad, "radar");
  bindPriceTip(btnTur, "turret");
  bindPriceTip(btnInf, "infantry");
  bindPriceTip(btnEng, "engineer");
  bindPriceTip(btnSnp, "sniper");
  bindPriceTip(btnTnk, "tank");
  bindPriceTip(btnHar, "harvester");
  bindPriceTip(btnIFV, "ifv");

      drawMini();
    }

    updateProdBadges();
    draw();

    fpsAcc += 1/dt; fpsN++; fpsT += dt;
    if (fpsT>=0.5){
      if (uiFps) uiFps.textContent = `${Math.round(fpsAcc/fpsN)} fps`;
      fpsAcc=0; fpsN=0; fpsT=0;
    }

    // BGM auto-switch (peace/battle) + crossfade monitor
    BGM.auto((pauseMenuOpen && pauseStartMs!=null) ? pauseStartMs : performance.now(), window.__combatUntil||0);
    BGM.monitor(dt);
    requestAnimationFrame(tick);
  }

  setButtonText();
  requestAnimationFrame(tick);

// Expose a few helpers to window for debugging / sanityCheck


function drawOrderFx(){
  const now = state.t;
  if (!state.fx.orders) state.fx.orders = [];
  state.fx.orders = state.fx.orders.filter(o=> now <= o.until);

  for (const o of state.fx.orders){
    const u = getEntityById(o.unitId);
    if (!u || !u.alive || u.inTransport) continue;

    let tx=o.x, ty=o.y;
    let target=null;
    if (o.targetId!=null){
      target=getEntityById(o.targetId);
      if (target && target.alive){
        tx=target.x; ty=target.y;
      }
    }

    const from = worldToScreen(u.x, u.y);
    const to   = worldToScreen(tx, ty);

    ctx.save();
    const a = clamp((o.until - now) / o.ttl, 0, 1);
    ctx.globalAlpha = 0.95 * a;
    ctx.lineWidth = o.w || 3.2;
    ctx.strokeStyle = o.color || "rgba(120,255,120,0.95)";
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();

    // target point
    const r = o.r || 5.5;
    ctx.fillStyle = o.color2 || (o.color || "rgba(255,90,90,0.95)");
    ctx.beginPath();
    ctx.arc(to.x, to.y, r, 0, Math.PI*2);
    ctx.fill();

    // optional center crosshair for attacks
    if (o.kind==="attack"){
      ctx.globalAlpha = 0.8 * a;
      ctx.strokeStyle = "rgba(255,255,255,0.45)";
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(to.x-r-2, to.y);
      ctx.lineTo(to.x+r+2, to.y);
      ctx.moveTo(to.x, to.y-r-2);
      ctx.lineTo(to.x, to.y+r+2);
      ctx.stroke();
    }

    ctx.restore();
  }
}

function pushOrderFx(unitId, kind, x, y, targetId=null, color=null){
  if (!state.fx.orders) state.fx.orders = [];
  const isAtk = (kind==="attack" || kind==="attackmove" || kind==="harvest");
  const ttl = 0.22;
  state.fx.orders.push({
    unitId, kind, x, y, targetId,
    color:  color  || (isAtk ? "rgba(255,70,70,0.95)" : "rgba(90,255,90,0.95)"),
    color2: isAtk ? "rgba(255,60,60,0.95)" : "rgba(90,255,90,0.95)",
    ttl,
    until: state.t + ttl,
    w: isAtk ? 3.8 : 3.2,
    r: isAtk ? 5.8 : 5.2
  });
}

// window.setPathTo (removed dead statement)

window.setPathTo = setPathTo;
window.findPath = findPath;
window.issueIFVRepair = issueIFVRepair;
window.boardUnitIntoIFV = boardUnitIntoIFV;
window.unboardIFV = tryUnloadIFV;
window.resolveUnitOverlaps = resolveUnitOverlaps;

})();
})();