export function tickDeath(state, dt, bus){
  void dt; void bus;
  // remove dead units queued by combat/bullets
  if(state.entities.deadQueue.length === 0) return;
  for(const id of state.entities.deadQueue){
    state.entities.units.delete(id);
    state.entities.buildings.delete(id);
  }
  state.entities.deadQueue.length = 0;
}
