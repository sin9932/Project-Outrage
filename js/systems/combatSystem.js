import { dist2 } from "../utils/math.js";

export function tickCombat(state, dt, bus){
  // Stub: no real combat yet. This is where target selection + fire events live.
  // Example pattern:
  // bus.emit("bullet:spawn", { from: u.id, to: target.id, ... })
  void dt; void bus;
  for(const u of state.entities.units.values()){
    if(!u.targetId) continue;
    const t = state.entities.units.get(u.targetId) || state.entities.buildings.get(u.targetId);
    if(!t) { u.targetId = null; continue; }

    const d = dist2(u.x, u.y, t.x ?? (t.tx*state.world.tileSize), t.y ?? (t.ty*state.world.tileSize));
    if(d > 240*240){
      // out of range
    }
  }
}
