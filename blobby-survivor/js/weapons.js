(function () {
  window.BS = window.BS || {};

  var TAU = Math.PI * 2;
  var U = BS.utils || {};

  function nearest(world, x, y) {
    if (BS.projectiles && BS.projectiles.nearestEnemy) {
      return BS.projectiles.nearestEnemy(world, x, y);
    }
    return null;
  }

  function dirToTargetOrAim(player, world) {
    var target = nearest(world, player.x, player.y);
    if (target) {
      var dx = target.x - player.x;
      var dy = target.y - player.y;
      var d = Math.sqrt(dx * dx + dy * dy);
      if (d > 0.001) return { x: dx / d, y: dy / d };
    }
    return { x: player.aimDir.x, y: player.aimDir.y };
  }

  // ----- Pulse Shard -----
  var pulseShard = {
    id: 'pulseShard',
    name: 'Pulse Shard',
    maxLevel: 5,
    desc: 'A piercing shard fired toward the nearest enemy.',
    baseCooldown: 1.0,
    levels: [
      { damage: 10, projectileCount: 1, projectileSpeed: 480, range: 600, area: 1, pierce: 0, cooldown: 1.00, extra: { spread: 0 } },
      { damage: 14, projectileCount: 1, projectileSpeed: 500, range: 620, area: 1, pierce: 0, cooldown: 0.90, extra: { spread: 0 } },
      { damage: 18, projectileCount: 2, projectileSpeed: 520, range: 640, area: 1, pierce: 1, cooldown: 0.80, extra: { spread: 0.12 } },
      { damage: 22, projectileCount: 2, projectileSpeed: 540, range: 660, area: 1, pierce: 1, cooldown: 0.72, extra: { spread: 0.16 } },
      { damage: 28, projectileCount: 3, projectileSpeed: 560, range: 680, area: 1, pierce: 1, cooldown: 0.65, extra: { spread: 0.22 } }
    ],
    onAcquire: function () { /* nothing */ },
    fire: function (player, weaponEntry, world) {
      var lvl = this.levels[Math.min(weaponEntry.level - 1, this.levels.length - 1)];
      var dir = dirToTargetOrAim(player, world);
      var count = lvl.projectileCount + (player.stats.projectileCountBonus || 0);
      var spread = (lvl.extra && lvl.extra.spread) || 0;
      var sp = lvl.projectileSpeed * (player.stats.projectileSpeedMul || 1);
      var dmg = lvl.damage * (player.stats.damageMul || 1);
      var life = lvl.range / Math.max(1, sp);
      var baseAngle = Math.atan2(dir.y, dir.x);
      for (var i = 0; i < count; i++) {
        var off = count === 1 ? 0 : ((i - (count - 1) / 2) * spread);
        var a = baseAngle + off;
        BS.projectiles.spawn({
          x: player.x,
          y: player.y,
          vx: Math.cos(a) * sp,
          vy: Math.sin(a) * sp,
          radius: 5,
          damage: dmg,
          life: life,
          pierce: lvl.pierce,
          knockback: 80,
          owner: 'player',
          kind: 'shard',
          color: '#9be7ff',
          glow: 'rgba(155, 231, 255, 0.7)'
        });
      }
      if (BS.audio && BS.audio.playShoot) BS.audio.playShoot();
    }
  };

  // ----- Halo Orbs -----
  var haloOrbs = {
    id: 'haloOrbs',
    name: 'Halo Orbs',
    maxLevel: 5,
    desc: 'Glowing orbs that orbit you and pulverize anything they touch.',
    baseCooldown: 999, // persistent, cooldown does not matter
    levels: [
      { damage: 6,  projectileCount: 2, projectileSpeed: 0, range: 0, area: 1, pierce: 0, cooldown: 999, extra: { orbitR: 60, orbitSpeed: 3.0 } },
      { damage: 9,  projectileCount: 3, projectileSpeed: 0, range: 0, area: 1, pierce: 0, cooldown: 999, extra: { orbitR: 65, orbitSpeed: 3.4 } },
      { damage: 12, projectileCount: 4, projectileSpeed: 0, range: 0, area: 1, pierce: 0, cooldown: 999, extra: { orbitR: 70, orbitSpeed: 3.8 } },
      { damage: 15, projectileCount: 5, projectileSpeed: 0, range: 0, area: 1, pierce: 0, cooldown: 999, extra: { orbitR: 75, orbitSpeed: 4.2 } },
      { damage: 18, projectileCount: 6, projectileSpeed: 0, range: 0, area: 1, pierce: 0, cooldown: 999, extra: { orbitR: 80, orbitSpeed: 4.5 } }
    ],
    rebuild: function (player, weaponEntry) {
      // Remove any prior orbs from this entry.
      var prior = weaponEntry.state.orbs || [];
      for (var i = 0; i < prior.length; i++) {
        prior[i].dead = true;
      }
      weaponEntry.state.orbs = [];
      var lvl = this.levels[Math.min(weaponEntry.level - 1, this.levels.length - 1)];
      var count = lvl.projectileCount + (player.stats.projectileCountBonus || 0);
      var orbitR = lvl.extra.orbitR * (player.stats.areaMul || 1);
      var orbitSpeed = lvl.extra.orbitSpeed;
      var dmg = lvl.damage * (player.stats.damageMul || 1);
      for (var k = 0; k < count; k++) {
        var ang = (k / count) * TAU;
        var orb = BS.projectiles.spawn({
          x: player.x + Math.cos(ang) * orbitR,
          y: player.y + Math.sin(ang) * orbitR,
          vx: 0, vy: 0,
          radius: 9,
          damage: dmg,
          life: 9999,
          pierce: 0,
          knockback: 60,
          owner: 'player',
          kind: 'orb',
          color: '#ffd271',
          glow: 'rgba(255, 210, 113, 0.7)',
          data: { angle: ang, orbitR: orbitR, orbitSpeed: orbitSpeed }
        });
        weaponEntry.state.orbs.push(orb);
      }
    },
    onAcquire: function (player, weaponEntry) {
      this.rebuild(player, weaponEntry);
    },
    tick: function (player, weaponEntry, dt, world) {
      // If any orbs were lost (e.g. on restart), rebuild.
      var orbs = weaponEntry.state.orbs || [];
      var alive = 0;
      for (var i = 0; i < orbs.length; i++) {
        if (orbs[i] && !orbs[i].dead && BS.projectiles.list.indexOf(orbs[i]) >= 0) alive++;
      }
      var lvl = this.levels[Math.min(weaponEntry.level - 1, this.levels.length - 1)];
      var expected = lvl.projectileCount + (player.stats.projectileCountBonus || 0);
      if (alive < expected) {
        this.rebuild(player, weaponEntry);
      }
    },
    fire: function () { /* persistent weapon, no on-cooldown firing */ }
  };

  // ----- Shockwave -----
  var shockwave = {
    id: 'shockwave',
    name: 'Shockwave',
    maxLevel: 5,
    desc: 'A ring of force that bursts outward from you.',
    baseCooldown: 3.0,
    levels: [
      { damage: 12, projectileCount: 1, projectileSpeed: 0, range: 90,  area: 1, pierce: 0, cooldown: 3.0, extra: { growRate: 240 } },
      { damage: 16, projectileCount: 1, projectileSpeed: 0, range: 110, area: 1, pierce: 0, cooldown: 2.6, extra: { growRate: 270 } },
      { damage: 20, projectileCount: 1, projectileSpeed: 0, range: 135, area: 1, pierce: 0, cooldown: 2.2, extra: { growRate: 300 } },
      { damage: 25, projectileCount: 1, projectileSpeed: 0, range: 160, area: 1, pierce: 0, cooldown: 1.9, extra: { growRate: 330 } },
      { damage: 30, projectileCount: 1, projectileSpeed: 0, range: 180, area: 1, pierce: 0, cooldown: 1.6, extra: { growRate: 360 } }
    ],
    onAcquire: function () { /* nothing */ },
    fire: function (player, weaponEntry, world) {
      var lvl = this.levels[Math.min(weaponEntry.level - 1, this.levels.length - 1)];
      var maxR = lvl.range * (player.stats.areaMul || 1);
      var grow = lvl.extra.growRate * (player.stats.areaMul || 1);
      BS.projectiles.spawn({
        x: player.x, y: player.y,
        vx: 0, vy: 0,
        radius: 8,
        damage: lvl.damage * (player.stats.damageMul || 1),
        life: maxR / Math.max(1, grow) + 0.05,
        pierce: 0,
        knockback: 140,
        owner: 'player',
        kind: 'nova',
        color: '#b9f0ff',
        glow: 'rgba(155, 231, 255, 0.6)',
        data: { originX: player.x, originY: player.y, growRate: grow, maxR: maxR, curR: 4 }
      });
    }
  };

  // ----- Seeker Mote -----
  var seekerMote = {
    id: 'seekerMote',
    name: 'Seeker Mote',
    maxLevel: 5,
    desc: 'Tiny motes that hunt the nearest enemy.',
    baseCooldown: 1.6,
    levels: [
      { damage: 8,  projectileCount: 1, projectileSpeed: 280, range: 900,  area: 1, pierce: 0, cooldown: 1.6, extra: { turnRate: 4.0 } },
      { damage: 11, projectileCount: 1, projectileSpeed: 300, range: 950,  area: 1, pierce: 0, cooldown: 1.4, extra: { turnRate: 5.0 } },
      { damage: 14, projectileCount: 2, projectileSpeed: 320, range: 1000, area: 1, pierce: 1, cooldown: 1.2, extra: { turnRate: 6.0 } },
      { damage: 17, projectileCount: 2, projectileSpeed: 340, range: 1050, area: 1, pierce: 1, cooldown: 1.0, extra: { turnRate: 7.0 } },
      { damage: 20, projectileCount: 3, projectileSpeed: 360, range: 1100, area: 1, pierce: 1, cooldown: 0.9, extra: { turnRate: 8.0 } }
    ],
    onAcquire: function () { /* nothing */ },
    fire: function (player, weaponEntry, world) {
      var lvl = this.levels[Math.min(weaponEntry.level - 1, this.levels.length - 1)];
      var count = lvl.projectileCount + (player.stats.projectileCountBonus || 0);
      var sp = lvl.projectileSpeed * (player.stats.projectileSpeedMul || 1);
      var dmg = lvl.damage * (player.stats.damageMul || 1);
      var life = lvl.range / Math.max(1, sp);
      for (var i = 0; i < count; i++) {
        var ang = (BS.utils.rand() * TAU);
        BS.projectiles.spawn({
          x: player.x,
          y: player.y,
          vx: Math.cos(ang) * sp,
          vy: Math.sin(ang) * sp,
          radius: 5,
          damage: dmg,
          life: life,
          pierce: lvl.pierce,
          knockback: 50,
          owner: 'player',
          kind: 'homing',
          color: '#a4ff7a',
          glow: 'rgba(164, 255, 122, 0.7)',
          data: { turnRate: lvl.extra.turnRate, target: null }
        });
      }
      if (BS.audio && BS.audio.playShoot) BS.audio.playShoot();
    }
  };

  // ----- Snap Whip -----
  var snapWhip = {
    id: 'snapWhip',
    name: 'Snap Whip',
    maxLevel: 5,
    desc: 'A short directional slash in front of you.',
    baseCooldown: 0.9,
    levels: [
      { damage: 14, projectileCount: 1, projectileSpeed: 0, range: 90,  area: 1, pierce: 0, cooldown: 0.90, extra: { widthDeg: 50 } },
      { damage: 18, projectileCount: 1, projectileSpeed: 0, range: 105, area: 1, pierce: 0, cooldown: 0.80, extra: { widthDeg: 58 } },
      { damage: 22, projectileCount: 1, projectileSpeed: 0, range: 120, area: 1, pierce: 0, cooldown: 0.70, extra: { widthDeg: 66 } },
      { damage: 26, projectileCount: 1, projectileSpeed: 0, range: 130, area: 1, pierce: 0, cooldown: 0.60, extra: { widthDeg: 74 } },
      { damage: 30, projectileCount: 1, projectileSpeed: 0, range: 140, area: 1, pierce: 0, cooldown: 0.50, extra: { widthDeg: 80 } }
    ],
    onAcquire: function () { /* nothing */ },
    fire: function (player, weaponEntry, world) {
      var lvl = this.levels[Math.min(weaponEntry.level - 1, this.levels.length - 1)];
      var range = lvl.range * (player.stats.areaMul || 1);
      var halfWidth = range * Math.tan((lvl.extra.widthDeg * Math.PI / 180) / 2);
      var dir = player.aimDir;
      // If aim is somehow zero, point at nearest enemy.
      if (Math.abs(dir.x) + Math.abs(dir.y) < 0.001) {
        dir = dirToTargetOrAim(player, world);
      }
      var ang = Math.atan2(dir.y, dir.x);
      BS.projectiles.spawn({
        x: player.x, y: player.y,
        vx: 0, vy: 0,
        radius: 4,
        damage: lvl.damage * (player.stats.damageMul || 1),
        life: 0.18,
        pierce: 0,
        knockback: 120,
        owner: 'player',
        kind: 'whip',
        color: '#ffd28a',
        glow: 'rgba(255, 200, 120, 0.6)',
        data: {
          originX: player.x,
          originY: player.y,
          len: range,
          width: Math.max(14, halfWidth),
          angle: ang,
          anchorPlayer: true
        }
      });
      if (BS.audio && BS.audio.playShoot) BS.audio.playShoot();
    }
  };

  // ----- Rangboom -----
  var rangboom = {
    id: 'rangboom',
    name: 'Rangboom',
    maxLevel: 5,
    desc: 'A bladed ring thrown forward that returns to you.',
    baseCooldown: 1.8,
    levels: [
      { damage: 12, projectileCount: 1, projectileSpeed: 360, range: 220, area: 1, pierce: 2, cooldown: 1.80, extra: {} },
      { damage: 16, projectileCount: 1, projectileSpeed: 380, range: 250, area: 1, pierce: 3, cooldown: 1.55, extra: {} },
      { damage: 20, projectileCount: 1, projectileSpeed: 400, range: 280, area: 1, pierce: 3, cooldown: 1.35, extra: {} },
      { damage: 23, projectileCount: 1, projectileSpeed: 420, range: 310, area: 1, pierce: 4, cooldown: 1.15, extra: {} },
      { damage: 26, projectileCount: 1, projectileSpeed: 440, range: 340, area: 1, pierce: 5, cooldown: 1.00, extra: {} }
    ],
    onAcquire: function () { /* nothing */ },
    fire: function (player, weaponEntry, world) {
      var lvl = this.levels[Math.min(weaponEntry.level - 1, this.levels.length - 1)];
      var dir = player.aimDir;
      if (Math.abs(dir.x) + Math.abs(dir.y) < 0.001) {
        dir = dirToTargetOrAim(player, world);
      }
      var sp = lvl.projectileSpeed * (player.stats.projectileSpeedMul || 1);
      var throwDist = lvl.range * (player.stats.areaMul || 1);
      BS.projectiles.spawn({
        x: player.x, y: player.y,
        vx: dir.x * sp, vy: dir.y * sp,
        radius: 10,
        damage: lvl.damage * (player.stats.damageMul || 1),
        life: 6, // generous; weapon kills itself when it returns
        pierce: lvl.pierce,
        knockback: 90,
        owner: 'player',
        kind: 'boomerang',
        color: '#ffb066',
        glow: 'rgba(255, 176, 102, 0.7)',
        data: {
          originX: player.x,
          originY: player.y,
          throwDist: throwDist,
          returning: false,
          returnSpeed: sp * 1.05,
          anchorPlayer: true
        }
      });
      if (BS.audio && BS.audio.playShoot) BS.audio.playShoot();
    }
  };

  var WEAPONS = {
    pulseShard: pulseShard,
    haloOrbs: haloOrbs,
    shockwave: shockwave,
    seekerMote: seekerMote,
    snapWhip: snapWhip,
    rangboom: rangboom
  };

  function findEntry(player, id) {
    for (var i = 0; i < player.weapons.length; i++) {
      if (player.weapons[i].id === id) return player.weapons[i];
    }
    return null;
  }

  function grant(player, id) {
    var def = WEAPONS[id];
    if (!def || !player) return 'unknown';
    var entry = findEntry(player, id);
    if (!entry) {
      entry = { id: id, level: 1, cooldownLeft: 0, state: {} };
      player.weapons.push(entry);
      if (typeof def.onAcquire === 'function') def.onAcquire(player, entry);
      return 'new';
    }
    if (entry.level < def.maxLevel) {
      entry.level++;
      if (typeof def.onAcquire === 'function') def.onAcquire(player, entry);
      return 'leveled';
    }
    return 'maxed';
  }

  function tickAll(player, dt, world) {
    if (!player || !player.weapons) return;
    var coolMul = (player.stats.cooldownMul || 1) * (player.stats.attackSpeedMul || 1);
    if (coolMul <= 0) coolMul = 1;
    var step = dt / coolMul;
    for (var i = 0; i < player.weapons.length; i++) {
      var entry = player.weapons[i];
      var def = WEAPONS[entry.id];
      if (!def) continue;
      // Always tick (for persistent weapons).
      if (typeof def.tick === 'function') {
        def.tick(player, entry, dt, world);
      }
      entry.cooldownLeft -= step;
      if (entry.cooldownLeft <= 0) {
        if (typeof def.fire === 'function') {
          def.fire(player, entry, world);
        }
        var lvl = def.levels[Math.min(entry.level - 1, def.levels.length - 1)];
        var cd = (lvl && lvl.cooldown != null) ? lvl.cooldown : def.baseCooldown;
        entry.cooldownLeft = cd;
      }
    }
  }

  function summary(player) {
    var out = [];
    if (!player || !player.weapons) return out;
    for (var i = 0; i < player.weapons.length; i++) {
      var entry = player.weapons[i];
      var def = WEAPONS[entry.id];
      if (!def) continue;
      out.push({ id: entry.id, name: def.name, level: entry.level, maxLevel: def.maxLevel });
    }
    return out;
  }

  BS.weapons = {
    WEAPONS: WEAPONS,
    grant: grant,
    tickAll: tickAll,
    summary: summary
  };
})();
