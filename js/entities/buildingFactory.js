import { genId } from "./entityUtils.js";

export function placeBuilding(state, spec){
  const id = genId(state, "b");
  const b = {
    id,
    type: spec.type ?? "hq",
    owner: spec.owner ?? state.players.self.id,
    tx: spec.tx ?? 0,
    ty: spec.ty ?? 0,
    w: spec.w ?? 2,
    h: spec.h ?? 2,
    hp: spec.hp ?? 500,
    maxHp: spec.maxHp ?? 500,
  };
  state.entities.buildings.set(id, b);
  return b;
}
