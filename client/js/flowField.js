/* flowField.js
   Flow Field pathfinding for group movement.
   - computeFlowField: BFS from goal, returns cost + flow vectors per tile.
   - Used when many units share same goal (replaces N×A* with 1×BFS).
*/
(function (global) {
  "use strict";

  const OUFlowField = global.OUFlowField || (global.OUFlowField = {});

  /** 8방향: E, NE, N, NW, W, SW, S, SE. dx, dy, cost. uniform cost로 BFS 정확도 보장 */
  const DIRS = [
    [1, 0, 1], [1, -1, 1], [0, -1, 1], [-1, -1, 1],
    [-1, 0, 1], [-1, 1, 1], [0, 1, 1], [1, 1, 1]
  ];

  /**
   * Compute flow field from goal (gTx, gTy).
   * @param {number} gTx - goal tile x
   * @param {number} gTy - goal tile y
   * @param {number} MAP_W
   * @param {number} MAP_H
   * @param {(tx:number, ty:number)=>boolean} isWalkableTile
   * @param {(tx:number, ty:number)=>boolean} inMap
   * @returns {{ cost: Uint16Array, flow: Int8Array } | null} cost[idx]=거리, flow[idx]=방향인덱스(0~7), 도달불가=-1
   */
  OUFlowField.computeFlowField = function computeFlowField(gTx, gTy, MAP_W, MAP_H, isWalkableTile, inMap) {
    if (!inMap(gTx, gTy) || !isWalkableTile(gTx, gTy)) return null;

    const N = MAP_W * MAP_H;
    const INF = 0xFFFF;
    const cost = new Uint16Array(N);
    const flow = new Int8Array(N);
    for (let i = 0; i < N; i++) { cost[i] = INF; flow[i] = -1; }

    const g = gTy * MAP_W + gTx;
    cost[g] = 0;
    flow[g] = 0;

    const queue = [];
    let head = 0;
    queue.push(g);

    while (head < queue.length) {
      const cur = queue[head++];
      const cx = cur % MAP_W;
      const cy = (cur / MAP_W) | 0;
      const cCost = cost[cur];

      for (let di = 0; di < DIRS.length; di++) {
        const dx = DIRS[di][0], dy = DIRS[di][1], step = DIRS[di][2];
        const nx = cx + dx, ny = cy + dy;
        if (!inMap(nx, ny)) continue;
        if (!isWalkableTile(nx, ny)) continue;
        if (dx !== 0 && dy !== 0) {
          if (!isWalkableTile(cx + dx, cy) || !isWalkableTile(cx, cy + dy)) continue;
        }
        const ni = ny * MAP_W + nx;
        const tent = cCost + step;
        if (tent < cost[ni]) {
          cost[ni] = tent;
          queue.push(ni);
        }
      }
    }

    for (let ty = 0; ty < MAP_H; ty++) {
      for (let tx = 0; tx < MAP_W; tx++) {
        const i = ty * MAP_W + tx;
        if (cost[i] === INF) continue;
        if (i === g) { flow[i] = 0; continue; }

        let bestDi = -1, bestCost = cost[i];
        for (let di = 0; di < DIRS.length; di++) {
          const dx = DIRS[di][0], dy = DIRS[di][1];
          const nx = tx + dx, ny = ty + dy;
          if (!inMap(nx, ny)) continue;
          const ni = ny * MAP_W + nx;
          if (cost[ni] < bestCost) {
            bestCost = cost[ni];
            bestDi = di;
          }
        }
        flow[i] = bestDi >= 0 ? bestDi : 0;
      }
    }

    return { cost, flow, gTx, gTy, MAP_W, MAP_H };
  };

  /**
   * Get flow direction (dx, dy) for world position.
   * @param {{ cost, flow, MAP_W, MAP_H }} field
   * @param {number} wx - world x
   * @param {number} wy - world y
   * @param {number} TILE
   * @param {(x:number)=>number} tileOfX
   * @param {(y:number)=>number} tileOfY
   * @returns {{ dx: number, dy: number } | null}
   */
  OUFlowField.getFlowAt = function getFlowAt(field, wx, wy, TILE, tileOfX, tileOfY) {
    if (!field || !field.flow) return null;
    const tx = tileOfX(wx);
    const ty = tileOfY(wy);
    if (tx < 0 || ty < 0 || tx >= field.MAP_W || ty >= field.MAP_H) return null;
    if (tx === field.gTx && ty === field.gTy) return { dx: 0, dy: 0 };
    const i = ty * field.MAP_W + tx;
    const di = field.flow[i];
    if (di < 0) return null;
    const d = DIRS[di];
    const len = Math.hypot(d[0], d[1]) || 1;
    return { dx: d[0] / len, dy: d[1] / len };
  };

})(typeof window !== "undefined" ? window : globalThis);
