(function(global){
  "use strict";
  const OUCommands = global.OUCommands || (global.OUCommands = {});

  OUCommands.create = function(ctx){
    const {
      state,
      getEntityById,
      TEAM,
      BUILD,
      UNIT,
      setPathTo,
      pushOrderFx,
      showUnitPathFx,
      canEnterTile,
      reserveTile,
      findNearestFreePoint,
      tileToWorldCenter,
      tileToWorldSubslot,
      inMap,
      snapWorldToTileCenter,
      buildFormationOffsets,
      shouldIgnoreCmd,
      stampCmd,
      TILE,
      getClosestPointOnBuilding,
      getChasePointForAttack,
      tileOfX,
      tileOfY,
      toast,
      L,
      INF_SLOT_MAX,
      clamp,
      dist2,
      updateSelectionUI
    } = ctx;

    function boardUnitIntoIFV(unit, ifv){
      if (!unit || !ifv) return false;
      if (!unit.alive || !ifv.alive) return false;
      if (ifv.kind!=="ifv" || ifv.team!==unit.team) return false;
      if (ifv.passengerId) return false;
      if (unit.inTransport) return false;
      if (unit.kind!=="infantry" && unit.kind!=="engineer" && unit.kind!=="sniper") return false;

      ifv.passengerId = unit.id;
      ifv.passKind = unit.kind;
      if (unit.kind==="sniper"){
        const sr = (UNIT.sniper && UNIT.sniper.range) || 1200;
        ifv.dmg = 125; ifv.range = sr; ifv.rof = 2.20/2.0; ifv.hitscan = true;
      } else if (unit.kind==="infantry"){
        ifv.dmg = (UNIT.infantry && UNIT.infantry.dmg) || 12; ifv.range = 620; ifv.rof = 0.55/2.0; ifv.hitscan = true;
      } else if (unit.kind==="engineer"){
        ifv.dmg = 0; ifv.range = 0; ifv.hitscan = true;
      }
      unit.inTransport = ifv.id;
      unit.hidden = true;
      unit.selectable = false;
      unit.wantsBoard = null;
      return true;
    }

    function tryBoardIFV(ifv){
      if (!ifv || !ifv.alive || ifv.kind!=="ifv" || ifv.team!==TEAM.PLAYER) return false;
      if (ifv.passengerId) { toast(L ? L("toast.alreadyBoarded") : "이미 탑승중"); return true; }

      let cand=null;
      for (const id of state.selection){
        const u=getEntityById(id);
        if (!u || !u.alive || u.team!==TEAM.PLAYER) continue;
        if (u.kind!=="infantry" && u.kind!=="engineer" && u.kind!=="sniper") continue;
        const d2 = dist2(u.x,u.y,ifv.x,ifv.y);
        if (d2<=65*65){ cand=u; break; }
      }
      if (!cand){ toast(L ? L("toast.noInfNear") : "탑승할 보병이 근처에 없음"); return true; }

      ifv.passengerId = cand.id;
      ifv.passKind = cand.kind;
      if (cand.kind==="sniper"){
        const sr = (UNIT.sniper && UNIT.sniper.range) || 1200;
        ifv.dmg = 125; ifv.range = sr; ifv.rof = 2.20/2.0; ifv.hitscan = true;
      } else if (cand.kind==="infantry"){
        ifv.dmg = (UNIT.infantry && UNIT.infantry.dmg) || 12; ifv.range = 620; ifv.rof = 0.55/2.0; ifv.hitscan = true;
      } else if (cand.kind==="engineer"){
        ifv.dmg = 0; ifv.range = 0; ifv.hitscan = true;
      }
      cand.inTransport = ifv.id;
      cand.hidden = true;
      cand.selectable = false;
      state.selection.delete(cand.id);
      if (updateSelectionUI) updateSelectionUI();
      toast(L ? L("toast.boarded") : "탑승");
      return true;
    }

    function tryUnloadIFV(ifv){
      if (!ifv || !ifv.alive || ifv.kind!=="ifv") return false;
      if (!ifv.passengerId) return false;
      const u=getEntityById(ifv.passengerId);

      const sp = findNearestFreePoint(ifv.x+TILE*0.8, ifv.y+TILE*0.2, ifv, 6);
      const maxUnloadDist2 = (4 * TILE) * (4 * TILE);
      const spValid = sp && (sp.found || (sp.x!=null && sp.y!=null)) && dist2(ifv.x, ifv.y, sp.x, sp.y) <= maxUnloadDist2;
      const x = spValid ? sp.x : (ifv.x + TILE*0.8);
      const y = spValid ? sp.y : (ifv.y + TILE*0.2);

      if (!spValid){
        if (ifv.team===TEAM.PLAYER) toast(L ? L("toast.noUnloadSpace") : "하차할 공간이 없습니다");
        return false;
      }
      if (u){
        u.inTransport = null;
        u.hidden = false;
        u.selectable = true;
        u.x=x; u.y=y;
        u.order = {type:"move", x:x, y:y, tx:null, ty:null};
        setPathTo(u, x, y);
      }
      ifv.passengerId = null;
      ifv.passKind = null;
      if (ifv.team===TEAM.PLAYER) toast(L ? L("toast.unboard") : "하차");
      return true;
    }

    function issueMoveAll(x,y){
      const ids=[...state.selection];
      const snap = snapWorldToTileCenter(x,y);
      const baseTx=snap.tx, baseTy=snap.ty;

      const baseCenter = tileToWorldCenter(baseTx, baseTy);
      const intentVX = x - baseCenter.x;
      const intentVY = y - baseCenter.y;

      const offsets = buildFormationOffsets(Math.max(16, ids.length*6));
      const used = new Set();
      const infCount = new Map();
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
        e.fireHoldT=0; e.fireDir=null;
        e.forceMoveUntil = state.t + 1.25;
        e.repathCd=0.15;

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
          const dxw = (wpC.x - x), dyw = (wpC.y - y);
          const ring = (Math.abs(offsets[j].dx)+Math.abs(offsets[j].dy));
          const dot = (offsets[j].dx*intentVX + offsets[j].dy*intentVY);
          const score = dxw*dxw + dyw*dyw + ring*9 - dot*1.2;
          if (score < bestScore){
            bestScore=score;
            chosen={tx,ty};
          }
          if (score < 1) break;
        }
        if (chosen){
          if (!reserveTile(e, chosen.tx, chosen.ty)){
            chosen=null;
          } else {
            used.add(chosen.tx+","+chosen.ty);
          }
        }
        if (!chosen){
          const spot=findNearestFreePoint(baseCenter.x, baseCenter.y, e, 5);
          if (spot && spot.found){
            const nTx=tileOfX(spot.x), nTy=tileOfY(spot.y);
            if (inMap(nTx,nTy) && canEnterTile(e, nTx, nTy)){
              const key=nTx+","+nTy;
              const eCls=(UNIT[e.kind] && UNIT[e.kind].cls) ? UNIT[e.kind].cls : "";
              if (eCls==="inf"){
                const c=infCount.get(key)||0;
                if (c<INF_SLOT_MAX && reserveTile(e, nTx, nTy)){
                  infCount.set(key, c+1);
                  chosen={tx:nTx, ty:nTy};
                }
              } else if (reserveTile(e, nTx, nTy)){
                chosen={tx:nTx, ty:nTy};
                used.add(key);
              }
            }
          }
          if (!chosen) chosen={tx:baseTx, ty:baseTy};
        }
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
        e.order={type:"move", x:wp.x, y:wp.y, tx:chosen.tx, ty:chosen.ty, subSlot:subSlot, manual:true, allowAuto:false};

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

        showUnitPathFx(u, u.x, u.y, "rgba(120,255,120,0.9)");
      }
    }

    function issueAttack(targetId){
      const t=getEntityById(targetId);
      if (!t || t.attackable===false) return;

      const ids=[...state.selection];
      const spacing=0.85*TILE;
      const atkUnits = [];
      for (let k=0;k<ids.length;k++){
        const uu=getEntityById(ids[k]);
        if (!uu || !uu.alive || uu.type!=="unit") continue;
        const isEngIFV = (uu.kind==="ifv" && uu.passKind==="engineer");
        if (isEngIFV) continue;
        if (!uu.canAttack) continue;
        atkUnits.push(uu);
      }
      let cx=0, cy=0;
      for (const uu of atkUnits){ cx+=uu.x; cy+=uu.y; }
      if (atkUnits.length){ cx/=atkUnits.length; cy/=atkUnits.length; }
      const baseAng = Math.atan2(cy - t.y, cx - t.x);
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
        uu.atkSlotRing = ring;
      }

      // Path budget is per-frame; issuing many attack orders at once exhausts it.
      // Only setPathTo for first N units; rest get order+target, sim will path them next tick.
      const MAX_INITIAL_PATHS = 12;
      let pathsSet = 0;

      for (let i=0;i<ids.length;i++){
        const u=getEntityById(ids[i]);
        if (!u || !u.alive || u.type!=="unit") continue;

        const isEngIFV = (u.kind==="ifv" && u.passKind==="engineer");

        if (!isEngIFV){
          if (!u.canAttack) continue;
        } else {
          u.target = null;
          u.forceFire = null;
        }
        if (state.mouseMode==="repair" || state.mouseMode==="sell") continue;
        if (shouldIgnoreCmd(u,"attack",u.x,u.y,targetId)) continue;

        const ring=Math.floor(Math.sqrt(i));
        const ang=(i*2.1)%(Math.PI*2);
        const off=(ring+1)*spacing;
        const ox=Math.cos(ang)*off;
        const oy=Math.sin(ang)*off;

        if (isEngIFV){
          u.order = { type:"move", x:u.x, y:u.y, tx:null, ty:null, manual:true, allowAuto:false, lockTarget:false };
          u.holdPos = false;
          const p=getChasePointForAttack(u,t);
          const gx = p.x+ox, gy = p.y+oy;
          const gtx = tileOfX(gx), gty = tileOfY(gy);
          if (pathsSet < MAX_INITIAL_PATHS){
            const ok=setPathTo(u, gx, gy);
            if (ok) pathsSet++;
            else { u.path = [{tx:gtx, ty:gty}]; u.pathI=0; }
          } else { u.path = [{tx:gtx, ty:gty}]; u.pathI=0; u.repathCd=0; }
          u.orderFx = {t:0.55, kind:"move", x:gx, y:gy, targetId};
          pushOrderFx(u.id,"move",gx,gy,targetId,"rgba(90,255,90,0.95)");
        } else {
          u.order={type:"attack", x:u.x, y:u.y, tx:null, ty:null, manual:true, allowAuto:false, lockTarget:true};
          u.target=targetId;
          u.forceFire=null;

          const p=getChasePointForAttack(u,t);
          const gx = p.x+ox, gy = p.y+oy;
          const gtx = tileOfX(gx), gty = tileOfY(gy);
          if (pathsSet < MAX_INITIAL_PATHS){
            const ok=setPathTo(u, gx, gy);
            if (ok) pathsSet++;
            else { u.path = [{tx:gtx, ty:gty}]; u.pathI=0; }
          } else {
            u.path = [{tx:gtx, ty:gty}]; u.pathI=0;
            u.repathCd=0;
          }
          u.orderFx = {t:0.55, kind:"attack", x:gx, y:gy, targetId};
          pushOrderFx(u.id,"attack",gx,gy,targetId,"rgba(255,70,70,0.95)");
        }
      }
    }

    function issueForceAttack(targetId){
      const t=getEntityById(targetId);
      if (!t || t.attackable===false || !t.alive) return;
      for (const id of state.selection){
        const e=getEntityById(id);
        if (!e || e.team!==TEAM.PLAYER) continue;
        if (BUILD[e.kind]){
          if (e.kind==="turret"){
            e.forceFire = { mode:"id", id: targetId };
            toast(L ? L("toast.attackSet") : "공격 지정");
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
            toast(L ? L("toast.attackSet") : "공격 지정");
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

    function issueEngineerRepair(targetId){
      const t=getEntityById(targetId);
      if (!t || !BUILD[t.kind] || t.civ) return;
      if (t.team!==TEAM.PLAYER) return;
      if (t.hp >= t.hpMax-0.5){ toast(L ? L("toast.repairUnneeded") : "수리 불필요"); return; }
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
        pushOrderFx(u.id,"harvest",gx,gy,null,"rgba(255,70,70,0.95)");
        showUnitPathFx(u, gx, gy, "rgba(255,90,90,0.85)");
        stampCmd(u,'harvest',gx,gy,null);

        u.repathCd=0.25;
        u.stuckTime=0;
      }
    }

    function issueIFVRepair(targetId){
      const t=getEntityById(targetId);
      if (!t || !t.alive || t.team!==TEAM.PLAYER) return;
      if (BUILD[t.kind]) return;
      const tcls = (UNIT[t.kind] && UNIT[t.kind].cls) ? UNIT[t.kind].cls : "";
      if (tcls!=="veh") return;
      if (t.hp >= t.hpMax-0.5){ toast(L ? L("toast.repairUnneeded") : "수리 불필요"); return; }

      for (const id of state.selection){
        const u=getEntityById(id);
        if (!u || !u.alive || u.team!==TEAM.PLAYER) continue;
        if (u.kind!=="ifv" || u.passKind!=="engineer") continue;
        u.repairTarget = t.id;
        u.order = {type:"move", x:u.x,y:u.y, tx:null,ty:null};
        setPathTo(u, t.x, t.y);
        u.repathCd = 0.25;
      }
      toast(L ? L("toast.ifvRepair") : "IFV 수리");
    }

    function issueForceMoveAll(x,y){
      const ids=[...state.selection];
      const snap = snapWorldToTileCenter(x,y);
      const baseTx=snap.tx, baseTy=snap.ty;

      const baseCenter = tileToWorldCenter(baseTx, baseTy);
      const intentVX = x - baseCenter.x;
      const intentVY = y - baseCenter.y;

      const offsets = buildFormationOffsets(Math.max(16, ids.length*6));
      const used = new Set();
      const infCount = new Map();
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
        e.fireHoldT=0; e.fireDir=null;
        e.forceMoveUntil = state.t + 2.5;
        e.repathCd=0.10;

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
          const dxw = (wpC.x - x), dyw = (wpC.y - y);
          const ring = (Math.abs(offsets[j].dx)+Math.abs(offsets[j].dy));
          const dot = (offsets[j].dx*intentVX + offsets[j].dy*intentVY);
          const score = dxw*dxw + dyw*dyw + ring*9 - dot*1.2;
          if (score < bestScore){
            bestScore=score;
            chosen={tx,ty};
          }
          if (score < 1) break;
        }
        if (chosen){
          if (!reserveTile(e, chosen.tx, chosen.ty)){
            chosen=null;
          } else {
            used.add(chosen.tx+","+chosen.ty);
          }
        }
        if (!chosen){
          const spot=findNearestFreePoint(baseCenter.x, baseCenter.y, e, 5);
          if (spot && spot.found){
            const nTx=tileOfX(spot.x), nTy=tileOfY(spot.y);
            if (inMap(nTx,nTy) && canEnterTile(e, nTx, nTy)){
              const key=nTx+","+nTy;
              const eCls=(UNIT[e.kind] && UNIT[e.kind].cls) ? UNIT[e.kind].cls : "";
              if (eCls==="inf"){
                const c=infCount.get(key)||0;
                if (c<INF_SLOT_MAX && reserveTile(e, nTx, nTy)){
                  infCount.set(key, c+1);
                  chosen={tx:nTx, ty:nTy};
                }
              } else if (reserveTile(e, nTx, nTy)){
                chosen={tx:nTx, ty:nTy};
                used.add(key);
              }
            }
          }
          if (!chosen) chosen={tx:baseTx, ty:baseTy};
        }
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
        e.order={type:"move", x:wp.x, y:wp.y, tx:chosen.tx, ty:chosen.ty, subSlot:subSlot, manual:true, allowAuto:false, lockTarget:false};

        e.holdPos = false;
        pushOrderFx(e.id,"move",wp.x,wp.y,null,"rgba(90,255,90,0.95)");
        setPathTo(e, wp.x, wp.y);
        showUnitPathFx(e, wp.x, wp.y, "rgba(255,255,255,0.85)");
        stampCmd(e,'move',wp.x,wp.y,null);
        k++;
      }
    }

    return {
      issueMoveAll,
      issueMoveCombatOnly,
      issueAttackMove,
      issueGuard,
      issueAttack,
      issueForceAttack,
      issueForceFirePos,
      issueCapture,
      issueEngineerRepair,
      issueHarvest,
      issueIFVRepair,
      issueForceMoveAll,
      boardUnitIntoIFV,
      tryBoardIFV,
      tryUnloadIFV
    };
  };
})(window);
