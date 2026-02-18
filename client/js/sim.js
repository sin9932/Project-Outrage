// sim.js
// - Simulation tick wrapper (movement/attack/collision step orchestration)
// - Keep this file logic-light; game.js provides the actual tick functions.

(function (global) {
  "use strict";

  const OUSim = global.OUSim || (global.OUSim = {});

  OUSim.create = function create(refs) {
    const r = refs || {};

    function tickSim(dt) {
      if (typeof r.tickUnits === "function") r.tickUnits(dt);
      if (typeof r.tickTurrets === "function") r.tickTurrets(dt);
      if (typeof r.tickBullets === "function") r.tickBullets(dt);
    }

    return {
      tickSim
    };
  };
})(window);

