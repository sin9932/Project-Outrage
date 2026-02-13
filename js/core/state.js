export function createInitialState(CONFIG){
  return {
    running: false,

    // global settings configured in pregame
    settings: {
      spawn: "left",
      startMoney: CONFIG.economy.startMoneyDefault,
      fogOff: false,
      fastProd: false,
    },

    players: {
      self: { id: "p1", color: "#7fd1ff", money: CONFIG.economy.startMoneyDefault },
      enemy: { id: "ai", color: "#ff7f7f", money: CONFIG.economy.startMoneyDefault },
    },

    world: {
      tileSize: CONFIG.world.tileSize,
      w: CONFIG.world.mapW,
      h: CONFIG.world.mapH,
      // You will replace this with your actual map/ore/buildings later
      tiles: null,
    },

    entities: {
      units: new Map(),       // id -> unit
      buildings: new Map(),   // id -> building
      nextId: 1,
      deadQueue: [],
    },

    bullets: {
      list: [],
    },

    fog: {
      visible: null, // set later
    },

    ui: {
      paused: false,
      selected: new Set(),
      toast: { text: "", until: 0 },
    },

    view: {
      canvas: null,
      ctx: null,
      w: 0,
      h: 0,
      camera: { x: 0, y: 0 },
      bright: 1.0,
    },

    bus: null,
  };
}
