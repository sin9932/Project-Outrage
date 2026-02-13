import { vecLen, norm2 } from "../utils/math.js";

export function tickMovement(state, dt, bus){
  // Minimal movement: integrate velocity, follow simple path nodes if exists
  for(const u of state.entities.units.values()){
    if(u.path && u.path.length){
      const node = u.path[0];
      const dx = node.x - u.x;
      const dy = node.y - u.y;
      const dist = vecLen(dx, dy);

      const speed = 90; // px/s placeholder
      if(dist < 2){
        u.path.shift();
        u.vx = 0; u.vy = 0;
      }else{
        const n = norm2(dx, dy);
        u.vx = n.x * speed;
        u.vy = n.y * speed;
      }
    }

    u.x += u.vx * dt;
    u.y += u.vy * dt;
  }
}
