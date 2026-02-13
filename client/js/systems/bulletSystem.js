import { TEAM, BUILD } from "../core/config.js";
import { dist2 } from "../utils/math.js";

// Legacy BulletSystem registers itself on window.BulletSystem (loaded via js/legacy/index.js).
function handleEntityDeath(state, ent){
  if(!ent || !ent.alive) return;
  ent.alive = false;
  state.entities.deadQueue.push(ent.id);
}

function notifyPlayerAttacked(state, ent){
  // Minimal UI hook. You can route this through renderUI later.
  const name = ent?.kind ?? "entity";
  state.ui.toast.text = `공격받음: ${name}`;
  state.ui.toast.until = performance.now() + 1500;
}

function makeContext(state){
  return {
    TEAM,
    BUILD,
    dist2,
    units: state.entities.units.values(),
    buildings: state.entities.buildings.values(),
    state: { t: state.sim.t },
    handleEntityDeath: (ent)=>handleEntityDeath(state, ent),
    notifyPlayerAttacked: (ent)=>notifyPlayerAttacked(state, ent),
  };
}

export function tickBullets(state, dt, bus){
  void bus;
  const BS = window.BulletSystem;
  if(!BS || typeof BS.tickBullets !== "function") return;

  const C = makeContext(state);
  BS.tickBullets(dt, C);
}

export function applyDamage(state, target, dmg, srcId=null, srcTeam=null){
  const BS = window.BulletSystem;
  if(!BS || typeof BS.applyDamage !== "function") return;
  const C = makeContext(state);
  BS.applyDamage(target, dmg, srcId, srcTeam, C);
}

export function applyAreaDamageAt(state, x, y, radius, dmg, srcId=null, srcTeam=null){
  const BS = window.BulletSystem;
  if(!BS || typeof BS.applyAreaDamageAt !== "function") return;
  const C = makeContext(state);
  BS.applyAreaDamageAt(x, y, radius, dmg, srcId, srcTeam, C);
}
