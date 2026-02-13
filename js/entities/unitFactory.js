import { genId } from "./entityUtils.js";
import { TEAM } from "../core/config.js";

// Minimal factory: keeps fields compatible with legacy BulletSystem (alive/team/kind/hp).
export function spawnUnit(state, spec){
  const id = genId(state, "u");
  const unit = {
    id,
    kind: spec.kind ?? spec.type ?? "inf",
    team: spec.team ?? TEAM.PLAYER,

    x: spec.x ?? 0,
    y: spec.y ?? 0,
    vx: 0, vy: 0,

    hp: spec.hp ?? 100,
    maxHp: spec.maxHp ?? 100,
    alive: true,
    attackable: spec.attackable ?? true,

    targetId: null,
    path: null,
    radius: spec.radius ?? 12,

    // legacy combat flags (optional)
    lastDamaged: 0,
    lastAttacker: null,
    lastAttackerTeam: null,
    lastAttackedAt: 0,
  };

  state.entities.units.set(id, unit);
  return unit;
}
