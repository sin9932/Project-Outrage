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
r.uiMoney     = r.uiMoney     || document.getElementById("money");
r.uiBuildMode = r.uiBuildMode || document.getElementById("buildMode");
r.uiToast     = r.uiToast     || document.getElementById("toast");

// Cursor mode buttons
r.btnRepairMode = r.btnRepairMode || document.getElementById("btnRepairMode");
r.btnSellMode   = r.btnSellMode   || document.getElementById("btnSellMode");


// Install power tooltip (once). Falls back to title attribute as well.
if (!r.__powerTipInstalled){
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

  const bindTip = (el)=>{
    if (!el) return;
    el.addEventListener("mouseenter", showTip);
    el.addEventListener("mousemove", showTip);
    el.addEventListener("mouseleave", hideTip);
  };
  bindTip(r.uiPowerBar);
  bindTip(r.uiPowerNeed);
  bindTip(r.uiPowerFill);
}


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
          barracks: ["hq","refinery"],
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

      function setEnabled(btn, ok){
        if (!btn) return;
        btn.disabled = !ok;
        btn.classList.toggle("disabled", !ok);
      }

      function setVisible(btn, ok){
        if (!btn) return;
        btn.style.display = ok ? "" : "none";
      }
      function applyTech(btn, ok){
        setVisible(btn, ok);
        setEnabled(btn, ok);
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

      // Apply tabs visibility
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

      // Build panel buttons
      applyTech(r.btnPow, prereqOk("power", tech.buildPrereq));
      applyTech(r.btnRef, prereqOk("refinery", tech.buildPrereq));
      applyTech(r.btnBar, prereqOk("barracks", tech.buildPrereq));
      applyTech(r.btnFac, prereqOk("factory", tech.buildPrereq));
      applyTech(r.btnRad, prereqOk("radar", tech.buildPrereq));
      applyTech(r.btnTur, prereqOk("turret", tech.buildPrereq));

      // Unit panel buttons
      applyTech(r.btnInf, prereqOk("infantry", tech.unitPrereq));
      applyTech(r.btnEng, prereqOk("engineer", tech.unitPrereq));
      applyTech(r.btnSnp, prereqOk("sniper", tech.unitPrereq));
      applyTech(r.btnTnk, prereqOk("tank", tech.unitPrereq));
      applyTech(r.btnIFV, prereqOk("ifv", tech.unitPrereq));
      applyTech(r.btnHar, prereqOk("harvester", tech.unitPrereq));

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
      } else if (mode==="sell"){
        el.textContent = "SELL";
        el.className = "pill warn";
      } else if (anyReady){
        el.textContent = "BUILD";
        el.className = "pill ok";
      } else {
        el.textContent = "NORMAL";
        el.className = "pill";
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

return {
      updateSelectionUI,
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
            bindPriceTipsOnce
    };
  };
})(window);
