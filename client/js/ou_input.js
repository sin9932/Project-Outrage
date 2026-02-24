// ou_input.js
// Refactor Stage 2: safe extraction of keyboard event wiring (listeners only).
// This file intentionally does NOT contain game logic; it just binds callbacks.

(function (global) {
  "use strict";

  const OUInput = global.OUInput || (global.OUInput = {});

  // Input state delegated from game.js state.drag / state.pan / state.hover
  OUInput.drag = { on: false, moved: false, x0: 0, y0: 0, x1: 0, y1: 0 };
  OUInput.pan = { on: false, x0: 0, y0: 0, camIsoX: 0, camIsoY: 0 };
  OUInput.hover = { px: 0, py: 0, wx: 0, wy: 0, entId: null, t0: 0 };

  /** Bounding rect from drag state (screen px). */
  OUInput.getRectFromDrag = function getRectFromDrag() {
    const d = OUInput.drag;
    return {
      x0: Math.min(d.x0, d.x1),
      y0: Math.min(d.y0, d.y1),
      x1: Math.max(d.x0, d.x1),
      y1: Math.max(d.y0, d.y1)
    };
  };

  let installedKeyboard = false;

  /**
   * installKeyboard({ onKeyDown, onKeyUp })
   * - Prevents double-install.
   * - Stores callbacks for optional uninstall.
   */
  OUInput.installKeyboard = function installKeyboard(opts) {
    opts = opts || {};
    const onKeyDown = opts.onKeyDown;
    const onKeyUp = opts.onKeyUp;

    if (installedKeyboard) return;
    installedKeyboard = true;

    // Keep references so we can uninstall in dev if needed.
    OUInput._kbdDown = function (e) { if (typeof onKeyDown === "function") onKeyDown(e); };
    OUInput._kbdUp = function (e) { if (typeof onKeyUp === "function") onKeyUp(e); };

    global.addEventListener("keydown", OUInput._kbdDown);
    global.addEventListener("keyup", OUInput._kbdUp);
  };

  OUInput.uninstallKeyboard = function uninstallKeyboard() {
    if (!installedKeyboard) return;
    installedKeyboard = false;
    if (OUInput._kbdDown) global.removeEventListener("keydown", OUInput._kbdDown);
    if (OUInput._kbdUp) global.removeEventListener("keyup", OUInput._kbdUp);
    OUInput._kbdDown = null;
    OUInput._kbdUp = null;
  };


  // --- Mouse wiring (Stage 3) ---
  let installedMouse = false;
  let mouseCanvas = null;

  /**
   * installMouse({
   *   canvas,
   *   onContextMenu, onMouseDown, onMouseMove, onMouseUp, onWheel,
   *   wheelOptions   // e.g. { passive:false }
   * })
   * - Listener wiring only. Game logic remains in game.js handlers.
   */
  OUInput.installMouse = function installMouse(opts) {
    if (installedMouse) return;
    opts = opts || {};
    const canvas = opts.canvas;
    if (!canvas) return;

    installedMouse = true;
    mouseCanvas = canvas;

    OUInput._ctxMenu = function (e) { if (opts.onContextMenu) opts.onContextMenu(e); else e.preventDefault(); };
    OUInput._mouseDown = function (e) { if (opts.onMouseDown) opts.onMouseDown(e); };
    OUInput._mouseMove = function (e) { if (opts.onMouseMove) opts.onMouseMove(e); };
    OUInput._mouseUp = function (e) { if (opts.onMouseUp) opts.onMouseUp(e); };
    OUInput._wheel = function (e) { if (opts.onWheel) opts.onWheel(e); };

    canvas.addEventListener("contextmenu", OUInput._ctxMenu);
    canvas.addEventListener("mousedown", OUInput._mouseDown);
    canvas.addEventListener("mousemove", OUInput._mouseMove);
    canvas.addEventListener("mouseup", OUInput._mouseUp);

    const wheelOpts = opts.wheelOptions || { passive:false };
    canvas.addEventListener("wheel", OUInput._wheel, wheelOpts);
  };

  OUInput.uninstallMouse = function uninstallMouse() {
    if (!installedMouse) return;
    installedMouse = false;
    const canvas = mouseCanvas;
    mouseCanvas = null;
    if (!canvas) return;

    if (OUInput._ctxMenu) canvas.removeEventListener("contextmenu", OUInput._ctxMenu);
    if (OUInput._mouseDown) canvas.removeEventListener("mousedown", OUInput._mouseDown);
    if (OUInput._mouseMove) canvas.removeEventListener("mousemove", OUInput._mouseMove);
    if (OUInput._mouseUp) canvas.removeEventListener("mouseup", OUInput._mouseUp);
    if (OUInput._wheel) canvas.removeEventListener("wheel", OUInput._wheel);

    OUInput._ctxMenu = null;
    OUInput._mouseDown = null;
    OUInput._mouseMove = null;
    OUInput._mouseUp = null;
    OUInput._wheel = null;
  };

  // Command throttle: prevent tap-dance jitter when spam-clicking same command
  OUInput.createCmdThrottle = function createCmdThrottle(opts) {
    const state = (opts && opts.state) || {};
    const getTime = () => (state.t || 0);
    return {
      shouldIgnoreCmd(e, type, x, y, targetId = null) {
        const now = getTime();
        const lastT = (e && e.lastCmdT) ?? -999;
        if ((now - lastT) > 0.22) return false;
        const lastType = (e && e.lastCmdType) || "";
        if (lastType !== type) return false;
        if (targetId != null) {
          if ((e.lastCmdTarget ?? null) !== targetId) return false;
          return true;
        }
        const lx = (e && e.lastCmdX) ?? 1e9;
        const ly = (e && e.lastCmdY) ?? 1e9;
        const dx = x - lx, dy = y - ly;
        return dx * dx + dy * dy <= 22 * 22;
      },
      stampCmd(e, type, x, y, targetId = null) {
        if (!e) return;
        e.lastCmdT = getTime();
        e.lastCmdType = type;
        e.lastCmdX = x;
        e.lastCmdY = y;
        e.lastCmdTarget = targetId;
      }
    };
  };

})(window);
