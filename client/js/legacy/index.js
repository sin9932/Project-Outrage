// js/legacy/index.js
// Loads legacy global-scope modules (TexturePacker loader, units/buildings registries, bullet system, FX).
// These scripts register globals on window: PO, G, BulletSystem, FX.
import "./atlas_tp.js";
import "./units.js";
import "./buildings.js";
import "./bullet_system.js";

// FX pack (optional but included)
import "./fx/fx_core.js";
import "./fx/fx_smoke.js";
import "./fx/fx_explosions.js";
import "./fx/fx_blood.js";
import "./fx/fx_combat.js";
import "./fx/fx_all.js";
