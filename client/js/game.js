;(function(){
  // Debug/validation mode: add ?debug=1 to URL
  const DEV_VALIDATE = /(?:\?|&)debug=1(?:&|$)/.test(location.search);
  const DEV_VALIDATE_THROW = false; // if true, throws on first invariant failure
  // Money drain tracing: add ?debugmoney=1 to URL
  const DEBUG_MONEY = /(?:\?|&)debugmoney=1(?:&|$)/.test(location.search);

  function _assert(cond, msg){
    if (cond) return;
    console.error("[ASSERT]", msg);
    if (DEV_VALIDATE_THROW) throw new Error(msg);
  }


  const canvas = document.getElementById("c");
  // FORCE fullscreen canvas (prevents tiny top-left render)
  canvas.style.position = "fixed";
  canvas.style.left = "0";
  canvas.style.top = "0";
  canvas.style.width = "100vw";
  canvas.style.height = "100vh";
  canvas.style.display = "block";
  canvas.style.zIndex = "1";
  const ctx = canvas.getContext("2d");
  const mmCanvas = document.getElementById("mmc");
  const mmCtx = mmCanvas.getContext("2d");

  // fps UI is handled in ou_ui.js

  // [refactor] UI helpers extracted -> ou_ui.js (Stage 4)
  const __ou_ui = (window.OUUI && typeof window.OUUI.create === "function")
    ? window.OUUI.create()
    : null;

  // Global error overlay (UI owns DOM manipulation)
  window.addEventListener("error", (e) => {
    if (__ou_ui && typeof __ou_ui.showFatalError === "function"){
      __ou_ui.showFatalError(e);
    }
  });

  function toast(text, dur=1.0){
    if (__ou_ui && typeof __ou_ui.toast === "function"){
      __ou_ui.toast(text, dur);
    }
  }

  // Sidebar button UI is managed by ou_ui.js. Keep game.js free of DOM mutations here.

  let spawnChoice = "left";
  let startMoney = 10000;
  if (__ou_ui && typeof __ou_ui.initPregameUI === "function"){
    __ou_ui.initPregameUI({
      onSpawnChange: (v)=>{ spawnChoice = v || "left"; },
      onMoneyChange: (v)=>{ startMoney = (typeof v==="number" && !Number.isNaN(v)) ? v : 10000; }
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

  

  
// Debug option: disable fog-of-war rendering & logic (show whole map)
  let fogEnabled = true;
  const clamp = (v,a,b)=>Math.max(a,Math.min(b,v));
  const dist2 = (ax,ay,bx,by)=>{ const dx=ax-bx, dy=ay-by; return dx*dx+dy*dy; };
  const rnd = (a,b)=> a + Math.random()*(b-a);


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
    speedMul: 1,
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
  // Economy action queue: UI events enqueue, tick() applies.
  state.econActions = state.econActions || [];
  function enqueueEcon(action){
    if (!action) return;
    state.econActions.push(action);
  }
  // Progress accessors are provided by ou_economy (single source of truth).

  const bullets=[];
  const traces=[];
  const impacts=[]; // MG bullet impact sparks
  const fires=[]; // building fire particles (low HP)
  const explosions=[]; // building destruction explosions
  const exp1Fxs = []; // large explosion sprite fx (rendered in render.js)

  const healMarks=[]; // red-cross marks for repairs
  const flashes=[]; // muzzle flashes
  const casings=[]; // MG shell casings
  const repairWrenches=[]; // building repair wrench FX
  const infDeathFxs=[]; // infantry death animation FX

  const snipDeathFxs=[]; // sniper death animation FX (3x3 = 9 frames)

  const COST = {
    power:600, refinery:2000, barracks:500, factory:2000, radar:1000, turret:500,
    infantry:100, engineer:875, sniper:600, tank:900, ifv:600,
    harvester:2450, hq:0
  };


  // Price tooltip is handled in ou_ui.js


  // Sidebar-style build time (seconds). Simple deterministic rule: time scales with cost.
  // RA2/YR-style base build speed: "minutes to produce a 1000-credit item"
// See: BuildSpeed / Build time references.
const BUILD_SPEED_MIN_PER_1000 = 0.8; // rules(md).ini 기본값: 1000크레딧 생산에 걸리는 시간(분) (BuildSpeed)
const MULTIPLE_FACTORY = 0.8; // rules(md).ini MultipleFactory: 공장/막사 등 같은 생산시설 추가 시 빌드타임 누적 곱 (0.8^(n-1))

function getBaseBuildTime(kind){
    return (__ou_econ && __ou_econ.getBaseBuildTime) ? __ou_econ.getBaseBuildTime(kind) : 999999;
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
    refinery: { hLevel:2, tw:3, th:3, hp:1000, vision:520, provideR: 650 },
    factory:  { hLevel:2, tw:3, th:4, hp:1000, vision:500, provideR: 650 },
    barracks: { hLevel:2, tw:2, th:2, hp:500,  vision:460, provideR: 600 },
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

  const _extNames = (window.G && window.G.Units && window.G.Units.NAME_KO) ? window.G.Units.NAME_KO : null;
  const NAME_KO = Object.assign({}, DEFAULT_NAME_KO, _extNames || {});
  if (NAME_KO.tank !== "경전차") NAME_KO.tank = "경전차";


  // === Centralized assets (refactor) ===
  const ASSET = {
    music: {
      peace: ["asset/music/peace1.mp3","asset/music/peace2.mp3","asset/music/peace3.mp3","asset/music/peace4.mp3"],
    battle:["asset/music/battle1.mp3","asset/music/battle2.mp3","asset/music/battle3.mp3","asset/music/battle4.mp3","asset/music/battle5.mp3","asset/music/Bring it on!.mp3","asset/music/Bring of the new age.mp3"],
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

  // === Sniper idle sprite (8-dir) embedded ===
  const SNIP_IDLE_PNG = ASSET.sprite.unit.snip.idle;
  const SNIP_DIE_PNG = ASSET.sprite.unit.snip.die;

  // === Construction Yard (HQ) sprite (5x5 footprint) ===
  // Source: asset/sprite/const/normal/con_yard_n.png
  // Measured (offline) from the PNG:
  //  - non-transparent bbox width ≈ 1536px
  //  - pivot is SOUTH corner center (bottom-most point) at x=1024, y=1381 (in original image px)
  const CON_YARD_PNG = ASSET.sprite.const.normal.con_yard;
  // === Sprite tuning knobs (YOU edit these) ===
  // pivotNudge is in SOURCE pixels (bbox-space, before scaling).
  // offsetNudge is in SCREEN pixels (after scaling, before zoom).
  // anchor: "center" to stick the sprite to the 5x5 footprint center (what you asked).
  

  // === TexturePacker "textures":[{frames:[...]}] atlas parser (trim + anchor aware) ===
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

  function spawnExp1FxAt(wx, wy, scale=1.0, frameDur=0.05){
    // If not ready yet, just skip (base particle explosion still happens).
    if (window.OURender && typeof OURender.isExp1Ready === "function"){
      if (!OURender.isExp1Ready()) return;
    }
    exp1Fxs.push({ x: wx, y: wy, t0: state.t, scale, frameDur });
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




  // === Infantry sprite (attack 8-dir) embedded ===
  const INF_ATK_PNG = ASSET.sprite.unit.inf.atk;

  // === Repair wrench FX sprite sheet (7 frames, 602x602 each) ===
  const REPAIR_WRENCH_PNG = ASSET.sprite.unit.inf.wrench;



  // === Infantry death FX sprite sheet (7 frames, 1200x1200 each) ===
  const INF_DIE_PNG = ASSET.sprite.unit.inf.die;



  // === Infantry movement sprite (east) 6f (600x600 tiles) embedded ===
  const INF_MOV_PNG = ASSET.sprite.unit.inf.mov.E;

  // === Infantry move NE (north-east) 6-frame sheet (600x600 each) ===
  const INF_MOV_NE_PNG = ASSET.sprite.unit.inf.mov.NE;

  // === Infantry move N (north) 6-frame sheet (600x600 each) ===
  const INF_MOV_N_PNG = ASSET.sprite.unit.inf.mov.N;

  // === Infantry move NW (north-west) 6-frame sheet (600x600 each) ===
  const INF_MOV_NW_PNG = ASSET.sprite.unit.inf.mov.NW;

  // === Infantry move W (west) 6-frame sheet (600x600 each) ===
  const INF_MOV_W_PNG = ASSET.sprite.unit.inf.mov.W;

  // === Infantry move SW (south-west) 6-frame sheet (600x600 each) ===
  const INF_MOV_SW_PNG = ASSET.sprite.unit.inf.mov.SW;

  // === Infantry move S (south) 6-frame sheet (600x600 each) ===
  const INF_MOV_S_PNG = ASSET.sprite.unit.inf.mov.S;

  // === Infantry move SE (south-east) 6-frame sheet (600x600 each) ===
  const INF_MOV_SE_PNG = ASSET.sprite.unit.inf.mov.SE;

  // EXP1 asset urls (render.js loads/parses)
  const EXP1_PNG  = ASSET.sprite.eff.exp1.png;
  const EXP1_JSON = ASSET.sprite.eff.exp1.json;

  // Scale for in-game rendering (used by render.js)
  const INF_SPRITE_SCALE = 0.12;

  // Convert a movement vector (dx,dy) to our 8-dir index (E,NE,N,NW,W,SW,S,SE).
  // Note: screen/world coordinates use +y = down. North is dy < 0.
  function vecToDir8(dx, dy){
    if (!dx && !dy) return 6; // default South/front
    const ang = Math.atan2(dy, dx); // -PI..PI
    const targets = [0, -45, -90, -135, 180, 135, 90, 45];
    const deg = ang * 180 / Math.PI;
    let bestI = 0, bestD = 1e9;
    for (let i=0;i<8;i++){
      let d = deg - targets[i];
      d = ((d + 540) % 360) - 180;
      const ad = Math.abs(d);
      if (ad < bestD){ bestD = ad; bestI = i; }
    }
    return bestI;
  }

  // Convert a world/tile-space vector to a screen-space direction, then map to our 8-dir index.
  function worldVecToDir8(dx, dy){
    const sx = (dx - dy) * (ISO_X / TILE);
    const sy = (dx + dy) * (ISO_Y / TILE);
    return vecToDir8(sx, sy);
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
    try{ if (window.PO && PO.buildings && PO.buildings.onPlaced) PO.buildings.onPlaced(b, state); }catch(_e){}
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
  




function heuristic(ax,ay,bx,by){
    const dx=Math.abs(ax-bx), dy=Math.abs(ay-by);
    const D=10, D2=14;
    return D*(dx+dy) + (D2-2*D)*Math.min(dx,dy);
  }

  

  // Occupancy-aware A* for unit movement: treats other friendly units' occupied/reserved tiles as blocked.
  // This prevents infantry "강행돌파" into occupied tiles and reduces vehicle oscillation at chokepoints.
  


  // Alias expected by sanityCheck
  function findPath(sx,sy,gx,gy){
    return aStarPath(sx,sy,gx,gy);
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
function followPath(u, dt){
    // HARD STOP: if unit is effectively idle/guard with no target, it must not drift.
    if (u && u.order && (u.order.type==="idle" || u.order.type==="guard") && u.target==null){
      if (u.path){ u.path = null; u.pathI = 0; }
      u.stuckT = 0; u.yieldCd = 0;
      return false;
    }
    if (!u.path || u.pathI >= u.path.length){
      // If we have a move-like order but no path (e.g., path consumed or cleared), finalize when close enough.
      const ot = (u.order && u.order.type) ? u.order.type : null;
      if (ot==="move" || ot==="guard_return" || ot==="attackmove"){
        const gx = (u.order && u.order.x!=null) ? u.order.x : u.x;
        const gy = (u.order && u.order.y!=null) ? u.order.y : u.y;
        const d2 = dist2(u.x,u.y,gx,gy);
        if (d2 < 16*16){
          // snap and stop: prevents 'moving-but-not-moving' vibration after arrival
          u.x = gx; u.y = gy;
          u.vx = 0; u.vy = 0;
          u.path = null; u.pathI = 0;
          clearReservation(u);
          if (ot==="attackmove"){
            u.guard = {x0:u.x, y0:u.y};
            u.order = {type:"guard", x:u.x, y:u.y, tx:null, ty:null};
            } else {
            u.order = {type:"idle", x:u.x, y:u.y, tx:null, ty:null};
          }
          return false;
        }
      }
      return false;
    }
    if (u.yieldCd && u.yieldCd>0){ u.yieldCd -= dt; if (u.yieldCd>0) return false; u.yieldCd=0; }

    const p = u.path[u.pathI];
    // Waypoint world target
let wx = (p.tx+0.5)*TILE, wy=(p.ty+0.5)*TILE;

// RA2-feel queueing for infantry:
// Instead of having everyone steer to tile center (then push/correct/jitter),
// pick a temporary sub-slot for the NEXT waypoint tile. If no slot is available, WAIT.
if (u.cls==="inf"){
  const ni = idx(p.tx,p.ty);
  let mask = (u.team===0) ? infSlotMask0[ni] : infSlotMask1[ni];

  // keep a short-lived nav slot lock to avoid per-frame slot thrash
  if (u.navSlotLockT && u.navSlotLockT>0){
    u.navSlotLockT -= dt;
    if (u.navSlotLockT<=0){ u.navSlotLockT=0; }
  }

  let slot = -1;
  if (u.navSlot!=null && u.navSlotTx===p.tx && u.navSlotTy===p.ty && u.navSlotLockT>0){
    slot = (u.navSlot & 3);
  } else {
    for (let s=0; s<4; s++){
      if (((mask>>s)&1)===0){ slot = s; break; }
    }
    if (slot>=0){
      u.navSlot = slot; u.navSlotTx = p.tx; u.navSlotTy = p.ty;
      u.navSlotLockT = 0.25; // seconds
    }
  }

  if (slot<0){
    // Tile is temporarily full: don't oscillate, just queue behind.
    u.vx = 0; u.vy = 0;
    u.queueWaitT = (u.queueWaitT||0) + dt;

    // If we have been waiting too long, allow bypass logic below to kick in.
    // But for short waits, returning here prevents "부들부들".
    if (u.queueWaitT < 0.35) return false;
  } else {
    u.queueWaitT = 0;
    const sp = tileToWorldSubslot(p.tx, p.ty, slot);
    wx = sp.x; wy = sp.y;
  }
}


    // HARD HOLD: if infantry is already locked to its sub-slot in this tile, don't keep steering.
    if (u.cls==="inf" && u.holdPos && tileOfX(u.x)===p.tx && tileOfY(u.y)===p.ty) return false;

    // Reservation + capacity: prevents multiple units trying to occupy the same tile-center,
    // which caused circular "강강수월래" orbiting at diamond corners.
    const curTx = tileOfX(u.x), curTy = tileOfY(u.y);
    if (!(p.tx===curTx && p.ty===curTy)){
      const _tGoal = (u && u.target!=null) ? getEntityById(u.target) : null;
      const _combatOrder = (u && u.order && (u.order.type==="attack" || u.order.type==="attackmove"));
      const _canEnter = (_combatOrder && _tGoal && BUILD[_tGoal.kind]) ? canEnterTileGoal(u, p.tx, p.ty, _tGoal) : canEnterTile(u, p.tx, p.ty);
      if (!_canEnter || !reserveTile(u, p.tx, p.ty)) {
        // FINAL-TILE RETARGET: if our destination tile is occupied/reserved, pick a nearby free tile once.
        // This prevents late arrivals from 'dancing' in place trying to steal an already-occupied tile.
        if (u.pathI >= (u.path.length-1)) {
          u.finalBlockT = (u.finalBlockT||0) + dt;
          if (u.finalBlockT > 0.22 && (u.lastRetargetT==null || (state.t - u.lastRetargetT) > 0.85)) {
            const goalWx = (p.tx+0.5)*TILE, goalWy = (p.ty+0.5)*TILE;
            const spot = findNearestFreePoint(goalWx, goalWy, u, 2);
            const nTx = tileOfX(spot.x), nTy = tileOfY(spot.y);
            if ((nTx!==p.tx || nTy!==p.ty) && canEnterTile(u, nTx, nTy) && reserveTile(u, nTx, nTy)) {
              const wp2 = tileToWorldCenter(nTx, nTy);
              u.order = {type:(u.order && u.order.type) ? u.order.type : "move", x:wp2.x, y:wp2.y, tx:nTx, ty:nTy};
              setPathTo(u, wp2.x, wp2.y);
              u.lastRetargetT = state.t;
              u.finalBlockT = 0;
              return true;
            }
          }
        }

        const step = findBypassStep(u, curTx, curTy, p.tx, p.ty);
        if (step && reserveTile(u, step.tx, step.ty)){
          // Inject a temporary one-step path.
          u.path = [{tx:step.tx, ty:step.ty}, ...u.path.slice(u.pathI)];
          u.pathI = 0;
          return true;
        }
        // Wait a bit and try again next tick. If we keep failing, settle instead of vibrating.
        u.blockT = (u.blockT||0) + dt;
        if (u.blockT > 0.85){
          const cwx=(curTx+0.5)*TILE, cwy=(curTy+0.5)*TILE;
          u.x=cwx; u.y=cwy;

          // IMPORTANT: never drop into idle while we still have a combat target/order.
          // Doing so caused backliners to "dance" forever when attacking buildings (path nodes rejected as blocked).
          const _combatLocked = (u.target!=null && u.order && (u.order.type==="attack" || u.order.type==="attackmove"));
          if (_combatLocked){
            u.path=null; u.pathI=0;
            clearReservation(u);
            u.yieldCd=0;
            u.blockT=0;
            u.repathCd = 0; // force immediate replanning in combat logic
            u.combatGoalT = 0;
            return false;
          }

          u.order = {type:"idle", x:u.x, y:u.y, tx:null, ty:null};
          u.path=null; u.pathI=0;
          clearReservation(u);
          u.yieldCd=0;
          u.blockT=0;
          return false;
        }
        u.yieldCd = 0.10;
        return false;
      }
    }

    const dx=wx-u.x, dy=wy-u.y;
    const d=Math.hypot(dx,dy);

    
    // Strong anti-jam: soft separation and stuck recovery.
    if (u.stuckT==null){ u.stuckT=0; u.lastX=u.x; u.lastY=u.y; }


    // Arrival threshold: allow a small epsilon on the final node so avoidance steering doesn't cause endless micro-dancing.
    if (d < 2 || (u.pathI >= (u.path.length-1) && d < 12)){
      // Reduce "tile-by-tile fidget": only hard-snap on the FINAL node.
      if (u.pathI >= (u.path.length-1)){
        if (u.cls==="inf"){
  // Prefer the destination slot assigned at command time (prevents "everyone rushes tile center" jitter).
  let slot = (u.order && u.order.tx===p.tx && u.order.ty===p.ty && u.order.subSlot!=null) ? (u.order.subSlot|0) : (u.subSlot|0);
  const sp = tileToWorldSubslot(p.tx, p.ty, slot);
  u.x = sp.x; u.y = sp.y;
          u.vx = 0; u.vy = 0;
          u.holdPos = true;
        } else {
          const sx = (p.tx+0.5)*TILE, sy = (p.ty+0.5)*TILE;
          u.x = sx; u.y = sy;
        }
      }
      if (!(u.cls==="inf" && u.pathI >= (u.path.length-1))) u.holdPos = false;
      u.pathI++;
      clearReservation(u);
      // If we consumed the last waypoint, finalize the order right here.
      if (u.pathI >= u.path.length){
        const ot2 = (u.order && u.order.type) ? u.order.type : null;
        // Stop residual velocity to avoid micro-corrections turning into jitter.
        u.vx = 0; u.vy = 0;
        u.path = null; u.pathI = 0;
        clearReservation(u);
        if (ot2==="attackmove"){
          u.guard = {x0:u.x, y0:u.y};
          u.order = {type:"guard", x:u.x, y:u.y, tx:null, ty:null};
        } else if (ot2==="move" || ot2==="guard_return"){
          u.order = {type:"idle", x:u.x, y:u.y, tx:null, ty:null};
        }
      }
      u.blockT = 0;
      u.stuckT = 0;
      return true;
    }


    const curTileTx=tileOfX(u.x), curTileTy=tileOfY(u.y);
    if (u.pathI>0){
      const nextTile = u.path[u.pathI];
      if (!(nextTile.tx===curTileTx && nextTile.ty===curTileTy)){
        // Try to reserve the next tile to avoid head-on deadlocks.
        if (!reserveTile(u, nextTile.tx, nextTile.ty) || isReservedByOther(u, nextTile.tx, nextTile.ty)){
          // Do NOT pause ("dance") when crowded: try a small bypass step, otherwise keep moving.
          const bp = findBypassStep(u, curTileTx, curTileTy, nextTile.tx, nextTile.ty);
          if (bp){
            u.path.splice(u.pathI, 0, {tx:bp.tx, ty:bp.ty});
            return true;
          }
          // fall through: allow compression movement instead of yielding
        }
        if (!canEnterTile(u, nextTile.tx, nextTile.ty)){
          // If the final approach is blocked (crowding), accept arrival near the goal to avoid infinite wiggle.
          if (u.order && (u.order.type==="move" || u.order.type==="attackmove") && u.pathI >= (u.path.length-1)){
            const dd = dist2(u.x,u.y,u.order.x,u.order.y);
            if (dd < 58*58){
              u.order = {type:"idle", x:u.x, y:u.y, tx:null, ty:null};
              u.path = null; u.pathI = 0;
              clearReservation(u);
              u.stuckTime = 0;
              return false;
            }
          }
          // If blocked, try a short bypass step instead of vibrating in place.
          if ((u.avoidCd||0) <= 0){
            const fromTx = curTileTx, fromTy = curTileTy;
            const bypass = findBypassStep(u, fromTx, fromTy, nextTile.tx, nextTile.ty);
            if (bypass){
              u.path.splice(u.pathI, 0, bypass);
              u.avoidCd = 0.45;
              } else {
                u.avoidCd = 0.25;
            }
          }
          return true;
        }
      }
    }

    const step=Math.min(getMoveSpeed(u)*dt, d);
    let ax=dx/(d||1), ay=dy/(d||1);
    // v12: local steering to avoid overlapping with nearby units.
    // This makes units slide around each other instead of stacking.
    let avoidX=0, avoidY=0;
    const avoidR = (u.r||10) + 16;
    const avoidR2 = avoidR*avoidR;
    for (let j=0;j<units.length;j++){
      const o=units[j];
      if (!o.alive || o.id===u.id) continue;
      // only avoid same team strongly; mild avoid enemies so crush can still happen
      const same = (o.team===u.team);
      const rr = (u.r+o.r) + (same?14:4);
      const dx2=u.x-o.x, dy2=u.y-o.y;
      const dd=dx2*dx2+dy2*dy2;
      if (dd<=0.0001 || dd>rr*rr) continue;
      const inv = 1/Math.sqrt(dd);
      const push = (rr - Math.sqrt(dd)) * (same?1.15:0.35);
      avoidX += dx2*inv*push;
      avoidY += dy2*inv*push;
    }
    // blend desired direction with avoidance
    const alen = Math.hypot(avoidX,avoidY);
    if (alen>0.0001){
      const mix = 0.55; // how hard we steer away
      const nx = avoidX/alen, ny = avoidY/alen;
      ax = ax*(1-mix) + nx*mix;
      ay = ay*(1-mix) + ny*mix;
      const nlen = Math.hypot(ax,ay)||1;
      ax/=nlen; ay/=nlen;
    }

    // Update facing direction for sprite rendering.
    // IMPORTANT: don't overwrite attack-facing while firing, and don't snap to default when stationary.
    const movingDir = (Math.abs(ax) + Math.abs(ay)) > 1e-4;
    if ((u.fireHoldT||0) > 0 && u.fireDir!=null){
      // Firing facing: turret/aim direction
      u.faceDir = u.fireDir;
      if (u.kind !== "tank" && u.kind !== "harvester"){
        u.dir = u.fireDir;
      } else {
        if (u.bodyDir==null) u.bodyDir = (u.dir!=null ? u.dir : 6);
        u.dir = u.bodyDir;
      }
    } else if (movingDir){
      const fd = worldVecToDir8(ax, ay);

      if (u.kind === "tank" || u.kind === "harvester"){
        // RA2-style: hull turns in place before actually translating.
        if (u.bodyDir == null) u.bodyDir = (u.dir!=null ? u.dir : 6);

        if (fd !== u.bodyDir){
          _tankUpdateHull(u, fd, dt);
          u.dir = u.bodyDir;
          u.faceDir = (u.fireDir!=null ? u.fireDir : (u.turretDir!=null ? u.turretDir : u.bodyDir));
          return true; // turning, no translation this frame
        }

        // Aligned: move normally.
        u.bodyTurn = null;
        u.bodyDir = fd;
        u.dir = fd;
        u.faceDir = (u.fireDir!=null ? u.fireDir : fd);
      } else {
        u.faceDir = fd;
        u.dir = fd;
      }
    } else {
      // keep last facing when idle
      if (u.faceDir==null) u.faceDir = 6;
      if (u.dir==null) u.dir = u.faceDir;
    }

const nx=u.x+ax*step, ny=u.y+ay*step;
    const ntx=tileOfX(nx), nty=tileOfY(ny);
    if (!isWalkableTile(ntx,nty)){
      return false;
    }
    // If we are about to enter an occupied tile (friendly jam), do not "force through".
    // Trigger a bypass/repath instead of vibrating against the same choke.
    if (!(ntx===curTx && nty===curTy)){
      const blockedNext = (!canEnterTile(u, ntx, nty) || isReservedByOther(u, ntx, nty));
      if (blockedNext){
        u.blockT = (u.blockT||0) + dt;
        if ((u.avoidCd||0) <= 0){
          const bypass = findBypassStep(u, curTx, curTy, ntx, nty);
          if (bypass){
            u.path.splice(u.pathI, 0, bypass);
            u.avoidCd = 0.45;
            } else {
            // Repath to the original goal using current occupancy.
            const g = (u.path && u.path.length) ? u.path[u.path.length-1] : {tx:ntx,ty:nty};
            const gp = findNearestFreePoint((g.tx+0.5)*TILE,(g.ty+0.5)*TILE,u,5);
            setPathTo(u, gp.x, gp.y);
            u.avoidCd = 0.35;
          }
        }
        u.yieldCd = Math.max(u.yieldCd||0, 0.10);
        return false;
      }
    }
    // Prevent moving into a building footprint (continuous check).
    // If we hit a corner while moving in a mostly-orthogonal direction, try to *slide* along one axis
    // instead of repeatedly repathing and "bouncing" on the same corner.
    if (isBlockedWorldPoint(u, nx, ny)){
      // Better corner handling:
      // 1) try sliding along the obstacle tangent (perpendicular to desired move),
      // 2) fallback to axis-only slide,
      // 3) if still blocked, locally retarget the next path node to a nearby reachable tile
      //    so units don't "headbang" on the same corner forever.
      const px = -ay, py = ax; // perpendicular unit vector
      for (const sgn of [1,-1]){
        const sx = u.x + px*step*sgn;
        const sy = u.y + py*step*sgn;
        const stx = tileOfX(sx), sty = tileOfY(sy);
        if (isWalkableTile(stx, sty) && canEnterTile(u, stx, sty) && !isBlockedWorldPoint(u, sx, sy)){
          u.x = clamp(sx,0,WORLD_W);
          u.y = clamp(sy,0,WORLD_H);
          u.blockT = 0;
          return true;
        }
      }

      // axis slide attempt 1: move X only
      const sx1 = u.x + ax*step;
      const sy1 = u.y;
      const stx1 = tileOfX(sx1), sty1 = tileOfY(sy1);
      if (isWalkableTile(stx1, sty1) && canEnterTile(u, stx1, sty1) && !isBlockedWorldPoint(u, sx1, sy1)){
        u.x = clamp(sx1,0,WORLD_W);
        u.y = clamp(sy1,0,WORLD_H);
        u.blockT = 0;
        return true;
      }
      // axis slide attempt 2: move Y only
      const sx2 = u.x;
      const sy2 = u.y + ay*step;
      const stx2 = tileOfX(sx2), sty2 = tileOfY(sy2);
      if (isWalkableTile(stx2, sty2) && canEnterTile(u, stx2, sty2) && !isBlockedWorldPoint(u, sx2, sy2)){
        u.x = clamp(sx2,0,WORLD_W);
        u.y = clamp(sy2,0,WORLD_H);
        u.blockT = 0;
        return true;
      }

      u.blockT = (u.blockT||0) + dt;

      // Local detour: if our current next-node is causing a corner collision, switch the next node
      // to a nearby tile that is (a) walkable, (b) enterable, (c) not inside building clearance,
      // and (d) closer to our final goal.
      if (u.path && u.path.length && u.pathI < u.path.length){
        const goal = u.path[u.path.length-1];
        const curTx = tileOfX(u.x), curTy = tileOfY(u.y);
        let best=null, bestScore=1e18;
        for (let dy=-1; dy<=1; dy++){
          for (let dx=-1; dx<=1; dx++){
            if (dx===0 && dy===0) continue;
            const tx = curTx+dx, ty = curTy+dy;
            if (!inMap(tx,ty)) continue;
            if (!isWalkableTile(tx,ty)) continue;
            if (!canEnterTile(u, tx, ty)) continue;
            const c = tileToWorldCenter(tx,ty);
            if (isBlockedWorldPoint(u, c.x, c.y)) continue;
            const h = (tx-goal.tx)*(tx-goal.tx) + (ty-goal.ty)*(ty-goal.ty);
            const turn = (dx*dx+dy*dy===2) ? 0.15 : 0.0; // slight bias for orthogonal steps
            const score = h + turn;
            if (score < bestScore){ bestScore=score; best={tx,ty}; }
          }
        }
        if (best){
          // Replace next node and claim reservation so others don't pile into the same corner.
          u.path[u.pathI] = {tx:best.tx, ty:best.ty};
          reserveTile(u, best.tx, best.ty);
          u.blockT = 0;
          u.yieldCd = Math.max(u.yieldCd||0, 0.12);
          return false;
        }
      }

      if ((u.avoidCd||0) <= 0){
        // Repath to a nearby *reachable* point close to our goal.
        const gx0 = (u.order && u.order.tx!=null) ? (u.order.tx+0.5)*TILE : wx;
        const gy0 = (u.order && u.order.ty!=null) ? (u.order.ty+0.5)*TILE : wy;

        const spot = findNearestFreePoint(gx0, gy0, u, 5);
        const gx = spot && spot.found ? spot.x : gx0;
        const gy = spot && spot.found ? spot.y : gy0;

        setPathTo(u, gx, gy);
        u.avoidCd = 0.45;
      }

      // If we keep colliding, settle to current tile-center instead of vibrating on corners.
      if (u.blockT > 0.95){
        const cwx=(tileOfX(u.x)+0.5)*TILE, cwy=(tileOfY(u.y)+0.5)*TILE;
        u.x=cwx; u.y=cwy;
        u.order = {type:"idle", x:u.x, y:u.y, tx:null, ty:null};
        u.path=null; u.pathI=0;
        clearReservation(u);
        u.blockT=0;
        return false;
      }

      u.yieldCd = Math.max(u.yieldCd||0, 0.12);
      return false;
    }
    u.x=clamp(nx,0,WORLD_W);

    u.y=clamp(ny,0,WORLD_H);

    // Stuck detection: if barely moving while having a path, nudge/skip nodes.
    const moved = Math.hypot(u.x-(u.lastX||u.x), u.y-(u.lastY||u.y));
    u.lastX=u.x; u.lastY=u.y;
    if (moved < 0.25 && d > 6) u.stuckT += dt; else u.stuckT = Math.max(0, u.stuckT - dt*0.5);

    if (u.stuckT > 0.75){
      // Stuck recovery:
      // Vehicles should repath instead of oscillating in place; infantry tries a sidestep first.
      const goal = (u.path && u.path.length) ? u.path[u.path.length-1] : null;
      u.stuckT = 0;
      clearReservation(u);

      if (goal && (u.kind==="tank" || u.kind==="harvester" || (u.cls==="veh"))){
        // Recompute a fresh path to goal (uses current occupancy/capacity).
        setPathTo(u, (goal.tx+0.5)*TILE, (goal.ty+0.5)*TILE);
        u.yieldCd = Math.max(u.yieldCd||0, 0.15);
        return true;
      } else if (goal){
        // Infantry: insert a bypass step to break the jam, else repath.
        const b = findBypassStep(u, curTx, curTy, goal.tx, goal.ty);
        if (b){ u.path.splice(u.pathI, 0, b); }
        else { setPathTo(u, (goal.tx+0.5)*TILE, (goal.ty+0.5)*TILE); }
        u.yieldCd = Math.max(u.yieldCd||0, 0.12);
        return true;
      } else {
        // No goal: just stop at current center.
        const cwx=(curTx+0.5)*TILE, cwy=(curTy+0.5)*TILE;
        u.x=cwx; u.y=cwy;
        u.order={type:"idle", x:u.x, y:u.y, tx:null, ty:null};
        u.path=null; u.pathI=0;
        return false;
      }
    }
    return true;
  }

    function validateTechQueues(){
    return (__ou_econ && __ou_econ.validateTechQueues) ? __ou_econ.validateTechQueues() : undefined;
  }

function getPowerFactor(team){
    return (__ou_econ && __ou_econ.getPowerFactor) ? __ou_econ.getPowerFactor(team) : 1;
  }

  function isUnderPower(team){
    return (__ou_econ && __ou_econ.isUnderPower) ? __ou_econ.isUnderPower(team) : false;
  }
  function hasRadarAlive(team){
    return buildings.some(b=>b.alive && !b.civ && b.team===team && b.kind==="radar");
  }

  function placeCivOreGens(){
    let placed=0;
    for (let tries=0; tries<5000 && placed<3; tries++){
      const tx=(Math.random()*(MAP_W-4))|0;
      const ty=(Math.random()*(MAP_H-4))|0;
      if (isBlockedFootprint(tx,ty, BUILD.civ_oregen.tw, BUILD.civ_oregen.th)) continue;
      let aroundOre=0;
      for (let y=-3;y<=3;y++){
        for (let x=-3;x<=3;x++){
          const ax=tx+x, ay=ty+y;
          if (!inMap(ax,ay)) continue;
          aroundOre += ore[idx(ax,ay)];
        }
      }
      if (aroundOre>900) continue;
      addBuilding(TEAM.NEUTRAL, "civ_oregen", tx, ty);
      placed++;
    }
  }

  function tickCivOreGen(dt){
    for (const b of buildings){
      if (!b.alive || b.kind!=="civ_oregen") continue;
      b.oregenT += dt;
      if (b.oregenT < 0.55) continue;
      b.oregenT = 0;

      const cx = b.tx + ((b.tw/2)|0);
      const cy = b.ty + ((b.th/2)|0);

      let sum=0;
      for (let dy=-1; dy<=1; dy++){
        for (let dx=-1; dx<=1; dx++){
          const tx=cx+dx, ty=cy+dy;
          if (!inMap(tx,ty)) continue;
          sum += ore[idx(tx,ty)];
        }
      }
      if (sum>0) continue;

      for (let dy=-1; dy<=1; dy++){
        for (let dx=-1; dx<=1; dx++){
          const tx=cx+dx, ty=cy+dy;
          if (!inMap(tx,ty)) continue;
          if (buildOcc[idx(tx,ty)]===1) continue;
          if (terrain[idx(tx,ty)]===1) continue;
          terrain[idx(tx,ty)] = 2;
          ore[idx(tx,ty)] = Math.min(520, ore[idx(tx,ty)] + 40);
        }
      }
    }
  }

function boardUnitIntoIFV(unit, ifv){
  if (!unit || !ifv) return false;
  if (!unit.alive || !ifv.alive) return false;
  if (ifv.kind!=="ifv" || ifv.team!==unit.team) return false;
  if (ifv.passengerId) return false;
  if (unit.inTransport) return false;
  if (unit.kind!=="infantry" && unit.kind!=="engineer" && unit.kind!=="sniper") return false;

  ifv.passengerId = unit.id;
  ifv.passKind = unit.kind;
  unit.inTransport = ifv.id;
  unit.hidden = true;
  unit.selectable = false;
  unit.wantsBoard = null;
  return true;
}




function tryBoardIFV(ifv){
  if (!ifv || !ifv.alive || ifv.kind!=="ifv" || ifv.team!==TEAM.PLAYER) return false;
  if (ifv.passengerId) { toast("이미 탑승중"); return true; }

  let cand=null;
  for (const id of state.selection){
    const u=getEntityById(id);
    if (!u || !u.alive || u.team!==TEAM.PLAYER) continue;
    if (u.kind!=="infantry" && u.kind!=="engineer" && u.kind!=="sniper") continue;
    const d2 = dist2(u.x,u.y,ifv.x,ifv.y);
    if (d2<=65*65){ cand=u; break; }
  }
  if (!cand){ toast("탑승할 보병이 근처에 없음"); return true; }

  ifv.passengerId = cand.id;
  ifv.passKind = cand.kind;
  cand.inTransport = ifv.id;
  cand.hidden = true;
  cand.selectable = false;
  state.selection.delete(cand.id);
  updateSelectionUI();
  toast("탑승");
  return true;
}

function tryUnloadIFV(ifv){
  if (!ifv || !ifv.alive || ifv.kind!=="ifv" || ifv.team!==TEAM.PLAYER) return false;
  if (!ifv.passengerId) return false;
  const u=getEntityById(ifv.passengerId);

  const sp = findNearestFreePoint(ifv.x+TILE*0.8, ifv.y+TILE*0.2, ifv, 10);
  const x = sp && sp.found ? sp.x : (ifv.x + TILE*0.8);
  const y = sp && sp.found ? sp.y : (ifv.y + TILE*0.2);

  if (u){
    u.inTransport = null;
    u.hidden = false;
    u.selectable = true;
    u.x=x; u.y=y;
    u.order = {type:"move", x:x, y:y, tx:null, ty:null};
    setPathTo(u, x, y);
  }
  ifv.passengerId = null;
  ifv.passKind = null;
  toast("하차");
  return true;
}



// Infantry hitscan: make it feel like a machine-gun burst (visual only; damage is still single-tick).


  function applyDamage(target, dmg, srcId=null, srcTeam=null){
    if (!target || !target.alive) return;
    if (target.attackable === false) return;

  window.__combatUntil = Math.max(window.__combatUntil||0, performance.now()+12000);
    target.lastDamaged = state.t;
    if (srcId!=null){
      target.lastAttacker = srcId;
      target.lastAttackerTeam = srcTeam;
      target.lastAttackedAt = state.t;
    }

    // Sniper: being attacked reveals for 1.5s; if not hit again, auto-cloaks when timer expires.
    if (target.kind==="sniper"){
      target.cloakBreak = Math.max(target.cloakBreak||0, 1.5);
      target.cloaked = false;
    }

    // Player under attack: toast + minimap ping + SPACE jump memory (4s window, max 2 saved).
    if (srcTeam===TEAM.ENEMY && target.team===TEAM.PLAYER){
      if (target.kind==="harvester" || BUILD[target.kind]) notifyPlayerAttacked(target);
    }

    target.hp -= dmg;

    if (target.hp > 0) return;

    // Centralized death handling: NEVER do partial cleanup in random call sites.
    handleEntityDeath(target, srcId, srcTeam);
  }

  function handleEntityDeath(ent, srcId=null, srcTeam=null){
    if (!ent || !ent.alive) return;

    const isBuilding = !!BUILD[ent.kind];

    if (isBuilding){
      destroyBuilding(ent, {srcId, srcTeam});
      return;
    }

    // Unit death
    // Infantry death animation FX (7 frames, 1200x1200 each, magenta palette swapped to team color)
    try{
      const cls = UNIT[ent.kind]?.cls;
      if (ent.kind === "sniper"){
        snipDeathFxs.push({ x: ent.x, y: ent.y, team: ent.team, t0: state.t });
        try{ addBloodBurst(ent.x, ent.y, 1.05); }catch(_e){}
      } else if (cls === "inf"){
        infDeathFxs.push({ x: ent.x, y: ent.y, team: ent.team, t0: state.t });
        try{ addBloodBurst(ent.x, ent.y, 1.00); }catch(_e){}
      }
    }catch(_e){}

    ent.alive = false;
    state.selection.delete(ent.id);
    checkElimination();
  }

  function destroyBuilding(b, cause={}){
    if (!b || !b.alive) return;

    // 1) Evac infantry FIRST (needs the footprint while it's still logically present)
    //    If no valid spawn tile exists, it will safely skip.
    spawnEvacUnitsFromBuilding(b, true);

    // 2) Big destruction FX
    addBuildingExplosion(b);
    // 2.2) Smoke ring + smoke plume at destruction point
    let _smkS = 1;
    try{
      const bw = (b.w || (b.tw*TILE) || (TILE*4));
      const bh = (b.h || (b.th*TILE) || (TILE*4));
      let s = Math.sqrt(bw*bw + bh*bh) / (TILE*2.0);
      _smkS = clamp(s, 0.8, 2.2);
    }catch(_e){}
    try{ addSmokeEmitter(b.x, b.y, _smkS); }catch(_e){}
// 2.3) Restore the old "noisy gradient smoke particle" feel:
//      - a burst of dusty smoke blobs + lingering smoke puffs.
//      (kept deterministic-ish and cheap)
try{
  // Restored: "noisy gradient" smoke blob burst (no circular shockwave/ring).
  const puffN = Math.floor(26 * _smkS);
  for (let i=0;i<puffN;i++){
    spawnSmokePuff(b.x, b.y, 1.35 * _smkS);
  }
  const hazeN = Math.floor(6 * _smkS);
  for (let i=0;i<hazeN;i++){
    spawnSmokeHaze(b.x, b.y, 1.10 * _smkS);
  }
}catch(_e){}
    // 2.5) HQ special: play large exp1 sprite explosion + world camera shake (UI not affected)
    if (b.kind === "hq"){
      // HQ special: exp1 sprite explosion + world camera shake (UI not affected)
      // NOTE: scaled down to keep it on-screen.
      let sc = 1.0;
      try{
        const fr0 = (window.OURender && typeof OURender.getExp1Frame0 === "function")
          ? OURender.getExp1Frame0()
          : null;
        if (fr0){
          const bw = (b.w || (b.tw*TILE) || (TILE*4));
          const bh = (b.h || (b.th*TILE) || (TILE*4));
          const sx = bw / Math.max(1, fr0.w);
          const sy = bh / Math.max(1, fr0.h);

          // Smaller than before. Tune here if needed.
          sc = clamp(Math.max(sx, sy) * 0.35, 0.55, 1.35);
        }
      }catch(_e){}
      spawnExp1FxAt(b.x, b.y, sc, 0.05);
      startCamShake(0.65, 22, 36);
    }


    // 3) Remove from gameplay
    try{ if (window.PO && PO.buildings && PO.buildings.onDestroyed) PO.buildings.onDestroyed(b, state); }catch(_e){}
    b.alive = false;
    state.selection.delete(b.id);
    setBuildingOcc(b, 0);
    recomputePower();
    checkElimination();
  }




  
// ===== Smoke ring + smoke particles (building destruction) =====
// 목표:
// - 파동 연기: "원형으로 퍼지되", 아이소메트리라서 위아래 납작 + 라인 없이 흐릿한 연무 타입
// - 파티클/폭발을 가리지 않도록 렌더 순서는 최하위(지형 위, 폭발/파편 아래)
const smokeWaves = [];
const smokePuffs = [];
const smokeEmitters = [];

// Extra ground FX for vehicles
const dustPuffs = [];
const dmgSmokePuffs = [];

// Dust puff for moving vehicles (sandy haze). World-positioned (does NOT follow units).
function spawnDustPuff(wx, wy, vx, vy, strength=1){
  const size = clamp(strength, 0.6, 2.2);
  const spread = TILE * 0.30 * size;
  const ang = Math.random() * Math.PI * 2;
  const rad = Math.sqrt(Math.random()) * spread;
  const x = wx + Math.cos(ang) * rad;
  const y = wy + Math.sin(ang) * rad;

  // drift roughly opposite of movement (normalize vx/vy)
  const mag = Math.max(0.0001, Math.hypot(vx||0, vy||0));
  const backx = -(vx||0) / mag;
  const backy = -(vy||0) / mag;

  dustPuffs.push({
    x, y,
    vx: backx*(TILE*0.18*size) + (Math.random()*2-1)*(TILE*0.05*size),
    vy: backy*(TILE*0.18*size) + (Math.random()*2-1)*(TILE*0.05*size),
    t: 0,
    ttl: 1.35 + Math.random()*0.75,
    r0: (22 + Math.random()*14) * size,
    grow: (92 + Math.random()*60) * size,
    a0: 0.48 + Math.random()*0.18
  });
}

// Damage smoke from a crippled unit (from turret area). World-positioned.
function spawnDmgSmokePuff(wx, wy, strength=1){
  const size = clamp(strength, 0.6, 2.4);
  const spread = TILE * 0.22 * size;
  const ang = Math.random() * Math.PI * 2;
  const rad = Math.sqrt(Math.random()) * spread;
  const x = wx + Math.cos(ang) * rad;
  const y = wy + Math.sin(ang) * rad;

  dmgSmokePuffs.push({
    x, y,
    vx: (Math.random()*2-1)*(TILE*0.03*size),
    vy: (Math.random()*2-1)*(TILE*0.03*size) - (TILE*0.02*size),
    t: 0,
    ttl: 1.55 + Math.random()*0.75,
    r0: (10 + Math.random()*10) * size,
    grow: (48 + Math.random()*40) * size,
    a0: 0.10 + Math.random()*0.06
  });
}

function addSmokeWave(wx, wy, size=1){
  const sz = clamp(size, 0.6, 2.1);
  smokeWaves.push({
    x: wx, y: wy,
    t: 0,
    ttl: 1.55,
    size: sz,
    seed: (Math.random()*1e9)|0,
    squash: 0.62 // y flatten
  });
}

function addSmokeEmitter(wx, wy, size=1){
  const sz = clamp(size, 0.6, 2.3);
  smokeEmitters.push({ x:wx, y:wy, t:0, ttl:3.4, size: sz, acc:0 });

  // 잔류 연무(넓게 퍼지는 옅은 연기) 몇 덩이 깔기
  for (let i=0;i<7;i++) spawnSmokeHaze(wx, wy, sz * (0.95 + Math.random()*0.28));
}

function spawnSmokePuff(wx, wy, size=1){
  const spread = TILE * 0.85 * size;
  const ang = Math.random() * Math.PI * 2;
  const rad = Math.sqrt(Math.random()) * spread;

  const x = wx + Math.cos(ang) * rad;
  const y = wy + Math.sin(ang) * rad;

  smokePuffs.push({
    x, y,
    vx: (Math.random()*2-1) * (TILE * 0.22 * size) + Math.cos(ang)*(TILE*0.08*size),
    vy: (Math.random()*2-1) * (TILE * 0.22 * size) + Math.sin(ang)*(TILE*0.08*size),
    t: 0,
    ttl: 2.8 + Math.random()*2.2,
    r0: (18 + Math.random()*26) * size,
    grow: (30 + Math.random()*44) * size,
    a0: 0.12 + Math.random()*0.12
  });
}

function spawnTrailPuff(wx, wy, vx, vy, strength=1){
  // Subtle, "noise-like gradient" trail puff for vehicles.
  const size = clamp(strength, 0.35, 1.20);

  // Drift opposite of movement (normalize)
  const mag = Math.max(0.0001, Math.hypot(vx||0, vy||0));
  const backx = -(vx||0) / mag;
  const backy = -(vy||0) / mag;

  // Slight jitter to avoid looking like a clean wave.
  const j = TILE * 0.10 * size;
  const x = wx + (Math.random()*2-1)*j;
  const y = wy + (Math.random()*2-1)*j;

  // Push directly into smokePuffs so it uses the same soft radial gradient renderer.
  smokePuffs.push({
    x, y,
    vx: backx*(TILE*0.12*size) + (Math.random()*2-1)*(TILE*0.04*size),
    vy: backy*(TILE*0.12*size) + (Math.random()*2-1)*(TILE*0.04*size) - (TILE*0.02*size),
    t: 0,
    ttl: 0.95 + Math.random()*0.55,
    r0: (10 + Math.random()*8) * size,
    grow: (18 + Math.random()*16) * size,
    a0: 0.07 + Math.random()*0.06
  });

  // Extra micro-puffs to fake "noisy" edges without being loud.
  const microN = 2 + ((Math.random()*2)|0);
  for (let i=0;i<microN;i++){
    smokePuffs.push({
      x: x + (Math.random()*2-1)*(TILE*0.16*size),
      y: y + (Math.random()*2-1)*(TILE*0.12*size),
      vx: backx*(TILE*0.09*size) + (Math.random()*2-1)*(TILE*0.05*size),
      vy: backy*(TILE*0.09*size) + (Math.random()*2-1)*(TILE*0.05*size) - (TILE*0.02*size),
      t: 0,
      ttl: 0.75 + Math.random()*0.45,
      r0: (7 + Math.random()*6) * size,
      grow: (14 + Math.random()*14) * size,
      a0: 0.05 + Math.random()*0.05
    });
  }
}

function spawnSmokeHaze(wx, wy, size=1){
  const spread = TILE * 1.15 * size;
  const ang = Math.random() * Math.PI * 2;
  const rad = Math.sqrt(Math.random()) * spread;

  const x = wx + Math.cos(ang) * rad;
  const y = wy + Math.sin(ang) * rad;

  smokePuffs.push({
    x, y,
    vx: (Math.random()*2-1) * (TILE * 0.10 * size) + Math.cos(ang)*(TILE*0.06*size),
    vy: (Math.random()*2-1) * (TILE * 0.10 * size) + Math.sin(ang)*(TILE*0.06*size),
    t: 0,
    ttl: 4.2 + Math.random()*2.2,
    r0: (34 + Math.random()*24) * size,
    grow: (70 + Math.random()*70) * size,
    a0: 0.06 + Math.random()*0.05
  });
}

function updateSmoke(dt){
  // Waves
  for (let i=smokeWaves.length-1;i>=0;i--){
    const w = smokeWaves[i];
    w.t += dt;
    if (w.t >= w.ttl) smokeWaves.splice(i,1);
  }

  // Emitters
  for (let i=smokeEmitters.length-1;i>=0;i--){
    const e = smokeEmitters[i];
    e.t += dt;
    e.acc += dt;

    const rate = 18 * e.size;
    const step = 1 / Math.max(6, rate);

    while (e.acc >= step){
      e.acc -= step;
      spawnSmokePuff(e.x, e.y, e.size);
    }
    if (e.t >= e.ttl) smokeEmitters.splice(i,1);
  }

  // Puffs
  for (let i=smokePuffs.length-1;i>=0;i--){
    const p = smokePuffs[i];
    p.t += dt;
    if (p.t >= p.ttl){ smokePuffs.splice(i,1); continue; }

    p.x += p.vx * dt;
    p.y += p.vy * dt;

    const damp = Math.pow(0.992, dt*60);
    p.vx *= damp;
    p.vy *= damp;
  }

  // Dust puffs
  for (let i=dustPuffs.length-1;i>=0;i--){
    const p = dustPuffs[i];
    p.t += dt;
    if (p.t >= p.ttl){ dustPuffs.splice(i,1); continue; }
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    const damp = Math.pow(0.975, dt*60);
    p.vx *= damp;
    p.vy *= damp;
  }

  // Damage smoke puffs
  for (let i=dmgSmokePuffs.length-1;i>=0;i--){
    const p = dmgSmokePuffs[i];
    p.t += dt;
    if (p.t >= p.ttl){ dmgSmokePuffs.splice(i,1); continue; }
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    const damp = Math.pow(0.988, dt*60);
    p.vx *= damp;
    p.vy *= damp;
  }
}

// ===== Blood particles (infantry death) =====
// - Uses the same "soft radial particle" style as smoke puffs, but tinted red/brown.
// - Two layers:
//   1) bloodStains: ground decal (flattened ellipse) lingering longer
//   2) bloodPuffs : short-lived mist/droplets that spread out and fade
const bloodStains = [];
const bloodPuffs  = [];

function addBloodBurst(wx, wy, size=1){
  const sz = clamp(size, 0.6, 1.8);
  // Spawn puffs a bit above ground so it feels like it comes from the body, not the floor.
  const BLOOD_PUFF_LIFT = (TILE * 0.32) * sz; // tweak if needed

  // Ground stain (isometric flattened)
  bloodStains.push({
    x: wx, y: wy,
    t: 0,
    ttl: 14 + Math.random()*10,
    size: sz,
    r0: (TILE * (0.12 + Math.random()*0.06)) * sz,
    grow: (TILE * (0.10 + Math.random()*0.06)) * sz,
    a0: 0.26 + Math.random()*0.12,
    squash: 0.56 + Math.random()*0.06
  });

  // Mist/droplet particles
  const N = Math.round(10 + Math.random()*6);
  for (let i=0;i<N;i++){
    const ang = Math.random()*Math.PI*2;
    const spd = (TILE * (0.45 + Math.random()*0.55)) * sz;

    bloodPuffs.push({
      x: wx + (Math.random()*2-1) * TILE*0.06*sz,
      y: (wy - BLOOD_PUFF_LIFT) + (Math.random()*2-1) * TILE*0.06*sz,
      vx: Math.cos(ang)*spd + (Math.random()*2-1)*TILE*0.10*sz,
      vy: Math.sin(ang)*spd + (Math.random()*2-1)*TILE*0.10*sz,
      t: 0,
      ttl: 0.9 + Math.random()*0.8,
      r0: (6 + Math.random()*8) * sz,
      grow: (10 + Math.random()*16) * sz,
      a0: 0.22 + Math.random()*0.18,
      rise: 0,
      vrise: (22 + Math.random()*38) * sz, // screen-space rise (px/s), for a little "splash"
      kind: (Math.random() < 0.45) ? "droplet" : "mist"
    });
  }
}

function updateBlood(dt){
  // Stains
  for (let i=bloodStains.length-1;i>=0;i--){
    const s = bloodStains[i];
    s.t += dt;
    if (s.t >= s.ttl) bloodStains.splice(i,1);
  }

  // Puffs
  for (let i=bloodPuffs.length-1;i>=0;i--){
    const p = bloodPuffs[i];
    p.t += dt;
    if (p.t >= p.ttl){ bloodPuffs.splice(i,1); continue; }

    p.x += p.vx * dt;
    p.y += p.vy * dt;

    // dampen movement
    const damp = Math.pow(0.985, dt*60);
    p.vx *= damp;
    p.vy *= damp;

    // rise is screen-space (used only in draw)
    p.rise += p.vrise * dt;
    p.vrise *= Math.pow(0.94, dt*60);
  }
}

  // ===== Building Destruction Explosion FX =====
  // Creates a big flash + ground glow + streak sparks + flame plumes (roughly like the screenshot).
  function addBuildingExplosion(b){
    if (!b) return;
    const w = (b.w||0), h = (b.h||0);
    let size = Math.sqrt((w*w+h*h)) / (TILE*1.25);
    size = clamp(size, 2.4, 7.5); // HUGE explosion scale
    const ex = {
      x: b.x, y: b.y,
      t: 0,
      ttl: 1.15,
      size,
      parts: []
    };

    // Streak sparks (fast, thin)
    const sparkN = 54;
    for (let i=0;i<sparkN;i++){
      const ang = (-Math.PI/2) + (Math.random()*Math.PI) + (Math.random()*0.35 - 0.175);
      const spd = 420 + Math.random()*520;
      ex.parts.push({
        kind:"streak",
        x: ex.x + (Math.random()*2-1)*TILE*0.10,
        y: ex.y + (Math.random()*2-1)*TILE*0.10,
        vx: Math.cos(ang)*spd,
        vy: Math.sin(ang)*spd,
        life: 0.28 + Math.random()*0.18,
        ttl: 0.28 + Math.random()*0.18,
        w: 1.2 + Math.random()*1.8
      });
    }

    // Flame plumes (slow, rising)
    const flameN = 34;
    for (let i=0;i<flameN;i++){
      const ang = Math.random()*Math.PI*2;
      const spd = 70 + Math.random()*120;
      ex.parts.push({
        kind:"flame",
        x: ex.x + (Math.random()*2-1)*TILE*0.18,
        y: ex.y + (Math.random()*2-1)*TILE*0.18,
        vx: Math.cos(ang)*spd,
        vy: Math.sin(ang)*spd,
        rise: 160 + Math.random()*190,
        life: 0.65 + Math.random()*0.35,
        ttl: 0.65 + Math.random()*0.35,
        r: 40 + Math.random()*70
      });
    }

    // A few embers (mid speed)
    const emberN = 28;
    for (let i=0;i<emberN;i++){
      const ang = (-Math.PI/2) + (Math.random()*Math.PI);
      const spd = 170 + Math.random()*220;
      ex.parts.push({
        kind:"ember",
        x: ex.x + (Math.random()*2-1)*TILE*0.14,
        y: ex.y + (Math.random()*2-1)*TILE*0.14,
        vx: Math.cos(ang)*spd,
        vy: Math.sin(ang)*spd,
        life: 0.55 + Math.random()*0.25,
        ttl: 0.55 + Math.random()*0.25,
        r: 6 + Math.random()*8
      });
    }

    explosions.push(ex);
  }

  function updateExplosions(dt){
    for (let i=explosions.length-1;i>=0;i--){
      const e = explosions[i];
      e.t += dt;
      for (let j=e.parts.length-1;j>=0;j--){
        const p = e.parts[j];
        p.life -= dt;
        if (p.life<=0){ e.parts.splice(j,1); continue; }
        p.x += p.vx*dt;
        p.y += p.vy*dt;
        // Gravity-ish pull down a bit for sparks/embers
        if (p.kind==="streak" || p.kind==="ember"){
          p.vy += 820*dt;
          p.vx *= (1 - Math.min(1, dt*1.8));
          p.vy *= (1 - Math.min(1, dt*1.2));
        } else if (p.kind==="flame"){
          // Flames drift + rise
          p.vx *= (1 - Math.min(1, dt*1.2));
          p.vy *= (1 - Math.min(1, dt*1.2));
          p.rise *= (1 - Math.min(1, dt*2.6));
        }
      }
      if (e.t >= e.ttl && e.parts.length===0){
        explosions.splice(i,1);
      }
    }
  }

  function hasControllableAssets(team){
    // Controllable assets: any alive unit OR any alive non-civil building (including captured).
    const hasU = units.some(u=>u.alive && u.team===team);
    if (hasU) return true;
    const hasB = buildings.some(b=>b.alive && !b.civ && b.team===team && b.selectable!==false);
    return hasB;
  }

  function checkElimination(){
    if (gameOver) return;
    const enemyAlive = hasControllableAssets(TEAM.ENEMY);
    const playerAlive = hasControllableAssets(TEAM.PLAYER);

    if (!enemyAlive){
      gameOver = true;
      running = false;
      toast("승리!");
    } else if (!playerAlive){
      gameOver = true;
      running = false;
      toast("패배...");
    }
  }

// Player production request queues (FIFO per factory type).
// Infantry + Engineer share the Barracks queue (RA2-style).
const prodFIFO = { barracks: [], factory: [] };
const prodTotal = { infantry:0, engineer:0, sniper:0, tank:0, harvester:0, ifv:0 };
const QCAP = 30;

// Economy module hookup (ou_economy.js)
// Must be loaded BEFORE game.js in index.html.
const __ou_econ = (window.OUEconomy && typeof window.OUEconomy.create==="function")
  ? window.OUEconomy.create({
      state, buildings, TEAM, COST, POWER,
      prodFIFO, prodTotal, QCAP,
      clamp,
      BUILD_SPEED_MIN_PER_1000,
      GAME_SPEED,
      BUILD_PROD_MULT,
      MULTIPLE_FACTORY,
      ENEMY_PROD_SPEED,
      toast,
      updateProdBadges,
      // spawn helpers (used by production completion)
      addUnit,
      setPathTo,
      findSpawnPointNear,
      findNearestFreePoint
    })
  : null;

if (!__ou_econ) console.warn("[ou_economy] missing: include js/ou_economy.js before game.js");

// Simulation module hookup (sim.js)
// Prep: pass unit-tick dependencies so we can move tickUnits in the next step.
const __ou_sim = (window.OUSim && typeof window.OUSim.create==="function")
  ? window.OUSim.create({
      // core sim ticks
            // shared refs for sim internals
      buildings,
      units,
      bullets,
      flashes,
      impacts,
      explored,
      visible,
      fires,
      healMarks,
      casings,
      traces,
      TEAM,
      POWER,
      DEFENSE,
      BUILD,
      UNIT,
      occAll,
      occInf,
      occVeh,
      occAnyId,
      occTeam,
      occResId,
      infSlotNext0,
      infSlotNext1,
      infSlotMask0,
      infSlotMask1,
      INF_SLOT_MAX,
      terrain,
      TILE,
      MAP_W,
      MAP_H,
      WORLD_W,
      WORLD_H,
      ore,
      state,
      clamp,
      rnd,
      getFogEnabled: () => !!fogEnabled,
      getPowerFactor,
      isUnderPower,
      getEntityById,
      dist2,
      worldVecToDir8,
      worldToIso,
      isoToWorld,
      tileOfX,
      tileOfY,
      tileToWorldCenter,
      inMap,
      isWalkableTile,
      isReservedByOther,
      idx,
      followPath,
      
      tileToWorldSubslot,
      snapWorldToTileCenter,
      isBlockedWorldPoint,
      buildOcc,
      _turnStepTowardTurret,
      _advanceTurnState,
      _turretTurnFrameNum,
      // spawnBullet/spawnTrace/mg/sniper now live in sim
      spawnTrailPuff,
      spawnDmgSmokePuff,
      applyDamage,
      crushInfantry,
      captureBuilding,
      boardUnitIntoIFV,
      // turret/bullet deps
      updateExplosions
    })
  : null;
if (!__ou_sim) console.warn("[ou_sim] missing: include js/sim.js before game.js");

// AI module hookup (ai.js)
const __ou_ai = (window.OUAi && typeof window.OUAi.create==="function")
  ? window.OUAi.create({
      buildings,
      units,
      state,
      TEAM,
      BUILD,
      DEFENSE,
      UNIT,
      COST,
      TILE,
      WORLD_W,
      WORLD_H,
      GAME_SPEED,
      BUILD_PROD_MULT,
      clamp,
      rnd,
      dist2,
      getPowerFactor,
      getBaseBuildTime,
      inMap,
      isBlockedFootprint,
      isTooCloseToOtherBuildings,
      buildingWorldFromTileOrigin,
      inBuildRadius,
      addBuilding,
      findNearestFreePoint,
      setPathTo,
      getEntityById,
      boardUnitIntoIFV,
      unboardIFV: tryUnloadIFV,
      getClosestPointOnBuilding,
      dist2PointToRect,
      tileToWorldCenter
    })
  : null;
if (!__ou_ai) console.warn("[ou_ai] missing: include js/ai.js before game.js");

// Delegated helpers (sim.js owns implementations)
function clearOcc(dt){
  if (__ou_sim && typeof __ou_sim.clearOcc === "function") return __ou_sim.clearOcc(dt);
}
function resolveUnitOverlaps(){
  if (__ou_sim && typeof __ou_sim.resolveUnitOverlaps === "function") return __ou_sim.resolveUnitOverlaps();
}
  function updateVision(){
  if (__ou_sim && typeof __ou_sim.updateVision === "function") return __ou_sim.updateVision();
}
  function recomputePower(){
  // Prefer economy module's power calc, but fall back if missing/NaN/0/0 while buildings exist.
  if (__ou_econ && typeof __ou_econ.recomputePower === "function"){
    try { __ou_econ.recomputePower(); }
    catch(e){ console.warn("[power] econ recomputePower failed", e); }
  }

  const p = state.player || (state.player = {});
  const e = state.enemy  || (state.enemy  = {});
  const hasPlayerBld = buildings.some(b => b && b.alive && !b.civ && b.team === TEAM.PLAYER);
  const hasEnemyBld  = buildings.some(b => b && b.alive && !b.civ && b.team === TEAM.ENEMY);

  const pOk = Number.isFinite(p.powerProd) && Number.isFinite(p.powerUse);
  const eOk = Number.isFinite(e.powerProd) && Number.isFinite(e.powerUse);
  const suspiciousP = hasPlayerBld && ((p.powerProd|0) === 0 && (p.powerUse|0) === 0);
  const suspiciousE = hasEnemyBld  && ((e.powerProd|0) === 0 && (e.powerUse|0) === 0);

  if (!pOk || !eOk || suspiciousP || suspiciousE){
    function calc(team){
      let prod = 0, use = 0;
      for (const b of buildings){
        if (!b || !b.alive || b.team !== team || b.civ) continue;
        if (b.kind === "hq")      prod += (POWER.hqProd || 0);
        if (b.kind === "power")   prod += (POWER.powerPlant || 0);
        if (b.kind === "refinery")use  += (POWER.refineryUse || 0);
        if (b.kind === "barracks")use  += (POWER.barracksUse || 0);
        if (b.kind === "factory") use  += (POWER.factoryUse || 0);
        if (b.kind === "radar")   use  += (POWER.radarUse || 0);
        if (b.kind === "turret")  use  += (POWER.turretUse || 0);
      }
      return { prod, use };
    }
    const pp = calc(TEAM.PLAYER);
    p.powerProd = pp.prod;
    p.powerUse  = pp.use;
    const ee = calc(TEAM.ENEMY);
    e.powerProd = ee.prod;
    e.powerUse  = ee.use;
  }

  if (__ou_econ && typeof __ou_econ.validateTechQueues === "function"){
    try { __ou_econ.validateTechQueues(); } catch(_){}
  }
}
function clearReservation(u){
  if (__ou_sim && typeof __ou_sim.clearReservation === "function") return __ou_sim.clearReservation(u);
}
function settleInfantryToSubslot(u, dt){
  if (__ou_sim && typeof __ou_sim.settleInfantryToSubslot === "function") return __ou_sim.settleInfantryToSubslot(u, dt);
}
function findNearestFreePoint(wx, wy, u, r=3){
  if (__ou_sim && typeof __ou_sim.findNearestFreePoint === "function") return __ou_sim.findNearestFreePoint(wx, wy, u, r);
  return {x: wx, y: wy, found: false};
}
function findNearestRefinery(team, wx, wy){
  if (__ou_sim && typeof __ou_sim.findNearestRefinery === "function") return __ou_sim.findNearestRefinery(team, wx, wy);
  return null;
}
function getDockPoint(b, u){
  if (__ou_sim && typeof __ou_sim.getDockPoint === "function") return __ou_sim.getDockPoint(b, u);
  return {x: b.x, y: b.y};
}
function getClosestPointOnBuilding(b, u){
  if (__ou_sim && typeof __ou_sim.getClosestPointOnBuilding === "function") return __ou_sim.getClosestPointOnBuilding(b, u);
  return {x: b.x, y: b.y};
}
function dist2PointToRect(px,py, rx,ry,rw,rh){
  if (__ou_sim && typeof __ou_sim.dist2PointToRect === "function") return __ou_sim.dist2PointToRect(px,py,rx,ry,rw,rh);
  const hx=rw*0.5, hy=rh*0.5;
  const dx=Math.max(Math.abs(px-rx)-hx, 0);
  const dy=Math.max(Math.abs(py-ry)-hy, 0);
  return dx*dx + dy*dy;
}
function isReservedByOther(u, tx, ty){
  if (__ou_sim && typeof __ou_sim.isReservedByOther === "function") return __ou_sim.isReservedByOther(u, tx, ty);
  return false;
}
function reserveTile(u, tx, ty){
  if (__ou_sim && typeof __ou_sim.reserveTile === "function") return __ou_sim.reserveTile(u, tx, ty);
  return false;
}
function isSqueezedTile(tx, ty){
  if (__ou_sim && typeof __ou_sim.isSqueezedTile === "function") return __ou_sim.isSqueezedTile(tx, ty);
  return false;
}
function findNearestFreeStep(u){
  if (__ou_sim && typeof __ou_sim.findNearestFreeStep === "function") return __ou_sim.findNearestFreeStep(u);
  return null;
}
function canEnterTile(u, tx, ty){
  if (__ou_sim && typeof __ou_sim.canEnterTile === "function") return __ou_sim.canEnterTile(u, tx, ty);
  return false;
}
function canEnterTileGoal(u, tx, ty, t){
  if (__ou_sim && typeof __ou_sim.canEnterTileGoal === "function") return __ou_sim.canEnterTileGoal(u, tx, ty, t);
  return false;
}



function heuristic(ax,ay,bx,by){
  if (__ou_sim && typeof __ou_sim.heuristic === "function") return __ou_sim.heuristic(ax,ay,bx,by);
  return 0;
}
function aStarPath(sx,sy,gx,gy, maxNodes=12000){
  if (__ou_sim && typeof __ou_sim.aStarPath === "function") return __ou_sim.aStarPath(sx,sy,gx,gy, maxNodes);
  return null;
}
function aStarPathOcc(u, sx, sy, gx, gy){
  if (__ou_sim && typeof __ou_sim.aStarPathOcc === "function") return __ou_sim.aStarPathOcc(u, sx, sy, gx, gy);
  return null;
}
function setPathTo(u, goalX, goalY){
  if (__ou_sim && typeof __ou_sim.setPathTo === "function") return __ou_sim.setPathTo(u, goalX, goalY);
  return false;
}



// Progress accessors (calculation in ou_economy; UI draws only)
state.getBuildProgress = function(kind, laneKey){
  return (__ou_econ && __ou_econ.getBuildProgress) ? __ou_econ.getBuildProgress(kind, laneKey) : null;
};
state.getUnitProgress = function(kind, producerKind){
  return (__ou_econ && __ou_econ.getUnitProgress) ? __ou_econ.getUnitProgress(kind, producerKind) : null;
};
state.getLaneStatus = function(laneKey){
  return (__ou_econ && __ou_econ.getLaneStatus) ? __ou_econ.getLaneStatus(laneKey) : null;
};
state.getProducerStatus = function(producerKind){
  return (__ou_econ && __ou_econ.getProducerStatus) ? __ou_econ.getProducerStatus(producerKind) : null;
};


function kindToProducer(kind){
    return (__ou_econ && __ou_econ.kindToProducer) ? __ou_econ.kindToProducer(kind) : "barracks";
  }

function queueUnit(kind){
    // If the front item of the relevant producer queue is paused, left-click should RESUME instead of enqueue.
    const need = kindToProducer(kind);
    let resumed = false;
    for (const b of buildings){
      if (!b || !b.alive || b.civ || b.team !== TEAM.PLAYER || b.kind !== need) continue;
      const q = b.buildQ && b.buildQ[0];
      if (q && q.kind === kind && q.paused){
        q.paused = false;
        q.autoPaused = false;
        resumed = true;
      }
    }
    if (resumed){
      toast("재개");
      return;
    }
    return (__ou_econ && __ou_econ.queueUnit) ? __ou_econ.queueUnit(kind) : undefined;
  }



// Always resolve the current badge element from the button each time.
// (Buttons can be rebuilt/reattached; caching can point at detached nodes.)
function updateProdBadges(){
  if (!__ou_ui || !__ou_ui.updateProdBadges) return;
  // ou_ui.updateProdBadges expects { prodTotal }
  __ou_ui.updateProdBadges({ prodTotal });
}







// Ensure PRIMARY producer id points to a living building; if not, reassign to first available.
function ensurePrimaryProducer(kind){
    return (__ou_econ && __ou_econ.ensurePrimaryProducer) ? __ou_econ.ensurePrimaryProducer(kind) : undefined;
  }

function findProducer(team, kind){
    return (__ou_econ && __ou_econ.findProducer) ? __ou_econ.findProducer(team, kind) : null;
  }

function normalizeProducerQueues(producerType){
    return (__ou_econ && __ou_econ.normalizeProducerQueues) ? __ou_econ.normalizeProducerQueues(producerType) : undefined;
  }

function feedProducers(){
    return (__ou_econ && __ou_econ.feedProducers) ? __ou_econ.feedProducers() : undefined;
  }

function findSpawnPointNear(b, unitKind, opts){
    // Tile-first spawn search (C&C style): find a truly free tile around the producer footprint.
    // This prevents units from spawning "inside" the building footprint due to world-space rounding.
    const rUnit = (UNIT[unitKind]||UNIT.infantry).r || 10;

    const isTileClearForSpawn = (tx,ty)=>{
      if (!inMap(tx,ty)) return false;
      if (!isWalkableTile(tx,ty)) return false;            // terrain/buildOcc/ore etc.
      const i=idx(tx,ty);
      const ignoreUnits = !!(opts && opts.ignoreUnits);
      if (!ignoreUnits){
        if ((occAll[i]||0)>0) return false;                  // any unit currently occupying tile
      }
      const p = tileToWorldCenter(tx,ty);
      // avoid overlapping other live units (radius check)
      if (!ignoreUnits){
        for (const u of units){
          if (!u.alive || u.inTransport) continue;
          if (dist2(p.x,p.y,u.x,u.y) < (rUnit+u.r+2)*(rUnit+u.r+2)) return false;
        }
      }
      // avoid being inside any building AABB (extra safety)
      for (const bb of buildings){
        if (!bb.alive || bb.civ) continue;
        if (p.x >= bb.x-2 && p.x <= bb.x+bb.w+2 && p.y >= bb.y-2 && p.y <= bb.y+bb.h+2) return false;
      }
      return true;
    };

    // Search expanding rings around building footprint in tile space.
    const x0=b.tx, y0=b.ty, x1=b.tx+b.tw-1, y1=b.ty+b.th-1;
    const maxR = 14;
    for (let r=1; r<=maxR; r++){
      const left = x0 - r, right = x1 + r, top = y0 - r, bottom = y1 + r;
      // perimeter of expanded rect
      for (let tx=left; tx<=right; tx++){
        if (isTileClearForSpawn(tx, top))    return tileToWorldCenter(tx, top);
        if (isTileClearForSpawn(tx, bottom)) return tileToWorldCenter(tx, bottom);
      }
      for (let ty=top+1; ty<=bottom-1; ty++){
        if (isTileClearForSpawn(left, ty))   return tileToWorldCenter(left, ty);
        if (isTileClearForSpawn(right, ty))  return tileToWorldCenter(right, ty);
      }
    }

    // Fallback: spiral search near building center
    const ctx = b.tx + (b.tw>>1);
    const cty = b.ty + (b.th>>1);
    for (let r=1; r<=18; r++){
      for (let dy=-r; dy<=r; dy++){
        for (let dx=-r; dx<=r; dx++){
          if (Math.abs(dx)!==r && Math.abs(dy)!==r) continue;
          const tx=ctx+dx, ty=cty+dy;
          if (isTileClearForSpawn(tx,ty)) return tileToWorldCenter(tx,ty);
        }
      }
    }
    return null;
  }

function _ou_collectPlayerProdHeads(){
    const heads = [];
    // Build (construction) heads: lanes
    try{
      if (state && state.buildLane){
        for (const laneKey of ["main","def"]){
          const lane = state.buildLane[laneKey];
          const q = lane && lane.queue;
          if (q && q.kind) heads.push({ q, type:"build", laneKey });
        }
      }
    }catch(_e){}
    // Unit production heads: per building (buildQ[0])
    try{
      for (const b of buildings){
        if (!b || !b.alive) continue;
        if (b.team !== TEAM.PLAYER) continue;
        const q = b.buildQ && b.buildQ[0];
        if (q && q.kind) heads.push({ q, type:"unit", b });
      }
    }catch(_e){}
    return heads;
  }

  function tickProduction(dt){
    if (!(__ou_econ && __ou_econ.tickProduction)) return undefined;

    // Hotfix: paused queue MUST NOT spend money nor advance progress.
    // Some economy ticks ignore q.paused; we enforce it here by snapshot+restore.
    const heads = _ou_collectPlayerProdHeads();
    const paused = [];
    for (const h of heads){
      const q = h.q;
      if (q && q.paused) paused.push({ q, paid: (q.paid||0), t: (q.t||0) });
    }

    const out = __ou_econ.tickProduction(dt);

    if (paused.length){
      let refund = 0;
      for (const s of paused){
        const q = s.q;
        if (!q) continue;
        const paid1 = (q.paid||0);
        const t1 = (q.t||0);

        if (paid1 > s.paid){
          refund += (paid1 - s.paid);
          q.paid = s.paid;
        }
        if (t1 > s.t){
          q.t = s.t;
        }
      }

      if (refund > 0 && state && state.player){
        // refund only the amount that was incorrectly spent while paused
        state.player.money = (state.player.money||0) + refund;
      }
    }

    return out;
  }

  function tickRepairs(dt){
    const rate = 35;
    const costPerHp = 1.0;

    for (const b of buildings){
      if (!b.alive || b.civ) continue;

      // Enemy AI auto-repair: if recently damaged, enable repair automatically (player is manual).
      if (b.team===TEAM.ENEMY){
        const recentlyHit = (state.t - (b.lastDamaged||-9999)) < 2.5;
        if (recentlyHit && b.hp < b.hpMax) b.repairOn = true;
      }

      if (!b.repairOn) continue;

      if (b.hp >= b.hpMax){ b.repairOn = false; continue; }

      const wallet = (b.team===TEAM.PLAYER) ? state.player : state.enemy;

      const heal = Math.min(rate*dt, b.hpMax - b.hp);
      const cost = heal * costPerHp;

      if (wallet.money >= cost){
        wallet.money -= cost;
        b.hp += heal;

        // Wrench FX while repairing: keep ONE per building, refresh it instead of stacking.
        b.repairFxCd = (b.repairFxCd||0) - dt;
        if (b.repairFxCd<=0){
          let fx = null;
          for (const w of repairWrenches){ if (w.bid===b.id){ fx=w; break; } }
          if (!fx){
            fx = { bid:b.id, x:b.x, y:b.y, t0:state.t, last:state.t, ttl:0.70 };
            repairWrenches.push(fx);
            } else {
            fx.x = b.x; fx.y = b.y;
            fx.last = state.t; // refresh lifetime (do not reset animation)
            fx.ttl = 0.70;
          }
          b.repairFxCd = 0.12;
        }
      } else {
        b.repairOn = false;
      }
    }
  }

  
  function spawnEvacUnitsFromBuilding(b, destroyed){
    if (!b || b.civ) return;
    if (!b.alive && !destroyed) return;
    if (b.kind==="turret") return;
    const team=b.team;
    const hpFrac = destroyed ? 0.5 : 1.0;
    const spawnOne = (kind)=>{
      // Try strict spawn first (truly free tile). If the building just died and the area is crowded,
      // relax unit-occupancy checks as a last resort to avoid hard-crashing.
      let sp = findSpawnPointNear(b, kind, {ignoreUnits:false});
      if (!sp && destroyed){
        sp = findSpawnPointNear(b, kind, {ignoreUnits:true});
      }
      if (!sp) return null; // no valid spawn point found
      const u = addUnit(team, kind, sp.x, sp.y);
      u.hp = Math.max(1, u.hpMax*hpFrac);
      return u;
    };
    if (b.kind==="hq"){
      for (let i=0;i<3;i++) spawnOne("infantry");
      spawnOne("engineer");
    } else {
      spawnOne("infantry");
    }
  }

function sellBuilding(b){
    if (!b || !b.alive || b.civ) return;

    // Prevent double-sell spam while animation is running
    if ((b.kind==="barracks" && b._barrackSelling) || (b.kind==="power" && b._powerSelling)) return;

    // If selling a producer with an active queue, refund paid progress and clear the queue.
    if (b.team===TEAM.PLAYER && b.buildQ && b.buildQ.length){
      let qRefund=0;
      for (const q of b.buildQ){
        qRefund += (q && q.paid) ? q.paid : 0;
        if (q && q.kind && prodTotal && prodTotal[q.kind]!=null){
          prodTotal[q.kind] = Math.max(0, (prodTotal[q.kind]||0)-1);
        }
      }
      if (qRefund>0){
        state.player.money += qRefund;
        state.player.money = Math.round(state.player.money||0);
      }
      b.buildQ.length = 0;
      updateProdBadges();
    }

const refund = Math.floor((COST[b.kind]||0) * 0.5);
    if (b.team===TEAM.PLAYER) state.player.money += refund;
    else state.enemy.money += refund;

    // Selling evacuates units at full HP (RA2-ish flavor).
    spawnEvacUnitsFromBuilding(b, false);

    // Barracks / Power Plant: play "construction" animation in reverse, then remove footprint.
    if (b.kind==="barracks" || b.kind==="power"){
      const _flag = (b.kind==="barracks") ? "_barrackSelling" : "_powerSelling";
      const _t0   = (b.kind==="barracks") ? "_barrackSellT0" : "_powerSellT0";
      const _fin  = (b.kind==="barracks") ? "_barrackSellFinalizeAt" : "_powerSellFinalizeAt";
      try{
        if (window.PO && PO.buildings && PO.buildings.onSold){
          PO.buildings.onSold(b, state);
        }else{
          // Fallback: if plugin missing, schedule a short delay so it doesn't insta-pop.
          b[_flag] = true;
          b[_t0] = state.t;
          b[_fin] = state.t + 0.9;
        }
      }catch(_e){
        b[_flag] = true;
        b[_t0] = state.t;
        b[_fin] = state.t + 0.9;
      }

      // Immediately unselect, but keep it alive/occupying until animation finishes.
      state.selection.delete(b.id);
      return;
    }
// Default: immediate removal
    try{ if (window.PO && PO.buildings && PO.buildings.onSold) PO.buildings.onSold(b, state); }catch(_e){}
    b.alive=false;
    state.selection.delete(b.id);
    setBuildingOcc(b,0);
    recomputePower();
    checkElimination();
  }

  function captureBuilding(engineer, b){
    if (b.civ) return;
    b.team = engineer.team;
    // Capturing should not damage the building.
    b.hp = Math.max(1, b.hp);
    b.repairOn=false;

    // Enemy engineer AI: ALWAYS sell captured buildings (defer via econ queue for consistency).
    if (engineer.team===TEAM.ENEMY){
      enqueueEcon({ type:"sellByIdAny", id: b.id });
    }

    recomputePower();
    checkElimination();
    engineer.alive=false;
    state.selection.delete(engineer.id);
    checkElimination();
  }

  
function pointInPoly(x,y,poly){
  // poly: [{x,y},...], convex or concave
  let inside=false;
  for (let i=0,j=poly.length-1;i<poly.length;j=i++){
    const xi=poly[i].x, yi=poly[i].y;
    const xj=poly[j].x, yj=poly[j].y;
    const intersect = ((yi>y)!==(yj>y)) && (x < (xj-xi)*(y-yi)/( (yj-yi)||1e-9 ) + xi);
    if (intersect) inside=!inside;
  }
  return inside;
}
function buildingScreenPoly(b){
  // footprint corners in world (tile origin space)
  const x0=b.tx*TILE, y0=b.ty*TILE;
  const x1=(b.tx+b.tw)*TILE, y1=(b.ty+b.th)*TILE;
  const p0=worldToScreen(x0,y0);
  const p1=worldToScreen(x1,y0);
  const p2=worldToScreen(x1,y1);
  const p3=worldToScreen(x0,y1);
  return [p0,p1,p2,p3];
}
function pickEntityAtWorld(wx,wy){
    const m=worldToScreen(wx,wy);

    for (let i=units.length-1;i>=0;i--){
      const u=units[i];
      if (!u.alive) continue;
      if (u.inTransport) continue;
      const tx=tileOfX(u.x), ty=tileOfY(u.y);
      if (u.team===TEAM.ENEMY && inMap(tx,ty) && !explored[TEAM.PLAYER][idx(tx,ty)]) continue;
      let p;
      {
        const tx=tileOfX(u.x), ty=tileOfY(u.y);
        const cls = (UNIT[u.kind] && UNIT[u.kind].cls) ? UNIT[u.kind].cls : "";
        if (cls==="inf"){
          const sp = tileToWorldSubslot(tx,ty,(u.subSlot|0));
          p=worldToScreen(sp.x, sp.y);
        } else {
          p=worldToScreen(u.x,u.y);
        }
      }
      // Shrink pick radius for IFV to prevent accidental boarding when clicking near it.
      const pr = (u.kind==="ifv") ? (u.r*0.60) : u.r;
      if (dist2(p.x,p.y,m.x,m.y) <= (pr*cam.zoom)*(pr*cam.zoom)) return u;
    }

    for (let i=buildings.length-1;i>=0;i--){
      const b=buildings[i];
      if (!b.alive || b.selectable===false) continue;
      if (b.civ) continue;
      if (b.team===TEAM.ENEMY && !explored[TEAM.PLAYER][idx(b.tx,b.ty)]) continue;

      // Pixel-accurate isometric footprint hit-test (fixes adjacent-building mis-picks).
      const poly = buildingScreenPoly(b);
      if (pointInPoly(m.x,m.y,poly)) return b;

      // fallback: small center radius for tiny 1x1 stuff
      const p=worldToScreen(b.x,b.y);
      const rad=Math.max(b.tw,b.th)*ISO_X*0.45*cam.zoom;
      if (dist2(p.x,p.y,m.x,m.y) <= rad*rad) return b;
    }
    return null;
  }


// Prevent "tap-dance" jitter when the player spam-clicks the same command rapidly.
function shouldIgnoreCmd(e, type, x, y, targetId=null){
  const now = state.t || 0;
  const lastT = e.lastCmdT || -999;
  if ((now - lastT) > 0.22) return false;

  const lastType = e.lastCmdType || "";
  if (lastType !== type) return false;

  // Same target attack spam
  if (targetId!=null){
    if ((e.lastCmdTarget ?? null) !== targetId) return false;
    return true;
  }

  // Same-position move spam
  const lx = e.lastCmdX ?? 1e9;
  const ly = e.lastCmdY ?? 1e9;
  const dx = (x - lx), dy = (y - ly);
  if (dx*dx + dy*dy <= 22*22) return true;
  return false;
}
function stampCmd(e, type, x, y, targetId=null){
  e.lastCmdT = state.t || 0;
  e.lastCmdType = type;
  e.lastCmdX = x;
  e.lastCmdY = y;
  e.lastCmdTarget = targetId;
}

  function buildFormationOffsets(maxN){
    // Spiral in manhattan rings: 0, then 4, then 8...
    const out=[{dx:0,dy:0}];
    let r=1;
    while (out.length<maxN){
      // diamond ring: (r,0)->(0,r)->(-r,0)->(0,-r)
      for (let dx=-r; dx<=r; dx++){
        const dy = r - Math.abs(dx);
        out.push({dx,dy});
        if (dy!==0) out.push({dx,dy:-dy});
        if (out.length>=maxN) return out;
      }
      r++;
      if (r>64) break;
    }
    return out;
  }

  function issueMoveAll(x,y){
    const ids=[...state.selection];
    // Snap click to nearest tile center
    const snap = snapWorldToTileCenter(x,y);
    const baseTx=snap.tx, baseTy=snap.ty;

    // Directional intent inside the clicked tile (helps picking the adjacent side when the tile is occupied).
    const baseCenter = tileToWorldCenter(baseTx, baseTy);
    const intentVX = x - baseCenter.x;
    const intentVY = y - baseCenter.y;


    // Precompute candidate offsets sized to selection
    const offsets = buildFormationOffsets(Math.max(16, ids.length*6));
    const used = new Set();
  const infCount = new Map();
    // RA2-feel: for infantry, assign a stable destination sub-slot per target tile
    const __tileSubMask = new Map();
    let k=0;
    for (const id of ids){
      const e=getEntityById(id);
      if (!e || e.team!==TEAM.PLAYER) continue;
      if (BUILD[e.kind]) continue;
      if (shouldIgnoreCmd(e,'move',x,y,null)) continue;

      e.guard=null; e.guardFrom=false;
      e.restX=null; e.restY=null;
      e.target=null;
      // Cancel firing animation immediately when moving
      e.fireHoldT=0; e.fireDir=null;
      e.forceMoveUntil = state.t + 1.25;
      e.repathCd=0.15;

      // pick best nearby free tile among offsets, biased to the actual mouse world point (x,y)
      // so clicking near a unit lets you place destinations to its side/front more predictably.
      let chosen=null;
      let bestScore=1e18;
      for (let j=0; j<offsets.length; j++){
        const tx = baseTx + offsets[j].dx;
        const ty = baseTy + offsets[j].dy;
        if (!inMap(tx,ty)) continue;
        const key = tx+"," + ty;
        if(UNIT[e.kind]?.cls!=="inf") { if(used.has(key)) continue; }
        else { const c = infCount.get(key)||0; if(c>=INF_SLOT_MAX) continue; infCount.set(key,c+1); }
        if (!canEnterTile(e, tx, ty)) continue;
        const wpC = tileToWorldCenter(tx,ty);
        // score: distance to the actual click + tiny ring penalty (prefer closer rings)
        const dxw = (wpC.x - x), dyw = (wpC.y - y);
        const ring = (Math.abs(offsets[j].dx)+Math.abs(offsets[j].dy));
        const dot = (offsets[j].dx*intentVX + offsets[j].dy*intentVY);
        // Lower score is better; dot>0 means tile is in the direction you clicked within the occupied tile.
        const score = dxw*dxw + dyw*dyw + ring*9 - dot*1.2;
        if (score < bestScore){
          bestScore=score;
          chosen={tx,ty};
        }
        // Early exit for perfect hit
        if (score < 1) break;
      }
      // reserve chosen now (so other units won't pick it)
      if (chosen){
        if (!reserveTile(e, chosen.tx, chosen.ty)){
          chosen=null;
        } else {
          used.add(chosen.tx+","+chosen.ty);
        }
      }
      // if nothing free, fall back to base tile center
      if (!chosen) chosen={tx:baseTx, ty:baseTy};// RA2-feel: vehicles still go to tile center; infantry go to a reserved sub-slot inside the tile
const cls = (UNIT[e.kind] && UNIT[e.kind].cls) ? UNIT[e.kind].cls : "";
let wp;
let subSlot = null;
if (cls==="inf"){
  const tkey = chosen.tx + "," + chosen.ty;
  let mask = __tileSubMask.get(tkey) || 0;
  let pick = 0;
  for (let s=0; s<4; s++){
    if (((mask>>s)&1)===0){ pick=s; break; }
  }
  subSlot = pick;
  mask = (mask | (1<<pick)) & 0x0F;
  __tileSubMask.set(tkey, mask);
  wp = tileToWorldSubslot(chosen.tx, chosen.ty, pick);
} else {
  wp = tileToWorldCenter(chosen.tx, chosen.ty);
}
e.order={type:"move", x:wp.x, y:wp.y, tx:chosen.tx, ty:chosen.ty, subSlot:subSlot};

      e.holdPos = false;

      pushOrderFx(e.id,"move",wp.x,wp.y,null,"rgba(90,255,90,0.95)");
      setPathTo(e, wp.x, wp.y);
      showUnitPathFx(e, wp.x, wp.y, "rgba(255,255,255,0.85)");
      stampCmd(e,'move',wp.x,wp.y,null);
      k++;
    }
  }

  function issueMoveCombatOnly(x,y){
    const ids=[...state.selection];
    let k=0; const spacing=46;
    for (const id of ids){
      const e=getEntityById(id);
      if (!e || e.team!==TEAM.PLAYER) continue;
      if (BUILD[e.kind]) continue;
      if (e.kind==="harvester") continue;
      if (shouldIgnoreCmd(e,'move',x,y,null)) continue;
      const col=k%5, row=(k/5)|0;
      const ox=(col-2)*spacing;
      const oy=row*spacing - spacing;
      let gx=x+ox, gy=y+oy;
      const spot=findNearestFreePoint(gx,gy,e,4);
      if (spot && spot.found){ gx=spot.x; gy=spot.y; }
      e.order={type:"move", x:gx, y:gy, tx:null,ty:null, manual:true, allowAuto:false, lockTarget:false};
      e.restX=null; e.restY=null;
      e.target=null;
      // Cancel firing animation immediately when moving
      e.fireHoldT=0; e.fireDir=null;
      pushOrderFx(e.id,"move",gx,gy,null,"rgba(90,255,90,0.95)");
      e.forceMoveUntil = state.t + 1.25;
      setPathTo(e, gx, gy);
      showUnitPathFx(e, gx, gy, "rgba(255,255,255,0.85)");
      e.repathCd=0.25;
      stampCmd(e,'move',gx,gy,null);
      k++;
    }
  }
  function issueAttackMove(x,y){
    const ids=[...state.selection];
    let k=0; const spacing=46;
    for (const id of ids){
      const u=getEntityById(id);
      if (!u || u.team!==TEAM.PLAYER) continue;
      if (BUILD[u.kind]) continue;
      u.guard=null; u.guardFrom=false;
      if (u.kind==="harvester" || u.kind==="engineer") continue;
      if ((u.range||0) <= 0) continue;

      const col=k%5, row=(k/5)|0;
      const ox=(col-2)*spacing;
      const oy=row*spacing - spacing;
      let gx=x+ox, gy=y+oy;
      const spot=findNearestFreePoint(gx,gy,u,4);
      if (spot && spot.found){ gx=spot.x; gy=spot.y; }

            if (shouldIgnoreCmd(u,'attackmove',gx,gy,null)) { k++; continue; }
u.order={type:"attackmove", x:gx, y:gy, tx:null,ty:null, manual:true, allowAuto:true, lockTarget:false};
      u.holdPos = false;
      u.target=null;
      // Cancel firing animation immediately when moving (attack-move)
      u.fireHoldT=0; u.fireDir=null;
      setPathTo(u, gx, gy);
      pushOrderFx(u.id,"attackmove",gx,gy,null,"rgba(255,90,90,0.95)");
      u.repathCd=0.25;
      k++;
      stampCmd(u,'attackmove',gx,gy,null);
    }
  }


  function issueGuard(){
    const ids=[...state.selection];
    for (const id of ids){
      const u=getEntityById(id);
      if (!u || u.team!==TEAM.PLAYER) continue;
      if (BUILD[u.kind]) continue;
      if ((u.range||0)<=0 || u.kind==="engineer" || u.kind==="harvester") continue;

      u.guard = { on:true, x0:u.x, y0:u.y };
      u.order = { type:"guard", x:u.x, y:u.y, tx:null,ty:null };
      u.target = null;
      u.path = null;

      // quick feedback ring
      showUnitPathFx(u, u.x, u.y, "rgba(120,255,120,0.9)");
    }
  }
  function assignControlGroup(n){
    if (n<1 || n>9) return;
    const prev = controlGroups[n] || [];
    // clear old badges for this group
    for (const id of prev){
      const e=getEntityById(id);
      if (e && e.grp===n) e.grp=0;
    }
    const ids=[...state.selection];
    controlGroups[n]=ids;
    for (const id of ids){
      const e=getEntityById(id);
      if (e) e.grp=n;
    }
  }

  function recallControlGroup(n){
    if (n<1 || n>9) return;
    const ids=controlGroups[n] || [];
    state.selection.clear();
    for (const id of ids){
      const e=getEntityById(id);
      if (e && e.alive) state.selection.add(id);
    }
    updateSelectionUI();
  }


  

function getChasePointForAttack(u, t){
  // Buildings have tx/ty footprint; units don't. Using building-dock math on units creates NaN paths/waypoints.
  if (!t) return {x:u.x, y:u.y};
  if (BUILD[t.kind]) return getClosestPointOnBuilding(t, u);
  let want = Math.max(32, ((u.range||0) > 0 ? (u.range*0.85) : TILE));
  // If this unit has an assigned encirclement slot for this target, push it onto outer rings (prevents backline "waiting in line").
  if (u && u.atkSlotT===t.id && u.atkSlotRing!=null) want += (u.atkSlotRing * TILE * 0.65);

  const isB = !!(BUILD[t.kind]);
  const tr = isB ? (Math.max(BUILD[t.kind].tw, BUILD[t.kind].th) * TILE * 0.5 * 0.95) : (t.r||0);
  const seed = (u && u.atkSlotT===t.id && isFinite(u.atkSlotAng)) ? u.atkSlotAng : null;

  const p = (__ou_sim && __ou_sim.getStandoffPoint) ? __ou_sim.getStandoffPoint(u, t, want, isB, tr, seed) : null;
  return p || {x:t.x, y:t.y};
}
function issueAttack(targetId){
    const t=getEntityById(targetId);
    if (!t || t.attackable===false) return;

    const ids=[...state.selection];
    const spacing=0.85*TILE;
    // Assign deterministic encirclement slots (multi-ring) so large groups don't queue behind each other.
    const atkUnits = [];
    for (let k=0;k<ids.length;k++){
      const uu=getEntityById(ids[k]);
      if (!uu || !uu.alive || uu.type!=="unit") continue;
      const isEngIFV = (uu.kind==="ifv" && uu.passKind==="engineer");
      if (isEngIFV) continue;
      if (!uu.canAttack) continue;
      atkUnits.push(uu);
    }
    // Use group centroid as the "front" reference so rings distribute around the target consistently.
    let cx=0, cy=0;
    for (const uu of atkUnits){ cx+=uu.x; cy+=uu.y; }
    if (atkUnits.length){ cx/=atkUnits.length; cy/=atkUnits.length; }
    const baseAng = Math.atan2(cy - t.y, cx - t.x);
    // Slots per ring: roughly one per ~0.9 tile of circumference at preferred distance
    const baseDist = Math.max(2*TILE, (atkUnits[0] && atkUnits[0].range ? (atkUnits[0].range*0.85) : 2*TILE));
    const slotsPerRing = clamp(((Math.PI*2*baseDist)/(TILE*0.9))|0, 8, 16);
    for (let j=0;j<atkUnits.length;j++){
      const uu = atkUnits[j];
      const ring = (j/slotsPerRing)|0;
      const idx = j - ring*slotsPerRing;
      const ringCount = Math.min(slotsPerRing, atkUnits.length - ring*slotsPerRing);
      const ang = baseAng + (idx / Math.max(1, ringCount)) * (Math.PI*2);
      uu.atkSlotT = t.id;
      uu.atkSlotAng = ang;
      uu.atkSlotRing = ring;    }


    for (let i=0;i<ids.length;i++){
      const u=getEntityById(ids[i]);
      if (!u || !u.alive || u.type!=="unit") continue;

      // If an Engineer-IFV is selected with combat units, treat attack-click as MOVE (support vehicle),
      // while other combat units perform the attack.
      const isEngIFV = (u.kind==="ifv" && u.passKind==="engineer");

      if (!isEngIFV){
        if (!u.canAttack) continue;
      } else {
        // engineer IFV never attacks; it will move toward the target
        u.target = null;
        u.forceFire = null;
      }
      if (state.mode==="repair" || state.mode==="sell") continue;
      if (shouldIgnoreCmd(u,"attack",u.x,u.y,targetId)) continue;

      // formation offset to reduce clumping
      const ring=Math.floor(Math.sqrt(i));
      const ang=(i*2.1)%(Math.PI*2);
      const off=(ring+1)*spacing;
      const ox=Math.cos(ang)*off;
      const oy=Math.sin(ang)*off;

      if (isEngIFV){
        u.order = { type:"move", x:u.x, y:u.y, tx:null, ty:null, manual:true, allowAuto:false, lockTarget:false };
      u.holdPos = false;
        const p=getChasePointForAttack(u,t);
        const ok=setPathTo(u, p.x+ox, p.y+oy);
        if (!ok){
          const gx = p.x+ox, gy = p.y+oy;
          const gtx = tileOfX(gx), gty = tileOfY(gy);
          u.path = [{tx:gtx, ty:gty}]; u.pathI=0;
        }
        u.orderFx = {t:0.55, kind:"move", x:p.x+ox, y:p.y+oy, targetId};
        pushOrderFx(u.id,"move",p.x+ox,p.y+oy,targetId,"rgba(90,255,90,0.95)");
      } else {
        u.order={type:"attack", x:u.x, y:u.y, tx:null, ty:null, manual:true, allowAuto:false, lockTarget:true};
        u.target=targetId;
        u.forceFire=null;

        const p=getChasePointForAttack(u,t);
        const ok=setPathTo(u, p.x+ox, p.y+oy);
        if (!ok){
          const gx = p.x+ox, gy = p.y+oy;
          const gtx = tileOfX(gx), gty = tileOfY(gy);
          u.path = [{tx:gtx, ty:gty}]; u.pathI=0;
        }
        u.orderFx = {t:0.55, kind:"attack", x:p.x+ox, y:p.y+oy, targetId};
        pushOrderFx(u.id,"attack",p.x+ox,p.y+oy,targetId,"rgba(255,70,70,0.95)");
      }
    }
  }

  // Ctrl+LeftClick force-fire/force-attack: ignores team, persists until another order is given.
  function issueForceAttack(targetId){
    const t=getEntityById(targetId);
    if (!t || t.attackable===false || !t.alive) return;
    for (const id of state.selection){
      const e=getEntityById(id);
      if (!e || e.team!==TEAM.PLAYER) continue;
      // Buildings: allow turret to force-attack too.
      if (BUILD[e.kind]){
        if (e.kind==="turret"){
          e.forceFire = { mode:"id", id: targetId };
          toast("공격 지정");
        }
        continue;
      }
      if (e.kind==="harvester"||e.kind==="engineer") continue;
      if ((e.range||0)<=0) continue;
      e.guard=null; e.guardFrom=false;
            if (shouldIgnoreCmd(e,'forceattack',e.x,e.y,targetId)) continue;
e.order={type:"attack", x:e.x,y:e.y, tx:null,ty:null, manual:true, allowAuto:false, lockTarget:true, allowFriendly: (t.team===e.team)};
      e.holdPos = false;
      e.target=targetId;
      e.forceFire = null;
      const p=getChasePointForAttack(e, t);
      setPathTo(e, p.x, p.y);
      pushOrderFx(e.id,"attack",p.x,p.y,targetId,"rgba(255,70,70,0.95)");
      e.repathCd=0.35;
      stampCmd(e,'attack',p.x,p.y,targetId);
    }
  }

  function issueForceFirePos(x,y){
    for (const id of state.selection){
      const e=getEntityById(id);
      if (!e || e.team!==TEAM.PLAYER) continue;
      if (BUILD[e.kind]){
        if (e.kind==="turret"){
          e.forceFire = { mode:"pos", x, y };
          toast("공격 지정");
        }
        continue;
      }
      if (e.kind==="harvester"||e.kind==="engineer") continue;
      if ((e.range||0)<=0) continue;
      e.guard=null; e.guardFrom=false;
      e.target=null;
      e.forceFire = { x, y };
            if (shouldIgnoreCmd(e,'forcefire',x,y,null)) continue;
e.order={type:"forcefire", x, y, tx:null,ty:null};
      setPathTo(e, x, y);
      showUnitPathFx(e, x, y, "rgba(255,80,80,0.95)");
      e.repathCd=0.35;
      stampCmd(e,'forcefire',x,y,null);
    }
  }

  function issueCapture(targetId){
    const t=getEntityById(targetId);
    if (!t || t.civ) return;
    for (const id of state.selection){
      const e=getEntityById(id);
      if (!e || e.team!==TEAM.PLAYER) continue;
      if (e.kind!=="engineer") continue;
      if (shouldIgnoreCmd(e,'capture',e.x,e.y,targetId)) continue;
      e.order={type:"capture", x:e.x,y:e.y, tx:null,ty:null};
      e.target=targetId;
      const dock=getClosestPointOnBuilding(t,e);
      setPathTo(e, dock.x, dock.y);
      showUnitPathFx(e, t.x, t.y, "rgba(255,220,120,0.95)");
      e.repathCd=0.35;
      stampCmd(e,'capture',dock.x,dock.y,targetId);
    }
  }


// Engineer can enter any damaged friendly building to instantly fully repair it (engineer is consumed).
function issueEngineerRepair(targetId){
  const t=getEntityById(targetId);
  if (!t || !BUILD[t.kind] || t.civ) return;
  if (t.team!==TEAM.PLAYER) return;
  if (t.hp >= t.hpMax-0.5){ toast("수리 불필요"); return; }
  for (const id of state.selection){
    const e=getEntityById(id);
    if (!e || e.team!==TEAM.PLAYER) continue;
    if (e.kind!=="engineer") continue;
    const dock=getClosestPointOnBuilding(t,e);
    if (shouldIgnoreCmd(e,'repairenter',dock.x,dock.y,targetId)) continue;
    e.order={type:"repairenter", x:e.x,y:e.y, tx:null,ty:null};
    e.target=targetId;
    setPathTo(e, dock.x, dock.y);
    showUnitPathFx(e, dock.x, dock.y, "rgba(120,255,120,0.95)");
    e.repathCd=0.35;
    stampCmd(e,'repairenter',dock.x,dock.y,targetId);
  }
}

  function issueHarvest(tx,ty){
    const gx = (tx+0.5)*TILE, gy = (ty+0.5)*TILE;
    for (const id of state.selection){
      const u=getEntityById(id);
      if (!u || u.team!==TEAM.PLAYER || u.kind!=="harvester") continue;
      if (shouldIgnoreCmd(u,'harvest',gx,gy,null)) continue;

      u.manualOre={tx,ty};
      u.order={type:"harvest", x:u.x,y:u.y, tx,ty};
      u.returning=false;
      u.path=null; u.pathI=0;

      setPathTo(u, gx, gy);
      // Harvest is treated as an "attack-style" order for feedback: red line + red endpoint.
      pushOrderFx(u.id,"harvest",gx,gy,null,"rgba(255,70,70,0.95)");
      showUnitPathFx(u, gx, gy, "rgba(255,90,90,0.85)");
      stampCmd(u,'harvest',gx,gy,null);

      u.repathCd=0.25;
      u.stuckTime=0;
    }
  }

  
function issueIFVRepair(targetId){
  const t=getEntityById(targetId);
  if (!t || !t.alive || t.team!==TEAM.PLAYER) return;
  if (BUILD[t.kind]) return;
  const tcls = (UNIT[t.kind] && UNIT[t.kind].cls) ? UNIT[t.kind].cls : "";
  if (tcls!=="veh") return;
  if (t.hp >= t.hpMax-0.5){ toast("수리 불필요"); return; }

  for (const id of state.selection){
    const u=getEntityById(id);
    if (!u || !u.alive || u.team!==TEAM.PLAYER) continue;
    if (u.kind!=="ifv" || u.passKind!=="engineer") continue;
    u.repairTarget = t.id;
    u.order = {type:"move", x:u.x,y:u.y, tx:null,ty:null};
    setPathTo(u, t.x, t.y);
    u.repathCd = 0.25;
  }
  toast("IFV 수리");
}

function crushInfantry(mover){
  // 차량(탱크/굴착기)이 적 보병과 겹치면 즉사(경장갑 룰)
  if (mover.kind!=="tank" && mover.kind!=="harvester") return;
  const enemyTeam = mover.team===TEAM.PLAYER ? TEAM.ENEMY : TEAM.PLAYER;
  for (const u of units){
    if (!u.alive || u.team!==enemyTeam || u.inTransport || u.hidden) continue;
if (u.kind!=="infantry") continue;
    if (dist2(mover.x,mover.y,u.x,u.y) <= (mover.r + u.r)*(mover.r + u.r)*0.55){
      u.alive=false;
      state.selection.delete(u.id);
    }
  }
}


const keys=new Set();
  // DEBUG: Delete key toggles building-destruction click mode (any team)
  let DEBUG_KILL_BUILDINGS = false;
  const _ou_onKeyDown = (e)=>{
    // Pause menu: block gameplay hotkeys while open
    if (pauseMenuOpen){
      const inOverlay = (__ou_ui && typeof __ou_ui.isPauseOverlayTarget === "function")
        ? __ou_ui.isPauseOverlayTarget(e.target)
        : false;
      if (e.key === "Escape" || e.key === "Esc" || e.code === "Escape" || e.keyCode === 27){
        togglePauseMenu(false);
        e.preventDefault();
        return;
      }
      if (!inOverlay){
        e.preventDefault();
        return;
      }
    }
    // DEBUG: toggle building kill mode with Delete key
    if (e.key==="Delete" || e.key==="Del" || e.code==="Delete" || e.keyCode===46){
      DEBUG_KILL_BUILDINGS = !DEBUG_KILL_BUILDINGS;
      try{ toast(`DEBUG: 건물삭제모드 ${DEBUG_KILL_BUILDINGS ? "ON" : "OFF"}`); }catch(_e){}
      e.preventDefault();
      return;
    }

    // DEBUG: EXP1 pivot tuning (only while kill-mode is ON)
    if (DEBUG_KILL_BUILDINGS){
      if (e.key.toLowerCase() === "r"){
        try{ toast(`EXP1 pivot reset`);}catch(_e){}
        e.preventDefault(); return;
      }
    }

    const k=e.key.toLowerCase();
    keys.add(k);

    // Control groups: Ctrl+1..9 assign, 1..9 recall
    if (/^[1-9]$/.test(e.key) && !(e.target && (e.target.tagName==="INPUT" || e.target.tagName==="TEXTAREA"))){
      const n = parseInt(e.key,10);
      if (e.ctrlKey){
        assignControlGroup(n);
        e.preventDefault();
        return;
      } else {
        recallControlGroup(n);
        e.preventDefault();
        return;
      }
    }

    // Guard mode (RA2-style): press G
    if (k==="g"){ issueGuard(); e.preventDefault(); return; }

    // IFV unload: press D
    if (k==="d"){
      for (const id of state.selection){
        const e2=getEntityById(id);
        if (e2 && e2.alive && e2.team===TEAM.PLAYER && e2.kind==="ifv"){
          tryUnloadIFV(e2);
        }
      }
      e.preventDefault();
      return;
    }

    if (e.key==="Escape" || e.key==="Esc" || e.code==="Escape" || e.keyCode===27){
      // ESC: always toggle pause/options menu
      togglePauseMenu();
      e.preventDefault();
      return;
    }
    if (e.key===" ") { if (e.repeat) { e.preventDefault(); return; } goToLastHit(); e.preventDefault(); }

    if (k==="q") { setProdCat("main"); e.preventDefault(); return; }
    if (k==="w") { setProdCat("def");  e.preventDefault(); return; }
    if (k==="e") { setProdCat("inf");  e.preventDefault(); return; }
    if (k==="r") { setProdCat("veh");  e.preventDefault(); return; }

    if (k==="k"){
      applyMouseMode(state.mouseMode==="repair" ? "normal" : "repair");
      toast(state.mouseMode==="repair" ? "수리 모드" : "수리 해제");
    }
    if (k==="l"){
      applyMouseMode(state.mouseMode==="sell" ? "normal" : "sell");
      toast(state.mouseMode==="sell" ? "매각 모드" : "매각 해제");
    }
    if (e.key === "]"){
      const speeds = [1, 2, 4];
      const cur = state.speedMul || 1;
      const idx = speeds.indexOf(cur);
      state.speedMul = speeds[(idx+1) % speeds.length];
      toast(`시간 x${state.speedMul}`);
      e.preventDefault();
      return;
    }
    if (k==="s") stopUnits();
    if (k==="x") scatterUnits();
    if (k==="a") selectSameType();
  };
  const _ou_onKeyUp = (e)=>keys.delete(e.key.toLowerCase());
  // Keyboard event wiring extracted (refactor stage2)
  if (window.OUInput && typeof window.OUInput.installKeyboard === "function"){
    window.OUInput.installKeyboard({ onKeyDown: _ou_onKeyDown, onKeyUp: _ou_onKeyUp });
  } else {
    window.addEventListener("keydown", _ou_onKeyDown);
    window.addEventListener("keyup", _ou_onKeyUp);
  }

    // [refactor] input wiring extracted -> ou_input.js (mouse)
  const _ou_onContextMenu = (e)=>e.preventDefault();
  const _ou_onMouseDown = (e)=>{
    if (!running || gameOver) return;

    if (e.button===2){
      // Right-click: pan camera (even during repair/sell modes).
      const p=getPointerCanvasPx(e);
      state.pan.on=true;
      state.pan.x0=p.x; state.pan.y0=p.y;
      const camIso=worldToIso(cam.x,cam.y);
      state.pan.camIsoX=camIso.x;
      state.pan.camIsoY=camIso.y;
      return;
    }

    if (e.button!==0) return;

    // DEBUG: when enabled, left-click any building (any team) to instantly destroy it.
    if (DEBUG_KILL_BUILDINGS){
      const p=getPointerCanvasPx(e);
      const w=screenToWorld(p.x,p.y);
      const t=pickEntityAtWorld(w.x,w.y);
      if (t && t.alive && BUILD[t.kind]){
        try{ t.hp = 0; }catch(_e){}
        destroyBuilding(t, { debug:true });
        try{ toast("DEBUG: 건물 파괴"); }catch(_e){}
        updateSelectionUI();
        return;
      }
    }



    // Repair/Sell modes: click target building directly (selection not required).
    if (state.mouseMode!=="normal"){
      const p=getPointerCanvasPx(e);
      const w=screenToWorld(p.x,p.y);
      const t=pickEntityAtWorld(w.x,w.y);
      if (t && t.alive && BUILD[t.kind] && !t.civ){
        if (state.mouseMode==="repair"){
          // Repair mode is for buildings only.
          if (!BUILD[t.kind]){ toast("건물만 수리 가능"); return; }
          if (t.team!==TEAM.PLAYER){ toast("수리 불가"); return; }
          if (t.hp >= t.hpMax-0.5){ toast("수리 불필요"); return; }
          enqueueEcon({ type:"toggleRepairById", id: t.id });
          return;
        }
        if (state.mouseMode==="sell"){
          if (t.team!==TEAM.PLAYER){ toast("매각 불가"); return; }
          enqueueEcon({ type:"sellById", id: t.id });
          return;
        }
      } else {
        toast("대상 없음");
      }
      return;
    }

    if (state.build.active){
      tryPlaceBuild();
      return;
    }

    const p=getPointerCanvasPx(e);
    state.drag.on=true;
    state.drag.moved=false;
    state.drag.x0=state.drag.x1=p.x;
    state.drag.y0=state.drag.y1=p.y;
  };
  const _ou_onMouseMove = (e)=>{
    const p=getPointerCanvasPx(e);
    state.hover.px=p.x; state.hover.py=p.y;
    const w=screenToWorld(p.x,p.y);

    state.hover.wx=w.x; state.hover.wy=w.y;

    // hover-name tooltip (0.8s dwell)
    const hEnt = pickEntityAtWorld(w.x,w.y);
    const hid = (hEnt && hEnt.alive && !hEnt.hidden && !hEnt.inTransport) ? hEnt.id : null;
    if (hid !== state.hover.entId){ state.hover.entId = hid; state.hover.t0 = state.t; }

    if (state.pan.on){
      const dx = (p.x - state.pan.x0);
      const dy = (p.y - state.pan.y0);
      const camIsoX = state.pan.camIsoX - dx;
      const camIsoY = state.pan.camIsoY - dy;
      const ww = isoToWorld(camIsoX, camIsoY);
      cam.x=ww.x; cam.y=ww.y;
      clampCamera();
      return;
    }

    if (state.drag.on){
      state.drag.x1=p.x; state.drag.y1=p.y;
      const md = Math.abs(state.drag.x1-state.drag.x0)+Math.abs(state.drag.y1-state.drag.y0);
      if (md>10) state.drag.moved=true;
    }
  };
  const _ou_onWheel = (e) => {
    if (!running || gameOver) return;

    e.preventDefault();

    const p = getPointerCanvasPx(e);
    const before = screenToWorld(p.x, p.y);

    const dir = Math.sign(e.deltaY);
    const factor = (dir > 0) ? 0.9 : 1.1;
    cam.zoom = Math.max(0.6, Math.min(1.8, cam.zoom * factor));

    // keep the world point under cursor stable
    const after = screenToWorld(p.x, p.y);
    cam.x += (before.x - after.x);
    cam.y += (before.y - after.y);
  };
  const _ou_onMouseUp = (e)=>{
    if (e.button===2){
      state.pan.on=false;
      return;
    }

    if (!running || gameOver) return;
    if (e.button!==0) return;
    // build placement has priority; also swallow click right after a placement
    if (state.build.active) return;
    if (state.t < state.suppressClickUntil){ state.drag.on=false; return; }

    if (state.mouseMode!=="normal"){ state.drag.on=false; return; }

    const additive = keys.has("shift");

    const p = getPointerCanvasPx(e);
    state.hover.px = p.x;
    state.hover.py = p.y;

    const w = screenToWorld(p.x, p.y);

    if (state.drag.on && state.drag.moved){
      const changed = selectInRect(rectFromDrag(), additive);
      if (changed) updateSelectionUI();
      state.drag.on=false;
      return;
    }

    const picked = pickEntityAtWorld(w.x,w.y);
    // Double-left-click on a production building sets it as PRIMARY spawn building.
    if (picked && picked.alive && BUILD[picked.kind] && picked.team===TEAM.PLAYER && (picked.kind==="barracks" || picked.kind==="factory")){
      const now = state.t;
      if (state.lastClick.id===picked.id && (now - state.lastClick.t) < 0.35){
        if (picked.kind==="barracks") state.primary.player.barracks = picked.id;
        if (picked.kind==="factory")  state.primary.player.factory  = picked.id;
        toast("주요건물 지정");
      }
      state.lastClick.id = picked.id;
      state.lastClick.t  = now;
    } else {
      // reset click tracker on other targets
      state.lastClick.id = picked ? picked.id : null;
      state.lastClick.t  = state.t;
    }


    // Click ripple + short-lived waypoint FX live in world space.
    pushClickWave(w.x, w.y, "rgba(255,255,255,0.85)");

    // Ctrl+LeftClick: force attack/fire (ignores team, includes friendlies, includes ground).
    // Also show a short-lived waypoint FX (like move waypoint) at the click point.
    if (state.selection.size>0 && e.ctrlKey && !e.altKey){
      if (picked) issueForceAttack(picked.id);
      else issueForceFirePos(w.x,w.y);

      // transient FX at the clicked location (do NOT follow retargets)
      const fxX = picked ? picked.x : w.x;
      const fxY = picked ? picked.y : w.y;
      for (const id of state.selection){
        const u = getEntityById(id);
        if (!u || !u.alive || u.team!==TEAM.PLAYER) continue;
        if (BUILD[u.kind]) continue;
        if (u.kind==="harvester"||u.kind==="engineer") continue;
        if ((u.range||0)<=0) continue;
        pushOrderFx(u.id, "attack", fxX, fxY, null, "rgba(255,70,70,0.95)");
      }

      state.drag.on=false;
      return;
    }

    // If harvesters are selected and you click your refinery: issue a deposit/return order (do not change selection).
    if (picked && picked.team===TEAM.PLAYER && picked.kind==="refinery" && state.selection.size>0){
      const anyHarv = [...state.selection].some(id=>{
        const e=getEntityById(id); return e && e.alive && e.team===TEAM.PLAYER && e.kind==="harvester";
      });
      if (anyHarv){
        for (const id of state.selection){
          const u=getEntityById(id);
          if (!u || !u.alive || u.team!==TEAM.PLAYER || u.kind!=="harvester") continue;
          u.order = { type:"return" };
          u.target = picked.id;
          const dock=getDockPoint(picked,u);
          setPathTo(u, dock.x, dock.y);
          showUnitPathFx(u, dock.x, dock.y, "rgba(255,255,255,0.85)");
          u.repathCd=0.25;
        }
        state.drag.on=false;
        return;
      }
    }



// IFV boarding: if infantry/engineer/sniper are selected and you click a friendly IFV,
// issue a move+board order and DO NOT change selection to the IFV.
if (picked && picked.alive && picked.team===TEAM.PLAYER && picked.kind==="ifv" && state.selection.size>0){
  let any=false;
  for (const id of state.selection){
    const u=getEntityById(id);
    if (!u || !u.alive || u.team!==TEAM.PLAYER) continue;
    if (u.kind!=="infantry" && u.kind!=="engineer" && u.kind!=="sniper") continue;
    if (u.inTransport) continue;
    u.wantsBoard = picked.id;
    u.order = { type:"move", x:picked.x, y:picked.y, tx:null, ty:null };
    setPathTo(u, picked.x, picked.y);
    showUnitPathFx(u, picked.x, picked.y, "rgba(255,255,255,0.85)");
    u.repathCd=0.20;
    any=true;
  }
  if (any){
    state.drag.on=false;
    return;
  }
}

// Engineer quick-repair: if an engineer is selected and you click a damaged friendly building, enter/repair it (do not change selection).
if (picked && picked.alive && BUILD[picked.kind] && !picked.civ && picked.team===TEAM.PLAYER && picked.hp < picked.hpMax-0.5 && state.selection.size>0){
  const hasEng = [...state.selection].some(id=>{
    const e=getEntityById(id); return e && e.alive && e.team===TEAM.PLAYER && e.kind==="engineer";
  });
  if (hasEng){
    issueEngineerRepair(picked.id);
    state.drag.on=false;
    return;
  }
}

// Engineer IFV: left-click your damaged vehicle to repair (do not change selection).
if (picked && picked.alive && picked.team===TEAM.PLAYER && !BUILD[picked.kind] && (UNIT[picked.kind]?.cls==="veh") && picked.hp < picked.hpMax-0.5 && state.selection.size>0){
  const hasEngIFV = [...state.selection].some(id=>{
    const e=getEntityById(id); return e && e.alive && e.team===TEAM.PLAYER && e.kind==="ifv" && e.passKind==="engineer";
  });
  if (hasEngIFV){
    issueIFVRepair(picked.id);
    state.drag.on=false;
    return;
  }
}

    if (picked && picked.team===TEAM.PLAYER){
      if (!additive) state.selection.clear();
      state.selection.add(picked.id);

      if (!BUILD[picked.kind]){
        state.lastSingleId = picked.id;
        state.lastSingleKind = picked.kind;
      }
      state.drag.on=false;
      updateSelectionUI();
      return;
    }

    if (picked && picked.team===TEAM.ENEMY){
      if (state.selection.size>0){
        const hasEng = [...state.selection].some(id=>{
          const e=getEntityById(id); return e && e.alive && e.team===TEAM.PLAYER && e.kind==="engineer";
        });
        if (hasEng && BUILD[picked.kind]) issueCapture(picked.id);
        else issueAttack(picked.id);
      }
      state.drag.on=false;
      return;
    }

    // Boarding: click a friendly IFV while having infantry selected.
    if (picked && picked.alive && picked.team===TEAM.PLAYER && picked.kind==="ifv" && state.selection.size>0){
      if (tryBoardIFV(picked)) { state.drag.on=false; return; }
    }

    const tx=tileOfX(w.x), ty=tileOfY(w.y);
    const sp = snapWorldToTileCenter(w.x, w.y);

    // Left-click on ground while a production building is selected: set rally point.
    if (state.selection.size===1){
      const id=[...state.selection][0];
      const b=getEntityById(id);
      if (b && b.alive && BUILD[b.kind] && !b.civ && b.team===TEAM.PLAYER &&
          (b.kind==="barracks" || b.kind==="factory" || b.kind==="hq")){
        b.rally = { x:sp.x, y:sp.y };
        state.drag.on=false;
        return;
      }
    }

if (state.selection.size>0 && inMap(tx,ty) && ore[idx(tx,ty)]>0){
      issueHarvest(tx,ty);
      issueMoveCombatOnly(w.x,w.y);
      state.drag.on=false;
      return;
    }

    if (state.selection.size>0) {
      if (e.ctrlKey && e.altKey) issueAttackMove(sp.x,sp.y);
      else issueMoveAll(sp.x,sp.y);
    }
    else { if (!additive) state.selection.clear(); updateSelectionUI(); }
    state.drag.on=false;
  };

  if (window.OUInput && typeof window.OUInput.installMouse === "function"){
    window.OUInput.installMouse({
      canvas,
      onContextMenu: _ou_onContextMenu,
      onMouseDown: _ou_onMouseDown,
      onMouseMove: _ou_onMouseMove,
      onMouseUp: _ou_onMouseUp,
      onWheel: _ou_onWheel,
      wheelOptions: { passive:false }
    });
  } else {
    // fallback: old wiring
    canvas.addEventListener("contextmenu", _ou_onContextMenu);
    canvas.addEventListener("mousedown", _ou_onMouseDown);
    canvas.addEventListener("mousemove", _ou_onMouseMove);
    canvas.addEventListener("wheel", _ou_onWheel, { passive:false });
    canvas.addEventListener("mouseup", _ou_onMouseUp);
  }


  function rectFromDrag(){
    const x0=Math.min(state.drag.x0,state.drag.x1);
    const y0=Math.min(state.drag.y0,state.drag.y1);
    const x1=Math.max(state.drag.x0,state.drag.x1);
    const y1=Math.max(state.drag.y0,state.drag.y1);
    return {x0,y0,x1,y1};
  }

  function selectInRect(r, additive){
    const beforeSize = state.selection.size;
    const pickedIds = [];

    const circleHitsRect = (cx,cy,cr, rx,ry,rw,rh)=>{
      const nx = Math.max(rx, Math.min(cx, rx+rw));
      const ny = Math.max(ry, Math.min(cy, ry+rh));
      const dx = cx-nx, dy = cy-ny;
      return (dx*dx+dy*dy) <= cr*cr;
    };

    for (const u of units){
      if (!u.alive || u.team!==TEAM.PLAYER) continue;
      const p = worldToScreen(u.x,u.y);
      const rr = (u.r || 10) * cam.zoom;
      if (circleHitsRect(p.x,p.y, rr, r.x0, r.y0, (r.x1-r.x0), (r.y1-r.y0))) pickedIds.push(u.id);
    }

    if (pickedIds.length===0) return false;
    if (!additive) state.selection.clear();
    for (const id of pickedIds) state.selection.add(id);

    const first = getEntityById(pickedIds[0]);
    if (first && !BUILD[first.kind]){
      state.lastSingleId = first.id;
      state.lastSingleKind = first.kind;
    }
    return state.selection.size !== beforeSize;
  }

  function getAllPlayerUnitsOfKind(kind){
    // IMPORTANT: exclude units inside transports (inTransport != null)
    return units.filter(u=>u.alive && u.team===TEAM.PLAYER && u.kind===kind && u.inTransport==null).map(u=>u.id);
  }
  function isSelectionExactly(ids){
    if (state.selection.size!==ids.length) return false;
    for (const id of ids) if (!state.selection.has(id)) return false;
    return true;
  }

  function selectSameType(){
    // A key: select all player units of the same kind as the currently selected unit.
    // If nothing is selected, show a message.
    if (!state.selection || state.selection.size===0){
      toast("선택한 유닛이 없음");
      return;
    }

    // v139: If any selected entity is an IFV (transport), prioritize selecting IFVs (not passengers).
    for (const id of state.selection){
      const e=getEntityById(id);
      if (e && e.alive && e.team===TEAM.PLAYER && e.kind==="ifv"){ 
        const ids = getAllPlayerUnitsOfKind("ifv");
        if (ids && ids.length){
          state.selection.clear();
          for (const id2 of ids) state.selection.add(id2);
          state.lastSingleKind = "ifv";
          state.lastSingleId = ids[0];
          updateSelectionUI();
        }
        return;
      }
    }

    // Choose the reference kind:
    // - Prefer the lastSingleKind if it is still part of the selection.
    // - Otherwise use the first selected unit's kind.
    let refKind = null;
    if (state.lastSingleKind){
      for (const id of state.selection){
        const e=getEntityById(id);
        if (e && e.alive && e.inTransport==null && !BUILD[e.kind] && e.team===TEAM.PLAYER && e.kind===state.lastSingleKind){
          refKind = state.lastSingleKind;
          break;
        }
      }
    }
    if (!refKind){
      for (const id of state.selection){
        const e=getEntityById(id);
        if (e && e.alive && e.inTransport==null && !BUILD[e.kind] && e.team===TEAM.PLAYER){
          refKind = e.kind;
          break;
        }
      }
    }
    if (!refKind){
      toast("선택한 유닛이 없음");
      return;
    }

    const ids = getAllPlayerUnitsOfKind(refKind);
    if (!ids || ids.length===0){
      toast("대상 없음");
      return;
    }

    state.selection.clear();
    for (const id of ids) state.selection.add(id);

    // Keep lastSingleKind aligned with the type selection.
    state.lastSingleKind = refKind;
    state.lastSingleId = ids[0];

    updateSelectionUI();
  }

  
  function _applySetBuild(kind){
    if (!kind) return;

    // Decide lane: defenses go to def lane, everything else to main lane.
    const laneKey = (kind === "turret") ? "def" : "main";
    const lane = state.buildLane && state.buildLane[laneKey];
    if (!lane) return;


    // If this exact kind is paused at the head of this lane, left-click resumes.
    if (lane.queue && lane.queue.kind === kind && lane.queue.paused){
      lane.queue.paused = false;
      toast("재개");
      return;
    }

    // If we are currently in placement mode for another building, don't allow switching.
    if (state.build.active && state.build.kind && state.build.kind !== kind){
      toast("명령을 따를 수 없습니다. 건설 중입니다");
      return;
    }

    // If this lane is already constructing something else (or has READY pending), block switching.
    if ((lane.queue && lane.queue.kind && lane.queue.kind !== kind) ||
        (lane.ready && lane.ready !== kind)){
      toast("명령을 따를 수 없습니다. 건설 중입니다");
      return;
    }

    // If already placing this exact building, toggle placement off.
    if (state.build.active && state.build.kind === kind){
      state.build.active = false;
      state.build.kind = null;
      state.build.lane = null;
      return;
    }

    // If this lane has a READY of the same kind, enter placement mode.
    if (lane.ready === kind){
      state.build.active = true;
      state.build.kind = kind;
      state.build.lane = laneKey;
      // Prevent accidental immediate placement from the click that opened placement.
      state.suppressClickUntil = state.t + 0.10;
      return;
    }

    // Otherwise, reserve (FIFO). If the lane is currently READY with some other kind,
    // we still allow reserving new builds; placement remains user-controlled.
    if (!lane.fifo) lane.fifo = [];
    lane.fifo.push(kind);
  }

  function setBuild(kind){
    enqueueEcon({ type:"setBuild", kind });
  }

  function _applyLaneRClick(laneKey, kind){
    const lane = state.buildLane ? state.buildLane[laneKey] : null;
    if (!lane) return;

    // If build is READY (waiting for placement), allow cancel + refund.
    if (lane.ready === kind){
      const refund = COST[kind] || 0;
      if (refund > 0) state.player.money += refund;
      // snap to integer to avoid sub-1 drift
      state.player.money = Math.round(state.player.money||0);
      lane.ready = null;
      // If player was in placement mode for this item, exit it.
      if (state.build && state.build.active && state.build.kind === kind && state.build.lane === laneKey){
        state.build.active = false;
        state.build.kind = null;
        state.build.lane = null;
      }
      toast("취소 + 환불");
      return;
    }

    if (!lane.queue || lane.queue.kind !== kind){
      // Cancel a reserved (FIFO) build of this kind if present.
      if (lane.fifo && lane.fifo.length){
        for (let i=lane.fifo.length-1; i>=0; i--){
          if (lane.fifo[i] === kind){
            lane.fifo.splice(i,1);
            toast("예약 취소");
            return;
          }
        }
      }
      return;
    }
    if (!lane.queue.paused){
      lane.queue.paused = true;
      toast("대기");
    } else {
      // cancel + refund paid so far
      const paid = lane.queue.paid || 0;
      state.player.money += paid;
      // snap to integer to avoid sub-1 drift
      state.player.money = Math.round(state.player.money||0);
      lane.queue = null;
      // Also drop any pending reservations of the same kind to avoid "ghost" rebuild.
      if (lane.fifo && lane.fifo.length){
        lane.fifo = lane.fifo.filter(k=>k!==kind);
      }
      toast("취소 + 환불");
    }
  }

  // Right-click on the currently building item: 1st = pause(대기, no spending), 2nd = cancel + refund spent cost.

  function _applyUnitRClick(kind){
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
  }

  // Unit production right-click: 1st = pause(대기), 2nd (while paused) = cancel + refund spent.

  function applyMouseMode(mode){
    state.mouseMode = mode;
    if (__ou_ui && typeof __ou_ui.applyMouseMode === "function"){
      __ou_ui.applyMouseMode({ state, mode });
    }
  }

  if (__ou_ui && typeof __ou_ui.bindGameButtons === "function"){
    __ou_ui.bindGameButtons({
      onSetBuild: (kind)=>setBuild(kind),
      onRadarBuild: ()=>{ if(!hasBuilding(TEAM.PLAYER,"refinery")){ toast("레이더는 정제소가 필요함"); return; } setBuild("radar"); },
      onLaneRClick: (laneKey, kind)=>enqueueEcon({ type:"laneRClick", laneKey, kind }),
      onQueueUnit: (kind)=>enqueueEcon({ type:"queueUnit", kind }),
      onUnitRClick: (kind)=>enqueueEcon({ type:"unitRClick", kind }),
      onCancelBuild: ()=>enqueueEcon({ type:"cancelBuild" }),
      onGoToHQ: ()=>goToHQ(),
      onSellSelected: ()=>enqueueEcon({ type:"sellSelected" }),
      onCancelSel: ()=>{ state.selection.clear(); updateSelectionUI(); },
      onToggleRepair: ()=>enqueueEcon({ type:"toggleRepair" }),
      onStopUnits: ()=>stopUnits(),
      onScatterUnits: ()=>scatterUnits(),
      onToggleRepairMode: ()=>{
        applyMouseMode(state.mouseMode==="repair" ? "normal" : "repair");
        toast(state.mouseMode==="repair" ? "수리 모드" : "수리 해제");
      },
      onToggleSellMode: ()=>{
        applyMouseMode(state.mouseMode==="sell" ? "normal" : "sell");
        toast(state.mouseMode==="sell" ? "매각 모드" : "매각 해제");
      },
      onSelectAllKind: ()=>selectAllUnitsScreenThenMap()
    });
  }


  // Production category tabs
  let prodCat = "main";
  function setProdCat(cat){
    prodCat = cat;
    if (__ou_ui && typeof __ou_ui.updateProdTabsUI === "function"){
      __ou_ui.updateProdTabsUI({ prodCat });
    }
  }
  if (__ou_ui && typeof __ou_ui.bindProdTabClicks === "function"){
    __ou_ui.bindProdTabClicks({ onSelect: setProdCat });
  }
  setProdCat("main");

  function toggleRepair(){
    for (const id of state.selection){
      const b=getEntityById(id);
      if (b && b.alive && b.team===TEAM.PLAYER && BUILD[b.kind] && !b.civ){
        b.repairOn = !b.repairOn;
      }
    }
    updateSelectionUI();
  }

  function cancelBuildPlacement(){
    if (!state.build || !state.build.active) return;
    state.build.active = false;
    state.build.kind = null;
    state.build.lane = null;
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

  function processEconActions(){
    const q = state.econActions;
    if (!q || !q.length) return;
    while (q.length){
      const a = q.shift();
      if (!a || !a.type) continue;
      switch (a.type){
        case "setBuild":
          _applySetBuild(a.kind);
          break;
        case "laneRClick":
          _applyLaneRClick(a.laneKey, a.kind);
          break;
        case "unitRClick":
          _applyUnitRClick(a.kind);
          break;
        case "queueUnit":
          queueUnit(a.kind);
          break;
        case "cancelBuild":
          cancelBuildPlacement();
          break;
        case "toggleRepair":
          toggleRepair();
          break;
        case "toggleRepairById": {
          const b = getEntityById(a.id);
          if (b && b.alive && b.team===TEAM.PLAYER && BUILD[b.kind] && !b.civ){
            b.repairOn = !b.repairOn;
            toast(b.repairOn ? "수리 시작" : "수리 취소");
            updateSelectionUI();
          }
          break;
        }
        case "sellSelected":
          sellSelectedBuildings();
          break;
        case "sellById": {
          const b = getEntityById(a.id);
          if (b && b.alive && b.team===TEAM.PLAYER && BUILD[b.kind] && !b.civ){
            sellBuilding(b);
            toast("매각");
            updateSelectionUI();
          }
          break;
        }
        case "sellByIdAny": {
          const b = getEntityById(a.id);
          if (b && b.alive && BUILD[b.kind] && !b.civ){
            sellBuilding(b);
          }
          break;
        }
      }
    }
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

function refreshPrimaryBuildingBadgesUI(){
  if (!__ou_ui || !__ou_ui.refreshPrimaryBuildingBadgesUI) return;
  __ou_ui.refreshPrimaryBuildingBadgesUI({ state });
}

function tickSidebarBuild(dt){
    // Economy: build lanes tick moved to ou_economy (money drain + progress + ready state).
    // Must run even when OUUI is active, otherwise build buttons appear to do nothing.
    if (__ou_econ && __ou_econ.tickBuildLanes) __ou_econ.tickBuildLanes(dt);

    if (__ou_ui && typeof __ou_ui.updateBuildModeUI === "function"){
      __ou_ui.updateBuildModeUI({ state });
    }
  }

function tickEconomyPre(dt){
    // Economy actions that must run at the start of a tick (requests + queues + build lanes).
    processEconActions();
    feedProducers();
    tickSidebarBuild(dt);
    if (__ou_ai && typeof __ou_ai.tickEnemySidebarBuild === "function") {
      __ou_ai.tickEnemySidebarBuild(dt);
    }
  }

function tickEconomyPost(dt){
    // Economy actions that run after UI/vision updates (production + repairs + passive ore).
    tickProduction(dt);
    const m2 = (DEBUG_MONEY && state && state.player) ? (state.player.money || 0) : null;
    tickRepairs(dt);
    const m3 = (DEBUG_MONEY && state && state.player) ? (state.player.money || 0) : null;
    tickCivOreGen(dt);
    return { m2, m3 };
  }

function updatePowerBar() {
  if (!__ou_ui || !__ou_ui.updatePowerBar) return;
  __ou_ui.updatePowerBar({ state, clamp });
}

function pushClickWave(wx, wy, color){
  state.fx.clicks.push({ x:wx, y:wy, color, t0: state.t, life: 0.4 });
}

function showUnitPathFx(u){ /* disabled */ }

  function updateSelectionUI() {
  if (!__ou_ui || !__ou_ui.updateSelectionUI) return;
  __ou_ui.updateSelectionUI({
    state, buildings, TEAM, COST, prodTotal, QCAP, hasRadarAlive, getEntityById, BUILD, NAME_KO
  });
}



function draw(){
    if (window.OURender && typeof window.OURender.draw === "function"){
      window.OURender.draw({
        canvas, ctx, cam, state, TEAM, MAP_W, MAP_H, TILE, ISO_X, ISO_Y,
        terrain, ore, explored, visible, BUILD, DEFENSE, NAME_KO,
        units, buildings, bullets, traces, impacts, fires, healMarks, flashes, casings,
        gameOver, POWER,
        updateMoney: (__ou_ui && typeof __ou_ui.updateMoney === "function") ? __ou_ui.updateMoney : null,
        updateProdBadges,
        inMap, idx, tileToWorldCenter, worldToScreen,
        getEntityById, repairWrenches,
        snapHoverToTileOrigin, buildingWorldFromTileOrigin, inBuildRadius, isBlockedFootprint, footprintBlockedMask,
        rectFromDrag, refreshPrimaryBuildingBadgesUI,
        exp1Fxs,
        EXP1_PNG, EXP1_JSON,
        CON_YARD_PNG,
        smokeWaves, smokePuffs, dustPuffs, dmgSmokePuffs, bloodStains, bloodPuffs,
        explosions,
        INF_DIE_PNG,
        SNIP_DIE_PNG,
        INF_SPRITE_SCALE,
        INF_IDLE_PNG,
        INF_ATK_PNG,
        INF_MOV_PNG,
        INF_MOV_NE_PNG,
        INF_MOV_N_PNG,
        INF_MOV_NW_PNG,
        INF_MOV_W_PNG,
        INF_MOV_SW_PNG,
        INF_MOV_S_PNG,
        INF_MOV_SE_PNG,
        SNIP_IDLE_PNG,
        SNIP_MOV_PNG,
        SNIP_MOV_NE_PNG,
        SNIP_MOV_N_PNG,
        SNIP_MOV_NW_PNG,
        SNIP_MOV_W_PNG,
        SNIP_MOV_SW_PNG,
        SNIP_MOV_S_PNG,
        SNIP_MOV_SE_PNG,
        REPAIR_WRENCH_PNG,
        TANK_DIR_TO_IDLE_IDX: _dirToIdleIdx,
        MUZZLE_DIR_TO_IDLE_IDX: _muzzleDirToIdleIdx,
        getUnitSpec: (kind)=> (window.G && G.Units && typeof G.Units.getSpec==="function") ? G.Units.getSpec(kind) : null,
        worldVecToDir8,
        isUnderPower, clamp,
        infDeathFxs, snipDeathFxs
      });
    }
  }

  // drawMini moved to render.js (OURender.drawMini)

  function setButtonText() {
    if (__ou_ui && typeof __ou_ui.setSellLabel === "function"){
      __ou_ui.setSellLabel({ text: "매각(D)" });
    }
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
      const spot = findFootprintSpotNear(kind, nearTx, nearTy, 420);
      if (!spot) return null;
      const b = addBuilding(team, kind, spot.tx, spot.ty);
      // Start-of-game buildings are already built: skip barracks build animation.
      if (b && kind==="barracks"){
        b._barrackNoBuildAnim = true;
        b._barrackBuildT0 = null;
        b._barrackBuildDone = true;
      }
      return b;
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
  // No bonus units at start.
}


if (__ou_ui && typeof __ou_ui.bindPregameStart === "function"){
  __ou_ui.bindPregameStart({ onStart: async (payload) => {
    if (payload && payload.playerColor) state.colors.player = payload.playerColor;
    if (payload && payload.enemyColor) state.colors.enemy  = payload.enemyColor;

    // Apply chosen colors to team palette (for magenta->team recolor) and clear caches.
    try{
      const prgb = (typeof OURender !== "undefined" && OURender.hexToRgb)
        ? (OURender.hexToRgb(state.colors.player) || [80,180,255])
        : [80,180,255];
      const ergb = (typeof OURender !== "undefined" && OURender.hexToRgb)
        ? (OURender.hexToRgb(state.colors.enemy) || [255,60,60])
        : [255,60,60];
      if (window.OURender && typeof OURender.setTeamAccent === "function"){
        OURender.setTeamAccent({ player: prgb, enemy: ergb, neutral: [170,170,170] });
      }
      if (window.OURender && typeof OURender.clearTeamSpriteCache === "function"){
        OURender.clearTeamSpriteCache();
      }

      if (window.OURender && typeof OURender.clearInfTeamSheetCache === "function"){
        OURender.clearInfTeamSheetCache();
      }
    }catch(_e){}


    fogEnabled = !(payload && payload.fogOff);

    // Debug: player-only instant production/build completion (1s)
    state.debug = state.debug || {};
    state.debug.fastProd = !!(payload && payload.fastProd);

    START_MONEY = startMoney;
    state.player.money = START_MONEY;
    state.enemy.money  = START_MONEY;


    // Preload building atlases before starting (avoid long placeholder-box phase)
    try {
      if (window.PO && PO.buildings && typeof PO.buildings.preload === "function") {
        if (__ou_ui && typeof __ou_ui.setPregameLoading === "function"){
          __ou_ui.setPregameLoading({ loading: true });
        }
        await PO.buildings.preload();
        if (__ou_ui && typeof __ou_ui.setPregameLoading === "function"){
          __ou_ui.setPregameLoading({ loading: false });
        }
      }
    } catch (e) {
      console.error("[preload] building assets failed", e);
      alert("Asset preload failed. Check DevTools Console/Network.\n" + (e && e.message ? e.message : e));
      if (__ou_ui && typeof __ou_ui.setPregameLoading === "function"){
        __ou_ui.setPregameLoading({ loading: false, forceEnable: true });
      }
      return;
    }

    placeStart(spawnChoice);
    spawnStartingUnits();
    if (__ou_ui && typeof __ou_ui.hidePregame === "function"){
      __ou_ui.hidePregame({});
    }
    // Start BGM on user gesture (autoplay-safe)
    BGM.userStart();
    running = true;
  }});
}

  let last=performance.now();
  let fpsAcc=0, fpsN=0, fpsT=0;

  

  // =========================
  // Pause menu + BGM system
  // =========================
  let pauseMenuOpen = false;
  let pauseStartMs = null; // real-time ms when pause menu opened (for freezing battle timer)

  function setGameBrightness(v){
    if (__ou_ui && typeof __ou_ui.setGameBrightness === "function"){
      return __ou_ui.setGameBrightness(v);
    }
    return v;
  }
  // restore brightness (UI owns DOM/localStorage)
  try {
    if (__ou_ui && typeof __ou_ui.restoreGameBrightness === "function"){
      __ou_ui.restoreGameBrightness();
    }
  } catch(_){}

  const BGM = (window.OUBGM && typeof window.OUBGM.create === "function")
    ? window.OUBGM.create({ tracks: ASSET.music.all })
    : null;
  if (!BGM) console.warn("[BGM] missing: include js/bgm.js before game.js");

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

    if (__ou_ui && typeof __ou_ui.setPauseMenuVisible === "function"){
      const getBright = ()=> (__ou_ui && typeof __ou_ui.getGameBrightness === "function")
        ? __ou_ui.getGameBrightness()
        : 1;
      __ou_ui.setPauseMenuVisible({ open: pauseMenuOpen, bgm: BGM, getBrightness: getBright });
      if (pauseMenuOpen && typeof __ou_ui.wirePauseMenuUI === "function"){
        __ou_ui.wirePauseMenuUI({
          bgm: BGM,
          onVol: (v)=> BGM.setMasterVolume(v),
          onBright: (v)=> setGameBrightness(v),
          onResume: ()=> togglePauseMenu(false),
          onExit: ()=> { BGM.stopAll?.(); location.reload(); },
          onPrev: ()=> BGM.prev(),
          onNext: ()=> BGM.next(),
          onPlay: ()=> (BGM.togglePlay ? BGM.togglePlay() : (BGM.toggle ? BGM.toggle() : null)),
          onShuffle: ()=> (BGM.toggleShuffle ? BGM.toggleShuffle() : null),
          onRepeat: ()=> (BGM.toggleRepeat ? BGM.toggleRepeat() : null)
        });
      }
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

  // Pause menu UI wiring is handled by ou_ui.js

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
      "setPathTo","findPath","issueIFVRepair","boardUnitIntoIFV","unboardIFV","resolveUnitOverlaps"
    ];
    const missing = must.filter(n=> typeof window[n] !== "function");
    if (missing.length){
      console.error("SanityCheck: missing functions:", missing);
      toast("???? ??: " + missing.join(", "));
    }
  }


  function tick(now){
    fitCanvas();
    fitMini();

    const dt = Math.min(0.033, (now-last)/1000);
    last=now;

    if (running && !gameOver && !pauseMenuOpen){
      const speedMul = state.speedMul || 1;
      const simDt = dt * speedMul;
      state.t += simDt;

      // Finalize barracks selling AFTER reverse-build animation completes
      let _needPower=false, _needElim=false;
      for (const b of buildings){
        if (!b || !b.alive) continue;
        if (b.kind==="barracks" && b._barrackSelling && b._barrackSellFinalizeAt!=null && state.t >= b._barrackSellFinalizeAt){
          b.alive = false;
          state.selection.delete(b.id);
          setBuildingOcc(b, 0);
          _needPower = true;
          _needElim  = true;
        }
        if (b.kind==="power" && b._powerSelling && b._powerSellFinalizeAt!=null && state.t >= b._powerSellFinalizeAt){
          b.alive = false;
          state.selection.delete(b.id);
          setBuildingOcc(b, 0);
          _needPower = true;
          _needElim  = true;
        }
      }
      if (_needPower) recomputePower();
      if (_needElim)  checkElimination();

      updateCamShake(simDt);
      
      updateSmoke(simDt);
      updateBlood(simDt);


      const sp = cam.speed*dt;
      if (keys.has("arrowleft")) cam.x -= sp;
      if (keys.has("arrowright")) cam.x += sp;
      if (keys.has("arrowup")) cam.y -= sp;
      if (keys.has("arrowdown")) cam.y += sp;
      clampCamera();

      let _m0 = 0, _m1 = 0, _m2 = 0, _m3 = 0;
      if (DEBUG_MONEY && state && state.player) _m0 = state.player.money || 0;

      tickEconomyPre(simDt);

      if (DEBUG_MONEY && state && state.player) _m1 = state.player.money || 0;

      // UI: sidebar buttons + overlays are handled in ou_ui.js
      if (__ou_ui && typeof __ou_ui.updateSidebarButtons === "function") {
        try {
          __ou_ui.updateSidebarButtons({
            state,
            buildings: buildings,
            TEAM,
            prodCat,
            setProdCat
          });
        } catch (_e) {}
      }


      updateVision();
      const _eco = tickEconomyPost(simDt);
      if (DEBUG_MONEY && state && state.player){
        _m2 = (_eco && _eco.m2 != null) ? _eco.m2 : (state.player.money || 0);
        _m3 = (_eco && _eco.m3 != null) ? _eco.m3 : (state.player.money || 0);
      }

      if (DEBUG_MONEY && state && state.player){
        const dBuild = _m1 - _m0;
        const dProd  = _m2 - _m1;
        const dRep   = _m3 - _m2;
        if (dBuild < 0 || dProd < 0 || dRep < 0){
          console.log(`[money] build:${dBuild.toFixed(2)} prod:${dProd.toFixed(2)} repair:${dRep.toFixed(2)} t=${state.t.toFixed(2)} money=${(state.player.money||0).toFixed(2)}`);
        }
      }
      if (__ou_sim && typeof __ou_sim.tickSim === "function"){
        __ou_sim.tickSim(simDt);
      } else {
        // sim.js missing: avoid hard crash
        if (state && !state._simMissingWarned){
          state._simMissingWarned = true;
          console.warn("[ou_sim] missing: sim.js not loaded");
        }
      }

      for (let i=units.length-1;i>=0;i--) if (!units[i].alive) units.splice(i,1);
      for (let i=buildings.length-1;i>=0;i--) if (!buildings[i].alive) buildings.splice(i,1);

      if (DEV_VALIDATE){
        state._valAcc = (state._valAcc || 0) + dt;
        if (state._valAcc >= 0.5){
          state._valAcc = 0;
          validateWorld();
        }
      }

      if (__ou_ai && typeof __ou_ai.tick === "function") {
        __ou_ai.tick();
      }
      recomputePower();
      updatePowerBar();
      updateSelectionUI();
      sanityCheck();
  setButtonText();

    // bind price tooltips (one-time)
  if (!state.__ui_bound_priceTips){
    state.__ui_bound_priceTips = true;
    if (__ou_ui && typeof __ou_ui.bindPriceTipsOnce === "function"){
      __ou_ui.bindPriceTipsOnce({ COST });
    }
  }

      if (window.OURender && typeof window.OURender.drawMini === "function"){
        window.OURender.drawMini({
          fitMini,
          mmCanvas,
          mmCtx,
          TEAM,
          WORLD_W,
          WORLD_H,
          MAP_W,
          MAP_H,
          TILE,
          explored,
          visible,
          ore,
          units,
          buildings,
          state,
          idx,
          inMap,
          tileOfX,
          tileOfY,
          hasRadarAlive,
          isUnderPower
        });
      }
    }

    draw();

    fpsAcc += 1/dt; fpsN++; fpsT += dt;
    if (fpsT>=0.5){
      if (__ou_ui && typeof __ou_ui.updateFps === "function"){
        __ou_ui.updateFps({ fps: Math.round(fpsAcc/fpsN) });
      }
      fpsAcc=0; fpsN=0; fpsT=0;
    }

    // BGM monitor (single playlist)
    BGM.monitor(dt);
    requestAnimationFrame(tick);
  }

  setButtonText();
  requestAnimationFrame(tick);

// Expose a few helpers to window for debugging / sanityCheck

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

























