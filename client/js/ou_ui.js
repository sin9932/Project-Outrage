// ou_ui.js
// - UI updates extracted from game.js (Stage 5)
// - Keep this file tiny + dependency-injected.

(function (global) {
  "use strict";

  const OUUI = global.OUUI || (global.OUUI = {});
  const isFn = (v) => typeof v === "function";

  OUUI.create = function create(refs) {
    const r = refs || {};
// Auto-resolve missing DOM refs (safe fallback if game.js didn't pass them)
r.uiPowerFill = r.uiPowerFill || document.getElementById("powerFill");
r.uiPowerNeed = r.uiPowerNeed || document.getElementById("powerNeed");
r.uiPowerBar  = r.uiPowerBar  || document.getElementById("powerBar");
r.uiPTip      = r.uiPTip      || document.getElementById("pTip");

// Auto-resolve production/buttons (safe even if game.js didn't pass refs)
r.tabBtns = r.tabBtns || Array.from(document.querySelectorAll(".tabbtn[data-cat]"));
r.panels  = r.panels  || {
  main: document.getElementById("panelMain"),
  def:  document.getElementById("panelDef"),
  inf:  document.getElementById("panelInf"),
  veh:  document.getElementById("panelVeh")
};

// Build buttons
r.btnPow = r.btnPow || document.getElementById("bPow");
r.btnRef = r.btnRef || document.getElementById("bRef");
r.btnBar = r.btnBar || document.getElementById("bBar");
r.btnFac = r.btnFac || document.getElementById("bFac");
r.btnRad = r.btnRad || document.getElementById("bRad");
r.btnTur = r.btnTur || document.getElementById("bTur");

// Unit buttons
r.btnInf = r.btnInf || document.getElementById("pInf");
r.btnEng = r.btnEng || document.getElementById("pEng");
r.btnSnp = r.btnSnp || document.getElementById("pSnp");
r.btnTnk = r.btnTnk || document.getElementById("pTnk");
r.btnHar = r.btnHar || document.getElementById("pHar");
r.btnIFV = r.btnIFV || document.getElementById("pIFV");

// HUD misc

// Selection panel
r.uiSelCount  = r.uiSelCount  || document.getElementById("selCount");
r.uiSelInfo   = r.uiSelInfo   || document.getElementById("selInfo");

r.uiMoney     = r.uiMoney     || document.getElementById("money");
r.uiBuildMode = r.uiBuildMode || document.getElementById("buildMode");
r.uiToast     = r.uiToast     || document.getElementById("toast");

// Cursor mode buttons
r.btnRepairMode = r.btnRepairMode || document.getElementById("btnRepairMode");
r.btnSellMode   = r.btnSellMode   || document.getElementById("btnSellMode");


// Install power tooltip (once). Falls back to title attribute as well.
if (r.uiPowerBar && !r.__powerTipInstalled){
  r.__powerTipInstalled = true;

  // Make sure tooltip element can actually follow the cursor
  if (r.uiPTip){
    const t = r.uiPTip;
    t.style.position = "fixed";
    t.style.zIndex = "9999";
    t.style.pointerEvents = "none"; // avoid flicker
    t.style.padding = "6px 10px";
    t.style.borderRadius = "10px";
    t.style.background = "rgba(0,0,0,0.75)";
    t.style.color = "#fff";
    t.style.fontSize = "12px";
    t.style.whiteSpace = "nowrap";
    t.style.display = "none";
  }

  const showTip = (e)=>{
    const txt = r.__powerTipText || (r.uiPowerBar && r.uiPowerBar.title) || "전력";
    if (r.uiPTip){
      r.uiPTip.textContent = txt;
      r.uiPTip.style.display = "block";
      r.uiPTip.style.left = (e.clientX + 14) + "px";
      r.uiPTip.style.top  = (e.clientY + 12) + "px";
    }
  };
  const hideTip = ()=>{
    if (r.uiPTip) r.uiPTip.style.display = "none";
  };

  r.uiPowerBar.addEventListener("mouseenter", showTip);
  r.uiPowerBar.addEventListener("mousemove", showTip);
  r.uiPowerBar.addEventListener("mouseleave", hideTip);
}


    function updateSelectionUI(env) {
      env = env || {};
      const { state, hasRadarAlive, getEntityById, NAME_KO } = env;

      if (!state) return;

      const isFn = (f)=> typeof f === "function";
      const nameOf = (ent)=>{
        if (!ent) return "";
        const k = ent.kind || ent.type || ent.name || "";
        if (!k) return "";
        if (NAME_KO && NAME_KO[k]) return NAME_KO[k];
        return k;
      };
      const hpRatio = (ent)=>{
        if (!ent) return null;
        const hp = ent.hp;
        const mx = ent.hpMax;
        if (typeof hp !== "number" || typeof mx !== "number" || mx <= 0) return null;
        return Math.max(0, Math.min(1, hp / mx));
      };
      const hpText = (ent)=>{
        if (!ent) return "";
        const hp = ent.hp;
        const mx = ent.hpMax;
        if (typeof hp !== "number" || typeof mx !== "number") return "";
        if (!Number.isFinite(hp) || !Number.isFinite(mx) || mx <= 0) return "";
        return `${Math.round(hp)}/${Math.round(mx)}`;
      };

      // Selected ids (supports both legacy state.sel[] and current state.selection Set)
      let selIds = [];
      try{
        if (state.selection && typeof state.selection.has === "function"){
          selIds = Array.from(state.selection);
        } else if (Array.isArray(state.sel)){
          selIds = state.sel.slice();
        }
      }catch(_e){ selIds = []; }

      // Hover fallback (show info when nothing selected but cursor is over an entity)
      const hoverId = state.hover && state.hover.entId != null ? state.hover.entId : null;

      // Selection count pill
      try{
        if (r.uiSelCount){
          r.uiSelCount.textContent = String(selIds.length);
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

      // Selection info text
      try{
        if (r.uiSelInfo){
          const ids = selIds.length ? selIds : (hoverId != null ? [hoverId] : []);
          if (!ids.length){
            r.uiSelInfo.textContent = "아무것도 선택 안 됨";
          } else {
            const ents = [];
            for (const id of ids){
              const ent = getEntityById && isFn(getEntityById) ? getEntityById(id) : null;
              if (!ent) continue;
              if (ent.alive === false) continue;
              if (ent.hidden || ent.inTransport) continue;
              ents.push(ent);
            }

            if (!ents.length){
              r.uiSelInfo.textContent = selIds.length ? `${selIds.length}개 선택` : "선택됨";
            } else if (selIds.length <= 1){
              const e0 = ents[0];
              const n = nameOf(e0) || "선택됨";
              const hp = hpText(e0);
              r.uiSelInfo.textContent = hp ? `[${n}] HP ${hp}` : `[${n}]`;
            } else {
              // multi-select summary + list (old behavior friendly)
              const ratios = ents.map(hpRatio).filter(v => v != null);
              let summary = `${selIds.length}개 선택`;
              if (ratios.length){
                const avg = ratios.reduce((a,b)=>a+b,0) / ratios.length;
                const mn  = Math.min(...ratios);
                summary += `  (평균 HP ${(avg*100).toFixed(0)}% / 최소 ${(mn*100).toFixed(0)}%)`;
              }

              const list = [];
              const MAX = 12;
              for (let i=0;i<ents.length && i<MAX;i++){
                const e = ents[i];
                const n = nameOf(e) || "unknown";
                const hp = hpText(e);
                list.push(hp ? `- ${n}  (${hp})` : `- ${n}`);
              }
              if (ents.length > MAX) list.push(`- ... +${ents.length - MAX}`);

              r.uiSelInfo.textContent = [summary, ...list].join("\n");
            }
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

    function showFatalError(e){
      try{
        const msg = (e && e.message) ? e.message : String(e);
        const file = e && e.filename ? e.filename : "";
        const line = e && e.lineno != null ? e.lineno : "";
        const col = e && e.colno != null ? e.colno : "";
        document.body.innerHTML =
          `<pre style="white-space:pre-wrap;padding:16px;color:#fff;background:#000;">\n`+
          `JS ERROR:\n`+
          `${msg}\n`+
          `${file}:${line}:${col}\n`+
          `</pre>`;
      }catch(_e){}
    }

    function setGameBrightness(v){
      const val = Math.max(0.5, Math.min(1.6, v));
      try{ document.documentElement.style.setProperty("--game-brightness", String(val)); }catch(_e){}
      try { localStorage.setItem("rts_brightness", String(val)); } catch(_){}
      return val;
    }

    function getGameBrightness(){
      try{
        const v = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--game-brightness"));
        return Number.isFinite(v) ? v : 1;
      }catch(_e){
        return 1;
      }
    }

    function restoreGameBrightness(){
      let saved = 1;
      try { saved = parseFloat(localStorage.getItem("rts_brightness") || "1"); } catch(_){ saved = 1; }
      if (Number.isFinite(saved)) setGameBrightness(saved);
      else setGameBrightness(1);
    }

    function updatePowerBar(env){
  env = env || {};
  const { state, clamp } = env;
  if (!state || !clamp) return;

  // power lives under state.player
  const p = state.player || {};
  const prod = p.powerProd || 0;
  const use  = p.powerUse  || 0;

  // Tooltip text (production / consumption)
  const tip = `전력: ${prod} / ${use}`;
  r.__powerTipText = tip;
  if (r.uiPowerBar) r.uiPowerBar.title = tip;

  // Green: production vs usage (health)
  let pct = 1;
  if (use > 0){
    pct = clamp(prod / use, 0, 1);
  }
  if (r.uiPowerFill) r.uiPowerFill.style.height = `${Math.round(pct*100)}%`;

  // Red: consumption overlay
  if (r.uiPowerNeed){
    let needPct = 0;
    if (prod > 0){
      needPct = clamp(use / prod, 0, 1);
    } else if (use > 0){
      needPct = 1;
    }
    r.uiPowerNeed.style.height = `${Math.round(needPct*100)}%`;
  }

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
  if (!env) return;

  // Accept either { prodTotal } or direct prodTotal map for backward compatibility.
  let prodTotal = null;
  const looksLikeMap = (env && typeof env === "object" && !("prodTotal" in env) &&
    ("infantry" in env || "engineer" in env || "sniper" in env || "tank" in env || "harvester" in env));

  if (looksLikeMap) prodTotal = env;
  else if (env && typeof env === "object") prodTotal = env.prodTotal;

  if (!prodTotal) return;
function ensureBadge(btn){
        if (!btn) return null;

        // ensure relative positioning so the badge doesn't flow into the label
        btn.style.position = "relative";

        let b = btn.querySelector(".badge");
        if (!b){
          b = document.createElement("span");
          b.className = "badge";
          btn.appendChild(b);
        }

        // style (idempotent)
        b.style.position = "absolute";
        b.style.top = "8px";
        b.style.right = "10px";
        b.style.zIndex = "2";
        b.style.pointerEvents = "none";
        b.style.minWidth = "18px";
        b.style.height = "18px";
        b.style.lineHeight = "18px";
        b.style.padding = "0 6px";
        b.style.borderRadius = "999px";
        b.style.fontSize = "12px";
        b.style.fontWeight = "900";
        b.style.background = "rgba(0,0,0,0.55)";
        b.style.border = "1px solid rgba(255,255,255,0.18)";
        b.style.color = "#fff";

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

      if (barEl) barEl.style.display = "none"; // primary badge disabled
      if (facEl) facEl.style.display = "none"; // primary badge disabled
    }

    function updateProdBars(env){
      env = env || {};
      const { state, buildings, TEAM, clamp, prodFIFO, NAME_KO } = env;
      if (!state || !isFn(clamp)) return;

      // Building lanes (prefer state.getLaneStatus)
      const laneStatus = (k)=> (state.getLaneStatus && isFn(state.getLaneStatus)) ? state.getLaneStatus(k) : null;
      const mainSt = laneStatus("main");
      const defSt  = laneStatus("def");

      const lanePct = (st)=> st ? clamp(st.pct||0, 0, 1) : 0;
      if (r.qFillMain) r.qFillMain.style.width = `${lanePct(mainSt)*100}%`;
      if (r.qFillDef)  r.qFillDef.style.width  = `${lanePct(defSt)*100}%`;

      if (r.qTxtMain){
        r.qTxtMain.textContent = (mainSt && mainSt.ready) ? `READY: ${(NAME_KO && NAME_KO[mainSt.ready]) ? NAME_KO[mainSt.ready] : mainSt.ready}` :
          (mainSt && mainSt.queue) ? `${(NAME_KO && NAME_KO[mainSt.queue]) ? NAME_KO[mainSt.queue] : mainSt.queue} ${Math.round(lanePct(mainSt)*100)}%` :
          (mainSt && mainSt.fifoLen) ? `예약 ${mainSt.fifoLen}` : "-";
      }
      if (r.qTxtDef){
        r.qTxtDef.textContent = (defSt && defSt.ready) ? `READY: ${(NAME_KO && NAME_KO[defSt.ready]) ? NAME_KO[defSt.ready] : defSt.ready}` :
          (defSt && defSt.queue) ? `${(NAME_KO && NAME_KO[defSt.queue]) ? NAME_KO[defSt.queue] : defSt.queue} ${Math.round(lanePct(defSt)*100)}%` :
          (defSt && defSt.fifoLen) ? `예약 ${defSt.fifoLen}` : "-";
      }

      // Unit producers (prefer state.getProducerStatus)
      let infPct = 0, vehPct = 0, fifoB = 0, fifoF = 0, qBarr = 0, qFac = 0;
      if (state.getProducerStatus && isFn(state.getProducerStatus)){
        const b = state.getProducerStatus("barracks");
        const f = state.getProducerStatus("factory");
        if (b){ infPct = clamp(b.pct||0,0,1); fifoB = b.fifoLen||0; qBarr = b.queueLen||0; }
        if (f){ vehPct = clamp(f.pct||0,0,1); fifoF = f.fifoLen||0; qFac = f.queueLen||0; }
      } else if (buildings && TEAM){
        // fallback (legacy)
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
        const unitPctFromProducer = (prod)=>{
          if (!prod || !prod.buildQ || !prod.buildQ.length) return 0;
          if (prod.team!==TEAM.PLAYER) return 0;
          const q = prod.buildQ[0];
          const c = q.cost || 1;
          return clamp((q.paid||0)/c, 0, 1);
        };
        infPct = unitPctFromProducer(curBarr);
        vehPct = unitPctFromProducer(curFac);
        fifoB = (prodFIFO && prodFIFO.barracks) ? prodFIFO.barracks.length : 0;
        fifoF = (prodFIFO && prodFIFO.factory)  ? prodFIFO.factory.length  : 0;
        qBarr = curBarr ? (curBarr.buildQ ? curBarr.buildQ.length : 0) : 0;
        qFac  = curFac  ? (curFac.buildQ ? curFac.buildQ.length : 0) : 0;
      }

      if (r.qFillInf) r.qFillInf.style.width = `${infPct*100}%`;
      if (r.qFillVeh) r.qFillVeh.style.width = `${vehPct*100}%`;

      if (r.qTxtInf){
        r.qTxtInf.textContent = (fifoB || qBarr) ? `예약 ${fifoB + qBarr}` : "-";
      }
      if (r.qTxtVeh){
        r.qTxtVeh.textContent = (fifoF || qFac) ? `예약 ${fifoF + qFac}` : "-";
      }
    }


    function updateSidebarButtons(env){
      const e = env || {};
      const state    = e.state;
      const buildings = e.buildings || [];
      const TEAM     = e.TEAM || window.TEAM || {};
      const prodCat  = e.prodCat;
      const setProdCat = e.setProdCat;

      const tabBtns = e.tabBtns || r.tabBtns || Array.from(document.querySelectorAll(".tabbtn[data-cat]"));
      const panels  = e.panels  || r.panels  || {
        main: document.getElementById("panelMain"),
        def:  document.getElementById("panelDef"),
        inf:  document.getElementById("panelInf"),
        veh:  document.getElementById("panelVeh")
      };

      // Handle both shapes:
      // - buildings as array of entities (current game.js)
      // - buildings as {kind:[...]} map (older experiments)
      const isArr = Array.isArray(buildings);
      const playerTeam = (TEAM && typeof TEAM.PLAYER !== "undefined") ? TEAM.PLAYER : 0;

      const kindAliases = {
        barracks: ["barrack"], // some sprite-spec files use 'barrack'
        barrack:  ["barracks"]
      };

      function alivePlayerBuilding(b){
        return !!(b && b.alive && !b.civ && b.team === playerTeam);
      }

      function hasP(kind){
        const kinds = [kind].concat(kindAliases[kind] || []);
        if (isArr){
          return buildings.some(b => alivePlayerBuilding(b) && kinds.includes(b.kind));
        }
        // map style
        for (const k of kinds){
          const arr = buildings[k];
          if (Array.isArray(arr) && arr.some(alivePlayerBuilding)) return true;
        }
        return false;
      }

      const tech = {
        // Keep in sync with validateTechQueues() in game.js
        buildPrereq: {
          power:    ["hq"],
          refinery: ["hq","power"],
          barracks: ["hq","power"],
          factory:  ["hq","barracks"],
          radar:    ["hq","factory"],
          turret:   ["hq","barracks"]
        },
        unitPrereq: {
          infantry:  ["barracks"],
          engineer:  ["barracks"],
          sniper:    ["barracks","radar"],
          tank:      ["factory"],
          ifv:       ["factory"],
          harvester: ["factory"]
        }
      };

      function prereqOk(kind, map){
        const req = map[kind];
        if (!req || !req.length) return true;
        for (const k of req){
          if (!hasP(k)) return false;
        }
        return true;
      }

      function applyTechGateBtn(btn, ok){
        if (!btn) return;
        // Tech-gate: hide completely when not available
        btn.style.display = ok ? "" : "none";
      }

      function applyEnabledBtn(btn, ok){
        if (!btn) return;
        // Enabled/disabled styling only (visibility is handled by applyTechGate)
        btn.disabled = !ok;
        btn.classList.toggle("disabled", !ok);
      }

      // Tabs show/hide by producers (keep same rules as legacy game.js)
      const tabProducer = {
        main: { req: ["hq"] },
        def:  { req: ["hq","barracks"] },
        inf:  { req: ["barracks"] },
        veh:  { req: ["factory"] }
      };
      function tabOk(cat){
        const t = tabProducer[cat];
        if (!t) return true;
        for (const k of (t.req || [])){
          if (!hasP(k)) return false;
        }
        return true;
      }


      // === Sidebar button update passes ===
      // 1) applyTechGate(): show/hide (tabs + buttons)
      // 2) applyEnabledState(): disabled styling only
      // 3) applyProgressOverlays(): progress bars only (pure visual)

      function applyTechGate(){
        // Tabs visibility
        for (const b of tabBtns){
          if (!b) continue;
          const cat = b.dataset ? b.dataset.cat : b.getAttribute("data-cat");
          const ok = tabOk(cat);
          b.style.display = ok ? "" : "none";
        }

        // If current category becomes invalid, switch to the first visible one.
        if (typeof setProdCat === "function"){
          const curOk = tabOk(prodCat);
          if (!curOk){
            const firstOk = (tabBtns || []).find(x => x && x.style.display !== "none");
            const next = firstOk ? (firstOk.dataset ? firstOk.dataset.cat : firstOk.getAttribute("data-cat")) : "main";
            setProdCat(next);
          }
        }

        // Build panel buttons (visibility only)
        applyTechGateBtn(r.btnPow, prereqOk("power", tech.buildPrereq));
        applyTechGateBtn(r.btnRef, prereqOk("refinery", tech.buildPrereq));
        applyTechGateBtn(r.btnBar, prereqOk("barracks", tech.buildPrereq));
        applyTechGateBtn(r.btnFac, prereqOk("factory", tech.buildPrereq));
        applyTechGateBtn(r.btnRad, prereqOk("radar", tech.buildPrereq));
        applyTechGateBtn(r.btnTur, prereqOk("turret", tech.buildPrereq));

        // Unit panel buttons (visibility only)
        applyTechGateBtn(r.btnInf, prereqOk("infantry", tech.unitPrereq));
        applyTechGateBtn(r.btnEng, prereqOk("engineer", tech.unitPrereq));
        applyTechGateBtn(r.btnSnp, prereqOk("sniper", tech.unitPrereq));
        applyTechGateBtn(r.btnTnk, prereqOk("tank", tech.unitPrereq));
        applyTechGateBtn(r.btnIFV, prereqOk("ifv", tech.unitPrereq));
        applyTechGateBtn(r.btnHar, prereqOk("harvester", tech.unitPrereq));
      }

      function applyEnabledState(){
        // Build panel buttons (disabled state only)
        applyEnabledBtn(r.btnPow, prereqOk("power", tech.buildPrereq));
        applyEnabledBtn(r.btnRef, prereqOk("refinery", tech.buildPrereq));
        applyEnabledBtn(r.btnBar, prereqOk("barracks", tech.buildPrereq));
        applyEnabledBtn(r.btnFac, prereqOk("factory", tech.buildPrereq));
        applyEnabledBtn(r.btnRad, prereqOk("radar", tech.buildPrereq));
        applyEnabledBtn(r.btnTur, prereqOk("turret", tech.buildPrereq));

        // Unit panel buttons (disabled state only)
        applyEnabledBtn(r.btnInf, prereqOk("infantry", tech.unitPrereq));
        applyEnabledBtn(r.btnEng, prereqOk("engineer", tech.unitPrereq));
        applyEnabledBtn(r.btnSnp, prereqOk("sniper", tech.unitPrereq));
        applyEnabledBtn(r.btnTnk, prereqOk("tank", tech.unitPrereq));
        applyEnabledBtn(r.btnIFV, prereqOk("ifv", tech.unitPrereq));
        applyEnabledBtn(r.btnHar, prereqOk("harvester", tech.unitPrereq));
      }

      function applyProgressOverlays(){
      // Progress overlays (build + unit). Purely visual, never blocks input.
      const clamp01 = (v)=> (v<0?0:(v>1?1:v));

      function ensureBtnUI(btn, label){
  if (!btn) return null;

  const cleanLabel = (s)=>{
    s = (s == null) ? "" : String(s);
    s = s.replace(/\s+/g, " ").trim();
    // remove primary/legacy badge text
    s = s.replace(/주요/g, "").replace(/二쇱슂/g, "").trim();
    // remove runaway numeric suffix (badge count bleed, e.g. 111111...)
    s = s.replace(/[0-9]+$/g, "").trim();
    return s;
  };

  // Prefer stable base label stored on the element (prevents accumulating badge digits)
  let inferred = label;

  const existingLbl = btn.querySelector(":scope > .lbl");
  if (inferred == null){
    const base =
      (btn.dataset && btn.dataset.baseLabel) ? btn.dataset.baseLabel :
      (existingLbl ? (existingLbl.getAttribute("data-base") || existingLbl.textContent) : null);

    if (base && String(base).trim().length){
      inferred = cleanLabel(base);
    } else {
      // 1) direct text nodes only (avoids span.badge text)
      let t = "";
      for (const n of Array.from(btn.childNodes)){
        if (n && n.nodeType === 3 && n.textContent) t += n.textContent;
      }
      if (t && t.trim().length){
        inferred = cleanLabel(t);
      } else {
        // 2) last resort: clone and strip known UI spans, then read text
        try{
          const c = btn.cloneNode(true);
          c.querySelectorAll(".badge,.prog,.lbl").forEach(x=>x.remove());
          inferred = cleanLabel(c.textContent || "");
        }catch(_e){
          inferred = cleanLabel(btn.getAttribute("data-label") || btn.textContent || "");
        }
      }
    }
  } else {
    inferred = cleanLabel(inferred);
  }

  // Persist base label for future calls
  if (btn.dataset) btn.dataset.baseLabel = inferred;

  btn.style.position = "relative";
  btn.style.overflow = "hidden";

  // Progress overlay (scaleX)
  let prog = btn.querySelector(":scope > .prog");
  if (!prog){
    prog = document.createElement("span");
    prog.className = "prog";
    prog.style.position = "absolute";
    prog.style.left = "0";
    prog.style.top = "0";
    prog.style.bottom = "0";
    prog.style.width = "100%";
    prog.style.transformOrigin = "left";
    prog.style.transform = "scaleX(0)";
    prog.style.pointerEvents = "none";
    prog.style.zIndex = "0";
    prog.style.borderRadius = "inherit";
    prog.style.background = "linear-gradient(90deg, rgba(70,170,110,0.92), rgba(70,170,110,0.62))";
    prog.style.color = "transparent";
    prog.style.fontSize = "0px";
    prog.textContent = "";
    btn.insertBefore(prog, btn.firstChild);
  }
  // Ensure no text leaks into progress overlay
  prog.textContent = "";

  // If a badge exists, keep it but ensure it doesn't bleed into the label flow
  const badge = btn.querySelector(":scope > .badge");
  if (badge){
    badge.style.position = "absolute";
    badge.style.top = "8px";
    badge.style.right = "10px";
    badge.style.zIndex = "2";
    badge.style.pointerEvents = "none";
  }

  // Label
  let lbl = existingLbl;
  if (!lbl){
    // remove direct text nodes to prevent duplicate labels
    for (const n of Array.from(btn.childNodes)){
      if (n && n.nodeType === 3 && n.textContent && n.textContent.trim().length){
        btn.removeChild(n);
      }
    }
    lbl = document.createElement("span");
    lbl.className = "lbl";
    lbl.style.position = "relative";
    lbl.style.zIndex = "1";
    lbl.style.pointerEvents = "none";
    btn.appendChild(lbl);
  }

  lbl.textContent = inferred;
  lbl.setAttribute("data-base", inferred);

  return { prog, lbl };
}

      // Build progress (delegated to game.js)
      const buildBtns = [
        { kind: "power",    laneKey: "main", btn: r.btnPow },
        { kind: "refinery", laneKey: "main", btn: r.btnRef },
        { kind: "barracks", laneKey: "main", btn: r.btnBar },
        { kind: "factory",  laneKey: "main", btn: r.btnFac },
        { kind: "radar",    laneKey: "main", btn: r.btnRad },
        { kind: "turret",   laneKey: "def",  btn: r.btnTur },
      ];

      for (const it of buildBtns){
        const btn = it.btn;
        if (!btn || btn.style.display === "none") continue;
        const ui = ensureBtnUI(btn, null);
        if (!ui) continue;

        const prog = (state && typeof state.getBuildProgress === "function")
          ? state.getBuildProgress(it.kind, it.laneKey)
          : null;

        if (!prog){
          ui.prog.style.opacity = "0";
          continue;
        }

        const pct = clamp01((typeof prog.pct === "number") ? prog.pct : 0);
        const vis = Math.max(0.02, pct);

        ui.prog.style.background = prog.paused ? "rgba(170, 170, 170, 0.55)"
          : (prog.ready ? "rgba(220, 200, 90, 0.62)" : "rgba(90, 220, 140, 0.55)");
        ui.prog.style.transform = `scaleX(${vis})`;
        ui.prog.style.opacity = "1";
      }


// Unit progress (delegated to game.js)
      const unitBtns = [
        { kind: "infantry",  btn: r.btnInf, producer: "barracks" },
        { kind: "engineer",  btn: r.btnEng, producer: "barracks" },
        { kind: "sniper",    btn: r.btnSnp, producer: "barracks" },

        { kind: "tank",      btn: r.btnTnk, producer: "factory"  },
        { kind: "harvester", btn: r.btnHar, producer: "factory"  },
        { kind: "ifv",       btn: r.btnIFV, producer: "factory"  },
      ];

      for (const it of unitBtns){
        const btn = it.btn;
        if (!btn || btn.style.display === "none") continue;
        const ui = ensureBtnUI(btn, null);
        if (!ui) continue;

        const prog = (state && typeof state.getUnitProgress === "function")
          ? state.getUnitProgress(it.kind, it.producer)
          : null;

        if (!prog){
          ui.prog.style.opacity = "0";
          continue;
        }

        const pct = clamp01((typeof prog.pct === "number") ? prog.pct : 0);
        const vis = Math.max(0.02, pct);

        ui.prog.style.background = prog.paused ? "rgba(170, 170, 170, 0.38)" : "rgba(90, 220, 140, 0.38)";
        ui.prog.style.transform = `scaleX(${vis})`;
        ui.prog.style.opacity = "1";
      }




      }

      // Run the passes in a fixed order (safe + predictable)
      applyTechGate();
      applyEnabledState();
      applyProgressOverlays();

      // Panels themselves (optional): if tab is hidden, also hide its panel to avoid empty UI.
      // (game.js setProdCat already does this; this is just extra safety)
      if (panels && prodCat && panels[prodCat]){
        // nothing
      }
    }

    
    // -------------------------
    // P0 UI finishing helpers
    // -------------------------

    function updateMoney(money){
      r.uiMoney = r.uiMoney || document.getElementById("money");
      if (!r.uiMoney) return;
      const v = (typeof money === "number") ? Math.floor(money) : money;
      r.uiMoney.textContent = `$ ${v}`;
    }

    function toast(text, dur=1.0){
      r.uiToast = r.uiToast || document.getElementById("toast");
      const el = r.uiToast;
      if (!el) return;
      if (text == null || text === ""){
        el.style.display = "none";
        return;
      }
      el.textContent = String(text);
      el.style.display = "block";
      el.style.opacity = "1";
      clearTimeout(r._toastT);
      r._toastT = setTimeout(()=>{
        el.style.opacity = "0";
        setTimeout(()=>{ el.style.display = "none"; }, 140);
      }, Math.max(250, (dur||1)*1000));
    }

    function applyMouseMode(env){
      env = env || {};
      const state = env.state;
      const mode = env.mode;
      if (state) state.mouseMode = mode;

      const body = document.body;
      if (body){
        body.classList.toggle("cursor-repair", mode==="repair");
        body.classList.toggle("cursor-sell",   mode==="sell");
      }

      r.btnRepairMode = r.btnRepairMode || document.getElementById("btnRepairMode");
      r.btnSellMode   = r.btnSellMode   || document.getElementById("btnSellMode");
      if (r.btnRepairMode) r.btnRepairMode.classList.toggle("on", mode==="repair");
      if (r.btnSellMode)   r.btnSellMode.classList.toggle("on", mode==="sell");
    }

    function updateBuildModeUI(env){
      env = env || {};
      const state = env.state;
      r.uiBuildMode = r.uiBuildMode || document.getElementById("buildMode");
      const el = r.uiBuildMode;
      if (!el || !state) return;

      const mode = state.mouseMode || "normal";
      const mainReady = !!(state.buildLane && state.buildLane.main && state.buildLane.main.ready);
      const defReady  = !!(state.buildLane && state.buildLane.def  && state.buildLane.def.ready);
      const anyReady  = mainReady || defReady;

      if (mode==="repair"){
        el.textContent = "REPAIR";
        el.className = "pill warn";
        el.style.display = "";
      } else if (mode==="sell"){
        el.textContent = "SELL";
        el.className = "pill warn";
        el.style.display = "";
      } else if (anyReady){
        el.textContent = "BUILD";
        el.className = "pill ok";
        el.style.display = "";
      } else {
        el.textContent = "";
        el.className = "pill";
        el.style.display = "none";
      }

      // Blink tabs when build lane has ready items
      const tabs = r.tabBtns || Array.from(document.querySelectorAll(".tabbtn[data-cat]"));
      const setBlink = (cat, on)=>{
        const t = (tabs||[]).find(x => x && ((x.dataset && x.dataset.cat) || x.getAttribute("data-cat"))===cat);
        if (t) t.classList.toggle("blink", !!on);
      };
      setBlink("main", mainReady);
      setBlink("def", defReady);
    }

    function updateProdTabsUI(env){
      env = env || {};
      const tabBtns = env.tabBtns || r.tabBtns || Array.from(document.querySelectorAll(".tabbtn[data-cat]"));
      const panels  = env.panels  || r.panels  || {
        main: document.getElementById("panelMain"),
        def:  document.getElementById("panelDef"),
        inf:  document.getElementById("panelInf"),
        veh:  document.getElementById("panelVeh")
      };
      const prodCat = env.prodCat || "main";

      for (const b of tabBtns){
        if (!b) continue;
        const cat = b.dataset ? b.dataset.cat : b.getAttribute("data-cat");
        b.classList.toggle("on", cat === prodCat);
      }
      for (const [k,p] of Object.entries(panels)){
        if (!p) continue;
        p.style.display = (k===prodCat) ? "" : "none";
      }
    }

    function bindProdTabClicks(env){
      env = env || {};
      const onSelect = env.onSelect;
      const tabBtns = env.tabBtns || r.tabBtns || Array.from(document.querySelectorAll(".tabbtn[data-cat]"));
      for (const b of tabBtns){
        if (!b) continue;
        const cat = b.dataset ? b.dataset.cat : b.getAttribute("data-cat");
        b.addEventListener("click", ()=>{ if (typeof onSelect === "function") onSelect(cat); });
      }
    }

    function initPregameUI(env){
      env = env || {};
      const onSpawnChange = env.onSpawnChange;
      const onMoneyChange = env.onMoneyChange;
      const onMapChange = env.onMapChange;

      const spawnChips = Array.from(document.querySelectorAll(".chip.spawn"));
      const moneyChips = Array.from(document.querySelectorAll(".chip.money"));
      const mapChips = Array.from(document.querySelectorAll(".chip.map"));

      function setSpawnChip(target){
        for (const c of spawnChips) c.classList.remove("on");
        if (target) target.classList.add("on");
        const v = target && target.dataset ? target.dataset.spawn : null;
        if (typeof onSpawnChange === "function") onSpawnChange(v || "left");
      }

      function setMoneyChip(target){
        for (const c of moneyChips) c.classList.remove("on");
        if (target) target.classList.add("on");
        const v = target && target.dataset ? parseInt(target.dataset.money, 10) : NaN;
        if (typeof onMoneyChange === "function") onMoneyChange(v);
      }

      function setMapChip(target){
        for (const c of mapChips) c.classList.remove("on");
        if (target) target.classList.add("on");
        const v = target && target.dataset ? target.dataset.map : null;
        if (typeof onMapChange === "function") onMapChange(v || "plains");
      }

      for (const chip of spawnChips){
        chip.addEventListener("click", ()=>setSpawnChip(chip));
      }
      for (const chip of moneyChips){
        chip.addEventListener("click", ()=>setMoneyChip(chip));
      }
      for (const chip of mapChips){
        chip.addEventListener("click", ()=>setMapChip(chip));
      }
    }

    function setPregameLoading(env){
      env = env || {};
      const startBtn = env.startBtn || document.getElementById("startBtn");
      if (!startBtn) return;
      const loading = !!env.loading;
      if (loading){
        if (!startBtn.dataset._oldTxt) startBtn.dataset._oldTxt = startBtn.textContent || "";
        startBtn.disabled = true;
        startBtn.textContent = "LOADING...";
      } else {
        startBtn.textContent = startBtn.dataset._oldTxt || startBtn.textContent;
        startBtn.disabled = !!env.forceEnable ? false : startBtn.disabled;
      }
    }

    function hidePregame(env){
      env = env || {};
      const pregame = env.pregame || document.getElementById("pregame");
      if (pregame) pregame.style.display = "none";
    }

    function setSellLabel(env){
      env = env || {};
      const btn = env.btn || document.getElementById("sell");
      if (btn && env.text != null) btn.textContent = String(env.text);
    }

    function updateFps(env){
      env = env || {};
      const el = env.el || document.getElementById("fps");
      if (!el) return;
      const v = (env.fps != null) ? Math.round(env.fps) : env.text;
      if (v == null) return;
      el.textContent = `${v} fps`;
    }

    function updateTuneOverlay(env){
      env = env || {};
      let el = document.getElementById("tuneOverlay");
      if (!el){
        el = document.createElement("div");
        el.id = "tuneOverlay";
        el.style.position = "fixed";
        el.style.left = "12px";
        el.style.top = "12px";
        el.style.zIndex = "99999";
        el.style.padding = "10px 12px";
        el.style.borderRadius = "10px";
        el.style.background = "rgba(0,0,0,0.62)";
        el.style.border = "1px solid rgba(255,255,255,0.18)";
        el.style.color = "#e6eef7";
        el.style.font = "12px/1.35 system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
        el.style.pointerEvents = "none";
        document.body.appendChild(el);
      }

      if (!env.on){
        el.style.display = "none";
        return;
      }
      el.style.display = "block";

      const t = env.tune || {};
      el.innerHTML =
        "<b>SPRITE TUNER (F2)</b><br/>" +
        "target: " + (env.targetKind || "") + "<br/>" +
        "anchor: " + (t.anchor||"center") + "<br/>" +
        "scaleMul: " + (t.scaleMul||1).toFixed(3) + "<br/>" +
        "offsetNudge(px): " + (t.offsetNudge?.x||0).toFixed(1) + ", " + (t.offsetNudge?.y||0).toFixed(1) + "<br/>" +
        "pivotNudge(src): " + (t.pivotNudge?.x||0).toFixed(1) + ", " + (t.pivotNudge?.y||0).toFixed(1) + "<br/>" +
        "<span style='opacity:.85'>Drag=offset | Shift+Drag=pivot | Wheel=scale | R=reset | C=copy</span>";
    }

    // -------------------------
    // Pause menu / BGM UI
    // -------------------------
    const _pm = { wired:false, refs:null };
    function getPauseMenuRefs(){
      if (_pm.refs) return _pm.refs;
      _pm.refs = {
        overlay: document.getElementById("pauseOverlay"),
        track: document.getElementById("pmTrackName"),
        prev: document.getElementById("pmPrev"),
        play: document.getElementById("pmPlay"),
        next: document.getElementById("pmNext"),
        shuffle: document.getElementById("pmShuffle"),
        repeat: document.getElementById("pmRepeat"),
        vol: document.getElementById("pmVol"),
        volVal: document.getElementById("pmVolVal"),
        bright: document.getElementById("pmBright"),
        brightVal: document.getElementById("pmBrightVal"),
        time: document.getElementById("pmTime"),
        eq: document.getElementById("pmEQ"),
        resume: document.getElementById("pmResume"),
        exit: document.getElementById("pmExit")
      };
      return _pm.refs;
    }

    function setPauseMenuVisible(env){
      env = env || {};
      const refs = getPauseMenuRefs();
      if (!refs.overlay) return;
      const open = !!env.open;

      refs.overlay.classList.toggle("show", open);
      refs.overlay.style.display = open ? "flex" : "none";
      refs.overlay.setAttribute("aria-hidden", open ? "false" : "true");

      if (!open) return;

      const bgm = env.bgm;
      // BGM UI values are driven via adapter in wirePauseMenuUI (mountUI -> updateUI).
      if (bgm) { /* no direct DOM updates here */ }
      const bright = (typeof env.getBrightness === "function") ? env.getBrightness() : null;
      if (refs.bright && bright != null) refs.bright.value = String(bright);
      if (refs.brightVal && bright != null){
        const b = Number(bright);
        const n10 = Math.max(1, Math.min(10, Math.round(((b - 1.0) / 0.1) + 5)));
        refs.brightVal.textContent = String(n10);
      }
    }

    function wirePauseMenuUI(env){
      env = env || {};
      const refs = getPauseMenuRefs();
      if (!refs.overlay) return;
      if (_pm.wired) return;
      _pm.wired = true;

      const bgm = env.bgm;
      if (bgm && typeof bgm.mountUI === "function"){
        // Build adapter so DOM mutations stay in ou_ui.js
        const eqBars = [];
        const adapter = {
          init: () => {
            if (refs.eq){
              refs.eq.innerHTML = "";
              const bars = 12;
              for (let i=0;i<bars;i++){
                const b = document.createElement("div");
                b.className = "bar";
                refs.eq.appendChild(b);
                eqBars.push(b);
              }
            }
          },
          getEqCount: () => eqBars.length || 12,
          setTrack: (name)=>{
            if (!refs.track) return;
            refs.track.textContent = String(name||"");
            // Enable marquee if title overflows container.
            const el = refs.track;
            const box = el.parentElement;
            const boxW = box ? box.clientWidth : el.clientWidth;
            const dist = Math.max(0, (el.scrollWidth || 0) - (boxW || 0));
            if (dist > 8){
              el.classList.add("marquee");
              el.style.setProperty("--pmMarqueeDist", `${Math.ceil(dist)}px`);
            } else {
              el.classList.remove("marquee");
              el.style.removeProperty("--pmMarqueeDist");
            }
          },
          setPlay: (playing)=>{ if (refs.play) refs.play.textContent = playing ? "⏸" : "▶"; },
          setShuffle: (on)=>{ if (refs.shuffle) refs.shuffle.textContent = on ? "셔플: ON" : "셔플: OFF"; },
          setRepeat: (mode)=>{
            if (!refs.repeat) return;
            const m = String(mode||"none");
            refs.repeat.textContent = (m==="one") ? "반복: 1곡" : (m==="all" ? "반복: 전체" : "반복: 없음");
          },
          setVol: (v)=>{
            if (refs.vol) refs.vol.value = String(v ?? 0.7);
            if (refs.volVal){
              const n = Number.isFinite(v) ? v : 0.7;
              refs.volVal.textContent = String(Math.max(1, Math.min(10, Math.round(n * 10))));
            }
          },
          setTime: (cur, dur)=>{
            if (refs.time){
              const fmt = (sec)=>{
                if (!isFinite(sec) || sec < 0) return "0:00";
                sec = Math.floor(sec);
                const m = Math.floor(sec/60);
                const s = sec%60;
                return m + ":" + String(s).padStart(2,"0");
              };
              refs.time.textContent = fmt(cur) + " / " + fmt(dur);
            }
          },
          setEqIdle: (vals)=>{
            const n = Math.min(eqBars.length, vals.length);
            for (let i=0;i<n;i++){
              const v = vals[i];
              eqBars[i].style.transform = `scaleY(${Number(v).toFixed(3)})`;
            }
          },
          setEqBars: (vals)=>{
            const n = Math.min(eqBars.length, vals.length);
            for (let i=0;i<n;i++){
              const v = vals[i];
              eqBars[i].style.transform = `scaleY(${Number(v).toFixed(3)})`;
            }
          }
        };
        bgm.mountUI(adapter);
      }

      if (refs.vol) refs.vol.addEventListener("input", ()=>{
        const v = parseFloat(refs.vol.value);
        if (refs.volVal) refs.volVal.textContent = String(Math.max(1, Math.min(10, Math.round((Number.isFinite(v) ? v : 0.7) * 10))));
        if (typeof env.onVol === "function") env.onVol(v);
      });
      if (refs.bright) refs.bright.addEventListener("input", ()=>{
        const v = parseFloat(refs.bright.value);
        if (refs.brightVal){
          const b = Number.isFinite(v) ? v : 1;
          const n10 = Math.max(1, Math.min(10, Math.round(((b - 1.0) / 0.1) + 5)));
          refs.brightVal.textContent = String(n10);
        }
        if (typeof env.onBright === "function") env.onBright(v);
      });
      if (refs.resume) refs.resume.addEventListener("click", ()=>{ if (typeof env.onResume === "function") env.onResume(); });
      if (refs.exit) refs.exit.addEventListener("click", ()=>{ if (typeof env.onExit === "function") env.onExit(); });
      if (refs.prev) refs.prev.addEventListener("click", ()=>{ if (typeof env.onPrev === "function") env.onPrev(); });
      if (refs.next) refs.next.addEventListener("click", ()=>{ if (typeof env.onNext === "function") env.onNext(); });
      if (refs.play) refs.play.addEventListener("click", ()=>{ if (typeof env.onPlay === "function") env.onPlay(); });
      if (refs.shuffle) refs.shuffle.addEventListener("click", ()=>{ if (typeof env.onShuffle === "function") env.onShuffle(); });
      if (refs.repeat) refs.repeat.addEventListener("click", ()=>{ if (typeof env.onRepeat === "function") env.onRepeat(); });

      // Keep pause menu open unless explicitly closed.
      refs.overlay.addEventListener("mousedown", (e)=>{
        e.stopPropagation();
        if (e.target === refs.overlay) e.preventDefault();
      });
      refs.overlay.addEventListener("wheel", (e)=>{ e.stopPropagation(); }, { passive:false });
    }

    function isPauseOverlayTarget(target){
      const refs = getPauseMenuRefs();
      if (!refs.overlay || !target) return false;
      if (target === refs.overlay) return true;
      if (target.closest) return !!target.closest("#pauseOverlay");
      return false;
    }

    function bindPriceTipsOnce(env){
      if (r._priceTipBound) return;
      env = env || {};
      const COST = env.COST || window.COST;
      r._priceTipBound = true;

      if (!COST) return;

      let tip = document.getElementById("ou_priceTip");
      if (!tip){
        tip = document.createElement("div");
        tip.id = "ou_priceTip";
        tip.style.position = "fixed";
        tip.style.padding = "6px 10px";
        tip.style.borderRadius = "10px";
        tip.style.background = "rgba(0,0,0,0.86)";
        tip.style.color = "#ffe9a6";
        tip.style.fontSize = "18px";
        tip.style.fontWeight = "950";
        tip.style.pointerEvents = "none";
        tip.style.border = "1px solid rgba(255,233,166,0.35)";
        tip.style.boxShadow = "0 10px 30px rgba(0,0,0,0.45)";
        tip.style.zIndex = "9999";
        tip.style.display = "none";
        document.body.appendChild(tip);
      }
      r._priceTip = tip;

      const bound = r._tipBound || (r._tipBound = new WeakSet());

      const show = (kind, e)=>{
        const cost = COST[kind];
        if (cost == null){
          tip.style.display = "none";
          return;
        }
        tip.textContent = `$ ${cost}`;
        tip.style.left = (e.clientX + 16) + "px";
        tip.style.top  = (e.clientY + 16) + "px";
        tip.style.display = "block";
      };
      const move = (e)=>{
        if (tip.style.display !== "block") return;
        tip.style.left = (e.clientX + 16) + "px";
        tip.style.top  = (e.clientY + 16) + "px";
      };
      const hide = ()=>{ tip.style.display = "none"; };

      const bind = (btn, kind)=>{
        if (!btn || bound.has(btn)) return;
        bound.add(btn);
        btn.addEventListener("mouseenter", (e)=>show(kind, e));
        btn.addEventListener("mousemove", move);
        btn.addEventListener("mouseleave", hide);
      };

      // Resolve buttons (even if game.js didn't pass refs)
      r.btnPow = r.btnPow || document.getElementById("bPow");
      r.btnRef = r.btnRef || document.getElementById("bRef");
      r.btnBar = r.btnBar || document.getElementById("bBar");
      r.btnFac = r.btnFac || document.getElementById("bFac");
      r.btnRad = r.btnRad || document.getElementById("bRad");
      r.btnTur = r.btnTur || document.getElementById("bTur");

      r.btnInf = r.btnInf || document.getElementById("pInf");
      r.btnEng = r.btnEng || document.getElementById("pEng");
      r.btnSnp = r.btnSnp || document.getElementById("pSnp");
      r.btnTnk = r.btnTnk || document.getElementById("pTnk");
      r.btnHar = r.btnHar || document.getElementById("pHar");
      r.btnIFV = r.btnIFV || document.getElementById("pIFV");

      bind(r.btnPow, "power");
      bind(r.btnRef, "refinery");
      bind(r.btnBar, "barracks");
      bind(r.btnFac, "factory");
      bind(r.btnRad, "radar");
      bind(r.btnTur, "turret");

      bind(r.btnInf, "infantry");
      bind(r.btnEng, "engineer");
      bind(r.btnSnp, "sniper");
      bind(r.btnTnk, "tank");
      bind(r.btnHar, "harvester");
      bind(r.btnIFV, "ifv");
    }

    function bindGameButtons(env){
      env = env || {};
      const onSetBuild = env.onSetBuild;
      const onRadarBuild = env.onRadarBuild;
      const onLaneRClick = env.onLaneRClick;
      const onQueueUnit = env.onQueueUnit;
      const onUnitRClick = env.onUnitRClick;
      const onCancelBuild = env.onCancelBuild;
      const onGoToHQ = env.onGoToHQ;
      const onSellSelected = env.onSellSelected;
      const onCancelSel = env.onCancelSel;
      const onToggleRepair = env.onToggleRepair;
      const onStopUnits = env.onStopUnits;
      const onScatterUnits = env.onScatterUnits;
      const onToggleRepairMode = env.onToggleRepairMode;
      const onToggleSellMode = env.onToggleSellMode;
      const onSelectAllKind = env.onSelectAllKind;

      if (!bindGameButtons._bound) bindGameButtons._bound = new WeakMap();
      const bound = bindGameButtons._bound;
      const bindOnce = (btn, evt, key, fn)=>{
        if (!btn || typeof fn !== "function") return;
        let set = bound.get(btn);
        if (!set){ set = new Set(); bound.set(btn, set); }
        const tag = evt + ":" + key;
        if (set.has(tag)) return;
        set.add(tag);
        btn.addEventListener(evt, fn);
      };

      const $ = (id)=>document.getElementById(id);
      const btnRef = $("bRef");
      const btnPow = $("bPow");
      const btnBar = $("bBar");
      const btnFac = $("bFac");
      const btnTur = $("bTur");
      const btnRad = $("bRad");
      const btnCan = $("bCan");
      const btnToHQ = $("toHQ");
      const btnSell = $("sell");

      const btnInf = $("pInf");
      const btnEng = $("pEng");
      const btnSnp = $("pSnp");
      const btnTnk = $("pTnk");
      const btnHar = $("pHar");
      const btnIFV = $("pIFV");

      const btnRepair = $("repair");
      const btnStop = $("stop");
      const btnScatter = $("scatter");
      const btnCancelSel = $("cancelSel");
      const btnSelAllKind = $("selAllKind");
      const btnRepair2 = $("repair2");
      const btnStop2 = $("stop2");
      const btnScatter2 = $("scatter2");

      const btnRepairMode = $("btnRepairMode");
      const btnSellMode   = $("btnSellMode");

      bindOnce(btnRef, "click", "setBuild:refinery", ()=>onSetBuild && onSetBuild("refinery"));
      bindOnce(btnPow, "click", "setBuild:power", ()=>onSetBuild && onSetBuild("power"));
      bindOnce(btnBar, "click", "setBuild:barracks", ()=>onSetBuild && onSetBuild("barracks"));
      bindOnce(btnFac, "click", "setBuild:factory", ()=>onSetBuild && onSetBuild("factory"));
      bindOnce(btnTur, "click", "setBuild:turret", ()=>onSetBuild && onSetBuild("turret"));
      bindOnce(btnRad, "click", "setBuild:radar", ()=>onRadarBuild ? onRadarBuild() : (onSetBuild && onSetBuild("radar")));

      bindOnce(btnPow, "contextmenu", "laneRClick:power", (ev)=>{ ev.preventDefault(); onLaneRClick && onLaneRClick("main", "power"); });
      bindOnce(btnRef, "contextmenu", "laneRClick:refinery", (ev)=>{ ev.preventDefault(); onLaneRClick && onLaneRClick("main", "refinery"); });
      bindOnce(btnBar, "contextmenu", "laneRClick:barracks", (ev)=>{ ev.preventDefault(); onLaneRClick && onLaneRClick("main", "barracks"); });
      bindOnce(btnFac, "contextmenu", "laneRClick:factory", (ev)=>{ ev.preventDefault(); onLaneRClick && onLaneRClick("main", "factory"); });
      bindOnce(btnRad, "contextmenu", "laneRClick:radar", (ev)=>{ ev.preventDefault(); onLaneRClick && onLaneRClick("main", "radar"); });
      bindOnce(btnTur, "contextmenu", "laneRClick:turret", (ev)=>{ ev.preventDefault(); onLaneRClick && onLaneRClick("def", "turret"); });

      bindOnce(btnCan, "click", "cancelBuild", ()=>onCancelBuild && onCancelBuild());
      bindOnce(btnToHQ, "click", "goToHQ", ()=>onGoToHQ && onGoToHQ());
      bindOnce(btnSell, "click", "sellSelected", ()=>onSellSelected && onSellSelected());

      bindOnce(btnInf, "click", "queueUnit:infantry", ()=>onQueueUnit && onQueueUnit("infantry"));
      bindOnce(btnEng, "click", "queueUnit:engineer", ()=>onQueueUnit && onQueueUnit("engineer"));
      bindOnce(btnSnp, "click", "queueUnit:sniper", ()=>onQueueUnit && onQueueUnit("sniper"));
      bindOnce(btnTnk, "click", "queueUnit:tank", ()=>onQueueUnit && onQueueUnit("tank"));
      bindOnce(btnHar, "click", "queueUnit:harvester", ()=>onQueueUnit && onQueueUnit("harvester"));
      bindOnce(btnIFV, "click", "queueUnit:ifv", ()=>onQueueUnit && onQueueUnit("ifv"));

      bindOnce(btnInf, "contextmenu", "unitRClick:infantry", (ev)=>{ ev.preventDefault(); onUnitRClick && onUnitRClick("infantry"); });
      bindOnce(btnEng, "contextmenu", "unitRClick:engineer", (ev)=>{ ev.preventDefault(); onUnitRClick && onUnitRClick("engineer"); });
      bindOnce(btnSnp, "contextmenu", "unitRClick:sniper", (ev)=>{ ev.preventDefault(); onUnitRClick && onUnitRClick("sniper"); });
      bindOnce(btnTnk, "contextmenu", "unitRClick:tank", (ev)=>{ ev.preventDefault(); onUnitRClick && onUnitRClick("tank"); });
      bindOnce(btnHar, "contextmenu", "unitRClick:harvester", (ev)=>{ ev.preventDefault(); onUnitRClick && onUnitRClick("harvester"); });
      bindOnce(btnIFV, "contextmenu", "unitRClick:ifv", (ev)=>{ ev.preventDefault(); onUnitRClick && onUnitRClick("ifv"); });

      bindOnce(btnCancelSel, "click", "cancelSel", ()=>onCancelSel && onCancelSel());
      bindOnce(btnRepair, "click", "toggleRepair", ()=>onToggleRepair && onToggleRepair());
      bindOnce(btnStop, "click", "stopUnits", ()=>onStopUnits && onStopUnits());
      bindOnce(btnScatter, "click", "scatterUnits", ()=>onScatterUnits && onScatterUnits());

      bindOnce(btnRepair2, "click", "toggleRepair:veh", ()=>onToggleRepair && onToggleRepair());
      bindOnce(btnStop2, "click", "stopUnits:veh", ()=>onStopUnits && onStopUnits());
      bindOnce(btnScatter2, "click", "scatterUnits:veh", ()=>onScatterUnits && onScatterUnits());

      bindOnce(btnRepairMode, "click", "repairMode", ()=>onToggleRepairMode && onToggleRepairMode());
      bindOnce(btnSellMode, "click", "sellMode", ()=>onToggleSellMode && onToggleSellMode());

      bindOnce(btnSelAllKind, "click", "selAllKind", ()=>onSelectAllKind && onSelectAllKind());
    }

    function bindPregameStart(env){
      env = env || {};
      const onStart = env.onStart;
      const $ = (id)=>document.getElementById(id);
      const startBtn = env.startBtn || $("startBtn");
      if (!startBtn || typeof onStart !== "function") return;
      if (!bindPregameStart._bound) bindPregameStart._bound = new WeakSet();
      const bound = bindPregameStart._bound;
      if (bound.has(startBtn)) return;
      bound.add(startBtn);

      const pColorInput = env.pColorInput || $("pColor");
      const eColorInput = env.eColorInput || $("eColor");
      const fogOffChk = env.fogOffChk || $("fogOff");
      const fastProdChk = env.fastProdChk || $("fastProd");

      startBtn.addEventListener("click", async ()=>{
        const payload = {
          playerColor: pColorInput ? pColorInput.value : null,
          enemyColor: eColorInput ? eColorInput.value : null,
          fogOff: !!(fogOffChk && fogOffChk.checked),
          fastProd: !!(fastProdChk && fastProdChk.checked)
        };
        try{
          await onStart(payload);
        }catch(err){
          console.error("[pregame] start failed", err);
        }
      });
    }

return {
      updateSelectionUI,
      showFatalError,
      setGameBrightness,
      getGameBrightness,
      restoreGameBrightness,
            updateSidebarButtons,
            updatePowerBar,
            updateProdBadges,
            refreshPrimaryBuildingBadgesUI,
            updateProdBars,
            // extras
            toast,
            updateMoney,
            applyMouseMode,
            updateBuildModeUI,
            bindPriceTipsOnce,
            updateProdTabsUI,
            bindProdTabClicks,
            bindGameButtons,
            bindPregameStart,
            initPregameUI,
            setPregameLoading,
            hidePregame,
            setSellLabel,
            updateFps,
            updateTuneOverlay,
            setPauseMenuVisible,
            wirePauseMenuUI,
            isPauseOverlayTarget
    };
  };
})(window);


