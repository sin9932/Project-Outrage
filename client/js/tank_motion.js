/* Continuous tank simulation. World x/y plane, radians clockwise from +x.
 * No renderer dependency: movement and weapon timing work without WebGL.
 */
(function (g) {
  'use strict';
  const TAU = Math.PI * 2;
  const SCALE = 20;
  const HEIGHT_TO_SCREEN = Math.sqrt(3 / 8);
  const wrap = a => ((a + Math.PI) % TAU + TAU) % TAU - Math.PI;
  function fromDir(dir = 6) {
    const a = -dir * Math.PI / 4;
    const sx = Math.cos(a), sy = Math.sin(a);
    return Math.atan2(-sx + 2 * sy, sx + 2 * sy);
  }
  function ensure(u) {
    if (!Number.isFinite(u.bodyYaw)) u.bodyYaw = fromDir(u.bodyDir ?? u.dir ?? 6);
    if (!Number.isFinite(u.turretYaw)) u.turretYaw = fromDir(u.turretDir ?? u.dir ?? 6);
  }
  function toward(current, target, speed, dt) {
    const d = wrap(target - current), limit = speed * Math.max(0, dt);
    return wrap(current + Math.max(-limit, Math.min(limit, d)));
  }
  function hull(u, dx, dy, dt, dir8) {
    ensure(u);
    const target = Math.atan2(dy, dx);
    u.bodyYaw = toward(u.bodyYaw, target, 3.2, dt);
    u.bodyDir = u.dir = dir8(Math.cos(u.bodyYaw), Math.sin(u.bodyYaw));
    u.bodyTurn = null;
    return Math.abs(wrap(target - u.bodyYaw)) < .08;
  }
  function turret(u, target, dt, dir8) {
    ensure(u);
    u.turretYaw = toward(u.turretYaw, target, 4.8, dt);
    u.turretAimError = Math.abs(wrap(target - u.turretYaw));
    u.turretDir = dir8(Math.cos(u.turretYaw), Math.sin(u.turretYaw));
    u.turretTurn = null;
  }
  function ready(u) { return Number.isFinite(u.turretAimError) && u.turretAimError < .035; }
  function recoil(u, t) {
    if (!Number.isFinite(u.lastShotAt)) return 0;
    const age = t - u.lastShotAt;
    if (age < 0 || age > .40) return 0;
    return age < .055 ? .23 * age / .055 : .23 * Math.exp(-(age - .055) * 17);
  }
  // Matches the exported model: turret origin z=.28, muzzle offset z=3.672,
  // muzzle height y=2.23. Physics keeps real ground coordinates and height.
  function muzzle(u, t) {
    ensure(u);
    const gun = (3.672 - recoil(u, t)) * SCALE;
    return {
      x: u.x + .28 * SCALE * Math.cos(u.bodyYaw) + gun * Math.cos(u.turretYaw),
      y: u.y + .28 * SCALE * Math.sin(u.bodyYaw) + gun * Math.sin(u.turretYaw),
      z: 2.23 * SCALE
    };
  }
  g.OUTankMotion = { SCALE, HEIGHT_TO_SCREEN, wrap, fromDir, ensure, toward, hull, turret, ready, recoil, muzzle };
})(globalThis);
