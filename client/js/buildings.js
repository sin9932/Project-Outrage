/*
  Barrack patch v25
  - 목표: '막사(barrack)'가 안 보이거나(아예 안 찍힘), 진영팔레트 미적용, 피벗 이상, 매각/파괴 애니 미재생 문제를 최대한 안전하게 보강.
  - 원칙: 기존 렌더/로직은 최대한 건드리지 않고, "있으면 후킹" + "없으면 우회".

  작동 방식
  1) atlas_tp가 준비되면 barrack atlases( normal / construct / destruct )를 "미리" 로드
  2) atlas 내 barrack_* 프레임에 pivot 강제 적용 (applyPivotByPrefix)
  3) atlasTP.drawFrame을 후킹해 barrack_* 프레임만:
     - pivot/scale 강제
     - (가능하면) 마젠타→팀컬러 치환한 캐시 텍스처로 그리기
  4) (가능하면) building 배열의 splice를 후킹해서 barrack가 제거되는 순간을 감지해
     - hp<=0 => destruct 애니 고스트
     - 그 외 => sell(construct 역재생) 고스트
     고스트는 requestAnimationFrame 후킹으로 매 프레임 위에 오버레이

  주의
  - game.js 구조가 바뀌어도 최대한 죽지 않게 "탐색" 위주로 짰다.
  - 그래도 매각/파괴는 엔진이 건물을 즉시 remove 해버리는 구조면 100% 완벽 보장 불가.
*/

