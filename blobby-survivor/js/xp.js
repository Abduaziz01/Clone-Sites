// xp.js: XP gem entities with magnet pickup, the XP-per-level curve, and the level-up event hook on the player.
(function () {
  window.BS = window.BS || {};

  var TAU = Math.PI * 2;
  var U = BS.utils || {};

  var list = [];

  // Tier visuals.
  // small = value 1, medium = 2..3, large = 4+ (huge for husk).
  function tierFor(value) {
    if (value >= 25) return 'huge';
    if (value >= 4) return 'large';
    if (value >= 2) return 'medium';
    return 'small';
  }

  function colorsFor(tier) {
    if (tier === 'huge') {
      return { core: '#fff7c2', mid: '#ffd75a', edge: '#a16400', glow: 'rgba(255, 215, 90, 0.7)' };
    }
    if (tier === 'large') {
      return { core: '#e0fbff', mid: '#7be0ff', edge: '#1c4f6a', glow: 'rgba(123, 224, 255, 0.7)' };
    }
    if (tier === 'medium') {
      return { core: '#eaffd8', mid: '#a4f072', edge: '#2c5e1c', glow: 'rgba(164, 240, 114, 0.7)' };
    }
    return { core: '#fffadf', mid: '#ffe06a', edge: '#7a5a10', glow: 'rgba(255, 224, 106, 0.6)' };
  }

  function radiusFor(tier) {
    if (tier === 'huge') return 11;
    if (tier === 'large') return 8;
    if (tier === 'medium') return 7;
    return 5;
  }

  function clear() {
    list.length = 0;
  }

  function spawnGem(x, y, value) {
    if (value == null || value <= 0) value = 1;
    var tier = tierFor(value);
    var jitterAng = (U.rand ? U.rand() : Math.random()) * TAU;
    var jitterMag = 30 + (U.rand ? U.rand() : Math.random()) * 60;
    var gem = {
      x: x,
      y: y,
      value: value,
      radius: radiusFor(tier),
      vx: Math.cos(jitterAng) * jitterMag,
      vy: Math.sin(jitterAng) * jitterMag,
      t: 0,
      tier: tier,
      magneted: false
    };
    list.push(gem);
    return gem;
  }

  // enemy type -> XP value
  var TYPE_VALUE = {
    slime: 1,
    runner: 1,
    lurker: 2,
    brute: 4,
    husk: 25
  };

  function onEnemyKilled(e) {
    if (!e) return;
    var v = TYPE_VALUE[e.type];
    if (v == null) v = 1;
    spawnGem(e.x, e.y, v);
  }

  // XP curve: amount needed to GO FROM level n to n+1.
  function xpForLevel(n) {
    return Math.floor(5 + 6 * n + 0.6 * n * n);
  }

  function addXp(player, amount) {
    if (!player || amount <= 0) return;
    if (player._pendingLevelUps == null) player._pendingLevelUps = 0;
    player.xp = (player.xp || 0) + amount;
    var safety = 0;
    while (player.xp >= xpForLevel(player.level)) {
      player.xp -= xpForLevel(player.level);
      player.level += 1;
      player._pendingLevelUps += 1;
      safety++;
      if (safety > 50) break; // paranoia, shouldn't happen
    }
  }

  function update(dt, player) {
    if (!player) return;
    var pickupR = (player.stats && player.stats.pickupRadius) || 80;
    var pickupR2 = pickupR * pickupR;
    for (var i = list.length - 1; i >= 0; i--) {
      var g = list[i];
      g.t += dt;

      // Drop gems that have been orphaned for too long (e.g. enemies killed
      // far from the player while kiting). 30s is plenty of time to wander back.
      if (g.t > 30) {
        list.splice(i, 1);
        continue;
      }

      var dx = player.x - g.x;
      var dy = player.y - g.y;
      var d2 = dx * dx + dy * dy;

      if (d2 < pickupR2) {
        // Magnet pull: accelerate toward player, capped.
        g.magneted = true;
        var d = Math.sqrt(d2);
        if (d > 0.0001) {
          var nx = dx / d;
          var ny = dy / d;
          // Step velocity up each frame; the closer, the faster.
          var pullAccel = 900 + (1 - Math.min(1, d / pickupR)) * 1400;
          g.vx += nx * pullAccel * dt;
          g.vy += ny * pullAccel * dt;
        }
        // Cap.
        var sp = Math.sqrt(g.vx * g.vx + g.vy * g.vy);
        var maxSp = 720;
        if (sp > maxSp) {
          g.vx = g.vx / sp * maxSp;
          g.vy = g.vy / sp * maxSp;
        }
      } else {
        g.magneted = false;
        // Friction so the initial fan-out velocity decays quickly.
        var decay = Math.pow(0.05, dt);
        g.vx *= decay;
        g.vy *= decay;
      }

      g.x += g.vx * dt;
      g.y += g.vy * dt;

      // Pickup test.
      if (player.alive) {
        var pr = player.radius + g.radius;
        var pdx = player.x - g.x;
        var pdy = player.y - g.y;
        if (pdx * pdx + pdy * pdy <= pr * pr) {
          addXp(player, g.value);
          if (BS.audio && BS.audio.playPickup) BS.audio.playPickup();
          list.splice(i, 1);
        }
      }
    }
  }

  function drawOne(ctx, g) {
    var c = colorsFor(g.tier);
    var r = g.radius;
    // Pulse breathing.
    var pulse = 1 + Math.sin(g.t * 4) * 0.07;
    var rr = r * pulse;

    ctx.save();
    ctx.translate(g.x, g.y);

    // Additive radial glow underneath.
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    var glow = ctx.createRadialGradient(0, 0, 0, 0, 0, rr * 3.2);
    glow.addColorStop(0, c.glow);
    glow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(0, 0, rr * 3.2, 0, TAU);
    ctx.fill();
    ctx.restore();

    // Faceted diamond: top triangle + bottom triangle, each with its own gradient.
    var topGrad = ctx.createLinearGradient(0, -rr * 1.4, 0, 0);
    topGrad.addColorStop(0, c.core);
    topGrad.addColorStop(1, c.mid);
    ctx.fillStyle = topGrad;
    ctx.beginPath();
    ctx.moveTo(0, -rr * 1.4);
    ctx.lineTo(rr, 0);
    ctx.lineTo(-rr, 0);
    ctx.closePath();
    ctx.fill();

    var botGrad = ctx.createLinearGradient(0, 0, 0, rr * 1.4);
    botGrad.addColorStop(0, c.mid);
    botGrad.addColorStop(1, c.edge);
    ctx.fillStyle = botGrad;
    ctx.beginPath();
    ctx.moveTo(0, rr * 1.4);
    ctx.lineTo(rr, 0);
    ctx.lineTo(-rr, 0);
    ctx.closePath();
    ctx.fill();

    // Outline.
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(0,0,0,0.45)';
    ctx.beginPath();
    ctx.moveTo(0, -rr * 1.4);
    ctx.lineTo(rr, 0);
    ctx.lineTo(0, rr * 1.4);
    ctx.lineTo(-rr, 0);
    ctx.closePath();
    ctx.stroke();

    // Tiny core highlight.
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.beginPath();
    ctx.arc(-rr * 0.25, -rr * 0.35, rr * 0.18, 0, TAU);
    ctx.fill();

    ctx.restore();
  }

  function draw(ctx, camera) {
    if (!ctx || list.length === 0) return;
    var canvas = (BS.game && BS.game.getCanvas) ? BS.game.getCanvas() : null;
    var halfW = canvas ? canvas.width / 2 + 60 : Infinity;
    var halfH = canvas ? canvas.height / 2 + 60 : Infinity;
    for (var i = 0; i < list.length; i++) {
      var g = list[i];
      if (camera) {
        if (g.x < camera.x - halfW || g.x > camera.x + halfW) continue;
        if (g.y < camera.y - halfH || g.y > camera.y + halfH) continue;
      }
      drawOne(ctx, g);
    }
  }

  BS.xp = {
    list: list,
    clear: clear,
    spawnGem: spawnGem,
    onEnemyKilled: onEnemyKilled,
    xpForLevel: xpForLevel,
    addXp: addXp,
    update: update,
    draw: draw,
    TYPE_VALUE: TYPE_VALUE
  };

  // Convenience: route through BS.player.addXp as well, keeping spec wording.
  BS.player = BS.player || {};
  BS.player.addXp = function (player, amount) { addXp(player, amount); };
})();
