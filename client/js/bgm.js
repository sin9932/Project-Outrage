// bgm.js
// - Standalone BGM player (shuffle / repeat / prev-next / UI adapter)

(function (global) {
  "use strict";

  const OUBGM = global.OUBGM || (global.OUBGM = {});

  OUBGM.create = function create(env) {
    env = env || {};
    const tracks = Array.isArray(env.tracks) ? env.tracks.slice() : [];

    const audio = new Audio();
    audio.preload = "auto";
    audio.loop = false; // we advance manually
    audio.volume = 0.70;

    // WebAudio analyser (for EQ bars). Created on user gesture.
    let _ctx = null;
    let _analyser = null;
    let _freq = null;

    function ensureAnalyser(){
      if (_analyser) return;
      const AC = global.AudioContext || global.webkitAudioContext;
      if (!AC) return;
      try {
        _ctx = new AC();
        const src = _ctx.createMediaElementSource(audio);
        _analyser = _ctx.createAnalyser();
        _analyser.fftSize = 64; // 32 bins
        _freq = new Uint8Array(_analyser.frequencyBinCount);
        src.connect(_analyser);
        _analyser.connect(_ctx.destination);
      } catch(e) {
        console.warn("[BGM] analyser init failed", e);
        _ctx = null; _analyser = null; _freq = null;
      }
    }

    function resumeCtx(){
      try { if (_ctx && _ctx.state === "suspended") _ctx.resume(); } catch(_e){}
    }

    const state = {
      order: [],
      idx: 0,
      shuffle: true,
      repeat: "all", // "none" | "all" | "one"
      fade: { active:false, t:0, dur:0.55, from:0, to:0, nextSrc:null },
      viz:  { t:0 },
    };

    function shuffle(arr){
      for (let i=arr.length-1;i>0;i--) {
        const j = (Math.random()*(i+1))|0;
        const t = arr[i]; arr[i]=arr[j]; arr[j]=t;
      }
      return arr;
    }

    function rebuildOrder(keepCurrent=true){
      const base = tracks.slice();
      state.order = state.shuffle ? shuffle(base) : base;
      state.idx = 0;
      if (keepCurrent && audio.src){
        const curIdx = state.order.findIndex(t => audio.src.endsWith(t));
        if (curIdx >= 0) state.idx = curIdx + 1;
      }
    }

    function getNextTrack(){
      if (!state.order.length) rebuildOrder(false);
      if (state.idx >= state.order.length){
        if (state.repeat === "all"){
          state.idx = 0;
        } else if (state.repeat === "none"){
          return "";
        } else if (state.repeat === "one"){
          return audio.src || "";
        }
      }
      const tr = state.order[state.idx++] || "";
      return tr;
    }

    function setTrackNow(src){
      if (!src) return;
      ensureAnalyser();
      resumeCtx();
      if (audio.src !== src) audio.src = src;
      try { audio.currentTime = 0; } catch(_e){}
      audio.play().catch(()=>{ /* autoplay policy, ignore */ });
    }

    function fadeToTrack(nextSrc) {
      if (!nextSrc) return;
      ensureAnalyser();
      resumeCtx();

      // If nothing is playing yet, just start.
      if (!audio.src) {
        setTrackNow(nextSrc);
        return;
      }

      // Start fade out
      state.fade.active = true;
      state.fade.t = 0;
      state.fade.from = audio.volume;
      state.fade.to = 0;
      state.fade.nextSrc = nextSrc;
    }

    function applyFade(dt){
      if (!state.fade.active) return;
      state.fade.t += dt;
      const a = Math.min(1, state.fade.t / Math.max(0.001, state.fade.dur));
      const v = state.fade.from + (state.fade.to - state.fade.from) * a;
      audio.volume = Math.max(0, Math.min(1, v));

      if (a >= 1) {
        if (state.fade.to === 0 && state.fade.nextSrc) {
          // switch track at silence, then fade in
          const next = state.fade.nextSrc;
          state.fade.nextSrc = null;
          try { audio.pause(); } catch(_e){}
          audio.src = next;
          try { audio.currentTime = 0; } catch(_e){}
          audio.play().catch(()=>{});
          state.fade.from = 0;
          state.fade.to = (global.__bgmUserVol!=null) ? global.__bgmUserVol : 0.55;
          state.fade.t = 0;
        } else {
          // finished fade in
          state.fade.active = false;
          // re-apply user volume
          if (global.__bgmUserVol!=null) audio.volume = global.__bgmUserVol;
        }
      }
    }

    function setVol(v){
      const vv = Math.max(0, Math.min(1, Number(v)||0));
      audio.volume = vv;
      updateUI();
    }

    // Manual controls
    function next(){
      if (state.repeat === "one"){
        if (audio.src) setTrackNow(audio.src);
        return;
      }
      const tr = getNextTrack();
      if (!tr){ audio.pause(); updateUI(); return; }
      fadeToTrack(tr);
      updateUI();
    }
    function prev(){
      if (!state.order.length) rebuildOrder(true);
      if (state.order.length){
        state.idx = Math.max(0, state.idx-2);
        const tr = getNextTrack();
        if (tr) fadeToTrack(tr);
      }
      updateUI();
    }
    function toggle(){
      ensureAnalyser();
      resumeCtx();
      if (audio.paused) audio.play().catch(()=>{}); else audio.pause();
      updateUI();
    }
    function toggleShuffle(){
      state.shuffle = !state.shuffle;
      rebuildOrder(true);
      updateUI();
    }
    function toggleRepeat(){
      const cur = state.repeat;
      state.repeat = (cur === "none") ? "all" : (cur === "all" ? "one" : "none");
      updateUI();
    }

    // UI wiring (adapter provided by ou_ui.js)
    let ui = null; // adapter
    function mountUI(adapter){
      ui = adapter || null;
      if (ui && typeof ui.init === "function") ui.init();
      updateUI();
    }

    function prettyName(){
      const raw = audio.src ? audio.src.split("/").pop() : "";
      return raw ? raw.replace(/\.[^/.]+$/,"") : "";
    }

    function updateUI(){
      if (!ui) return;
      if (typeof ui.setTrack === "function") ui.setTrack(prettyName() || "(none)");
      if (typeof ui.setPlay === "function") ui.setPlay(!audio.paused);
      if (typeof ui.setVol === "function") ui.setVol((global.__bgmUserVol!=null?global.__bgmUserVol:audio.volume));
      if (typeof ui.setTime === "function") ui.setTime(audio.currentTime, audio.duration);
      if (typeof ui.setShuffle === "function") ui.setShuffle(!!state.shuffle);
      if (typeof ui.setRepeat === "function") ui.setRepeat(state.repeat);
    }

    function updateViz(dt){
      if (!ui) return;
      if (typeof ui.setTime === "function") ui.setTime(audio.currentTime, audio.duration);
      if (typeof ui.setEqBars !== "function" && typeof ui.setEqIdle !== "function") return;

      // animate at ~20fps
      state.viz.t += dt;
      if (state.viz.t < 0.05) return;
      state.viz.t = 0;

      if (!_analyser || !_freq) {
        const bars = ui.getEqCount ? ui.getEqCount() : 12;
        const vals = [];
        for (let i=0;i<bars;i++) vals.push(0.25 + 0.55*Math.random());
        if (typeof ui.setEqIdle === "function") ui.setEqIdle(vals);
        return;
      }

      try {
        _analyser.getByteFrequencyData(_freq);
        const bars = ui.getEqCount ? ui.getEqCount() : 12;
        const bins = _freq.length || 1;
        const vals = [];
        for (let i=0;i<bars;i++) {
          const bi = Math.min(bins-1, Math.floor(i * bins / bars));
          const v = _freq[bi] / 255;
          const vv = Math.max(0.06, Math.min(1, Math.pow(v, 0.55) * 1.65));
          vals.push(vv);
        }
        if (typeof ui.setEqBars === "function") ui.setEqBars(vals);
      } catch(_e) {}
    }

    function start(){
      // called on user gesture via shim (userStart)
      ensureAnalyser();
      resumeCtx();
      rebuildOrder(false);
      const tr = getNextTrack();
      setTrackNow(tr);
      updateUI();
    }

    function monitor(dt=0.016){
      applyFade(dt);
      updateViz(dt);

      // Auto advance when track ends
      if (audio.ended && !state.fade.active){
        if (state.repeat === "one" && audio.src){
          setTrackNow(audio.src);
        } else {
          const tr = getNextTrack();
          if (tr) setTrackNow(tr);
          else audio.pause();
        }
        updateUI();
      }
    }

    audio.addEventListener("ended", ()=>{ /* monitor() handles */ });

    const api = {
      audio,
      start,
      next,
      prev,
      toggle,
      setVol,
      monitor,
      mountUI,
      toggleShuffle,
      toggleRepeat
    };

    // Compatibility shims
    api._started = false;
    Object.defineProperty(api, "started", { get(){ return !!api._started; }});
    Object.defineProperty(api, "master", {
      get(){ return (global.__bgmUserVol!=null) ? global.__bgmUserVol : api.audio.volume; },
      set(v){ global.__bgmUserVol = Math.max(0, Math.min(1, Number(v)||0)); api.setVol(global.__bgmUserVol); }
    });
    Object.defineProperty(api, "trackName", {
      get(){ return api.audio.src ? api.audio.src.split("/").pop() : ""; }
    });
    api.userStart = () => { if (api._started) return; api._started = true; api.start(); };
    api.togglePlay = () => { api.toggle(); };
    api.setMasterVolume = (v) => { api.master = v; };
    api.stopAll = () => { try{ api.audio.pause(); api.audio.currentTime = 0; }catch(e){} };

    return api;
  };
})(window);
