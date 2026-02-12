/* Units system split-out file.
 * Edit THIS file when you want to tweak units (stats/names/registration).
 * game.js will read window.G.Units.UNIT / NAME_KO from here.
 */
(function(){
  const G = window.G = window.G || {};
  const Units = G.Units = G.Units || {};

  // --- Default Unit Specs (override by editing, or call Units.setTables) ---
  const DEFAULT_UNIT = {
    infantry: { r:17, hp:125, speed:230, range:330, dmg:15, rof:0.55, vision:420, hitscan:true,  cls:"inf" },
    engineer: { r:17, hp:100, speed:272, range:0,   dmg:0,  rof:0,    vision:420, cls:"inf" },
    sniper:   { r:17, hp:125, speed:205, range:1200, dmg:125, rof:2.20, vision:1200, hitscan:true,  cls:"inf", cloak:false },
    // NOTE: game.js uses kind==="tank" but shows name "경전차"
    tank:     { r:25, hp:400, speed:320, range:360, dmg:34, rof:0.90, vision:  680, hitscan:false, cls:"veh", spriteScale:2.0 },
    ifv:      { r:24, hp:200, speed:480, range:360, dmg:25, rof:0.85, vision: 520, hitscan:false, cls:"veh", transport:1 },
    harvester:{ r:28, hp:1000, speed:250, range:0,   dmg:0,  rof:0,    vision: 520, carryMax:1000, cls:"veh", spriteScale:3.5,spriteScaleX:3.5,spriteScaleY:2.6 }
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

  // Optional hooks you can implement later:
  // Units.onSpawn = function(u, api){};
  // Units.preTick = function(state, dt, api){};
  // Units.tickUnit = function(u, state, dt, api){ return false; }; // return true if handled
  // Units.drawUnit = function(u, state, api){ return false; };     // return true if handled
})();
