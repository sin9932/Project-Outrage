import { dist2, norm2 } from "../utils/math.js";

export function tickBullets(state, dt, bus){
  // Minimal bullets: move and expire
  const out = [];
  for(const b of state.bullets.list){
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.life -= dt;
    if(b.life > 0) out.push(b);
  }
  state.bullets.list = out;
}

export function spawnBullet(state, spec){
  const dx = spec.tx - spec.x;
  const dy = spec.ty - spec.y;
  const n = norm2(dx, dy);
  const speed = spec.speed ?? 420;

  state.bullets.list.push({
    x: spec.x, y: spec.y,
    vx: n.x * speed,
    vy: n.y * speed,
    life: spec.life ?? 0.8,
  });
}
