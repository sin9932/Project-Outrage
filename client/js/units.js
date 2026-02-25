/* Units system split-out file.
 * Edit THIS file when you want to tweak units (stats/names/registration).
 * game.js will read window.G.Units.UNIT / NAME_KO from here.
 */
(function(){
  const G = window.G = window.G || {};
  const Units = G.Units = G.Units || {};

  // --- Default Unit Specs (override by editing, or call Units.setTables) ---
  const DEFAULT_UNIT = {
    infantry: { r:17, hp:125, speed:200, range:330, dmg:12, rof:0.55, vision:420, hitscan:true,  cls:"inf" },
    engineer: { r:17, hp:100, speed:200, range:0,   dmg:0,  rof:0,    vision:420, cls:"inf" },
    sniper:   { r:17, hp:125, speed:170, range:1200, dmg:125, rof:2.20, vision:1200, hitscan:true,  cls:"inf", cloak:false },
    // NOTE: game.js uses kind==="tank" but shows name "경전차"
    tank:     { r:25, hp:400, speed:360, range:360, dmg:34, rof:0.90, vision:  680, hitscan:false, cls:"veh", spriteScale:2.0 },
    ifv:      { r:24, hp:200, speed:480, range:360, dmg:25, rof:0.85, vision: 520, hitscan:false, cls:"veh", transport:1 },
    harvester:{ r:28, hp:1000, speed:250, range:0,   dmg:0,  rof:0,    vision: 520, carryMax:1000, cls:"veh", spriteScale:3.0, spriteScaleX:3.0, spriteScaleY:2.1 }
  };

  const DEFAULT_NAME_KO = {
    hq:"건설소(HQ)", power:"발전소", refinery:"정제소", barracks:"막사",
    factory:"군수공장", radar:"레이더", turret:"터렛",
    infantry:"보병", engineer:"엔지니어", sniper:"저격병", tank:"경전차", ifv:"IFV", harvester:"굴착기"
  };

  // Keep references stable (game.js holds onto these objects)
  Units.UNIT = Units.UNIT || DEFAULT_UNIT;
  Units.NAME_KO = Units.NAME_KO || DEFAULT_NAME_KO;

  // --- Helpers ---
  Units.getSpec = function(kind){
    return (Units.UNIT && Units.UNIT[kind]) ? Units.UNIT[kind] : Units.UNIT.infantry;
  };

  Units.getName = function(kind){
    return (Units.NAME_KO && Units.NAME_KO[kind]) ? Units.NAME_KO[kind] : String(kind||"");
  };

  // Replace/merge tables safely
  Units.setTables = function(tables){
    if (!tables) return;
    if (tables.UNIT){
      for (const k in tables.UNIT) Units.UNIT[k] = tables.UNIT[k];
    }
    if (tables.NAME_KO){
      for (const k in tables.NAME_KO) Units.NAME_KO[k] = tables.NAME_KO[k];
    }
  };

  // Register a new unit kind quickly
  Units.register = function(kind, spec, nameKo){
    if (!kind) return;
    if (spec) Units.UNIT[kind] = spec;
    if (nameKo) Units.NAME_KO[kind] = nameKo;
  };

  // Turn/rotation helpers (tank hull + turret sprite frames)
  const _cwSeq = [6, 7, 0, 1, 2, 3, 4, 5];
  const _muzzleCwSeq = [2, 1, 0, 7, 6, 5, 4, 3];
  const _cwStartFrame = { 6: 1, 7: 5, 0: 9, 1: 13, 2: 17, 3: 21, 4: 25, 5: 29 };
  const _muzzleCwStartFrame = { 2: 1, 1: 5, 0: 9, 7: 13, 6: 17, 5: 21, 4: 25, 3: 29 };

  function _cwNextDir(d) {
    const i = _cwSeq.indexOf(d);
    return _cwSeq[(i + 1) & 7];
  }
  function _ccwPrevDir(d) {
    const i = _cwSeq.indexOf(d);
    return _cwSeq[(i + 7) & 7];
  }
  function _tankTurnFrameNum(fromDir, toDir, fi) {
    if (toDir === _cwNextDir(fromDir)) {
      const start = _cwStartFrame[fromDir] || 1;
      return start + fi;
    }
    if (toDir === _ccwPrevDir(fromDir)) {
      const prev = toDir;
      const start = _cwStartFrame[prev] || 1;
      return start + (3 - fi);
    }
    return null;
  }
  function _turretTurnFrameNum(fromDir, toDir, fi) {
    const a = _muzzleCwSeq.indexOf(fromDir);
    if (a < 0) return null;
    const next = _muzzleCwSeq[(a + 1) & 7];
    const prev = _muzzleCwSeq[(a + 7) & 7];
    if (toDir === next) {
      const start = _muzzleCwStartFrame[fromDir] || 1;
      return start + fi;
    }
    if (toDir === prev) {
      const start = _muzzleCwStartFrame[toDir] || 1;
      return start + (3 - fi);
    }
    return null;
  }
  function _turnStepTowardSeq(seq, fromDir, goalDir) {
    const a = seq.indexOf(fromDir);
    const b = seq.indexOf(goalDir);
    if (a < 0 || b < 0) return { nextDir: goalDir, stepDir: 1 };
    const cw = (b - a + 8) % 8;
    const ccw = (a - b + 8) % 8;
    if (cw <= ccw) return { nextDir: seq[(a + 1) & 7], stepDir: 1 };
    return { nextDir: seq[(a + 7) & 7], stepDir: -1 };
  }
  function _turnStepToward(fromDir, goalDir) {
    return _turnStepTowardSeq(_cwSeq, fromDir, goalDir);
  }
  function _turnStepTowardTurret(fromDir, goalDir) {
    return _turnStepTowardSeq(_muzzleCwSeq, fromDir, goalDir);
  }
  function _advanceTurnState(turn, fromDir, toDir, dt, frameDur, frameFn) {
    turn.t = (turn.t || 0) + dt;
    const fi = Math.min(3, Math.floor(turn.t / Math.max(0.001, frameDur)));
    const frameNum = (frameFn || _tankTurnFrameNum)(fromDir, toDir, fi);
    const done = turn.t >= frameDur * 4;
    return { done, frameNum };
  }
  function _tankUpdateHull(u, desiredDir, dt) {
    if (u.bodyDir == null) u.bodyDir = (u.dir != null ? u.dir : 6);
    if (desiredDir == null || desiredDir === u.bodyDir) {
      u.bodyTurn = null;
      return;
    }
    if (!u.bodyTurn || u.bodyTurn.fromDir == null || u.bodyTurn.toDir == null) {
      const step = _turnStepToward(u.bodyDir, desiredDir);
      u.bodyTurn = { fromDir: u.bodyDir, toDir: step.nextDir, stepDir: step.stepDir, t: 0 };
    }
    const { done, frameNum } = _advanceTurnState(u.bodyTurn, u.bodyTurn.fromDir, u.bodyTurn.toDir, dt, 0.055);
    u.bodyTurn.frameNum = frameNum;
    if (done) {
      u.bodyDir = u.bodyTurn.toDir;
      u.dir = u.bodyDir;
      u.bodyTurn = null;
    }
  }

  Units.createTurnHelpers = function () {
    return {
      _cwNextDir, _ccwPrevDir, _tankTurnFrameNum, _turretTurnFrameNum,
      _turnStepTowardSeq, _turnStepToward, _turnStepTowardTurret,
      _advanceTurnState, _tankUpdateHull
    };
  };

  // Optional hooks you can implement later:
  // Units.onSpawn = function(u, api){};
  // Units.preTick = function(state, dt, api){};
  // Units.tickUnit = function(u, state, dt, api){ return false; }; // return true if handled
  // Units.drawUnit = function(u, state, api){ return false; };     // return true if handled
})();
