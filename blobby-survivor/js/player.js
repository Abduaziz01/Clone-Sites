// player.js: blob entity factory, stats block, movement/regen/iframes update, takeDamage, and rendering.
(function () {
  window.BS = window.BS || {};

  var TAU = Math.PI * 2;
  var clamp = (BS.utils && BS.utils.clamp) || function (v, lo, hi) {
    return v < lo ? lo : (v > hi ? hi : v);
  };

  // Throttle hurt sound so hits inside the same iframe window don't spam.
  var lastHurtAt = 0;

  function defaultStats() {
    return {
      damageMul: 1,
      attackSpeedMul: 1,
      projectileSpeedMul: 1,
      areaMul: 1,
      projectileCountBonus: 0,
      cooldownMul: 1,
      pickupRadius: 80,
      moveSpeedMul: 1,
      regenPerSec: 0,
      armor: 0,
      critChance: 0,
      critMul: 1.5
    };
  }

  function createPlayer(opts) {
    opts = opts || {};
    return {
      x: opts.x != null ? opts.x : 0,
      y: opts.y != null ? opts.y : 0,
      vx: 0,
      vy: 0,
      radius: 18,
      speed: 220,
      hp: 100,
      maxHp: 100,
      alive: true,
      wobble: 0,
      facing: 1, // 1 = right, -1 = left
      stats: defaultStats(),
      weapons: [],
      iframes: 0,
      hitFlash: 0,
      kills: 0,
      xp: 0,
      level: 1,
      aimDir: { x: 1, y: 0 }
    };
  }

  function update(p, dt, input) {
    if (!p) return;
    if (!p.alive) {
      // Even when dead let timers tick down so the death flash decays.
      if (p.hitFlash > 0) p.hitFlash = Math.max(0, p.hitFlash - dt);
      if (p.iframes > 0) p.iframes = Math.max(0, p.iframes - dt);
      return;
    }

    var axis = input && typeof input.getAxis === 'function'
      ? input.getAxis()
      : { x: 0, y: 0 };

    var moveSpeed = p.speed * (p.stats ? p.stats.moveSpeedMul : 1);
    p.vx = axis.x * moveSpeed;
    p.vy = axis.y * moveSpeed;
    p.x += p.vx * dt;
    p.y += p.vy * dt;

    if (axis.x > 0.05) p.facing = 1;
    else if (axis.x < -0.05) p.facing = -1;

    // Update aim direction only when input has meaningful magnitude;
    // otherwise keep the previous aimDir so weapons still fire forward.
    var axisLen = Math.sqrt(axis.x * axis.x + axis.y * axis.y);
    if (axisLen > 0.05) {
      p.aimDir.x = axis.x / axisLen;
      p.aimDir.y = axis.y / axisLen;
    }

    // Wobble advances faster while moving so the blob looks alive.
    var moving = (axis.x !== 0 || axis.y !== 0) ? 1 : 0.35;
    p.wobble += dt * (4 + moving * 6);

    // Decrement timers.
    if (p.iframes > 0) p.iframes = Math.max(0, p.iframes - dt);
    if (p.hitFlash > 0) p.hitFlash = Math.max(0, p.hitFlash - dt);

    // Regenerate HP.
    if (p.stats && p.stats.regenPerSec > 0 && p.hp < p.maxHp) {
      p.hp = Math.min(p.maxHp, p.hp + p.stats.regenPerSec * dt);
    }
  }

  function takeDamage(p, amount) {
    if (!p) return 0;
    if (!p.alive) return 0;
    if (p.iframes > 0) return 0;
    var armor = p.stats ? p.stats.armor : 0;
    var effective = amount * (1 - armor / (armor + 50));
    if (effective < 0) effective = 0;
    p.hp -= effective;
    p.iframes = 0.4;
    p.hitFlash = 0.15;
    if (p.hp <= 0) {
      p.hp = 0;
      p.alive = false;
      if (BS.audio && BS.audio.playDeath) BS.audio.playDeath();
    } else {
      // Throttle hurt sound to at most ~1 per 0.2s.
      var t = (BS.utils && BS.utils.now) ? BS.utils.now() : Date.now();
      if (t - lastHurtAt > 200) {
        lastHurtAt = t;
        if (BS.audio && BS.audio.playHurt) BS.audio.playHurt();
      }
    }
    // Trigger camera shake hook if main wired one up.
    if (BS.game && typeof BS.game.shake === 'function') {
      BS.game.shake(6, 0.25);
    }
    return effective;
  }

  function heal(p, amount) {
    if (!p || !p.alive) return;
    p.hp = clamp(p.hp + amount, 0, p.maxHp);
  }

  function draw(ctx, p, camera) {
    if (!p) return;
    var x = p.x;
    var y = p.y;
    var r = p.radius;

    ctx.save();
    ctx.translate(x, y);

    // Soft shadow underneath.
    ctx.beginPath();
    ctx.ellipse(0, r * 0.85, r * 0.95, r * 0.35, 0, 0, TAU);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
    ctx.fill();

    // Wobbly blob body using a sampled blob outline.
    var segs = 24;
    ctx.beginPath();
    for (var i = 0; i <= segs; i++) {
      var a = (i / segs) * TAU;
      var wob = Math.sin(a * 3 + p.wobble) * 1.2
              + Math.sin(a * 2 - p.wobble * 0.7) * 0.8;
      var rr = r + wob;
      var px = Math.cos(a) * rr;
      var py = Math.sin(a) * rr;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();

    // Radial gradient fill.
    var grad = ctx.createRadialGradient(-r * 0.3, -r * 0.4, r * 0.2, 0, 0, r * 1.2);
    if (p.alive) {
      grad.addColorStop(0, '#9be7ff');
      grad.addColorStop(0.55, '#39a0d8');
      grad.addColorStop(1, '#1d4f77');
    } else {
      grad.addColorStop(0, '#5b6680');
      grad.addColorStop(0.55, '#3a4258');
      grad.addColorStop(1, '#1a1f2c');
    }
    ctx.fillStyle = grad;
    ctx.fill();

    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(20, 40, 60, 0.7)';
    ctx.stroke();

    // Hit flash overlay.
    if (p.hitFlash > 0) {
      var alpha = Math.min(1, p.hitFlash / 0.15) * 0.55;
      ctx.beginPath();
      ctx.arc(0, 0, r * 1.05, 0, TAU);
      ctx.fillStyle = 'rgba(255, 220, 220, ' + alpha.toFixed(3) + ')';
      ctx.fill();
    }

    // iframes shimmer ring.
    if (p.alive && p.iframes > 0) {
      var ringA = (p.iframes / 0.4) * 0.6;
      ctx.lineWidth = 2;
      ctx.strokeStyle = 'rgba(255, 255, 255, ' + ringA.toFixed(3) + ')';
      ctx.beginPath();
      ctx.arc(0, 0, r + 4, 0, TAU);
      ctx.stroke();
    }

    // Eyes.
    var eyeOffsetX = r * 0.32 * p.facing;
    var eyeY = -r * 0.18;
    ctx.fillStyle = '#0b1a26';
    ctx.beginPath();
    ctx.arc(-r * 0.18 + eyeOffsetX * 0.2, eyeY, r * 0.10, 0, TAU);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(r * 0.22 + eyeOffsetX * 0.2, eyeY, r * 0.10, 0, TAU);
    ctx.fill();

    // Eye highlights.
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(-r * 0.18 + eyeOffsetX * 0.2 - r * 0.03, eyeY - r * 0.04, r * 0.03, 0, TAU);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(r * 0.22 + eyeOffsetX * 0.2 - r * 0.03, eyeY - r * 0.04, r * 0.03, 0, TAU);
    ctx.fill();

    // Smile arc (turns into a flat line when dead).
    ctx.strokeStyle = '#0b1a26';
    ctx.lineWidth = 2;
    ctx.beginPath();
    if (p.alive) {
      ctx.arc(0, r * 0.05, r * 0.32, 0.15 * Math.PI, 0.85 * Math.PI);
    } else {
      ctx.moveTo(-r * 0.3, r * 0.25);
      ctx.lineTo(r * 0.3, r * 0.25);
    }
    ctx.stroke();

    ctx.restore();
  }

  BS.player = {
    createPlayer: createPlayer,
    update: update,
    draw: draw,
    takeDamage: takeDamage,
    heal: heal,
    defaultStats: defaultStats
  };
})();
