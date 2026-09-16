/* Authoritative light-tank asset/kinematics contract. Model units are meters.
 * Update this contract with model changes; GLB anchors are checked at load.
 */
(function(g){
  'use strict';
  g.OUTankConfig=Object.freeze({
    modelUrl:'../asset/model/lite_tank/light_tank.glb',
    scale:20, heightToScreen:Math.sqrt(3/8), renderSpan:14,
    hullTurnRate:3.2, turretTurnRate:4.8, hullTolerance:.08, aimTolerance:.035,
    wheelRadius:.427, turretForward:.28, muzzleForward:3.672, muzzleHeight:2.23,
    recoilDistance:.23, recoilPeakTime:.055, recoilDuration:.40, recoilDecay:17
  });
})(globalThis);
