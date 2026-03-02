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
  const isCallable = (obj, name) => obj && typeof obj[name] === "function";


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
    if (isCallable(__ou_ui, "showFatalError")) __ou_ui.showFatalError(e);
  });

  function toast(text, dur=1.0){
    if (isCallable(__ou_ui, "toast")){
      __ou_ui.toast(text, dur);
    }
  }

  // Sidebar button UI is managed by ou_ui.js. Keep game.js free of DOM mutations here.

  let spawnChoice = "left";
  let mapChoice = "forest_ground";
  let startMoney = 10000;
  if (isCallable(__ou_ui, "initPregameUI")){
    __ou_ui.initPregameUI({
      onSpawnChange: (v)=>{ spawnChoice = v || "left"; },
      onMoneyChange: (v)=>{ startMoney = (typeof v==="number" && !Number.isNaN(v)) ? v : 10000; },
      onMapChange: (v)=>{ mapChoice = v || "forest_ground"; }
    });
  }

  // shared start money used by reset/start
  let START_MONEY = 10000;

  const __canvasHelpers = (window.OUUI && typeof window.OUUI.createCanvasHelpers === "function")
    ? window.OUUI.createCanvasHelpers(canvas, mmCanvas)
    : null;
  const fitCanvas = __canvasHelpers ? __canvasHelpers.fitCanvas : () => {};
  const fitMini = __canvasHelpers ? __canvasHelpers.fitMini : () => {};
  const getPointerCanvasPx = __canvasHelpers ? __canvasHelpers.getPointerCanvasPx : (e) => ({ x: 0, y: 0 });
  if (__canvasHelpers) {
    window.addEventListener("resize", fitCanvas);
    fitCanvas();
    window.addEventListener("resize", fitMini);
    fitMini();
  }

  const TILE = 110;
  if (window.FX && typeof window.FX.setTile === "function") window.FX.setTile(TILE);
  const GAME_SPEED = 1.30;
  const BUILD_PROD_MULT = 2.60; // 2x building & unit production speed
  // Enemy AI cheats (difficulty)
  const ENEMY_PROD_SPEED = 1.65;
  const ENEMY_ECON_MULT  = 1.50;
  const __mapParams = new URLSearchParams(location.search);
  // forest_ground.tmj 기준 40x40 (URL에 mapw/maph 없으면 TMJ 크기 사용)
  const MAP_W = Math.max(4, parseInt(__mapParams.get("mapw")||"40",10));
  const MAP_H = Math.max(4, parseInt(__mapParams.get("maph")||"40",10));
  const WORLD_W = MAP_W * TILE;
  const WORLD_H = MAP_H * TILE;

  const ISO_X = TILE / 2;
  const ISO_Y = TILE / 4;

  const pointInPoly = (window.OU && window.OU.pointInPoly) ? window.OU.pointInPoly : (x,y,poly)=>{ let inside=false; for(let i=0,j=poly.length-1;i<poly.length;j=i++){ const xi=poly[i].x,yi=poly[i].y,xj=poly[j].x,yj=poly[j].y; if(((yi>y)!==(yj>y))&&(x<(xj-xi)*(y-yi)/((yj-yi)||1e-9)+xi)) inside=!inside; } return inside; };
  const worldVecToDir8 = (window.OU && window.OU.createWorldVecToDir8) ? window.OU.createWorldVecToDir8(ISO_X, ISO_Y, TILE) : (dx,dy)=>6;

  const __tileHelpers = (window.OU && typeof window.OU.createTileHelpers === "function")
    ? window.OU.createTileHelpers(TILE, MAP_W, MAP_H)
    : null;
  const tileToWorldCenter = __tileHelpers ? __tileHelpers.tileToWorldCenter : (tx,ty)=>({ x:(tx+0.5)*TILE, y:(ty+0.5)*TILE });
  const tileToWorldOrigin = __tileHelpers ? __tileHelpers.tileToWorldOrigin : (tx,ty)=>({ x:tx*TILE, y:ty*TILE });
  const snapWorldToTileCenter = __tileHelpers ? __tileHelpers.snapWorldToTileCenter : (wx,wy)=>{ const tx=Math.max(0,Math.min(MAP_W-1,Math.floor(wx/TILE))); const ty=Math.max(0,Math.min(MAP_H-1,Math.floor(wy/TILE))); return { tx, ty, x:(tx+0.5)*TILE, y:(ty+0.5)*TILE }; };

  const TEAM = { PLAYER: 0, ENEMY: 1, NEUTRAL: 2 };

  

  
