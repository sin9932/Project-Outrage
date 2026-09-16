/* Continuous tank simulation. World x/y plane, radians clockwise from +x.
 * No renderer dependency: movement and weapon timing work without WebGL.
 */
(function (g) {
  'use strict';
  const TAU = Math.PI * 2;
  const C = g.OUTankConfig;
  const SCALE = C.scale;
  const HEIGHT_TO_SCREEN = C.heightToScreen;
  const wrap = a => ((a + Math.PI) % TAU + TAU) % TAU - Math.PI;
  function fromDir(dir = 6) {
    const a = -dir * Math.PI / 4;
    const sx = Math.cos(a), sy = Math.sin(a);
    return Math.atan2(-sx + 2 * sy, sx + 2 * sy);
  }
  function readPose(u) {
    return {
      bodyYaw:Number.isFinite(u.bodyYaw) ? u.bodyYaw : fromDir(u.bodyDir ?? u.dir ?? 6),
      turretYaw:Number.isFinite(u.turretYaw) ? u.turretYaw : fromDir(u.turretDir ?? u.dir ?? 6)
    };
  }
  function ensure(u) { Object.assign(u, readPose(u)); }
  function toward(current, target, speed, dt) {
    const d = wrap(target - current), limit = speed * Math.max(0, dt);
    return wrap(current + Math.max(-limit, Math.min(limit, d)));
  }
  function hull(u, dx, dy, dt, dir8) {
    ensure(u);
    const target = Math.atan2(dy, dx);
    u.bodyYaw = toward(u.bodyYaw, target, C.hullTurnRate, dt);
    u.bodyDir = u.dir = dir8(Math.cos(u.bodyYaw), Math.sin(u.bodyYaw));
    u.bodyTurn = null;
    return Math.abs(wrap(target - u.bodyYaw)) < C.hullTolerance;
  }
  function turret(u, target, dt, dir8) {
    ensure(u);
    u.turretYaw = toward(u.turretYaw, target, C.turretTurnRate, dt);
    u.turretAimError = Math.abs(wrap(target - u.turretYaw));
    u.turretDir = dir8(Math.cos(u.turretYaw), Math.sin(u.turretYaw));
    u.turretTurn = null;
  }
  // Travel has one owner for both ordinary paths and group flow fields.
  // First point the turret down the route, then turn the hull, then translate.
  function drive(u, dx, dy, dt, dir8) {
    const target=Math.atan2(dy,dx);
    turret(u,target,dt,dir8);
    u.travelYaw=target;
    if (!ready(u)) { u.travelPhase='turret'; return false; }
    if (!hull(u,dx,dy,dt,dir8)) { u.travelPhase='hull'; return false; }
    u.bodyYaw=target; u.turretYaw=target;
    u.bodyDir=u.dir=u.turretDir=dir8(dx,dy);
    u.travelPhase='drive';
    return true;
  }
  function ready(u) { return Number.isFinite(u.turretAimError) && u.turretAimError < C.aimTolerance; }
  function recoil(u, t) {
    if (!Number.isFinite(u.lastShotAt)) return 0;
    const age = t - u.lastShotAt;
    if (age < 0 || age > C.recoilDuration) return 0;
    return age < C.recoilPeakTime ? C.recoilDistance * age / C.recoilPeakTime : C.recoilDistance * Math.exp(-(age - C.recoilPeakTime) * C.recoilDecay);
  }
  // Matches the exported model: turret origin z=.28, muzzle offset z=3.672,
  // muzzle height y=2.23. Physics keeps real ground coordinates and height.
  function muzzle(u, t) {
    const {bodyYaw,turretYaw} = readPose(u);
    const gun = (C.muzzleForward - recoil(u, t)) * SCALE;
    return {
      x: u.x + C.turretForward * SCALE * Math.cos(bodyYaw) + gun * Math.cos(turretYaw),
      y: u.y + C.turretForward * SCALE * Math.sin(bodyYaw) + gun * Math.sin(turretYaw),
      z: C.muzzleHeight * SCALE
    };
  }
  g.OUTankMotion = { SCALE, HEIGHT_TO_SCREEN, wrap, fromDir, readPose, ensure, toward, hull, turret, drive, ready, recoil, muzzle };
})(globalThis);
