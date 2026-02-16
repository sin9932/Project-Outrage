// systems/minimap_noise.js
// Low-power minimap noise overlay, extracted from game.js.
// No external dependencies besides a minimap 2D context passed at init time.

(function(){
  const PO = (window.PO = window.PO || {});
  PO.minimapNoise = {
    create(mmCtx){
      const mmNoise = document.createElement("canvas");
      const s = 96; // internal buffer resolution (scaled up)
      mmNoise.width = s;
      mmNoise.height = s;

      // willReadFrequently hints some browsers to optimize ImageData operations
      const mmNoiseCtx = mmNoise.getContext("2d", { willReadFrequently: true });

      // Reuse ImageData to avoid getImageData() cost
      let img = mmNoiseCtx.createImageData(s, s);
      let lastRefresh = 0;

      function refreshNoise(){
        const d = img.data;
        for (let i = 0; i < d.length; i += 4){
          const v = (Math.random() * 255) | 0;
          d[i] = v; d[i+1] = v; d[i+2] = v; d[i+3] = 255;
        }
        mmNoiseCtx.putImageData(img, 0, 0);
      }

      return {
        draw(W, H){
          // refresh ~12.5 fps, plenty for noisy effect
          const now = performance.now();
          if (now - lastRefresh > 80){
            lastRefresh = now;
            refreshNoise();
          }

          mmCtx.save();
          mmCtx.imageSmoothingEnabled = false;
          mmCtx.globalAlpha = 0.95;
          mmCtx.drawImage(mmNoise, 0, 0, W, H);
          mmCtx.globalAlpha = 1;

          // darken + label
          mmCtx.fillStyle = "rgba(0,0,0,0.35)";
          mmCtx.fillRect(0,0,W,H);
          mmCtx.fillStyle = "rgba(255,210,110,0.9)";
          mmCtx.font = "bold 12px system-ui";
          mmCtx.fillText("LOW POWER", 10, 20);
          mmCtx.restore();
        }
      };
    }
  };
})();