// Debug option: disable fog-of-war rendering & logic (show whole map)
  let fogEnabled = true;
  const clamp = (v,a,b)=>Math.max(a,Math.min(b,v));
  const dist2 = (ax,ay,bx,by)=>{ const dx=ax-bx, dy=ay-by; return dx*dx+dy*dy; };
  const rnd = (a,b)=> a + Math.random()*(b-a);
  const dist2PointToRect = (window.OU && window.OU.dist2PointToRect) || function(px,py,rx,ry,rw,rh){ const hx=rw*0.5, hy=rh*0.5; const dx=Math.max(Math.abs(px-rx)-hx,0); const dy=Math.max(Math.abs(py-ry)-hy,0); return dx*dx+dy*dy; };

  const __ou_cam = (window.OUCamera && typeof window.OUCamera.create === "function")
    ? window.OUCamera.create({ TILE, MAP_W, MAP_H, canvas, clamp })
    : null;

  const cam = __ou_cam ? __ou_cam.cam : { x: WORLD_W*0.5, y: WORLD_H*0.5, speed: 900, zoom: 1.0 };
  const camShake = __ou_cam ? __ou_cam.camShake : { t:0, dur:0, mag:0, freq:0, ox:0, oy:0, active:false };
  const worldToIso = __ou_cam ? __ou_cam.worldToIso : (wx,wy)=>({ x:(wx-wy)*0.5, y:(wx+wy)*0.25 });
  const isoToWorld = __ou_cam ? __ou_cam.isoToWorld : (ix,iy)=>({ x:ix+iy, y:(iy-ix)/2 });
  const clampCamera = __ou_cam ? __ou_cam.clampCamera : ()=>{};
  const worldToScreen = __ou_cam ? __ou_cam.worldToScreen : (wx,wy)=>({ x:wx, y:wy });
  const screenToWorld = __ou_cam ? __ou_cam.screenToWorld : (px,py)=>({ x:px, y:py });
  const centerCameraOn = __ou_cam ? __ou_cam.centerCameraOn : ()=>{};
  const startCamShake = __ou_cam ? __ou_cam.startCamShake : ()=>{};
  const updateCamShake = __ou_cam ? __ou_cam.updateCamShake : ()=>{};

  

  let running = false;
  let gameOver = false;

  // NOTE: use `var` to avoid Temporal Dead Zone issues if any code path
  // references `state` before this declaration finishes initializing.
  // state 세분화: player/enemy(경제), ui(입력/UI), world(게임 시간/통계)
  var state = {
    player: { money: 10000, powerProd: 0, powerUse: 0 },
    enemy:  { money: 10000, powerProd: 0, powerUse: 0 },
    ui: {
      build: (window.OUUI && window.OUUI.build) ? window.OUUI.build : { active:false, kind:null, lane:null },
      lastClick:{ t:0, id:null },
      selection: (window.OUUI && window.OUUI.selection) ? window.OUUI.selection : new Set(),
      hover: (window.OUInput && window.OUInput.hover) ? window.OUInput.hover : { px:0, py:0, wx:0, wy:0, entId:null, t0:0 },
      drag: (window.OUInput && window.OUInput.drag) ? window.OUInput.drag : { on:false, moved:false, x0:0, y0:0, x1:0, y1:0 },
      pan:  (window.OUInput && window.OUInput.pan) ? window.OUInput.pan : { on:false, x0:0, y0:0, camIsoX:0, camIsoY:0 },
      colors: { player:"#0000ff", enemy:"#ff0000" },
      fx: { paths: [] },
      lastSingleId: null,
      lastSingleKind: null,
      lastHit: { t: -1e9, x: 0, y: 0 },
      mouseMode: "normal",
      attackAlert: { cooldownUntil:-1e9, windowUntil:-1e9, nextEmit:-1e9 },
      attackEvents: [],
      attackCycle: 0,
      alertFx: []
    },
    world: {
      t: 0,
      speedMul: 1,
      suppressClickUntil: 0,
      debug: { fastProd: false },
      buildLane:{ main:{queue:null,ready:null,fifo:[]}, def:{queue:null,ready:null,fifo:[]} },
      primary:{ player:{ barracks:null, factory:null }, enemy:{ barracks:null, factory:null } },
      stats: {
        kills: { 0: 0, 1: 0 }, losses: { 0: 0, 1: 0 }, construction: { 0: 0, 1: 0 }, harvest: { 0: 0, 1: 0 },
        mvp: {
          infantryProduced: { 0: 0, 1: 0 },
          vehicleKills: { 0: 0, 1: 0 },
          armorProduced: { 0: 0, 1: 0 },
          sniperInfantryKills: { 0: 0, 1: 0 },
          turretBuilt: { 0: 0, 1: 0 },
          engineerCaptures: { 0: 0, 1: 0 }
        }
      },
      gameOverPending: null,
      gameOverFade: null,
      gameOverVictory: null,
      gameOverEndGameTime: null,
      aiAlert: null,
      _visionFrame: 0,
      _placeStartPhase: false,
      _valAcc: 0,
      _simMissingWarned: false
    }
  };

  // backward compat: flat access (state.selection === state.ui.selection)
  state.build = state.ui.build;
  state.lastClick = state.ui.lastClick;
  state.selection = state.ui.selection;
  // 직렬화 준비: selection(Set) → JSON 가능한 배열
  state.serializeSelection = () => Array.from(state.selection || []);
  state.restoreSelection = (ids) => {
    if (!state.selection) return;
    state.selection.clear();
    (ids || []).forEach(id => state.selection.add(id));
  };
  state.hover = state.ui.hover;
  state.drag = state.ui.drag;
  state.pan = state.ui.pan;
  state.colors = state.ui.colors;
  state.fx = state.ui.fx;
  state.lastSingleId = state.ui.lastSingleId;
  state.lastSingleKind = state.ui.lastSingleKind;
  state.lastHit = state.ui.lastHit;
  state.mouseMode = state.ui.mouseMode;
  state.attackAlert = state.ui.attackAlert;
  state.attackEvents = state.ui.attackEvents;
  state.attackCycle = state.ui.attackCycle;
  state.alertFx = state.ui.alertFx;
  state.debug = state.world.debug;
  state.buildLane = state.world.buildLane;
  state.primary = state.world.primary;
  state.stats = state.world.stats;
  // world와 동기화되는 속성 (쓰기 시 state.world에 반영)
  Object.defineProperties(state, {
    t: { get: ()=>state.world.t, set: v=>{ state.world.t=v; }, enumerable: true },
    speedMul: { get: ()=>state.world.speedMul, set: v=>{ state.world.speedMul=v; }, enumerable: true },
    suppressClickUntil: { get: ()=>state.world.suppressClickUntil, set: v=>{ state.world.suppressClickUntil=v; }, enumerable: true },
    gameOverPending: { get: ()=>state.world.gameOverPending, set: v=>{ state.world.gameOverPending=v; }, enumerable: true },
    gameOverFade: { get: ()=>state.world.gameOverFade, set: v=>{ state.world.gameOverFade=v; }, enumerable: true },
    gameOverVictory: { get: ()=>state.world.gameOverVictory, set: v=>{ state.world.gameOverVictory=v; }, enumerable: true },
    gameOverEndGameTime: { get: ()=>state.world.gameOverEndGameTime, set: v=>{ state.world.gameOverEndGameTime=v; }, enumerable: true },
    aiAlert: { get: ()=>state.world.aiAlert, set: v=>{ state.world.aiAlert=v; }, enumerable: true },
    _visionFrame: { get: ()=>state.world._visionFrame, set: v=>{ state.world._visionFrame=v; }, enumerable: true },
    _placeStartPhase: { get: ()=>state.world._placeStartPhase, set: v=>{ state.world._placeStartPhase=v; }, enumerable: true },
    _valAcc: { get: ()=>state.world._valAcc, set: v=>{ state.world._valAcc=v; }, enumerable: true },
    _simMissingWarned: { get: ()=>state.world._simMissingWarned, set: v=>{ state.world._simMissingWarned=v; }, enumerable: true }
  });

  const __ou_attack = (window.OUUI && typeof window.OUUI.createAttackAlerts === "function")
    ? window.OUUI.createAttackAlerts({ state, toast, centerCameraOn })
    : null;


  const controlGroups = Array.from({length:10}, ()=>[]);
  if (window.FX && typeof window.FX.setGetTime === "function") window.FX.setGetTime(() => state.t);

  const terrain = new Uint8Array(MAP_W*MAP_H); // 0 ground, 1 rock, 2 ore, 3 water
  const ore = new Uint16Array(MAP_W*MAP_H);
  const isGem = new Uint8Array(MAP_W*MAP_H);
  // ore 타일셋 firstgid=225, localId 0~9 → 600,800,…,2400. gem 레이어 localId 0~3 → 1200,1600,2000,2400.
  const ORE_FIRSTGID = 225;
  const ORE_BASE = 600;
  const ORE_STEP = 200;
  const ORE_MAX = 2400;
  const ORE_VALUE = 1200;
  const GEM_BASE = 1200;
  const GEM_STEP = 400;
  const GEM_VALUE = 2400;
  const GEM_MAX = 2400;
  const oreAmountFromGid = (window.OU && window.OU.createOreAmountFromGid)
    ? window.OU.createOreAmountFromGid({ ORE_FIRSTGID, ORE_BASE, ORE_STEP, ORE_MAX, ORE_VALUE, GEM_BASE, GEM_STEP, GEM_VALUE, GEM_MAX })
    : (gid, isGem) => (isGem ? GEM_VALUE : ORE_VALUE);
  const buildOcc = new Uint8Array(MAP_W*MAP_H); // 1=blocked
  const TREE_HP_MAX = 5; // 나무: 폭발형 무기로 약 5회 피격 시 제거 (RA2 스타일)
  const treeHp = new Uint8Array(MAP_W*MAP_H);  // 0=없음, 1~TREE_HP_MAX=나무 HP
  const idx = (tx,ty)=> ty*MAP_W + tx;
  const inMap = (tx,ty)=> tx>=0 && ty>=0 && tx<MAP_W && ty<MAP_H;

  const tileOfX = (x)=> clamp(Math.floor(x/TILE), 0, MAP_W-1);
  const tileOfY = (y)=> clamp(Math.floor(y/TILE), 0, MAP_H-1);


  // forest_ground.tmj: start 레이어의 start_beacon( firstgid 235 ) 타일 위치 → 기지 스타트 지점
  let startBeaconTiles = []; // [{tx,ty}, ...] 최대 2개, left=0번 right=1번

  // [refactor] loadForestGround -> OUMap.loadFromTMJ (map.js). 캐시해 두 번 로드 방지.
  let _loadForestGroundPromise = null;
  const loadForestGround = (window.OUMap && typeof window.OUMap.loadFromTMJ === "function")
    ? () => {
        if (!_loadForestGroundPromise) {
          const url = `asset/sprite/map/editmap/${mapChoice || "forest_ground"}.tmj`;
          _loadForestGroundPromise = window.OUMap.loadFromTMJ(url, {
            terrain, ore, isGem, treeHp, startBeaconTiles, MAP_W, MAP_H, idx, oreAmountFromGid, TREE_HP_MAX
          });
        }
        return _loadForestGroundPromise;
      }
    : async () => { console.warn("[OUMap.loadFromTMJ] missing"); };

  loadForestGround();

  const explored = [new Uint8Array(MAP_W*MAP_H), new Uint8Array(MAP_W*MAP_H)];
  const visible  = [new Uint8Array(MAP_W*MAP_H), new Uint8Array(MAP_W*MAP_H)];

  let nextId=1;
  const units=[];
  const buildings=[];
  // Economy action queue: UI events enqueue, tick() applies. Delegated to ou_economy.
  state.econActions = state.econActions || [];
  function enqueueEcon(action){
    if (!action) return;
    if (__ou_econ && __ou_econ.enqueueEcon) __ou_econ.enqueueEcon(action);
    else state.econActions.push(action);
  }
  // Progress accessors are provided by ou_economy (single source of truth).

  const bullets=[];
  const traces=[];
  const missileTrailFades=[]; // IFV missile trails that fade out after impact
  const impacts=[]; // MG bullet impact sparks
  const fires=[]; // building fire particles (low HP)
  const explosions = (window.FX && window.FX.explosions) ? window.FX.explosions : [];
  const debris = (window.FX && window.FX.debris) ? window.FX.debris : [];
  const debrisTrail = (window.FX && window.FX.debrisTrail) ? window.FX.debrisTrail : [];
  const exp1Fxs = (window.FX && window.FX.exp1Fxs) ? window.FX.exp1Fxs : [];
  const smokeWaves = (window.FX && window.FX.smokeWaves) ? window.FX.smokeWaves : [];
  const smokePuffs = (window.FX && window.FX.smokePuffs) ? window.FX.smokePuffs : [];
  const dustPuffs = (window.FX && window.FX.dustPuffs) ? window.FX.dustPuffs : [];
  const dmgSmokePuffs = (window.FX && window.FX.dmgSmokePuffs) ? window.FX.dmgSmokePuffs : [];
  const bloodStains = (window.FX && window.FX.bloodStains) ? window.FX.bloodStains : [];
  const bloodPuffs = (window.FX && window.FX.bloodPuffs) ? window.FX.bloodPuffs : [];

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
      toast(L ? L("toast.runtimeError") : "런타임 오류로 중지됨 (콘솔 확인)");
    });
    window.addEventListener("unhandledrejection", (ev)=>{
      try{
        console.error("[UNHANDLED REJECTION]", ev.reason);
      }catch(_){}
      running = false;
      toast(L ? L("toast.runtimeError") : "런타임 오류로 중지됨 (콘솔 확인)");
    });
  }



