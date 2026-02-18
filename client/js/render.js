// render.js
// Minimap renderer split from game.js (Step 1)
(function(){
  "use strict";

  function _parseTPTexturesAtlas(json){
    if (!json) return null;
    const out = new Map();
    let image = null;
    // TexturePacker "multi" format uses textures[0].frames (array)
    if (json.textures && json.textures.length){
      const tex = json.textures[0];
      image = tex.image || null;
      const framesArr = tex.frames || [];
      for (const fr of framesArr){
        if (!fr || !fr.filename) continue;
        const frame = fr.frame || fr;
        const sss = fr.spriteSourceSize || { x:0, y:0, w: frame.w, h: frame.h };
        const src = fr.sourceSize || { w: frame.w, h: frame.h };
        out.set(fr.filename, {
          frame: { x:frame.x|0, y:frame.y|0, w:frame.w|0, h:frame.h|0 },
          spriteSourceSize: { x:sss.x|0, y:sss.y|0, w:sss.w|0, h:sss.h|0 },
          sourceSize: { w:src.w|0, h:src.h|0 }
        });
      }
      return { image, frames: out };
    }
    const frames = json.frames || json;
    for (const [name, fr] of Object.entries(frames)){
      if (!fr) continue;
      const frame = fr.frame || fr;
      const sss = fr.spriteSourceSize || { x:0, y:0, w: frame.w, h: frame.h };
      const src = fr.sourceSize || { w: frame.w, h: frame.h };
      out.set(name, {
        frame: { x:frame.x|0, y:frame.y|0, w:frame.w|0, h:frame.h|0 },
        spriteSourceSize: { x:sss.x|0, y:sss.y|0, w:sss.w|0, h:sss.h|0 },
        sourceSize: { w:src.w|0, h:src.h|0 }
      });
    }
    return { image: (json.meta && json.meta.image) || null, frames: out };
  }

  async function _loadTPAtlasFromUrl(jsonUrl, baseDir){
    const r = await fetch(jsonUrl, { cache:"no-store" });
    if (!r.ok) throw new Error("HTTP "+r.status);
    const j = await r.json();
    const parsed = _parseTPTexturesAtlas(j);
    if (!parsed || !parsed.frames || !parsed.frames.size) throw new Error("atlas parse failed");
    const imgName = parsed.image || null;
    if (!imgName) throw new Error("atlas image missing");
    const img = new Image();
    img.src = (baseDir || "") + imgName;
    return { img, frames: parsed.frames, image: imgName };
  }

  // TV noise for minimap when low power (kept inside render.js)
  function drawMiniNoise(mmCtx, W, H){
    if (!mmCtx) return;
    const s = 96; // small buffer, scaled up
    if (!drawMiniNoise._canvas){
      drawMiniNoise._canvas = document.createElement("canvas");
      drawMiniNoise._ctx = drawMiniNoise._canvas.getContext("2d", { willReadFrequently: true });
    }
    const c = drawMiniNoise._canvas;
    const cctx = drawMiniNoise._ctx;
    if (c.width!==s || c.height!==s){ c.width=s; c.height=s; }

    if (!drawMiniNoise._img || drawMiniNoise._img.width !== s){
      drawMiniNoise._img = cctx.createImageData(s,s);
    }
    const d = drawMiniNoise._img.data;
    for (let i=0; i<d.length; i+=4){
      const v = (Math.random()*255)|0;
      d[i]=v; d[i+1]=v; d[i+2]=v; d[i+3]=255;
    }
    cctx.putImageData(drawMiniNoise._img,0,0);

    mmCtx.save();
    mmCtx.imageSmoothingEnabled = false;
    mmCtx.globalAlpha = 0.95;
    mmCtx.drawImage(c, 0,0, W,H);
    mmCtx.globalAlpha = 1;
    mmCtx.fillStyle="rgba(0,0,0,0.35)";
    mmCtx.fillRect(0,0,W,H);
    mmCtx.fillStyle="rgba(255,210,110,0.9)";
    mmCtx.font="bold 12px system-ui";
    mmCtx.fillText("LOW POWER", 10, 20);
    mmCtx.restore();
  }

  function drawMini(env){
    if (!env) return;
    const {
      fitMini, mmCanvas, mmCtx, TEAM, WORLD_W, WORLD_H, MAP_W, MAP_H, TILE,
      explored, visible, ore, units, buildings, state,
      idx, inMap, tileOfX, tileOfY, hasRadarAlive, isUnderPower
    } = env;

    if (typeof fitMini === "function") fitMini();
    if (!mmCanvas || !mmCtx) return;

    const W=mmCanvas.width, H=mmCanvas.height;
    mmCtx.clearRect(0,0,W,H);

    const radar = hasRadarAlive && hasRadarAlive(TEAM.PLAYER);
    const radarOff = !radar;
    if (radarOff){
      mmCtx.fillStyle="rgba(0,0,0,0.55)";
      mmCtx.fillRect(0,0,W,H);
      mmCtx.fillStyle="rgba(255,210,110,0.8)";
      mmCtx.font="bold 12px system-ui";
      mmCtx.fillText("RADAR REQUIRED", 10, 20);
      return;
    }

    const lowPower = isUnderPower && isUnderPower(TEAM.PLAYER);
    if (lowPower){
      drawMiniNoise(mmCtx, W, H);
      return;
    }

    const sx=W/WORLD_W, sy=H/WORLD_H;

    mmCtx.fillStyle="rgba(0,0,0,0.35)";
    mmCtx.fillRect(0,0,W,H);

    mmCtx.fillStyle="rgba(0,0,0,0.55)";
    for (let ty=0; ty<MAP_H; ty+=2){
      for (let tx=0; tx<MAP_W; tx+=2){
        if (!explored[TEAM.PLAYER][idx(tx,ty)]) {
          mmCtx.fillRect(tx*TILE*sx, ty*TILE*sy, 2*TILE*sx, 2*TILE*sy);
        }
      }
    }

    // Ore dots on minimap (only where explored)
    mmCtx.fillStyle = "rgba(255,170,40,0.95)";
    for (let ty=0; ty<MAP_H; ty+=2){
      for (let tx=0; tx<MAP_W; tx+=2){
        const ii = idx(tx,ty);
        if (!explored[TEAM.PLAYER][ii]) continue;
        if (ore[ii] > 0){
          mmCtx.fillRect((tx*TILE+TILE*0.5)*sx-1, (ty*TILE+TILE*0.5)*sy-1, 2, 2);
        }
      }
    }

    for (const u of units){
      if (!u.alive) continue;
      const tx=tileOfX(u.x), ty=tileOfY(u.y);
      if (u.team===TEAM.ENEMY){
        if (radarOff) continue;
        if (inMap(tx,ty) && !explored[TEAM.PLAYER][idx(tx,ty)]) continue;
      }
      mmCtx.fillStyle = (u.team===TEAM.PLAYER) ? state.colors.player : state.colors.enemy;
      mmCtx.fillRect(u.x*sx-1, u.y*sy-1, 2, 2);
    }

    for (const b of buildings){
      if (!b.alive || b.civ) continue;
      if (b.team===TEAM.ENEMY){ if (radarOff) continue; if (!explored[TEAM.PLAYER][idx(b.tx,b.ty)]) continue; }
      mmCtx.fillStyle = (b.team===TEAM.PLAYER) ? state.colors.player : state.colors.enemy;
      mmCtx.fillRect(b.x*sx-2, b.y*sy-2, 4, 4);
    }

    // Blinking purple dot on minimap for recently hit player assets (4s)
    if (state.attackEvents && state.attackEvents.length){
      const now = state.t;
      const blinkA = 0.35 + 0.65*(0.5+0.5*Math.sin(now*10.0));
      for (let i=0;i<state.attackEvents.length;i++){
        const ev = state.attackEvents[i];
        if (!ev || now > (ev.until||-1e9)) continue;
        const px = ev.x * sx;
        const py = ev.y * sy;
        mmCtx.fillStyle = `rgba(200,0,255,${blinkA})`;
        mmCtx.beginPath();
        mmCtx.arc(px, py, 4.2, 0, Math.PI*2);
        mmCtx.fill();
        mmCtx.strokeStyle = `rgba(200,0,255,${0.25*blinkA})`;
        mmCtx.lineWidth = 2;
        mmCtx.beginPath();
        mmCtx.arc(px, py, 7.5, 0, Math.PI*2);
        mmCtx.stroke();
      }
    }

    // Attack alert triangle FX (player assets hit)
    if (state.alertFx && state.alertFx.length){
      const now = state.t;
      const dur = 1.5;
      for (let i=state.alertFx.length-1;i>=0;i--){
        const fx = state.alertFx[i];
        const age = now - fx.t0;
        if (age > dur){ state.alertFx.splice(i,1); continue; }
        const p = 1 - (age/dur);
        const cx = fx.x * sx;
        const cy = fx.y * sy;

        const base = 34;
        const scale = 0.22 + 2.45*p;
        const rot = age * 1.35;

        const perimPt = (f)=>{
          f = (f%1+1)%1;
          const L = base*2;
          const P = L*4;
          let d = f*P;
          if (d < L) return {x:-base + d, y:-base};
          d -= L;
          if (d < L) return {x:base, y:-base + d};
          d -= L;
          if (d < L) return {x:base - d, y:base};
          d -= L;
          return {x:-base, y:base - d};
        };

        mmCtx.save();
        mmCtx.translate(cx, cy);
        mmCtx.rotate(rot);
        mmCtx.scale(scale, scale);

        const a = (0.25 + 0.75*p);
        mmCtx.strokeStyle = `rgba(200,0,255,${a})`;
        mmCtx.lineWidth = 4.6;
        mmCtx.beginPath();
        mmCtx.rect(-base, -base, base*2, base*2);
        mmCtx.stroke();

        const spd = 0.95;
        const f1 = (age*spd) % 1;
        const f2 = (1 - ((age*spd + 0.37) % 1));
        const dotR = 4.2;

        const drawDotTrail = (f, dir)=>{
          for (let k=7;k>=0;k--){
            const ff = f - dir*(k*0.018);
            const pt = perimPt(ff);
            const aa = (0.06 + 0.14*p) * (k/8);
            mmCtx.fillStyle = `rgba(255,255,255,${aa})`;
            mmCtx.beginPath();
            mmCtx.arc(pt.x, pt.y, dotR*(0.55 + 0.45*(k/8)), 0, Math.PI*2);
            mmCtx.fill();
          }
          const pt = perimPt(f);
          mmCtx.fillStyle = `rgba(255,255,255,${0.78 + 0.18*p})`;
          mmCtx.beginPath();
          mmCtx.arc(pt.x, pt.y, dotR, 0, Math.PI*2);
          mmCtx.fill();
        };

        drawDotTrail(f1, +1);
        drawDotTrail(f2, -1);

        mmCtx.restore();
      }
    }

  }

  let canvas, ctx, cam, state, TEAM, MAP_W, MAP_H, TILE, ISO_X, ISO_Y;
  let terrain, ore, explored, visible, BUILD, DEFENSE, BUILD_SPRITE, NAME_KO, POWER;
  let worldToScreen, tileToWorldCenter, idx, inMap, clamp, getEntityById;
  let REPAIR_WRENCH_IMG, repairWrenches;
  let exp1Fxs;
  let smokeWaves, smokePuffs, dustPuffs, dmgSmokePuffs, bloodStains, bloodPuffs;
  let explosions;
  let drawBuildingSprite;
  let getTeamCroppedSprite;
  let INF_DIE_IMG, SNIP_DIE_IMG;
  let infDeathFxs, snipDeathFxs;
  let INF_SPRITE_SCALE;
  let INF_IMG, INF_ATK_IMG;
  let INF_MOV_IMG, INF_MOV_NE_IMG, INF_MOV_N_IMG, INF_MOV_NW_IMG, INF_MOV_W_IMG, INF_MOV_SW_IMG, INF_MOV_S_IMG, INF_MOV_SE_IMG;
  let SNIP_IMG;
  let SNIP_MOV_IMG, SNIP_MOV_NE_IMG, SNIP_MOV_N_IMG, SNIP_MOV_NW_IMG, SNIP_MOV_W_IMG, SNIP_MOV_SW_IMG, SNIP_MOV_S_IMG, SNIP_MOV_SE_IMG;
  let INF_IDLE_ATLAS;
  const ASSET_REF = (typeof window !== "undefined" && window.ASSET) ? window.ASSET : null;

  // === Construction Yard (HQ) sprite (5x5 footprint) ===
  let CON_YARD_PNG = (ASSET_REF && ASSET_REF.sprite && ASSET_REF.sprite.const && ASSET_REF.sprite.const.normal)
    ? ASSET_REF.sprite.const.normal.con_yard
    : "";
  const CON_YARD_IMG = new Image();
  if (CON_YARD_PNG) CON_YARD_IMG.src = CON_YARD_PNG;

  // === Sprite tuning knobs (YOU edit these) ===
  // pivotNudge is in SOURCE pixels (bbox-space, before scaling).
  // offsetNudge is in SCREEN pixels (after scaling, before zoom).
  // anchor: "center" to stick the sprite to the 5x5 footprint center (what you asked).
  const SPRITE_TUNE = {
    hq: {
      anchor: "center",
      scaleMul: 1.20,
      pivotNudge: { x: 0, y: 0 },
      offsetNudge:{ x: 94, y: -26 }
    }
  };

  // expose to module-backed building sprites
  try{ window.PO = window.PO || {}; window.PO.SPRITE_TUNE = SPRITE_TUNE; }catch(_e){}

  function _tuneObj(kind){
    if (!SPRITE_TUNE[kind]) SPRITE_TUNE[kind] = { anchor:"center", scaleMul:1.0, pivotNudge:{x:0,y:0}, offsetNudge:{x:0,y:0} };
    const t = SPRITE_TUNE[kind];
    if (!t.pivotNudge) t.pivotNudge = {x:0,y:0};
    if (!t.offsetNudge) t.offsetNudge = {x:0,y:0};
    if (t.scaleMul==null) t.scaleMul = 1.0;
    if (!t.anchor) t.anchor = "center";
    return t;
  }

  // apply HTML-provided preset (overrides persisted storage)
  ;(function(){
    try{
      const preset = (typeof window !== "undefined") ? window.SPRITE_TUNE_PRESET : null;
      if (!preset || typeof preset !== "object") return;
      for (const k in preset){
        if (!preset[k] || typeof preset[k] !== "object") continue;
        SPRITE_TUNE[k] = Object.assign(_tuneObj(k), preset[k]);
      }
    }catch(_e){}
  })();

  const BUILD_SPRITE_LOCAL = {
    hq: {
      img: CON_YARD_IMG,
      // We draw ONLY the non-transparent bbox (crop), so all numbers below are bbox-relative.
      // Measured from con_yard_n.png:
      //  bbox: x=256, y=130, w=1536, h=1251
      //  south-tip pivot (full image): x≈1016.5, y=1380
      //  pivot in bbox-space: x≈760.5, y=1250
      crop:  { x: 256, y: 130, w: 1536, h: 1251 },
      pivot: null, // pivot is controlled via SPRITE_TUNE (see below)
      teamColor: true // apply team palette to accent pixels
    }
  };

  // === Team palette swap (magenta -> team color) for infantry ===
  // Recolors magenta-ish pixels in the infantry sheet into the team's color.
  // Performance: builds one recolored cached sheet per team (draw-time stays fast).
  const INF_TEAM_SHEET_IDLE = new Map(); // teamId -> <canvas>
  const INF_TEAM_SHEET_ATK  = new Map(); // teamId -> <canvas>
  const INF_TEAM_SHEET_DIE  = new Map(); // teamId -> <canvas>
  const INF_TEAM_SHEET_MOV  = new Map(); // teamId -> <canvas>
  const INF_TEAM_SHEET_MOV_NE = new Map(); // teamId -> <canvas>
  const INF_TEAM_SHEET_MOV_N  = new Map(); // teamId -> <canvas>
  const INF_TEAM_SHEET_MOV_NW = new Map(); // teamId -> <canvas>
  const INF_TEAM_SHEET_MOV_W  = new Map(); // teamId -> <canvas>
  const INF_TEAM_SHEET_MOV_SW = new Map(); // teamId -> <canvas>
  const INF_TEAM_SHEET_MOV_S  = new Map(); // teamId -> <canvas>
  const INF_TEAM_SHEET_MOV_SE = new Map(); // teamId -> <canvas>

  // Sniper team palette caches
  const SNIP_TEAM_SHEET = new Map();
  const SNIP_TEAM_SHEET_MOV    = new Map();
  const SNIP_TEAM_SHEET_MOV_NE = new Map();
  const SNIP_TEAM_SHEET_MOV_N  = new Map();
  const SNIP_TEAM_SHEET_MOV_NW = new Map();
  const SNIP_TEAM_SHEET_MOV_W  = new Map();
  const SNIP_TEAM_SHEET_MOV_SW = new Map();
  const SNIP_TEAM_SHEET_MOV_S  = new Map();
  const SNIP_TEAM_SHEET_MOV_SE = new Map();
  const SNIP_DIE_TEAM_SHEET = new Map();

  function hexToRgb(hex){
    if (!hex) return null;
    const h = String(hex).trim();
    const m = /^#?([0-9a-f]{6})$/i.exec(h);
    if (!m) return null;
    const n = parseInt(m[1],16);
    return [(n>>16)&255, (n>>8)&255, n&255];
  }
  function isMagentaish(r,g,b){
    // More tolerant magenta detector (catches dark magenta shading too).
    // Idea: magenta has R and B both noticeably higher than G, and enough saturation.
    const maxv = (r>g ? (r>b?r:b) : (g>b?g:b));
    const minv = (r<g ? (r<b?r:b) : (g<b?g:b));
    const sat = maxv - minv; // simple saturation proxy
    if (maxv < 40) return false;      // too dark to care (noise)
    if (sat < 25) return false;       // too gray
    if (r < g + 18) return false;     // R not above G enough
    if (b < g + 18) return false;     // B not above G enough
    if (Math.abs(r - b) > 140) return false; // keep near-magenta (avoid pure red/blue)
    return true;
  }
  function buildInfTeamSheet(srcImg, cacheMap, teamId){
    if (!cacheMap) cacheMap = INF_TEAM_SHEET_IDLE;
    if (cacheMap.has(teamId)) return cacheMap.get(teamId);
    if (!srcImg || !srcImg.complete || !srcImg.naturalWidth) return srcImg;

    // Pick teamId color from existing UI colors if available.
    let col = "#ffffff";
    try{
      if (teamId===TEAM.PLAYER) col = state?.colors?.player || state?.player?.color || "#66aaff";
      else if (teamId===TEAM.ENEMY) col = state?.colors?.enemy || state?.enemy?.color || "#ff5555";
      else col = "#cccccc";
    }catch(_err){ col = "#ffffff"; }
    const rgb = hexToRgb(col) || [255,255,255];

    const c = document.createElement('canvas');
    c.width = srcImg.naturalWidth;
    c.height = srcImg.naturalHeight;
    const cctx = c.getContext('2d', { willReadFrequently:true });
    cctx.drawImage(srcImg, 0, 0);

    const imgd = cctx.getImageData(0,0,c.width,c.height);
    const d = imgd.data;
    for (let i=0;i<d.length;i+=4){
      const a = d[i+3];
      if (a===0) continue;
      const r=d[i], g=d[i+1], b=d[i+2];
      if (!isMagentaish(r,g,b)) continue;

      // Keep shading by mapping magenta brightness to team color brightness.
      const shade = Math.max(0, Math.min(1, (r + b) / 510));
      d[i  ] = (rgb[0] * shade) | 0;
      d[i+1] = (rgb[1] * shade) | 0;
      d[i+2] = (rgb[2] * shade) | 0;
    }
    cctx.putImageData(imgd,0,0);
    cacheMap.set(teamId, c);
    return c;
  }

  // === Large explosion FX (exp1) atlas (json + png) ===
  let EXP1_PNG  = (ASSET_REF && ASSET_REF.sprite && ASSET_REF.sprite.eff && ASSET_REF.sprite.eff.exp1)
    ? ASSET_REF.sprite.eff.exp1.png
    : "";
  let EXP1_JSON = (ASSET_REF && ASSET_REF.sprite && ASSET_REF.sprite.eff && ASSET_REF.sprite.eff.exp1)
    ? ASSET_REF.sprite.eff.exp1.json
    : "";
  const EXP1_IMG = new Image();
  if (EXP1_PNG) EXP1_IMG.src = EXP1_PNG;
  let _exp1Loading = false;

  // Parsed frames: [{x,y,w,h}]
  let EXP1_FRAMES = null;

  // EXP1 pivot tuning:
  // (fx.x, fx.y) is "바닥 정중앙" 기준. 아래 값으로 폭발 중심을 맞춘다.
  // pivot: 0..1 (0=left/top, 1=right/bottom)
  let EXP1_PIVOT_X = 0.50;
  let EXP1_PIVOT_Y = 0.52;
  // screen-pixel offset (scaled by zoom). negative = up
  let EXP1_Y_OFFSET = -8;
  // === Team palette (accent recolor) ===
  // You can override from HTML by defining:
  //   window.TEAM_ACCENT = { PLAYER:[r,g,b], ENEMY:[r,g,b], NEUTRAL:[r,g,b] };
  const TEAM_ACCENT = (typeof window !== "undefined" && window.TEAM_ACCENT) ? window.TEAM_ACCENT : {
    PLAYER: [80,  180, 255],  // default: BLUE (player)
    ENEMY:  [255, 60,  60],   // default: RED  (enemy)
    NEUTRAL:[170, 170, 170]
  };

  // Team-color brightness tuning (higher = brighter team stripes).
  const TEAM_ACCENT_LUMA_GAIN = 1.35; // try 1.15~1.60
  const TEAM_ACCENT_LUMA_BIAS = 0.10; // try 0.00~0.20
  const TEAM_ACCENT_LUMA_GAMMA = 0.80; // <1 brightens midtones; 1 = linear
  // Recolors only "neon magenta" accent pixels into team color.
  const _teamSpriteCache = new Map(); // key -> canvas

  function _teamAccentRGB(team){
    // Dev/test: mirror factions (enemy uses player's accent)
    if (typeof window !== "undefined" && window.LINK_ENEMY_TO_PLAYER_COLOR && team === (TEAM && TEAM.ENEMY)) return TEAM_ACCENT.PLAYER;
    if (TEAM && team === TEAM.ENEMY) return TEAM_ACCENT.ENEMY;
    if (TEAM && team === TEAM.NEUTRAL) return TEAM_ACCENT.NEUTRAL;
    return TEAM_ACCENT.PLAYER;
  }

  function _rgb2hsv(r,g,b){
    r/=255; g/=255; b/=255;
    const max=Math.max(r,g,b), min=Math.min(r,g,b);
    const d=max-min;
    let h=0;
    if(d!==0){
      if(max===r) h=((g-b)/d)%6;
      else if(max===g) h=(b-r)/d + 2;
      else h=(r-g)/d + 4;
      h*=60;
      if(h<0) h+=360;
    }
    const s=max===0?0:d/max;
    const v=max;
    return {h,s,v};
  }

  function _isAccentPixel(r,g,b,a){
    if(a < 8) return false;

    const max=Math.max(r,g,b), min=Math.min(r,g,b);
    const sat = max===0 ? 0 : (max-min)/max;

    // Strong magenta/pink key, including anti-aliased edges (pink mixed with grey).
    // Score is high when R+B dominates and G is suppressed.
    const rbAvg = (r + b) * 0.5;
    const magScore = (r + b) - 2*g; // e.g. #ff00ff => 510

    // Very likely key color (and its edge blends)
    if(rbAvg > 110 && magScore > 105 && g < rbAvg) return true;

    // Extra coverage for bright hot-pink highlights that may have a bit more green from filtering
    if(rbAvg > 165 && magScore > 65 && g < 170) return true;

    // Extra coverage for darker magenta stripes (some sheets have "dirty" magenta with more green)
    // Condition: R and B both present, G suppressed relative to them.
    if (r > 70 && b > 70 && (r + b) > 220 && g < (r * 0.72) && g < (b * 0.72)) return true;

    // If it's basically grey, don't treat as key color.
    if(sat < 0.10) return false;

    const {h}=_rgb2hsv(r,g,b);

    // Wider hue band for magenta/purple-ish key colors.
    const magentaBand = (h>=235 && h<=358);

    // Green must not be the dominant channel (allow more slack for filtered pixels)
    const gNotDominant = g <= Math.min(r,b) + 130;

    // Prevent weird false-positives from pure blues/reds by requiring some R+B presence
    const rbPresence = (r + b) >= 160;

    return magentaBand && gNotDominant && rbPresence;
  }

  function _applyTeamPaletteToImage(img, teamColor, opts={}){
    const excludeRects = opts.excludeRects || null; // [{x,y,w,h}] in image pixel coords
    const w=img.width, h=img.height;
    const c=document.createElement('canvas'); c.width=w; c.height=h;
    const ctx=c.getContext('2d', {willReadFrequently:true});
    ctx.drawImage(img,0,0);
    const id=ctx.getImageData(0,0,w,h);
    const d=id.data;

    // Team color (linear-ish blend)
    const tr=teamColor.r, tg=teamColor.g, tb=teamColor.b;

    // Brighten like unit tint: stronger gain + slight bias, softer gamma
    const GAIN = (opts.gain ?? 1.65);
    const BIAS = (opts.bias ?? 0.18);
    const GAMMA = (opts.gamma ?? 0.78);
    const MINV = (opts.minV ?? 0.42);

    function inExclude(x,y){
      if(!excludeRects) return false;
      for(const r of excludeRects){
        if(x>=r.x && x<r.x+r.w && y>=r.y && y<r.y+r.h) return true;
      }
      return false;
    }

    for(let y=0;y<h;y++){
      for(let x=0;x<w;x++){
        const i=(y*w+x)*4;
        const a=d[i+3];
        if(a<8) continue;
        if(inExclude(x,y)) continue;

        const r=d[i], g=d[i+1], b=d[i+2];
        if(!_isAccentPixel(r,g,b,a)) continue;

        // Preserve shading using luminance, but keep it bright enough
        const l=(0.2126*r + 0.7152*g + 0.0722*b)/255;
        // If pixel is strongly saturated magenta, force a brighter base so key-color doesn't look dirty
        const max=Math.max(r,g,b), min=Math.min(r,g,b);
        const sat = max===0 ? 0 : (max-min)/max;
        let l2 = (Math.pow(l, GAMMA) * GAIN) + BIAS;
        if(sat > 0.45) l2 = Math.max(l2, 0.65);
        l2 = Math.max(MINV, Math.min(1, l2));

        // Blend toward team color (keep some original detail)
        d[i]   = Math.min(255, Math.round(tr * l2));
        d[i+1] = Math.min(255, Math.round(tg * l2));
        d[i+2] = Math.min(255, Math.round(tb * l2));
      }
    }
    ctx.putImageData(id,0,0);

    const out=new Image();
    out.src=c.toDataURL();
    return out;
  }

  function _getTeamCroppedSprite(img, crop, team){
    const key = img.src + "|" + crop.x + "," + crop.y + "," + crop.w + "," + crop.h + "|t" + team;
    const cached = _teamSpriteCache.get(key);
    if (cached) return cached;

    const cvs = document.createElement("canvas");
    cvs.width = crop.w;
    cvs.height = crop.h;
    const c = cvs.getContext("2d", { willReadFrequently: true });
    try{
      c.clearRect(0, 0, crop.w, crop.h);
      c.drawImage(img, crop.x, crop.y, crop.w, crop.h, 0, 0, crop.w, crop.h);

      const id = c.getImageData(0, 0, crop.w, crop.h);
      const d = id.data;
      const tc = _teamAccentRGB(team);
      const tr = tc[0], tg = tc[1], tb = tc[2];

      for (let i = 0; i < d.length; i += 4){
        const r = d[i], g = d[i+1], b = d[i+2], a = d[i+3];

        if (!_isAccentPixel(r, g, b, a)) continue;

        // brightness keeps shading; luma is stable for highlights
        const l = (0.2126*r + 0.7152*g + 0.0722*b) / 255;
        // brighten team accents so they pop like unit stripes
        const l2 = Math.min(1, Math.pow(l, TEAM_ACCENT_LUMA_GAMMA) * TEAM_ACCENT_LUMA_GAIN + TEAM_ACCENT_LUMA_BIAS);
        d[i]   = Math.max(0, Math.min(255, tr * l2));
        d[i+1] = Math.max(0, Math.min(255, tg * l2));
        d[i+2] = Math.max(0, Math.min(255, tb * l2));
        // alpha unchanged
      }

      c.putImageData(id, 0, 0);
    }catch(e){
      // If canvas becomes tainted for any reason, just fall back to original sprite.
      _teamSpriteCache.set(key, null);
      return null;
    }

    _teamSpriteCache.set(key, cvs);
    return cvs;
  }

  function _parseAtlasFrames(json){
    // Return: [{x,y,w,h}] sorted in a stable order.
    // Supports: Aseprite array, TexturePacker dict, plus "frames" nested in common wrappers.
    const tryParseFramesValue = (fr)=>{
      try{
        if (!fr) return null;

        // Aseprite: frames is array
        if (Array.isArray(fr)){
          const arr = fr.map((it, idx)=>({
            name: it?.filename ?? String(idx),
            // frame rect inside atlas
            x: (it?.frame?.x ?? it?.x ?? 0) | 0,
            y: (it?.frame?.y ?? it?.y ?? 0) | 0,
            w: (it?.frame?.w ?? it?.w ?? 0) | 0,
            h: (it?.frame?.h ?? it?.h ?? 0) | 0,

            // trim-aware offsets (Aseprite/TexturePacker style)
            ox: (it?.spriteSourceSize?.x ?? it?.spriteSourceSizeX ?? 0) | 0,
            oy: (it?.spriteSourceSize?.y ?? it?.spriteSourceSizeY ?? 0) | 0,
            sw: (it?.sourceSize?.w ?? it?.sourceW ?? (it?.frame?.w ?? it?.w ?? 0)) | 0,
            sh: (it?.sourceSize?.h ?? it?.sourceH ?? (it?.frame?.h ?? it?.h ?? 0)) | 0
          })).filter(f=>f.w>0 && f.h>0 && f.sw>0 && f.sh>0);

          // Sort by trailing number if possible
          arr.sort((a,b)=>{
            const na = (a.name.match(/(\d+)(?!.*\d)/)||[])[1];
            const nb = (b.name.match(/(\d+)(?!.*\d)/)||[])[1];
            if (na!=null && nb!=null) return (+na) - (+nb);
            return a.name.localeCompare(b.name);
          });

          return arr.map(({x,y,w,h,ox,oy,sw,sh})=>({x,y,w,h,ox,oy,sw,sh}));
        }

        // TexturePacker: frames is dict
        if (typeof fr === "object"){
          const keys = Object.keys(fr);
          keys.sort((a,b)=>{
            const na = (a.match(/(\d+)(?!.*\d)/)||[])[1];
            const nb = (b.match(/(\d+)(?!.*\d)/)||[])[1];
            if (na!=null && nb!=null) return (+na) - (+nb);
            return a.localeCompare(b);
          });
          const arr = [];
          for (const k of keys){
            const v = fr[k];
            const f = v && (v.frame || v);
            if (!f) continue;
            const x = (f.x ?? 0) | 0;
            const y = (f.y ?? 0) | 0;
            const w = (f.w ?? 0) | 0;
            const h = (f.h ?? 0) | 0;
            if (w>0 && h>0){
              const sss = v && (v.spriteSourceSize || v.spriteSource || v.spritesourcesize);
              const ss  = v && (v.sourceSize || v.source || v.sourcesize);
              const ox = (sss && (sss.x ?? sss[0]) ? (sss.x ?? sss[0]) : 0) | 0;
              const oy = (sss && (sss.y ?? sss[1]) ? (sss.y ?? sss[1]) : 0) | 0;
              const sw = (ss && (ss.w ?? ss[0]) ? (ss.w ?? ss[0]) : w) | 0;
              const sh = (ss && (ss.h ?? ss[1]) ? (ss.h ?? ss[1]) : h) | 0;
              arr.push({x,y,w,h, ox,oy, sw,sh});
            }
          }
          return arr.length ? arr : null;
        }
      }catch(_e){}
      return null;
    };

    try{
      // 1) Standard top-level
      let out = tryParseFramesValue(json && json.frames);
      if (out && out.length) return out;

      // 2) Deep search for any nested `.frames` field
      const candidates = [];
      const walk = (node, depth)=>{
        if (!node || depth > 8) return;
        if (typeof node !== "object") return;
        if (Array.isArray(node)){
          for (const it of node) walk(it, depth+1);
          return;
        }
        if (node.frames){
          const cand = tryParseFramesValue(node.frames);
          if (cand && cand.length) candidates.push(cand);
        }
        for (const k in node){
          if (!Object.prototype.hasOwnProperty.call(node, k)) continue;
          if (k === "frames") continue;
          walk(node[k], depth+1);
        }
      };
      walk(json, 0);

      if (candidates.length){
        candidates.sort((a,b)=>b.length - a.length);
        return candidates[0];
      }
    }catch(_e){}
    return null;
  }

  // Kick off exp1 atlas load early (non-blocking)
  async function _initExp1IfNeeded(){
    if (_exp1Loading || (EXP1_FRAMES && EXP1_FRAMES.length)) return;
    if (!EXP1_JSON) return;
    _exp1Loading = true;
    try{
      const r = await fetch(EXP1_JSON, {cache:"no-store"});
      if (!r.ok) throw new Error("HTTP "+r.status);
      const j = await r.json();
      EXP1_FRAMES = _parseAtlasFrames(j);
      if (!EXP1_FRAMES || !EXP1_FRAMES.length){
        console.warn("[EXP1] frames parse failed");
      } else {
        //console.log("[EXP1] frames:", EXP1_FRAMES.length);
      }
    }catch(e){
      console.warn("[EXP1] load failed:", e);
      EXP1_FRAMES = null;
    }finally{
      _exp1Loading = false;
    }
  }

  // Expose team palette helpers for other modules (e.g. buildings.js)
  try{
    window.applyTeamPaletteToImage = window.applyTeamPaletteToImage || _applyTeamPaletteToImage;
    window.replaceMagentaWithTeamColor = window.replaceMagentaWithTeamColor || _applyTeamPaletteToImage;
    window.PO = window.PO || {};
    window.PO.applyTeamPaletteToImage = window.PO.applyTeamPaletteToImage || _applyTeamPaletteToImage;
    // Keep TEAM_ACCENT visible for debugging/overrides
    window.TEAM_ACCENT = TEAM_ACCENT;
  }catch(_e){}
  const LITE_TANK_BASE = "asset/sprite/unit/tank/lite_tank/";
  const HARVESTER_BASE = "asset/sprite/unit/tank/harvester/";
  const LITE_TANK_BASE_SCALE = 0.13;
  const HARVESTER_BASE_SCALE = 0.13;
  // Use atlas anchor by default; set this to override if needed.
  const LITE_TANK_TURRET_ANCHOR = null;
  const LITE_TANK_TURRET_NUDGE  = { x: 0,   y: 0   };

  const LITE_TANK = { ok:false, bodyIdle:null, bodyMov:null, muzzleIdle:null, muzzleMov:null };
  const HARVESTER = { ok:false, idle:null, mov:null };
  let TANK_DIR_TO_IDLE_IDX, MUZZLE_DIR_TO_IDLE_IDX;
  let getUnitSpec;

  function _ensureImg(cur, url){
    if (cur) return cur;
    if (!url) return cur;
    const img = new Image();
    img.src = url;
    return img;
  }

  function bindEnv(env){
    canvas = env.canvas; ctx = env.ctx; cam = env.cam; state = env.state;
    TEAM = env.TEAM; MAP_W = env.MAP_W; MAP_H = env.MAP_H; TILE = env.TILE; ISO_X = env.ISO_X; ISO_Y = env.ISO_Y;
    terrain = env.terrain; ore = env.ore; explored = env.explored; visible = env.visible;
    BUILD = env.BUILD; DEFENSE = env.DEFENSE; BUILD_SPRITE = env.BUILD_SPRITE || BUILD_SPRITE_LOCAL; NAME_KO = env.NAME_KO; POWER = env.POWER;
    worldToScreen = env.worldToScreen; tileToWorldCenter = env.tileToWorldCenter; idx = env.idx; inMap = env.inMap;
    clamp = env.clamp; getEntityById = env.getEntityById;
    REPAIR_WRENCH_IMG = env.REPAIR_WRENCH_IMG || _ensureImg(REPAIR_WRENCH_IMG, env.REPAIR_WRENCH_PNG);
    repairWrenches = env.repairWrenches || [];
    exp1Fxs = env.exp1Fxs || [];
    if (env.CON_YARD_PNG && !CON_YARD_PNG){
      CON_YARD_PNG = env.CON_YARD_PNG;
      CON_YARD_IMG.src = CON_YARD_PNG;
    }
    if (env.EXP1_PNG && !EXP1_PNG){
      EXP1_PNG = env.EXP1_PNG;
      EXP1_IMG.src = EXP1_PNG;
    }
    if (env.EXP1_JSON && !EXP1_JSON){
      EXP1_JSON = env.EXP1_JSON;
    }
    _initExp1IfNeeded();
    smokeWaves = env.smokeWaves || []; smokePuffs = env.smokePuffs || [];
    dustPuffs = env.dustPuffs || []; dmgSmokePuffs = env.dmgSmokePuffs || [];
    bloodStains = env.bloodStains || []; bloodPuffs = env.bloodPuffs || [];
    explosions = env.explosions || [];
    infDeathFxs = env.infDeathFxs || [];
    snipDeathFxs = env.snipDeathFxs || [];
    // Local SPRITE_TUNE is authoritative (loaded from storage/preset)
    getTeamCroppedSprite = env.getTeamCroppedSprite || _getTeamCroppedSprite;
    drawBuildingSprite = env.drawBuildingSprite || drawBuildingSprite;
    INF_DIE_IMG = env.INF_DIE_IMG || _ensureImg(INF_DIE_IMG, env.INF_DIE_PNG);
    SNIP_DIE_IMG = env.SNIP_DIE_IMG || _ensureImg(SNIP_DIE_IMG, env.SNIP_DIE_PNG);
    INF_SPRITE_SCALE = env.INF_SPRITE_SCALE;
    INF_IMG = env.INF_IMG || _ensureImg(INF_IMG, env.INF_IDLE_PNG);
    INF_ATK_IMG = env.INF_ATK_IMG || _ensureImg(INF_ATK_IMG, env.INF_ATK_PNG);
    INF_MOV_IMG = env.INF_MOV_IMG || _ensureImg(INF_MOV_IMG, env.INF_MOV_PNG);
    INF_MOV_NE_IMG = env.INF_MOV_NE_IMG || _ensureImg(INF_MOV_NE_IMG, env.INF_MOV_NE_PNG);
    INF_MOV_N_IMG = env.INF_MOV_N_IMG || _ensureImg(INF_MOV_N_IMG, env.INF_MOV_N_PNG);
    INF_MOV_NW_IMG = env.INF_MOV_NW_IMG || _ensureImg(INF_MOV_NW_IMG, env.INF_MOV_NW_PNG);
    INF_MOV_W_IMG = env.INF_MOV_W_IMG || _ensureImg(INF_MOV_W_IMG, env.INF_MOV_W_PNG);
    INF_MOV_SW_IMG = env.INF_MOV_SW_IMG || _ensureImg(INF_MOV_SW_IMG, env.INF_MOV_SW_PNG);
    INF_MOV_S_IMG = env.INF_MOV_S_IMG || _ensureImg(INF_MOV_S_IMG, env.INF_MOV_S_PNG);
    INF_MOV_SE_IMG = env.INF_MOV_SE_IMG || _ensureImg(INF_MOV_SE_IMG, env.INF_MOV_SE_PNG);
    SNIP_IMG = env.SNIP_IMG || _ensureImg(SNIP_IMG, env.SNIP_IDLE_PNG);
    SNIP_MOV_IMG = env.SNIP_MOV_IMG || _ensureImg(SNIP_MOV_IMG, env.SNIP_MOV_PNG);
    SNIP_MOV_NE_IMG = env.SNIP_MOV_NE_IMG || _ensureImg(SNIP_MOV_NE_IMG, env.SNIP_MOV_NE_PNG);
    SNIP_MOV_N_IMG = env.SNIP_MOV_N_IMG || _ensureImg(SNIP_MOV_N_IMG, env.SNIP_MOV_N_PNG);
    SNIP_MOV_NW_IMG = env.SNIP_MOV_NW_IMG || _ensureImg(SNIP_MOV_NW_IMG, env.SNIP_MOV_NW_PNG);
    SNIP_MOV_W_IMG = env.SNIP_MOV_W_IMG || _ensureImg(SNIP_MOV_W_IMG, env.SNIP_MOV_W_PNG);
    SNIP_MOV_SW_IMG = env.SNIP_MOV_SW_IMG || _ensureImg(SNIP_MOV_SW_IMG, env.SNIP_MOV_SW_PNG);
    SNIP_MOV_S_IMG = env.SNIP_MOV_S_IMG || _ensureImg(SNIP_MOV_S_IMG, env.SNIP_MOV_S_PNG);
    SNIP_MOV_SE_IMG = env.SNIP_MOV_SE_IMG || _ensureImg(SNIP_MOV_SE_IMG, env.SNIP_MOV_SE_PNG);
    INF_IDLE_ATLAS = env.INF_IDLE_ATLAS;
    TANK_DIR_TO_IDLE_IDX = env.TANK_DIR_TO_IDLE_IDX;
    MUZZLE_DIR_TO_IDLE_IDX = env.MUZZLE_DIR_TO_IDLE_IDX;
    getUnitSpec = env.getUnitSpec;
  }

  // Kick off lite tank atlas loads early (non-blocking)
  ;(async()=>{
    try{
      const [bodyIdle, bodyMov, muzzleIdle, muzzleMov] = await Promise.all([
        _loadTPAtlasFromUrl(LITE_TANK_BASE + "lite_tank.json", LITE_TANK_BASE),
        _loadTPAtlasFromUrl(LITE_TANK_BASE + "lite_tank_body_mov.json", LITE_TANK_BASE),
        _loadTPAtlasFromUrl(LITE_TANK_BASE + "lite_tank_muzzle.json", LITE_TANK_BASE),
        _loadTPAtlasFromUrl(LITE_TANK_BASE + "lite_tank_muzzle_mov.json", LITE_TANK_BASE),
      ]);
      LITE_TANK.bodyIdle = bodyIdle;
      LITE_TANK.bodyMov = bodyMov;
      LITE_TANK.muzzleIdle = muzzleIdle;
      LITE_TANK.muzzleMov = muzzleMov;
      LITE_TANK.ok = true;
      console.log("[lite_tank] atlases ready");
    }catch(e){
      console.warn("[lite_tank] atlas load failed:", e);
      LITE_TANK.ok = false;
    }
  })();

  // Kick off harvester atlas loads early (non-blocking)
  ;(async()=>{
    try{
      const [idle, mov] = await Promise.all([
        _loadTPAtlasFromUrl(HARVESTER_BASE + "harvester_idle.json", HARVESTER_BASE),
        _loadTPAtlasFromUrl(HARVESTER_BASE + "harvester_mov.json", HARVESTER_BASE),
      ]);
      HARVESTER.idle = idle;
      HARVESTER.mov = mov;
      HARVESTER.ok = true;
      console.log("[sprite] harvester atlases loaded");
    }catch(err){
      console.warn("[sprite] harvester atlas load failed", err);
    }
  })();

  function tankBodyFrameName(u){
    const prefix = (u.kind==="harvester") ? "hav" : "lightank";
    if (u.bodyTurn && u.bodyTurn.frameNum){
      return prefix + "_mov" + u.bodyTurn.frameNum + ".png";
    }
    const idx = (u.bodyDir ?? u.dir ?? 6);
    const map = TANK_DIR_TO_IDLE_IDX || { 6:1, 7:2, 0:3, 1:4, 2:5, 3:6, 4:7, 5:8 };
    return prefix + "_idle" + (map[idx] || 1) + ".png";
  }

  function tankMuzzleFrameName(u){
    if (u.turretTurn && u.turretTurn.frameNum){
      return "tank_muzzle_mov" + u.turretTurn.frameNum + ".png";
    }
    const idx = (u.turretDir ?? u.dir ?? 6);
    const map = MUZZLE_DIR_TO_IDLE_IDX || { 2:1, 1:2, 0:3, 7:4, 6:5, 5:6, 4:7, 3:8 };
    return "tank_muzzle_idle" + (map[idx] || 1) + ".png";
  }

  function drawTPFrame(atlas, filename, screenX, screenY, scale, team, anchorOverride=null, offsetOverride=null){
    if (!atlas || !atlas.img || !atlas.img.complete || !atlas.frames) return false;
    const fr = atlas.frames.get(filename);
    if (!fr) return false;

    const crop = fr.frame || fr;
    const sss = fr.spriteSourceSize || { x:0, y:0, w: crop.w, h: crop.h };
    const srcS = fr.sourceSize || { w: crop.w, h: crop.h };
    const anc = anchorOverride || fr.anchor || { x:0.5, y:0.5 };

    const sx = (crop.x|0), sy = (crop.y|0), sw = (crop.w|0), sh = (crop.h|0);

    let srcImg = atlas.img;
    let ssx = sx, ssy = sy;
    const tinted = (typeof getTeamCroppedSprite === "function")
      ? getTeamCroppedSprite(atlas.img, { x:sx, y:sy, w:sw, h:sh }, team)
      : null;
    if (tinted){
      srcImg = tinted;
      ssx = 0; ssy = 0;
    }

    const dx = screenX - (anc.x * srcS.w * scale) + (sss.x * scale);
    const dy = screenY - (anc.y * srcS.h * scale) + (sss.y * scale);
    const odx = (offsetOverride && offsetOverride.x) ? (offsetOverride.x * scale) : 0;
    const ody = (offsetOverride && offsetOverride.y) ? (offsetOverride.y * scale) : 0;
    ctx.drawImage(srcImg, ssx, ssy, sw, sh, dx + odx, dy + ody, sw*scale, sh*scale);
    return true;
  }

  function getSnipDieTeamSheet(teamId){
    const key=teamId;
    let c=SNIP_DIE_TEAM_SHEET.get(key);
    if(!c){
      // buildInfTeamSheet(srcImg, cacheMap, teamId)
      // Passing (srcImg, teamId) would make cacheMap a number and crash on .has()
      c=buildInfTeamSheet(SNIP_DIE_IMG, SNIP_DIE_TEAM_SHEET, teamId);
      SNIP_DIE_TEAM_SHEET.set(key,c);
    }
    return c;
  }

  function drawSnipDeathFxOne(fx){
    const z=cam.zoom;
    const p=worldToScreen(fx.x,fx.y);

    const rd=fx._rd;
    if(!rd || !rd.sw || !rd.sh) return;

    // same overall size as infantry death (both use 1200x1200 frames)
    const s = (INF_SPRITE_SCALE * 1.9) * z;

    const sheet=getSnipDieTeamSheet(fx.team);

    // centered, with the same slight "feet-bias" as infantry death
    const x = p.x - (rd.sw*s)/2;
    const y = (p.y - 18*z) - (rd.sh*s)/2;

    ctx.save();
    ctx.globalAlpha = rd.alpha;
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(sheet, rd.sx, rd.sy, rd.sw, rd.sh, x, y, rd.sw*s, rd.sh*s);
    ctx.restore();
  }

  function updateInfDeathFx(){
    // Prepare infantry death FX for depth-sorted rendering with buildings/units.
    // Playback: frameDur=0.05s, play up to frame #6 (index 5), then hold that frame and fade out.
    const baseImg = INF_DIE_IMG;
    if (!baseImg || !baseImg.complete || baseImg.naturalWidth<=0) return;

    const COLS = 3;
    const FRAMES_TOTAL = 6;

    const frameDur = 0.05;
    const HOLD_INDEX = 5;  // "last 6th frame" (1-based 6) held for fade out
    const playFrames = Math.min(HOLD_INDEX+1, FRAMES_TOTAL);
    const playDur = playFrames * frameDur;

    const fadeDur = 0.65;
    const totalDur = playDur + fadeDur;

    const imgW = baseImg.naturalWidth|0;
    const imgH = baseImg.naturalHeight|0;

    // Derive tile size from width, and allow non-multiple widths by distributing remainder.
    const colX = [0];
    for (let c=1;c<=COLS;c++){
      colX[c] = Math.round((imgW * c) / COLS);
    }
    const rowsGuess = 2; // detected layout: 3 cols x 2 rows
    const rowY = [0];
    for (let r=1;r<=rowsGuess;r++){
      rowY[r] = Math.round((imgH * r) / rowsGuess);
    }

    const frames = [
      {cx:0, cy:0}, // 1
      {cx:1, cy:0}, // 2
      {cx:2, cy:0}, // 3
      {cx:0, cy:1}, // 4
      {cx:1, cy:1}, // 5
      {cx:2, cy:1}, // 6 (hold here)
    ];

    for (let i=infDeathFxs.length-1;i>=0;i--){
      const fx = infDeathFxs[i];
      const age = state.t - fx.t0;
      if (age >= totalDur){
        infDeathFxs.splice(i,1);
        continue;
      }

      // frame index (stop at HOLD_INDEX after playDur)
      let fi = Math.min(playFrames-1, Math.max(0, (age / frameDur)|0));
      if (age >= playDur) fi = Math.min(HOLD_INDEX, FRAMES_TOTAL-1);

      // alpha (fade only after playDur)
      let alpha = 1;
      if (age > playDur){
        alpha = clamp(1 - ((age - playDur) / fadeDur), 0, 1);
      }

      let cx = frames[fi].cx, cy = frames[fi].cy;
      cx = clamp(cx, 0, COLS-1);
      cy = clamp(cy, 0, rowsGuess-1);

      const sx0 = colX[cx], sx1 = colX[cx+1];
      const sy0 = rowY[cy], sy1 = rowY[cy+1];
      const sw = Math.max(1, sx1 - sx0);
      const sh = Math.max(1, sy1 - sy0);

      fx._rd = { sx:sx0, sy:sy0, sw, sh, alpha, fi };
    }
  }

  function updateSnipDeathFx(){
    const baseImg = SNIP_DIE_IMG;
    if (!baseImg || !baseImg.complete || baseImg.naturalWidth<=0) return;

    const dt=state.dt??1/60;

    const FRAME_DUR=0.06;
    const FRAMES=9;
    const HOLD_LAST=0.12;
    const FADE_DUR=0.22;

    // derive per-tile size from texture (expects 3x3 sheet, each 1200x1200)
    const cols=3;
    const tw=(baseImg.naturalWidth/cols)|0;
    const th=(baseImg.naturalHeight/cols)|0;

    for(let i=snipDeathFxs.length-1;i>=0;i--){
      const fx=snipDeathFxs[i];
      fx.t=(fx.t??0)+dt;

      const playT=FRAMES*FRAME_DUR;
      const holdEnd=playT+HOLD_LAST;
      const fadeEnd=holdEnd+FADE_DUR;

      let fi=0, alpha=1;
      if(fx.t<playT){
        fi=Math.min(FRAMES-1, (fx.t/FRAME_DUR)|0);
        alpha=1;
      }else if(fx.t<holdEnd){
        fi=FRAMES-1; alpha=1;
      }else if(fx.t<fadeEnd){
        fi=FRAMES-1; alpha=1-((fx.t-holdEnd)/FADE_DUR);
      }else{
        snipDeathFxs.splice(i,1);
        continue;
      }

      const sx=(fi%cols)*tw;
      const sy=((fi/cols)|0)*th;

      fx._rd = { sx, sy, sw: tw, sh: th, alpha, fi };
    }
  }

  function updateExp1Fxs(){
    if (!EXP1_FRAMES || !EXP1_FRAMES.length) return;
    if (!exp1Fxs || !exp1Fxs.length) return;
    for (let i=exp1Fxs.length-1;i>=0;i--){
      const fx = exp1Fxs[i];
      const age = state.t - fx.t0;
      const idx = Math.floor(age / Math.max(0.001, fx.frameDur));
      if (idx >= EXP1_FRAMES.length) exp1Fxs.splice(i,1);
    }
  }

  function drawInfDeathFxOne(fx){
    const baseImg = INF_DIE_IMG;
    if (!baseImg || !baseImg.complete || baseImg.naturalWidth<=0) return;

    const rd = fx._rd;
    if (!rd) return;

    // Palette swap (magenta -> team color), cached per team
    const sheet = buildInfTeamSheet(baseImg, INF_TEAM_SHEET_DIE, fx.team) || baseImg;

    const p = worldToScreen(fx.x, fx.y);
    const z = cam.zoom||1;

    // Draw near ground plane (corpse). Match infantry render scale so it doesn't look huge.
    const x = p.x;
    const y = p.y - 18*z;

    const sc = INF_SPRITE_SCALE * 1.9 * z; // death FX size (slightly reduced)
    const dw = rd.sw * sc;
    const dh = rd.sh * sc;

    ctx.save();
    ctx.globalAlpha = rd.alpha;
    const dx = Math.round(x - dw/2);
    const dy = Math.round(y - dh/2);
    ctx.drawImage(sheet, rd.sx, rd.sy, rd.sw, rd.sh, dx, dy, dw, dh);
    ctx.restore();
  }

  // -------------------------
  // Infantry/Sniper sprite draw (moved from game.js)
  // -------------------------
  const INF_DIR_OFFSET = 0; // user-calibrated sprite index offset
  function infRemapDir(dir){
    dir = (dir|0) % 8; if (dir<0) dir += 8;
    let d = (dir + INF_DIR_OFFSET) % 8; if (d<0) d += 8;
    return d;
  }

  // The PNG contains 8 poses (idle), arranged in a 3x3 grid with the bottom-right cell empty.
  // Order definition (USER-LOCKED): start at top-left and go right:
  // [0]=동(E), [1]=동북(NE), [2]=북(N), [3]=북서(NW), [4]=서(W), [5]=남서(SW), [6]=남(S), [7]=동남(SE)
  // Bounding boxes were auto-trimmed from the provided file (inf_idle_tex.png 1800x1800).
  const LOCAL_INF_IDLE_ATLAS = [
    { x:226, y: 90, w:199, h:420 }, // 0 E
    { x:794, y: 89, w:204, h:436 }, // 1 NE
    { x:1363,y: 90, w:245, h:425 }, // 2 N
    { x:207, y:689, w:204, h:436 }, // 3 NW
    { x:776, y:690, w:199, h:420 }, // 4 W
    { x:1398,y:691, w:209, h:429 }, // 5 SW
    { x:191, y:1289,w:283, h:422 }, // 6 S (front)
    { x:809, y:1291,w:209, h:429 }, // 7 SE
  ];

  // === Infantry attack atlas (auto-trim from 3x3 grid; bottom-right empty) ===
  let INF_ATK_ATLAS = null;
  // === Sniper atlas/cache ===
  let SNIP_IDLE_ATLAS = null;

  function buildAtlasFromGrid(img, cols=3, rows=3){
    if (!img || !img.complete || !img.naturalWidth) return null;
    const W = img.naturalWidth, H = img.naturalHeight;
    const cellW = Math.floor(W/cols), cellH = Math.floor(H/rows);

    const c = document.createElement("canvas");
    c.width=W; c.height=H;
    const cctx=c.getContext("2d",{willReadFrequently:true});
    cctx.clearRect(0,0,W,H);
    cctx.drawImage(img,0,0);

    const atlas=[];
    for (let i=0;i<8;i++){
      const cx = i % cols;
      const cy = (i/cols)|0;
      const x0 = cx*cellW, y0 = cy*cellH;
      const imgd = cctx.getImageData(x0,y0,cellW,cellH);
      const d = imgd.data;

      let minx=cellW, miny=cellH, maxx=-1, maxy=-1;
      for (let y=0; y<cellH; y++){
        for (let x=0; x<cellW; x++){
          const a = d[(y*cellW + x)*4 + 3];
          if (a>0){
            if (x<minx) minx=x;
            if (y<miny) miny=y;
            if (x>maxx) maxx=x;
            if (y>maxy) maxy=y;
          }
        }
      }
      if (maxx<0){
        atlas.push({x:x0, y:y0, w:1, h:1});
      } else {
        const pad=2;
        minx=Math.max(0, minx-pad); miny=Math.max(0, miny-pad);
        maxx=Math.min(cellW-1, maxx+pad); maxy=Math.min(cellH-1, maxy+pad);
        atlas.push({x:x0+minx, y:y0+miny, w:(maxx-minx+1), h:(maxy-miny+1)});
      }
    }
    return atlas;
  }

  function ensureSnipAtlases(){
    if (!SNIP_IMG || !SNIP_IMG.complete || !SNIP_IMG.naturalWidth) return;
    if (!SNIP_IDLE_ATLAS){
      SNIP_IDLE_ATLAS = buildAtlasFromGrid(SNIP_IMG,3,3);
    }
  }

  function ensureInfAtlases(){
    if (!INF_ATK_ATLAS && INF_ATK_IMG && INF_ATK_IMG.complete && INF_ATK_IMG.naturalWidth){
      INF_ATK_ATLAS = buildAtlasFromGrid(INF_ATK_IMG, 3, 3);
    }
  }

  function drawInfantrySprite(ctx, px, py, dir, alpha, teamId, isFiring=false){
    ensureInfAtlases();
    const atlas = (isFiring && INF_ATK_ATLAS) ? INF_ATK_ATLAS : (INF_IDLE_ATLAS || LOCAL_INF_IDLE_ATLAS);
    const img   = (isFiring && INF_ATK_ATLAS) ? INF_ATK_IMG   : INF_IMG;
    const cache = (isFiring && INF_ATK_ATLAS) ? INF_TEAM_SHEET_ATK : INF_TEAM_SHEET_IDLE;

    const f = atlas[infRemapDir(dir)] || atlas[6];
    const z = (typeof cam !== "undefined" && cam && typeof cam.zoom==="number") ? cam.zoom : 1;
    const sc = INF_SPRITE_SCALE * z;
    const dw = f.w * sc, dh = f.h * sc;

    // Pivot: bottom-center (feet)
    const pivotX = f.w * 0.5;
    const pivotY = f.h * 1.0;

    const dx = Math.floor(px - pivotX*sc);
    const dy = Math.floor(py - pivotY*sc);

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(buildInfTeamSheet(img, cache, teamId), f.x, f.y, f.w, f.h, dx, dy, dw, dh);
    ctx.restore();
  }

  function drawSniperSprite(ctx, wx, wy, dir, alpha=1, teamId=0){
    ensureSnipAtlases();
    if (!SNIP_IDLE_ATLAS || !SNIP_IDLE_ATLAS[dir]) return;

    const atlas = SNIP_IDLE_ATLAS;
    const f = atlas[dir];

    const sheet = buildInfTeamSheet(SNIP_IMG, SNIP_TEAM_SHEET, teamId);
    const sheetW = (sheet && (sheet.naturalWidth || sheet.width)) || 0;
    if (!sheetW) return;

    const z = (typeof cam !== "undefined" && cam && typeof cam.zoom==="number") ? cam.zoom : 1;
    const scale = INF_SPRITE_SCALE * z;
    const dx = Math.round(wx - (f.w * scale)/2);
    const dy = Math.round(wy - (f.h * scale));
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(sheet, f.x, f.y, f.w, f.h, dx, dy, f.w*scale, f.h*scale);
    ctx.restore();
  }

  function drawInfantryMoveEast(ctx, px, py, alpha, teamId, t){
    if (!INF_MOV_IMG || !INF_MOV_IMG.complete || !INF_MOV_IMG.naturalWidth) {
      drawInfantrySprite(ctx, px, py, 0, alpha, teamId, false);
      return;
    }
    const z = (typeof cam !== "undefined" && cam && typeof cam.zoom==="number") ? cam.zoom : 1;
    const sc = INF_SPRITE_SCALE * z * 1.0;
    const TILEW = 600, TILEH = 600;
    const cols = Math.max(1, Math.floor(INF_MOV_IMG.naturalWidth / TILEW));
    const frameDur = 0.04;
    const phase = ((teamId||0)*0.37 + (Math.abs(((px*0.01)|0)+((py*0.01)|0))%97)*0.011);
    const fi = (Math.floor((t + phase) / frameDur) % 6 + 6) % 6;

    const sx = (fi % cols) * TILEW;
    const sy = Math.floor(fi / cols) * TILEH;

    const dw = TILEW * sc, dh = TILEH * sc;

    const pivotX = TILEW * 0.5;
    const FEET_NUDGE = 52;
    const pivotY = TILEH * 1.0 - FEET_NUDGE;

    const dx = Math.floor(px - pivotX*sc);
    const dy = Math.floor(py - pivotY*sc);

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(buildInfTeamSheet(INF_MOV_IMG, INF_TEAM_SHEET_MOV, teamId), sx, sy, TILEW, TILEH, dx, dy, dw, dh);
    ctx.restore();
  }

  function drawInfantryMoveNE(ctx, px, py, alpha, teamId, t){
    if (!INF_MOV_NE_IMG || !INF_MOV_NE_IMG.complete || !INF_MOV_NE_IMG.naturalWidth) {
      drawInfantrySprite(ctx, px, py, 1, alpha, teamId, false);
      return;
    }
    const z = (typeof cam !== "undefined" && cam && typeof cam.zoom==="number") ? cam.zoom : 1;
    const sc = INF_SPRITE_SCALE * z * 1.0;
    const TILEW = 600, TILEH = 600;
    const cols = Math.max(1, Math.floor(INF_MOV_NE_IMG.naturalWidth / TILEW));
    const frameDur = 0.04;
    const phase = ((teamId||0)*0.37 + (Math.abs(((px*0.01)|0)+((py*0.01)|0))%97)*0.011);
    const fi = (Math.floor((t + phase) / frameDur) % 6 + 6) % 6;

    const sx = (fi % cols) * TILEW;
    const sy = Math.floor(fi / cols) * TILEH;

    const dw = TILEW * sc, dh = TILEH * sc;

    const pivotX = TILEW * 0.5;
    const FEET_NUDGE = 52;
    const pivotY = TILEH * 1.0 - FEET_NUDGE;

    const dx = Math.floor(px - pivotX*sc);
    const dy = Math.floor(py - pivotY*sc);

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(buildInfTeamSheet(INF_MOV_NE_IMG, INF_TEAM_SHEET_MOV_NE, teamId), sx, sy, TILEW, TILEH, dx, dy, dw, dh);
    ctx.restore();
  }

  function drawInfantryMoveSheet(ctx, px, py, alpha, teamId, t, img, cache, fallbackDir){
    if (!img || !img.complete || !img.naturalWidth) {
      drawInfantrySprite(ctx, px, py, fallbackDir, alpha, teamId, false);
      return;
    }
    const z = (typeof cam !== "undefined" && cam && typeof cam.zoom==="number") ? cam.zoom : 1;
    const sc = INF_SPRITE_SCALE * z * 1.0;
    const TILEW = 600, TILEH = 600;
    const cols = Math.max(1, Math.floor(img.naturalWidth / TILEW));
    const frameDur = 0.04;

    const phase = ((teamId||0)*0.37 + (Math.abs(((px*0.01)|0)+((py*0.01)|0))%97)*0.011);
    const fi = (Math.floor((t + phase) / frameDur) % 6 + 6) % 6;

    const sx = (fi % cols) * TILEW;
    const sy = Math.floor(fi / cols) * TILEH;

    const dw = TILEW * sc, dh = TILEH * sc;

    const pivotX = TILEW * 0.5;
    const FEET_NUDGE = 52;
    const pivotY = TILEH * 1.0 - FEET_NUDGE;

    const dx = Math.floor(px - pivotX*sc);
    const dy = Math.floor(py - pivotY*sc);

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(buildInfTeamSheet(img, cache, teamId), sx, sy, TILEW, TILEH, dx, dy, dw, dh);
    ctx.restore();
  }

  function drawInfantryMoveN(ctx, px, py, alpha, teamId, t){
    return drawInfantryMoveSheet(ctx, px, py, alpha, teamId, t, INF_MOV_N_IMG, INF_TEAM_SHEET_MOV_N, 2);
  }
  function drawInfantryMoveNW(ctx, px, py, alpha, teamId, t){
    return drawInfantryMoveSheet(ctx, px, py, alpha, teamId, t, INF_MOV_NW_IMG, INF_TEAM_SHEET_MOV_NW, 3);
  }
  function drawInfantryMoveW(ctx, px, py, alpha, teamId, t){
    return drawInfantryMoveSheet(ctx, px, py, alpha, teamId, t, INF_MOV_W_IMG, INF_TEAM_SHEET_MOV_W, 4);
  }
  function drawInfantryMoveSW(ctx, px, py, alpha, teamId, t){
    return drawInfantryMoveSheet(ctx, px, py, alpha, teamId, t, INF_MOV_SW_IMG, INF_TEAM_SHEET_MOV_SW, 5);
  }
  function drawInfantryMoveS(ctx, px, py, alpha, teamId, t){
    return drawInfantryMoveSheet(ctx, px, py, alpha, teamId, t, INF_MOV_S_IMG, INF_TEAM_SHEET_MOV_S, 6);
  }
  function drawInfantryMoveSE(ctx, px, py, alpha, teamId, t){
    return drawInfantryMoveSheet(ctx, px, py, alpha, teamId, t, INF_MOV_SE_IMG, INF_TEAM_SHEET_MOV_SE, 7);
  }

  function drawSniperMoveSheet(ctx, px, py, alpha, teamId, t, img, cache, fallbackDir){
    if (!img || !img.complete || !img.naturalWidth) {
      drawSniperSprite(ctx, px, py, fallbackDir, alpha, teamId);
      return;
    }
    const z = (typeof cam !== "undefined" && cam && typeof cam.zoom==="number") ? cam.zoom : 1;
    const sc = INF_SPRITE_SCALE * z * 1.0;
    const TILEW = 600, TILEH = 600;
    const cols = Math.max(1, Math.floor(img.naturalWidth / TILEW));
    const frames = 12;
    const frameDur = 0.04;

    const phase = ((teamId||0)*0.37 + (Math.abs(((px*0.01)|0)+((py*0.01)|0))%97)*0.011);
    const fi = (Math.floor((t + phase) / frameDur) % frames + frames) % frames;

    const sx = (fi % cols) * TILEW;
    const sy = Math.floor(fi / cols) * TILEH;

    const dw = TILEW * sc, dh = TILEH * sc;

    const pivotX = TILEW * 0.5;
    const FEET_NUDGE = 52;
    const pivotY = TILEH * 1.0 - FEET_NUDGE;

    const dx = Math.floor(px - pivotX*sc);
    const dy = Math.floor(py - pivotY*sc);

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(buildInfTeamSheet(img, cache, teamId), sx, sy, TILEW, TILEH, dx, dy, dw, dh);
    ctx.restore();
  }

  function drawSniperMoveByDir(ctx, px, py, dir, alpha, teamId, t){
    if (dir===0)      return drawSniperMoveSheet(ctx, px, py, alpha, teamId, t, SNIP_MOV_IMG,    SNIP_TEAM_SHEET_MOV,    0);
    else if (dir===1) return drawSniperMoveSheet(ctx, px, py, alpha, teamId, t, SNIP_MOV_NE_IMG, SNIP_TEAM_SHEET_MOV_NE, 1);
    else if (dir===2) return drawSniperMoveSheet(ctx, px, py, alpha, teamId, t, SNIP_MOV_N_IMG,  SNIP_TEAM_SHEET_MOV_N,  2);
    else if (dir===3) return drawSniperMoveSheet(ctx, px, py, alpha, teamId, t, SNIP_MOV_NW_IMG, SNIP_TEAM_SHEET_MOV_NW, 3);
    else if (dir===4) return drawSniperMoveSheet(ctx, px, py, alpha, teamId, t, SNIP_MOV_W_IMG,  SNIP_TEAM_SHEET_MOV_W,  4);
    else if (dir===5) return drawSniperMoveSheet(ctx, px, py, alpha, teamId, t, SNIP_MOV_SW_IMG, SNIP_TEAM_SHEET_MOV_SW, 5);
    else if (dir===6) return drawSniperMoveSheet(ctx, px, py, alpha, teamId, t, SNIP_MOV_S_IMG,  SNIP_TEAM_SHEET_MOV_S,  6);
    else if (dir===7) return drawSniperMoveSheet(ctx, px, py, alpha, teamId, t, SNIP_MOV_SE_IMG, SNIP_TEAM_SHEET_MOV_SE, 7);
    return drawSniperSprite(ctx, px, py, dir, alpha, teamId);
  }

  function drawBuildingSpriteLocal(ent){
    const cfg = BUILD_SPRITE[ent.kind];
    if (!cfg) return false;
    const img = cfg.img;
    if (!img || !img.complete || !img.naturalWidth || !img.naturalHeight) return false;

    const z = cam.zoom || 1;
    const footprintW = (ent.tw + ent.th) * ISO_X;

    const tune = SPRITE_TUNE[ent.kind] || {};
    const crop = cfg.crop || { x: 0, y: 0, w: img.naturalWidth, h: img.naturalHeight };
    const scale = (footprintW / (crop.w || img.naturalWidth)) * (tune.scaleMul ?? 1.0);

    const dw = crop.w * scale * z;
    const dh = crop.h * scale * z;

    const anchorMode = tune.anchor || "south";
    let anchorX, anchorY;
    if (anchorMode === "center") {
      const cx = (ent.tx + ent.tw * 0.5) * TILE;
      const cy = (ent.ty + ent.th * 0.5) * TILE;
      const cW = worldToScreen(cx, cy);
      anchorX = cW.x;
      anchorY = cW.y;
    } else {
      const southW = worldToScreen((ent.tx + ent.tw) * TILE, (ent.ty + ent.th) * TILE);
      anchorX = southW.x;
      anchorY = southW.y;
    }

    const basePivotX = (cfg.pivot?.x ?? (crop.w * 0.5));
    const basePivotY = (cfg.pivot?.y ?? (anchorMode === "center" ? (crop.h * 0.5) : crop.h));

    const nudgeX = (tune.pivotNudge?.x ?? 0);
    const nudgeY = (tune.pivotNudge?.y ?? 0);

    const px = (basePivotX + nudgeX) * scale * z;
    const py = (basePivotY + nudgeY) * scale * z;

    const dx = (anchorX - px) + ((tune.offsetNudge?.x ?? 0) * z);
    const dy = (anchorY - py) + ((tune.offsetNudge?.y ?? 0) * z);

    ctx.save();
    ctx.imageSmoothingEnabled = true;

    let srcImg = img;
    let sx = crop.x, sy = crop.y, sw = crop.w, sh = crop.h;

    if (cfg.teamColor && typeof getTeamCroppedSprite === "function") {
      const tinted = getTeamCroppedSprite(img, crop, ent.team ?? TEAM.PLAYER);
      if (tinted) {
        srcImg = tinted;
        sx = 0; sy = 0; sw = crop.w; sh = crop.h;
      }
    }

    ctx.drawImage(
      srcImg,
      sx, sy, sw, sh,
      dx, dy, dw, dh
    );
    ctx.restore();
    return true;
  }

  function drawLiteTankSprite(u, p){
    if (!LITE_TANK || !LITE_TANK.ok) return false;
    if (typeof drawTPFrame !== "function" || typeof tankBodyFrameName !== "function" || typeof tankMuzzleFrameName !== "function") return false;
    const spec = (typeof getUnitSpec === "function") ? getUnitSpec("tank") : null;
    const specScale = (spec && spec.spriteScale != null) ? spec.spriteScale : 1;
    const s = (cam.zoom || 1) * (LITE_TANK_BASE_SCALE || 1) * specScale;
    const bodyName = tankBodyFrameName(u);
    const muzzleName = tankMuzzleFrameName(u);

    const bodyAtlas = (bodyName.indexOf("_mov")>=0) ? LITE_TANK.bodyMov : LITE_TANK.bodyIdle;
    const muzzleAtlas = (muzzleName.indexOf("_mov")>=0) ? LITE_TANK.muzzleMov : LITE_TANK.muzzleIdle;

    const ok1 = drawTPFrame(bodyAtlas, bodyName, p.x, p.y, s, u.team);
    const ok2 = drawTPFrame(muzzleAtlas, muzzleName, p.x, p.y, s, u.team, LITE_TANK_TURRET_ANCHOR || null, LITE_TANK_TURRET_NUDGE);

    if (!ok1){
      drawTPFrame(LITE_TANK.bodyMov, bodyName, p.x, p.y, s, u.team);
      drawTPFrame(LITE_TANK.bodyIdle, bodyName, p.x, p.y, s, u.team);
    }
    if (!ok2){
      drawTPFrame(LITE_TANK.muzzleMov, muzzleName, p.x, p.y, s, u.team, LITE_TANK_TURRET_ANCHOR || null, LITE_TANK_TURRET_NUDGE);
      drawTPFrame(LITE_TANK.muzzleIdle, muzzleName, p.x, p.y, s, u.team, LITE_TANK_TURRET_ANCHOR || null, LITE_TANK_TURRET_NUDGE);
    }
    return true;
  }

  function drawHarvesterSprite(u, p){
    if (!HARVESTER || !HARVESTER.ok) return false;
    if (typeof drawTPFrame !== "function" || typeof tankBodyFrameName !== "function") return false;
    const spec = (typeof getUnitSpec === "function") ? (getUnitSpec("harvester") || getUnitSpec("tank")) : null;
    const specScale = (spec && spec.spriteScale != null) ? spec.spriteScale : 1;
    const s = (cam.zoom || 1) * (HARVESTER_BASE_SCALE || 1) * specScale;

    const bodyName = tankBodyFrameName(u);
    const atlas = (bodyName.indexOf("_mov")>=0) ? HARVESTER.mov : HARVESTER.idle;

    const ok = drawTPFrame(atlas, bodyName, p.x, p.y, s, u.team);
    if (!ok){
      drawTPFrame(HARVESTER.mov, bodyName, p.x, p.y, s, u.team);
      drawTPFrame(HARVESTER.idle, bodyName, p.x, p.y, s, u.team);
    }
    return true;
  }

  function drawIsoTile(tx,ty,type){
    const c=tileToWorldCenter(tx,ty);
    const wx=c.x, wy=c.y;
    const p=worldToScreen(wx,wy);
    const x=p.x, y=p.y;

    ctx.beginPath();
    const ox=ISO_X*cam.zoom, oy=ISO_Y*cam.zoom;

    ctx.moveTo(x, y-oy);
    ctx.lineTo(x+ox, y);
    ctx.lineTo(x, y+oy);
    ctx.lineTo(x-ox, y);
    ctx.closePath();

    ctx.fillStyle = (type===1) ? "#101621" : "#0c121a";
    ctx.fill();

    if (ore[idx(tx,ty)]>0){
      const a=clamp(ore[idx(tx,ty)]/520,0,1);
      ctx.fillStyle=`rgba(255,215,0,${0.10+0.28*a})`;
      ctx.fill();
    }

    ctx.strokeStyle="rgba(255,255,255,0.035)";
    ctx.stroke();
  }

  function drawFootprintDiamond(b, fill, stroke){
    const tx0=b.tx, ty0=b.ty, tx1=b.tx+b.tw, ty1=b.ty+b.th;
    const c0=worldToScreen(tx0*TILE, ty0*TILE);
    const c1=worldToScreen(tx1*TILE, ty0*TILE);
    const c2=worldToScreen(tx1*TILE, ty1*TILE);
    const c3=worldToScreen(tx0*TILE, ty1*TILE);

    ctx.beginPath();
    ctx.moveTo(c0.x,c0.y);
    ctx.lineTo(c1.x,c1.y);
    ctx.lineTo(c2.x,c2.y);
    ctx.lineTo(c3.x,c3.y);
    ctx.closePath();

    ctx.fillStyle=fill;
    ctx.strokeStyle=stroke;
    ctx.lineWidth=2;
    ctx.fill();
    ctx.stroke();
  }

  function drawFootprintPrism(b, fill, stroke){
    const tx0=b.tx, ty0=b.ty, tx1=b.tx+b.tw, ty1=b.ty+b.th;

    const p0=worldToScreen(tx0*TILE, ty0*TILE);
    const p1=worldToScreen(tx1*TILE, ty0*TILE);
    const p2=worldToScreen(tx1*TILE, ty1*TILE);
    const p3=worldToScreen(tx0*TILE, ty1*TILE);

    const level = (BUILD[b.kind] && typeof BUILD[b.kind].hLevel === "number") ? BUILD[b.kind].hLevel : 2;
    const unitH = 34 * cam.zoom;
    const h = Math.max(0, level) * unitH;

    const t0={x:p0.x, y:p0.y-h};
    const t1={x:p1.x, y:p1.y-h};
    const t2={x:p2.x, y:p2.y-h};
    const t3={x:p3.x, y:p3.y-h};

    ctx.save();
    ctx.globalAlpha = 0.85;
    ctx.beginPath();
    ctx.moveTo(p0.x,p0.y);
    ctx.lineTo(p1.x,p1.y);
    ctx.lineTo(p2.x,p2.y);
    ctx.lineTo(p3.x,p3.y);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.fillStyle = fill;

    ctx.globalAlpha = 0.45;
    ctx.beginPath();
    ctx.moveTo(p1.x,p1.y);
    ctx.lineTo(p2.x,p2.y);
    ctx.lineTo(t2.x,t2.y);
    ctx.lineTo(t1.x,t1.y);
    ctx.closePath();
    ctx.fill();

    ctx.globalAlpha = 0.42;
    ctx.beginPath();
    ctx.moveTo(p2.x,p2.y);
    ctx.lineTo(p3.x,p3.y);
    ctx.lineTo(t3.x,t3.y);
    ctx.lineTo(t2.x,t2.y);
    ctx.closePath();
    ctx.fill();

    ctx.restore();

    ctx.beginPath();
    ctx.moveTo(t0.x,t0.y);
    ctx.lineTo(t1.x,t1.y);
    ctx.lineTo(t2.x,t2.y);
    ctx.lineTo(t3.x,t3.y);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 2;
    ctx.fill();
    ctx.stroke();

    ctx.save();
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(p0.x,p0.y); ctx.lineTo(t0.x,t0.y);
    ctx.moveTo(p1.x,p1.y); ctx.lineTo(t1.x,t1.y);
    ctx.moveTo(p2.x,p2.y); ctx.lineTo(t2.x,t2.y);
    ctx.moveTo(p3.x,p3.y); ctx.lineTo(t3.x,t3.y);
    ctx.stroke();

    ctx.globalAlpha = 0.9;
    ctx.beginPath();
    ctx.moveTo(p0.x,p0.y);
    ctx.lineTo(p1.x,p1.y);
    ctx.lineTo(p2.x,p2.y);
    ctx.lineTo(p3.x,p3.y);
    ctx.closePath();
    ctx.stroke();
    ctx.restore();
  }

  function drawFootprintTiles(tx, ty, tw, th, mask, okFill, badFill, okStroke, badStroke){
    let k=0;
    for (let y=0; y<th; y++){
      for (let x=0; x<tw; x++){
        const ttx=tx+x, tty=ty+y;
        const blocked = mask ? (mask[k]===1) : false;
        k++;
        const p=worldToScreen((ttx+0.5)*TILE, (tty+0.5)*TILE);
        ctx.beginPath();
        ctx.moveTo(p.x, p.y-ISO_Y);
        ctx.lineTo(p.x+ISO_X, p.y);
        ctx.lineTo(p.x, p.y+ISO_Y);
        ctx.lineTo(p.x-ISO_X, p.y);
        ctx.closePath();
        ctx.fillStyle = blocked ? badFill : okFill;
        ctx.strokeStyle = blocked ? badStroke : okStroke;
        ctx.lineWidth = 2;
        ctx.fill();
        ctx.stroke();
      }
    }
  }

  function rgbaFrom(hexOrRgba, alpha){
    if (!hexOrRgba) return `rgba(255,255,255,${alpha})`;
    if (hexOrRgba.startsWith("rgba")) return hexOrRgba.replace(/rgba\(([^)]+),\s*([0-9.]+)\)/, (m, body) => `rgba(${body}, ${alpha})`);
    if (hexOrRgba.startsWith("#") && hexOrRgba.length===7){
      const r=parseInt(hexOrRgba.slice(1,3),16);
      const g=parseInt(hexOrRgba.slice(3,5),16);
      const b=parseInt(hexOrRgba.slice(5,7),16);
      return `rgba(${r},${g},${b},${alpha})`;
    }
    return `rgba(255,255,255,${alpha})`;
  }

  function drawRangeEllipseWorld(cx, cy, range, color, ringOpt=null){
    const p0 = worldToScreen(cx, cy);
    const px = worldToScreen(cx + range, cy);
    const py = worldToScreen(cx, cy + range);

    const rx = Math.abs(px.x - p0.x);
    const ry = Math.abs(py.y - p0.y);

    const fillA = ringOpt?.alphaFill ?? 0.08;
    const strokeA = ringOpt?.alphaStroke ?? 0.75;
    const strokeW = ringOpt?.strokeW ?? 3.0;

    ctx.save();
    ctx.beginPath();
    ctx.ellipse(p0.x, p0.y, rx, ry, 0, 0, Math.PI*2);

    ctx.fillStyle = rgbaFrom(color, fillA);
    ctx.strokeStyle = rgbaFrom(color, strokeA);
    ctx.lineWidth = strokeW;
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  function drawSelectionEllipseAt(ent){
    const col = (ent.team===TEAM.PLAYER) ? "#28ff6a" : "#ff2a2a";
    const ringOpt = { alphaFill: 0.0, alphaStroke: 0.95, strokeW: 3.0 };
    const base = (ent.kind==="infantry" || ent.kind==="engineer" || ent.kind==="sniper") ? TILE*0.26 : TILE*0.34;
    drawRangeEllipseWorld(ent.x, ent.y, base, col, ringOpt);
  }

  function drawHpBlocksAtScreen(px, py, blocks, ratio){
    const z = (typeof cam !== "undefined" && cam && typeof cam.zoom==="number") ? cam.zoom : 1;
    const w = 10 * z;
    const h = 8 * z;
    const gap = 3 * z;

    const filled = Math.max(0, Math.min(blocks, Math.round(blocks * ratio)));
    const totalW = blocks*w + (blocks-1)*gap;

    const x0 = px - totalW/2;
    const y0 = py;

    ctx.save();
    ctx.fillStyle = "rgba(0,0,0,0.45)";
    for (let i=0;i<blocks;i++){
      const x = x0 + i*(w+gap);
      ctx.fillRect(x, y0, w, h);
    }
    const fillColor = (ratio < 0.20) ? "rgba(255,70,60,0.95)"
                    : (ratio < 0.50) ? "rgba(255,220,70,0.95)"
                    : "rgba(40,255,90,0.95)";
    ctx.fillStyle = fillColor;
    for (let i=0;i<filled;i++){
      const x = x0 + i*(w+gap);
      ctx.fillRect(x, y0, w, h);
    }
    ctx.restore();
  }

  function drawUnitHpBlocks(ent, p){
    const isInf = (ent.kind==="infantry" || ent.kind==="engineer" || ent.kind==="sniper");
    const blocks = isInf ? 5 : 10;
    const ratio = clamp(ent.hp/ent.hpMax, 0, 1);

    const z = (typeof cam !== "undefined" && cam && typeof cam.zoom==="number") ? cam.zoom : 1;
    const y = p.y + (isInf ? 22*z : 24*z);
    drawHpBlocksAtScreen(p.x, y, blocks, ratio);
  }

  function drawLabel(text,x,y){
    ctx.font="12px system-ui";
    ctx.textAlign="center";
    ctx.textBaseline="middle";
    ctx.lineWidth=3;
    ctx.strokeStyle="rgba(0,0,0,0.68)";
    ctx.strokeText(text,x,y);
    ctx.fillStyle="rgba(255,255,255,0.92)";
    ctx.fillText(text,x,y);
  }

  function drawWrenchFx(){
    const img = REPAIR_WRENCH_IMG;
    if (!img) return;

    const TILEPX = 602;
    const COLS = 3;
    const FRAMES = 7;
    const frameDur = 0.060;

    for (let i=repairWrenches.length-1;i>=0;i--){
      const fx = repairWrenches[i];
      const age = state.t - fx.t0;
      const ttl = fx.ttl || 0.7;
      const since = state.t - ((fx.last!=null)?fx.last:fx.t0);
      const linger = 0.22;
      if (since > linger){ repairWrenches.splice(i,1); continue; }

      if (!img.complete || img.naturalWidth <= 0) continue;

      const p = worldToScreen(fx.x, fx.y);
      const z = cam.zoom||1;

      const x = p.x;
      const y = p.y - 64*z;

      const a = clamp(age/ttl, 0, 1);
      const activeHold = 0.14;
      let fade = 1;
      if (since > activeHold){
        fade = clamp(1 - ((since - activeHold) / (linger - activeHold)), 0, 1);
      }

      const fi = (Math.floor(age / frameDur) % FRAMES);
      const sx = (fi % COLS) * TILEPX;
      const sy = ((fi / COLS) | 0) * TILEPX;

      const size = 216 * z;

      ctx.save();
      ctx.globalAlpha = 0.95 * fade;

      const dx = Math.round(x - size/2);
      const dy = Math.round(y - size/2);
      ctx.drawImage(img, sx, sy, TILEPX, TILEPX, dx, dy, size, size);

      ctx.restore();
    }
  }

  function drawBuildingHpBlocks(ent){
    const ratio = clamp(ent.hp/ent.hpMax, 0, 1);

    const segN = clamp(Math.round((ent.tw + ent.th) * 2), 6, 14);
    const filled = clamp(Math.round(segN * ratio), 0, segN);

    const fillColor = (ratio < 0.20) ? "rgba(255,70,60,0.98)"
                    : (ratio < 0.50) ? "rgba(255,220,70,0.98)"
                    : "rgba(110,255,90,0.98)";

    const level = (BUILD[ent.kind] && typeof BUILD[ent.kind].hLevel === "number") ? BUILD[ent.kind].hLevel : 2;
    const unitH = 34 * cam.zoom;
    const h = Math.max(0, level) * unitH;

    const tx0 = ent.tx, ty0 = ent.ty, tx1 = ent.tx + ent.tw, ty1 = ent.ty + ent.th;
    const g0 = worldToScreen(tx0*TILE, ty0*TILE);
    const g1 = worldToScreen(tx1*TILE, ty0*TILE);
    const g2 = worldToScreen(tx1*TILE, ty1*TILE);
    const g3 = worldToScreen(tx0*TILE, ty1*TILE);

    const t0 = { x: g0.x, y: g0.y - h };
    const t1 = { x: g1.x, y: g1.y - h };
    const t2 = { x: g2.x, y: g2.y - h };
    const t3 = { x: g3.x, y: g3.y - h };

    const rcx = (t0.x + t1.x + t2.x + t3.x) * 0.25;
    const rcy = (t0.y + t1.y + t2.y + t3.y) * 0.25;
    const midx = (t0.x + t3.x) * 0.5;
    const midy = (t0.y + t3.y) * 0.5;

    let ox = (midx - rcx), oy = (midy - rcy);
    const oLen = Math.hypot(ox, oy) || 1;
    ox /= oLen; oy /= oLen;

    const off = 14 * cam.zoom;
    const b0 = { x: t0.x + ox*off, y: t0.y + oy*off };
    const b1 = { x: t3.x + ox*off, y: t3.y + oy*off };

    let ux = (b1.x - b0.x), uy = (b1.y - b0.y);
    const uLen = Math.hypot(ux, uy) || 1;
    ux /= uLen; uy /= uLen;

    let vx = (t1.x - t0.x), vy = (t1.y - t0.y);
    const vLen = Math.hypot(vx, vy) || 1;
    vx /= vLen; vy /= vLen;

    const edgeLen = Math.hypot(b1.x - b0.x, b1.y - b0.y) || 1;

    const thick = 12 * cam.zoom;
    const padU = 10 * cam.zoom;
    const padV = 6 * cam.zoom;
    const gap = 2.2 * cam.zoom;

    const usable = Math.max(1, edgeLen - padU*2);
    const segLen = Math.max(1, (usable - gap*(segN-1)) / segN);

    const ang = Math.atan2(uy, ux);
    ctx.save();
    ctx.translate(b0.x, b0.y);
    ctx.rotate(ang);

    const plateW = usable + padU*2;
    const plateH = thick + padV*2;
    const plateX = -padU;
    const plateY = -plateH*0.5;

    const rr = (x,y,w,h,r)=>{
      r = Math.min(r, w*0.5, h*0.5);
      ctx.beginPath();
      ctx.moveTo(x+r, y);
      ctx.lineTo(x+w-r, y);
      ctx.quadraticCurveTo(x+w, y, x+w, y+r);
      ctx.lineTo(x+w, y+h-r);
      ctx.quadraticCurveTo(x+w, y+h, x+w-r, y+h);
      ctx.lineTo(x+r, y+h);
      ctx.quadraticCurveTo(x, y+h, x, y+h-r);
      ctx.lineTo(x, y+r);
      ctx.quadraticCurveTo(x, y, x+r, y);
      ctx.closePath();
    };

    rr(plateX + 2*cam.zoom, plateY + 2*cam.zoom, plateW, plateH, plateH*0.45);
    ctx.fillStyle = "rgba(0,0,0,0.30)";
    ctx.fill();

    rr(plateX, plateY, plateW, plateH, plateH*0.45);
    ctx.fillStyle = "rgba(12,16,24,0.72)";
    ctx.fill();

    rr(plateX, plateY, plateW, plateH, plateH*0.45);
    ctx.strokeStyle = "rgba(180,210,255,0.10)";
    ctx.lineWidth = Math.max(1, 1.1*cam.zoom);
    ctx.stroke();

    for (let i=0;i<segN;i++){
      const isMissing = (i >= filled);
      const base = isMissing ? "rgba(0,0,0,0.80)" : fillColor;

      const x0 = plateX + padU + i*(segLen + gap);
      const y0 = -thick*0.5;
      const w = segLen;
      const h0 = thick;

      ctx.fillStyle = base;
      ctx.fillRect(x0, y0, w, h0);

      ctx.strokeStyle = "rgba(0,0,0,0.35)";
      ctx.lineWidth = Math.max(1, 1.0*cam.zoom);
      ctx.strokeRect(x0, y0, w, h0);

      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x0+w, y0);
      ctx.strokeStyle = "rgba(255,255,255,0.10)";
      ctx.lineWidth = Math.max(1, 1.0*cam.zoom);
      ctx.stroke();
    }

    ctx.restore();
  }

  function drawGroupBadge(x,y,n){
    if (!n) return;
    ctx.save();
    ctx.font="11px system-ui";
    ctx.textAlign="center";
    ctx.textBaseline="middle";
    ctx.fillStyle="rgba(0,0,0,0.82)";
    ctx.strokeStyle="rgba(255,255,255,0.22)";
    ctx.lineWidth=1;
    const w=14,h=14;
    ctx.beginPath();
    ctx.rect(x-w/2, y-h/2, w, h);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle="rgba(255,255,255,0.92)";
    ctx.fillText(String(n), x, y+0.5);
    ctx.restore();
  }

  function roundRectPath(ctx, x, y, w, h, r){
    r = Math.max(0, Math.min(r, Math.min(w,h)/2));
    ctx.beginPath();
    ctx.moveTo(x+r, y);
    ctx.arcTo(x+w, y,   x+w, y+h, r);
    ctx.arcTo(x+w, y+h, x,   y+h, r);
    ctx.arcTo(x,   y+h, x,   y,   r);
    ctx.arcTo(x,   y,   x+w, y,   r);
    ctx.closePath();
  }

  function isPrimaryBuilding(b){
    if (!b || b.team!==TEAM.PLAYER) return false;
    if (!state || !state.primary || !state.primary.player) return false;
    if (b.kind==="barracks") return state.primary.player.barracks===b.id;
    if (b.kind==="factory")  return state.primary.player.factory===b.id;
    return false;
  }

  function drawPrimaryBadgeForSelectedBuilding(b){
    if (!isPrimaryBuilding(b)) return;
    const p=worldToScreen(b.x,b.y);
    const yy = p.y - (Math.max(b.tw,b.th)*ISO_Y*cam.zoom) - 40;
    const xx = p.x + ISO_X*(b.tw*0.72)*cam.zoom;
    const text="주요";
    ctx.save();
    ctx.font="bold 12px system-ui";
    ctx.textAlign="left";
    ctx.textBaseline="middle";
    const padX=8;
    const w = ctx.measureText(text).width + padX*2;
    const h = 22;
    ctx.fillStyle="rgba(0,0,0,0.55)";
    ctx.strokeStyle="rgba(255,235,140,0.9)";
    ctx.lineWidth=1.5;
    roundRectPath(ctx, xx, yy, w, h, 7);
    ctx.fill(); ctx.stroke();
    ctx.fillStyle="rgba(255,235,140,0.95)";
    ctx.fillText(text, xx+padX, yy+h/2);
    ctx.restore();
  }

  function drawHoverNameTooltip(){
    if (!state.hover.entId) return;
    if ((state.t - state.hover.t0) < 0.8) return;
    if (state.drag.on || state.pan.on) return;
    if (state.build.active) return;

    const ent = getEntityById(state.hover.entId);
    if (!ent || !ent.alive) return;
    if (ent.hidden || ent.inTransport) return;

    const name = NAME_KO[ent.kind] || ent.kind;
    const W = canvas.width, H = canvas.height;
    const x = clamp(state.hover.px + 14, 10, W-10);
    const y = clamp(state.hover.py - 18, 10, H-10);

    ctx.save();
    ctx.font="12px system-ui";
    ctx.textAlign="left";
    ctx.textBaseline="middle";
    const padX=10;
    const tw = ctx.measureText(name).width;
    const bw = tw + padX*2;
    const bh = 24;

    ctx.fillStyle="rgba(0,0,0,0.62)";
    ctx.strokeStyle="rgba(255,255,255,0.25)";
    ctx.lineWidth=1;
    roundRectPath(ctx, x, y, bw, bh, 8);
    ctx.fill(); ctx.stroke();

    ctx.fillStyle="rgba(255,255,255,0.92)";
    ctx.fillText(name, x+padX, y+bh/2);
    ctx.restore();
  }

  function drawClickWaves(){
    const now=state.t;
    state.fx.clicks = state.fx.clicks.filter(w=> (now - w.t0) <= w.life);

    for (const w of state.fx.clicks){
      const a = clamp((now - w.t0) / w.life, 0, 1);
      const sp = worldToScreen(w.x, w.y);
      const r1 = 6 + a*34;
      const r2 = 2 + a*18;
      const alpha = (1-a);

      ctx.save();
      ctx.globalAlpha = 0.75 * alpha;
      ctx.lineWidth = 2.6;
      ctx.strokeStyle = w.color || "rgba(255,255,255,0.85)";

      ctx.beginPath(); ctx.arc(sp.x, sp.y, r1, 0, Math.PI*2); ctx.stroke();
      ctx.globalAlpha = 0.45 * alpha;
      ctx.beginPath(); ctx.arc(sp.x, sp.y, r2, 0, Math.PI*2); ctx.stroke();
      ctx.restore();
    }
  }

  function drawPathFx(){
    return;
  }

  function drawRallyPointsForSelection(){
    for (const id of state.selection){
      const b=getEntityById(id);
      if (!b || !b.alive || b.team!==TEAM.PLAYER) continue;
      if (!BUILD[b.kind] || b.civ) continue;
      if (b.kind!=="barracks" && b.kind!=="factory" && b.kind!=="hq") continue;
      if (!b.rally) continue;

      const level = (BUILD[b.kind] && typeof BUILD[b.kind].hLevel === "number") ? BUILD[b.kind].hLevel : 2;
      const unitH = 34 * cam.zoom;
      const h = Math.max(0, level) * unitH;

      const c = worldToScreen((b.tx + b.tw/2) * TILE, (b.ty + b.th/2) * TILE);
      const from = { x: c.x, y: c.y - h };

      const to   = worldToScreen(b.rally.x, b.rally.y);

      ctx.save();
      ctx.globalAlpha=0.95;
      ctx.strokeStyle="rgba(255,255,255,0.8)";
      ctx.lineWidth=2;

      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(to.x, to.y);
      ctx.stroke();

      ctx.fillStyle="rgba(255,255,255,0.95)";
      ctx.beginPath();
      ctx.moveTo(from.x, from.y-6.0);
      ctx.lineTo(from.x+6.0, from.y);
      ctx.lineTo(from.x, from.y+6.0);
      ctx.lineTo(from.x-6.0, from.y);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle="rgba(255,255,255,0.95)";
      ctx.beginPath();
      ctx.arc(to.x, to.y, 5.2, 0, Math.PI*2);
      ctx.fill();

      ctx.restore();
    }
  }

  function drawOrderFx(){
    const now = state.t;
    if (!state.fx.orders) state.fx.orders = [];
    state.fx.orders = state.fx.orders.filter(o=> now <= o.until);

    for (const o of state.fx.orders){
      const u = getEntityById(o.unitId);
      if (!u || !u.alive || u.inTransport) continue;

      let tx=o.x, ty=o.y;
      let target=null;
      if (o.targetId!=null){
        target=getEntityById(o.targetId);
        if (target && target.alive){
          tx=target.x; ty=target.y;
        }
      }

      const from = worldToScreen(u.x, u.y);
      const to   = worldToScreen(tx, ty);

      ctx.save();
      const a = clamp((o.until - now) / o.ttl, 0, 1);
      ctx.globalAlpha = 0.95 * a;
      ctx.lineWidth = o.w || 3.2;
      ctx.strokeStyle = o.color || "rgba(120,255,120,0.95)";
      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(to.x, to.y);
      ctx.stroke();

      const r = o.r || 5.5;
      ctx.fillStyle = o.color2 || (o.color || "rgba(255,90,90,0.95)");
      ctx.beginPath();
      ctx.arc(to.x, to.y, r, 0, Math.PI*2);
      ctx.fill();

      if (o.kind==="attack"){
        ctx.globalAlpha = 0.8 * a;
        ctx.strokeStyle = "rgba(255,255,255,0.45)";
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(to.x-r-2, to.y);
        ctx.lineTo(to.x+r+2, to.y);
        ctx.moveTo(to.x, to.y-r-2);
        ctx.lineTo(to.x, to.y+r+2);
        ctx.stroke();
      }

      ctx.restore();
    }
  }

  function drawExplosions(ctx){
    if (!explosions.length) return;
    const z = (typeof cam !== "undefined" && cam && typeof cam.zoom==="number") ? cam.zoom : 1;

    for (const e of explosions){
      const p = worldToScreen(e.x, e.y);
      const k = clamp(1 - (e.t / Math.max(0.001, e.ttl)), 0, 1);

      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = 0.95 * Math.pow(k, 0.55);
      const R = (TILE*2.60*e.size) * z;
      const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, R);
      g.addColorStop(0.0, "rgba(255,255,235,0.92)");
      g.addColorStop(0.28, "rgba(255,220,120,0.70)");
      g.addColorStop(0.62, "rgba(255,170,70,0.28)");
      g.addColorStop(1.0, "rgba(255,140,50,0.0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(p.x, p.y, R, 0, Math.PI*2);
      ctx.fill();

      ctx.globalAlpha = 0.85 * Math.pow(k, 0.35);
      const R2 = (TILE*1.25*e.size) * z;
      const g2 = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, R2);
      g2.addColorStop(0.0, "rgba(255,255,255,0.95)");
      g2.addColorStop(0.5, "rgba(255,245,210,0.55)");
      g2.addColorStop(1.0, "rgba(255,220,140,0.0)");
      ctx.fillStyle = g2;
      ctx.beginPath();
      ctx.arc(p.x, p.y, R2, 0, Math.PI*2);
      ctx.fill();

      for (const prt of e.parts){
        const pp = worldToScreen(prt.x, prt.y);
        const a = clamp(prt.life / Math.max(0.001, prt.ttl), 0, 1);

        if (prt.kind==="streak"){
          const len = (TILE*1.40*e.size) * z * (0.7 + (1-a)*1.2);
          const dx = (prt.vx) * 0.006 * z;
          const dy = (prt.vy) * 0.006 * z;
          const norm = Math.hypot(dx,dy) || 1;
          const ux = dx/norm, uy = dy/norm;
          ctx.globalAlpha = 0.70 * a;
          ctx.lineWidth = prt.w * z;
          ctx.strokeStyle = "rgba(255,230,150,1)";
          ctx.beginPath();
          ctx.moveTo(pp.x - ux*len, pp.y - uy*len);
          ctx.lineTo(pp.x + ux*len*0.15, pp.y + uy*len*0.15);
          ctx.stroke();
        } else if (prt.kind==="ember"){
          const rr = (prt.r * z) * (0.35 + (1-a)*0.25);
          ctx.globalAlpha = 0.65 * a;
          const ge = ctx.createRadialGradient(pp.x, pp.y, 0, pp.x, pp.y, rr);
          ge.addColorStop(0.0, "rgba(255,210,120,0.85)");
          ge.addColorStop(0.45, "rgba(255,170,70,0.28)");
          ge.addColorStop(1.0, "rgba(0,0,0,0)");
          ctx.fillStyle = ge;
          ctx.beginPath();
          ctx.arc(pp.x, pp.y, rr, 0, Math.PI*2);
          ctx.fill();
        } else if (prt.kind==="flame"){
          const rr = (prt.r * z) * (0.65 + (1-a)*0.6);
          const lift = (prt.rise||0) * z;
          ctx.globalAlpha = 0.55 * a;
          const gf = ctx.createRadialGradient(pp.x, pp.y - lift, 0, pp.x, pp.y - lift, rr);
          gf.addColorStop(0.0, "rgba(255,180,80,0.45)");
          gf.addColorStop(0.45, "rgba(255,120,40,0.25)");
          gf.addColorStop(1.0, "rgba(0,0,0,0)");
          ctx.fillStyle = gf;
          ctx.beginPath();
          ctx.arc(pp.x, pp.y - lift, rr, 0, Math.PI*2);
          ctx.fill();
        }
      }

      ctx.restore();
    }
  }

  function drawExp1Fxs(ctx){
    if (!exp1Fxs || !exp1Fxs.length) return;
    if (!EXP1_FRAMES || !EXP1_FRAMES.length) return;
    if (!EXP1_IMG || !EXP1_IMG.complete) return;

    const z = (typeof cam !== "undefined" && cam && typeof cam.zoom==="number") ? cam.zoom : 1;

    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = 1;

    for (const fx of exp1Fxs){
      const age = state.t - fx.t0;
      const fi = Math.floor(age / Math.max(0.001, fx.frameDur));
      if (fi < 0 || fi >= EXP1_FRAMES.length) continue;

      const fr = EXP1_FRAMES[fi];
      const p = worldToScreen(fx.x, fx.y);

      const dw = (fr.sw ?? fr.w) * fx.scale * z;
      const dh = (fr.sh ?? fr.h) * fx.scale * z;

      const dx = p.x - dw * EXP1_PIVOT_X;
      const dy = p.y - dh * EXP1_PIVOT_Y + (EXP1_Y_OFFSET * z);

      const ox = (fr.ox ?? 0) * fx.scale * z;
      const oy = (fr.oy ?? 0) * fx.scale * z;
      const fw = fr.w * fx.scale * z;
      const fh = fr.h * fx.scale * z;

      ctx.drawImage(EXP1_IMG, fr.x, fr.y, fr.w, fr.h, dx + ox, dy + oy, fw, fh);
    }

    ctx.restore();
  }

  function drawSmokeWaves(ctx){
    if (!smokeWaves.length) return;
    const z = (typeof cam !== "undefined" && cam && typeof cam.zoom==="number") ? cam.zoom : 1;

    const pr = (seed, n)=>{
      const x = Math.sin((seed + n) * 12.9898) * 43758.5453;
      return x - Math.floor(x);
    };

    for (const w of smokeWaves){
      const p = worldToScreen(w.x, w.y);
      const t = clamp(w.t / Math.max(0.001, w.ttl), 0, 1);
      const ease = 1 - Math.pow(1 - t, 4);

      const R0 = (TILE * 0.10) * z;
      const R1 = (TILE * 1.05 * w.size) * z;
      const R  = R0 + (R1 - R0) * ease;

      const aBase = 0.32 * Math.pow(1 - t, 0.60);

      const squash = (w.squash ?? 0.62);
      const th = (TILE * 0.34 * w.size) * z;

      ctx.save();
      ctx.globalCompositeOperation = "source-over";

      ctx.translate(p.x, p.y);
      ctx.scale(1, squash);

      for (let k=0;k<3;k++){
        const jx = (pr(w.seed, 10+k)-0.5) * (TILE * 0.09 * w.size) * z;
        const jy = (pr(w.seed, 20+k)-0.5) * (TILE * 0.09 * w.size) * z;
        const rr = 1 + (pr(w.seed, 30+k)-0.5) * 0.07;

        const a = aBase * (0.66 - k*0.16);

        ctx.shadowColor = "rgba(0,0,0,0.22)";
        ctx.shadowBlur  = 28 * z;

        const inner = Math.max(0, (R*rr) - th*0.55);
        const outer = (R*rr) + th*1.45;

        const g = ctx.createRadialGradient(jx, jy, inner, jx, jy, outer);
        g.addColorStop(0.00, "rgba(0,0,0,0)");
        g.addColorStop(0.42, `rgba(110,110,110,${a*0.10})`);
        g.addColorStop(0.60, `rgba(85,85,85,${a*0.22})`);
        g.addColorStop(0.80, `rgba(70,70,70,${a*0.18})`);
        g.addColorStop(1.00, "rgba(0,0,0,0)");

        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(jx, jy, outer, 0, Math.PI*2);
        ctx.fill();
      }

      ctx.shadowBlur = 18 * z;
      for (let i=0;i<12;i++){
        const ang = (i/12) * (Math.PI*2) + pr(w.seed, 100+i)*0.70;
        const rad = R * (0.86 + pr(w.seed, 130+i)*0.24);

        const x = Math.cos(ang) * rad;
        const y = Math.sin(ang) * rad;

        const r = (TILE * (0.10 + pr(w.seed, 160+i)*0.12) * w.size) * z;
        const a = aBase * 0.14 * (0.6 + pr(w.seed, 190+i)*0.9);

        const g = ctx.createRadialGradient(x, y, 0, x, y, r*2.4);
        g.addColorStop(0.0, `rgba(150,150,150,${a*0.20})`);
        g.addColorStop(0.5, `rgba(90,90,90,${a*0.18})`);
        g.addColorStop(1.0, "rgba(0,0,0,0)");

        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(x, y, r*2.4, 0, Math.PI*2);
        ctx.fill();
      }

      ctx.restore();
    }
  }

  function drawSmokePuffs(ctx){
    if (!smokePuffs.length) return;
    const z = (typeof cam !== "undefined" && cam && typeof cam.zoom==="number") ? cam.zoom : 1;

    for (const s of smokePuffs){
      const p = worldToScreen(s.x, s.y);
      const t = clamp(s.t / Math.max(0.001, s.ttl), 0, 1);

      const r = (s.r0 + s.grow * t) * z;
      const a = s.a0 * Math.pow(1 - t, 0.65);

      ctx.save();
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = a;

      const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r*2.2);
      g.addColorStop(0.0, "rgba(120,120,120,0.12)");
      g.addColorStop(0.45, "rgba(90,90,90,0.10)");
      g.addColorStop(1.0, "rgba(0,0,0,0)");
      ctx.fillStyle = g;

      ctx.beginPath();
      ctx.arc(p.x, p.y, r*2.2, 0, Math.PI*2);
      ctx.fill();

      ctx.restore();
    }
  }

  function drawDustPuffs(ctx){
    if (!dustPuffs.length) return;
    const z = (typeof cam !== "undefined" && cam && typeof cam.zoom==="number") ? cam.zoom : 1;
    ctx.save();
    for (const p of dustPuffs){
      const k = p.t / p.ttl;
      const a = (1-k) * p.a0;
      const r = (p.r0 + p.grow*k) * z;
      const s = worldToScreen(p.x, p.y);
      ctx.fillStyle = `rgba(220, 205, 175, ${a})`;
      ctx.beginPath();
      ctx.ellipse(s.x, s.y, r*1.45, r*1.00, 0, 0, Math.PI*2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawDmgSmokePuffs(ctx){
    if (!dmgSmokePuffs.length) return;
    const z = (typeof cam !== "undefined" && cam && typeof cam.zoom==="number") ? cam.zoom : 1;
    ctx.save();
    for (const p of dmgSmokePuffs){
      const k = p.t / p.ttl;
      const a = (1-k) * p.a0;
      const r = (p.r0 + p.grow*k) * z;
      const s = worldToScreen(p.x, p.y);
      ctx.fillStyle = `rgba(160, 160, 160, ${a})`;
      ctx.beginPath();
      ctx.ellipse(s.x, s.y, r*1.05, r*0.95, 0, 0, Math.PI*2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawBlood(ctx){
    const z = (typeof cam !== "undefined" && cam && typeof cam.zoom==="number") ? cam.zoom : 1;

    for (const s of bloodStains){
      const p = worldToScreen(s.x, s.y);
      const t = clamp(s.t / Math.max(0.001, s.ttl), 0, 1);
      const a = s.a0 * Math.pow(1 - t, 0.55);
      const r = (s.r0 + s.grow * t) * z;

      ctx.save();
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = a;

      ctx.translate(p.x, p.y);
      ctx.scale(1, s.squash ?? 0.58);

      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
      g.addColorStop(0.0, "rgba(80, 0, 0, 0.55)");
      g.addColorStop(0.35, "rgba(60, 0, 0, 0.35)");
      g.addColorStop(1.0, "rgba(0, 0, 0, 0.0)");
      ctx.fillStyle = g;

      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI*2);
      ctx.fill();
      ctx.restore();
    }

    for (const b of bloodPuffs){
      const p = worldToScreen(b.x, b.y);
      const t = clamp(b.t / Math.max(0.001, b.ttl), 0, 1);
      const a = b.a0 * Math.pow(1 - t, 0.70);

      const r = (b.r0 + b.grow * t) * z;
      const yLift = (b.rise || 0) * z;

      ctx.save();
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = a;

      if (b.kind === "droplet"){
        const rr = Math.max(2, r*0.35);
        const g = ctx.createRadialGradient(p.x, p.y - yLift, 0, p.x, p.y - yLift, rr*2.2);
        g.addColorStop(0.0, "rgba(160, 0, 0, 0.65)");
        g.addColorStop(0.45, "rgba(120, 0, 0, 0.28)");
        g.addColorStop(1.0, "rgba(0,0,0,0)");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(p.x, p.y - yLift, rr*2.2, 0, Math.PI*2);
        ctx.fill();
      } else {
        const g = ctx.createRadialGradient(p.x, p.y - yLift, 0, p.x, p.y - yLift, r);
        g.addColorStop(0.0, "rgba(120, 0, 0, 0.28)");
        g.addColorStop(0.35, "rgba(70, 0, 0, 0.16)");
        g.addColorStop(1.0, "rgba(0,0,0,0)");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(p.x, p.y - yLift, r, 0, Math.PI*2);
        ctx.fill();
      }

      ctx.restore();
    }
  }

  function drawMain(env){
    if (!env) return;
    bindEnv(env);
    const {
      canvas, ctx, cam, state, TEAM, MAP_W, MAP_H, TILE, ISO_X, ISO_Y,
      terrain, ore, explored, visible, BUILD, DEFENSE, NAME_KO,
      units, buildings, bullets, traces, impacts, fires, healMarks, flashes, casings,
      gameOver, POWER,
      smokeWaves, smokePuffs, dustPuffs, dmgSmokePuffs, bloodStains, bloodPuffs,
      updateMoney, updateProdBadges,
      inMap, idx, tileToWorldCenter, worldToScreen,
      getEntityById, REPAIR_WRENCH_IMG, repairWrenches,
      snapHoverToTileOrigin, buildingWorldFromTileOrigin, inBuildRadius, isBlockedFootprint, footprintBlockedMask,
      rectFromDrag, refreshPrimaryBuildingBadgesUI,
      drawBuildingSprite,
      worldVecToDir8,
      isUnderPower, clamp
    } = env;

    const W=canvas.width, H=canvas.height;
    ctx.clearRect(0,0,W,H);
    if (typeof updateMoney === "function") updateMoney(state.player.money);
    if (typeof updateProdBadges === "function") updateProdBadges();

    const buildSprite = BUILD_SPRITE || BUILD_SPRITE_LOCAL;

    for (let s=0; s<=(MAP_W-1)+(MAP_H-1); s++){
      for (let ty=0; ty<MAP_H; ty++){
        const tx=s-ty;
        if (!inMap(tx,ty)) continue;
        const i=idx(tx,ty);

        drawIsoTile(tx,ty,terrain[i]);

        const iVis = visible[TEAM.PLAYER][i];
        const iExp = explored[TEAM.PLAYER][i];

        if (!iExp || !iVis){
          const c = tileToWorldCenter(tx,ty);
          const p = worldToScreen(c.x,c.y);
          const x = p.x, y = p.y;
          const ox = ISO_X*cam.zoom, oy = ISO_Y*cam.zoom;

          const eps = 2.4*cam.zoom;
          if (!iExp){
            ctx.fillStyle = "rgba(0,0,0,1)";
          } else {
            ctx.fillStyle = "rgba(0,0,0,0.10)";
          }

          ctx.beginPath();
          ctx.moveTo(x, y-oy-eps);
          ctx.lineTo(x+ox+eps, y);
          ctx.lineTo(x, y+oy+eps);
          ctx.lineTo(x-ox-eps, y);
          ctx.closePath();
          ctx.fill();
        }
      }
    }

    if (state.build.active && state.build.kind){
      const kind=state.build.kind;
      const spec=BUILD[kind];
      const s = snapHoverToTileOrigin(kind);
      const tx=s.tx, ty=s.ty;
      const wpos=buildingWorldFromTileOrigin(tx,ty,spec.tw,spec.th);

      const ok = inBuildRadius(TEAM.PLAYER, wpos.cx, wpos.cy)
        && !isBlockedFootprint(tx,ty,spec.tw,spec.th);

      const ghost={tx,ty,tw:spec.tw,th:spec.th};
      const fp = footprintBlockedMask(tx,ty,spec.tw,spec.th);

      if (!inBuildRadius(TEAM.PLAYER, wpos.cx, wpos.cy)){
        fp.mask.fill(1);
        fp.blocked = true;
      }

      ctx.globalAlpha=0.62;
      drawFootprintTiles(
        tx, ty, spec.tw, spec.th,
        fp.mask,
        "rgba(120,255,170,0.22)", "rgba(255,120,120,0.22)",
        "rgba(120,255,170,0.78)", "rgba(255,120,120,0.78)"
      );
      ctx.globalAlpha=1;

      ctx.globalAlpha=0.78;
      drawFootprintDiamond(ghost, "rgba(0,0,0,0)", fp.blocked ? "rgba(255,120,120,0.90)" : "rgba(120,255,170,0.90)");
      ctx.globalAlpha=1;

      const dspec = DEFENSE[kind];
      if (dspec && dspec.range){
        const ringColor = state.colors.player;
        drawRangeEllipseWorld(wpos.cx, wpos.cy, dspec.range, ringColor, dspec.ring);
      }
    }

    if (state.selection && state.selection.size){
      for (const id of state.selection){
        const ent = getEntityById ? getEntityById(id) : null;
        if (!ent) continue;
        if (!BUILD[ent.kind]) continue;
        const dspec = DEFENSE[ent.kind];
        if (!dspec || !dspec.range) continue;
        const col = ent.team===TEAM.PLAYER ? state.colors.player : state.colors.enemy;
        drawRangeEllipseWorld(ent.x, ent.y, dspec.range, col, dspec.ring);
      }
    }

    updateInfDeathFx();
    updateSnipDeathFx();
    updateExp1Fxs();

    const drawables=[];
    for (const b of buildings) if (b.alive) drawables.push(b);
    for (const u of units) if (u.alive) drawables.push(u);
    for (let i=0;i<infDeathFxs.length;i++){
      const fx=infDeathFxs[i];
      if (!fx || !fx._rd) continue;
      drawables.push({ id: 9000000+i, kind: "_fx_inf_die", alive: true, team: fx.team, x: fx.x, y: fx.y, fxRef: fx });
    }
    for (let i=0;i<snipDeathFxs.length;i++){
      const fx=snipDeathFxs[i];
      if (!fx || !fx._rd) continue;
      drawables.push({ id: 9100000+i, kind: "_fx_snip_die", alive: true, team: fx.team, x: fx.x, y: fx.y, fxRef: fx });
    }

    drawables.sort((a,b)=>{
      const aIsB=!!BUILD[a.kind], bIsB=!!BUILD[b.kind];
      const aKey = aIsB ? ((a.tx + a.ty) + (a.tw + a.th - 2)) : ((a.x + a.y)/TILE);
      const bKey = bIsB ? ((b.tx + b.ty) + (b.tw + b.th - 2)) : ((b.x + b.y)/TILE);
      if (aKey !== bKey) return aKey - bKey;
      if (aIsB !== bIsB) return aIsB ? -1 : 1;
      return (a.id||0) - (b.id||0);
    });

    for (const ent of drawables){
      const isB=!!BUILD[ent.kind];
      const tx=isB?ent.tx:(ent.x/TILE)|0;
      const ty=isB?ent.ty:(ent.y/TILE)|0;
      let rX = ent.x, rY = ent.y;

      if (ent.team===TEAM.ENEMY && inMap(tx,ty) && !explored[TEAM.PLAYER][idx(tx,ty)]) continue;

      if (isB){
        if (ent.civ) continue;

        let fill="#1b2636", stroke="#2b3d55";
        if (ent.team===TEAM.PLAYER){ fill="rgba(10,40,70,0.9)"; stroke=state.colors.player; }
        if (ent.team===TEAM.ENEMY){  fill="rgba(70,10,10,0.9)"; stroke=state.colors.enemy; }

        if (buildSprite && buildSprite[ent.kind]){
          drawFootprintDiamond(ent, "rgba(0,0,0,0.22)", "rgba(0,0,0,0)");
          if (typeof drawBuildingSprite === "function") drawBuildingSprite(ent);
          else drawBuildingSpriteLocal(ent);
        } else if (window.PO && PO.buildings && PO.buildings.drawBuilding) {
          const helpers = { worldToScreen, ISO_X, ISO_Y, drawFootprintDiamond };
          const drew = PO.buildings.drawBuilding(ent, ctx, cam, helpers, state);
          if (!drew) drawFootprintPrism(ent, fill, stroke);
        } else {
          drawFootprintPrism(ent, fill, stroke);
        }

        if (ent.kind==="turret" && POWER && POWER.turretUse>0 && isUnderPower(ent.team)){
          const blink = (Math.floor(state.t*6)%2)===0;
          if (blink){
            drawFootprintPrism(ent, "rgba(0,0,0,0.55)", "rgba(0,0,0,0)");
          }
          const p2=worldToScreen(rX,rY);
          ctx.font=(16*cam.zoom).toFixed(0)+"px system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
          ctx.textAlign="center"; ctx.textBaseline="middle";
          ctx.fillStyle="rgba(255,235,120,0.95)";
          ctx.fillText("⚡", p2.x, p2.y-ISO_Y*0.25);
        }

        const p=worldToScreen(rX,rY);
        const z = (typeof cam !== "undefined" && cam && typeof cam.zoom==="number") ? cam.zoom : 1;
        const yy = p.y - (Math.max(ent.tw,ent.th)*ISO_Y*z) - 22*z;
        const showHp = (state.selection && state.selection.has(ent.id)) || (state.hover && state.hover.entId===ent.id);
        if (showHp) drawBuildingHpBlocks(ent);
        if (showHp) drawLabel(`${NAME_KO[ent.kind]||ent.kind}`, p.x, yy-14);
        if (ent.grp) drawGroupBadge(p.x + ISO_X*(ent.tw*0.55), yy-14, ent.grp);

        if (state.selection.has(ent.id)){
          if (typeof drawPrimaryBadgeForSelectedBuilding === "function") drawPrimaryBadgeForSelectedBuilding(ent);
          ctx.lineWidth=2;
          drawFootprintDiamond(ent, "rgba(0,0,0,0)", "rgba(255,255,255,0.9)");
        }
      } else {
        if (ent.kind==="_fx_inf_die"){ drawInfDeathFxOne(ent.fxRef); continue; }
        if (ent.kind==="_fx_snip_die"){ drawSnipDeathFxOne(ent.fxRef); continue; }
        if (ent.hidden || ent.inTransport) continue;
        if (ent.kind==="sniper" && ent.cloaked && ent.team===TEAM.ENEMY) continue;
        const p=worldToScreen(rX,rY);
        let c = (ent.team===TEAM.PLAYER) ? state.colors.player : state.colors.enemy;

        if (state.selection && state.selection.has(ent.id)) drawSelectionEllipseAt(ent);
        if (ent.kind==="harvester") c = (ent.team===TEAM.PLAYER) ? "#a0ffbf" : "#ffb0b0";
        if (ent.kind==="engineer") c = (ent.team===TEAM.PLAYER) ? "#b7a8ff" : "#ffb7d9";

        const isInfantry = (ent.kind==="infantry" && typeof INF_IMG!=="undefined" && INF_IMG && INF_IMG.complete && INF_IMG.naturalWidth>0);
        const isSnip = (ent.kind==="sniper" && typeof SNIP_IMG!=="undefined" && SNIP_IMG && SNIP_IMG.complete && SNIP_IMG.naturalWidth>0);
        const isInf = isInfantry || isSnip;
        const infDir = isInf ? (
          (ent.fireHoldT>0 && ent.fireDir!=null) ? ent.fireDir :
          (ent.faceDir!=null) ? ent.faceDir :
          (ent.order && (ent.order.type==="move" || ent.order.type==="attackmove" || ent.order.type==="attack") && (ent.order.x!=null) && (ent.order.y!=null))
            ? worldVecToDir8(ent.order.x - ent.x, ent.order.y - ent.y)
            : 6
        ) : 6;

        ctx.save();
        if (ent.kind==="sniper" && ent.team===TEAM.PLAYER && ent.cloaked) ctx.globalAlpha = 0.45;
        if (ent.flash && ent.flash>0){
          if (((state.t*28)|0)%2===0) ctx.globalAlpha *= 0.55;
          ctx.shadowColor = "rgba(255,255,255,0.9)";
          ctx.shadowBlur = 12;
        }
        if (!isInf){
          let drewSprite = false;
          if (ent.kind==="tank"){
            drewSprite = drawLiteTankSprite(ent, p);
          } else if (ent.kind==="harvester"){
            drewSprite = drawHarvesterSprite(ent, p);
          }
          if (!drewSprite){
            ctx.fillStyle=c;
            ctx.strokeStyle="rgba(0,0,0,0.4)";
            ctx.lineWidth=2;
            ctx.beginPath();
            ctx.arc(p.x,p.y,ent.r,0,Math.PI*2);
            ctx.fill(); ctx.stroke();
          }
        } else {
          let a = 1;
          if (ent.kind==="sniper" && ent.team===TEAM.PLAYER && ent.cloaked) a = 0.45;
          {
            if (ent.kind==="sniper"){
              const firing = ((ent.fireHoldT||0)>0);
              const isMoveOrder = !!(ent.order && (ent.order.type==="move" || ent.order.type==="attackmove"));
              const v2 = (ent.vx||0)*(ent.vx||0) + (ent.vy||0)*(ent.vy||0);
              const moving = isMoveOrder || v2 > 0.0004 || (ent.path && ent.path.length>0);
              if (!firing && moving){
                drawSniperMoveByDir(ctx, p.x, p.y, infDir, a, ent.team, state.t);
              } else {
                drawSniperSprite(ctx, p.x, p.y, infDir, a, ent.team);
              }
            } else {
              const firing = ((ent.fireHoldT||0)>0);
              const isMoveOrder = !!(ent.order && (ent.order.type==="move" || ent.order.type==="attackmove"));
              const v2 = (ent.vx||0)*(ent.vx||0) + (ent.vy||0)*(ent.vy||0);
              const moving = isMoveOrder || v2 > 0.0004 || (ent.path && ent.path.length>0);
              if (!firing && moving){
                if (infDir===0)      drawInfantryMoveEast(ctx, p.x, p.y, a, ent.team, state.t);
                else if (infDir===1) drawInfantryMoveNE(ctx, p.x, p.y, a, ent.team, state.t);
                else if (infDir===2) drawInfantryMoveN(ctx,  p.x, p.y, a, ent.team, state.t);
                else if (infDir===3) drawInfantryMoveNW(ctx, p.x, p.y, a, ent.team, state.t);
                else if (infDir===4) drawInfantryMoveW(ctx,  p.x, p.y, a, ent.team, state.t);
                else if (infDir===5) drawInfantryMoveSW(ctx, p.x, p.y, a, ent.team, state.t);
                else if (infDir===6) drawInfantryMoveS(ctx,  p.x, p.y, a, ent.team, state.t);
                else if (infDir===7) drawInfantryMoveSE(ctx, p.x, p.y, a, ent.team, state.t);
                else                 drawInfantrySprite(ctx, p.x, p.y, infDir, a, ent.team, firing);
              } else {
                drawInfantrySprite(ctx, p.x, p.y, infDir, a, ent.team, firing);
              }
            }
          }
        }

        if (ent.kind==="ifv"){
          const s=8;
          const x0=p.x - ent.r - 2;
          const y0=p.y + ent.r - s + 2;
          ctx.lineWidth=1.5;
          ctx.strokeStyle="rgba(255,255,255,0.85)";
          ctx.strokeRect(x0,y0,s,s);
          if (ent.passKind){
            let fc="rgba(255,255,255,0.0)";
            if (ent.passKind==="infantry") fc="rgba(255,60,60,0.95)";
            else if (ent.passKind==="engineer") fc="rgba(60,140,255,0.95)";
            else if (ent.passKind==="sniper") fc="rgba(255,220,60,0.95)";
            ctx.fillStyle=fc;
            ctx.fillRect(x0+1,y0+1,s-2,s-2);
          }
        }
        ctx.restore();
        const showHp = (state.selection && state.selection.has(ent.id)) || (state.hover && state.hover.entId===ent.id);
        if (showHp) drawUnitHpBlocks(ent, p);

        if (ent.grp) drawGroupBadge(p.x + ent.r*0.85, p.y - ent.r*0.85, ent.grp);

        if (ent.kind==="harvester"){
          const cr=clamp(ent.carry/(ent.carryMax||1),0,1);
          ctx.fillStyle="rgba(0,0,0,0.45)";
          ctx.fillRect(p.x-ent.r, p.y+ent.r+6, ent.r*2, 4);
          ctx.fillStyle="rgba(255,215,0,0.9)";
          ctx.fillRect(p.x-ent.r, p.y+ent.r+6, ent.r*2*cr, 4);
        }
      }
    }

    if (typeof drawWrenchFx === "function") drawWrenchFx();

    for (const bl of bullets){
      const p0=worldToScreen(bl.x,bl.y);

      if (bl.kind==="shell"){
        const t = Math.max(0, Math.min(1, bl.t||0));
        const z = Math.sin(Math.PI*t) * (bl.h||24);
        const p = {x:p0.x, y:p0.y - z};

        ctx.save();
        ctx.globalAlpha = 0.95;
        ctx.shadowBlur = 26;
        ctx.shadowColor = "rgba(255,180,70,1.0)";
        ctx.fillStyle = "rgba(255,210,110,0.95)";
        ctx.beginPath();
        ctx.arc(p.x, p.y, 3.6, 0, Math.PI*2);
        ctx.fill();

        ctx.shadowBlur = 0;
        ctx.fillStyle = "rgba(255,245,190,1.0)";
        ctx.beginPath();
        ctx.arc(p.x, p.y, 1.6, 0, Math.PI*2);
        ctx.fill();
        ctx.restore();
      } else if (bl.kind==="missile"){
        const p=p0;
        const a=(bl.team===TEAM.PLAYER) ? "rgba(150,220,255,0.95)" : "rgba(255,150,150,0.95)";
        ctx.strokeStyle=a;
        ctx.lineWidth=2;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - bl.vx*0.040, p.y - bl.vy*0.040);
        ctx.stroke();

        const ang = Math.atan2(bl.vy, bl.vx);
        const len = 8.5;
        const wid = 4.2;
        const hx = Math.cos(ang), hy = Math.sin(ang);
        const px = -hy, py = hx;

        ctx.fillStyle=a;
        ctx.beginPath();
        ctx.moveTo(p.x + hx*len, p.y + hy*len);
        ctx.lineTo(p.x - hx*len*0.55 + px*wid, p.y - hy*len*0.55 + py*wid);
        ctx.lineTo(p.x - hx*len*0.55 - px*wid, p.y - hy*len*0.55 - py*wid);
        ctx.closePath();
        ctx.fill();
      } else {
        const p=p0;
        ctx.fillStyle=(bl.team===TEAM.PLAYER) ? "rgba(150,220,255,0.9)" : "rgba(255,150,150,0.9)";
        ctx.fillRect(p.x-2,p.y-2,4,4);
      }
    }

    for (const tr of traces){
      if ((tr.delay||0) > 0) continue;
      const a=worldToScreen(tr.x0,tr.y0);
      const b=worldToScreen(tr.x1,tr.y1);
      let alpha;
      if (tr.kind === "snip"){
        alpha = Math.min(1, tr.life / (tr.maxLife ?? 0.80));
      } else {
        alpha = Math.min(1, tr.life / (tr.kind==="mg" ? 0.14 : 0.09));
      }
      ctx.globalAlpha = alpha;

      if (tr.kind === "mg"){
        ctx.save();
        ctx.lineCap = "round";
        ctx.globalAlpha = alpha*0.85;
        ctx.shadowBlur = 22;
        ctx.shadowColor = "rgba(255, 195, 80, 1.0)";
        ctx.strokeStyle = "rgba(255, 220, 120, 0.70)";
        ctx.lineWidth = 6.2;
        ctx.beginPath(); ctx.moveTo(a.x,a.y); ctx.lineTo(b.x,b.y); ctx.stroke();

        ctx.shadowBlur = 0;
        ctx.globalAlpha = alpha;
        ctx.strokeStyle = "rgba(255, 248, 185, 1.0)";
        ctx.lineWidth = 2.6;
        ctx.beginPath(); ctx.moveTo(a.x,a.y); ctx.lineTo(b.x,b.y); ctx.stroke();

        ctx.globalAlpha = alpha;
        ctx.fillStyle = "rgba(255, 245, 200, 1.0)";
        ctx.beginPath();
        ctx.arc(b.x, b.y, 2.2, 0, Math.PI*2);
        ctx.fill();

        ctx.restore();
      } else if (tr.kind === "tmg"){
        ctx.save();
        ctx.lineCap = "round";

        ctx.globalAlpha = alpha*0.95;
        ctx.shadowBlur = 34;
        ctx.shadowColor = "rgba(255, 170, 40, 1.0)";
        ctx.strokeStyle = "rgba(255, 210, 90, 0.85)";
        ctx.lineWidth = 10.5;
        ctx.beginPath(); ctx.moveTo(a.x,a.y); ctx.lineTo(b.x,b.y); ctx.stroke();

        ctx.shadowBlur = 0;
        ctx.globalAlpha = alpha;
        ctx.strokeStyle = "rgba(255, 250, 200, 1.0)";
        ctx.lineWidth = 4.8;
        ctx.beginPath(); ctx.moveTo(a.x,a.y); ctx.lineTo(b.x,b.y); ctx.stroke();

        ctx.globalAlpha = alpha;
        ctx.fillStyle = "rgba(255, 255, 220, 1.0)";
        ctx.beginPath(); ctx.arc(b.x, b.y, 3.0, 0, Math.PI*2); ctx.fill();

        ctx.restore();
      } else if (tr.kind === "snip"){
        ctx.save();
        ctx.lineCap = "round";
        const isP = (tr.team===TEAM.PLAYER);
        const glow = isP ? "rgba(0, 160, 255, 1.0)" : "rgba(255, 60, 60, 1.0)";
        const mid  = isP ? "rgba(0, 140, 255, 0.75)" : "rgba(255, 70, 70, 0.75)";
        const core = "rgba(255, 255, 255, 1.0)";

        ctx.globalAlpha = alpha*0.80;
        ctx.shadowBlur = 28;
        ctx.shadowColor = glow;
        ctx.strokeStyle = mid;
        ctx.lineWidth = 7.2;
        ctx.beginPath(); ctx.moveTo(a.x,a.y); ctx.lineTo(b.x,b.y); ctx.stroke();

        ctx.shadowBlur = 0;
        ctx.globalAlpha = alpha;
        ctx.strokeStyle = core;
        ctx.lineWidth = 3.2;
        ctx.beginPath(); ctx.moveTo(a.x,a.y); ctx.lineTo(b.x,b.y); ctx.stroke();

        ctx.globalAlpha = alpha;
        ctx.fillStyle = core;
        ctx.beginPath();
        ctx.arc(b.x, b.y, 3.2, 0, Math.PI*2);
        ctx.fill();

        ctx.restore();

      } else if (tr.kind === "impE"){
        const c = worldToScreen(tr.x0, tr.y0);
        const range = tr.fx?.range ?? 48;
        const px = worldToScreen(tr.x0 + range, tr.y0);
        const py = worldToScreen(tr.x0, tr.y0 + range);
        const rx = Math.abs(px.x - c.x);
        const ry = Math.abs(py.y - c.y);

        ctx.save();
        ctx.beginPath();
        ctx.ellipse(c.x, c.y, rx, ry, 0, 0, Math.PI*2);

        ctx.fillStyle = (tr.team===TEAM.PLAYER) ? "rgba(255, 200, 90, 0.16)" : "rgba(255, 200, 90, 0.16)";
        ctx.strokeStyle = "rgba(255, 210, 110, 0.88)";
        ctx.lineWidth = tr.fx?.strokeW ?? 4.6;
        ctx.shadowBlur = 22;
        ctx.shadowColor = "rgba(255, 170, 60, 1.0)";
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      } else {
        ctx.strokeStyle=(tr.team===TEAM.PLAYER) ? "rgba(255,255,255,0.85)" : "rgba(255,210,210,0.85)";
        ctx.lineWidth=1.6;
        ctx.beginPath(); ctx.moveTo(a.x,a.y); ctx.lineTo(b.x,b.y); ctx.stroke();
      }

      ctx.globalAlpha=1;
    }

    for (const f of flashes){
      if ((f.delay||0) > 0) continue;
      const p=worldToScreen(f.x,f.y);
      const a = Math.min(1, f.life/0.06);
      ctx.globalAlpha = a;
      const r = f.r;
      const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
      g.addColorStop(0, "rgba(255, 245, 200, 0.95)");
      g.addColorStop(0.25, "rgba(255, 220, 120, 0.55)");
      g.addColorStop(1, "rgba(255, 200, 80, 0.0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI*2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    try{ if (window.PO && PO.buildings && PO.buildings.drawGhosts){
      const helpers = { worldToScreen, ISO_X, ISO_Y, drawFootprintDiamond };
      PO.buildings.drawGhosts(ctx, cam, helpers, state);
    }}catch(_e){}

    if (typeof drawExplosions === "function") drawExplosions(ctx);
    if (typeof drawSmokeWaves === "function") drawSmokeWaves(ctx);
    if (typeof drawDustPuffs === "function") drawDustPuffs(ctx);
    if (typeof drawExp1Fxs === "function") drawExp1Fxs(ctx);
    if (typeof drawSmokePuffs === "function") drawSmokePuffs(ctx);
    if (typeof drawDmgSmokePuffs === "function") drawDmgSmokePuffs(ctx);

    for (const f of fires){
      const p = worldToScreen(f.x, f.y);
      const a = clamp(f.life/0.6, 0, 1);
      const z = (typeof cam !== "undefined" && cam && typeof cam.zoom==="number") ? cam.zoom : 1;
      ctx.globalAlpha = a;
      const h = (16 + f.rise*0.6) * z;
      ctx.fillStyle = "rgba(255, 120, 20, 0.95)";
      ctx.fillRect(p.x-1.6*z, p.y-h, 3.2*z, h);
      ctx.fillStyle = "rgba(255, 200, 80, 0.95)";
      ctx.fillRect(p.x-0.9*z, p.y-h*0.72, 1.8*z, h*0.72);
      ctx.globalAlpha = 1;
    }

    for (const p0 of impacts){
      const p=worldToScreen(p0.x,p0.y);
      ctx.globalAlpha = Math.min(1, p0.life/0.22);
      ctx.fillStyle = "rgba(255, 210, 90, 0.95)";
      ctx.fillRect(p.x-1.4, p.y-1.4, 2.8, 2.8);
      ctx.globalAlpha = 1;
    }

    if (typeof drawBlood === "function") drawBlood(ctx);

    for (const h of healMarks){
      const p = worldToScreen(h.x, h.y);
      const a = Math.min(1, h.life/0.45);
      const s = 10 + (1-a)*6;
      ctx.save();
      ctx.globalAlpha = a;
      ctx.strokeStyle = "rgba(255,255,255,0.85)";
      ctx.lineWidth = 3.2;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y - s);
      ctx.lineTo(p.x, p.y + s);
      ctx.moveTo(p.x - s, p.y);
      ctx.lineTo(p.x + s, p.y);
      ctx.stroke();
      ctx.strokeStyle = "rgba(220,40,40,0.95)";
      ctx.lineWidth = 2.0;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y - s);
      ctx.lineTo(p.x, p.y + s);
      ctx.moveTo(p.x - s, p.y);
      ctx.lineTo(p.x + s, p.y);
      ctx.stroke();
      ctx.restore();
    }

    for (const c of casings){
      if ((c.delay||0) > 0) continue;
      const p=worldToScreen(c.x, c.y);
      const y = p.y - (c.z||0)*0.18;
      const a = Math.min(1, c.life/0.35);
      ctx.save();
      ctx.globalAlpha = a*0.95;
      ctx.translate(p.x, y);
      ctx.rotate(c.rot||0);
      ctx.shadowBlur = 8;
      ctx.shadowColor = "rgba(255, 210, 110, 0.55)";
      ctx.fillStyle = "rgba(255, 200, 90, 0.95)";
      ctx.fillRect(-(c.w||4)/2, -(c.h||2)/2, (c.w||4), (c.h||2));
      ctx.restore();
      ctx.globalAlpha = 1;
    }

    if (typeof refreshPrimaryBuildingBadgesUI === "function") refreshPrimaryBuildingBadgesUI();
    if (typeof drawClickWaves === "function") drawClickWaves();
    if (typeof drawPathFx === "function") drawPathFx();
    if (typeof drawOrderFx === "function") drawOrderFx();
    if (typeof drawRallyPointsForSelection === "function") drawRallyPointsForSelection();
    if (typeof drawHoverNameTooltip === "function") drawHoverNameTooltip();

    if (state.drag.on && state.drag.moved){
      const r=rectFromDrag();
      ctx.strokeStyle="rgba(255,255,255,0.55)";
      ctx.lineWidth=1.5;
      ctx.strokeRect(r.x0,r.y0,r.x1-r.x0,r.y1-r.y0);
      ctx.fillStyle="rgba(255,255,255,0.06)";
      ctx.fillRect(r.x0,r.y0,r.x1-r.x0,r.y1-r.y0);
    }

    if (gameOver){
      ctx.fillStyle="rgba(0,0,0,0.55)";
      ctx.fillRect(0,0,W,H);
      ctx.fillStyle="#e6eef7";
      ctx.font="bold 44px system-ui";
      const msg="GAME OVER";
      ctx.fillText(msg, W/2-ctx.measureText(msg).width/2, H/2);
      ctx.font="16px system-ui";
      const sub="새로고침하면 재시작";
      ctx.fillText(sub, W/2-ctx.measureText(sub).width/2, H/2+28);
    }
  }

  function setTeamAccent(opts){
    if (!opts || typeof opts !== "object") return;
    if (opts.player && Array.isArray(opts.player)) TEAM_ACCENT.PLAYER = opts.player;
    if (opts.enemy  && Array.isArray(opts.enemy))  TEAM_ACCENT.ENEMY  = opts.enemy;
    if (opts.neutral && Array.isArray(opts.neutral)) TEAM_ACCENT.NEUTRAL = opts.neutral;
  }

  function clearTeamSpriteCache(){
    _teamSpriteCache.clear();
  }

  function clearInfTeamSheetCache(){
    INF_TEAM_SHEET_IDLE.clear();
    INF_TEAM_SHEET_ATK.clear();
    INF_TEAM_SHEET_DIE.clear();
    INF_TEAM_SHEET_MOV.clear();
    INF_TEAM_SHEET_MOV_NE.clear();
    INF_TEAM_SHEET_MOV_N.clear();
    INF_TEAM_SHEET_MOV_NW.clear();
    INF_TEAM_SHEET_MOV_W.clear();
    INF_TEAM_SHEET_MOV_SW.clear();
    INF_TEAM_SHEET_MOV_S.clear();
    INF_TEAM_SHEET_MOV_SE.clear();
    SNIP_TEAM_SHEET.clear();
    SNIP_TEAM_SHEET_MOV.clear();
    SNIP_TEAM_SHEET_MOV_NE.clear();
    SNIP_TEAM_SHEET_MOV_N.clear();
    SNIP_TEAM_SHEET_MOV_NW.clear();
    SNIP_TEAM_SHEET_MOV_W.clear();
    SNIP_TEAM_SHEET_MOV_SW.clear();
    SNIP_TEAM_SHEET_MOV_S.clear();
    SNIP_TEAM_SHEET_MOV_SE.clear();
    SNIP_DIE_TEAM_SHEET.clear();
  }

  function hexToRgbPublic(hex){
    return hexToRgb(hex);
  }

  function getBuildSpriteCfg(kind){
    const src = BUILD_SPRITE || BUILD_SPRITE_LOCAL;
    return (src && src[kind]) ? src[kind] : null;
  }

  function getBuildSpriteKinds(){
    const src = BUILD_SPRITE || BUILD_SPRITE_LOCAL;
    return src ? Object.keys(src) : [];
  }

  function adjustExp1Pivot(opts){
    if (!opts) return { x: EXP1_PIVOT_X, y: EXP1_PIVOT_Y, yOff: EXP1_Y_OFFSET };
    if (typeof opts.dx === "number") EXP1_PIVOT_X = clamp(EXP1_PIVOT_X + opts.dx, 0, 1);
    if (typeof opts.dy === "number") EXP1_PIVOT_Y = clamp(EXP1_PIVOT_Y + opts.dy, 0, 1);
    if (typeof opts.dyOff === "number") EXP1_Y_OFFSET = clamp(EXP1_Y_OFFSET + opts.dyOff, -200, 200);
    return { x: EXP1_PIVOT_X, y: EXP1_PIVOT_Y, yOff: EXP1_Y_OFFSET };
  }

  function resetExp1Pivot(){
    EXP1_PIVOT_X = 0.50; EXP1_PIVOT_Y = 0.52; EXP1_Y_OFFSET = -8;
    return { x: EXP1_PIVOT_X, y: EXP1_PIVOT_Y, yOff: EXP1_Y_OFFSET };
  }

  function isExp1Ready(){
    return !!(EXP1_FRAMES && EXP1_FRAMES.length);
  }

  function getExp1Frame0(){
    return (EXP1_FRAMES && EXP1_FRAMES.length) ? EXP1_FRAMES[0] : null;
  }

  window.OURender = window.OURender || {};
  window.OURender.drawMini = drawMini;
  window.OURender.draw = drawMain;
  window.OURender.setTeamAccent = setTeamAccent;
  window.OURender.clearTeamSpriteCache = clearTeamSpriteCache;
  window.OURender.clearInfTeamSheetCache = clearInfTeamSheetCache;
  window.OURender.hexToRgb = hexToRgbPublic;
  window.OURender.getBuildSpriteCfg = getBuildSpriteCfg;
  window.OURender.getBuildSpriteKinds = getBuildSpriteKinds;
  window.OURender.adjustExp1Pivot = adjustExp1Pivot;
  window.OURender.resetExp1Pivot = resetExp1Pivot;
  window.OURender.isExp1Ready = isExp1Ready;
  window.OURender.getExp1Frame0 = getExp1Frame0;
})();

