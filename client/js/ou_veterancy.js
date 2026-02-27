// ou_veterancy.js - 레드얼럿2 스타일 승진 시스템 (보병/저격병)
// game.js에 넣지 않고 별도 모듈로 분리

(function (global) {
  "use strict";

  const OUVeterancy = global.OUVeterancy || (global.OUVeterancy = {});

  OUVeterancy.create = function create(refs) {
    const r = refs || {};
    const getEntityById = r.getEntityById || (() => null);
    const COST = r.COST || { infantry: 100, sniper: 600, tank: 900, ifv: 600, harvester: 2450 };

    const VETERAN_RATIO = 3;
    // RA2 공식 수치 (rulesmd.ini): 베테랑/엘리트 동일, 스택 안 함
    const VETERAN_COMBAT = 1.1;
    const VETERAN_ROF = 0.6;
    const VETERAN_ARMOR = 1.5;
    const VETERAN_SPEED = 1.2;
    const ELITE_COMBAT = 1.1;
    const ELITE_ROF = 0.6;
    const ELITE_ARMOR = 1.5;
    const ELITE_SPEED = 1.2;
    const ELITE_HEAL_RATE = 8;

    function getVeteranUnit(u) {
      if (!u) return null;
      if (u.kind === "ifv" && u.passengerId && (u.passKind === "infantry" || u.passKind === "sniper")) {
        const p = getEntityById(u.passengerId);
        return p && p.alive ? p : u;
      }
      return u;
    }

    function getVeteranRank(u) {
      const v = getVeteranUnit(u);
      if (!v) return 0;
      if (v.kind === "infantry" || v.kind === "sniper") return v.veteran || 0;
      if (v.kind === "tank" || v.kind === "ifv" || v.kind === "harvester") return v.veteran || 0;
      return 0;
    }

    function getVeteranCombat(u) {
      const r = getVeteranRank(u);
      return r >= 2 ? ELITE_COMBAT : r >= 1 ? VETERAN_COMBAT : 1;
    }

    function getVeteranROF(u) {
      const r = getVeteranRank(u);
      return r >= 2 ? ELITE_ROF : r >= 1 ? VETERAN_ROF : 1;
    }

    function getVeteranArmor(u) {
      const r = getVeteranRank(u);
      return r >= 2 ? ELITE_ARMOR : r >= 1 ? VETERAN_ARMOR : 1;
    }

    function getVeteranSpeed(u) {
      const r = getVeteranRank(u);
      return r >= 2 ? ELITE_SPEED : r >= 1 ? VETERAN_SPEED : 1;
    }

    function applyEliteHeal(u, dt) {
      if (!u || !u.alive) return;
      if (u.veteran !== 2 || (u.kind !== "infantry" && u.kind !== "sniper")) return;
      const max = u.hpMax || 100;
      if (u.hp >= max) return;
      u.hp = Math.min(max, u.hp + ELITE_HEAL_RATE * dt);
    }

    function grantVeteranExp(killer, victimCost, now, victimTeam) {
      if (!killer || !killer.alive) return;
      if (victimTeam != null && killer.team === victimTeam) return;
      const v = getVeteranUnit(killer);
      if (!v) return;
      const canVet = v.kind === "infantry" || v.kind === "sniper" || v.kind === "tank" || v.kind === "ifv" || v.kind === "harvester";
      if (!canVet) return;
      if (v.veteran >= 2) return;
      const cost = COST[v.kind] || 100;
      const need = cost * VETERAN_RATIO + 1;
      v.veteranExp = (v.veteranExp || 0) + victimCost;
      while (v.veteranExp >= need && v.veteran < 2) {
        v.veteranExp -= need;
        v.veteran = (v.veteran || 0) + 1;
        if (v.veteran >= 2) v.eliteFlashUntil = (now || 0) + 1.5;
      }
    }

    const api = {
      getVeteranUnit,
      getVeteranRank,
      getVeteranCombat,
      getVeteranROF,
      getVeteranArmor,
      getVeteranSpeed,
      grantVeteranExp,
      applyEliteHeal,
      ELITE_HEAL_RATE
    };
    if (typeof global !== "undefined") global.__ou_veterancy = api;
    if (typeof window !== "undefined") window.__ou_veterancy = api;
    return api;
  };
})(window);
