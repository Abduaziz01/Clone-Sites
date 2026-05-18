(function () {
  window.BS = window.BS || {};

  var TAU = Math.PI * 2;

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
      facing: 1 // 1 = right, -1 = left
    };
  }

  function update(p, dt, input) {
    if (!p.alive) return;
    var axis = input && typeof input.getAxis === 'function'
      ? input.getAxis()
      : { x: 0, y: 0 };

    p.vx = axis.x * p.speed;
    p.vy = axis.y * p.speed;
    p.x += p.vx * dt;
    p.y += p.vy * dt;

    if (axis.x > 0.05) p.facing = 1;
    else if (axis.x < -0.05) p.facing = -1;

    // Wobble advances faster while moving so the blob looks alive.
    var moving = (axis.x !== 0 || axis.y !== 0) ? 1 : 0.35;
    p.wobble += dt * (4 + moving * 6);
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
    grad.addColorStop(0, '#9be7ff');
    grad.addColorStop(0.55, '#39a0d8');
    grad.addColorStop(1, '#1d4f77');
    ctx.fillStyle = grad;
    ctx.fill();

    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(20, 40, 60, 0.7)';
    ctx.stroke();

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

    // Smile arc.
    ctx.strokeStyle = '#0b1a26';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, r * 0.05, r * 0.32, 0.15 * Math.PI, 0.85 * Math.PI);
    ctx.stroke();

    ctx.restore();
  }

  BS.player = {
    createPlayer: createPlayer,
    update: update,
    draw: draw
  };
})();
