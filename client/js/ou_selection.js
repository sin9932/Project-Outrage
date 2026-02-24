/* ou_selection.js
   Selection logic: rect select, same-type select, control groups.
*/
(function(global){
  "use strict";

  const OUSelection = global.OUSelection || (global.OUSelection = {});

  OUSelection.create = function(ctx){
    const {
      state,
      units,
      buildings,
      controlGroups,
      BUILD,
      TEAM,
      UNIT,
      getEntityById,
      worldToScreen,
      cam,
      toast,
      updateSelectionUI,
      tileOfX,
      tileOfY,
      inMap,
      explored,
      idx,
      tileToWorldSubslot,
      dist2,
      pointInPoly,
      buildingScreenPoly,
      ISO_X,
      TILE
    } = ctx;

    const _buildingScreenPoly = buildingScreenPoly || ((typeof window !== "undefined" && window.OU && typeof window.OU.createBuildingScreenPoly === "function" && TILE && worldToScreen)
      ? window.OU.createBuildingScreenPoly(TILE, worldToScreen)
      : (b)=>{ const p=worldToScreen(b.x,b.y); return [p,p,p,p]; });

    function getAllPlayerUnitsOfKind(kind){
      return units.filter(u=>u.alive && u.team===TEAM.PLAYER && u.kind===kind && u.inTransport==null).map(u=>u.id);
    }

    function isSelectionExactly(ids){
      if (state.selection.size !== ids.length) return false;
      for (const id of ids) if (!state.selection.has(id)) return false;
      return true;
    }

    function selectInRect(r, additive){
      const beforeSize = state.selection.size;
      const pickedIds = [];

      const circleHitsRect = (cx,cy,cr, rx,ry,rw,rh)=>{
        const nx = Math.max(rx, Math.min(cx, rx+rw));
        const ny = Math.max(ry, Math.min(cy, ry+rh));
        const dx = cx-nx, dy = cy-ny;
        return (dx*dx+dy*dy) <= cr*cr;
      };

      for (const u of units){
        if (!u.alive || u.team!==TEAM.PLAYER) continue;
        const p = worldToScreen(u.x,u.y);
        const rr = (u.r || 10) * cam.zoom;
        if (circleHitsRect(p.x,p.y, rr, r.x0, r.y0, (r.x1-r.x0), (r.y1-r.y0))) pickedIds.push(u.id);
      }

      if (pickedIds.length===0) return false;
      if (!additive) state.selection.clear();
      for (const id of pickedIds) state.selection.add(id);

      const first = getEntityById(pickedIds[0]);
      if (first && !BUILD[first.kind]){
        state.lastSingleId = first.id;
        state.lastSingleKind = first.kind;
      }
      return state.selection.size !== beforeSize;
    }

    function selectSameType(){
      if (!state.selection || state.selection.size===0){
        toast("선택한 유닛이 없음");
        return;
      }

      for (const id of state.selection){
        const e=getEntityById(id);
        if (e && e.alive && e.team===TEAM.PLAYER && e.kind==="ifv"){
          const ids = getAllPlayerUnitsOfKind("ifv");
          if (ids && ids.length){
            state.selection.clear();
            for (const id2 of ids) state.selection.add(id2);
            state.lastSingleKind = "ifv";
            state.lastSingleId = ids[0];
            updateSelectionUI();
          }
          return;
        }
      }

      let refKind = null;
      if (state.lastSingleKind){
        for (const id of state.selection){
          const e=getEntityById(id);
          if (e && e.alive && e.inTransport==null && !BUILD[e.kind] && e.team===TEAM.PLAYER && e.kind===state.lastSingleKind){
            refKind = state.lastSingleKind;
            break;
          }
        }
      }
      if (!refKind){
        for (const id of state.selection){
          const e=getEntityById(id);
          if (e && e.alive && e.inTransport==null && !BUILD[e.kind] && e.team===TEAM.PLAYER){
            refKind = e.kind;
            break;
          }
        }
      }
      if (!refKind){
        toast("선택한 유닛이 없음");
        return;
      }

      const ids = getAllPlayerUnitsOfKind(refKind);
      if (!ids || ids.length===0){
        toast("대상 없음");
        return;
      }

      state.selection.clear();
      for (const id of ids) state.selection.add(id);

      state.lastSingleKind = refKind;
      state.lastSingleId = ids[0];

      updateSelectionUI();
    }

    function assignControlGroup(n){
      if (n<1 || n>9) return;
      const prev = controlGroups[n] || [];
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

    function pickEntityAtWorld(wx, wy){
      if (!worldToScreen || !units || !buildings) return null;
      const m = worldToScreen(wx, wy);
      const _dist2 = dist2 || ((ax,ay,bx,by)=>{const dx=ax-bx,dy=ay-by;return dx*dx+dy*dy;});
      const _pointInPoly = pointInPoly || (()=>false);

      for (let i=units.length-1;i>=0;i--){
        const u=units[i];
        if (!u.alive) continue;
        if (u.inTransport) continue;
        const tx=tileOfX ? tileOfX(u.x) : 0, ty=tileOfY ? tileOfY(u.y) : 0;
        if (u.team===TEAM.ENEMY && explored && inMap && idx && inMap(tx,ty) && !explored[TEAM.PLAYER][idx(tx,ty)]) continue;
        let p;
        const utx=tileOfX ? tileOfX(u.x) : 0, uty=tileOfY ? tileOfY(u.y) : 0;
        const cls = (UNIT && UNIT[u.kind] && UNIT[u.kind].cls) ? UNIT[u.kind].cls : "";
        if (cls==="inf" && tileToWorldSubslot){
          const sp = tileToWorldSubslot(utx,uty,(u.subSlot|0));
          p=worldToScreen(sp.x, sp.y);
        } else {
          p=worldToScreen(u.x,u.y);
        }
        const pr = (u.kind==="ifv") ? (u.r*0.60) : (u.r||10);
        if (_dist2(p.x,p.y,m.x,m.y) <= (pr*cam.zoom)*(pr*cam.zoom)) return u;
      }

      for (let i=buildings.length-1;i>=0;i--){
        const b=buildings[i];
        if (!b.alive || b.selectable===false) continue;
        if (b.civ) continue;
        if (b.team===TEAM.ENEMY && explored && inMap && idx && !explored[TEAM.PLAYER][idx(b.tx,b.ty)]) continue;

        const poly = _buildingScreenPoly(b);
        if (_pointInPoly(m.x,m.y,poly)) return b;

        const bp=worldToScreen(b.x,b.y);
        const rad=Math.max(b.tw||1,b.th||1)*(ISO_X||1)*0.45*cam.zoom;
        if (_dist2(bp.x,bp.y,m.x,m.y) <= rad*rad) return b;
      }
      return null;
    }

    return {
      selectInRect,
      selectSameType,
      assignControlGroup,
      recallControlGroup,
      getAllPlayerUnitsOfKind,
      isSelectionExactly,
      pickEntityAtWorld
    };
  };

})(typeof window !== "undefined" ? window : global);
