import { genId } from "./entityUtils.js";
import { TEAM } from "../core/config.js";

export function placeBuilding(state, spec){
  const id = genId(state, "b");
  const b = {
    id,
    kind: spec.kind ?? spec.type ?? "hq",
    team: spec.team ?? TEAM.PLAYER,

    tx: spec.tx ?? 0,
    ty: spec.ty ?? 0,
    w: spec.w ?? 2,
    h: spec.h ?? 2,

    hp: spec.hp ?? 500,
    maxHp: spec.maxHp ?? 500,
    alive: true,
    attackable: spec.attackable ?? true,

    lastDamaged: 0,
    lastAttacker: null,
    lastAttackerTeam: null,
    lastAttackedAt: 0,
  };
  state.entities.buildings.set(id, b);
  return b;
}
