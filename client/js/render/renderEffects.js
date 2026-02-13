export function renderEffects(state){
  // minimal bullet dots
  const ctx = state.view.ctx;
  ctx.fillStyle = "#ffe08a";
  for(const b of state.bullets.list){
    ctx.fillRect(b.x-1, b.y-1, 2, 2);
  }
}
