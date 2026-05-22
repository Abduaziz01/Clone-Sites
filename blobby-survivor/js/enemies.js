// enemies.js: enemy types (Slime/Runner/Lurker/Brute/Husk), AI steering, contact damage, and rendering.
(function () {
  window.BS = window.BS || {};

  var TAU = Math.PI * 2;

  var TYPES = {
    slime: { radius: 14, hp: 12, speed: 55, damage: 8, color: '#86c46b' },
    runner: { radius: 12, hp: 9, speed: 120, damage: 6, color: '#d96a5b' },
    lurker: { radius: 20, hp: 30, speed: 75, damage: 12, color: '#7b5cb0' },
    brute: { radius: 30, hp: 90, speed: 42, damage: 18, color: '#6c707a' },
    husk: { radius: 60, hp: 900, speed: 35, damage: 30, color: '#39323d' }
  };

  var list = [];

  function clear() {
    list.length = 0;
  }

  function spawn(type, x, y, hpMul, dmgMul, speedMul) {
    var def = TYPES[type] || TYPES.slime;
    hpMul = hpMul || 1;
    dmgMul = dmgMul || 1;
    speedMul = speedMul || 1;
    var hp = Math.round(def.hp * hpMul);
    var e = {
      type: type,
      x: x,
      y: y,
      vx: 0,
      vy: 0,
      knockbackVx: 0,
      knockbackVy: 0,
      radius: def.radius,
      hp: hp,
      maxHp: hp,
      speed: def.speed * speedMul,
      damage: def.damage * dmgMul,
      color: def.color,
      hitFlash: 0,
      dead: false,
      wobble: Math.random() * TAU
    };
    list.push(e);
    return e;
  }

  function takeDamage(e, amount, knockback) {
    if (!e || e.dead) return;
    e.hp -= amount;
    e.hitFlash = 0.1;
    if (knockback) {
      e.knockbackVx += knockback.x || 0;
      e.knockbackVy += knockback.y || 0;
    }
    if (e.hp <= 0) {
      e.hp = 0;
      e.dead = true;
    }
  }

  function update(dt, world) {
    var player = world && world.player;
    if (!player) return;
    var playerAlive = !!player.alive;

    for (var i = 0; i < list.length; i++) {
      var e = list[i];
      if (e.dead) continue;

      // Steer toward player.
      var dx = player.x - e.x;
      var dy = player.y - e.y;
      var d = Math.sqrt(dx * dx + dy * dy);
      var sx = 0, sy = 0;
      if (d > 0.0001) {
        sx = (dx / d) * e.speed;
        sy = (dy / d) * e.speed;
      }
      e.vx = sx;
      e.vy = sy;

      // Apply knockback decay.
      var decay = Math.pow(0.05, dt);
      e.knockbackVx *= decay;
      e.knockbackVy *= decay;

      e.x += (e.vx + e.knockbackVx) * dt;
      e.y += (e.vy + e.knockbackVy) * dt;

      // Wobble.
      e.wobble += dt * 4;

      // Decrement hitFlash.
      if (e.hitFlash > 0) e.hitFlash = Math.max(0, e.hitFlash - dt);

      // Contact damage to player.
      if (playerAlive && player.iframes <= 0) {
        var rr = e.radius + player.radius;
        var pdx = player.x - e.x, pdy = player.y - e.y;
        if (pdx * pdx + pdy * pdy <= rr * rr) {
          if (BS.player && BS.player.takeDamage) {
            BS.player.takeDamage(player, e.damage);
          }
        }
      }
    }

    // Sweep dead enemies.
    for (var j = list.length - 1; j >= 0; j--) {
      var en = list[j];
      if (en.dead) {
        list.splice(j, 1);
        if (typeof BS.enemies.onKilled === 'function') {
          try { BS.enemies.onKilled(en); } catch (err) { /* swallow */ }
        }
      }
    }

    // Cull enemies the player has out-paced. This is a cull, not a kill, so
    // it does NOT call onKilled (no XP gem, no kill credit). Husks are bosses
    // and remain on the field even if the player runs.
    var canvas = (BS.game && BS.game.getCanvas) ? BS.game.getCanvas() : null;
    var camera = (BS.game && BS.game.getCamera) ? BS.game.getCamera() : null;
    if (canvas && camera) {
      var maxDim = Math.max(canvas.width, canvas.height);
      var cullDist = maxDim * 1.5;
      var cullDist2 = cullDist * cullDist;
      for (var c = list.length - 1; c >= 0; c--) {
        var ec = list[c];
        if (ec.type === 'husk') continue;
        var ddx = ec.x - camera.x;
        var ddy = ec.y - camera.y;
        if (ddx * ddx + ddy * ddy > cullDist2) {
          list.splice(c, 1);
        }
      }
    }
  }

  function drawBlobBody(ctx, e, segs, jitter) {
    ctx.beginPath();
    for (var i = 0; i <= segs; i++) {
      var a = (i / segs) * TAU;
      var wob = Math.sin(a * 3 + e.wobble) * jitter
              + Math.sin(a * 2 - e.wobble * 0.7) * (jitter * 0.6);
      var rr = e.radius + wob;
      var px = Math.cos(a) * rr;
      var py = Math.sin(a) * rr;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
  }

  function lighten(color, amt) {
    // Quick lighten by mixing with white, expects #RRGGBB.
    if (color.charAt(0) !== '#' || color.length !== 7) return color;
    var r = parseInt(color.substr(1, 2), 16);
    var g = parseInt(color.substr(3, 2), 16);
    var b = parseInt(color.substr(5, 2), 16);
    r = Math.min(255, Math.round(r + (255 - r) * amt));
    g = Math.min(255, Math.round(g + (255 - g) * amt));
    b = Math.min(255, Math.round(b + (255 - b) * amt));
    return 'rgb(' + r + ',' + g + ',' + b + ')';
  }

  function darken(color, amt) {
    if (color.charAt(0) !== '#' || color.length !== 7) return color;
    var r = parseInt(color.substr(1, 2), 16);
    var g = parseInt(color.substr(3, 2), 16);
    var b = parseInt(color.substr(5, 2), 16);
    r = Math.max(0, Math.round(r * (1 - amt)));
    g = Math.max(0, Math.round(g * (1 - amt)));
    b = Math.max(0, Math.round(b * (1 - amt)));
    return 'rgb(' + r + ',' + g + ',' + b + ')';
  }

  function drawSlime(ctx, e) {
    drawBlobBody(ctx, e, 18, 1.2);
    var grad = ctx.createRadialGradient(-e.radius * 0.3, -e.radius * 0.4, e.radius * 0.2, 0, 0, e.radius * 1.2);
    grad.addColorStop(0, lighten(e.color, 0.5));
    grad.addColorStop(0.6, e.color);
    grad.addColorStop(1, darken(e.color, 0.4));
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = darken(e.color, 0.5);
    ctx.stroke();
    // Two small eyes.
    ctx.fillStyle = '#0d1411';
    ctx.beginPath();
    ctx.arc(-e.radius * 0.3, -e.radius * 0.1, e.radius * 0.12, 0, TAU);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(e.radius * 0.3, -e.radius * 0.1, e.radius * 0.12, 0, TAU);
    ctx.fill();
  }

  function drawRunner(ctx, e) {
    drawBlobBody(ctx, e, 18, 0.9);
    var grad = ctx.createRadialGradient(-e.radius * 0.3, -e.radius * 0.4, e.radius * 0.2, 0, 0, e.radius * 1.2);
    grad.addColorStop(0, lighten(e.color, 0.5));
    grad.addColorStop(0.6, e.color);
    grad.addColorStop(1, darken(e.color, 0.4));
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = darken(e.color, 0.5);
    ctx.stroke();
    // Streak behind it pointing opposite of velocity.
    var vlen = Math.sqrt(e.vx * e.vx + e.vy * e.vy);
    if (vlen > 0.5) {
      var nx = e.vx / vlen, ny = e.vy / vlen;
      ctx.strokeStyle = 'rgba(255, 220, 200, 0.4)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-nx * e.radius * 0.6, -ny * e.radius * 0.6);
      ctx.lineTo(-nx * e.radius * 1.6, -ny * e.radius * 1.6);
      ctx.stroke();
    }
    // Eyes.
    ctx.fillStyle = '#220606';
    ctx.beginPath();
    ctx.arc(-e.radius * 0.25, -e.radius * 0.1, e.radius * 0.13, 0, TAU);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(e.radius * 0.25, -e.radius * 0.1, e.radius * 0.13, 0, TAU);
    ctx.fill();
  }

  function drawLurker(ctx, e) {
    drawBlobBody(ctx, e, 22, 1.6);
    var grad = ctx.createRadialGradient(-e.radius * 0.3, -e.radius * 0.4, e.radius * 0.2, 0, 0, e.radius * 1.2);
    grad.addColorStop(0, lighten(e.color, 0.4));
    grad.addColorStop(0.55, e.color);
    grad.addColorStop(1, darken(e.color, 0.5));
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = darken(e.color, 0.55);
    ctx.stroke();
    // One big single eye.
    ctx.fillStyle = '#fff8d9';
    ctx.beginPath();
    ctx.arc(0, -e.radius * 0.05, e.radius * 0.38, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#1a0d22';
    ctx.beginPath();
    ctx.arc(0, -e.radius * 0.05, e.radius * 0.18, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(-e.radius * 0.06, -e.radius * 0.12, e.radius * 0.06, 0, TAU);
    ctx.fill();
  }

  function drawBrute(ctx, e) {
    drawBlobBody(ctx, e, 26, 2.2);
    var grad = ctx.createRadialGradient(-e.radius * 0.3, -e.radius * 0.4, e.radius * 0.2, 0, 0, e.radius * 1.2);
    grad.addColorStop(0, lighten(e.color, 0.45));
    grad.addColorStop(0.55, e.color);
    grad.addColorStop(1, darken(e.color, 0.5));
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = darken(e.color, 0.55);
    ctx.stroke();
    // Glowering eyes.
    ctx.fillStyle = '#2a0d0d';
    ctx.beginPath();
    ctx.arc(-e.radius * 0.32, -e.radius * 0.12, e.radius * 0.14, 0, TAU);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(e.radius * 0.32, -e.radius * 0.12, e.radius * 0.14, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#ff7b7b';
    ctx.beginPath();
    ctx.arc(-e.radius * 0.32, -e.radius * 0.12, e.radius * 0.05, 0, TAU);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(e.radius * 0.32, -e.radius * 0.12, e.radius * 0.05, 0, TAU);
    ctx.fill();
  }

  function drawHusk(ctx, e) {
    drawBlobBody(ctx, e, 36, 4);
    var grad = ctx.createRadialGradient(-e.radius * 0.3, -e.radius * 0.4, e.radius * 0.2, 0, 0, e.radius * 1.2);
    grad.addColorStop(0, lighten(e.color, 0.35));
    grad.addColorStop(0.55, e.color);
    grad.addColorStop(1, '#0c0a10');
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.lineWidth = 5;
    ctx.strokeStyle = '#1c1820';
    ctx.stroke();
    // Multiple eerie eyes.
    ctx.fillStyle = '#ffd25b';
    var eyes = [
      [-e.radius * 0.45, -e.radius * 0.15, 0.10],
      [-e.radius * 0.10, -e.radius * 0.25, 0.10],
      [ e.radius * 0.25, -e.radius * 0.20, 0.10],
      [ e.radius * 0.50, -e.radius * 0.05, 0.10]
    ];
    for (var k = 0; k < eyes.length; k++) {
      ctx.beginPath();
      ctx.arc(eyes[k][0], eyes[k][1], e.radius * eyes[k][2], 0, TAU);
      ctx.fill();
    }
  }

  function drawAura(ctx, e) {
    var grad = ctx.createRadialGradient(0, 0, e.radius * 0.8, 0, 0, e.radius * 1.8);
    grad.addColorStop(0, 'rgba(180, 60, 200, 0.4)');
    grad.addColorStop(1, 'rgba(120, 30, 160, 0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(0, 0, e.radius * 1.8, 0, TAU);
    ctx.fill();
  }

  function drawHpBar(ctx, e) {
    if (e.hp >= e.maxHp) return;
    var w = e.radius * 2;
    var h = 4;
    var pct = Math.max(0, e.hp / e.maxHp);
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(-w / 2, -e.radius - 10, w, h);
    ctx.fillStyle = '#ff6a7a';
    ctx.fillRect(-w / 2, -e.radius - 10, w * pct, h);
  }

  function drawOne(ctx, e) {
    ctx.save();
    ctx.translate(e.x, e.y);

    // Husk gets an additive aura ring drawn first.
    if (e.type === 'husk') {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      drawAura(ctx, e);
      ctx.restore();
    }

    // Soft shadow.
    ctx.beginPath();
    ctx.ellipse(0, e.radius * 0.85, e.radius * 0.95, e.radius * 0.35, 0, 0, TAU);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.30)';
    ctx.fill();

    if (e.type === 'slime') drawSlime(ctx, e);
    else if (e.type === 'runner') drawRunner(ctx, e);
    else if (e.type === 'lurker') drawLurker(ctx, e);
    else if (e.type === 'brute') drawBrute(ctx, e);
    else if (e.type === 'husk') drawHusk(ctx, e);
    else drawSlime(ctx, e);

    if (e.hitFlash > 0) {
      var alpha = Math.min(1, e.hitFlash / 0.1) * 0.6;
      ctx.beginPath();
      ctx.arc(0, 0, e.radius * 1.05, 0, TAU);
      ctx.fillStyle = 'rgba(255,255,255,' + alpha.toFixed(3) + ')';
      ctx.fill();
    }

    drawHpBar(ctx, e);

    ctx.restore();
  }

  function draw(ctx, camera) {
    if (!ctx) return;
    var canvas = (BS.game && BS.game.getCanvas) ? BS.game.getCanvas() : null;
    var halfW = canvas ? canvas.width / 2 + 80 : Infinity;
    var halfH = canvas ? canvas.height / 2 + 80 : Infinity;
    for (var i = 0; i < list.length; i++) {
      var e = list[i];
      if (camera) {
        if (e.x < camera.x - halfW || e.x > camera.x + halfW) continue;
        if (e.y < camera.y - halfH || e.y > camera.y + halfH) continue;
      }
      drawOne(ctx, e);
    }
  }

  BS.enemies = {
    TYPES: TYPES,
    list: list,
    clear: clear,
    spawn: spawn,
    takeDamage: takeDamage,
    update: update,
    draw: draw,
    onKilled: null
  };
})();
