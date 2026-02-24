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
      controlGroups,
      BUILD,
      TEAM,
      getEntityById,
      worldToScreen,
      cam,
      toast,
      updateSelectionUI
    } = ctx;

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

    return {
      selectInRect,
      selectSameType,
      assignControlGroup,
      recallControlGroup,
      getAllPlayerUnitsOfKind,
      isSelectionExactly
    };
  };

})(typeof window !== "undefined" ? window : global);
