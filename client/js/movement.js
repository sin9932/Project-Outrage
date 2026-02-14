(function(){

// movement.js (split from game.js)

function aStarPath(sx,sy,gx,gy, maxNodes=12000){
    if (!inMap(sx,sy) || !inMap(gx,gy)) return null;
    if (!isWalkableTile(gx,gy)) return null;

    const W=MAP_W, H=MAP_H;
    const N=W*H;

    const open = new Int32Array(N);
    let openN=0;

    const inOpen = new Uint8Array(N);
    const closed = new Uint8Array(N);
    const gScore = new Int32Array(N);
    const fScore = new Int32Array(N);
    const came = new Int32Array(N);

    for (let i=0;i<N;i++){ gScore[i]=1e9; fScore[i]=1e9; came[i]=-1; }

    const s = sy*W+sx;
    const g = gy*W+gx;

    gScore[s]=0;
    fScore[s]=heuristic(sx,sy,gx,gy);
    open[openN++]=s;
    inOpen[s]=1;

    const dirs = [
        [ 1, 0, 10],[-1, 0, 10],[ 0, 1, 10],[ 0,-1, 10],
        [ 1, 1, 14],[ 1,-1, 14],[-1, 1, 14],[-1,-1, 14],
      ];
    let nodes=0;

    while (openN>0 && nodes<maxNodes){
      nodes++;

      let bestI=0;
      let bestF=fScore[open[0]];
      for (let i=1;i<openN;i++){
        const n=open[i];
        const f=fScore[n];
        if (f<bestF){ bestF=f; bestI=i; }
      }
      const cur = open[bestI];
      open[bestI]=open[--openN];
      inOpen[cur]=0;

      if (cur===g) break;
      closed[cur]=1;

      const cx=cur%W, cy=(cur/W)|0;

      for (const [dx,dy,cost] of dirs){
        const nx=cx+dx, ny=cy+dy;
        if (!inMap(nx,ny)) continue;

        // Prevent "corner cutting" when moving diagonally past blocked tiles.
        if (dx!==0 && dy!==0){
          if (!isWalkableTile(cx+dx, cy) || !isWalkableTile(cx, cy+dy)) continue;
        }

        const ni=ny*W+nx;
        if (closed[ni]) continue;
        if (!isWalkableTile(nx,ny)) continue;

        const tent = gScore[cur] + cost;
        if (tent < gScore[ni]){
          came[ni]=cur;
          gScore[ni]=tent;
          fScore[ni]=tent + heuristic(nx,ny,gx,gy);
          if (!inOpen[ni]){
            open[openN++]=ni;
            inOpen[ni]=1;
            if (openN>=N-4) break;
          }
        }
      }
    }

    if (came[g]===-1 && g!==s) return null;

    const path=[];
    let cur=g;
    path.push(cur);
    while (cur!==s){
      cur=came[cur];
      if (cur===-1) break;
      path.push(cur);
    }
    path.reverse();

    const out=[];
    let last=-1;
    for (let i=0;i<path.length;i++){
      const n=path[i];
      if (n===last) continue;
      last=n;
      out.push({tx:n%W, ty:(n/W)|0});
    }
    return out;
  }

function findPath(sx,sy,gx,gy){
    return aStarPath(sx,sy,gx,gy);
  }

function followPath(u, dt){
    // HARD STOP: if unit is effectively idle/guard with no target, it must not drift.
    if (u && u.order && (u.order.type==="idle" || u.order.type==="guard") && u.target==null){
      if (u.path){ u.path = null; u.pathI = 0; }
      u.stuckT = 0; u.yieldCd = 0;
      return false;
    }
    if (!u.path || u.pathI >= u.path.length){
      // If we have a move-like order but no path (e.g., path consumed or cleared), finalize when close enough.
      const ot = (u.order && u.order.type) ? u.order.type : null;
      if (ot==="move" || ot==="guard_return" || ot==="attackmove"){
        const gx = (u.order && u.order.x!=null) ? u.order.x : u.x;
        const gy = (u.order && u.order.y!=null) ? u.order.y : u.y;
        const d2 = dist2(u.x,u.y,gx,gy);
        if (d2 < 16*16){
          // snap and stop: prevents 'moving-but-not-moving' vibration after arrival
          u.x = gx; u.y = gy;
          u.vx = 0; u.vy = 0;
          u.path = null; u.pathI = 0;
          clearReservation(u);
          if (ot==="attackmove"){
            u.guard = {x0:u.x, y0:u.y};
            u.order = {type:"guard", x:u.x, y:u.y, tx:null, ty:null};
            } else {
            u.order = {type:"idle", x:u.x, y:u.y, tx:null, ty:null};
          }
          return false;
        }
      }
      return false;
    }
    if (u.yieldCd && u.yieldCd>0){ u.yieldCd -= dt; if (u.yieldCd>0) return false; u.yieldCd=0; }

    const p = u.path[u.pathI];
    // Waypoint world target
let wx = (p.tx+0.5)*TILE, wy=(p.ty+0.5)*TILE;

// RA2-feel queueing for infantry:
// Instead of having everyone steer to tile center (then push/correct/jitter),
// pick a temporary sub-slot for the NEXT waypoint tile. If no slot is available, WAIT.
if (u.cls==="inf"){
  const ni = idx(p.tx,p.ty);
  let mask = (u.team===0) ? infSlotMask0[ni] : infSlotMask1[ni];

  // keep a short-lived nav slot lock to avoid per-frame slot thrash
  if (u.navSlotLockT && u.navSlotLockT>0){
    u.navSlotLockT -= dt;
    if (u.navSlotLockT<=0){ u.navSlotLockT=0; }
  }

  let slot = -1;
  if (u.navSlot!=null && u.navSlotTx===p.tx && u.navSlotTy===p.ty && u.navSlotLockT>0){
    slot = (u.navSlot & 3);
  } else {
    for (let s=0; s<4; s++){
      if (((mask>>s)&1)===0){ slot = s; break; }
    }
    if (slot>=0){
      u.navSlot = slot; u.navSlotTx = p.tx; u.navSlotTy = p.ty;
      u.navSlotLockT = 0.25; // seconds
    }
  }

  if (slot<0){
    // Tile is temporarily full: don't oscillate, just queue behind.
    u.vx = 0; u.vy = 0;
    u.queueWaitT = (u.queueWaitT||0) + dt;

    // If we have been waiting too long, allow bypass logic below to kick in.
    // But for short waits, returning here prevents "부들부들".
    if (u.queueWaitT < 0.35) return false;
  } else {
    u.queueWaitT = 0;
    const sp = tileToWorldSubslot(p.tx, p.ty, slot);
    wx = sp.x; wy = sp.y;
  }
}


    // HARD HOLD: if infantry is already locked to its sub-slot in this tile, don't keep steering.
    if (u.cls==="inf" && u.holdPos && tileOfX(u.x)===p.tx && tileOfY(u.y)===p.ty) return false;

    // Reservation + capacity: prevents multiple units trying to occupy the same tile-center,
    // which caused circular "강강수월래" orbiting at diamond corners.
    const curTx = tileOfX(u.x), curTy = tileOfY(u.y);
    if (!(p.tx===curTx && p.ty===curTy)){
      const _tGoal = (u && u.target!=null) ? getEntityById(u.target) : null;
      const _combatOrder = (u && u.order && (u.order.type==="attack" || u.order.type==="attackmove"));
      const _canEnter = (_combatOrder && _tGoal && BUILD[_tGoal.kind]) ? canEnterTileGoal(u, p.tx, p.ty, _tGoal) : canEnterTile(u, p.tx, p.ty);
      if (!_canEnter || !reserveTile(u, p.tx, p.ty)) {
        // FINAL-TILE RETARGET: if our destination tile is occupied/reserved, pick a nearby free tile once.
        // This prevents late arrivals from 'dancing' in place trying to steal an already-occupied tile.
        if (u.pathI >= (u.path.length-1)) {
          u.finalBlockT = (u.finalBlockT||0) + dt;
          if (u.finalBlockT > 0.22 && (u.lastRetargetT==null || (state.t - u.lastRetargetT) > 0.85)) {
            const goalWx = (p.tx+0.5)*TILE, goalWy = (p.ty+0.5)*TILE;
            const spot = findNearestFreePoint(goalWx, goalWy, u, 2);
            const nTx = tileOfX(spot.x), nTy = tileOfY(spot.y);
            if ((nTx!==p.tx || nTy!==p.ty) && canEnterTile(u, nTx, nTy) && reserveTile(u, nTx, nTy)) {
              const wp2 = tileToWorldCenter(nTx, nTy);
              u.order = {type:(u.order && u.order.type) ? u.order.type : "move", x:wp2.x, y:wp2.y, tx:nTx, ty:nTy};
              setPathTo(u, wp2.x, wp2.y);
              u.lastRetargetT = state.t;
              u.finalBlockT = 0;
              return true;
            }
          }
        }

        const step = findBypassStep(u, curTx, curTy, p.tx, p.ty);
        if (step && reserveTile(u, step.tx, step.ty)){
          // Inject a temporary one-step path.
          u.path = [{tx:step.tx, ty:step.ty}, ...u.path.slice(u.pathI)];
          u.pathI = 0;
          return true;
        }
        // Wait a bit and try again next tick. If we keep failing, settle instead of vibrating.
        u.blockT = (u.blockT||0) + dt;
        if (u.blockT > 0.85){
          const cwx=(curTx+0.5)*TILE, cwy=(curTy+0.5)*TILE;
          u.x=cwx; u.y=cwy;

          // IMPORTANT: never drop into idle while we still have a combat target/order.
          // Doing so caused backliners to "dance" forever when attacking buildings (path nodes rejected as blocked).
          const _combatLocked = (u.target!=null && u.order && (u.order.type==="attack" || u.order.type==="attackmove"));
          if (_combatLocked){
            u.path=null; u.pathI=0;
            clearReservation(u);
            u.yieldCd=0;
            u.blockT=0;
            u.repathCd = 0; // force immediate replanning in combat logic
            u.combatGoalT = 0;
            return false;
          }

          u.order = {type:"idle", x:u.x, y:u.y, tx:null, ty:null};
          u.path=null; u.pathI=0;
          clearReservation(u);
          u.yieldCd=0;
          u.blockT=0;
          return false;
        }
        u.yieldCd = 0.10;
        return false;
      }
    }

    const dx=wx-u.x, dy=wy-u.y;
    const d=Math.hypot(dx,dy);

    
    // Strong anti-jam: soft separation and stuck recovery.
    if (u.stuckT==null){ u.stuckT=0; u.lastX=u.x; u.lastY=u.y; }


    // Arrival threshold: allow a small epsilon on the final node so avoidance steering doesn't cause endless micro-dancing.
    if (d < 2 || (u.pathI >= (u.path.length-1) && d < 12)){
      // Reduce "tile-by-tile fidget": only hard-snap on the FINAL node.
      if (u.pathI >= (u.path.length-1)){
        if (u.cls==="inf"){
  // Prefer the destination slot assigned at command time (prevents "everyone rushes tile center" jitter).
  let slot = (u.order && u.order.tx===p.tx && u.order.ty===p.ty && u.order.subSlot!=null) ? (u.order.subSlot|0) : (u.subSlot|0);
  const sp = tileToWorldSubslot(p.tx, p.ty, slot);
  u.x = sp.x; u.y = sp.y;
          u.vx = 0; u.vy = 0;
          u.holdPos = true;
        } else {
          const sx = (p.tx+0.5)*TILE, sy = (p.ty+0.5)*TILE;
          u.x = sx; u.y = sy;
        }
      }
      if (!(u.cls==="inf" && u.pathI >= (u.path.length-1))) u.holdPos = false;
      u.pathI++;
      clearReservation(u);
      // If we consumed the last waypoint, finalize the order right here.
      if (u.pathI >= u.path.length){
        const ot2 = (u.order && u.order.type) ? u.order.type : null;
        // Stop residual velocity to avoid micro-corrections turning into jitter.
        u.vx = 0; u.vy = 0;
        u.path = null; u.pathI = 0;
        clearReservation(u);
        if (ot2==="attackmove"){
          u.guard = {x0:u.x, y0:u.y};
          u.order = {type:"guard", x:u.x, y:u.y, tx:null, ty:null};
        } else if (ot2==="move" || ot2==="guard_return"){
          u.order = {type:"idle", x:u.x, y:u.y, tx:null, ty:null};
        }
      }
      u.blockT = 0;
      u.stuckT = 0;
      return true;
    }


    const curTileTx=tileOfX(u.x), curTileTy=tileOfY(u.y);
    if (u.pathI>0){
      const nextTile = u.path[u.pathI];
      if (!(nextTile.tx===curTileTx && nextTile.ty===curTileTy)){
        // Try to reserve the next tile to avoid head-on deadlocks.
        if (!reserveTile(u, nextTile.tx, nextTile.ty) || isReservedByOther(u, nextTile.tx, nextTile.ty)){
          // Do NOT pause ("dance") when crowded: try a small bypass step, otherwise keep moving.
          const bp = findBypassStep(u, curTileTx, curTileTy, nextTile.tx, nextTile.ty);
          if (bp){
            u.path.splice(u.pathI, 0, {tx:bp.tx, ty:bp.ty});
            return true;
          }
          // fall through: allow compression movement instead of yielding
        }
        if (!canEnterTile(u, nextTile.tx, nextTile.ty)){
          // If the final approach is blocked (crowding), accept arrival near the goal to avoid infinite wiggle.
          if (u.order && (u.order.type==="move" || u.order.type==="attackmove") && u.pathI >= (u.path.length-1)){
            const dd = dist2(u.x,u.y,u.order.x,u.order.y);
            if (dd < 58*58){
              u.order = {type:"idle", x:u.x, y:u.y, tx:null, ty:null};
              u.path = null; u.pathI = 0;
              clearReservation(u);
              u.stuckTime = 0;
              return false;
            }
          }
          // If blocked, try a short bypass step instead of vibrating in place.
          if ((u.avoidCd||0) <= 0){
            const fromTx = curTileTx, fromTy = curTileTy;
            const bypass = findBypassStep(u, fromTx, fromTy, nextTile.tx, nextTile.ty);
            if (bypass){
              u.path.splice(u.pathI, 0, bypass);
              u.avoidCd = 0.45;
              } else {
                u.avoidCd = 0.25;
            }
          }
          return true;
        }
      }
    }

    const step=Math.min(getMoveSpeed(u)*dt, d);
    let ax=dx/(d||1), ay=dy/(d||1);
    // v12: local steering to avoid overlapping with nearby units.
    // This makes units slide around each other instead of stacking.
    let avoidX=0, avoidY=0;
    const avoidR = (u.r||10) + 16;
    const avoidR2 = avoidR*avoidR;
    for (let j=0;j<units.length;j++){
      const o=units[j];
      if (!o.alive || o.id===u.id) continue;
      // only avoid same team strongly; mild avoid enemies so crush can still happen
      const same = (o.team===u.team);
      const rr = (u.r+o.r) + (same?14:4);
      const dx2=u.x-o.x, dy2=u.y-o.y;
      const dd=dx2*dx2+dy2*dy2;
      if (dd<=0.0001 || dd>rr*rr) continue;
      const inv = 1/Math.sqrt(dd);
      const push = (rr - Math.sqrt(dd)) * (same?1.15:0.35);
      avoidX += dx2*inv*push;
      avoidY += dy2*inv*push;
    }
    // blend desired direction with avoidance
    const alen = Math.hypot(avoidX,avoidY);
    if (alen>0.0001){
      const mix = 0.55; // how hard we steer away
      const nx = avoidX/alen, ny = avoidY/alen;
      ax = ax*(1-mix) + nx*mix;
      ay = ay*(1-mix) + ny*mix;
      const nlen = Math.hypot(ax,ay)||1;
      ax/=nlen; ay/=nlen;
    }

    // Update facing direction for sprite rendering.
    // IMPORTANT: don't overwrite attack-facing while firing, and don't snap to default when stationary.
    const movingDir = (Math.abs(ax) + Math.abs(ay)) > 1e-4;
    if ((u.fireHoldT||0) > 0 && u.fireDir!=null){
      // Firing facing: turret/aim direction
      u.faceDir = u.fireDir;
      if (u.kind !== "tank" && u.kind !== "harvester"){
        u.dir = u.fireDir;
      } else {
        if (u.bodyDir==null) u.bodyDir = (u.dir!=null ? u.dir : 6);
        u.dir = u.bodyDir;
      }
    } else if (movingDir){
      const fd = worldVecToDir8(ax, ay);

      if (u.kind === "tank" || u.kind === "harvester"){
        // RA2-style: hull turns in place before actually translating.
        if (u.bodyDir == null) u.bodyDir = (u.dir!=null ? u.dir : 6);

        if (fd !== u.bodyDir){
          _tankUpdateHull(u, fd, dt);
          u.dir = u.bodyDir;
          u.faceDir = (u.fireDir!=null ? u.fireDir : (u.turretDir!=null ? u.turretDir : u.bodyDir));
          return true; // turning, no translation this frame
        }

        // Aligned: move normally.
        u.bodyTurn = null;
        u.bodyDir = fd;
        u.dir = fd;
        u.faceDir = (u.fireDir!=null ? u.fireDir : fd);
      } else {
        u.faceDir = fd;
        u.dir = fd;
      }
    } else {
      // keep last facing when idle
      if (u.faceDir==null) u.faceDir = 6;
      if (u.dir==null) u.dir = u.faceDir;
    }

const nx=u.x+ax*step, ny=u.y+ay*step;
    const ntx=tileOfX(nx), nty=tileOfY(ny);
    if (!isWalkableTile(ntx,nty)){
      return false;
    }
    // If we are about to enter an occupied tile (friendly jam), do not "force through".
    // Trigger a bypass/repath instead of vibrating against the same choke.
    if (!(ntx===curTx && nty===curTy)){
      const blockedNext = (!canEnterTile(u, ntx, nty) || isReservedByOther(u, ntx, nty));
      if (blockedNext){
        u.blockT = (u.blockT||0) + dt;
        if ((u.avoidCd||0) <= 0){
          const bypass = findBypassStep(u, curTx, curTy, ntx, nty);
          if (bypass){
            u.path.splice(u.pathI, 0, bypass);
            u.avoidCd = 0.45;
            } else {
            // Repath to the original goal using current occupancy.
            const g = (u.path && u.path.length) ? u.path[u.path.length-1] : {tx:ntx,ty:nty};
            const gp = findNearestFreePoint((g.tx+0.5)*TILE,(g.ty+0.5)*TILE,u,5);
            setPathTo(u, gp.x, gp.y);
            u.avoidCd = 0.35;
          }
        }
        u.yieldCd = Math.max(u.yieldCd||0, 0.10);
        return false;
      }
    }
    // Prevent moving into a building footprint (continuous check).
    // If we hit a corner while moving in a mostly-orthogonal direction, try to *slide* along one axis
    // instead of repeatedly repathing and "bouncing" on the same corner.
    if (isBlockedWorldPoint(u, nx, ny)){
      // Better corner handling:
      // 1) try sliding along the obstacle tangent (perpendicular to desired move),
      // 2) fallback to axis-only slide,
      // 3) if still blocked, locally retarget the next path node to a nearby reachable tile
      //    so units don't "headbang" on the same corner forever.
      const px = -ay, py = ax; // perpendicular unit vector
      for (const sgn of [1,-1]){
        const sx = u.x + px*step*sgn;
        const sy = u.y + py*step*sgn;
        const stx = tileOfX(sx), sty = tileOfY(sy);
        if (isWalkableTile(stx, sty) && canEnterTile(u, stx, sty) && !isBlockedWorldPoint(u, sx, sy)){
          u.x = clamp(sx,0,WORLD_W);
          u.y = clamp(sy,0,WORLD_H);
          u.blockT = 0;
          return true;
        }
      }

      // axis slide attempt 1: move X only
      const sx1 = u.x + ax*step;
      const sy1 = u.y;
      const stx1 = tileOfX(sx1), sty1 = tileOfY(sy1);
      if (isWalkableTile(stx1, sty1) && canEnterTile(u, stx1, sty1) && !isBlockedWorldPoint(u, sx1, sy1)){
        u.x = clamp(sx1,0,WORLD_W);
        u.y = clamp(sy1,0,WORLD_H);
        u.blockT = 0;
        return true;
      }
      // axis slide attempt 2: move Y only
      const sx2 = u.x;
      const sy2 = u.y + ay*step;
      const stx2 = tileOfX(sx2), sty2 = tileOfY(sy2);
      if (isWalkableTile(stx2, sty2) && canEnterTile(u, stx2, sty2) && !isBlockedWorldPoint(u, sx2, sy2)){
        u.x = clamp(sx2,0,WORLD_W);
        u.y = clamp(sy2,0,WORLD_H);
        u.blockT = 0;
        return true;
      }

      u.blockT = (u.blockT||0) + dt;

      // Local detour: if our current next-node is causing a corner collision, switch the next node
      // to a nearby tile that is (a) walkable, (b) enterable, (c) not inside building clearance,
      // and (d) closer to our final goal.
      if (u.path && u.path.length && u.pathI < u.path.length){
        const goal = u.path[u.path.length-1];
        const curTx = tileOfX(u.x), curTy = tileOfY(u.y);
        let best=null, bestScore=1e18;
        for (let dy=-1; dy<=1; dy++){
          for (let dx=-1; dx<=1; dx++){
            if (dx===0 && dy===0) continue;
            const tx = curTx+dx, ty = curTy+dy;
            if (!inMap(tx,ty)) continue;
            if (!isWalkableTile(tx,ty)) continue;
            if (!canEnterTile(u, tx, ty)) continue;
            const c = tileToWorldCenter(tx,ty);
            if (isBlockedWorldPoint(u, c.x, c.y)) continue;
            const h = (tx-goal.tx)*(tx-goal.tx) + (ty-goal.ty)*(ty-goal.ty);
            const turn = (dx*dx+dy*dy===2) ? 0.15 : 0.0; // slight bias for orthogonal steps
            const score = h + turn;
            if (score < bestScore){ bestScore=score; best={tx,ty}; }
          }
        }
        if (best){
          // Replace next node and claim reservation so others don't pile into the same corner.
          u.path[u.pathI] = {tx:best.tx, ty:best.ty};
          reserveTile(u, best.tx, best.ty);
          u.blockT = 0;
          u.yieldCd = Math.max(u.yieldCd||0, 0.12);
          return false;
        }
      }

      if ((u.avoidCd||0) <= 0){
        // Repath to a nearby *reachable* point close to our goal.
        const gx0 = (u.order && u.order.tx!=null) ? (u.order.tx+0.5)*TILE : wx;
        const gy0 = (u.order && u.order.ty!=null) ? (u.order.ty+0.5)*TILE : wy;

        const spot = findNearestFreePoint(gx0, gy0, u, 5);
        const gx = spot && spot.found ? spot.x : gx0;
        const gy = spot && spot.found ? spot.y : gy0;

        setPathTo(u, gx, gy);
        u.avoidCd = 0.45;
      }

      // If we keep colliding, settle to current tile-center instead of vibrating on corners.
      if (u.blockT > 0.95){
        const cwx=(tileOfX(u.x)+0.5)*TILE, cwy=(tileOfY(u.y)+0.5)*TILE;
        u.x=cwx; u.y=cwy;
        u.order = {type:"idle", x:u.x, y:u.y, tx:null, ty:null};
        u.path=null; u.pathI=0;
        clearReservation(u);
        u.blockT=0;
        return false;
      }

      u.yieldCd = Math.max(u.yieldCd||0, 0.12);
      return false;
    }
    u.x=clamp(nx,0,WORLD_W);

    u.y=clamp(ny,0,WORLD_H);

    // Stuck detection: if barely moving while having a path, nudge/skip nodes.
    const moved = Math.hypot(u.x-(u.lastX||u.x), u.y-(u.lastY||u.y));
    u.lastX=u.x; u.lastY=u.y;
    if (moved < 0.25 && d > 6) u.stuckT += dt; else u.stuckT = Math.max(0, u.stuckT - dt*0.5);

    if (u.stuckT > 0.75){
      // Stuck recovery:
      // Vehicles should repath instead of oscillating in place; infantry tries a sidestep first.
      const goal = (u.path && u.path.length) ? u.path[u.path.length-1] : null;
      u.stuckT = 0;
      clearReservation(u);

      if (goal && (u.kind==="tank" || u.kind==="harvester" || (u.cls==="veh"))){
        // Recompute a fresh path to goal (uses current occupancy/capacity).
        setPathTo(u, (goal.tx+0.5)*TILE, (goal.ty+0.5)*TILE);
        u.yieldCd = Math.max(u.yieldCd||0, 0.15);
        return true;
      } else if (goal){
        // Infantry: insert a bypass step to break the jam, else repath.
        const b = findBypassStep(u, curTx, curTy, goal.tx, goal.ty);
        if (b){ u.path.splice(u.pathI, 0, b); }
        else { setPathTo(u, (goal.tx+0.5)*TILE, (goal.ty+0.5)*TILE); }
        u.yieldCd = Math.max(u.yieldCd||0, 0.12);
        return true;
      } else {
        // No goal: just stop at current center.
        const cwx=(curTx+0.5)*TILE, cwy=(curTy+0.5)*TILE;
        u.x=cwx; u.y=cwy;
        u.order={type:"idle", x:u.x, y:u.y, tx:null, ty:null};
        u.path=null; u.pathI=0;
        return false;
      }
    }
    return true;
  }

function buildFormationOffsets(maxN){
    // Spiral in manhattan rings: 0, then 4, then 8...
    const out=[{dx:0,dy:0}];
    let r=1;
    while (out.length<maxN){
      // diamond ring: (r,0)->(0,r)->(-r,0)->(0,-r)
      for (let dx=-r; dx<=r; dx++){
        const dy = r - Math.abs(dx);
        out.push({dx,dy});
        if (dy!==0) out.push({dx,dy:-dy});
        if (out.length>=maxN) return out;
      }
      r++;
      if (r>64) break;
    }
    return out;
  }

function issueMoveAll(x,y){
    const ids=[...state.selection];
    // Snap click to nearest tile center
    const snap = snapWorldToTileCenter(x,y);
    const baseTx=snap.tx, baseTy=snap.ty;

    // Directional intent inside the clicked tile (helps picking the adjacent side when the tile is occupied).
    const baseCenter = tileToWorldCenter(baseTx, baseTy);
    const intentVX = x - baseCenter.x;
    const intentVY = y - baseCenter.y;


    // Precompute candidate offsets sized to selection
    const offsets = buildFormationOffsets(Math.max(16, ids.length*6));
    const used = new Set();
  const infCount = new Map();
    // RA2-feel: for infantry, assign a stable destination sub-slot per target tile
    const __tileSubMask = new Map();
    let k=0;
    for (const id of ids){
      const e=getEntityById(id);
      if (!e || e.team!==TEAM.PLAYER) continue;
      if (BUILD[e.kind]) continue;
      if (shouldIgnoreCmd(e,'move',x,y,null)) continue;

      e.guard=null; e.guardFrom=false;
      e.restX=null; e.restY=null;
      e.target=null;
      // Cancel firing animation immediately when moving
      e.fireHoldT=0; e.fireDir=null;
      e.forceMoveUntil = state.t + 1.25;
      e.repathCd=0.15;

      // pick best nearby free tile among offsets, biased to the actual mouse world point (x,y)
      // so clicking near a unit lets you place destinations to its side/front more predictably.
      let chosen=null;
      let bestScore=1e18;
      for (let j=0; j<offsets.length; j++){
        const tx = baseTx + offsets[j].dx;
        const ty = baseTy + offsets[j].dy;
        if (!inMap(tx,ty)) continue;
        const key = tx+"," + ty;
        if(UNIT[e.kind]?.cls!=="inf") { if(used.has(key)) continue; }
        else { const c = infCount.get(key)||0; if(c>=INF_SLOT_MAX) continue; infCount.set(key,c+1); }
        if (!canEnterTile(e, tx, ty)) continue;
        const wpC = tileToWorldCenter(tx,ty);
        // score: distance to the actual click + tiny ring penalty (prefer closer rings)
        const dxw = (wpC.x - x), dyw = (wpC.y - y);
        const ring = (Math.abs(offsets[j].dx)+Math.abs(offsets[j].dy));
        const dot = (offsets[j].dx*intentVX + offsets[j].dy*intentVY);
        // Lower score is better; dot>0 means tile is in the direction you clicked within the occupied tile.
        const score = dxw*dxw + dyw*dyw + ring*9 - dot*1.2;
        if (score < bestScore){
          bestScore=score;
          chosen={tx,ty};
        }
        // Early exit for perfect hit
        if (score < 1) break;
      }
      // reserve chosen now (so other units won't pick it)
      if (chosen){
        if (!reserveTile(e, chosen.tx, chosen.ty)){
          chosen=null;
        } else {
          used.add(chosen.tx+","+chosen.ty);
        }
      }
      // if nothing free, fall back to base tile center
      if (!chosen) chosen={tx:baseTx, ty:baseTy};// RA2-feel: vehicles still go to tile center; infantry go to a reserved sub-slot inside the tile
const cls = (UNIT[e.kind] && UNIT[e.kind].cls) ? UNIT[e.kind].cls : "";
let wp;
let subSlot = null;
if (cls==="inf"){
  const tkey = chosen.tx + "," + chosen.ty;
  let mask = __tileSubMask.get(tkey) || 0;
  let pick = 0;
  for (let s=0; s<4; s++){
    if (((mask>>s)&1)===0){ pick=s; break; }
  }
  subSlot = pick;
  mask = (mask | (1<<pick)) & 0x0F;
  __tileSubMask.set(tkey, mask);
  wp = tileToWorldSubslot(chosen.tx, chosen.ty, pick);
} else {
  wp = tileToWorldCenter(chosen.tx, chosen.ty);
}
e.order={type:"move", x:wp.x, y:wp.y, tx:chosen.tx, ty:chosen.ty, subSlot:subSlot};

      e.holdPos = false;

      pushOrderFx(e.id,"move",wp.x,wp.y,null,"rgba(90,255,90,0.95)");
      setPathTo(e, wp.x, wp.y);
      showUnitPathFx(e, wp.x, wp.y, "rgba(255,255,255,0.85)");
      stampCmd(e,'move',wp.x,wp.y,null);
      k++;
    }
  }

// fix: issueMoveAll referenced u.kind; should be e.kind
// (patched below by overriding function body line via string replace)

// Patch inside issueMoveAll: UNIT[u.kind] -> UNIT[e.kind]
// (simple runtime patch already applied in source text by replacement above if present)

// Expose
window.Movement = { aStarPath, findPath, followPath, buildFormationOffsets, issueMoveAll };

})();
