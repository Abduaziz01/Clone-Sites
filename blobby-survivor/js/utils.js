// utils.js: shared math helpers, seedable RNG, and the capped hit/death particle system on the BS namespace.
(function () {
  window.BS = window.BS || {};

  var TAU = Math.PI * 2;

  function clamp(v, lo, hi) {
    if (v < lo) return lo;
    if (v > hi) return hi;
    return v;
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function distSq(ax, ay, bx, by) {
    var dx = ax - bx;
    var dy = ay - by;
    return dx * dx + dy * dy;
  }

  function dist(ax, ay, bx, by) {
    return Math.sqrt(distSq(ax, ay, bx, by));
  }

  function len(x, y) {
    return Math.sqrt(x * x + y * y);
  }

  function norm(x, y) {
    var l = len(x, y);
    if (l === 0) return { x: 0, y: 0 };
    return { x: x / l, y: y / l };
  }

  function rand() {
    // Default to BS.rng if available, else Math.random.
    if (BS.rng && typeof BS.rng.next === 'function') return BS.rng.next();
    return Math.random();
  }

  function randRange(min, max) {
    return min + rand() * (max - min);
  }

  function randInt(min, max) {
    return Math.floor(randRange(min, max + 1));
  }

  function choice(arr) {
    if (!arr || arr.length === 0) return undefined;
    return arr[Math.floor(rand() * arr.length)];
  }

  function weightedChoice(items, weightFn) {
    if (!items || items.length === 0) return undefined;
    var total = 0;
    var i;
    for (i = 0; i < items.length; i++) total += weightFn(items[i]);
    if (total <= 0) return items[Math.floor(rand() * items.length)];
    var r = rand() * total;
    for (i = 0; i < items.length; i++) {
      r -= weightFn(items[i]);
      if (r <= 0) return items[i];
    }
    return items[items.length - 1];
  }

  function now() {
    return (typeof performance !== 'undefined' && performance.now)
      ? performance.now()
      : Date.now();
  }

  // Seedable PRNG (mulberry32). Deterministic per seed.
  function makeRng(seed) {
    var state = (seed >>> 0) || 1;
    function next() {
      state = (state + 0x6D2B79F5) >>> 0;
      var t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }
    return {
      next: next,
      seed: function (s) { state = (s >>> 0) || 1; },
      range: function (lo, hi) { return lo + next() * (hi - lo); },
      int: function (lo, hi) { return Math.floor(lo + next() * (hi - lo + 1)); }
    };
  }

  BS.utils = {
    clamp: clamp,
    lerp: lerp,
    dist: dist,
    distSq: distSq,
    len: len,
    norm: norm,
    rand: rand,
    randRange: randRange,
    randInt: randInt,
    choice: choice,
    weightedChoice: weightedChoice,
    now: now,
    TAU: TAU
  };

  BS.makeRng = makeRng;
  BS.rng = makeRng((Date.now() & 0xffffffff) >>> 0);

  // ----- Tiny capped particle system used for hit sparks. -----
  var MAX_PARTICLES = 200;
  var particles = [];

  function spawnParticle(opts) {
    if (particles.length >= MAX_PARTICLES) {
      // Drop the oldest to keep within cap.
      particles.shift();
    }
    var p = {
      x: opts.x || 0,
      y: opts.y || 0,
      vx: opts.vx || 0,
      vy: opts.vy || 0,
      life: opts.life != null ? opts.life : 0.4,
      maxLife: opts.life != null ? opts.life : 0.4,
      radius: opts.radius != null ? opts.radius : 2,
      color: opts.color || '#ffffff',
      drag: opts.drag != null ? opts.drag : 0.05
    };
    particles.push(p);
    return p;
  }

  function spawnHitSparks(x, y, color, count) {
    var n = count || 4;
    for (var i = 0; i < n; i++) {
      var a = rand() * TAU;
      var sp = 80 + rand() * 140;
      spawnParticle({
        x: x,
        y: y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        life: 0.25 + rand() * 0.2,
        radius: 1.5 + rand() * 1.5,
        color: color || '#ffd9a8',
        drag: 0.04
      });
    }
  }

  function updateParticles(dt) {
    for (var i = particles.length - 1; i >= 0; i--) {
      var p = particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        particles.splice(i, 1);
        continue;
      }
      var decay = Math.pow(p.drag, dt);
      p.vx *= decay;
      p.vy *= decay;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
  }

  function drawParticles(ctx) {
    if (!ctx || particles.length === 0) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (var i = 0; i < particles.length; i++) {
      var p = particles[i];
      var a = p.life / p.maxLife;
      if (a < 0) a = 0;
      ctx.globalAlpha = a;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  function clearParticles() {
    particles.length = 0;
  }

  BS.particles = {
    spawn: spawnParticle,
    spawnHitSparks: spawnHitSparks,
    update: updateParticles,
    draw: drawParticles,
    clear: clearParticles,
    list: particles
  };
})();