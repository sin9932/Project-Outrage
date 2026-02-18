/* ou_economy.js
   Economy / production module (step2): money drain, power, unit production, build lanes.
   Keep it boring and predictable: no DOM here. UI is injected via callbacks.
*/
(function(global){
  "use strict";

  function noop(){}

  function create(ctx){
    ctx = ctx || {};

    // Required game refs
    const state = ctx.state;
    const buildings = ctx.buildings || [];
    const TEAM = ctx.TEAM || {};
    const COST = ctx.COST || {};
    const POWER = ctx.POWER || {};

    // Shared queue data (kept in game.js for now, passed in by reference)
    const prodFIFO = ctx.prodFIFO || { barracks:[], factory:[] };
    const prodTotal = ctx.prodTotal || {};
    const QCAP = (typeof ctx.QCAP==="number") ? ctx.QCAP : 30;

    // Tunables / helpers
    const clamp = ctx.clamp || function(v,a,b){ return Math.max(a, Math.min(b, v)); };
    const BUILD_SPEED_MIN_PER_1000 = (typeof ctx.BUILD_SPEED_MIN_PER_1000==="number") ? ctx.BUILD_SPEED_MIN_PER_1000 : 8;
    const GAME_SPEED = (typeof ctx.GAME_SPEED==="number") ? ctx.GAME_SPEED : 1;
    const BUILD_PROD_MULT = (typeof ctx.BUILD_PROD_MULT==="number") ? ctx.BUILD_PROD_MULT : 1;
    const MULTIPLE_FACTORY = (typeof ctx.MULTIPLE_FACTORY==="boolean") ? ctx.MULTIPLE_FACTORY : true;
    const ENEMY_PROD_SPEED = (typeof ctx.ENEMY_PROD_SPEED==="number") ? ctx.ENEMY_PROD_SPEED : 1;

    // UI hooks (optional)
    const toast = ctx.toast || noop;
    const updateProdBadges = ctx.updateProdBadges || noop;

    // Spawn helpers (optional but needed for real production)
    const addUnit = ctx.addUnit || null;
    const setPathTo = ctx.setPathTo || null;
    const findSpawnPointNear = ctx.findSpawnPointNear || null;
    const findNearestFreePoint = ctx.findNearestFreePoint || null;

    // -------------------------
    // Power / rates
    // -------------------------
    function getPowerFactor(team){
        const p = team===TEAM.PLAYER ? state.player : state.enemy;
        if (p.powerUse<=0) return 1;
        if (p.powerProd>p.powerUse) return 1;
        return 0.5;
      }
    function isUnderPower(team){
        const p = team===TEAM.PLAYER ? state.player : state.enemy;
        return (p.powerUse>0 && p.powerProd <= p.powerUse);
      }

    // -------------------------
    // Build lane timing
    // -------------------------
    function getBaseBuildTime(kind){
      const c = COST[kind] || 0;
      // (cost/1000) * BuildSpeed * 60 seconds
      // keep a small floor so ultra-cheap items still have visible progress
      return clamp((c/1000) * BUILD_SPEED_MIN_PER_1000 * 60, 2.2, 90);
    }

    function tickBuildLanes(dt){
      // Building production: two independent lanes (main/def) with reservation FIFO.
      // Each lane: can reserve many -> one active build -> READY (await placement) -> then next.
      const pf = getPowerFactor(TEAM.PLAYER);
      const speedBase = pf * GAME_SPEED * BUILD_PROD_MULT;
      const debugFastBuild = !!(state.debug && state.debug.fastProd); // player-only building fast-complete

      function startNextIfIdle(lane){
        if (!lane) return;
        if (lane.ready || lane.queue) return;
        if (lane.fifo && lane.fifo.length){
          const kind = lane.fifo.shift();
          lane.queue = { kind, t:0, tNeed:getBaseBuildTime(kind), cost:(COST[kind]||0), paid:0 };
        }
      }

      function tickLane(laneKey){
        const lane = state.buildLane[laneKey];
        if (!lane) return;

        // If idle, kick next reservation
        startNextIfIdle(lane);

        if (!lane.queue) return;
        if (lane.ready) return;

        const q = lane.queue;
        const debugFast = debugFastBuild; // buildings are player-only lanes
        if (debugFast){
          // Debug fast build: finish this build in ~1s real-time, ignore money/power throttles.
          q.paused = false; q.autoPaused = false; q._autoToast = false;
        }
        // Auto-resume if we were paused only because of insufficient money.
        if (q.paused){
          if (q.autoPaused){
            const costTotalTmp = q.cost || 0;
            const tNeedTmp = q.tNeed || 0.001;
            const payRateTmp = (costTotalTmp<=0) ? 0 : (costTotalTmp / tNeedTmp);
            const canByMoneyTmp = (payRateTmp<=0) ? 1 : (state.player.money / payRateTmp);
            if (canByMoneyTmp > 0){
              q.paused = false;
              q.autoPaused = false;
              q._autoToast = false;
            } else {
              return;
            }
          } else {
            return;
          }
        }
        const speed = debugFast ? (q.tNeed || 1) : speedBase;
        const want = dt * speed;
        const costTotal = q.cost || 0;
        const tNeed = q.tNeed || 0.001;
        const payRate = (costTotal<=0) ? 0 : (costTotal / tNeed);
        const canByMoney = debugFast ? want : ((payRate<=0) ? want : (state.player.money / payRate));
        const delta = Math.min(want, canByMoney);
        // Out of money => auto-pause (do NOT confuse 'no progress' with 'no money').
        // If want<=0, we are simply not progressing this frame (pause, power, etc). Don't force a money-wait state.
        if (delta <= 0){
          if (want <= 0){
            return;
          }
          // If build time is broken (0), don't auto-pause by money logic.
          if (tNeed <= 0){
            return;
          }
          if (payRate>0 && (state.player.money / payRate) <= 0){
            q.paused = true;
            q.autoPaused = true;
            if (!q._autoToast){ q._autoToast=true; toast("대기"); }
          }
          return;
        }

        let pay = payRate * delta;
        if (debugFast){
          pay = 0;
          q.paid = costTotal;
        } else {
          state.player.money -= pay;
          q.paid = (q.paid||0) + pay;
        }
        q.t += delta;

        if (q.t >= tNeed - 1e-6){
          q.t = tNeed; q.paid = costTotal;
          lane.ready = q.kind;
          lane.queue = null;
        }
      }

      tickLane("main");
      tickLane("def");
    }

    // -------------------------
    // Unit production queue
    // -------------------------
    function kindToProducer(kind){
      return (kind==="tank" || kind==="harvester" || kind==="ifv") ? "factory" : "barracks";
    }

    function queueUnit(kind){
      if (prodTotal[kind] >= QCAP) return;

      const need = kindToProducer(kind);

      // Keep RA2-ish restriction: can't queue without having a producer.
      const hasProducer = buildings.some(b=>b.alive && !b.civ && b.team===TEAM.PLAYER && b.kind===need);
      if (!hasProducer){ toast("생산 건물이 없습니다"); return; }

      // If a front-of-queue item of this kind is currently paused, left-click resumes instead of enqueuing another.
      for (const b of buildings){
        if (!b.alive || b.civ || b.team!==TEAM.PLAYER || b.kind!==need) continue;
        const q = b.buildQ && b.buildQ[0];
        if (q && q.kind===kind && q.paused){
          q.paused = false;
          q.autoPaused = false;
          toast("재개");
          return;
        }
      }

      prodFIFO[need].push({ kind });
      if (prodTotal[kind]==null || Number.isNaN(prodTotal[kind])) prodTotal[kind]=0;
      prodTotal[kind] += 1;
      updateProdBadges();
    }

    function ensurePrimaryProducer(kind){
      if (kind!=="barracks" && kind!=="factory") return null;
      const pid = (kind==="barracks") ? state.primary.player.barracks : state.primary.player.factory;
      const pb = pid ? buildings.find(b=>b.alive && !b.civ && b.team===TEAM.PLAYER && b.kind===kind && b.id===pid) : null;
      if (pb) return pb;
      // clear stale id
      if (kind==="barracks") state.primary.player.barracks = null;
      else state.primary.player.factory = null;
      const first = buildings.find(b=>b.alive && !b.civ && b.team===TEAM.PLAYER && b.kind===kind) || null;
      if (first){
        if (kind==="barracks") state.primary.player.barracks = first.id;
        else state.primary.player.factory = first.id;
      }
      return first;
    }

    function findProducer(team, need){
      // PRIMARY building override (player only)
      if (team===TEAM.PLAYER && (need==="barracks" || need==="factory")){
        const pb = ensurePrimaryProducer(need);
        if (pb) return pb;
      }
      // Fallback: prefer smallest queue
      const list = buildings.filter(b=>b.alive && !b.civ && b.team===team && b.kind===need);
      if (!list.length) return null;
      list.sort((a,b)=>a.buildQ.length-b.buildQ.length);
      return list[0];
    }

    function normalizeProducerQueues(kind){
      // Enforce C&C-style: one active queue per producer type (barracks/factory) for the player.
      if (kind!=="barracks" && kind!=="factory") return;
      const pb = ensurePrimaryProducer(kind);
      if (!pb) return;
      const cap = (kind==="barracks") ? 12 : 10;

      for (const b of buildings){
        if (!b.alive || b.civ || b.team!==TEAM.PLAYER || b.kind!==kind) continue;
        if (b.id===pb.id) continue;
        if (!b.buildQ || !b.buildQ.length) continue;

        // Move as much as possible into primary queue.
        while (b.buildQ.length && pb.buildQ.length < cap){
          pb.buildQ.push(b.buildQ.shift());
        }

        // Anything left: put back to the GLOBAL FIFO (front), preserving order.
        if (b.buildQ.length){
          const rest = b.buildQ.splice(0);
          for (let i=rest.length-1;i>=0;i--){
            const it = rest[i];
            prodFIFO[kind].unshift({ kind: it.kind });
          }
        }
      }
    }

    function feedProducers(){
      normalizeProducerQueues("barracks");
      normalizeProducerQueues("factory");

      // Barracks queue (infantry + engineer share order)
      let guard=0;
      while (prodFIFO.barracks.length && guard++<200){
        const b = findProducer(TEAM.PLAYER, "barracks");
        if (!b) break;
        if (b.buildQ.length >= 12) break;

        const req = prodFIFO.barracks.shift();
        const k = req.kind;
        b.buildQ.push({ kind:k, t:0, tNeed:getBaseBuildTime(k), cost:COST[k], paid:0 });
      }

      // Factory queue (vehicles)
      guard=0;
      while (prodFIFO.factory.length && guard++<200){
        const b = findProducer(TEAM.PLAYER, "factory");
        if (!b) break;
        if (b.buildQ.length >= 10) break;

        const req = prodFIFO.factory.shift();
        const k = req.kind;
        b.buildQ.push({ kind:k, t:0, tNeed:getBaseBuildTime(k), cost:COST[k], paid:0 });
      }
    }

    // -------------------------
    // Production tick (progress + pay + spawn)
    // -------------------------
    function tickProduction(dt){
        for (const b of buildings){
            if (!b.alive || b.civ) continue;
            if (!b.buildQ.length) continue;


          // PRIMARY producer spawn routing (player): production can progress on any producer,
          // but finished units spawn/rally from the current PRIMARY of that producer type.
          const primarySpawn = (b.team===TEAM.PLAYER && (b.kind==="barracks" || b.kind==="factory"))
            ? ensurePrimaryProducer(b.kind)
            : null;
          const spawnB = primarySpawn || b;


          const pf=getPowerFactor(b.team);
          const sameCount = buildings.filter(x=>x.alive && !x.civ && x.team===b.team && x.kind===b.kind).length || 1;
          // RA2/YR rules(md).ini MultipleFactory: build time multiplier = MULTIPLE_FACTORY^(sameCount-1)
          // 즉, 속도(진행률)는 1 / MULTIPLE_FACTORY^(sameCount-1)
          const mf = Math.min(20, sameCount); // 안전 상한
          const multiSpeed = 1 / Math.pow(MULTIPLE_FACTORY, (mf - 1));
          let speed = pf * multiSpeed * GAME_SPEED * BUILD_PROD_MULT * ((b.team===TEAM.ENEMY)?ENEMY_PROD_SPEED:1) * (isUnderPower(b.team)?0.5:1);
          // v139: HQ(메인건물) 건설 속도 더 상향
          if (b.kind==="hq") speed *= 3;

          const q=b.buildQ[0];

          const debugFastProd = !!(state.debug && state.debug.fastProd && b.team===TEAM.PLAYER);

          // Debug fast production: player only, finish any queue item in ~1s real-time.
          // - Enemy is not affected.
          // - Ignores power + money throttles so it always completes.
          if (debugFastProd){
            if (q){ q.paused = false; q.autoPaused = false; }
            speed = (q && q.tNeed) ? q.tNeed : 1;
          }


    // Manual/auto pause support (대기).
    // autoPaused(자금 부족)인 경우, 돈이 다시 생기면 자동으로 재개한다. (수동 클릭 안 해도 됨)
    if (q.paused && !debugFastProd){
      const teamWalletTmp = (b.team===TEAM.PLAYER) ? state.player : state.enemy;
      const costTotalTmp = q.cost ?? (COST[q.kind]||0);
      const tNeedTmp = q.tNeed || 0.001;
      const payRateTmp = costTotalTmp / tNeedTmp;
      const wantTmp = dt * speed;
      const canByMoneyTmp = (payRateTmp<=0) ? wantTmp : (teamWalletTmp.money / payRateTmp);
      if (q.autoPaused && canByMoneyTmp > 0){
        q.paused = false;
        q.autoPaused = false;
      } else {
        continue;
      }
    }

          // Money drains while progress advances (RA2-ish).
          const teamWallet = (b.team===TEAM.PLAYER) ? state.player : state.enemy;
          const costTotal = q.cost ?? (COST[q.kind]||0);
          const tNeed = q.tNeed || 0.001;
          const payRate = costTotal / tNeed; // credits per second at 1x speed

          const want = dt * speed;                  // seconds of progress we WANT
          const canByMoney = debugFastProd ? want : ((payRate<=0) ? want : (teamWallet.money / payRate)); // seconds we CAN afford
          const delta = Math.min(want, canByMoney);

          // If we can't afford progress now, force-pause. Must be resumed manually via left-click.
          if (delta <= 0){
            if (debugFast) return;
            // FIX: '대기 (자금 부족)'가 자금 충분한데도 뜨는 케이스가 있었음.
            // 원인: speed=0(일시정지/전력/기타)로 want=0인데도 "자금 부족" 경로로 들어가던 문제.
            // - want<=0이면 그냥 진행이 없는 상태이므로 자동자금대기 처리하지 않는다.
            // - 돈이 진짜로 부족할 때만 autoPaused로 전환한다.
            if (want <= 0){
              continue;
            }
            if (payRate>0 && (state.player.money / payRate) <= 0){
              q.paused = true;
              q.autoPaused = true;
              if (!q._autoToast && b.team===TEAM.PLAYER){ q._autoToast=true; toast("대기"); }
            }
            continue;
          }

          let pay = payRate * delta;
          if (debugFastProd){
            pay = 0;
            q.paid = costTotal;
          } else {
            teamWallet.money -= pay;
            q.paid = (q.paid||0) + pay;
          }

          q.t += delta;

          if (q.t >= tNeed - 1e-6){
            // snap to complete
            q.t = tNeed;
            q.paid = costTotal;

            const sp = findSpawnPointNear(spawnB, q.kind);
            if (!sp){
              q.spawnReady = true;
              q.t = tNeed;
              q.paid = costTotal;
              continue;
            }
            const u = addUnit(spawnB.team, q.kind, sp.x, sp.y);

            // Rally / waypoint
            if (spawnB.rally && spawnB.rally.x!=null && spawnB.rally.y!=null){
              u.order = { type:"move", x:spawnB.rally.x, y:spawnB.rally.y, tx:null, ty:null };
              u.target = null;
              setPathTo(u, spawnB.rally.x, spawnB.rally.y);
              u.repathCd = 0.25;

            } else {
              // No rally set: eject newly produced unit away from the producer entrance to avoid door jams.
              const fp = findNearestFreePoint(u.x, u.y, u, 6);
              if (fp){
                u.order = { type:"move", x:fp.x, y:fp.y, tx:null, ty:null };
                u.target = null;
                setPathTo(u, fp.x, fp.y);
                u.repathCd = 0.25;
              }
            }

            b.buildQ.shift();
            if (prodTotal[q.kind]==null || Number.isNaN(prodTotal[q.kind])) prodTotal[q.kind]=0;
            prodTotal[q.kind] = Math.max(0, (prodTotal[q.kind]||0)-1);
            updateProdBadges();
          }
        }
      }

    // -------------------------
    // Power recompute + tech queue validation
    // -------------------------
    function recomputePower(){
        const calc=(team)=>{
          let prod=0,use=0;
          for (const b of buildings){
            if (!b.alive||b.team!==team||b.civ) continue;
            if (b.kind==="hq") prod+=POWER.hqProd;
            if (b.kind==="power") prod+=POWER.powerPlant;
            if (b.kind==="refinery") use+=POWER.refineryUse;
            if (b.kind==="barracks") use+=POWER.barracksUse;
            if (b.kind==="factory") use+=POWER.factoryUse;
            if (b.kind==="radar") use+=POWER.radarUse;
            if (b.kind==="turret") use+=POWER.turretUse;
          }
          return {prod,use};
        };
        const p=calc(TEAM.PLAYER); state.player.powerProd=p.prod; state.player.powerUse=p.use;
        const e=calc(TEAM.ENEMY);  state.enemy.powerProd=e.prod;  state.enemy.powerUse=e.use;
        validateTechQueues();
      }

    function validateTechQueues(){
        // If tech prerequisites are lost, remove invalid reservations/queues so they don't soft-lock construction.
        function hasP(team, kind){
          return buildings.some(b=>b.alive && !b.civ && b.team===team && b.kind===kind);
        }
        const tech = {
          buildPrereq: { power:["hq"], refinery:["hq","power"], barracks:["hq","refinery"], factory:["hq","barracks"], radar:["hq","factory"], turret:["hq","barracks"] },
          unitPrereq: { infantry:["barracks"], engineer:["barracks"], sniper:["barracks","radar"], tank:["factory"], ifv:["factory"], harvester:["factory"] }
        };
        function prereqOk(team, kind, map){
          const req = map[kind];
          if (!req || !req.length) return true;
          for (const k of req) if (!hasP(team, k)) return false;
          return true;
        }
        // Building lanes (player only)
        for (const laneKey of ["main","def"]){
          const lane = state.buildLane[laneKey];
          if (!lane) continue;
          if (lane.queue && !prereqOk(TEAM.PLAYER, lane.queue.kind, tech.buildPrereq)){
            // refund what was already paid
            state.player.money += Math.floor(lane.queue.paid||0);
            lane.queue = null;
          }
          if (lane.fifo && lane.fifo.length){
            lane.fifo = lane.fifo.filter(k=>prereqOk(TEAM.PLAYER, k, tech.buildPrereq));
          }
        }
        // Unit production FIFO (player only)
        if (prodFIFO && prodFIFO.barracks){
          prodFIFO.barracks = prodFIFO.barracks.filter(req=>prereqOk(TEAM.PLAYER, req.kind, tech.unitPrereq));
        }
        if (prodFIFO && prodFIFO.factory){
          prodFIFO.factory = prodFIFO.factory.filter(req=>prereqOk(TEAM.PLAYER, req.kind, tech.unitPrereq));
        }
      }

    return {
      // shared data (by reference)
      prodFIFO, prodTotal, QCAP,

      // build lanes
      getBaseBuildTime,
      tickBuildLanes,

      // unit queues
      kindToProducer,
      queueUnit,
      ensurePrimaryProducer,
      findProducer,
      normalizeProducerQueues,
      feedProducers,
      tickProduction,

      // power + tech
      getPowerFactor,
      isUnderPower,
      recomputePower,
      validateTechQueues
    };
  }

  global.OUEconomy = { create };
})(window);
