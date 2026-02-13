
/* =====================================================
   RTS CORE - REFACTORED STRUCTURE (STABLE BASE)
   ===================================================== */

/* ======================
   GLOBAL STATE MODULE
   ====================== */
const GameState = {
  time: 0,
  running: false,
  gameOver: false
};

const Entities = {
  units: [],
  buildings: []
};

const Selection = new Set();

/* ======================
   UTILS MODULE
   ====================== */
function dist2(x1,y1,x2,y2){
  const dx = x2-x1;
  const dy = y2-y1;
  return dx*dx + dy*dy;
}

/* ======================
   DAMAGE / COMBAT MODULE
   ====================== */
const Combat = {

  applyDamage(target, dmg, srcId=null, srcTeam=null){
    if (!target || !target.alive) return;
    if (target.attackable === false) return;

    target.hp -= dmg;

    if (target.hp > 0) return;

    this.handleDeath(target);
  },

  handleDeath(ent){
    if (!ent || !ent.alive) return;

    ent.alive = false;
    Selection.delete(ent.id);

    if (ent.onDeath) ent.onDeath();
  },

  applyAreaDamage(x,y,radius,dmg,srcId=null,srcTeam=null){
    const r2 = radius*radius;

    for (const u of Entities.units){
      if (!u.alive) continue;
      if (dist2(x,y,u.x,u.y) <= r2){
        this.applyDamage(u,dmg,srcId,srcTeam);
      }
    }

    for (const b of Entities.buildings){
      if (!b.alive) continue;
      if (dist2(x,y,b.x,b.y) <= r2){
        this.applyDamage(b,dmg,srcId,srcTeam);
      }
    }
  }

};

/* ======================
   BULLET SYSTEM MODULE
   ====================== */
const Bullets = {

  list: [],

  tick(dt){
    for (let i=this.list.length-1;i>=0;i--){
      const b = this.list[i];
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;

      if (b.life <= 0){
        this.list.splice(i,1);
      }
    }
  }

};

/* ======================
   AI MODULE
   ====================== */
const AI = {

  pickTarget(){

    for (const b of Entities.buildings){
      if (b.alive && b.team==="PLAYER"){
        return {x:b.x,y:b.y};
      }
    }

    for (const u of Entities.units){
      if (u.alive && u.team==="PLAYER"){
        return {x:u.x,y:u.y};
      }
    }

    return null;
  },

  tick(dt){
    const target = this.pickTarget();
    if (!target) return;

    for (const u of Entities.units){
      if (!u.alive) continue;
      if (u.team!=="ENEMY") continue;

      u.targetX = target.x;
      u.targetY = target.y;
    }
  }

};

/* ======================
   MAIN TICK LOOP
   ====================== */
function tick(dt){

  if (!GameState.running) return;
  if (GameState.gameOver) return;

  GameState.time += dt;

  AI.tick(dt);
  Bullets.tick(dt);
}

/* ======================
   INIT
   ====================== */
function startGame(){
  GameState.running = true;
  GameState.gameOver = false;
  GameState.time = 0;
}



/* ======================
   UI BINDINGS (START BUTTON)
   ====================== */
function bindStartButton(){
  const btn = document.getElementById("startBtn");
  if (!btn) {
    console.warn("[UI] startBtn not found");
    return;
  }

  // Make sure it feels clickable
  try { btn.style.cursor = "pointer"; } catch(e){}

  btn.addEventListener("click", (ev)=>{
    ev.preventDefault();
    ev.stopPropagation();

    // Start the simulation
    try { startGame(); } catch(e){ console.error("[UI] startGame failed", e); }

    // Hide pregame overlay if it exists
    const pre = document.getElementById("pregame");
    if (pre) pre.style.display = "none";

    console.log("[UI] game started");
  }, { passive: false });
}

document.addEventListener("DOMContentLoaded", ()=>{
  bindStartButton();
});

console.log("Refactored RTS Core Loaded.");