(() => {
  'use strict';

  const TAG = '[barrack:v25]';
  const log = (...a) => console.log(TAG, ...a);
  const warn = (...a) => console.warn(TAG, ...a);

  const PO = (window.PO = window.PO || {});
  PO.buildings = PO.buildings || {};

  // --- user-tweakable via localStorage (선택)
  // localStorage.setItem('po_barrack_scale','0.14')
  // localStorage.setItem('po_barrack_pivot_x','0.4955')
  // localStorage.setItem('po_barrack_pivot_y','0.4370')
  function numLS(key, fallback) {
    const v = localStorage.getItem(key);
    const n = v == null ? NaN : parseFloat(v);
    return Number.isFinite(n) ? n : fallback;
  }

  const CFG = {
    scale: numLS('po_barrack_scale', 0.14),
    pivot: {
      x: numLS('po_barrack_pivot_x', 0.4955),
      y: numLS('po_barrack_pivot_y', 0.4370),
    },
    // 프레임 속도(추정). 엔진이 다른 FPS로 돌면 고스트가 빠르거나 느릴 수 있음.
    ghostFps: numLS('po_barrack_ghost_fps', 12),
  };

  // --- internal state
  const S = {
    loaded: false,
    loading: false,
    failed: false,
    atlases: { normal: null, construct: null, destruct: null },
    frames: { normal: [], construct: [], destruct: [] },

    drawFramePatched: false,
    rafPatched: false,

    // 고스트
    ghosts: [],
    lastCtx: null,
    lastCanvas: null,

    // splice patch
    splicePatched: false,
    splicedArrays: new WeakSet(),

    // tint cache: key = atlasId|frame|hex
    tintCache: new Map(),

    // diagnostics
    didReportNoAtlasTP: false,
    didReportNoBuildArray: false,
  };

  function isBarrackEnt(ent) {
    if (!ent || typeof ent !== 'object') return false;
    const k = (ent.kind || ent.type || ent.name || ent.unitType || '').toString().toLowerCase();
    return k === 'barrack' || k === 'barracks' || k.includes('barrack');
  }

  function getAtlasTP() {
    return (PO.atlasTP || window.atlasTP || null);
  }

  function safeToString(fn) {
    try { return Function.prototype.toString.call(fn); } catch { return ''; }
  }

  function clamp01(v) {
    if (!Number.isFinite(v)) return 0;
    return Math.max(0, Math.min(1, v));
  }

  function normalizeHex(color) {
    if (color == null) return null;
    if (typeof color === 'number') {
      const s = color.toString(16).padStart(6, '0');
      return '#' + s;
    }
    if (typeof color === 'string') {
      const s = color.trim();
      if (/^#[0-9a-fA-F]{6}$/.test(s)) return s;
      if (/^[0-9a-fA-F]{6}$/.test(s)) return '#' + s;
      // css rgb(...) 형태 등은 여기서 변환 안 함(확실하지 않음)
      return null;
    }
    return null;
  }

  function getTeamIndexFromOpts(opts) {
    if (!opts || typeof opts !== 'object') return null;
    const t = opts.team ?? opts.teamIdx ?? opts.owner ?? opts.side ?? opts.faction ?? null;
    if (typeof t === 'number' && Number.isFinite(t)) return t;
    if (typeof t === 'string') {
      const s = t.toLowerCase();
      if (s === 'p' || s === 'player' || s === 'blue') return 0;
      if (s === 'e' || s === 'enemy' || s === 'red') return 1;
    }
    return null;
  }

  function getTeamHexFromRuntime(teamIdx) {
    // 1) opts에 이미 hex가 있으면 그게 1순위지만, 여기선 runtime 추정만
    const g = PO.game || {};
    const candidates = [
      g.teamColors,
      g.factionColors,
      g.colors,
      g.palette,
      PO.teamColors,
      PO.colors,
    ].filter(Boolean);

    for (const obj of candidates) {
      if (Array.isArray(obj) && teamIdx != null && obj[teamIdx]) {
        const hex = normalizeHex(obj[teamIdx]);
        if (hex) return hex;
      }
      if (obj && typeof obj === 'object') {
        if (teamIdx === 0) {
          const hex = normalizeHex(obj.player || obj.p || obj.blue || obj.me || obj.self);
          if (hex) return hex;
        }
        if (teamIdx === 1) {
          const hex = normalizeHex(obj.enemy || obj.e || obj.red || obj.opponent);
          if (hex) return hex;
        }
      }
    }

    // 2) localStorage에 저장돼 있을 수도 있음(있으면 사용)
    if (teamIdx === 0) {
      const hex = normalizeHex(localStorage.getItem('po_player_color') || localStorage.getItem('po_player_color_hex'));
      if (hex) return hex;
    }
    if (teamIdx === 1) {
      const hex = normalizeHex(localStorage.getItem('po_enemy_color') || localStorage.getItem('po_enemy_color_hex'));
      if (hex) return hex;
    }

    return null;
  }

  function inferTeamHex(opts) {
    if (!opts || typeof opts !== 'object') return null;

    const direct = normalizeHex(
      opts.teamHex || opts.teamColor || opts.tintHex || opts.tint || opts.color || opts.hex
    );
    if (direct) return direct;

    const teamIdx = getTeamIndexFromOpts(opts);
    if (teamIdx != null) {
      const runtimeHex = getTeamHexFromRuntime(teamIdx);
      if (runtimeHex) return runtimeHex;
    }

    // 마지막 fallback: 팀 정보가 아예 없으면 "내 컬러"로만 칠해버리면 적 막사도 같은 색이 돼서 위험.
    // 그래서 여기선 null로 두고 '팔레트 못 칠함'으로 둔다.
    return null;
  }

  function buildFrameList(atlas, prefix) {
    if (!atlas || !atlas.frames) return [];
    const keys = Object.keys(atlas.frames).filter(k => k.startsWith(prefix));
    // 숫자 suffix 기준 정렬 (ex: barrack_const_0..n)
    keys.sort((a, b) => {
      const na = parseInt((a.match(/(\d+)(?!.*\d)/) || [])[1] || '0', 10);
      const nb = parseInt((b.match(/(\d+)(?!.*\d)/) || [])[1] || '0', 10);
      if (na !== nb) return na - nb;
      return a.localeCompare(b);
    });
    return keys;
  }

  function applyPivotLocal(atlas, prefix, pivot) {
    if (!atlas || !atlas.frames) return;
    for (const [k, fr] of Object.entries(atlas.frames)) {
      if (!k.startsWith(prefix) || !fr) continue;
      fr.pivot = { x: clamp01(pivot.x), y: clamp01(pivot.y) };
    }
  }

  async function loadBarrackAtlases() {
    if (S.loaded || S.loading || S.failed) return;

    const ATP = getAtlasTP();
    if (!ATP || typeof ATP.loadTPAtlasMulti !== 'function') {
      if (!S.didReportNoAtlasTP) {
        S.didReportNoAtlasTP = true;
        warn('atlasTP not ready yet; will retry');
      }
      return;
    }

    S.loading = true;
    const basePaths = ['asset/sprite/const', 'client/asset/sprite/const'];

    try {
      const [normal, construct, destruct] = await Promise.all([
        ATP.loadTPAtlasMulti(basePaths.map(b => `${b}/normal/barrack`)),
        ATP.loadTPAtlasMulti(basePaths.map(b => `${b}/const_anim/barrack`)),
        ATP.loadTPAtlasMulti(basePaths.map(b => `${b}/destruct/barrack`)),
      ]);

      S.atlases.normal = normal;
      S.atlases.construct = construct;
      S.atlases.destruct = destruct;

      // pivot 강제 적용 (가능하면 atlasTP helper 사용)
      if (typeof ATP.applyPivotByPrefix === 'function') {
        ATP.applyPivotByPrefix(normal, 'barrack_', CFG.pivot);
        ATP.applyPivotByPrefix(construct, 'barrack_', CFG.pivot);
        ATP.applyPivotByPrefix(destruct, 'barrack_', CFG.pivot);
      } else {
        applyPivotLocal(normal, 'barrack_', CFG.pivot);
        applyPivotLocal(construct, 'barrack_', CFG.pivot);
        applyPivotLocal(destruct, 'barrack_', CFG.pivot);
      }

      // 프레임 목록 캐시
      S.frames.normal = buildFrameList(normal, 'barrack_');
      S.frames.construct = buildFrameList(construct, 'barrack_');
      S.frames.destruct = buildFrameList(destruct, 'barrack_');

      S.loaded = true;
      log('atlases loaded', {
        normal: S.frames.normal.length,
        construct: S.frames.construct.length,
        destruct: S.frames.destruct.length,
      });
    } catch (e) {
      S.failed = true;
      warn('atlas load failed', e);
    } finally {
      S.loading = false;
    }
  }

  // --- TINTED DRAW (magenta -> team color)
  function hexToRgb(hex) {
    const h = normalizeHex(hex);
    if (!h) return null;
    const n = parseInt(h.slice(1), 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }

  function isMagenta(r, g, b) {
    // 사용자가 요구한 "마젠타" 기준을 넓게 잡음
    return (r > 190 && b > 190 && g < 110);
  }

  function buildTintedCanvas(atlas, frameName, teamHex) {
    const ATP = getAtlasTP();
    if (!ATP) return null;

    const frame = atlas?.frames?.[frameName];
    const img = atlas?.image || atlas?.img || atlas?.texture || null;
    if (!frame || !img) return null;

    // frame rect
    const rect = frame.frame || frame.rect || frame;
    const sx = rect.x ?? rect.sx;
    const sy = rect.y ?? rect.sy;
    const sw = rect.w ?? rect.width ?? rect.sw;
    const sh = rect.h ?? rect.height ?? rect.sh;
    if (![sx, sy, sw, sh].every(Number.isFinite)) return null;

    const key = `${img.src || 'img'}|${frameName}|${teamHex}`;
    if (S.tintCache.has(key)) return S.tintCache.get(key);

    const cvs = document.createElement('canvas');
    cvs.width = sw;
    cvs.height = sh;
    const cctx = cvs.getContext('2d', { willReadFrequently: true });
    if (!cctx) return null;

    cctx.clearRect(0, 0, sw, sh);
    cctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);

    const imgData = cctx.getImageData(0, 0, sw, sh);
    const data = imgData.data;
    const rgb = hexToRgb(teamHex);
    if (!rgb) return null;

    for (let i = 0; i < data.length; i += 4) {
      const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];
      if (a === 0) continue;
      if (isMagenta(r, g, b)) {
        data[i] = rgb.r;
        data[i + 1] = rgb.g;
        data[i + 2] = rgb.b;
      }
    }

    cctx.putImageData(imgData, 0, 0);
    S.tintCache.set(key, cvs);
    return cvs;
  }

  function drawFrameTinted(ctx, atlas, frameName, dx, dy, opts, teamHex) {
    const ATP = getAtlasTP();
    if (!ATP) return false;

    const fr = atlas?.frames?.[frameName];
    const img = atlas?.image || atlas?.img || atlas?.texture || null;
    if (!fr || !img) return false;

    const rect = fr.frame || fr.rect || fr;
    const sx = rect.x ?? rect.sx;
    const sy = rect.y ?? rect.sy;
    const sw = rect.w ?? rect.width ?? rect.sw;
    const sh = rect.h ?? rect.height ?? rect.sh;
    if (![sx, sy, sw, sh].every(Number.isFinite)) return false;

    const scale = (opts && Number.isFinite(opts.scale)) ? opts.scale : 1;
    const alpha = (opts && Number.isFinite(opts.alpha)) ? opts.alpha : 1;

    const pivot = (opts && opts.pivot) ? opts.pivot : (fr.pivot || { x: 0.5, y: 0.5 });

    const srcCanvas = buildTintedCanvas(atlas, frameName, teamHex);
    if (!srcCanvas) return false;

    const dw = sw * scale;
    const dh = sh * scale;
    const ox = (pivot.x * dw);
    const oy = (pivot.y * dh);

    ctx.save();
    if (alpha !== 1) ctx.globalAlpha *= alpha;
    ctx.drawImage(srcCanvas, 0, 0, sw, sh, dx - ox, dy - oy, dw, dh);
    ctx.restore();

    return true;
  }

  // --- Patch atlasTP.drawFrame
  function patchDrawFrame() {
    if (S.drawFramePatched) return;
    const ATP = getAtlasTP();
    if (!ATP || typeof ATP.drawFrame !== 'function') return;

    const orig = ATP.drawFrame.bind(ATP);

    ATP.drawFrame = function patchedDrawFrame(ctx, atlas, frameName, dx, dy, opts) {
      try {
        if (typeof frameName === 'string' && frameName.startsWith('barrack_')) {
          // barrack는 이 쪽에서만 강제로 세팅 (엔진의 opts가 이상해도 여기서 맞춘다)
          const o = Object.assign({}, opts || {});
          o.pivot = CFG.pivot;
          o.scale = CFG.scale;

          const teamHex = inferTeamHex(o);
          if (teamHex) {
            const ok = drawFrameTinted(ctx, atlas, frameName, dx, dy, o, teamHex);
            if (ok) return;
          }

          // 팀컬러를 못 구하면 그냥 원본(팔레트 미적용)으로라도 그림
          return orig(ctx, atlas, frameName, dx, dy, o);
        }
      } catch (e) {
        warn('drawFrame patch error', e);
      }

      return orig(ctx, atlas, frameName, dx, dy, opts);
    };

    S.drawFramePatched = true;
    log('patched atlasTP.drawFrame');
  }

  // --- Find building arrays & patch splice to detect removals
  function looksLikeBuilding(obj) {
    if (!obj || typeof obj !== 'object') return false;
    const hasHP = ('hp' in obj) || ('health' in obj);
    const hasPos = ('tx' in obj) || ('ty' in obj) || ('x' in obj) || ('y' in obj) || ('pos' in obj);
    const hasKind = ('kind' in obj) || ('type' in obj) || ('name' in obj);
    return hasPos && hasKind && hasHP;
  }

  function collectCandidateArrays() {
    const out = [];
    const game = PO.game || {};

    // 1) 흔한 키
    const directKeys = ['buildings', 'blds', 'structures', 'structs', 'ents', 'entities'];
    for (const k of directKeys) {
      const v = game[k];
      if (Array.isArray(v)) out.push({ where: `PO.game.${k}`, arr: v });
    }

    // 2) shallow scan PO.game
    for (const [k, v] of Object.entries(game)) {
      if (!Array.isArray(v)) continue;
      const lk = k.toLowerCase();
      if (lk.includes('build') || lk.includes('struct')) out.push({ where: `PO.game.${k}`, arr: v });
    }

    // 3) shallow scan PO
    for (const [k, v] of Object.entries(PO)) {
      if (!Array.isArray(v)) continue;
      const lk = k.toLowerCase();
      if (lk.includes('build') || lk.includes('struct')) out.push({ where: `PO.${k}`, arr: v });
    }

    // de-dup by reference
    const seen = new WeakSet();
    return out.filter(x => {
      if (seen.has(x.arr)) return false;
      seen.add(x.arr);
      return true;
    });
  }

  function startGhostFromRemoved(ent) {
    if (!ent) return;

    // reason 추정
    const hp = (typeof ent.hp === 'number') ? ent.hp : (typeof ent.health === 'number' ? ent.health : null);
    const reason = (hp != null && hp <= 0) ? 'destroy' : 'sell';

    // 좌표 추정
    const tx = (ent.tx ?? ent.tileX ?? ent.gx ?? ent.x ?? ent.pos?.x ?? null);
    const ty = (ent.ty ?? ent.tileY ?? ent.gy ?? ent.y ?? ent.pos?.y ?? null);

    if (!(Number.isFinite(tx) && Number.isFinite(ty))) {
      // 위치를 못 잡으면 고스트도 못 그림
      warn('ghost skipped: cannot infer position', { tx, ty, ent });
      return;
    }

    const now = performance.now();
    S.ghosts.push({
      kind: 'barrack',
      reason,
      tx, ty,
      start: now,
      // duration은 프레임 수 기반으로 추정
      durationMs: 1000 * (reason === 'destroy' ? Math.max(1, S.frames.destruct.length) : Math.max(1, S.frames.construct.length)) / CFG.ghostFps,
    });

    log('ghost spawned', reason, { tx, ty, hp });
  }

  function patchArraySplice(arr, where) {
    if (!Array.isArray(arr) || S.splicedArrays.has(arr)) return;

    // 건물 배열인지 대충 확인(너무 오탐하면 위험)
    const sample = arr.slice(0, 30).filter(Boolean);
    const buildingLike = sample.some(looksLikeBuilding);
    if (!buildingLike) return;

    const orig = arr.splice.bind(arr);
    arr.splice = function patchedSplice(start, delCount, ...items) {
      const removed = orig(start, delCount, ...items);
      try {
        if (Array.isArray(removed) && removed.length) {
          for (const ent of removed) {
            if (isBarrackEnt(ent)) startGhostFromRemoved(ent);
          }
        }
      } catch (e) {
        warn('splice hook error', e);
      }
      return removed;
    };

    S.splicedArrays.add(arr);
    log('patched splice on', where);
  }

  function patchBuildingRemovalDetection() {
    if (S.splicePatched) return;

    const candidates = collectCandidateArrays();
    let patchedAny = false;

    for (const c of candidates) {
      patchArraySplice(c.arr, c.where);
      if (S.splicedArrays.has(c.arr)) patchedAny = true;
    }

    if (!patchedAny && !S.didReportNoBuildArray) {
      S.didReportNoBuildArray = true;
      warn('no building-like arrays found yet; will retry');
    }

    // 계속 새 배열로 갈아끼우는 코드가 있을 수 있어서, 완전 true로 잠그지 않고 재시도는 남김
    if (patchedAny) S.splicePatched = true;
  }

  // --- Ghost drawing
  function getMainCtx() {
    if (S.lastCtx && S.lastCanvas && document.contains(S.lastCanvas)) return S.lastCtx;
    const c = document.getElementById('c');
    if (!c) return null;
    const ctx = c.getContext('2d');
    if (!ctx) return null;
    S.lastCanvas = c;
    S.lastCtx = ctx;
    return ctx;
  }

  function getWorldToScreen() {
    const g = PO.game || {};
    const h = g.helpers || g.helper || g;

    const fn = h.worldToScreen || g.worldToScreen || window.worldToScreen || window.isoToScreen || null;
    if (typeof fn === 'function') return fn;

    // fallback (확실하지 않음): 타일 크기 추정
    const tw = g.TILE_W || g.tileW || 64;
    const th = g.TILE_H || g.tileH || 32;
    return function fallbackW2S(tx, ty) {
      // iso diamond 기본
      const x = (tx - ty) * (tw / 2);
      const y = (tx + ty) * (th / 2);
      return { x, y };
    };
  }

  function pickGhostFrame(ghost, tNow) {
    if (!S.loaded) return null;

    const elapsed = Math.max(0, tNow - ghost.start);
    const progress = ghost.durationMs > 0 ? Math.min(1, elapsed / ghost.durationMs) : 1;

    if (ghost.reason === 'destroy') {
      const list = S.frames.destruct;
      if (!list.length) return null;
      const idx = Math.min(list.length - 1, Math.floor(progress * list.length));
      return { atlas: S.atlases.destruct, frame: list[idx], done: idx >= list.length - 1 };
    }

    // sell: construct 역재생
    const list = S.frames.construct;
    if (!list.length) return null;
    const idxFwd = Math.min(list.length - 1, Math.floor(progress * list.length));
    const idx = Math.max(0, (list.length - 1) - idxFwd);
    return { atlas: S.atlases.construct, frame: list[idx], done: idxFwd >= list.length - 1 };
  }

  function drawGhosts(tNow) {
    if (!S.ghosts.length) return;
    if (!S.loaded) return;

    const ctx = getMainCtx();
    if (!ctx) return;

    const ATP = getAtlasTP();
    if (!ATP || typeof ATP.drawFrame !== 'function') return;

    const w2s = getWorldToScreen();

    const alive = [];
    for (const g of S.ghosts) {
      const fr = pickGhostFrame(g, tNow);
      if (!fr) continue;

      const p = w2s(g.tx, g.ty);
      const dx = p?.x;
      const dy = p?.y;
      if (!(Number.isFinite(dx) && Number.isFinite(dy))) continue;

      // "원래 건물"과 동일한 스케일/피벗로 그려야 어긋남이 없다.
      ATP.drawFrame(ctx, fr.atlas, fr.frame, dx, dy, { scale: CFG.scale, pivot: CFG.pivot, alpha: 1 });

      if (!fr.done) alive.push(g);
    }

    S.ghosts = alive;
  }

  function patchRAF() {
    if (S.rafPatched) return;
    if (typeof window.requestAnimationFrame !== 'function') return;

    const orig = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = function patchedRAF(cb) {
      return orig(function (t) {
        cb(t);
        try {
          drawGhosts(t);
        } catch (e) {
          // ghost는 실패해도 게임은 살아야 함
        }
      });
    };

    S.rafPatched = true;
    log('patched requestAnimationFrame (ghost overlay)');
  }

  // --- bootstrap
  function tickInstall() {
    // 1) atlas 로드 시도
    loadBarrackAtlases();

    // 2) drawFrame 패치
    patchDrawFrame();

    // 3) 매각/파괴 감지(배열 splice)
    patchBuildingRemovalDetection();

    // 4) 고스트 오버레이
    patchRAF();

    // 완전 준비되면 더 느슨하게
    const done = (S.loaded || S.failed) && S.drawFramePatched && S.rafPatched;
    if (done) return true;
    return false;
  }

  log('script loaded');

  // 처음엔 빠르게(200ms), 이후 안정되면 1초로
  let tries = 0;
  const fast = setInterval(() => {
    tries += 1;
    const ok = tickInstall();
    if (ok || tries > 60) {
      clearInterval(fast);
      // 느린 헬스체크: 엔진이 배열을 갈아끼우는 경우 대비
      setInterval(() => {
        try {
          patchBuildingRemovalDetection();
        } catch {}
      }, 1000);
      if (!ok) warn('install incomplete (some hooks missing). game still runs.');
    }
  }, 200);
})();
