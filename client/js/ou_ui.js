// ou_ui.js
// - UI updates extracted from game.js (Stage 4)
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
        state, buildings, TEAM, COST, prodTotal, QCAP, hasRadarAlive, getEntityById, BUILD, NAME_KO
      } = env;

      if (!state) return;

r.uiSelCount.textContent=String(state.selection.size);

    const pp=state.player.powerProd, pu=state.player.powerUse;
    const ok=pp>=pu;
    r.uiPower.textContent = `${pp} / ${pu}` + (ok ? "" : " (부족)");
    r.uiPower.className = "pill " + (ok ? "ok" : "danger");

    const radar = hasRadarAlive(TEAM.PLAYER);
    r.uiRadarStat.textContent = radar ? "ON" : "없음";
    r.uiRadarStat.className = "pill " + (radar ? "ok" : "danger");
    r.uiMmHint.textContent = radar ? "표시중" : "레이더 필요";
    r.uiMmHint.className = "pill " + (radar ? "ok" : "danger");
    // Keep button labels stable (do not overwrite textContent or badges will be removed).
    // Prices are shown via tooltip (title).
    r.btnInf.title = `보병  $${COST.infantry}`;
    r.btnEng.title = `엔지니어  $${COST.engineer}`;
    r.btnSnp.title = `저격병  $${COST.sniper}`;
    r.btnTnk.title = `탱크  $${COST.tank}`;
    r.btnHar.title = `굴착기  $${COST.harvester}`;
    r.btnIFV.title = `IFV  $${COST.ifv}`;
    const hasBar = buildings.some(b=>b.alive && !b.civ && b.team===TEAM.PLAYER && b.kind==="barracks");
    const hasFac = buildings.some(b=>b.alive && !b.civ && b.team===TEAM.PLAYER && b.kind==="factory");

    r.btnInf.disabled = !hasBar || state.player.money < COST.infantry || prodTotal.infantry>=QCAP;
    r.btnEng.disabled = !hasBar || state.player.money < COST.engineer || prodTotal.engineer>=QCAP;
    r.btnTnk.disabled = !hasFac || state.player.money < COST.tank || prodTotal.tank>=QCAP;

    const lines=[];
    for (const id of state.selection){
      const e=getEntityById(id);
      if (!e) continue;
      if (BUILD[e.kind]){
        if (e.hideUI) continue;
        lines.push(`[건물] ${NAME_KO[e.kind]||e.kind} (${e.tw}x${e.th}) HP ${Math.ceil(e.hp)}/${e.hpMax} repair:${e.repairOn?"ON":"OFF"} q:${e.buildQ.length}`);
      } else {
        const extra = (e.kind==="harvester") ? ` carry:${Math.floor(e.carry)}/${e.carryMax} (입금:정제소만)`
                    : (e.kind==="engineer") ? ` (점령)` : "";
        lines.push(`[유닛] ${NAME_KO[e.kind]||e.kind} HP ${Math.ceil(e.hp)}/${e.hpMax}${extra}`);
      }
    }
    r.uiSelInfo.textContent = lines.length ? lines.slice(0,12).join("\n") : "아무것도 선택 안 됨";
    }

    function updatePowerBar(env) {
      env = env || {};
      const { state, clamp } = env;
      if (!state || !isFn(clamp)) return;

if (!r.uiPowerFill) return;
    const prod = state.player.powerProd || 0;
    const use  = state.player.powerUse  || 0;

    // Green: production vs usage (how "healthy" power is).
    let pct = 1;
    if (use > 0){
      pct = clamp(prod / use, 0, 1);
    }
    r.uiPowerFill.style.height = `${Math.round(pct*100)}%`;

    // Red: consumption overlay (how much is being used).
    if (r.uiPowerNeed){
      let needPct = 0;
      if (prod > 0){
        needPct = clamp(use / prod, 0, 1);
      } else if (use > 0){
        needPct = 1;
      }
      r.uiPowerNeed.style.height = `${Math.round(needPct*100)}%`;
    }

    // Overload hint (orange-ish)
    if (use >= prod){
      r.uiPowerFill.style.background = "linear-gradient(180deg, rgba(255,190,90,0.78), rgba(140,70,20,0.78))";
    } else {
      r.uiPowerFill.style.background = "linear-gradient(180deg, rgba(90,220,140,0.75), rgba(40,120,80,0.75))";
    }
    }

    return { updateSelectionUI, updatePowerBar };
  };
})(window);