// Example ref: community tables show ~13s at 1 factory for 1000-cost, ~6s at 2, ~4s at 3. (rounded)



  const POWER = {
    hqProd:20, powerPlant:150,
    refineryUse:50, barracksUse:10, factoryUse:25, radarUse:50, turretUse:25
  };

  const BUILD = {
    // height levels: 0 = flat, 1 = low, 2 = medium, 3 = tall
    // vision: world units
    hq:       { hLevel:3, tw:5, th:5, hp:3000, vision:1100, provideR: 10 * TILE },
    power:    { hLevel:2, tw:2, th:2, hp:750,  vision:680,  provideR: 4 * TILE },
    refinery: { hLevel:2, tw:4, th:3, hp:1000, vision:820,  provideR: 5.5 * TILE },
    factory:  { hLevel:2, tw:3, th:4, hp:1000, vision:800,  provideR: 5.5 * TILE },
    barracks: { hLevel:2, tw:2, th:2, hp:500,  vision:720,  provideR: 4 * TILE },
    radar:    { hLevel:3, tw:2, th:2, hp:1000, vision:950,  provideR: 4 * TILE },
    turret:   { hLevel:1, tw:1, th:1, hp:400,  vision:780,  provideR: 0   }
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

  const L = (window.OULocale && window.OULocale.L) ? window.OULocale.L : null;
  const _extNames = (window.G && window.G.Units && window.G.Units.NAME_KO) ? window.G.Units.NAME_KO : null;
  const NAME_KO = {};
  for (const k of Object.keys(DEFAULT_NAME_KO)){
    NAME_KO[k] = L ? L.unit(k) : (DEFAULT_NAME_KO[k] || k);
  }
  if (_extNames) Object.assign(NAME_KO, _extNames);


  // === Centralized assets (refactor) ===
  const ASSET = {
    music: {
      peace: ["asset/music/peace1.mp3","asset/music/peace2.mp3","asset/music/peace3.mp3","asset/music/peace4.mp3"],
    battle:["asset/music/battle1.mp3","asset/music/battle2.mp3","asset/music/battle3.mp3","asset/music/battle4.mp3","asset/music/battle5.mp3","asset/music/Bring it on!.mp3","asset/music/Bring of the new age.mp3"],
      victory: ["asset/music/Brave Force.mp3", "asset/music/Brave Force2.mp3"],
      pregame: ["asset/music/Dive into the battlefield.mp3"],
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

  const __turnHelpers = (window.G && window.G.Units && typeof window.G.Units.createTurnHelpers === "function")
    ? window.G.Units.createTurnHelpers()
    : null;
  const _turnStepTowardTurret = __turnHelpers ? __turnHelpers._turnStepTowardTurret : ()=>({ nextDir:0, stepDir:1 });
  const _advanceTurnState = __turnHelpers ? __turnHelpers._advanceTurnState : ()=>({ done:true, frameNum:null });
  const _turretTurnFrameNum = __turnHelpers ? __turnHelpers._turretTurnFrameNum : ()=>null;
  const _tankUpdateHull = __turnHelpers ? __turnHelpers._tankUpdateHull : ()=>{};

  if (window.FX && typeof window.FX.setGetTime === "function") window.FX.setGetTime(() => state.t);

  // [Camera shake moved to camera.js]

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
  const INF_SPRITE_SCALE = 0.11;

  // [vecToDir8, worldVecToDir8 moved to ou_utils.js]

const buildingWorldFromTileOrigin = __tileHelpers ? __tileHelpers.buildingWorldFromTileOrigin : (tx,ty,tw,th)=>{ const w=tw*TILE, h=th*TILE; return { cx: tx*TILE + w/2, cy: ty*TILE + h/2, w, h }; };
  function setBuildingOcc(b, v){
    if (__ou_footprint && __ou_footprint.setBuildingOcc) __ou_footprint.setBuildingOcc(b, v);
    else { for (let ty=b.ty; ty<b.ty+b.th; ty++) for (let tx=b.tx; tx<b.tx+b.tw; tx++) if (inMap(tx,ty)) buildOcc[idx(tx,ty)] = v; }
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
    };
    buildings.push(b);
    // Auto-assign PRIMARY producer if none.
    if (team===TEAM.PLAYER){
      if (kind==="barracks" && !state.primary.player.barracks) state.primary.player.barracks = b.id;
      if (kind==="factory"  && !state.primary.player.factory)  state.primary.player.factory  = b.id;
    }
    setBuildingOcc(b, 1);
    recomputePower();
    if (!state._placeStartPhase && !spec.civ && __ou_sim && __ou_sim.recordConstruction) __ou_sim.recordConstruction(team, kind);
    if (__ou_econ && __ou_econ.onBuildingPlaced) __ou_econ.onBuildingPlaced(b);
    try{ if (window.PO && PO.buildings && PO.buildings.onPlaced) PO.buildings.onPlaced(b, state); }catch(_e){}
    return b;
  }

  
function hasBuilding(team, kind){
  for (const b of buildings){
    if (b.alive && !b.civ && b.team===team && b.kind===kind) return true;
  }
  return false;
}

function addUnit(team, kind, x, y, opts){
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
    if (kind === "infantry" || kind === "sniper" || kind === "tank" || kind === "ifv" || kind === "harvester") {
      u.veteran = 0;
      u.veteranExp = 0;
    }
    units.push(u);
    if (!(opts && opts.skipMvp) && __ou_sim && __ou_sim.recordProduction) __ou_sim.recordProduction(team, kind);
    return u;
  }

  const _entityByIdMap = new Map();
  function rebuildEntityByIdCache(){
    _entityByIdMap.clear();
    for (const u of units) if (u.alive) _entityByIdMap.set(u.id, u);
    for (const b of buildings) if (b.alive) _entityByIdMap.set(b.id, b);
  }
  function getEntityById(id){
    const e = _entityByIdMap.get(id);
    if (e != null) return e.alive ? e : null;
    for (const u of units) if (u.alive && u.id===id) { _entityByIdMap.set(id,u); return u; }
    for (const b of buildings) if (b.alive && b.id===id) { _entityByIdMap.set(id,b); return b; }
    return null;
  }

  const __ou_veterancy = (window.OUVeterancy && typeof window.OUVeterancy.create === "function")
    ? window.OUVeterancy.create({ getEntityById, COST })
    : null;
  const getVeteranArmor = __ou_veterancy ? __ou_veterancy.getVeteranArmor : (() => 1);
  const getVeteranSpeed = __ou_veterancy ? __ou_veterancy.getVeteranSpeed : (() => 1);
  const grantVeteranExp = __ou_veterancy ? __ou_veterancy.grantVeteranExp : (() => {});

  function isBlockedFootprint(tx,ty,tw,th){ return __ou_footprint && __ou_footprint.isBlockedFootprint ? __ou_footprint.isBlockedFootprint(tx,ty,tw,th) : true; }
  function isTooCloseToOtherBuildings(tx,ty,tw,th, gapTiles=1){ return __ou_footprint && __ou_footprint.isTooCloseToOtherBuildings ? __ou_footprint.isTooCloseToOtherBuildings(tx,ty,tw,th, gapTiles) : false; }
  function footprintBlockedMask(tx,ty,tw,th){ return __ou_footprint && __ou_footprint.footprintBlockedMask ? __ou_footprint.footprintBlockedMask(tx,ty,tw,th) : { blocked: true, mask: new Uint8Array((tw||1)*(th||1)) }; }


  function inBuildRadius(team, wx, wy){
    if (!buildings.some(b=>b.alive && !b.civ && b.team===team && b.kind==='hq')) return false;

    for (const b of buildings){
      if (!b.alive) continue;
      if (b.team !== team) continue;
      if (b.civ) continue;
      if ((b.provideR||0) <= 0) continue;
      const r = b.provideR;
      if (dist2(b.x, b.y, wx, wy) <= r * r) return true;
    }
    return false;
  }

  function isWalkableTile(tx,ty){
    if (!inMap(tx,ty)) return false;
    const t = terrain[idx(tx,ty)];
    if (t===1 || t===3) return false;
    if (buildOcc[idx(tx,ty)]===1) return false;
    if (treeHp[idx(tx,ty)] > 0) return false; // 나무: 모든 지상 유닛 이동 불가
    return true;
  }

  // isBlockedWorldPoint moved to sim.js
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

  const __ou_footprint = (window.OU && typeof window.OU.createFootprintHelpers === "function")
    ? window.OU.createFootprintHelpers({
        buildOcc, buildings, terrain, ore, treeHp, occAll, units,
        MAP_W, MAP_H, inMap, idx, buildingWorldFromTileOrigin, dist2PointToRect
      })
    : null;

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
    if (u.kind==="infantry" || u.kind==="sniper" || u.kind==="tank" || u.kind==="ifv" || u.kind==="harvester") s *= getVeteranSpeed(u);
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


  // followPath moved to sim.js

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

function boardUnitIntoIFV(unit, ifv){ return __ou_commands && __ou_commands.boardUnitIntoIFV ? __ou_commands.boardUnitIntoIFV(unit, ifv) : false; }
function tryBoardIFV(ifv){ return __ou_commands && __ou_commands.tryBoardIFV ? __ou_commands.tryBoardIFV(ifv) : false; }
function tryUnloadIFV(ifv){ return __ou_commands && __ou_commands.tryUnloadIFV ? __ou_commands.tryUnloadIFV(ifv) : false; }



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
      if (target.kind==="harvester" || BUILD[target.kind]) { if (__ou_attack && __ou_attack.notifyPlayerAttacked) __ou_attack.notifyPlayerAttacked(target); }
    }
    // Enemy base under attack: push AI defense alert
    if (srcTeam===TEAM.PLAYER && target.team===TEAM.ENEMY){
      if (BUILD[target.kind]){
        state.aiAlert = { x: target.x, y: target.y, until: state.t + 6.0 };
      }
    }

    let finalDmg = dmg;
    if (target && (target.kind === "infantry" || target.kind === "sniper")) {
      finalDmg = dmg / getVeteranArmor(target);
    }
    target.hp -= finalDmg;

    if (target.hp > 0) return;

    // Centralized death handling: NEVER do partial cleanup in random call sites.
    handleEntityDeath(target, srcId, srcTeam);
  }

  // [recordKill, recordLoss, recordConstruction, recordCapture, recordProduction moved to sim.js]

  function handleEntityDeath(ent, srcId=null, srcTeam=null){
    if (!ent || !ent.alive) return;

    const isBuilding = !!BUILD[ent.kind];

    if (isBuilding){
      destroyBuilding(ent, {srcId, srcTeam});
      return;
    }

    const killer = srcId ? getEntityById(srcId) : null;
    const sniperKill = killer && (killer.kind==="sniper" || (killer.kind==="ifv" && killer.passKind==="sniper"));
    const targetCls = UNIT[ent.kind]?.cls;
    if (__ou_sim && __ou_sim.recordKill) __ou_sim.recordKill(srcTeam, { targetKind: ent.kind, targetCls, sniperKill });
    if (__ou_sim && __ou_sim.recordLoss) __ou_sim.recordLoss(ent.team);
    grantVeteranExp(killer, COST[ent.kind] || 0, state.t, ent.team);

    // Unit death
    // Infantry death animation FX (7 frames, 1200x1200 each, magenta palette swapped to team color)
    try{
      const cls = UNIT[ent.kind]?.cls;
      if (ent.kind === "sniper"){
        snipDeathFxs.push({ x: ent.x, y: ent.y, team: ent.team, t0: state.t });
        try{ if (window.FX && window.FX.addBloodBurst) window.FX.addBloodBurst(ent.x, ent.y, 1.05); }catch(_e){}
      } else if (cls === "inf"){
        infDeathFxs.push({ x: ent.x, y: ent.y, team: ent.team, t0: state.t });
        try{ if (window.FX && window.FX.addBloodBurst) window.FX.addBloodBurst(ent.x, ent.y, 1.00); }catch(_e){}
      }
    }catch(_e){}

    if (ent.kind === "harvester"){
      try{ if (window.FX && window.FX.addDebris) window.FX.addDebris(ent.x, ent.y, { minN:2, maxN:6, size:1.2 }); }catch(_e){}
    }

    ent.alive = false;
    state.selection.delete(ent.id);
    checkElimination();
  }

  function destroyBuilding(b, cause={}){
    if (!b || !b.alive) return;

    const killer = cause.srcId ? getEntityById(cause.srcId) : null;
    grantVeteranExp(killer, COST[b.kind] || 0, state.t, b.team);
    if (__ou_sim && __ou_sim.recordKill) __ou_sim.recordKill(cause.srcTeam, { targetKind: b.kind, targetCls: null, sniperKill: false });
    if (__ou_sim && __ou_sim.recordLoss) __ou_sim.recordLoss(b.team);

    // 1) Evac infantry FIRST (needs the footprint while it's still logically present)
    //    If no valid spawn tile exists, it will safely skip.
    spawnEvacUnitsFromBuilding(b, true);

    // 2) Big destruction FX - 다음 프레임에 지연 실행하여 순간 렉 방지
    const bx = b.x, by = b.y, bKind = b.kind;
    const bw = (b.w || (b.tw*TILE) || (TILE*4));
    const bh = (b.h || (b.th*TILE) || (TILE*4));
    const bSize = Math.sqrt(bw*bw + bh*bh) / (TILE*2);
    let _smkS = 1;
    try{
      let s = Math.sqrt(bw*bw + bh*bh) / (TILE*2.0);
      _smkS = clamp(s, 0.8, 2.2);
    }catch(_e){}
    requestAnimationFrame(()=>{
      try{
        if (window.FX && window.FX.addBuildingExplosion) window.FX.addBuildingExplosion({x:bx, y:by, kind:bKind, w:bw, h:bh, tw:b.tw, th:b.th});
        if (window.FX && window.FX.addDebris) window.FX.addDebris(bx, by, { minN:3, maxN:8, size: clamp(bSize, 0.8, 2.5) });
        if (window.FX && window.FX.addSmokeEmitter) window.FX.addSmokeEmitter(bx, by, _smkS);
        const puffN = Math.min(6, Math.floor(10 * _smkS));
        for (let i=0;i<puffN;i++){
          if (window.FX && window.FX.spawnSmokePuff) window.FX.spawnSmokePuff(bx, by, 1.35 * _smkS);
        }
        const hazeN = Math.min(2, Math.floor(3 * _smkS));
        for (let i=0;i<hazeN;i++){
          if (window.FX && window.FX.spawnSmokeHaze) window.FX.spawnSmokeHaze(bx, by, 1.10 * _smkS);
        }
      }catch(_e){}
    });
    // 2.5) HQ special - 지연 실행
    if (bKind === "hq"){
      let sc = 1.0;
      try{
        const fr0 = (window.OURender && typeof OURender.getExp1Frame0 === "function")
          ? OURender.getExp1Frame0()
          : null;
        if (fr0){
          const sx = bw / Math.max(1, fr0.w);
          const sy = bh / Math.max(1, fr0.h);
          sc = clamp(Math.max(sx, sy) * 0.35, 0.55, 1.35);
        }
      }catch(_e){}
      const hqSc = sc;
      requestAnimationFrame(()=>{
        try{
          if (window.FX && window.FX.spawnExp1FxAt) window.FX.spawnExp1FxAt(bx, by, hqSc, 0.05);
          if (typeof startCamShake === "function") startCamShake(0.65, 22, 36);
        }catch(_e){}
      });
    }


    // 3) Remove from gameplay
    try{ if (window.PO && PO.buildings && PO.buildings.onDestroyed) PO.buildings.onDestroyed(b, state); }catch(_e){}
    b.alive = false;
    state.selection.delete(b.id);
    setBuildingOcc(b, 0);
    recomputePower();
    checkElimination();
  }

  function hasControllableAssets(team){
    // Controllable assets: any alive unit OR any alive non-civil building (including captured).
    const hasU = units.some(u=>u.alive && u.team===team);
    if (hasU) return true;
    const hasB = buildings.some(b=>b.alive && !b.civ && b.team===team && b.selectable!==false);
    return hasB;
  }

  const GAMEOVER_WINDDOWN = 2.5;
  const GAMEOVER_FADE_DUR = 1.8;

  function checkElimination(){
    if (gameOver || state.gameOverPending) return;

    if (state.shortGame){
      const enemyHasBuildings = buildings.some(b=>b.alive && !b.civ && b.team===TEAM.ENEMY);
      if (!enemyHasBuildings){
        for (const u of units){ if (u.alive && u.team===TEAM.ENEMY) handleEntityDeath(u, null, null); }
        state.gameOverPending = { victory: true, endT: state.t + GAMEOVER_WINDDOWN, endGameTime: state.t };
        return;
      }
    }

    const enemyAlive = hasControllableAssets(TEAM.ENEMY);
    const playerAlive = hasControllableAssets(TEAM.PLAYER);

    if (!enemyAlive){
      state.gameOverPending = { victory: true, endT: state.t + GAMEOVER_WINDDOWN, endGameTime: state.t };
    } else if (!playerAlive){
      state.gameOverPending = { victory: false, endT: state.t + GAMEOVER_WINDDOWN, endGameTime: state.t };
    }
  }

