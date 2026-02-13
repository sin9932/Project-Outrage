export function tickDeath(state, dt, bus){
  void dt; void bus;
  // Remove queued dead entities from maps
  if(state.entities.deadQueue.length === 0) return;

  for(const id of state.entities.deadQueue){
    state.entities.units.delete(id);
    state.entities.buildings.delete(id);
    state.ui.selected.delete(id);
  }
  state.entities.deadQueue.length = 0;
}
