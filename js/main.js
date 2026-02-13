import { createInitialState } from "./core/state.js";
import { CONFIG } from "./core/config.js";
import { createEventBus } from "./core/events.js";

import { tickMovement } from "./systems/movementSystem.js";
import { tickCombat } from "./systems/combatSystem.js";
import { tickBullets } from "./systems/bulletSystem.js";
import { tickAI } from "./systems/aiSystem.js";
import { tickProduction } from "./systems/productionSystem.js";
import { tickFog } from "./systems/fogSystem.js";
import { tickDeath } from "./systems/deathSystem.js";

import { renderWorld } from "./render/renderWorld.js";
import { renderUI } from "./render/renderUI.js";
import { renderEffects } from "./render/renderEffects.js";

import "./legacy/index.js";
import { spawnUnit } from "./entities/unitFactory.js";
import { placeBuilding } from "./entities/buildingFactory.js";
import { TEAM } from "./core/config.js";

const bus = createEventBus();

function $(id){ return document.getElementById(id); }

function bindPregameUI(state){
  const startBtn = $("startBtn");
  const pregame = $("pregame");
  const pColor = $("pColor");
  const eColor = $("eColor");
  const fogOff = $("fogOff");
  const fastProd = $("fastProd");

  // chip toggles
  document.querySelectorAll(".chip.spawn").forEach(el=>{
    el.addEventListener("click", ()=>{
      document.querySelectorAll(".chip.spawn").forEach(x=>x.classList.remove("on"));
      el.classList.add("on");
      state.settings.spawn = el.dataset.spawn || "left";
    });
  });
  document.querySelectorAll(".chip.money").forEach(el=>{
    el.addEventListener("click", ()=>{
      document.querySelectorAll(".chip.money").forEach(x=>x.classList.remove("on"));
      el.classList.add("on");
      state.settings.startMoney = Number(el.dataset.money || 10000);
    });
  });

  // inputs
  pColor.addEventListener("input", ()=> state.players.self.color = pColor.value);
  eColor.addEventListener("input", ()=> state.players.enemy.color = eColor.value);
  fogOff.addEventListener("change", ()=> state.settings.fogOff = !!fogOff.checked);
  fastProd.addEventListener("change", ()=> state.settings.fastProd = !!fastProd.checked);

  startBtn.addEventListener("click", ()=>{
    state.running = true;
    pregame.style.display = "none";
    bus.emit("game:start", { settings: state.settings });
  });
}

function setupCanvas(state){
  const canvas = $("c");
  const ctx = canvas.getContext("2d", { alpha: false });
  state.view.canvas = canvas;
  state.view.ctx = ctx;

  function resize(){
    canvas.width = Math.floor(window.innerWidth * CONFIG.render.scale);
    canvas.height = Math.floor(window.innerHeight * CONFIG.render.scale);
    state.view.w = canvas.width;
    state.view.h = canvas.height;
  }
  window.addEventListener("resize", resize);
  resize();
}

function gameTick(state, dt){
  state.sim.t += dt;
  // systems (pure-ish): mutate state only
  tickAI(state, dt, bus);
  tickProduction(state, dt, bus);
  tickMovement(state, dt, bus);
  tickCombat(state, dt, bus);
  tickBullets(state, dt, bus);
  tickDeath(state, dt, bus);
  tickFog(state, dt, bus);
}

function gameRender(state){
  renderWorld(state);
  renderEffects(state);
  renderUI(state);
}

function boot(){
  const state = createInitialState(CONFIG);
  state.bus = bus;

  setupCanvas(state);
  bindPregameUI(state);
// Spawn a small test setup so you can verify rendering + bullet system wiring.
// Replace these with your real spawn logic once movement/production are migrated.
bus.on("game:start", ()=>{
  state.players.self.money = state.settings.startMoney;
  state.players.enemy.money = state.settings.startMoney;

  // Buildings

  placeBuilding(state, { kind:"hq", team: TEAM.PLAYER, tx: 6, ty: 10, w: 3, h: 3, hp: 1200 });
  placeBuilding(state, { kind:"barracks", team: TEAM.PLAYER, tx: 10, ty: 12, w: 2, h: 3, hp: 700 });

  placeBuilding(state, { kind:"hq", team: TEAM.ENEMY, tx: 42, ty: 18, w: 3, h: 3, hp: 1200 });

  // Units (3 snipers + 3 IFV example placeholder circles)
  for(let i=0;i<3;i++){
    spawnUnit(state, { kind:"sniper", team: TEAM.PLAYER, x: 340 + i*28, y: 420, hp: 90, radius: 10 });
    spawnUnit(state, { kind:"ifv", team: TEAM.PLAYER, x: 340 + i*28, y: 470, hp: 220, radius: 14 });
  }
  // enemy scouts
  for(let i=0;i<4;i++){
    spawnUnit(state, { kind:"inf", team: TEAM.ENEMY, x: 900 + i*24, y: 560, hp: 100, radius: 10 });
  }
});


  // basic pause overlay wiring (minimal)
  const overlay = $("pauseOverlay");
  const resume = $("pmResume");
  const exit = $("pmExit");

  window.addEventListener("keydown", (e)=>{
    if(e.key === "Escape"){
      state.ui.paused = !state.ui.paused;
      overlay.setAttribute("aria-hidden", state.ui.paused ? "false" : "true");
      overlay.style.display = state.ui.paused ? "flex" : "none";
    }
  });
  resume?.addEventListener("click", ()=>{
    state.ui.paused = false;
    overlay.setAttribute("aria-hidden", "true");
    overlay.style.display = "none";
  });
  exit?.addEventListener("click", ()=>{
    // simple: reload to reset
    location.reload();
  });

  let last = performance.now();
  function loop(now){
    const rawDt = (now - last) / 1000;
    last = now;

    const dt = Math.min(rawDt, CONFIG.sim.maxDt);

    if(state.running && !state.ui.paused){
      gameTick(state, dt);
    }
    gameRender(state);

    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);

  // show something immediately
  bus.emit("boot:ready", {});
  return state;
}

boot();
