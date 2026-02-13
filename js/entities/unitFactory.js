import { genId } from "./entityUtils.js";

export function spawnUnit(state, spec){
  const id = genId(state, "u");
  const unit = {
    id,
    type: spec.type ?? "inf",
    owner: spec.owner ?? state.players.self.id,
    x: spec.x ?? 0,
    y: spec.y ?? 0,
    vx: 0, vy: 0,
    hp: spec.hp ?? 100,
    maxHp: spec.maxHp ?? 100,
    targetId: null,
    path: null,
    radius: spec.radius ?? 12,
  };
  state.entities.units.set(id, unit);
  return unit;
}
