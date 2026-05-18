(function () {
  window.BS = window.BS || {};

  var ctx = null;
  var muted = false;
  var initialized = false;
  var failed = false;

  function ensureCtx() {
    if (initialized || failed) return ctx;
    initialized = true;
    try {
      var Ctor = window.AudioContext || window.webkitAudioContext;
      if (!Ctor) { failed = true; return null; }
      ctx = new Ctor();
    } catch (e) {
      failed = true;
      ctx = null;
    }
    return ctx;
  }

  function resumeIfNeeded() {
    if (ctx && ctx.state === 'suspended' && typeof ctx.resume === 'function') {
      try { ctx.resume(); } catch (e) { /* ignore */ }
    }
  }

  function blip(opts) {
    if (muted || failed) return;
    var c = ensureCtx();
    if (!c) return;
    resumeIfNeeded();

    var t0 = c.currentTime;
    var dur = opts.dur != null ? opts.dur : 0.12;
    var freq = opts.freq != null ? opts.freq : 440;
    var freqEnd = opts.freqEnd != null ? opts.freqEnd : freq;
    var type = opts.type || 'sine';
    var vol = opts.vol != null ? opts.vol : 0.15;

    try {
      var osc = c.createOscillator();
      var gain = c.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, t0);
      if (freqEnd !== freq) {
        osc.frequency.exponentialRampToValueAtTime(Math.max(1, freqEnd), t0 + dur);
      }
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(vol, t0 + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      osc.connect(gain);
      gain.connect(c.destination);
      osc.start(t0);
      osc.stop(t0 + dur + 0.02);
    } catch (e) {
      // Swallow; treat as no-op for this call.
    }
  }

  function playShoot()    { blip({ freq: 880, freqEnd: 440, dur: 0.08, type: 'square',   vol: 0.08 }); }
  function playHit()      { blip({ freq: 220, freqEnd: 110, dur: 0.10, type: 'triangle', vol: 0.10 }); }
  function playPickup()   { blip({ freq: 660, freqEnd: 990, dur: 0.10, type: 'sine',     vol: 0.10 }); }
  function playLevelUp()  { blip({ freq: 523, freqEnd: 1046,dur: 0.30, type: 'triangle', vol: 0.15 }); }
  function playHurt()     { blip({ freq: 200, freqEnd: 80,  dur: 0.18, type: 'sawtooth', vol: 0.12 }); }
  function playDeath()    { blip({ freq: 300, freqEnd: 60,  dur: 0.45, type: 'sawtooth', vol: 0.18 }); }

  function setMuted(v) { muted = !!v; }
  function toggleMute() { muted = !muted; return muted; }
  function isMuted() { return muted; }

  // Eagerly init on first user gesture (Start click handles this too via init()).
  function init() {
    ensureCtx();
    resumeIfNeeded();
  }

  // Wire mute toggle on M.
  if (BS.input && typeof BS.input.onKeyDown === 'function') {
    BS.input.onKeyDown('KeyM', function () { toggleMute(); });
  }

  BS.audio = {
    init: init,
    playShoot: playShoot,
    playHit: playHit,
    playPickup: playPickup,
    playLevelUp: playLevelUp,
    playHurt: playHurt,
    playDeath: playDeath,
    setMuted: setMuted,
    toggleMute: toggleMute,
    isMuted: isMuted
  };
})();
