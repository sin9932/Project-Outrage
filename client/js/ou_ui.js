// ou_ui.js
// - UI updates extracted from game.js (Stage 5)
// - Keep this file tiny + dependency-injected.

(function (global) {
  "use strict";

  const OUUI = global.OUUI || (global.OUUI = {});
  const isFn = (v) => typeof v === "function";

  OUUI.create = function create(refs) {
    const r = refs || {};

    function updateSelectionUI(env) {
      env = env || {};
      const {
        state, buildings, TEAM, COST, prodTotal, QCAP,
        hasRadarAlive, getEntityById, BUILD, NAME_KO
      } = env;

      if (!state || !buildings || !TEAM) return;

      // Selection count
      try{
        if (r.uiSelCount){
          const sel = state.sel && state.sel.length ? state.sel.length : 0;
          r.uiSelCount.textContent = String(sel);
        }
      }catch(_e){}

      // Radar status line
      try{
        if (r.uiRadarStat){
          if (hasRadarAlive && isFn(hasRadarAlive)){
            r.uiRadarStat.textContent = hasRadarAlive() ? "RADAR ONLINE" : "RADAR REQUIRED";
          } else {
            r.uiRadarStat.textContent = "RADAR REQUIRED";
          }
        }
      }catch(_e){}

      // Selection info
      try{
        if (r.uiSelInfo){
          if (!state.sel || !state.sel.length){
            r.uiSelInfo.textContent = "아무것도 선택 안 됨";
          } else {
            // Aggregate HP info for selected entities/buildings if available
            let lines = [];
            for (const id of state.sel){
              const e = getEntityById ? getEntityById(id) : null;
              if (!e) continue;
              const hp = (e.hp!=null && e.hpMax!=null) ? `${e.hp}/${e.hpMax}` : "";
              const name = e.kind ? (NAME_KO && NAME_KO[e.kind] ? NAME_KO[e.kind] : e.kind) : (e.name||"");
              if (name){
                lines.push(`[${name}] HP ${hp}`.trim());
              }
            }
            r.uiSelInfo.textContent = lines.length ? lines.join("\n") : "선택됨";
          }
        }
      }catch(_e){}

      // Minimap hint
      try{
        if (r.uiMmHint){
          r.uiMmHint.textContent = hasRadarAlive && isFn(hasRadarAlive) && hasRadarAlive()
            ? "미니맵 활성"
            : "";
        }
      }catch(_e){}
    }

    function updatePowerBar(env){
      env = env || {};
      const { state, clamp } = env;
      if (!state || !isFn(clamp)) return;

      const prod = Math.max(1, state.pwrProd || 0);
      const use = Math.max(0, state.pwrUse || 0);
      const need = Math.max(0, state.pwrNeed || 0);

      const fillPct = clamp(use / prod, 0, 1);
      const needPct = clamp(need / prod, 0, 1);

      if (r.uiPowerFill) r.uiPowerFill.style.height = `${Math.round(fillPct*100)}%`;
      if (r.uiPowerNeed) r.uiPowerNeed.style.height = `${Math.round(needPct*100)}%`;

      // Overload hint
      if (r.uiPowerFill){
        if (use >= prod){
          r.uiPowerFill.style.background = "linear-gradient(180deg, rgba(255,190,90,0.78), rgba(140,70,20,0.78))";
        } else {
          r.uiPowerFill.style.background = "linear-gradient(180deg, rgba(90,220,140,0.75), rgba(40,120,80,0.75))";
        }
      }
    }

    function updateProdBadges(env){
      env = env || {};
      const { prodTotal } = env;
      if (!prodTotal) return;

      function ensureBadge(btn){
        if (!btn) return null;
        let b = btn.querySelector(".badge");
        if (!b){
          b = document.createElement("span");
          b.className = "badge";
          btn.appendChild(b);
        }
        return b;
      }

      const set = (btn, kind)=>{
        if (!btn) return;
        const b = ensureBadge(btn);
        const n = prodTotal[kind] || 0;
        if (n > 0){
          b.textContent = String(n);
          b.style.display = "block";
        } else {
          b.textContent = "";
          b.style.display = "none";
        }
      };

      set(r.btnInf, "infantry");
      set(r.btnEng, "engineer");
      set(r.btnSnp, "sniper");
      set(r.btnTnk, "tank");
      set(r.btnHar, "harvester");
      set(r.btnIFV, "ifv");
    }

    function refreshPrimaryBuildingBadgesUI(env){
      env = env || {};
      const { state } = env;
      if (!state || !state.primary || !state.primary.player) return;

      const barId = state.primary.player.barracks;
      const facId = state.primary.player.factory;

      const hasBar = (barId != null && barId !== -1);
      const hasFac = (facId != null && facId !== -1);

      const barEl = r.badgeBar || document.getElementById("badgeBar");
      const facEl = r.badgeFac || document.getElementById("badgeFac");

      if (barEl) barEl.style.display = hasBar ? "inline-block" : "none";
      if (facEl) facEl.style.display = hasFac ? "inline-block" : "none";
    }

    function updateProdBars(env){
      env = env || {};
      const { state, buildings, TEAM, clamp, prodFIFO, NAME_KO } = env;
      if (!state || !buildings || !TEAM || !isFn(clamp)) return;

      // Building lanes
      function lanePct(lane){
        if (!lane) return 0;
        if (lane.ready) return 1;
        if (lane.queue){
          const c = lane.queue.cost || 1;
          return clamp((lane.queue.paid||0)/c, 0, 1);
        }
        if (lane.fifo && lane.fifo.length) return 0.01;
        return 0;
      }

      const mainLane = state.buildLane && state.buildLane.main;
      const defLane  = state.buildLane && state.buildLane.def;

      if (r.qFillMain) r.qFillMain.style.width = `${lanePct(mainLane)*100}%`;
      if (r.qFillDef)  r.qFillDef.style.width  = `${lanePct(defLane)*100}%`;

      if (r.qTxtMain){
        r.qTxtMain.textContent = (mainLane && mainLane.ready) ? `READY: ${(NAME_KO && NAME_KO[mainLane.ready]) ? NAME_KO[mainLane.ready] : mainLane.ready}` :
          (mainLane && mainLane.queue) ? `${(NAME_KO && NAME_KO[mainLane.queue.kind]) ? NAME_KO[mainLane.queue.kind] : mainLane.queue.kind} ${Math.round(lanePct(mainLane)*100)}%` :
          (mainLane && mainLane.fifo && mainLane.fifo.length) ? `예약 ${mainLane.fifo.length}` : "-";
      }
      if (r.qTxtDef){
        r.qTxtDef.textContent = (defLane && defLane.ready) ? `READY: ${(NAME_KO && NAME_KO[defLane.ready]) ? NAME_KO[defLane.ready] : defLane.ready}` :
          (defLane && defLane.queue) ? `${(NAME_KO && NAME_KO[defLane.queue.kind]) ? NAME_KO[defLane.queue.kind] : defLane.queue.kind} ${Math.round(lanePct(defLane)*100)}%` :
          (defLane && defLane.fifo && defLane.fifo.length) ? `예약 ${defLane.fifo.length}` : "-";
      }

      // Unit producers: pick the producer with the highest progress (front queue)
      const pBarr = buildings.filter(b=>b.alive && !b.civ && b.team===TEAM.PLAYER && b.kind==="barracks");
      const pFac  = buildings.filter(b=>b.alive && !b.civ && b.team===TEAM.PLAYER && b.kind==="factory");

      const curBarr = pBarr.reduce((best,b)=>{
        if (!b.buildQ || !b.buildQ.length) return best;
        const q=b.buildQ[0]; const pct=clamp((q.paid||0)/((q.cost||1)),0,1);
        if (!best) return b;
        const qb=best.buildQ[0]; const pctb=clamp((qb.paid||0)/((qb.cost||1)),0,1);
        return (pct>pctb)?b:best;
      }, null);

      const curFac  = pFac.reduce((best,b)=>{
        if (!b.buildQ || !b.buildQ.length) return best;
        const q=b.buildQ[0]; const pct=clamp((q.paid||0)/((q.cost||1)),0,1);
        if (!best) return b;
        const qb=best.buildQ[0]; const pctb=clamp((qb.paid||0)/((qb.cost||1)),0,1);
        return (pct>pctb)?b:best;
      }, null);

      function unitPctFromProducer(prod){
        if (!prod || !prod.buildQ || !prod.buildQ.length) return 0;
        if (prod.team!==TEAM.PLAYER) return 0;
        const q = prod.buildQ[0];
        const c = q.cost || 1;
        return clamp((q.paid||0)/c, 0, 1);
      }

      const infPct = unitPctFromProducer(curBarr);
      const vehPct = unitPctFromProducer(curFac);

      if (r.qFillInf) r.qFillInf.style.width = `${infPct*100}%`;
      if (r.qFillVeh) r.qFillVeh.style.width = `${vehPct*100}%`;

      const fifoB = (prodFIFO && prodFIFO.barracks) ? prodFIFO.barracks.length : 0;
      const fifoF = (prodFIFO && prodFIFO.factory)  ? prodFIFO.factory.length  : 0;

      if (r.qTxtInf){
        r.qTxtInf.textContent = (fifoB || (curBarr && curBarr.buildQ && curBarr.buildQ.length)) ?
          `예약 ${fifoB + (curBarr ? curBarr.buildQ.length : 0)}` : "-";
      }
      if (r.qTxtVeh){
        r.qTxtVeh.textContent = (fifoF || (curFac && curFac.buildQ && curFac.buildQ.length)) ?
          `예약 ${fifoF + (curFac ? curFac.buildQ.length : 0)}` : "-";
      }
    }

    return {
      updateSelectionUI,
      updatePowerBar,
      updateProdBadges,
      refreshPrimaryBuildingBadgesUI,
      updateProdBars
    };
  };
})(window);
