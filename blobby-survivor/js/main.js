// main.js: canvas/camera setup, scene state machine, run lifecycle, and the requestAnimationFrame loop wiring all modules.
(function () {
  window.BS = window.BS || {};

  var SCENE = {
    TITLE: 'TITLE',
    PLAYING: 'PLAYING',
    PAUSED: 'PAUSED',
    LEVELUP: 'LEVELUP',
    GAMEOVER: 'GAMEOVER'
  };

  var canvas = null;
  var ctx = null;
  var scene = SCENE.TITLE;
  var player = null;
  var camera = { x: 0, y: 0 };
  var lastTs = 0;

  // Camera shake state.
  var shakeAmp = 0;
  var shakeT = 0;
  var shakeDur = 0.25;
  var shakeOffsetX = 0;
  var shakeOffsetY = 0;

  // Debug shortcuts wired once.
  var debugWired = false;

  function setScene(next) {
    scene = next;
    if (scene === SCENE.TITLE) {
      if (BS.ui && BS.ui.showTitle) BS.ui.showTitle();
    } else if (scene === SCENE.PAUSED) {
      if (BS.ui && BS.ui.showPause) BS.ui.showPause();
    } else if (scene === SCENE.PLAYING) {
      if (BS.ui && BS.ui.hideOverlay) BS.ui.hideOverlay();
    } else if (scene === SCENE.GAMEOVER) {
      // Game-over overlay is shown by triggerGameOver() so it has access to stats.
    }
    // LEVELUP overlay is opened by openLevelUp() with the rolled choices.
  }

  function resize() {
    if (!canvas) return;
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }

  function startNewRun() {
    if (BS.projectiles && BS.projectiles.clear) BS.projectiles.clear();
    if (BS.enemies && BS.enemies.clear) BS.enemies.clear();
    if (BS.particles && BS.particles.clear) BS.particles.clear();
    if (BS.xp && BS.xp.clear) BS.xp.clear();
    if (BS.spawner && BS.spawner.reset) BS.spawner.reset();
    if (BS.ui && BS.ui._resetActive) BS.ui._resetActive();

    if (BS.player && BS.player.createPlayer) {
      player = BS.player.createPlayer({ x: 0, y: 0 });
    }
    player._pendingLevelUps = 0;
    player._passiveStacks = {};
    camera.x = 0;
    camera.y = 0;
    shakeAmp = 0;
    shakeT = 0;
    shakeDur = 0.25;

    // Hook for enemy kills: count + drop XP gem.
    if (BS.enemies) {
      BS.enemies.onKilled = function (e) {
        if (player) player.kills++;
        if (BS.xp && typeof BS.xp.onEnemyKilled === 'function') {
          BS.xp.onEnemyKilled(e);
        }
      };
    }

    if (BS.weapons && BS.weapons.grant && player) {
      BS.weapons.grant(player, 'pulseShard');
    }

    setScene(SCENE.PLAYING);
  }

  function pause() {
    if (scene === SCENE.PLAYING) setScene(SCENE.PAUSED);
  }

  function resume() {
    if (scene === SCENE.PAUSED) setScene(SCENE.PLAYING);
  }

  function togglePause() {
    if (scene === SCENE.PLAYING) setScene(SCENE.PAUSED);
    else if (scene === SCENE.PAUSED) setScene(SCENE.PLAYING);
  }

  function shake(amp, dur) {
    if (amp > shakeAmp) shakeAmp = amp;
    if (dur > shakeT) {
      shakeT = dur;
      shakeDur = dur;
    }
  }

  function buildGameOverStats() {
    var elapsed = (BS.spawner && typeof BS.spawner.getElapsed === 'function')
      ? BS.spawner.getElapsed()
      : (BS.spawner && BS.spawner.state ? BS.spawner.state.elapsed : 0);
    var ws = (BS.weapons && BS.weapons.summary && player) ? BS.weapons.summary(player) : [];
    return {
      timeSec: elapsed,
      level: player ? player.level : 1,
      kills: player ? player.kills : 0,
      weapons: ws,
      cause: 'You were swarmed.'
    };
  }

  function triggerGameOver() {
    setScene(SCENE.GAMEOVER);
    if (BS.ui && BS.ui.showGameOver) {
      BS.ui.showGameOver(buildGameOverStats(), startNewRun);
    }
  }

  // Open a level-up card for the next pending event. Recurses (via onPick) until 0.
  function openLevelUp() {
    if (!player) return;
    if (!BS.upgrades || !BS.upgrades.roll || !BS.ui || !BS.ui.showLevelUp) {
      // Without an upgrade pool, just consume pending and resume.
      player._pendingLevelUps = 0;
      setScene(SCENE.PLAYING);
      return;
    }
    setScene(SCENE.LEVELUP);
    var choices = BS.upgrades.roll(player, 3);
    BS.ui.showLevelUp(choices, function onPick(choice) {
      try { choice.apply(player); } catch (e) { /* swallow */ }
      if (BS.audio && BS.audio.playLevelUp) BS.audio.playLevelUp();
      if (player._pendingLevelUps > 0) {
        player._pendingLevelUps -= 1;
        // If still more pending, re-open immediately with a fresh pool.
        if (player._pendingLevelUps > 0) {
          var next = BS.upgrades.roll(player, 3);
          BS.ui.showLevelUp(next, onPick);
          return;
        }
      }
      // No more pending: resume.
      if (BS.ui && BS.ui.hideOverlay) BS.ui.hideOverlay();
      setScene(SCENE.PLAYING);
    });
  }

  function update(dt) {
    if (scene !== SCENE.PLAYING) return;
    if (!player) return;

    var world = { player: player, enemies: BS.enemies ? BS.enemies.list : [] };

    if (BS.player && BS.player.update) BS.player.update(player, dt, BS.input);
    if (BS.spawner && BS.spawner.update) BS.spawner.update(dt, world);
    if (BS.weapons && BS.weapons.tickAll) BS.weapons.tickAll(player, dt, world);
    if (BS.projectiles && BS.projectiles.update) BS.projectiles.update(dt, world);
    if (BS.enemies && BS.enemies.update) BS.enemies.update(dt, world);
    if (BS.xp && BS.xp.update) BS.xp.update(dt, player);
    if (BS.particles && BS.particles.update) BS.particles.update(dt);

    // Smoothly follow the player.
    var follow = 1 - Math.pow(0.001, dt);
    camera.x += (player.x - camera.x) * follow;
    camera.y += (player.y - camera.y) * follow;

    // Camera shake decay.
    if (shakeT > 0) {
      shakeT -= dt;
      if (shakeT < 0) shakeT = 0;
      var dur = shakeDur > 0 ? shakeDur : 0.25;
      var amp = shakeAmp * (shakeT > 0 ? shakeT / dur : 0);
      shakeOffsetX = (Math.random() * 2 - 1) * amp;
      shakeOffsetY = (Math.random() * 2 - 1) * amp;
      if (shakeT === 0) shakeAmp = 0;
    } else {
      shakeOffsetX = 0;
      shakeOffsetY = 0;
    }

    // Death: open game over.
    if (!player.alive && scene === SCENE.PLAYING) {
      triggerGameOver();
      return;
    }

    // Level-up: open chooser one at a time. Multi-level-up bookkeeping is
    // split between two consumers: this update() pulls the FIRST pending event
    // off the counter and opens the level-up overlay, while openLevelUp's
    // onPick callback below pulls each SUBSEQUENT one as the player picks.
    if (player._pendingLevelUps && player._pendingLevelUps > 0 && scene === SCENE.PLAYING) {
      player._pendingLevelUps -= 1;
      openLevelUp();
    }
  }

  function drawGrid() {
    if (!ctx || !canvas) return;
    var size = 64;
    var w = canvas.width;
    var h = canvas.height;

    var leftWorld = camera.x - w / 2;
    var topWorld = camera.y - h / 2;
    var rightWorld = leftWorld + w;
    var bottomWorld = topWorld + h;

    var startX = Math.floor(leftWorld / size) * size;
    var startY = Math.floor(topWorld / size) * size;

    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(120, 160, 220, 0.10)';
    ctx.beginPath();
    for (var x = startX; x <= rightWorld; x += size) {
      ctx.moveTo(x, topWorld);
      ctx.lineTo(x, bottomWorld);
    }
    for (var y = startY; y <= bottomWorld; y += size) {
      ctx.moveTo(leftWorld, y);
      ctx.lineTo(rightWorld, y);
    }
    ctx.stroke();

    // Brighter cross at world origin.
    ctx.strokeStyle = 'rgba(160, 200, 255, 0.25)';
    ctx.beginPath();
    ctx.moveTo(-size, 0);
    ctx.lineTo(size, 0);
    ctx.moveTo(0, -size);
    ctx.lineTo(0, size);
    ctx.stroke();
  }

  function draw() {
    if (!ctx || !canvas) return;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#0e1320';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    if (scene === SCENE.TITLE) {
      return;
    }

    ctx.save();
    ctx.translate(
      -camera.x + canvas.width / 2 + shakeOffsetX,
      -camera.y + canvas.height / 2 + shakeOffsetY
    );

    drawGrid();

    if (BS.xp && BS.xp.draw) BS.xp.draw(ctx, camera);
    if (BS.enemies && BS.enemies.draw) BS.enemies.draw(ctx, camera);
    if (BS.projectiles && BS.projectiles.draw) BS.projectiles.draw(ctx, camera);
    if (player && BS.player && BS.player.draw) BS.player.draw(ctx, player, camera);
    if (BS.particles && BS.particles.draw) BS.particles.draw(ctx);

    ctx.restore();

    // HUD updates each frame while we have a player (keeps bars/labels live during PAUSED/LEVELUP too).
    if (BS.ui && BS.ui.renderHUD && player) {
      var elapsed = (BS.spawner && typeof BS.spawner.getElapsed === 'function')
        ? BS.spawner.getElapsed()
        : (BS.spawner && BS.spawner.state ? BS.spawner.state.elapsed : 0);
      BS.ui.renderHUD({ player: player, elapsedSec: elapsed, kills: player.kills });
    }
  }

  function frame(ts) {
    if (!lastTs) lastTs = ts;
    var realDt = (ts - lastTs) / 1000;
    lastTs = ts;
    var dt = Math.min(realDt, 1 / 30);
    if (dt < 0) dt = 0;

    update(dt);
    draw();

    window.requestAnimationFrame(frame);
  }

  function wireDebug() {
    if (debugWired) return;
    debugWired = true;
    if (typeof window.location === 'undefined') return;
    if (window.location.hash !== '#debug') return;

    var ids = ['pulseShard', 'haloOrbs', 'shockwave', 'seekerMote', 'snapWhip', 'rangboom'];
    for (var i = 0; i < ids.length; i++) {
      (function (idx) {
        BS.input.onKeyDown('Digit' + (idx + 1), function () {
          if (scene !== SCENE.PLAYING) return; // don't fight LevelUp keys
          if (!player || !BS.weapons || !BS.weapons.grant) return;
          var res = BS.weapons.grant(player, ids[idx]);
          if (BS.ui && BS.ui.showToast) {
            BS.ui.showToast('debug: ' + ids[idx] + ' ' + res, 1200);
          }
        });
      })(i);
    }
    BS.input.onKeyDown('Digit0', function () {
      if (!player) return;
      try {
        // eslint-disable-next-line no-console
        console.log('player.stats', player.stats);
        // eslint-disable-next-line no-console
        console.log('player.weapons', player.weapons);
      } catch (e) { /* ignore */ }
    });
  }

  function wireInput() {
    if (!BS.input) return;
    BS.input.onKeyDown('Escape', function () {
      if (scene === SCENE.PLAYING) setScene(SCENE.PAUSED);
      else if (scene === SCENE.PAUSED) setScene(SCENE.PLAYING);
    });
    BS.input.onKeyDown('Enter', function () {
      if (scene === SCENE.TITLE) {
        if (BS.audio && BS.audio.init) BS.audio.init();
        startNewRun();
      } else if (scene === SCENE.PAUSED) {
        setScene(SCENE.PLAYING);
      }
      // GAMEOVER's Enter is handled by ui.js (activeRestart).
      // LEVELUP's Enter activates the focused card via the browser.
    });
    BS.input.onBlur(function () {
      if (scene === SCENE.PLAYING) setScene(SCENE.PAUSED);
    });
    wireDebug();
  }

  function boot() {
    canvas = document.getElementById('game');
    if (!canvas) return;
    ctx = canvas.getContext('2d');
    window.addEventListener('resize', resize);
    resize();

    wireInput();
    setScene(SCENE.TITLE);
    window.requestAnimationFrame(frame);
  }

  BS.game = {
    SCENE: SCENE,
    startNewRun: startNewRun,
    pause: pause,
    resume: resume,
    togglePause: togglePause,
    shake: shake,
    getScene: function () { return scene; },
    getPlayer: function () { return player; },
    getCamera: function () { return camera; },
    getCanvas: function () { return canvas; },
    getCtx: function () { return ctx; }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