// Player production request queues (FIFO per factory type).
const prodFIFO = { barracks: [], factory: [] };
const prodTotal = { infantry:0, engineer:0, sniper:0, tank:0, harvester:0, ifv:0 };
// 유닛별 '멈춤' 플래그: 우클릭 취소 시 true → feedProducers가 prodFIFO에서 해당 유닛을 더 채우지 않음
const prodFeedStopped = {};
const QCAP = 30;

// Economy module hookup (ou_economy.js)
// Must be loaded BEFORE game.js in index.html.
const __ou_econ = (window.OUEconomy && typeof window.OUEconomy.create==="function")
  ? window.OUEconomy.create({
      state, buildings, TEAM, COST, POWER,
      prodFIFO, prodTotal, prodFeedStopped, QCAP,
      clamp,
      creditsInt: (window.OU && typeof window.OU.creditsInt==="function") ? window.OU.creditsInt : (v=>Math.floor(Number(v)||0)),
      BUILD_SPEED_MIN_PER_1000,
      GAME_SPEED,
      BUILD_PROD_MULT,
      MULTIPLE_FACTORY,
      ENEMY_PROD_SPEED,
      toast, L,
      updateProdBadges,
      // spawn helpers (used by production completion)
      addUnit,
      setPathTo,
      findSpawnPointNear,
      findNearestFreePoint,
      // build placement (tryPlaceBuild)
      buildingWorldFromTileOrigin,
      inBuildRadius,
      isBlockedFootprint,
      addBuilding,
      TILE,
      MAP_W,
      MAP_H,
      BUILD,
      // harvester spawn (refinery)
      terrain, buildOcc, ore, occAll, inMap, idx, tileToWorldCenter,
      isWalkableTile,
      repairWrenches
    })
  : null;

if (!__ou_econ) console.warn("[ou_economy] missing: include js/ou_economy.js before game.js");

