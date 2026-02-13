export const CONFIG = Object.freeze({
  sim: {
    tickRate: 60,
    maxDt: 0.05,
  },
  render: {
    scale: 1.0,
    bg: "#0b0f14",
    grid: true,
  },
  world: {
    tileSize: 48,
    mapW: 60,
    mapH: 40,
  },
  economy: {
    startMoneyDefault: 10000,
  }
});

// Compatibility constants for legacy systems (bullet_system.js etc.)
export const TEAM = Object.freeze({ PLAYER: 0, ENEMY: 1 });

// Building kind registry used by legacy BulletSystem to decide "player attacked" alerts.
export const BUILD = Object.freeze({
  hq: true,
  power: true,
  refinery: true,
  barracks: true,
  factory: true,
  radar: true,
  turret: true,
  wall: true,
  // add more as you introduce them
});
