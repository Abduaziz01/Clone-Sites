(function () {
  window.BS = window.BS || {};

  var TAU = Math.PI * 2;
  var U = BS.utils || {};

  var state = {
    elapsed: 0,
    nextSpawnIn: 0,
    nextBossIn: 120,
    bossesSpawned: 0,
    lastMilestoneIdx: -1
  };

  // Time-survived milestones in seconds.
  var MILESTONES = [60, 120, 180, 300, 600];

  function fmtMmSs(sec) {
    var s = Math.floor(sec);
    var mm = Math.floor(s / 60);
    var ss = s % 60;
    var mmStr = mm < 10 ? ('0' + mm) : ('' + mm);
    var ssStr = ss < 10 ? ('0' + ss) : ('' + ss);
    return mmStr + ':' + ssStr;
  }

  function reset() {
    state.elapsed = 0;
    state.nextSpawnIn = 0;
    state.nextBossIn = 120;
    state.bossesSpawned = 0;
    state.lastMilestoneIdx = -1;
  }

  function getElapsed() {
    return state.elapsed;
  }

  function spawnInterval(t) {
    var v = 1.2 - t / 240;
    if (v < 0.18) v = 0.18;
    return v;
  }

  function countPerSpawn(t) {
    var n = 1 + Math.floor(t / 60);
    if (n < 1) n = 1;
    if (n > 6) n = 6;
    return n;
  }

  function pickType(t) {
    var weights;
    if (t < 60) {
      weights = [['slime', 90], ['runner', 10]];
    } else if (t < 150) {
      weights = [['slime', 55], ['runner', 35], ['lurker', 10]];
    } else if (t < 240) {
      weights = [['slime', 35], ['runner', 30], ['lurker', 25], ['brute', 10]];
    } else {
      weights = [['slime', 20], ['runner', 25], ['lurker', 30], ['brute', 25]];
    }
    var total = 0;
    for (var i = 0; i < weights.length; i++) total += weights[i][1];
    var r = (U.rand ? U.rand() : Math.random()) * total;
    for (var j = 0; j < weights.length; j++) {
      r -= weights[j][1];
      if (r <= 0) return weights[j][0];
    }
    return weights[weights.length - 1][0];
  }

  function pickSpawnPoint() {
    var camera = (BS.game && BS.game.getCamera) ? BS.game.getCamera() : { x: 0, y: 0 };
    var canvas = (BS.game && BS.game.getCanvas) ? BS.game.getCanvas() : null;
    var w = canvas ? canvas.width : 1280;
    var h = canvas ? canvas.height : 720;
    var dist = Math.max(w, h) / 2 + 80;
    var theta = (U.rand ? U.rand() : Math.random()) * TAU;
    return {
      x: camera.x + Math.cos(theta) * dist,
      y: camera.y + Math.sin(theta) * dist
    };
  }

  function spawnBoss() {
    state.bossesSpawned++;
    var pos = pickSpawnPoint();
    var hpMul = 1 + state.elapsed / 90;
    var dmgMul = 1 + state.elapsed / 180;
    if (BS.enemies && BS.enemies.spawn) {
      BS.enemies.spawn('husk', pos.x, pos.y, hpMul, dmgMul, 1);
    }
    if (BS.ui && typeof BS.ui.showToast === 'function') {
      BS.ui.showToast('A Husk approaches', 2500);
    }
  }

  function update(dt, world) {
    if (!world || !world.player || !world.player.alive) return;
    state.elapsed += dt;
    state.nextSpawnIn -= dt;
    state.nextBossIn -= dt;

    if (state.nextSpawnIn <= 0) {
      state.nextSpawnIn = spawnInterval(state.elapsed);
      var n = countPerSpawn(state.elapsed);
      var hpMul = 1 + state.elapsed / 90;
      var dmgMul = 1 + state.elapsed / 180;
      for (var i = 0; i < n; i++) {
        var type = pickType(state.elapsed);
        var pos = pickSpawnPoint();
        if (BS.enemies && BS.enemies.spawn) {
          BS.enemies.spawn(type, pos.x, pos.y, hpMul, dmgMul, 1);
        }
      }
    }

    if (state.nextBossIn <= 0) {
      state.nextBossIn = 120;
      spawnBoss();
    }

    // Milestone toasts: fire each at most once.
    for (var k = state.lastMilestoneIdx + 1; k < MILESTONES.length; k++) {
      if (state.elapsed >= MILESTONES[k]) {
        state.lastMilestoneIdx = k;
        if (BS.ui && typeof BS.ui.showToast === 'function') {
          BS.ui.showToast('Survived ' + fmtMmSs(MILESTONES[k]) + '...', 2200);
        }
      } else {
        break;
      }
    }
  }

  BS.spawner = {
    state: state,
    reset: reset,
    update: update,
    spawnInterval: spawnInterval,
    countPerSpawn: countPerSpawn,
    pickType: pickType,
    getElapsed: getElapsed,
    MILESTONES: MILESTONES
  };
})();
