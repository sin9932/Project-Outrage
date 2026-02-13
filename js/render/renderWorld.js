import { CONFIG } from "../core/config.js";

export function renderWorld(state){
  const ctx = state.view.ctx;
  const { w, h } = state.view;

  // background
  ctx.fillStyle = CONFIG.render.bg;
  ctx.fillRect(0, 0, w, h);

  // grid (debug)
  if(CONFIG.render.grid){
    const ts = state.world.tileSize;
    ctx.globalAlpha = 0.12;
    ctx.strokeStyle = "#ffffff";
    ctx.beginPath();
    for(let x=0; x<w; x+=ts){ ctx.moveTo(x,0); ctx.lineTo(x,h); }
    for(let y=0; y<h; y+=ts){ ctx.moveTo(0,y); ctx.lineTo(w,y); }
    ctx.stroke();
    ctx.globalAlpha = 1.0;
  }

  // buildings (tile-rect)
  const ts = state.world.tileSize;
  for(const b of state.entities.buildings.values()){
    if(b.alive === false) continue;
    ctx.fillStyle = "#2b3a4c";
    ctx.fillRect(b.tx*ts, b.ty*ts, b.w*ts, b.h*ts);
    ctx.strokeStyle = "#7f8a96";
    ctx.strokeRect(b.tx*ts+0.5, b.ty*ts+0.5, b.w*ts-1, b.h*ts-1);
  }

  // units
  for(const u of state.entities.units.values()){
    if(u.alive === false) continue;
    ctx.fillStyle = (u.team === 0) ? state.players.self.color : state.players.enemy.color;
    ctx.beginPath();
    ctx.arc(u.x, u.y, u.radius, 0, Math.PI*2);
    ctx.fill();
  }
}