// Selection module hookup (ou_selection.js)
const __ou_selection = (window.OUSelection && typeof window.OUSelection.create === "function")
  ? window.OUSelection.create({
      state, units, buildings, controlGroups, BUILD, TEAM, UNIT,
      getEntityById, worldToScreen, cam, toast, L, updateSelectionUI,
      tileOfX, tileOfY, inMap, explored, idx, tileToWorldSubslot, dist2, pointInPoly, ISO_X, TILE
    })
  : null;

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
      missileTrailFades,
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
      treeHp,
      TILE,
      MAP_W,
      MAP_H,
      WORLD_W,
      WORLD_H,
      ore,
      isGem,
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

      tileToWorldSubslot,
      snapWorldToTileCenter,
      findBypassStep,
      getMoveSpeed,
      _tankUpdateHull,
      buildOcc,
      _turnStepTowardTurret,
      _advanceTurnState,
      _turretTurnFrameNum,
      // spawnBullet/spawnTrace/mg/sniper now live in sim
      spawnTrailPuff: (window.FX && window.FX.spawnTrailPuff) || (()=>{}),
      spawnDmgSmokePuff: (window.FX && window.FX.spawnDmgSmokePuff) || (()=>{}),
      applyDamage,
      crushInfantry,
      captureBuilding,
      boardUnitIntoIFV,
      // turret/bullet deps (FX module)
      updateExplosions: (window.FX && window.FX.updateExplosions) || (()=>{}),
      updateDebris: (window.FX && window.FX.updateDebris) || (()=>{})
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
const _sim = (fn, def) => (...args) => (isCallable(__ou_sim, fn) ? __ou_sim[fn](...args) : def);
function clearOcc(dt){ _sim("clearOcc")(dt); }
function resolveUnitOverlaps(){ _sim("resolveUnitOverlaps")(); }
  function updateVision(){
  if (isCallable(__ou_sim, "updateVision")) {
    __ou_sim.updateVision();
    return;
  }
  // sim 미로드 시 fallback: 전장안개 OFF면 전맵 밝히기, ON이면 건물 발자국+시야 범위 밝히기
  if (!fogEnabled) {
    explored[TEAM.PLAYER].fill(1);
    visible[TEAM.PLAYER].fill(1);
    explored[TEAM.ENEMY].fill(1);
    visible[TEAM.ENEMY].fill(1);
    return;
  }
  visible[TEAM.PLAYER].fill(0);
  visible[TEAM.ENEMY].fill(0);
  for (const b of buildings){
    if (!b || !b.alive || b.civ) continue;
    if (b.team !== TEAM.PLAYER && b.team !== TEAM.ENEMY) continue;
    const tw = b.tw ?? (BUILD[b.kind] && BUILD[b.kind].tw) ?? 1;
    const th = b.th ?? (BUILD[b.kind] && BUILD[b.kind].th) ?? 1;
    for (let ty = b.ty; ty < b.ty + th; ty++){
      for (let tx = b.tx; tx < b.tx + tw; tx++){
        if (!inMap(tx, ty)) continue;
        const i = idx(tx, ty);
        explored[b.team][i] = 1;
        visible[b.team][i] = 1;
      }
    }
    const v = (BUILD[b.kind] && BUILD[b.kind].vision) || 0;
    if (v > 0) {
      const v2 = v * v;
      const rad = Math.ceil(v / TILE) + 1;
      const tx0 = Math.max(0, Math.floor(b.x / TILE) - rad);
      const tx1 = Math.min(MAP_W - 1, Math.ceil(b.x / TILE) + rad);
      const ty0 = Math.max(0, Math.floor(b.y / TILE) - rad);
      const ty1 = Math.min(MAP_H - 1, Math.ceil(b.y / TILE) + rad);
      for (let ty = ty0; ty <= ty1; ty++) {
        for (let tx = tx0; tx <= tx1; tx++) {
          const cx = (tx + 0.5) * TILE, cy = (ty + 0.5) * TILE;
          if (dist2(b.x, b.y, cx, cy) <= v2) {
            explored[b.team][idx(tx, ty)] = 1;
            visible[b.team][idx(tx, ty)] = 1;
          }
        }
      }
    }
  }
  for (const u of units){
    if (!u || !u.alive || u.inTransport) continue;
    if (u.team !== TEAM.PLAYER && u.team !== TEAM.ENEMY) continue;
    const visR = Math.max((UNIT[u.kind] && UNIT[u.kind].vision) || 200, (u.range || 0));
    const v2 = visR * visR;
    const rad = Math.ceil(visR / TILE) + 1;
    const tx0 = Math.max(0, Math.floor(u.x / TILE) - rad);
    const tx1 = Math.min(MAP_W - 1, Math.ceil(u.x / TILE) + rad);
    const ty0 = Math.max(0, Math.floor(u.y / TILE) - rad);
    const ty1 = Math.min(MAP_H - 1, Math.ceil(u.y / TILE) + rad);
    for (let ty = ty0; ty <= ty1; ty++) {
      for (let tx = tx0; tx <= tx1; tx++) {
        const cx = (tx + 0.5) * TILE, cy = (ty + 0.5) * TILE;
        if (dist2(u.x, u.y, cx, cy) <= v2) {
          explored[u.team][idx(tx, ty)] = 1;
          visible[u.team][idx(tx, ty)] = 1;
        }
      }
    }
  }
}
  function recomputePower(){
  // Prefer economy module's power calc, but fall back if missing/NaN/0/0 while buildings exist.
  if (isCallable(__ou_econ, "recomputePower")){
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

  if (isCallable(__ou_econ, "validateTechQueues")){
    try { __ou_econ.validateTechQueues(); } catch(_){}
  }
}
function clearReservation(u){ _sim("clearReservation")(u); }
function settleInfantryToSubslot(u, dt){ _sim("settleInfantryToSubslot")(u, dt); }
function findNearestFreePoint(wx, wy, u, r=3){ return _sim("findNearestFreePoint", {x: wx, y: wy, found: false})(wx, wy, u, r) ?? {x: wx, y: wy, found: false}; }
function findNearestRefinery(team, wx, wy){ return _sim("findNearestRefinery", null)(team, wx, wy) ?? null; }
function getDockPoint(b, u){ return _sim("getDockPoint", {x: b.x, y: b.y})(b, u) ?? {x: b.x, y: b.y}; }
function getClosestPointOnBuilding(b, u){ return _sim("getClosestPointOnBuilding", {x: b.x, y: b.y})(b, u) ?? {x: b.x, y: b.y}; }
function isReservedByOther(u, tx, ty){ return _sim("isReservedByOther", false)(u, tx, ty) ?? false; }
function reserveTile(u, tx, ty){ return _sim("reserveTile", false)(u, tx, ty) ?? false; }
function isSqueezedTile(tx, ty){ return _sim("isSqueezedTile", false)(tx, ty) ?? false; }
function findNearestFreeStep(u){ return _sim("findNearestFreeStep", null)(u) ?? null; }
function canEnterTile(u, tx, ty){ return _sim("canEnterTile", false)(u, tx, ty) ?? false; }
function canEnterTileGoal(u, tx, ty, t){ return _sim("canEnterTileGoal", false)(u, tx, ty, t) ?? false; }
function heuristic(ax,ay,bx,by){ return _sim("heuristic", 0)(ax,ay,bx,by) ?? 0; }
function aStarPath(sx,sy,gx,gy, maxNodes=12000){ return _sim("aStarPath", null)(sx,sy,gx,gy, maxNodes) ?? null; }
function aStarPathOcc(u, sx, sy, gx, gy){ return _sim("aStarPathOcc", null)(u, sx, sy, gx, gy) ?? null; }
function setPathTo(u, goalX, goalY){ return _sim("setPathTo", false)(u, goalX, goalY) ?? false; }



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
        prodFeedStopped[kind] = false;
        q.paused = false;
        q.autoPaused = false;
        resumed = true;
      }
    }
    if (resumed){
      toast(L ? L("toast.resume") : "재개");
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
    const maxR = (opts && opts.evacRange) ? 22 : 14;
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
    const spiralMax = (opts && opts.evacRange) ? 26 : 18;
    for (let r=1; r<=spiralMax; r++){
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

  
  function spawnEvacUnitsFromBuilding(b, destroyed){
    if (!b || b.civ) return;
    if (!b.alive && !destroyed) return;
    if (b.kind==="turret") return;
    const team=b.team;
    const hpFrac = destroyed ? 0.5 : 1.0;
    const spawnOne = (kind)=>{
      // Try strict spawn first (truly free tile). If the building just died and the area is crowded,
      // relax unit-occupancy checks and expand search range to avoid units stuck in debris.
      const evacOpts = { evacRange: true };
      let sp = findSpawnPointNear(b, kind, evacOpts);
      if (!sp && destroyed){
        sp = findSpawnPointNear(b, kind, { ...evacOpts, ignoreUnits: true });
      }
      if (!sp) return null; // no valid spawn point found
      const u = addUnit(team, kind, sp.x, sp.y, { skipMvp: true });
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
    if ((b.kind==="barracks" && b._barrackSelling) || (b.kind==="power" && b._powerSelling) || (b.kind==="refinery" && b._refinerySelling)) return;

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
        state.player.money = Math.floor((state.player.money||0) + qRefund);
      }
      b.buildQ.length = 0;
      updateProdBadges();
    }

const refund = Math.floor((COST[b.kind]||0) * 0.5);
    if (b.team===TEAM.PLAYER) state.player.money = Math.floor((state.player.money||0) + refund);
    else state.enemy.money = Math.floor((state.enemy.money||0) + refund);

    // Selling evacuates units at full HP.
    spawnEvacUnitsFromBuilding(b, false);

    // Barracks / Power Plant: play "construction" animation in reverse, then remove footprint.
    if (b.kind==="barracks" || b.kind==="power" || b.kind==="refinery"){
      const _flag = (b.kind==="barracks") ? "_barrackSelling" : (b.kind==="power") ? "_powerSelling" : "_refinerySelling";
      const _t0   = (b.kind==="barracks") ? "_barrackSellT0" : (b.kind==="power") ? "_powerSellT0" : "_refinerySellT0";
      const _fin  = (b.kind==="barracks") ? "_barrackSellFinalizeAt" : (b.kind==="power") ? "_powerSellFinalizeAt" : "_refinerySellFinalizeAt";
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

    if (__ou_sim && __ou_sim.recordCapture) __ou_sim.recordCapture(engineer.team);
    recomputePower();
    checkElimination();
    engineer.alive=false;
    state.selection.delete(engineer.id);
    checkElimination();
  }

  const buildingScreenPoly = (window.OU && typeof window.OU.createBuildingScreenPoly === "function")
    ? window.OU.createBuildingScreenPoly(TILE, worldToScreen)
    : (b)=>{ const p=worldToScreen(b.x,b.y); return [p,p,p,p]; };
  function pickEntityAtWorld(wx,wy){ return __ou_selection && __ou_selection.pickEntityAtWorld ? __ou_selection.pickEntityAtWorld(wx,wy) : null; }


  const __cmdThrottle = (window.OUInput && window.OUInput.createCmdThrottle) ? window.OUInput.createCmdThrottle({ state }) : null;
  const shouldIgnoreCmd = __cmdThrottle ? __cmdThrottle.shouldIgnoreCmd : () => false;
  const stampCmd = __cmdThrottle ? __cmdThrottle.stampCmd : () => {};
  const buildFormationOffsets = (window.OU && window.OU.buildFormationOffsets) ? window.OU.buildFormationOffsets : (maxN) => Array.from({ length: Math.min(maxN, 1) }, (_, i) => ({ dx: 0, dy: 0 }));

  function issueMoveAll(x,y){ if (__ou_commands) return __ou_commands.issueMoveAll(x,y); }
  function issueMoveCombatOnly(x,y){ if (__ou_commands) return __ou_commands.issueMoveCombatOnly(x,y); }
  function issueAttackMove(x,y){ if (__ou_commands) return __ou_commands.issueAttackMove(x,y); }
  function issueGuard(){ if (__ou_commands) return __ou_commands.issueGuard(); }
  function assignControlGroup(n){ if (__ou_selection) __ou_selection.assignControlGroup(n); }
  function recallControlGroup(n){ if (__ou_selection) __ou_selection.recallControlGroup(n); }


  

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

  const __ou_commands = (window.OUCommands && typeof window.OUCommands.create === "function")
    ? window.OUCommands.create({
        state, getEntityById, TEAM, BUILD, UNIT, setPathTo, pushOrderFx, showUnitPathFx,
        canEnterTile, reserveTile, findNearestFreePoint, tileToWorldCenter, tileToWorldSubslot,
        inMap, snapWorldToTileCenter, buildFormationOffsets, shouldIgnoreCmd, stampCmd,
        TILE, getClosestPointOnBuilding, getChasePointForAttack, tileOfX, tileOfY, toast, L, INF_SLOT_MAX, clamp,
        dist2, updateSelectionUI
      })
    : null;

    function issueAttack(targetId){ if (__ou_commands) return __ou_commands.issueAttack(targetId); }
  function issueForceAttack(targetId){ if (__ou_commands) return __ou_commands.issueForceAttack(targetId); }
  function issueForceFirePos(x,y){ if (__ou_commands) return __ou_commands.issueForceFirePos(x,y); }
  function issueCapture(targetId){ if (__ou_commands) return __ou_commands.issueCapture(targetId); }
  function issueEngineerRepair(targetId){ if (__ou_commands) return __ou_commands.issueEngineerRepair(targetId); }
  function issueHarvest(tx,ty){ if (__ou_commands) return __ou_commands.issueHarvest(tx,ty); }
  function issueIFVRepair(targetId){ if (__ou_commands) return __ou_commands.issueIFVRepair(targetId); }
function crushInfantry(mover){
  // 차량(탱크/굴착기)이 적 보병과 겹치면 즉사. IFV는 제외.
  if (mover.kind!=="tank" && mover.kind!=="harvester") return;
  const enemyTeam = mover.team===TEAM.PLAYER ? TEAM.ENEMY : TEAM.PLAYER;
  const mtx = tileOfX(mover.x), mty = tileOfY(mover.y);
  for (const u of units){
    if (!u.alive || u.team!==enemyTeam || u.inTransport || u.hidden) continue;
    const cls = (UNIT[u.kind] && UNIT[u.kind].cls) ? UNIT[u.kind].cls : "";
    if (cls!=="inf") continue;
    const utx = tileOfX(u.x), uty = tileOfY(u.y);
    const sameTile = (utx === mtx && uty === mty);
    if (sameTile || dist2(mover.x,mover.y,u.x,u.y) <= (mover.r + u.r)*(mover.r + u.r)*1.45){
      u.alive=false;
      state.selection.delete(u.id);
    }
  }
}

  function issueForceMoveAll(x,y){ if (__ou_commands) return __ou_commands.issueForceMoveAll(x,y); }

const keys=new Set();
  // DEBUG: Delete key toggles building-destruction click mode (any team)
  let DEBUG_KILL_BUILDINGS = false;
  const _ou_onKeyDown = (e)=>{
    // Pause menu: block gameplay hotkeys while open
    if (pauseMenuOpen){
      const inOverlay = isCallable(__ou_ui, "isPauseOverlayTarget")
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

    // Guard mode: press G
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
      // ESC: cancel repair/sell mouse mode first, otherwise toggle pause menu
      if (state.mouseMode === "repair" || state.mouseMode === "sell"){
        applyMouseMode("normal");
        toast(L ? L("toast.repairSellOff") : "수리/매각 해제");
        e.preventDefault();
        return;
      }
      togglePauseMenu();
      e.preventDefault();
      return;
    }
    if (e.key===" ") { if (e.repeat) { e.preventDefault(); return; } if (__ou_attack && __ou_attack.goToLastHit) __ou_attack.goToLastHit(); e.preventDefault(); }

    if (k==="q") { setProdCat("main"); e.preventDefault(); return; }
    if (k==="w") { setProdCat("def");  e.preventDefault(); return; }
    if (k==="e") { setProdCat("inf");  e.preventDefault(); return; }
    if (k==="r") { setProdCat("veh");  e.preventDefault(); return; }

    if (k==="k"){
      applyMouseMode(state.mouseMode==="repair" ? "normal" : "repair");
      toast(L ? (state.mouseMode==="repair" ? L("toast.repairMode") : L("toast.repairOff")) : (state.mouseMode==="repair" ? "수리 모드" : "수리 해제"));
    }
    if (k==="l"){
      applyMouseMode(state.mouseMode==="sell" ? "normal" : "sell");
      toast(L ? (state.mouseMode==="sell" ? L("toast.sellMode") : L("toast.sellOff")) : (state.mouseMode==="sell" ? "매각 모드" : "매각 해제"));
    }
    if (e.key === "]"){
      const speeds = [1, 2, 4];
      const cur = state.speedMul || 1;
      const idx = speeds.indexOf(cur);
      state.speedMul = speeds[(idx+1) % speeds.length];
      toast(L ? L("toast.speedMul").replace("{0}", state.speedMul) : `시간 x${state.speedMul}`);
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
          if (!BUILD[t.kind]){ toast(L ? L("toast.repairOnly") : "건물만 수리 가능"); return; }
          if (t.team!==TEAM.PLAYER){ toast(L ? L("toast.repairCant") : "수리 불가"); return; }
          if (t.hp >= t.hpMax-0.5){ toast(L ? L("toast.repairUnneeded") : "수리 불필요"); return; }
          enqueueEcon({ type:"toggleRepairById", id: t.id });
          return;
        }
        if (state.mouseMode==="sell"){
          if (t.team!==TEAM.PLAYER){ toast(L ? L("toast.sellCant") : "매각 불가"); return; }
          enqueueEcon({ type:"sellById", id: t.id });
          return;
        }
      } else {
        toast(L ? L("toast.noTarget") : "대상 없음");
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
      if (isCallable(__ou_cam, "applyPan")) {
        __ou_cam.applyPan(state.pan.camIsoX, state.pan.camIsoY, dx, dy);
      } else {
        const camIsoX = state.pan.camIsoX - dx;
        const camIsoY = state.pan.camIsoY - dy;
        const ww = isoToWorld(camIsoX, camIsoY);
        cam.x=ww.x; cam.y=ww.y;
        clampCamera();
      }
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
        toast(L ? L("toast.hqSet") : "주요건물 지정");
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

    if (state.selection.size>0 && e.altKey && !e.ctrlKey){
      issueForceMoveAll(sp.x,sp.y);
      state.drag.on=false;
      return;
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
    if (window.OUInput && typeof window.OUInput.getRectFromDrag === "function")
      return window.OUInput.getRectFromDrag();
    const d = state.drag;
    return { x0: Math.min(d.x0,d.x1), y0: Math.min(d.y0,d.y1), x1: Math.max(d.x0,d.x1), y1: Math.max(d.y0,d.y1) };
  }

  function selectInRect(r, additive){ return __ou_selection ? __ou_selection.selectInRect(r, additive) : false; }
  function selectSameType(){ if (__ou_selection) __ou_selection.selectSameType(); }

  
  function _applySetBuild(kind){
    if (!kind) return;

    // Decide lane: defenses go to def lane, everything else to main lane.
    const laneKey = (kind === "turret") ? "def" : "main";
    const lane = state.buildLane && state.buildLane[laneKey];
    if (!lane) return;

    // If we're in repair/sell mouse mode, entering build placement should cancel it.
    if (state.mouseMode === "repair" || state.mouseMode === "sell"){
      applyMouseMode("normal");
    }


    // If this exact kind is paused at the head of this lane, left-click resumes.
    if (lane.queue && lane.queue.kind === kind && lane.queue.paused){
      lane.queue.paused = false;
      toast(L ? L("toast.resume") : "재개");
      return;
    }

    // If we are currently in placement mode for another building, don't allow switching.
    if (state.build.active && state.build.kind && state.build.kind !== kind){
      toast(L ? L("toast.cantOrder") : "명령을 따를 수 없습니다. 건설 중입니다");
      return;
    }

    // If this lane is already constructing something else (or has READY pending), block switching.
    if ((lane.queue && lane.queue.kind && lane.queue.kind !== kind) ||
        (lane.ready && lane.ready !== kind)){
      toast(L ? L("toast.cantOrder") : "명령을 따를 수 없습니다. 건설 중입니다");
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

    // Avoid unintentional duplicate reservations of the same building.
    if ((lane.queue && lane.queue.kind === kind) || (lane.fifo && lane.fifo.includes(kind))){
      toast(L ? L("toast.alreadyQueued") : "이미 건설 대기중");
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
      if (refund > 0) state.player.money = Math.floor((state.player.money||0) + refund);
      lane.ready = null;
      // If player was in placement mode for this item, exit it.
      if (state.build && state.build.active && state.build.kind === kind && state.build.lane === laneKey){
        state.build.active = false;
        state.build.kind = null;
        state.build.lane = null;
      }
      toast(L ? L("toast.cancelRefund") : "취소 + 환불");
      return;
    }

    if (!lane.queue || lane.queue.kind !== kind){
      // Cancel a reserved (FIFO) build of this kind if present.
      if (lane.fifo && lane.fifo.length){
        for (let i=lane.fifo.length-1; i>=0; i--){
          if (lane.fifo[i] === kind){
            lane.fifo.splice(i,1);
            toast(L ? L("toast.reserveCancel") : "예약 취소");
            return;
          }
        }
      }
      return;
    }
    if (!lane.queue.paused){
      lane.queue.paused = true;
      toast(L ? L("toast.wait") : "대기");
    } else {
      // cancel + refund paid so far
      const paid = Math.floor(lane.queue.paid || 0);
      state.player.money = Math.floor((state.player.money||0) + paid);
      lane.queue = null;
      // Also drop any pending reservations of the same kind to avoid "ghost" rebuild.
      if (lane.fifo && lane.fifo.length){
        lane.fifo = lane.fifo.filter(k=>k!==kind);
      }
      toast(L ? L("toast.cancelRefund") : "취소 + 환불");
    }
  }

  // Right-click on the currently building item: 1st = pause(대기, no spending), 2nd = cancel + refund spent cost.

  function _applyUnitRClick(kind){
    const need = kindToProducer(kind);

    // 1) If this kind is currently being built at the front of some producer queue:
    //    - first right click: pause
    //    - second right click (while paused): cancel + refund paid
    let pb=null; let q=null;
    const primary = (need==="barracks" || need==="factory") && ensurePrimaryProducer ? ensurePrimaryProducer(need) : null;
    const toCheck = primary ? [primary, ...buildings.filter(b=>b.alive && !b.civ && b.team===TEAM.PLAYER && b.kind===need && b.id!==primary.id)] : buildings.filter(b=>b.alive && !b.civ && b.team===TEAM.PLAYER && b.kind===need);
    for (const b of toCheck){
      if (!b || !b.alive || b.civ || b.team!==TEAM.PLAYER || b.kind!==need) continue;
      const qq=b.buildQ && b.buildQ[0];
      if (qq && qq.kind===kind){ pb=b; q=qq; break; }
    }

    if (pb && q){
      if (!q.paused){
        q.paused = true;
        q.autoPaused = false;
        toast(L ? L("toast.wait") : "대기");
        return;
      }
      prodFeedStopped[kind] = true;
      const paid = Math.floor(q.paid || 0);
      state.player.money = Math.floor((state.player.money||0) + paid);
      pb.buildQ.shift();
      prodTotal[kind] = Math.max(0, (prodTotal[kind]||0)-1);
      updateProdBadges();
      toast(L ? L("toast.cancelRefund") : "취소 + 환불");
      return;
    }

    // 2) If it's queued in a producer buildQ but NOT at the front, cancel the last one of this kind.
    for (const b of buildings){
      if (!b.alive || b.civ || b.team!==TEAM.PLAYER || b.kind!==need) continue;
      const ql = b.buildQ || [];
      for (let i=ql.length-1; i>=1; i--){
        if (ql[i] && ql[i].kind===kind){
          prodFeedStopped[kind] = true;
          const paid = Math.floor(ql[i].paid || 0);
          if (paid>0) state.player.money = Math.floor((state.player.money||0) + paid);
          ql.splice(i,1);
          prodTotal[kind] = Math.max(0, (prodTotal[kind]||0)-1);
          updateProdBadges();
          toast(L ? L("toast.reserveCancel") : "예약 취소");
          return;
        }
      }
    }

    // 3) Otherwise: cancel ONE queued reservation from the global FIFO.
    const fifo = prodFIFO[need];
    if (!fifo || !fifo.length) return;
    for (let i=fifo.length-1; i>=0; i--){
      if (fifo[i].kind===kind){
        prodFeedStopped[kind] = true;
        fifo.splice(i,1);
        prodTotal[kind] = Math.max(0, (prodTotal[kind]||0)-1);
        updateProdBadges();
        toast(L ? L("toast.reserveCancel") : "예약 취소");
        return;
      }
    }
  }

  // Unit production right-click: 1st = pause(대기), 2nd (while paused) = cancel + refund spent.

  function applyMouseMode(mode){
    state.mouseMode = mode;
    if (isCallable(__ou_ui, "applyMouseMode")){
      __ou_ui.applyMouseMode({ state, mode });
    }
  }

  if (isCallable(__ou_ui, "bindGameButtons")){
    __ou_ui.bindGameButtons({
      onSetBuild: (kind)=>setBuild(kind),
      onRadarBuild: ()=>setBuild("radar"),
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
        toast(L ? (state.mouseMode==="repair" ? L("toast.repairMode") : L("toast.repairOff")) : (state.mouseMode==="repair" ? "수리 모드" : "수리 해제"));
      },
      onToggleSellMode: ()=>{
        applyMouseMode(state.mouseMode==="sell" ? "normal" : "sell");
        toast(L ? (state.mouseMode==="sell" ? L("toast.sellMode") : L("toast.sellOff")) : (state.mouseMode==="sell" ? "매각 모드" : "매각 해제"));
      },
      onSelectAllKind: ()=>selectAllUnitsScreenThenMap()
    });
  }


  // Production category tabs
  let prodCat = "main";
  function setProdCat(cat){
    prodCat = cat;
    if (isCallable(__ou_ui, "updateProdTabsUI")){
      __ou_ui.updateProdTabsUI({ prodCat });
    }
  }
  if (isCallable(__ou_ui, "bindProdTabClicks")){
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

  const _econHandlers = {
    setBuild: _applySetBuild,
    laneRClick: _applyLaneRClick,
    unitRClick: _applyUnitRClick,
    queueUnit,
    cancelBuild: cancelBuildPlacement,
    toggleRepair,
    toggleRepairById: (id)=>{
      const b = getEntityById(id);
      if (b && b.alive && b.team===TEAM.PLAYER && BUILD[b.kind] && !b.civ){
        b.repairOn = !b.repairOn;
        toast(L ? (b.repairOn ? L("toast.repairStart") : L("toast.repairCancel")) : (b.repairOn ? "수리 시작" : "수리 취소"));
        updateSelectionUI();
      }
    },
    sellSelected: sellSelectedBuildings,
    sellById: (id)=>{
      const b = getEntityById(id);
      if (b && b.alive && b.team===TEAM.PLAYER && BUILD[b.kind] && !b.civ){
        sellBuilding(b);
        toast(L ? L("toast.sell") : "매각");
        updateSelectionUI();
      }
    },
    sellByIdAny: (id)=>{
      const b = getEntityById(id);
      if (b && b.alive && BUILD[b.kind] && !b.civ) sellBuilding(b);
    }
  };

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
          e.shootCd = 0; // 정지 시 쿨 초기화 → 바로 다음 타겟 잡을 수 있게
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
    if (isCallable(__ou_econ, "tryPlaceBuild")) {
      __ou_econ.tryPlaceBuild();
      return;
    }
    const kind=state.build.kind;
    if (!kind) return;
    const spec=BUILD[kind];
    const s = snapHoverToTileOrigin(kind);
    const tx=s.tx, ty=s.ty;
    const wpos=buildingWorldFromTileOrigin(tx,ty,spec.tw,spec.th);
    if (!inBuildRadius(TEAM.PLAYER, wpos.cx, wpos.cy)) return;
    if (isBlockedFootprint(tx,ty,spec.tw,spec.th)) return;
    addBuilding(TEAM.PLAYER, kind, tx,ty);
    if (state.build.lane){
      const lane = state.buildLane[state.build.lane];
      if (lane && lane.ready === kind) lane.ready = null;
    }
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

    if (isCallable(__ou_ui, "updateBuildModeUI")){
      __ou_ui.updateBuildModeUI({ state });
    }
  }

function tickEconomyPre(dt){
    // feedProducers 먼저 → processEconActions 나중. 취소 직후 즉시 재충전되던 버그 방지.
    feedProducers();
    if (__ou_econ && __ou_econ.processEconActions) __ou_econ.processEconActions(_econHandlers);
    tickSidebarBuild(dt);
    if (isCallable(__ou_ai, "tickEnemySidebarBuild")) {
      __ou_ai.tickEnemySidebarBuild(dt);
    }
  }

function tickEconomyPost(dt){
    if (__ou_econ && __ou_econ.tickEconomyPost) return __ou_econ.tickEconomyPost(dt);
    return { m2: null, m3: null };
  }

function updatePowerBar() {
  if (!__ou_ui || !__ou_ui.updatePowerBar) return;
  __ou_ui.updatePowerBar({ state, clamp });
}

function pushClickWave(wx, wy, color){
  if (window.FX && typeof window.FX.pushClickWave === "function") window.FX.pushClickWave(wx, wy, color);
}

function showUnitPathFx(u){ /* no-op: path FX disabled for perf */ }

  function updateSelectionUI() {
  if (!__ou_ui || !__ou_ui.updateSelectionUI) return;
  __ou_ui.updateSelectionUI({
    state, buildings, TEAM, COST, prodTotal, QCAP, hasRadarAlive, getEntityById, BUILD, NAME_KO, L
  });
}



function draw(){
    const gameOverFadeAlpha = (state.gameOverFade && state.gameOverFade.dur > 0)
      ? Math.min(1, state.gameOverFade.t / state.gameOverFade.dur) : 0;
    if (window.OURender && typeof window.OURender.draw === "function"){
      window.OURender.draw({
        canvas, ctx, cam, state, TEAM, MAP_W, MAP_H, TILE, ISO_X, ISO_Y,
        terrain, ore, explored, visible, BUILD, DEFENSE, NAME_KO, ORE_VALUE, ORE_MAX,
        treeHp,
        units, buildings, bullets, traces, missileTrailFades, impacts, fires, healMarks, flashes, casings,
        gameOver, gameOverFadeAlpha, POWER,
        running,
        updateMoney: isCallable(__ou_ui, "updateMoney") ? __ou_ui.updateMoney : null,
        updateProdBadges,
        inMap, idx, tileOfX, tileOfY, tileToWorldCenter, worldToScreen,
        getEntityById, repairWrenches,
        snapHoverToTileOrigin, buildingWorldFromTileOrigin, inBuildRadius, isBlockedFootprint, footprintBlockedMask,
        rectFromDrag, refreshPrimaryBuildingBadgesUI,
        exp1Fxs,
        EXP1_PNG, EXP1_JSON,
        CON_YARD_PNG,
        smokeWaves, smokePuffs, dustPuffs, dmgSmokePuffs, bloodStains, bloodPuffs,
        explosions, debris, debrisTrail,
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
        infDeathFxs, snipDeathFxs,
        getFogEnabled: () => !!fogEnabled,
        L
      });
    }
  }

  // drawMini moved to render.js (OURender.drawMini)

  function setButtonText() {
    if (isCallable(__ou_ui, "setSellLabel")){
      __ou_ui.setSellLabel({ text: L ? L("ui.sellD") : "매각(D)" });
    }
  }

  function clearWorld(){
    units.length=0; buildings.length=0; bullets.length=0; traces.length=0; missileTrailFades.length=0;
    explosions.length=0; debris.length=0; debrisTrail.length=0; exp1Fxs.length=0;
    if (window.FX){
      if (window.FX.smokeWaves) window.FX.smokeWaves.length=0;
      if (window.FX.smokePuffs) window.FX.smokePuffs.length=0;
      if (window.FX.smokeEmitters) window.FX.smokeEmitters.length=0;
      if (window.FX.dustPuffs) window.FX.dustPuffs.length=0;
      if (window.FX.dmgSmokePuffs) window.FX.dmgSmokePuffs.length=0;
      if (window.FX.bloodStains) window.FX.bloodStains.length=0;
      if (window.FX.bloodPuffs) window.FX.bloodPuffs.length=0;
    }
    buildOcc.fill(0);
    explored[TEAM.PLAYER].fill(0);
    visible[TEAM.PLAYER].fill(0);
    explored[TEAM.ENEMY].fill(0);
    visible[TEAM.ENEMY].fill(0);
    nextId=1;
    state.selection.clear();
    state.build.active=false; state.build.kind=null;
    if (state.stats){ state.stats.kills[0]=0; state.stats.kills[1]=0; state.stats.losses[0]=0; state.stats.losses[1]=0; state.stats.construction[0]=0; state.stats.construction[1]=0; state.stats.harvest[0]=0; state.stats.harvest[1]=0; }
    state.gameOverPending = null;
    state.gameOverFade = null;
    prodFIFO.barracks.length=0; prodFIFO.factory.length=0;
    prodTotal.infantry=0; prodTotal.engineer=0; prodTotal.tank=0; prodTotal.harvester=0;
    state.player.money = Math.floor(START_MONEY); state.enemy.money = Math.floor(START_MONEY);
    gameOver=false;
    state.lastSingleId=null; state.lastSingleKind=null;
  }

  // [refactor] findFootprintSpotNear, placeStart -> ou_game_setup.js
  const __ou_setup = (window.OUGameSetup && typeof window.OUGameSetup.create === "function")
    ? window.OUGameSetup.create({
        clearWorld,
        addBuilding,
        isBlockedFootprint,
        buildings,
        BUILD,
        TEAM,
        clamp,
        MAP_W,
        MAP_H,
        inMap,
        idx,
        explored,
        visible,
        recomputePower,
        centerCameraOn,
        updateSelectionUI,
        getStartBeaconTiles: () => startBeaconTiles
      })
    : null;
  const findFootprintSpotNear = __ou_setup ? __ou_setup.findFootprintSpotNear : (kind, nearTx, nearTy, tries) => {
    const spec = BUILD[kind];
    for (let i = 0; i < (tries || 260); i++) {
      const tx = nearTx + ((Math.random() * 18) | 0) - 9;
      const ty = nearTy + ((Math.random() * 18) | 0) - 9;
      if (!isBlockedFootprint(tx, ty, spec.tw, spec.th)) return { tx, ty };
    }
    return { tx: clamp(nearTx, 0, MAP_W - spec.tw), ty: clamp(nearTy, 0, MAP_H - spec.th) };
  };
  const placeStart = __ou_setup ? __ou_setup.placeStart : (spawn) => {
    clearWorld();
    if (window.OUGameSetup) console.warn("[OUGameSetup] create failed - check refs");
  };

  // ✅ 시작 버튼 이벤트 복구 (이게 빠지면 "아무 버튼도 안눌림"처럼 보임)

  // 스커미시 창 전용 BGM (첫 클릭 시 재생, autoplay 정책 대응)
  const pregameBGM = (ASSET.music.pregame && ASSET.music.pregame[0]) ? (() => {
    const a = new Audio();
    a.src = ASSET.music.pregame[0];
    a.loop = true;
    a.volume = 0.4;
    const pregameEl = document.getElementById("pregame");
    if (pregameEl) {
      const start = () => { a.play().catch(() => {}); };
      pregameEl.addEventListener("click", start, { once: true, capture: true });
      pregameEl.addEventListener("touchstart", start, { once: true, capture: true, passive: true });
    }
    return { stop: () => { try { a.pause(); a.currentTime = 0; } catch (_e) {} } };
  })() : null;

function spawnStartingUnits(){
  // No bonus units at start.
}


if (isCallable(__ou_ui, "bindPregameStart")){
  __ou_ui.bindPregameStart({ onStart: async (payload) => {
    if (window.OUPregame && typeof window.OUPregame.applyTeamColorsFromPayload === "function") {
      window.OUPregame.applyTeamColorsFromPayload(payload, state);
    } else {
      if (payload && payload.playerColor) state.colors.player = payload.playerColor;
      if (payload && payload.enemyColor) state.colors.enemy = payload.enemyColor;
    }

    fogEnabled = !(payload && payload.fogOff);

    // Debug: player-only instant production/build completion (1s)
    state.debug = state.debug || {};
    state.debug.fastProd = !!(payload && payload.fastProd);
    state.shortGame = !!(payload && payload.shortGame);

    START_MONEY = Math.floor(Number(startMoney) || 10000);
    state.player.money = START_MONEY;
    state.enemy.money  = START_MONEY;


    const preloadImages = (window.OUPregame && typeof window.OUPregame.preloadImages === "function")
      ? window.OUPregame.preloadImages
      : async (urls) => {
          const list = Array.from(new Set((urls || []).filter(Boolean)));
          await Promise.all(list.map((u) => new Promise((res) => {
            try { const img = new Image(); img.decoding = "async"; img.onload = img.onerror = () => res(); img.src = u; }
            catch (_e) { res(); }
          })));
        };

    // Preload assets before starting (avoid first-hit flicker)
    try {
      if (window.PO && PO.buildings && typeof PO.buildings.preload === "function") {
        if (isCallable(__ou_ui, "setPregameLoading")){
          __ou_ui.setPregameLoading({ loading: true });
        }
        const imgUrls = [
          INF_IDLE_PNG, INF_ATK_PNG, INF_MOV_PNG, INF_MOV_NE_PNG, INF_MOV_N_PNG, INF_MOV_NW_PNG,
          INF_MOV_W_PNG, INF_MOV_SW_PNG, INF_MOV_S_PNG, INF_MOV_SE_PNG, INF_DIE_PNG,
          SNIP_IDLE_PNG, SNIP_MOV_PNG, SNIP_MOV_NE_PNG, SNIP_MOV_N_PNG, SNIP_MOV_NW_PNG,
          SNIP_MOV_W_PNG, SNIP_MOV_SW_PNG, SNIP_MOV_S_PNG, SNIP_MOV_SE_PNG, SNIP_DIE_PNG,
          REPAIR_WRENCH_PNG, EXP1_PNG, CON_YARD_PNG
        ];
        const exp1Promise = (window.OURender && typeof window.OURender.preloadExp1 === "function")
          ? window.OURender.preloadExp1() : Promise.resolve();
        await Promise.all([
          PO.buildings.preload(),
          preloadImages(imgUrls),
          exp1Promise,
          loadForestGround()
        ]);
        if (PO.buildings && typeof PO.buildings.prewarm === "function"){
          await PO.buildings.prewarm({ state, teams: [TEAM.PLAYER, TEAM.ENEMY], kinds: ["barracks", "power", "refinery"] });
        }
        if (isCallable(__ou_ui, "setPregameLoading")){
          __ou_ui.setPregameLoading({ loading: false });
        }
      } else {
        await loadForestGround();
      }
    } catch (e) {
      console.error("[preload] building assets failed", e);
      alert("Asset preload failed. Check DevTools Console/Network.\n" + (e && e.message ? e.message : e));
      if (isCallable(__ou_ui, "setPregameLoading")){
        __ou_ui.setPregameLoading({ loading: false, forceEnable: true });
      }
      return;
    }
    explored[TEAM.PLAYER].fill(0);
    explored[TEAM.ENEMY].fill(0);
    visible[TEAM.PLAYER].fill(0);
    visible[TEAM.ENEMY].fill(0);
    state._placeStartPhase = true;
    placeStart(spawnChoice);
    state._placeStartPhase = false;
    spawnStartingUnits();
    if (isCallable(__ou_ui, "hidePregame")){
      __ou_ui.hidePregame({});
    }
    if (pregameBGM && pregameBGM.stop) pregameBGM.stop();
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
    if (isCallable(__ou_ui, "setGameBrightness")){
      return __ou_ui.setGameBrightness(v);
    }
    return v;
  }
  // restore brightness (UI owns DOM/localStorage)
  try {
    if (isCallable(__ou_ui, "restoreGameBrightness")){
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

    if (isCallable(__ou_ui, "setPauseMenuVisible")){
      const getBright = ()=> isCallable(__ou_ui, "getGameBrightness")
        ? __ou_ui.getGameBrightness()
        : 1;
      __ou_ui.setPauseMenuVisible({ open: pauseMenuOpen, bgm: BGM, getBrightness: getBright });
      if (pauseMenuOpen && isCallable(__ou_ui, "wirePauseMenuUI")){
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

// Global ESC handler (capture): cancel repair/sell mode first, otherwise toggle pause/options
  document.addEventListener("keydown",(e)=>{
    const esc = (e.key==="Escape" || e.key==="Esc" || e.code==="Escape" || e.keyCode===27);
    if (!esc) return;
    if (state.mouseMode === "repair" || state.mouseMode === "sell"){
      applyMouseMode("normal");
      toast(L ? L("toast.repairSellOff") : "수리/매각 해제");
      e.preventDefault();
      e.stopImmediatePropagation();
      return;
    }
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
    // 모듈 참조로 검증 (window 전역 오염 방지)
    const checks = [
      ["setPathTo", ()=> isCallable(__ou_sim, "setPathTo")],
      ["findPath", ()=>typeof findPath==="function"],
      ["issueIFVRepair", ()=> isCallable(__ou_commands, "issueIFVRepair")],
      ["boardUnitIntoIFV", ()=> isCallable(__ou_commands, "boardUnitIntoIFV")],
      ["unboardIFV", ()=>typeof tryUnloadIFV==="function"],
      ["resolveUnitOverlaps", ()=> isCallable(__ou_sim, "resolveUnitOverlaps")]
    ];
    const missing = checks.filter(([,fn])=> !fn()).map(([n])=>n);
    if (missing.length){
      console.error("SanityCheck: missing module refs:", missing);
      toast(L ? L("toast.moduleValidationFailed").replace("{0}", missing.join(", ")) : "모듈 검증 실패: " + missing.join(", "));
    }
  }


  function tickBuildingSellFinalize(){
    const SELL_FINALIZE = [
      { kind: "barracks", selling: "_barrackSelling", finalizeAt: "_barrackSellFinalizeAt" },
      { kind: "power", selling: "_powerSelling", finalizeAt: "_powerSellFinalizeAt" },
      { kind: "refinery", selling: "_refinerySelling", finalizeAt: "_refinerySellFinalizeAt" }
    ];
    let needPower = false, needElim = false;
    for (const b of buildings){
      if (!b || !b.alive) continue;
      for (const cfg of SELL_FINALIZE){
        if (b.kind===cfg.kind && b[cfg.selling] && b[cfg.finalizeAt]!=null && state.t >= b[cfg.finalizeAt]){
          b.alive = false;
          state.selection.delete(b.id);
          setBuildingOcc(b, 0);
          needPower = needElim = true;
          break;
        }
      }
    }
    if (needPower) recomputePower();
    if (needElim) checkElimination();
  }

  function tickCameraInput(dt){
    const sp = cam.speed * dt;
    if (keys.has("arrowleft")) cam.x -= sp;
    if (keys.has("arrowright")) cam.x += sp;
    if (keys.has("arrowup")) cam.y -= sp;
    if (keys.has("arrowdown")) cam.y += sp;
    clampCamera();
  }

  function tick(now){
    fitCanvas();
    fitMini();

    const dt = Math.min(0.033, (now-last)/1000);
    last=now;

    if (state.gameOverFade){
      state.gameOverFade.t += dt;
      if (state.gameOverFade.t >= state.gameOverFade.dur){
        gameOver = true;
        running = false;
        const v = state.gameOverVictory;
        if (isCallable(__ou_ui, "showResultOverlay")){
          __ou_ui.showResultOverlay({ victory: v, stats: state.stats, gameTime: state.gameOverEndGameTime ?? state.t, colors: state.colors, bgm: BGM, victoryBgmTracks: ASSET.music.victory });
        } else { toast(L ? (v ? L("toast.victory") : L("toast.defeat")) : (v ? "승리!" : "패배...")); }
        state.gameOverFade = null;
      }
    } else if (running && !gameOver && !pauseMenuOpen){
      const speedMul = state.speedMul || 1;
      const simDt = dt * speedMul;
      state.t += simDt;

      if (state.gameOverPending && state.t >= state.gameOverPending.endT){
        state.gameOverFade = { t: 0, dur: GAMEOVER_FADE_DUR };
        state.gameOverVictory = state.gameOverPending.victory;
        state.gameOverEndGameTime = state.gameOverPending.endGameTime;
        state.gameOverPending = null;
      }

      tickBuildingSellFinalize();

      updateCamShake(simDt);
      if (window.FX && window.FX.updateSmoke) window.FX.updateSmoke(simDt);
      if (window.FX && window.FX.updateBlood) window.FX.updateBlood(simDt);
      tickCameraInput(dt);

      let _m0 = 0, _m1 = 0, _m2 = 0, _m3 = 0;
      if (DEBUG_MONEY && state && state.player) _m0 = state.player.money || 0;

      tickEconomyPre(simDt);

      if (DEBUG_MONEY && state && state.player) _m1 = state.player.money || 0;

      if (isCallable(__ou_ui, "updateSidebarButtons")) {
        try {
          __ou_ui.updateSidebarButtons({
            state,
            buildings: buildings,
            TEAM,
            prodCat,
            setProdCat,
            clamp,
            prodFIFO,
            NAME_KO,
            L
          });
        } catch (_e) {}
      }


      if (!state._visionFrame) state._visionFrame = 0;
      state._visionFrame++;
      // tick에서만 시야 갱신 (첫 프레임 + 2프레임마다)
      if (state._visionFrame === 1 || state._visionFrame % 2 === 0) updateVision();
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
      rebuildEntityByIdCache();
      if (isCallable(__ou_sim, "tickSim")){
        __ou_sim.tickSim(simDt);
      } else {
        // sim.js missing: avoid hard crash
        if (state && !state._simMissingWarned){
          state._simMissingWarned = true;
          console.warn("[ou_sim] missing: sim.js not loaded");
        }
      }

      // Swap-and-pop: O(1) per removal instead of splice O(n) - 유닛 수백 마리 시 GC 부담 완화
      let w = 0;
      for (let i = 0; i < units.length; i++) {
        if (units[i].alive) { if (w !== i) units[w] = units[i]; w++; }
      }
      units.length = w;
      w = 0;
      for (let i = 0; i < buildings.length; i++) {
        if (buildings[i].alive) { if (w !== i) buildings[w] = buildings[i]; w++; }
      }
      buildings.length = w;

      if (DEV_VALIDATE){
        state._valAcc = (state._valAcc || 0) + dt;
        if (state._valAcc >= 0.5){
          state._valAcc = 0;
          validateWorld();
        }
      }

      if (isCallable(__ou_ai, "tick")) __ou_ai.tick();
      checkElimination();
      recomputePower();
      updatePowerBar();
      updateSelectionUI();
      sanityCheck();
  setButtonText();

    // bind price tooltips (one-time)
  if (!state.__ui_bound_priceTips){
    state.__ui_bound_priceTips = true;
    if (isCallable(__ou_ui, "bindPriceTipsOnce")){
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
      if (isCallable(__ou_ui, "updateFps")){
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

function pushOrderFx(unitId, kind, x, y, targetId=null, color=null){
  if (window.FX && typeof window.FX.pushOrderFx === "function") window.FX.pushOrderFx(unitId, kind, x, y, targetId, color);
}

})();



























