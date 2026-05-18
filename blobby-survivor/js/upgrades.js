// upgrades.js: upgrade pool (new weapons, weapon level-ups, passives) with weighted rolling for the level-up screen.
(function () {
  window.BS = window.BS || {};

  var U = BS.utils || {};

  // Helper: get the player's weapon entry by id (or null).
  function findWeapon(player, id) {
    if (!player || !player.weapons) return null;
    for (var i = 0; i < player.weapons.length; i++) {
      if (player.weapons[i].id === id) return player.weapons[i];
    }
    return null;
  }

  // ---------- Passive entries ----------
  // Each passive tracks its stack count on player._passiveStacks.
  function getStacks(player) {
    if (!player._passiveStacks) player._passiveStacks = {};
    return player._passiveStacks;
  }

  function passive(id, name, desc, applyFn, opts) {
    opts = opts || {};
    return {
      id: id,
      name: name,
      desc: desc,
      kind: 'passive',
      maxStacks: opts.maxStacks != null ? opts.maxStacks : 5,
      rarityWeight: opts.rarityWeight != null ? opts.rarityWeight : 1.0,
      currentStacks: function (player) {
        return (getStacks(player)[id] || 0);
      },
      apply: function (player) {
        applyFn(player);
        var s = getStacks(player);
        s[id] = (s[id] || 0) + 1;
      }
    };
  }

  var PASSIVES = [
    passive(
      'vitalBloom',
      'Vital Bloom',
      '+20 max HP. Full heal on first stack, then heal 20.',
      function (player) {
        var first = !((player._passiveStacks || {}).vitalBloom);
        player.maxHp += 20;
        if (first) {
          player.hp = player.maxHp;
        } else {
          if (BS.player && BS.player.heal) BS.player.heal(player, 20);
          else player.hp = Math.min(player.maxHp, player.hp + 20);
        }
      }
    ),
    passive(
      'swiftGoo',
      'Swift Goo',
      '+8% move speed.',
      function (player) {
        player.stats.moveSpeedMul *= 1.08;
      }
    ),
    passive(
      'sharpSpirit',
      'Sharp Spirit',
      '+10% damage.',
      function (player) {
        player.stats.damageMul *= 1.10;
      }
    ),
    passive(
      'quickReflex',
      'Quick Reflex',
      '-7% cooldown.',
      function (player) {
        player.stats.cooldownMul *= 0.93;
      }
    ),
    passive(
      'widePull',
      'Wide Pull',
      '+25% pickup radius.',
      function (player) {
        player.stats.pickupRadius *= 1.25;
      }
    ),
    passive(
      'extraVolley',
      'Extra Volley',
      '+1 projectile for forward weapons.',
      function (player) {
        player.stats.projectileCountBonus = (player.stats.projectileCountBonus || 0) + 1;
        // Halo Orbs counts orbs from this bonus too: rebuild if owned.
        var halo = findWeapon(player, 'haloOrbs');
        var def = BS.weapons && BS.weapons.WEAPONS && BS.weapons.WEAPONS.haloOrbs;
        if (halo && def && typeof def.rebuild === 'function') {
          def.rebuild(player, halo);
        }
      },
      { maxStacks: 3, rarityWeight: 0.7 }
    ),
    passive(
      'toughSkin',
      'Tough Skin',
      '+5 armor.',
      function (player) {
        player.stats.armor += 5;
      }
    ),
    passive(
      'luckyStrike',
      'Lucky Strike',
      '+5% crit chance, +25% crit damage.',
      function (player) {
        player.stats.critChance += 0.05;
        player.stats.critMul += 0.25;
      },
      { rarityWeight: 0.7 }
    ),
    passive(
      'steadyMend',
      'Steady Mend',
      '+0.5 HP/sec regen.',
      function (player) {
        player.stats.regenPerSec += 0.5;
      }
    )
  ];

  // ---------- Weapon entries (built dynamically per roll) ----------
  function buildWeaponNew(id, def) {
    return {
      id: 'weaponNew_' + id,
      weaponId: id,
      name: def.name,
      desc: def.desc || ('Unlock ' + def.name + '.'),
      kind: 'weapon-new',
      maxStacks: 1,
      rarityWeight: 1.0,
      currentStacks: function (player) {
        return findWeapon(player, id) ? 1 : 0;
      },
      apply: function (player) {
        if (BS.weapons && BS.weapons.grant) BS.weapons.grant(player, id);
      }
    };
  }

  function buildWeaponUp(id, def) {
    return {
      id: 'weaponUp_' + id,
      weaponId: id,
      name: def.name + ' +1',
      desc: (def.desc || '') + ' Level up to increase damage and effect.',
      kind: 'weapon-up',
      maxStacks: def.maxLevel,
      rarityWeight: 1.0,
      currentStacks: function (player) {
        var w = findWeapon(player, id);
        return w ? w.level : 0;
      },
      apply: function (player) {
        if (BS.weapons && BS.weapons.grant) BS.weapons.grant(player, id);
      }
    };
  }

  // ---------- Filler ----------
  var smallHeal = {
    id: 'smallHeal',
    name: 'Small Heal',
    desc: 'Restore 15 HP.',
    kind: 'heal',
    maxStacks: 9999,
    rarityWeight: 0.5,
    currentStacks: function () { return 0; },
    apply: function (player) {
      if (BS.player && BS.player.heal) BS.player.heal(player, 15);
      else if (player) player.hp = Math.min(player.maxHp, player.hp + 15);
    }
  };

  // ---------- Roll ----------
  function buildCandidates(player) {
    var out = [];
    var WEAPONS = (BS.weapons && BS.weapons.WEAPONS) || {};

    // Weapon entries.
    var ids = Object.keys(WEAPONS);
    for (var i = 0; i < ids.length; i++) {
      var id = ids[i];
      var def = WEAPONS[id];
      if (!def) continue;
      var owned = findWeapon(player, id);
      if (!owned) {
        // Limit count: only offer "weapon-new" if we haven't filled inventory cap (6 max).
        if (player.weapons.length < 6) {
          out.push(buildWeaponNew(id, def));
        }
      } else if (owned.level < def.maxLevel) {
        out.push(buildWeaponUp(id, def));
      }
    }

    // Passives.
    for (var j = 0; j < PASSIVES.length; j++) {
      var p = PASSIVES[j];
      if (p.currentStacks(player) < p.maxStacks) out.push(p);
    }

    return out;
  }

  function pickWeighted(arr) {
    var total = 0;
    for (var i = 0; i < arr.length; i++) total += (arr[i].rarityWeight || 1);
    if (total <= 0) return arr[0];
    var r = (U.rand ? U.rand() : Math.random()) * total;
    for (var j = 0; j < arr.length; j++) {
      r -= (arr[j].rarityWeight || 1);
      if (r <= 0) return arr[j];
    }
    return arr[arr.length - 1];
  }

  function roll(player, n) {
    if (!n || n < 1) n = 3;
    var pool = buildCandidates(player);
    var chosen = [];
    var used = {};
    while (chosen.length < n && pool.length > 0) {
      // Filter out already-chosen identifiers.
      var available = [];
      for (var i = 0; i < pool.length; i++) {
        if (!used[pool[i].id]) available.push(pool[i]);
      }
      if (available.length === 0) break;
      var pick = pickWeighted(available);
      chosen.push(pick);
      used[pick.id] = true;
    }
    while (chosen.length < n) {
      chosen.push(smallHeal);
    }
    return chosen;
  }

  BS.upgrades = {
    PASSIVES: PASSIVES,
    smallHeal: smallHeal,
    buildCandidates: buildCandidates,
    roll: roll
  };
})();
