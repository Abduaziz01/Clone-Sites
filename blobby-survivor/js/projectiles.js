// projectiles.js: projectile pool with kinds shard/orb/whip/nova/boomerang/homing, hit resolution, and additive-glow rendering.
(function () {
  window.BS = window.BS || {};

  var TAU = Math.PI * 2;
  var U = BS.utils || {};
  var dist = U.dist || function (ax, ay, bx, by) {
    var dx = ax - bx, dy = ay - by;
    return Math.sqrt(dx * dx + dy * dy);
  };

  var list = [];

  function spawn(opts) {
    opts = opts || {};
    var p = {
      x: opts.x || 0,
      y: opts.y || 0,
      vx: opts.vx || 0,
      vy: opts.vy || 0,
      radius: opts.radius != null ? opts.radius : 6,
      damage: opts.damage != null ? opts.damage : 1,
      life: opts.life != null ? opts.life : 1,
      maxLife: opts.life != null ? opts.life : 1,
      pierce: opts.pierce != null ? opts.pierce : 0,
      knockback: opts.knockback != null ? opts.knockback : 60,
      owner: opts.owner || 'player',
      kind: opts.kind || 'shard',
      t: 0,
      hitSet: new Set(),
      lastHitClear: 0,
      color: opts.color || '#9be7ff',
      glow: opts.glow || 'rgba(155, 231, 255, 0.6)',
      data: opts.data || {},
      dead: false
    };
    list.push(p);
    return p;
  }

  function clear() {
    list.length = 0;
  }

  function applyDamageToEnemy(enemy, proj, world) {
    if (!enemy || enemy.dead) return false;
    var kx = 0, ky = 0;
    var d = dist(enemy.x, enemy.y, proj.x, proj.y);
    if (d > 0.0001) {
      kx = (enemy.x - proj.x) / d;
      ky = (enemy.y - proj.y) / d;
    }
    var force = proj.knockback;
    var dmg = proj.damage;
    var isCrit = false;
    var player = world && world.player;
    // Persistent orbs read damage from player.stats at hit time so passives
    // picked up after the orbs spawned still apply.
    if (proj.owner === 'player' && proj.kind === 'orb' &&
        proj.data && proj.data.baseDamage != null && player && player.stats) {
      dmg = proj.data.baseDamage * (player.stats.damageMul || 1);
    }
    if (proj.owner === 'player' && player && player.stats) {
      var crc = player.stats.critChance || 0;
      var crm = player.stats.critMul || 1.5;
      if (crc > 0 && Math.random() < crc) {
        dmg = dmg * crm;
        isCrit = true;
      }
    }
    if (BS.enemies && BS.enemies.takeDamage) {
      BS.enemies.takeDamage(enemy, dmg, { x: kx * force, y: ky * force });
    } else {
      enemy.hp -= dmg;
      if (enemy.hp <= 0) enemy.dead = true;
    }
    if (BS.particles && BS.particles.spawnHitSparks) {
      var sparkColor = isCrit ? '#fff36a' : proj.color;
      var sparkCount = isCrit ? 6 : 3;
      BS.particles.spawnHitSparks(enemy.x, enemy.y, sparkColor, sparkCount);
    }
    if (BS.audio && BS.audio.playHit) BS.audio.playHit();
    return true;
  }

  function nearestEnemy(world, x, y) {
    if (!world || !world.enemies || world.enemies.length === 0) return null;
    var best = null;
    var bestD = Infinity;
    var enemies = world.enemies;
    for (var i = 0; i < enemies.length; i++) {
      var e = enemies[i];
      if (!e || e.dead) continue;
      var dx = e.x - x;
      var dy = e.y - y;
      var d2 = dx * dx + dy * dy;
      if (d2 < bestD) {
        bestD = d2;
        best = e;
      }
    }
    return best;
  }

  function updateShard(p, dt, world) {
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    var enemies = world.enemies || [];
    for (var i = 0; i < enemies.length; i++) {
      var e = enemies[i];
      if (!e || e.dead) continue;
      if (p.hitSet.has(e)) continue;
      var rr = e.radius + p.radius;
      var dx = e.x - p.x, dy = e.y - p.y;
      if (dx * dx + dy * dy <= rr * rr) {
        applyDamageToEnemy(e, p, world);
        p.hitSet.add(e);
        p.pierce--;
        if (p.pierce < 0) {
          p.dead = true;
          return;
        }
      }
    }
  }

  function updateOrb(p, dt, world) {
    var player = world.player;
    if (!player) return;
    var data = p.data;
    // Live-recompute orbit radius from player.stats so passives picked up
    // after the orbs spawned still apply.
    if (data.baseOrbitR != null && player.stats) {
      data.orbitR = data.baseOrbitR * (player.stats.areaMul || 1);
    }
    data.angle += data.orbitSpeed * dt;
    p.x = player.x + Math.cos(data.angle) * data.orbitR;
    p.y = player.y + Math.sin(data.angle) * data.orbitR;
    // Periodically clear hitSet so an orb can re-hit the same enemy.
    p.lastHitClear += dt;
    if (p.lastHitClear >= 0.4) {
      p.hitSet.clear();
      p.lastHitClear = 0;
    }
    var enemies = world.enemies || [];
    for (var i = 0; i < enemies.length; i++) {
      var e = enemies[i];
      if (!e || e.dead) continue;
      if (p.hitSet.has(e)) continue;
      var rr = e.radius + p.radius;
      var dx = e.x - p.x, dy = e.y - p.y;
      if (dx * dx + dy * dy <= rr * rr) {
        applyDamageToEnemy(e, p, world);
        p.hitSet.add(e);
      }
    }
  }

  function updateWhip(p, dt, world) {
    var data = p.data;
    var player = world.player;
    if (data.anchorPlayer && player) {
      data.originX = player.x;
      data.originY = player.y;
    }
    // Capsule along data.angle starting from origin, length data.len, half-width data.width.
    var ca = Math.cos(data.angle);
    var sa = Math.sin(data.angle);
    var enemies = world.enemies || [];
    for (var i = 0; i < enemies.length; i++) {
      var e = enemies[i];
      if (!e || e.dead) continue;
      if (p.hitSet.has(e)) continue;
      var dx = e.x - data.originX;
      var dy = e.y - data.originY;
      var along = dx * ca + dy * sa; // projection on whip axis
      if (along < -e.radius || along > data.len + e.radius) continue;
      var perp = dx * (-sa) + dy * ca;
      var halfW = data.width + e.radius;
      if (perp > -halfW && perp < halfW) {
        // place projectile at impact for spark visuals
        var hitX = data.originX + ca * Math.max(0, Math.min(data.len, along));
        var hitY = data.originY + sa * Math.max(0, Math.min(data.len, along));
        p.x = hitX;
        p.y = hitY;
        applyDamageToEnemy(e, p, world);
        p.hitSet.add(e);
      }
    }
  }

  function updateNova(p, dt, world) {
    var data = p.data;
    data.curR = (data.curR || 0) + data.growRate * dt;
    p.x = data.originX;
    p.y = data.originY;
    var enemies = world.enemies || [];
    for (var i = 0; i < enemies.length; i++) {
      var e = enemies[i];
      if (!e || e.dead) continue;
      if (p.hitSet.has(e)) continue;
      var d = dist(e.x, e.y, data.originX, data.originY);
      // Thin ring of width 14.
      if (d <= data.curR + e.radius && d >= data.curR - 14 - e.radius) {
        applyDamageToEnemy(e, p, world);
        p.hitSet.add(e);
      }
    }
    if (data.curR >= data.maxR) {
      p.dead = true;
    }
  }

  function updateBoomerang(p, dt, world) {
    var data = p.data;
    var player = world.player;
    if (!data.returning) {
      // Outbound: travel along velocity.
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      var traveled = dist(p.x, p.y, data.originX, data.originY);
      if (traveled >= data.throwDist) {
        data.returning = true;
      }
    } else {
      // Inbound: steer toward current player position.
      if (!player) {
        p.dead = true;
        return;
      }
      var dx = player.x - p.x;
      var dy = player.y - p.y;
      var d = Math.sqrt(dx * dx + dy * dy);
      if (d < player.radius + p.radius) {
        p.dead = true;
        return;
      }
      var sp = data.returnSpeed || 360;
      p.vx = (dx / d) * sp;
      p.vy = (dy / d) * sp;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
    // Check enemy collisions.
    var enemies = world.enemies || [];
    for (var i = 0; i < enemies.length; i++) {
      var e = enemies[i];
      if (!e || e.dead) continue;
      if (p.hitSet.has(e)) continue;
      var rr = e.radius + p.radius;
      var ex = e.x - p.x, ey = e.y - p.y;
      if (ex * ex + ey * ey <= rr * rr) {
        // Decrement pierce: each per-level pierce value caps how many distinct
        // enemies one boomerang throw can damage. The boomerang itself keeps
        // flying (and returns) so it visually feels right; it just stops
        // dealing damage once exhausted.
        if (p.pierce >= 0) {
          applyDamageToEnemy(e, p, world);
          p.hitSet.add(e);
          p.pierce--;
        } else {
          p.hitSet.add(e);
        }
      }
    }
  }

  function updateHoming(p, dt, world) {
    var data = p.data;
    var target = data.target;
    if (!target || target.dead) {
      target = nearestEnemy(world, p.x, p.y);
      data.target = target;
    }
    if (target) {
      var dx = target.x - p.x;
      var dy = target.y - p.y;
      var d = Math.sqrt(dx * dx + dy * dy);
      if (d > 0.01) {
        var desiredAngle = Math.atan2(dy, dx);
        var currentAngle = Math.atan2(p.vy, p.vx);
        var diff = desiredAngle - currentAngle;
        // Wrap into [-PI, PI].
        while (diff > Math.PI) diff -= TAU;
        while (diff < -Math.PI) diff += TAU;
        var maxTurn = data.turnRate * dt;
        if (diff > maxTurn) diff = maxTurn;
        else if (diff < -maxTurn) diff = -maxTurn;
        var newAngle = currentAngle + diff;
        var sp = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
        p.vx = Math.cos(newAngle) * sp;
        p.vy = Math.sin(newAngle) * sp;
      }
    }
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    var enemies = world.enemies || [];
    for (var i = 0; i < enemies.length; i++) {
      var e = enemies[i];
      if (!e || e.dead) continue;
      if (p.hitSet.has(e)) continue;
      var rr = e.radius + p.radius;
      var hx = e.x - p.x, hy = e.y - p.y;
      if (hx * hx + hy * hy <= rr * rr) {
        applyDamageToEnemy(e, p, world);
        p.hitSet.add(e);
        p.pierce--;
        if (p.pierce < 0) {
          p.dead = true;
          return;
        }
      }
    }
  }

  function update(dt, world) {
    world = world || {};
    for (var i = list.length - 1; i >= 0; i--) {
      var p = list[i];
      p.t += dt;
      p.life -= dt;
      if (p.kind === 'shard') updateShard(p, dt, world);
      else if (p.kind === 'orb') updateOrb(p, dt, world);
      else if (p.kind === 'whip') updateWhip(p, dt, world);
      else if (p.kind === 'nova') updateNova(p, dt, world);
      else if (p.kind === 'boomerang') updateBoomerang(p, dt, world);
      else if (p.kind === 'homing') updateHoming(p, dt, world);
      if (!p.dead && p.life <= 0) p.dead = true;
      if (p.dead) list.splice(i, 1);
    }
  }

  function rectCull(p, camera, canvas) {
    if (!camera || !canvas) return true;
    var w = canvas.width / 2 + 80;
    var h = canvas.height / 2 + 80;
    if (p.x < camera.x - w) return false;
    if (p.x > camera.x + w) return false;
    if (p.y < camera.y - h) return false;
    if (p.y > camera.y + h) return false;
    return true;
  }

  function drawShard(ctx, p) {
    var ang = Math.atan2(p.vy, p.vx);
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(ang);
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.moveTo(p.radius * 1.6, 0);
    ctx.lineTo(-p.radius * 0.6, p.radius * 0.7);
    ctx.lineTo(-p.radius * 0.4, 0);
    ctx.lineTo(-p.radius * 0.6, -p.radius * 0.7);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function drawShardGlow(ctx, p) {
    var ang = Math.atan2(p.vy, p.vx);
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(ang);
    var grad = ctx.createRadialGradient(0, 0, 0, 0, 0, p.radius * 3);
    grad.addColorStop(0, p.glow);
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(-p.radius * 3, -p.radius * 3, p.radius * 6, p.radius * 6);
    ctx.restore();
  }

  function drawOrb(ctx, p) {
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.radius, 0, TAU);
    ctx.fill();
  }

  function drawOrbGlow(ctx, p) {
    var grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.radius * 3);
    grad.addColorStop(0, p.glow);
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.radius * 3, 0, TAU);
    ctx.fill();
  }

  function drawWhip(ctx, p) {
    var data = p.data;
    var lifeT = 1 - (p.life / p.maxLife); // 0..1
    var alpha = Math.max(0, 1 - lifeT);
    ctx.save();
    ctx.translate(data.originX, data.originY);
    ctx.rotate(data.angle);
    var grad = ctx.createLinearGradient(0, 0, data.len, 0);
    grad.addColorStop(0, 'rgba(255,255,255,' + (0.0).toFixed(3) + ')');
    grad.addColorStop(0.4, 'rgba(255,236,180,' + (alpha * 0.7).toFixed(3) + ')');
    grad.addColorStop(1, 'rgba(255,180,80,' + (alpha * 0.9).toFixed(3) + ')');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(0, -data.width * 0.2);
    ctx.lineTo(data.len, -data.width);
    ctx.lineTo(data.len, data.width);
    ctx.lineTo(0, data.width * 0.2);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function drawWhipGlow(ctx, p) {
    var data = p.data;
    var alpha = Math.max(0, p.life / p.maxLife);
    ctx.save();
    ctx.translate(data.originX, data.originY);
    ctx.rotate(data.angle);
    ctx.fillStyle = 'rgba(255, 200, 120, ' + (alpha * 0.35).toFixed(3) + ')';
    ctx.beginPath();
    ctx.moveTo(0, -data.width * 0.25);
    ctx.lineTo(data.len, -data.width * 1.4);
    ctx.lineTo(data.len, data.width * 1.4);
    ctx.lineTo(0, data.width * 0.25);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function drawNova(ctx, p) {
    var data = p.data;
    var r = data.curR || 0;
    var fade = 1 - r / Math.max(1, data.maxR);
    if (fade < 0) fade = 0;
    ctx.strokeStyle = p.color;
    ctx.globalAlpha = fade;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(data.originX, data.originY, r, 0, TAU);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  function drawNovaGlow(ctx, p) {
    var data = p.data;
    var r = data.curR || 0;
    var fade = 1 - r / Math.max(1, data.maxR);
    if (fade < 0) fade = 0;
    ctx.strokeStyle = p.glow;
    ctx.globalAlpha = fade * 0.6;
    ctx.lineWidth = 12;
    ctx.beginPath();
    ctx.arc(data.originX, data.originY, r, 0, TAU);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  function drawBoomerang(ctx, p) {
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.t * 14);
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.moveTo(p.radius, 0);
    ctx.lineTo(0, p.radius);
    ctx.lineTo(-p.radius, 0);
    ctx.lineTo(0, -p.radius);
    ctx.closePath();
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    ctx.stroke();
    ctx.restore();
  }

  function drawBoomerangGlow(ctx, p) {
    var grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.radius * 2.5);
    grad.addColorStop(0, p.glow);
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.radius * 2.5, 0, TAU);
    ctx.fill();
  }

  function drawHoming(ctx, p) {
    var ang = Math.atan2(p.vy, p.vx);
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(ang);
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.moveTo(p.radius * 1.4, 0);
    ctx.lineTo(-p.radius, p.radius * 0.6);
    ctx.lineTo(-p.radius * 0.5, 0);
    ctx.lineTo(-p.radius, -p.radius * 0.6);
    ctx.closePath();
    ctx.fill();
    // little tail
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.beginPath();
    ctx.moveTo(-p.radius * 0.5, 0);
    ctx.lineTo(-p.radius * 1.8, p.radius * 0.3);
    ctx.lineTo(-p.radius * 1.8, -p.radius * 0.3);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function drawHomingGlow(ctx, p) {
    var grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.radius * 3);
    grad.addColorStop(0, p.glow);
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.radius * 3, 0, TAU);
    ctx.fill();
  }

  function draw(ctx, camera) {
    if (!ctx) return;
    var canvas = (BS.game && BS.game.getCanvas) ? BS.game.getCanvas() : null;

    // Pass 1: opaque/normal.
    for (var i = 0; i < list.length; i++) {
      var p = list[i];
      if (!rectCull(p, camera, canvas)) continue;
      switch (p.kind) {
        case 'shard': drawShard(ctx, p); break;
        case 'orb': drawOrb(ctx, p); break;
        case 'whip': drawWhip(ctx, p); break;
        case 'nova': drawNova(ctx, p); break;
        case 'boomerang': drawBoomerang(ctx, p); break;
        case 'homing': drawHoming(ctx, p); break;
      }
    }

    // Pass 2: additive glow.
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (var j = 0; j < list.length; j++) {
      var q = list[j];
      if (!rectCull(q, camera, canvas)) continue;
      switch (q.kind) {
        case 'shard': drawShardGlow(ctx, q); break;
        case 'orb': drawOrbGlow(ctx, q); break;
        case 'whip': drawWhipGlow(ctx, q); break;
        case 'nova': drawNovaGlow(ctx, q); break;
        case 'boomerang': drawBoomerangGlow(ctx, q); break;
        case 'homing': drawHomingGlow(ctx, q); break;
      }
    }
    ctx.restore();
  }

  BS.projectiles = {
    list: list,
    spawn: spawn,
    clear: clear,
    update: update,
    draw: draw,
    nearestEnemy: nearestEnemy
  };
})();
