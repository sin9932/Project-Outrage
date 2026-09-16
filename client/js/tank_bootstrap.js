// Deferred after tank_config and tank_motion; game startup awaits this promise.
window.OUTank3DReady = import('./tank3d.js?v=8').then(m => m.ready).catch(error => {
  console.error('[tank3d] bootstrap failed', error);
  return false;
});
