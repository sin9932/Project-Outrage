// ou_input.js
// Refactor Stage 2: safe extraction of keyboard event wiring (listeners only).
// This file intentionally does NOT contain game logic; it just binds callbacks.

(function (global) {
  "use strict";

  const OUInput = global.OUInput || (global.OUInput = {});
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
})(window);
