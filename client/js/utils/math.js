export function vecLen(x, y){ return Math.hypot(x, y); }
export function dist2(ax, ay, bx, by){
  const dx = bx-ax, dy = by-ay;
  return dx*dx + dy*dy;
}
export function norm2(x, y){
  const l = Math.hypot(x, y);
  if(l < 1e-8) return { x: 0, y: 0 };
  return { x: x/l, y: y/l };
}
