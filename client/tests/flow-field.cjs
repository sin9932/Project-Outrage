const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const context = vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/flowField.js'), 'utf8'), context);
const F = context.OUFlowField;
const fixtures = [
  // Former extraction picked south-east at (3,0), cutting through the wall at (4,0).
  ['....#..', '##.....', '.......', '.#...#.', '#..##..', '#......', '...#...'],
  ['.......', '..##...', '...#...', '...#...', '.......', '.......', '.......'],
  ['....#..', '.##.#..', '.#..#..', '.#..#..', '.#.....', '.#####.', '.......'],
  ['.......', '.###...', '.#.#...', '.###...', '.......', '.......', '.......']
];
let routes = 0;
for (const map of fixtures) {
  const width = map[0].length, height = map.length;
  const inMap = (x, y) => x >= 0 && y >= 0 && x < width && y < height;
  const walkable = (x, y) => inMap(x, y) && map[y][x] === '.';
  const field = F.computeFlowField(width - 1, height - 1, width, height, walkable, inMap);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    if (!walkable(x, y) || field.cost[y * width + x] === 65535) continue;
    let px = x, py = y, arrived = false;
    for (let step = 0; step < width * height; step++) {
      const direction = F.getFlowAt(field, px + .5, py + .5, 1, Math.floor, Math.floor);
      assert(direction, `Reachable tile ${px},${py} has no direction`);
      if (direction.dx === 0 && direction.dy === 0) { arrived = px === width - 1 && py === height - 1; break; }
      const dx = Math.sign(direction.dx), dy = Math.sign(direction.dy);
      assert(walkable(px + dx, py + dy), `Flow entered obstacle from ${px},${py}`);
      if (dx && dy) assert(walkable(px + dx, py) && walkable(px, py + dy), `Flow cut blocked corner from ${px},${py}`);
      px += dx; py += dy;
    }
    assert(arrived, `Flow from ${x},${y} looped or stopped before goal`);
    routes++;
  }
}
console.log('FLOW_FIELD_TRAVERSABLE_ROUTES_PASS', routes);
const goalField = F.computeFlowField(2, 2, 5, 5, () => true, (x, y) => x >= 0 && y >= 0 && x < 5 && y < 5);
const cell = value => Math.floor(value / 110);
for (const [x, y] of [[221, 275], [329, 275], [275, 221], [275, 329], [225, 325]]) {
  const towardCenter = F.getFlowAt(goalField, x, y, 110, cell, cell);
  assert(towardCenter && Math.hypot(towardCenter.dx, towardCenter.dy) > .99, 'Flow stopped upon entering goal tile before its center');
  const dx = 275 - x, dy = 275 - y, distance = Math.hypot(dx, dy);
  assert(Math.abs(towardCenter.dx - dx / distance) < 1e-9 && Math.abs(towardCenter.dy - dy / distance) < 1e-9,
    'Final flow direction does not point to goal center');
}
const atCenter = F.getFlowAt(goalField, 275, 275, 110, cell, cell);
assert.equal(atCenter.dx, 0); assert.equal(atCenter.dy, 0);
console.log('FLOW_FIELD_EXACT_GOAL_CENTER_PASS');
