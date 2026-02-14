// movement.js - extracted movement/pathing/formation commands from game.js
// NOTE: This module is intentionally "single-file" to avoid JS graveyards.
// It exports a factory that binds to the existing game context.

export function createMovement(ctx){
  const {
    state,
    UNIT,
    INF_SLOT_MAX,
    MAP_W,
    MAP_H,
    TILE,
    WORLD_W,
    WORLD_H,
    TEAM,
    BUILD,

    inMap,
    canEnterTile,
    tileToWorldCenter,
    tileToWorldSubslot,
    snapWorldToTileCenter,
    isWalkableTile,
  } = ctx;

  // --- extracted helpers ---

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
  
    function issueMoveCombatOnly(x,y){
      const ids=[...state.selection];
      let k=0; const spacing=46;
      for (const id of ids){
        const e=getEntityById(id);
        if (!e || e.team!==TEAM.PLAYER) continue;
        if (BUILD[e.kind]) continue;
        if (e.kind==="harvester") continue;
        if (shouldIgnoreCmd(e,'move',x,y,null)) continue;
        const col=k%5, row=(k/5)|0;
        const ox=(col-2)*spacing;
        const oy=row*spacing - spacing;
        let gx=x+ox, gy=y+oy;
        const spot=findNearestFreePoint(gx,gy,e,4);
        if (spot && spot.found){ gx=spot.x; gy=spot.y; }
        e.order={type:"move", x:gx, y:gy, tx:null,ty:null, manual:true, allowAuto:false, lockTarget:false};
        e.restX=null; e.restY=null;
        e.target=null;
        // Cancel firing animation immediately when moving
        e.fireHoldT=0; e.fireDir=null;
        pushOrderFx(e.id,"move",gx,gy,null,"rgba(90,255,90,0.95)");
        e.forceMoveUntil = state.t + 1.25;
        setPathTo(e, gx, gy);
        showUnitPathFx(e, gx, gy, "rgba(255,255,255,0.85)");
        e.repathCd=0.25;
        stampCmd(e,'move',gx,gy,null);
        k++;
      }
    }
    function issueAttackMove(x,y){
      const ids=[...state.selection];
      let k=0; const spacing=46;
      for (const id of ids){
        const u=getEntityById(id);
        if (!u || u.team!==TEAM.PLAYER) continue;
        if (BUILD[u.kind]) continue;
        u.guard=null; u.guardFrom=false;
        if (u.kind==="harvester" || u.kind==="engineer") continue;
        if ((u.range||0) <= 0) continue;
  
        const col=k%5, row=(k/5)|0;
        const ox=(col-2)*spacing;
        const oy=row*spacing - spacing;
        let gx=x+ox, gy=y+oy;
        const spot=findNearestFreePoint(gx,gy,u,4);
        if (spot && spot.found){ gx=spot.x; gy=spot.y; }
  
              if (shouldIgnoreCmd(u,'attackmove',gx,gy,null)) { k++; continue; }
  u.order={type:"attackmove", x:gx, y:gy, tx:null,ty:null, manual:true, allowAuto:true, lockTarget:false};
        u.holdPos = false;
        u.target=null;
        // Cancel firing animation immediately when moving (attack-move)
        u.fireHoldT=0; u.fireDir=null;
        setPathTo(u, gx, gy);
        pushOrderFx(u.id,"attackmove",gx,gy,null,"rgba(255,90,90,0.95)");
        u.repathCd=0.25;
        k++;
        stampCmd(u,'attackmove',gx,gy,null);
      }
    }
  
  
    function issueGuard(){
      const ids=[...state.selection];
      for (const id of ids){
        const u=getEntityById(id);
        if (!u || u.team!==TEAM.PLAYER) continue;
        if (BUILD[u.kind]) continue;
        if ((u.range||0)<=0 || u.kind==="engineer" || u.kind==="harvester") continue;
  
        u.guard = { on:true, x0:u.x, y0:u.y };
        u.order = { type:"guard", x:u.x, y:u.y, tx:null,ty:null };
        u.target = null;
        u.path = null;
  
        // quick feedback ring
        showUnitPathFx(u, u.x, u.y, "rgba(120,255,120,0.9)");
      }
    }
    function assignControlGroup(n){
      if (n<1 || n>9) return;
      const prev = controlGroups[n] || [];
      // clear old badges for this group
      for (const id of prev){
        const e=getEntityById(id);
        if (e && e.grp===n) e.grp=0;
      }
      const ids=[...state.selection];
      controlGroups[n]=ids;
      for (const id of ids){
        const e=getEntityById(id);
        if (e) e.grp=n;
      }
    }
  
    function recallControlGroup(n){
      if (n<1 || n>9) return;
      const ids=controlGroups[n] || [];
      state.selection.clear();
      for (const id of ids){
        const e=getEntityById(id);
        if (e && e.alive) state.selection.add(id);
      }
      updateSelectionUI();
    }
  
  
    
  
  function getChasePointForAttack(u, t){
    // Buildings have tx/ty footprint; units don't. Using building-dock math on units creates NaN paths/waypoints.
    if (!t) return {x:u.x, y:u.y};
    if (BUILD[t.kind]) return getClosestPointOnBuilding(t, u);
    let want = Math.max(32, ((u.range||0) > 0 ? (u.range*0.85) : TILE));
    // If this unit has an assigned encirclement slot for this target, push it onto outer rings (prevents backline "waiting in line").
    if (u && u.atkSlotT===t.id && u.atkSlotRing!=null) want += (u.atkSlotRing * TILE * 0.65);
  
    const isB = !!(BUILD[t.kind]);
    const tr = isB ? (Math.max(BUILD[t.kind].tw, BUILD[t.kind].th) * TILE * 0.5 * 0.95) : (t.r||0);
    const seed = (u && u.atkSlotT===t.id && isFinite(u.atkSlotAng)) ? u.atkSlotAng : null;
  
    const p = getStandoffPoint(u, t, want, isB, tr, seed);
    return p || {x:t.x, y:t.y};
  }
  function issueAttack(targetId){
      const t=getEntityById(targetId);
      if (!t || t.attackable===false) return;
  
      const ids=[...state.selection];
      const spacing=0.85*TILE;
      // Assign deterministic encirclement slots (multi-ring) so large groups don't queue behind each other.
      const atkUnits = [];
      for (let k=0;k<ids.length;k++){
        const uu=getEntityById(ids[k]);
        if (!uu || !uu.alive || uu.type!=="unit") continue;
        const isEngIFV = (uu.kind==="ifv" && uu.passKind==="engineer");
        if (isEngIFV) continue;
        if (!uu.canAttack) continue;
        atkUnits.push(uu);
      }
      // Use group centroid as the "front" reference so rings distribute around the target consistently.
      let cx=0, cy=0;
      for (const uu of atkUnits){ cx+=uu.x; cy+=uu.y; }
      if (atkUnits.length){ cx/=atkUnits.length; cy/=atkUnits.length; }
      const baseAng = Math.atan2(cy - t.y, cx - t.x);
      // Slots per ring: roughly one per ~0.9 tile of circumference at preferred distance
      const baseDist = Math.max(2*TILE, (atkUnits[0] && atkUnits[0].range ? (atkUnits[0].range*0.85) : 2*TILE));
      const slotsPerRing = clamp(((Math.PI*2*baseDist)/(TILE*0.9))|0, 8, 16);
      for (let j=0;j<atkUnits.length;j++){
        const uu = atkUnits[j];
        const ring = (j/slotsPerRing)|0;
        const idx = j - ring*slotsPerRing;
        const ringCount = Math.min(slotsPerRing, atkUnits.length - ring*slotsPerRing);
        const ang = baseAng + (idx / Math.max(1, ringCount)) * (Math.PI*2);
        uu.atkSlotT = t.id;
        uu.atkSlotAng = ang;
        uu.atkSlotRing = ring;    }
  
  
      for (let i=0;i<ids.length;i++){
        const u=getEntityById(ids[i]);
        if (!u || !u.alive || u.type!=="unit") continue;
  
        // If an Engineer-IFV is selected with combat units, treat attack-click as MOVE (support vehicle),
        // while other combat units perform the attack.
        const isEngIFV = (u.kind==="ifv" && u.passKind==="engineer");
  
        if (!isEngIFV){
          if (!u.canAttack) continue;
        } else {
          // engineer IFV never attacks; it will move toward the target
          u.target = null;
          u.forceFire = null;
        }
        if (state.mode==="repair" || state.mode==="sell") continue;
        if (shouldIgnoreCmd(u,"attack",u.x,u.y,targetId)) continue;
  
        // formation offset to reduce clumping
        const ring=Math.floor(Math.sqrt(i));
        const ang=(i*2.1)%(Math.PI*2);
        const off=(ring+1)*spacing;
        const ox=Math.cos(ang)*off;
        const oy=Math.sin(ang)*off;
  
        if (isEngIFV){
          u.order = { type:"move", x:u.x, y:u.y, tx:null, ty:null, manual:true, allowAuto:false, lockTarget:false };
        u.holdPos = false;
          const p=getChasePointForAttack(u,t);
          const ok=setPathTo(u, p.x+ox, p.y+oy);
          if (!ok){
            const gx = p.x+ox, gy = p.y+oy;
            const gtx = tileOfX(gx), gty = tileOfY(gy);
            u.path = [{tx:gtx, ty:gty}]; u.pathI=0;
          }
          u.orderFx = {t:0.55, kind:"move", x:p.x+ox, y:p.y+oy, targetId};
          pushOrderFx(u.id,"move",p.x+ox,p.y+oy,targetId,"rgba(90,255,90,0.95)");
        } else {
          u.order={type:"attack", x:u.x, y:u.y, tx:null, ty:null, manual:true, allowAuto:false, lockTarget:true};
          u.target=targetId;
          u.forceFire=null;
  
          const p=getChasePointForAttack(u,t);
          const ok=setPathTo(u, p.x+ox, p.y+oy);
          if (!ok){
            const gx = p.x+ox, gy = p.y+oy;
            const gtx = tileOfX(gx), gty = tileOfY(gy);
            u.path = [{tx:gtx, ty:gty}]; u.pathI=0;
          }
          u.orderFx = {t:0.55, kind:"attack", x:p.x+ox, y:p.y+oy, targetId};
          pushOrderFx(u.id,"attack",p.x+ox,p.y+oy,targetId,"rgba(255,70,70,0.95)");
        }
      }
    }
  
    // Ctrl+LeftClick force-fire/force-attack: ignores team, persists until another order is given.
    function issueForceAttack(targetId){
      const t=getEntityById(targetId);
      if (!t || t.attackable===false || !t.alive) return;
      for (const id of state.selection){
        const e=getEntityById(id);
        if (!e || e.team!==TEAM.PLAYER) continue;
        // Buildings: allow turret to force-attack too.
        if (BUILD[e.kind]){
          if (e.kind==="turret"){
            e.forceFire = { mode:"id", id: targetId };
            toast("공격 지정");
          }
          continue;
        }
        if (e.kind==="harvester"||e.kind==="engineer") continue;
        if ((e.range||0)<=0) continue;
        e.guard=null; e.guardFrom=false;
              if (shouldIgnoreCmd(e,'forceattack',e.x,e.y,targetId)) continue;
  e.order={type:"attack", x:e.x,y:e.y, tx:null,ty:null, manual:true, allowAuto:false, lockTarget:true, allowFriendly: (t.team===e.team)};
        e.holdPos = false;
        e.target=targetId;
        e.forceFire = null;
        const p=getChasePointForAttack(e, t);
        setPathTo(e, p.x, p.y);
        pushOrderFx(e.id,"attack",p.x,p.y,targetId,"rgba(255,70,70,0.95)");
        e.repathCd=0.35;
        stampCmd(e,'attack',p.x,p.y,targetId);
      }
    }
  
    function issueForceFirePos(x,y){
      for (const id of state.selection){
        const e=getEntityById(id);
        if (!e || e.team!==TEAM.PLAYER) continue;
        if (BUILD[e.kind]){
          if (e.kind==="turret"){
            e.forceFire = { mode:"pos", x, y };
            toast("공격 지정");
          }
          continue;
        }
        if (e.kind==="harvester"||e.kind==="engineer") continue;
        if ((e.range||0)<=0) continue;
        e.guard=null; e.guardFrom=false;
        e.target=null;
        e.forceFire = { x, y };
              if (shouldIgnoreCmd(e,'forcefire',x,y,null)) continue;
  e.order={type:"forcefire", x, y, tx:null,ty:null};
        setPathTo(e, x, y);
        showUnitPathFx(e, x, y, "rgba(255,80,80,0.95)");
        e.repathCd=0.35;
        stampCmd(e,'forcefire',x,y,null);
      }
    }
  
    function issueCapture(targetId){
      const t=getEntityById(targetId);
      if (!t || t.civ) return;
      for (const id of state.selection){
        const e=getEntityById(id);
        if (!e || e.team!==TEAM.PLAYER) continue;
        if (e.kind!=="engineer") continue;
        if (shouldIgnoreCmd(e,'capture',e.x,e.y,targetId)) continue;
        e.order={type:"capture", x:e.x,y:e.y, tx:null,ty:null};
        e.target=targetId;
        const dock=getClosestPointOnBuilding(t,e);
        setPathTo(e, dock.x, dock.y);
        showUnitPathFx(e, t.x, t.y, "rgba(255,220,120,0.95)");
        e.repathCd=0.35;
        stampCmd(e,'capture',dock.x,dock.y,targetId);
      }
    }
  
  
  // Engineer can enter any damaged friendly building to instantly fully repair it (engineer is consumed).
  function issueEngineerRepair(targetId){
    const t=getEntityById(targetId);
    if (!t || !BUILD[t.kind] || t.civ) return;
    if (t.team!==TEAM.PLAYER) return;
    if (t.hp >= t.hpMax-0.5){ toast("수리 불필요"); return; }
    for (const id of state.selection){
      const e=getEntityById(id);
      if (!e || e.team!==TEAM.PLAYER) continue;
      if (e.kind!=="engineer") continue;
      const dock=getClosestPointOnBuilding(t,e);
      if (shouldIgnoreCmd(e,'repairenter',dock.x,dock.y,targetId)) continue;
      e.order={type:"repairenter", x:e.x,y:e.y, tx:null,ty:null};
      e.target=targetId;
      setPathTo(e, dock.x, dock.y);
      showUnitPathFx(e, dock.x, dock.y, "rgba(120,255,120,0.95)");
      e.repathCd=0.35;
      stampCmd(e,'repairenter',dock.x,dock.y,targetId);
    }
  }
  
    function issueHarvest(tx,ty){
      const gx = (tx+0.5)*TILE, gy = (ty+0.5)*TILE;
      for (const id of state.selection){
        const u=getEntityById(id);
        if (!u || u.team!==TEAM.PLAYER || u.kind!=="harvester") continue;
        if (shouldIgnoreCmd(u,'harvest',gx,gy,null)) continue;
  
        u.manualOre={tx,ty};
        u.order={type:"harvest", x:u.x,y:u.y, tx,ty};
        u.returning=false;
        u.path=null; u.pathI=0;
  
        setPathTo(u, gx, gy);
        // Harvest is treated as an "attack-style" order for feedback: red line + red endpoint.
        pushOrderFx(u.id,"harvest",gx,gy,null,"rgba(255,70,70,0.95)");
        showUnitPathFx(u, gx, gy, "rgba(255,90,90,0.85)");
        stampCmd(u,'harvest',gx,gy,null);
  
        u.repathCd=0.25;
        u.stuckTime=0;
      }
    }
  
    
  function findNearestEnemyFor(team, wx, wy, radius, infOnly=false, unitOnly=false){
    const enemyTeam = (team===TEAM.PLAYER) ? TEAM.ENEMY : TEAM.PLAYER;
    let best=null, bestD=Infinity;
    const r2=radius*radius;
    // units first
    for (const u of units){
      if (!u.alive || u.team!==enemyTeam || u.inTransport || u.hidden) continue;
      if (infOnly){
        const cls = (UNIT[e.kind] && UNIT[e.kind].cls) ? UNIT[e.kind].cls : "";
        if (cls!=="inf") continue; // sniper/inf-only: ignore vehicles/harvesters/etc
      }
  const tx=tileOfX(u.x), ty=tileOfY(u.y);
      // 시야 규칙: 현재 visible 밖 적은 무시 (탐험(explored)만으론 전투가 멈추는 버그 발생)
      if (enemyTeam===TEAM.ENEMY && inMap(tx,ty) && !visible[TEAM.PLAYER][idx(tx,ty)]) continue;
      const d2=dist2(wx,wy,u.x,u.y);
      if (d2<bestD && d2<=r2){ bestD=d2; best=u; }
    }
    if (infOnly || unitOnly) return best;
    // buildings next (attackable only)
    for (const b of buildings){
      if (!b.alive || b.team!==enemyTeam) continue;
      if (b.attackable===false || b.civ) continue;
      if (enemyTeam===TEAM.ENEMY && inMap(b.tx,b.ty) && !visible[TEAM.PLAYER][idx(b.tx,b.ty)]) continue;
      const d2=dist2(wx,wy,b.x,b.y);
      if (d2<bestD && d2<=r2){ bestD=d2; best=b; }
    }
    return best;
  }
  
  function findNearestAttackMoveTargetFor(team, wx, wy, radius, attackerKind){
    // Attack-move should prioritize enemy units and defensive turrets only.
    const enemyTeam = (team===TEAM.PLAYER) ? TEAM.ENEMY : TEAM.PLAYER;
    let best=null, bestD=Infinity;
    const r2=radius*radius;
  
    for (const u of units){
      if (!u.alive || u.team!==enemyTeam || u.inTransport || u.hidden) continue;
      // Sniper: do not auto-engage vehicles/harvesters on attack-move unless explicitly ordered.
      if (attackerKind==="sniper" && (u.kind==="tank" || u.kind==="harvester")) continue;
  const d2=dist2(wx,wy,u.x,u.y);
      if (d2<=r2 && d2<bestD){ best=u; bestD=d2; }
    }
    for (const b of buildings){
      if (!b.alive || b.team!==enemyTeam) continue;
      if (b.kind!=="turret") continue; // ignore non-combat buildings
      const d2=dist2(wx,wy,b.x,b.y);
      if (d2<=r2 && d2<bestD){ best=b; bestD=d2; }
    }
    return best;
  }
  
  function issueIFVRepair(targetId){
    const t=getEntityById(targetId);
    if (!t || !t.alive || t.team!==TEAM.PLAYER) return;
    if (BUILD[t.kind]) return;
    const tcls = (UNIT[t.kind] && UNIT[t.kind].cls) ? UNIT[t.kind].cls : "";
    if (tcls!=="veh") return;
    if (t.hp >= t.hpMax-0.5){ toast("수리 불필요"); return; }
  
    for (const id of state.selection){
      const u=getEntityById(id);
      if (!u || !u.alive || u.team!==TEAM.PLAYER) continue;
      if (u.kind!=="ifv" || u.passKind!=="engineer") continue;
      u.repairTarget = t.id;
      u.order = {type:"move", x:u.x,y:u.y, tx:null,ty:null};
      setPathTo(u, t.x, t.y);
      u.repathCd = 0.25;
    }
    toast("IFV 수리");
  }
  
  function crushInfantry(mover){
    // 차량(탱크/굴착기)이 적 보병과 겹치면 즉사(경장갑 룰)
    if (mover.kind!=="tank" && mover.kind!=="harvester") return;
    const enemyTeam = mover.team===TEAM.PLAYER ? TEAM.ENEMY : TEAM.PLAYER;
    for (const u of units){
      if (!u.alive || u.team!==enemyTeam || u.inTransport || u.hidden) continue;
  if (u.kind!=="infantry") continue;
      if (dist2(mover.x,mover.y,u.x,u.y) <= (mover.r + u.r)*(mover.r + u.r)*0.55){
        u.alive=false;
        state.selection.delete(u.id);
      }
    }
  }
  
  function isEnemyInf(e){
    if (!e || !e.alive) return false;
    if (BUILD[e.kind]) return false;
    return (UNIT[e.kind]?.cls==="inf");
  }
  
  function tickUnits(dt){
      clearOcc(dt);
      for (const u of units){
        if (!u.alive) continue;
        if (u.shootCd>0) u.shootCd -= dt;
        if (u.flash && u.flash>0) u.flash -= dt;
        if (u.repathCd>0) u.repathCd -= dt;
        if (u.avoidCd>0) u.avoidCd -= dt;
        if (u.holdPosT>0) u.holdPosT -= dt;
        if (u.fireHoldT>0) u.fireHoldT -= dt;
  
        u._justShot = false;
  
        // If a movement order is active, cancel any lingering firing pose
        if (u.order && (u.order.type==="move" || u.order.type==="attackmove")){ u.fireHoldT=0; u.fireDir=null; }
        // Also: if we're currently moving and we did NOT fire this tick, don't keep the firing pose.
        // This prevents 'attack animation while approaching' or while chasing.
        const mv = (Math.abs(u.vx||0) + Math.abs(u.vy||0));
        if (mv > 0.5 && !u._justShot){ u.fireHoldT = 0; u.fireDir = null; }
  
  
        // Ensure core flags exist (prevents command filters from dropping orders)
        if (u.type!=="unit") u.type="unit";
        u.canAttack = ((u.dmg||0)>0 && (u.range||0)>0 && u.kind!=="engineer" && u.kind!=="harvester");
  
  
        if (u.aggroCd>0) u.aggroCd -= dt;
        // Safety: clear stale targets so idle units don't get treated as "active" and pushed around.
        if (u.target!=null && (u.order==null || u.order.type==="idle" || u.order.type==="guard")){
          const tt=getEntityById(u.target);
          if (!tt || !tt.alive || tt.attackable===false) u.target=null;
        }
  
        // Dynamic combat flags (fix: some units couldn't attack because these were missing).
        u.canAttack = ((u.dmg||0)>0 && (u.range||0)>0);
        // hitscan may change (e.g., IFV passenger), keep it truthy if either dynamic or static says so.
        u.hitscan = !!(u.hitscan || UNIT[e.kind]?.hitscan);
  
        if (!u.order || u.order.type!=="attack") u.holdAttack = false;
  
        // HARD IDLE LOCK: if a unit should be stationary, freeze it completely (no path, no nudges, no steering drift).
        // Auto-attack fix: if we can shoot and we're idle/guard/attackmove with no target, acquire enemies automatically.
        // This runs BEFORE the idle lock so units don't stay frozen when enemies are in sight.
        if (!u.inTransport && !u.hidden && u.team!==TEAM.CIV && (u.dmg||0)>0 && (u.range||0)>0){
          const otPre = u.order && u.order.type;
          const wantsAuto = (!u.target && (otPre==="idle" || otPre==="guard" || otPre==="guard_return" || otPre==="attackmove"));
          if (wantsAuto && u.aggroCd<=0){
            const sniperMode = (u.kind==="sniper" || (u.kind==="ifv" && u.passKind==="sniper"));
    const manualLock = !!(u.order && u.order.manual && u.order.allowAuto!==true);
            const vis = (UNIT[e.kind]?.vision || 300);
            const cand = findNearestEnemyFor(u.team, u.x, u.y, vis, sniperMode, true); // unitOnly
            if (cand){
              if (!sniperMode || isEnemyInf(cand)){
                u.order = {type:"attack", x:u.x, y:u.y, tx:null, ty:null};
                u.target = cand.id;
                setPathTo(u, cand.x, cand.y);
                u.repathCd = 0.25;
                u.aggroCd = 0.25;
              }
            }
          }
        }
  
        const ot0 = u.order && u.order.type;
        const shouldRest = (u.alive && !u.inTransport && u.target==null && (ot0==="idle" || ot0==="guard") &&
                            !(u.kind==="harvester" && (u.returning || u.manualOre!=null)));
        if (shouldRest){
          // If we just entered rest, store the anchor position.
          if (u.restX==null || u.restY==null) { u.restX = u.x; u.restY = u.y; }
          // Kill any leftover movement state that could create "one-step" drift.
          u.path = null; u.pathI = 0;
          u.vx = 0; u.vy = 0;
          u.stuckT = 0; u.stuckTime = 0; u.yieldCd = 0; u.avoidCd = 0;
          // Snap back every tick (absolute). This sacrifices tiny overlap corrections, but removes the bug 100%.
          u.x = u.restX; u.y = u.restY;
        } else {
          u.restX = null; u.restY = null;
        }
  
        // Sniper cloaking:
  // - Cloak when idle/standing.
  // - Reveal while moving (including any path-follow), and for a while after firing.
  // v130: detect movement without relying on vx/vy (some paths update position directly).
  if (u.kind==="sniper"){
    // v1441: Sniper sprite was turning invisible due to default cloak logic.
    // Cloaking is now optional. Default is OFF (UNIT.sniper.cloak=false).
    if (!UNIT.sniper.cloak){
      u.cloakBreak = 999;
      u.cloaked = false;
      u._justShot = false;
    } else {
    if (u.cloakBreak>0) u.cloakBreak -= dt;
  
    const ot = (u.order && u.order.type) ? u.order.type : "idle";
    const hasPath = (u.path && u.path.length && u.pathI < u.path.length);
  
    // Goal distance heuristic for orders that should count as "moving"
    let gx = u.x, gy = u.y;
    if (ot==="move" || ot==="guard_return" || ot==="attackmove"){
      gx = (u.order && (u.order.tx!=null)) ? u.order.tx : ((u.order && u.order.x!=null) ? u.order.x : u.x);
      gy = (u.order && (u.order.ty!=null)) ? u.order.ty : ((u.order && u.order.y!=null) ? u.order.y : u.y);
    } else if (ot==="forcefire"){
      gx = (u.order && u.order.x!=null) ? u.order.x : u.x;
      gy = (u.order && u.order.y!=null) ? u.order.y : u.y;
    } else if (ot==="attack"){
      const tt = (u.target!=null) ? getEntityById(u.target) : null;
      if (tt){ gx = tt.x; gy = tt.y; }
    }
  
    const dGoal2 = dist2(u.x,u.y,gx,gy);
    const vel = Math.hypot(u.vx||0, u.vy||0);
  
    const moving = hasPath || vel>2.0 || ((ot==="move" || ot==="attackmove" || ot==="guard_return" || ot==="forcefire") && dGoal2 > 24*24);
  
    if (moving){
      // Reveal while moving.
      u.cloakBreak = Math.max(u.cloakBreak, 0.65);
    }
  
    u.cloaked = (u.cloakBreak<=0.001);
    u._justShot = false;
    }
  }
  
  // IFV: passenger and repair timer
        if (u.kind==="ifv"){
          if (u.repairCd>0) u.repairCd -= dt;
        }
  
        // IFV weapon mode switching based on passenger.
        if (u.kind==="ifv"){
          // Default (unloaded) stats. Needed so IFV doesn't get stuck at dmg=0 after unloading an engineer.
          u.dmg = UNIT.ifv.dmg; u.range = UNIT.ifv.range; u.rof = UNIT.ifv.rof; u.hitscan = UNIT.ifv.hitscan;
          if (u.passKind==="infantry"){
            u.dmg = 25; u.range = 620; u.rof = 0.55/2.0; u.hitscan = true; // +10 bonus dmg, 2x ROF
          } else if (u.passKind==="sniper"){
            u.dmg = 125; u.range = UNIT.sniper.range; u.rof = 2.20/2.0; u.hitscan = true;
          } else if (u.passKind==="engineer"){
            // Engineer IFV: repairs friendly vehicles (auto + manual).
            // Rules:
            // - Moves to the target, then repairs ONLY while idle/standing still (no "drive-by" repairing).
            // - Heal rate is moderate (no instant full heal).
            u.dmg = 0; u.range = 0; u.hitscan = true;
  
            const REPAIR_RANGE = 260;         // v54: looser repair range (in-range repairs feel responsive)
            const REPAIR_INTERVAL = 1.25;     // seconds per tick (slower ticks, bigger heals)
            const REPAIR_AMOUNT = 24;         // hp per tick
  
            // validate / auto-pick a repair target
            const allowAutoRepair = (!u.order || u.order.type==="idle" || u.order.type==="guard" || u.order.type==="attackmove" || u.order.type==="attack");
  
            let rt = (u.repairTarget!=null) ? getEntityById(u.repairTarget) : null;
            const isRepairableVeh = (e)=>{
              if (!e || !e.alive || e.team!==u.team) return false;
              if (e.id===u.id) return false; // never self-repair
              if (BUILD[e.kind]) return false;
              const cls = (UNIT[e.kind] && UNIT[e.kind].cls) ? UNIT[e.kind].cls : "";
              if (cls!=="veh") return false;
              if (e.hp>=e.hpMax-0.5) return false;
              return true;
            };
            if (!isRepairableVeh(rt)){ u.repairTarget=null; rt=null; }
  
            if (!rt && allowAutoRepair){
              // auto-acquire nearest damaged vehicle
              let best=null, bestD2=Infinity;
              for (const tu of units){
                if (!isRepairableVeh(tu)) continue;
                const d2 = dist2(u.x,u.y,tu.x,tu.y);
                if (d2<760*760 && d2<bestD2){ best=tu; bestD2=d2; }
              }
              if (best){ u.repairTarget=best.id; rt=best; }
            }
  
            if (rt){
              const d2 = dist2(u.x,u.y,rt.x,rt.y);
  
              // Approach phase: move toward target
              if (d2 > REPAIR_RANGE*REPAIR_RANGE){
                // Approach phase: force move toward target (engineer IFV never auto-attacks)
                u.target = null; u.attackTarget = null;
                u.order = {type:"move", x:u.x, y:u.y, tx:null, ty:null};
                if (u.repathCd<=0){
                  setPathTo(u, rt.x, rt.y);
                  u.repathCd = 0.30;
                }
              } else {
                // In-range: STOP and repair only while idle (no repair while moving)
                if (u.order.type!=="idle"){
                  u.order = {type:"idle", x:u.x, y:u.y, tx:null, ty:null};
                  u.path = null; u.pathI = 0;
                clearReservation(u);
                }
  
                // Repair tick (only when standing still)
                if ((!u.path || u.pathI>= (u.path?.length||0)) && u.repairCd<=0){
                  rt.hp = Math.min(rt.hpMax, rt.hp + REPAIR_AMOUNT);
                  rt.flash = Math.max(rt.flash||0, 0.16);
                  healMarks.push({x:rt.x, y:rt.y-18, life:0.25});
                  // weld sparks + red-cross marker
                  for (let k=0;k<6;k++){
                    impacts.push({x:rt.x+(Math.random()*12-6), y:rt.y+(Math.random()*12-6), vx:(Math.random()*160-80), vy:(Math.random()*160-80), life:0.22});
                  }
                  healMarks.push({x:rt.x, y:rt.y-24, life:0.55});
                  u.repairCd = REPAIR_INTERVAL;
                }
              }
            }
          } else {
            u.dmg = 18; u.range = 420; u.rof = 0.85; u.hitscan = false;
          }
        }
  
  
  // Handle pending IFV boarding intent.
  if (u.wantsBoard){
    const ifv = getEntityById(u.wantsBoard);
    if (!ifv || !ifv.alive || ifv.kind!=="ifv" || ifv.team!==u.team){ u.wantsBoard=null; }
    else{
      const d2 = dist2(u.x,u.y,ifv.x,ifv.y);
      if (d2 <= 120*120){
        if (!ifv.passengerId) boardUnitIntoIFV(u, ifv);
        else u.wantsBoard=null;
      }
    }
  }
  
  // Units inside transports do not move/act.
        if (u.inTransport){
          const carrier = getEntityById(u.inTransport);
          if (!carrier || !carrier.alive){ u.inTransport=null; u.hidden=false; u.selectable=true; }
          else { u.x = carrier.x; u.y = carrier.y; }
          continue;
        }
  
  
        // Passive regen: Harvester slowly repairs itself if not taking damage for 1s.
        if (u.kind==="harvester" && u.hp<u.hpMax){
          if (state.t - (u.lastDamaged ?? -1e9) >= 1.0){
            const regenRate = 18; // hp per second (slow)
            u.hp = Math.min(u.hpMax, u.hp + regenRate*dt);
          }
        }
  
        // Tank damage state: below 30% HP -> crippled (slower) until healed above 50%.
        if (u.kind==="tank"){
          const hpPct = (u.hpMax>0) ? (u.hp/u.hpMax) : 1;
          if (u.crippled){
            if (hpPct>=0.50) u.crippled=false;
          } else {
            if (hpPct<=0.30) u.crippled=true;
          }
        }
  
        // Combat target priority for ALL teams:
  // 1) If we were recently attacked, retaliate (sniper doctrine: only vs infantry).
  // 2) If idle/guarding/moving without a target, auto-acquire nearby enemy UNITS.
  // 3) If attacking a building, switch to a nearby enemy unit (non-sniper only).
  if (u.range>0 && u.kind!=="harvester" && u.kind!=="engineer"){
    const enemyTeam = (u.team===TEAM.PLAYER) ? TEAM.ENEMY : TEAM.PLAYER;
    const sniperMode = (u.kind==="sniper" || (u.kind==="ifv" && u.passKind==="sniper"));
    const manualLock = !!(u.order && u.order.manual && u.order.allowAuto!==true);
  
    // (1) Retaliation (ONLY when no player manual-locked order)
    if (!manualLock && u.aggroCd<=0 && u.lastAttacker!=null){
      const a = getEntityById(u.lastAttacker);
      if (a && a.alive && a.team===enemyTeam){
        if (!sniperMode || isEnemyInf(a)){
          const vis = UNIT[e.kind].vision || 280;
          if (dist2(u.x,u.y,a.x,a.y) <= vis*vis){
            u.target = a.id;
            u.order = {type:"attack", x:u.x,y:u.y, tx:null,ty:null};
            setPathTo(u, a.x, a.y);
            u.repathCd = 0.35;
            u.aggroCd = 0.35;
          }
        }
      }
    }
  
    // (3) If attacking a building, but a unit is nearby, switch to that unit (non-sniper only)
    // Player manual-locked attack must NOT retarget.
    if (!sniperMode && u.aggroCd<=0 && u.order && u.order.type==="attack" && !(u.order.manual && u.order.lockTarget)){
      const cur = getEntityById(u.target);
      if (cur && BUILD[cur.kind]){
        const vis = UNIT[e.kind].vision || 280;
        const cand = findNearestEnemyFor(u.team, u.x, u.y, vis, false, true); // unitOnly
        if (cand){
          u.target = cand.id;
          setPathTo(u, cand.x, cand.y);
          u.repathCd = 0.35;
          u.aggroCd = 0.35;
        }
      }
    }
  
    // (2) Auto-acquire if we don't have a target and are not currently committed to a building attack
    const committed = (u.order && u.order.type==="attack" && u.target!=null);
    const okAuto = (!committed) && !u.target && !manualLock &&
      (u.order.type==="idle" || u.order.type==="guard" || u.order.type==="guard_return" ||
       (u.order.type==="move" && !(u.forceMoveUntil && state.t < u.forceMoveUntil)));
  
    if (u.aggroCd<=0 && okAuto){
      const vis = UNIT[e.kind].vision || 280;
      const cand = findNearestEnemyFor(u.team, u.x, u.y, vis, sniperMode, true); // unitOnly
      if (cand){
        if (!sniperMode || isEnemyInf(cand)){
          u.order = {type:"attack", x:u.x,y:u.y, tx:null,ty:null};
          u.target = cand.id;
          setPathTo(u, cand.x, cand.y);
          u.repathCd = 0.35;
          u.aggroCd = 0.35;
        }
      }
    }
  }
  const moved=Math.hypot(u.x-u.lastPosX, u.y-u.lastPosY);
        const tryingToMove = (u.order && (u.order.type==="move" || u.order.type==="attackmove" || u.order.type==="attack") && !u.holdAttack);
        if (tryingToMove){
          if (moved<0.55) u.stuckTime += dt;
          else { u.stuckTime=0; u.lastPosX=u.x; u.lastPosY=u.y; }
        } else {
          u.stuckTime = 0;
          u.lastPosX=u.x; u.lastPosY=u.y;
        }
  
        // Strong de-jam: repath early, warp sooner if needed. Goal: never permanent jams.
        if (u.stuckTime>0.45 && u.repathCd<=0){
          if (u.order && u.order.type==="move"){
            const dd = dist2(u.x,u.y,u.order.x,u.order.y);
            if (dd < 18*18){
              u.order = {type:"idle", x:u.x, y:u.y, tx:null, ty:null};
              u.path = null; u.pathI = 0;
                clearReservation(u);
              u.stuckTime = 0;
              u.repathCd = 0.35;
            } else {
              const jx = u.order.x + rnd(-36,36);
              const jy = u.order.y + rnd(-36,36);
              setPathTo(u, jx, jy);
              u.repathCd = 0.25;
  
              if (u.stuckTime > 1.05){
                const fp = findNearestFreePoint(u.x, u.y, u, 28);
                u.x = fp.x; u.y = fp.y;
                u.path = null; u.pathI = 0;
                u.repathCd = 0.45;
                u.stuckTime = 0;
              } else {
                u.stuckTime = 0;
              }
            }
          } else {
            u.x = clamp(u.x + rnd(-6,6), 0, WORLD_W);
            u.y = clamp(u.y + rnd(-6,6), 0, WORLD_H);
            u.stuckTime = 0;
            u.repathCd = 0.25;
          }
        }
  
  
        // Combat behavior: guard + attack-move
        if (u.kind!=="harvester"){
          // Guard mode (G): hold position, chase kills, then return to guard point.
          if (u.order.type==="guard" || u.order.type==="guard_return"){
            // returning to origin
            if (u.order.type==="guard_return"){
              followPath(u, dt);
              if (dist2(u.x,u.y,u.guard?.x0||u.x,u.guard?.y0||u.y) < 70*70){
                // snap back and resume scanning
                if (u.guard){ u.x=u.guard.x0; u.y=u.guard.y0; }
                u.order.type="guard";
                u.guardFrom=false;
                u.path=null;
              }
              continue;
            }
  
            // scan for enemy in vision, then engage (will be handled by attack state)
            const scanR = Math.max(u.vision||0, (u.range||0));
            const enemy = findNearestAttackMoveTargetFor(u.team, u.x, u.y, scanR);
            if (enemy){
              u.order={type:"attack", x:u.x, y:u.y, tx:null,ty:null};
              u.target=enemy.id;
              // mark that this attack came from guard
              u.guardFrom=true;
              setPathTo(u, enemy.x, enemy.y);
              u.repathCd=0.25;
            }
            // otherwise, just stay put
            settleInfantryToSubslot(u, dt);
            continue;
          }
  
          // Attack-move: march toward destination, but engage enemies on the way.
  
          if (u.order.type==="attackmove"){
            const enemy = findNearestAttackMoveTargetFor(u.team, u.x, u.y, u.range||0, u.kind);
            if (enemy){
              u.order={type:"attack", x:u.x, y:u.y, tx:null,ty:null};
              u.target=enemy.id;
              setPathTo(u, enemy.x, enemy.y);
              u.repathCd=0.25;
            } else {
              followPath(u, dt);
            }
            continue;
          }
  
          // Keep infantry glued to its tile sub-slot after arrival (prevents post-arrival vibration when stacked).
          settleInfantryToSubslot(u, dt);
  
          // Guard/idle auto-acquire: if standing idle and an enemy enters range, engage.
          if (u.order.type==="idle" && (u.range||0)>0 && u.kind!=="engineer"){
            const sniperMode = (u.kind==="sniper" || (u.kind==="ifv" && u.passKind==="sniper"));
    const manualLock = !!(u.order && u.order.manual && u.order.allowAuto!==true);
            const enemy = findNearestEnemyFor(u.team, u.x, u.y, u.range||0, sniperMode, true);
            if (enemy){
            if (sniperMode){
              if (BUILD[enemy.kind]) { /* ignore */ }
              else {
                const cls = (UNIT[enemy.kind] && UNIT[enemy.kind].cls) ? UNIT[enemy.kind].cls : "";
                if (cls!=="inf") { /* ignore */ }
                else {
              u.order={type:"attack", x:u.x, y:u.y, tx:null,ty:null};
              u.target=enemy.id;
              setPathTo(u, enemy.x, enemy.y);
              u.repathCd=0.3;
            }
                }
              }
            }
          }
        }
  
  if (u.kind==="harvester"){
          // Harvester orders: move, harvest, return (deposit)
          if (u.order.type==="move"){
            followPath(u,dt);
            continue;
          }
  
          if (u.order.type==="return"){
            // Force-return to refinery and deposit carry.
            let ref = getEntityById(u.target);
            if (!ref || !ref.alive || ref.kind!=="refinery" || ref.team!==u.team){
              ref = findNearestRefinery(u.team,u.x,u.y);
              u.target = ref ? ref.id : null;
            }
            if (!ref){ u.order.type="idle"; continue; }
  
            const dock=getDockPoint(ref,u);
  
            if (u.repathCd<=0){
              const gTx=(dock.x/TILE)|0, gTy=(dock.y/TILE)|0;
              if (u.lastGoalTx!==gTx || u.lastGoalTy!==gTy){
                setPathTo(u, dock.x, dock.y);
                u.repathCd=0.55;
              }
            }
            followPath(u,dt);
  
            const nearDock = dist2(u.x,u.y,dock.x,dock.y) < 70*70;
            const refR = (Math.max(ref.w, ref.h)*0.55 + 90);
            const nearRef = dist2(u.x,u.y,ref.x,ref.y) < refR*refR;
            if (nearDock || nearRef){
              if (u.carry>0){
                const add = Math.floor(u.carry);
                if (u.team===TEAM.PLAYER) state.player.money += add;
                else state.enemy.money += add;
                u.carry = 0;
              }
              // Back to manual ore if set, otherwise auto.
              if (u.manualOre){
                u.order={type:"harvest", x:u.x,y:u.y, tx:u.manualOre.tx, ty:u.manualOre.ty};
                setPathTo(u, (u.manualOre.tx+0.5)*TILE, (u.manualOre.ty+0.5)*TILE);
                u.repathCd=0.25;
              } else {
                // After deposit: immediately resume auto-harvest.
                u.order = {type:"idle", x:u.x, y:u.y, tx:null, ty:null};
                u.target = null;
                u.path = null; u.pathI = 0;
                u.manualOre = null;
                u.repathCd = 0.10;
              }
            }
            continue;
          }
  
          if (u.order.type==="idle"){
            // Auto-find ore patch (prefer nearby; fallback to nearest anywhere)
            let best=null, bestD=Infinity;
            const cx=tileOfX(u.x), cy=tileOfY(u.y);
  
            // 1) Nearby scan (cheap)
            const R=18;
            for (let dy=-R; dy<=R; dy++){
              for (let dx=-R; dx<=R; dx++){
                const tx=cx+dx, ty=cy+dy;
                if (!inMap(tx,ty)) continue;
                const ii=idx(tx,ty);
                if (terrain[ii]!==2) continue;
                if (ore[ii]<=0) continue;
                const pTile=tileToWorldCenter(tx,ty);
                const px=pTile.x, py=pTile.y;
                const d=dist2(u.x,u.y,px,py);
                if (d<bestD){ bestD=d; best={tx,ty}; }
              }
            }
  
            // 2) Global fallback: pick the nearest ore tile anywhere (not "first found")
            if (!best){
              for (let ty=0; ty<MAP_H; ty++){
                for (let tx=0; tx<MAP_W; tx++){
                  const ii=idx(tx,ty);
                  if (terrain[ii]!==2) continue;
                  if (ore[ii]<=0) continue;
                  const pTile=tileToWorldCenter(tx,ty);
                const px=pTile.x, py=pTile.y;
                  const d=dist2(u.x,u.y,px,py);
                  if (d<bestD){ bestD=d; best={tx,ty}; }
                }
              }
            }
  
            if (best){
              u.order={type:"harvest", x:u.x,y:u.y, tx:best.tx, ty:best.ty};
              setPathTo(u, (best.tx+0.5)*TILE, (best.ty+0.5)*TILE);
              u.repathCd=0.25;
            }
            continue;
          }
          if (u.order.type==="harvest"){
            // v27: Harvester will keep mining nearby ore until full,
            // unless there is no ore left in the nearby area.
  
            const seekNearbyOre = () => {
              const cx=tileOfX(u.x), cy=tileOfY(u.y);
              const R=7;
              let best=null, bestD=Infinity;
              for (let dy=-R; dy<=R; dy++){
                for (let dx=-R; dx<=R; dx++){
                  const ax=cx+dx, ay=cy+dy;
                  if (!inMap(ax,ay)) continue;
                  const ii=idx(ax,ay);
                  if (terrain[ii]!==2) continue;
                  if (ore[ii]<=0) continue;
                  const pA=tileToWorldCenter(ax,ay);
                  const px=pA.x, py=pA.y;
                  const d=dist2(u.x,u.y,px,py);
                  if (d<bestD){ bestD=d; best={tx:ax, ty:ay}; }
                }
              }
              return best;
            };
  
            let tx=u.order.tx, ty=u.order.ty;
            const curOk = inMap(tx,ty) && ore[idx(tx,ty)]>0;
  
            if (!curOk){
              if (u.carry < u.carryMax-1){
                const n=seekNearbyOre();
                if (n){
                  u.order.tx=n.tx; u.order.ty=n.ty;
                  setPathTo(u, (n.tx+0.5)*TILE, (n.ty+0.5)*TILE);
                  u.repathCd=0.25;
                  continue;
                }
              }
              // No nearby ore: deposit if we have cargo, otherwise idle.
              if (u.carry>0){
                const ref=findNearestRefinery(u.team,u.x,u.y);
                if (ref){
                  u.target = ref.id;
                  u.order.type="return";
                  const dock=getDockPoint(ref,u);
                  setPathTo(u,dock.x,dock.y);
                  u.repathCd=0.25;
                } else {
                  u.order.type="idle";
                }
              } else {
                u.order.type="idle";
                u.manualOre=null;
              }
              continue;
            }
  
            // Travel to ore
            followPath(u,dt);
            tx=u.order.tx; ty=u.order.ty;
            const pTile=tileToWorldCenter(tx,ty);
                const px=pTile.x, py=pTile.y;
  
            if (dist2(u.x,u.y,px,py) < (TILE*0.75)*(TILE*0.75)){
              // Mine ONLY when standing still on the ore tile (no mining while moving).
              if (u.path && u.pathI < u.path.length-1) { continue; }
  
              const ii=idx(tx,ty);
              const take=Math.min(140*dt, ore[ii], u.carryMax-u.carry);
              ore[ii] -= take;
              u.carry += take;
  
              // If full, go deposit.
              if (u.carry >= u.carryMax-1){
                const ref=findNearestRefinery(u.team,u.x,u.y);
                if (ref){
                  u.target = ref.id;
                  u.order.type="return";
                  const dock=getDockPoint(ref,u);
                  setPathTo(u,dock.x,dock.y);
                  u.repathCd=0.25;
                } else {
                  u.order.type="idle";
                }
              } else if (ore[ii] <= 0){
                // Current tile depleted: keep mining nearby ore if any.
                const n=seekNearbyOre();
                if (n){
                  u.order.tx=n.tx; u.order.ty=n.ty;
                  setPathTo(u, (n.tx+0.5)*TILE, (n.ty+0.5)*TILE);
                  u.repathCd=0.25;
                } else if (u.carry>0){
                  const ref=findNearestRefinery(u.team,u.x,u.y);
                  if (ref){
                    u.target = ref.id;
                    u.order.type="return";
                    const dock=getDockPoint(ref,u);
                    setPathTo(u,dock.x,dock.y);
                    u.repathCd=0.25;
                  } else {
                    u.order.type="idle";
                  }
                } else {
                  u.order.type="idle";
                  u.manualOre=null;
                }
              }
            }
            continue;
          }
        }
  if (u.kind==="engineer"){
          if (u.order.type==="move"){
            followPath(u,dt);
          } else if (u.order.type==="repairenter"){
            const t=getEntityById(u.target);
            if (!t || !BUILD[t.kind] || t.civ || t.team!==u.team){ u.order.type="idle"; u.target=null; continue; }
            const dock=getClosestPointOnBuilding(t,u);
            if (u.repathCd<=0){
              const gTx=(dock.x/TILE)|0, gTy=(dock.y/TILE)|0;
              if (u.lastGoalTx!==gTx || u.lastGoalTy!==gTy){
                setPathTo(u,dock.x,dock.y);
                u.repathCd=0.55;
              }
            }
            followPath(u,dt);
            const edgeD2 = dist2PointToRect(u.x,u.y, t.x, t.y, t.w, t.h);
            const dock2 = dist2(u.x,u.y, dock.x, dock.y);
            if (edgeD2 < 85*85 || dock2 < 90*90){
              // instant full repair, consume engineer
              t.hp = t.hpMax;
              t.repairOn = false;
              u.alive=false;
              state.selection.delete(u.id);
              u.order.type="idle";
              u.target=null;
            }
          } else if (u.order.type==="capture"){
  
            const t=getEntityById(u.target);
            if (!t || !BUILD[t.kind] || t.civ){ u.order.type="idle"; u.target=null; continue; }
            const dock=getClosestPointOnBuilding(t,u);
            if (u.repathCd<=0){
              const gTx=(dock.x/TILE)|0, gTy=(dock.y/TILE)|0;
              if (u.lastGoalTx!==gTx || u.lastGoalTy!==gTy){
                setPathTo(u,dock.x,dock.y);
                u.repathCd=0.55;
              }
            }
            followPath(u,dt);
            const edgeD2 = dist2PointToRect(u.x,u.y, t.x, t.y, t.w, t.h);
            const dock2 = dist2(u.x,u.y, dock.x, dock.y);
            if (edgeD2 < 85*85 || dock2 < 90*90){
              if (t.team!==u.team) captureBuilding(u,t);
              else { u.order.type="idle"; u.target=null; }
            }
          }
          continue;
        }
  
        // Auto-acquire: combat units will engage enemies that enter vision while idle.
        // Sniper rule: do NOT pre-emptively attack buildings or vehicle-class units (tanks/IFV/harvester, etc).
        if (u.order.type==="idle" && u.dmg>0 && u.range>0){
          const enemyTeam = u.team===TEAM.PLAYER ? TEAM.ENEMY : TEAM.PLAYER;
          const sniperLike = (u.kind==="sniper" || (u.kind==="ifv" && u.passKind==="sniper"));
          let best=null, bestD2=Infinity;
  
          // Enemy units
          for (const eu of units){
            if (!eu.alive || eu.team!==enemyTeam) continue;
  
            if (sniperLike){
              const cls = UNIT[eu.kind]?.cls;
              if (cls==="veh") continue; // ignore vehicles for auto-acquire
            }
  
            // Player units don't auto-target into unexplored fog.
            if (u.team===TEAM.PLAYER){
              const tx=(eu.x/TILE)|0, ty=(eu.y/TILE)|0;
              if (inMap(tx,ty) && !explored[TEAM.PLAYER][idx(tx,ty)]) continue;
            }
  
            const d2=dist2(u.x,u.y,eu.x,eu.y);
            if (d2 <= u.vision*u.vision && d2 < bestD2){ best=eu; bestD2=d2; }
          }
  
          // Enemy buildings (snipers never auto-acquire buildings)
          if (!sniperLike){
            for (const eb of buildings){
              if (!eb.alive || eb.attackable===false) continue;
              if (eb.team!==enemyTeam) continue;
              if (u.team===TEAM.PLAYER){
                const tx=(eb.x/TILE)|0, ty=(eb.y/TILE)|0;
                if (inMap(tx,ty) && !explored[TEAM.PLAYER][idx(tx,ty)]) continue;
              }
              const d2=dist2(u.x,u.y,eb.x,eb.y);
              if (d2 <= u.vision*u.vision && d2 < bestD2){ best=eb; bestD2=d2; }
            }
          }
  
          if (best){
            u.order.type="attack";
            u.target = best.id;
            setPathTo(u, best.x, best.y);
            u.repathCd=0.25;
          }
        }

  return { buildFormationOffsets, aStarPath, findPath, issueMoveAll };
}
