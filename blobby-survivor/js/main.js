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
      // FEAT-003 will wire a proper game-over screen.
      if (BS.ui && BS.ui.hideOverlay) BS.ui.hideOverlay();
    }
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
    if (BS.spawner && BS.spawner.reset) BS.spawner.reset();

    if (BS.player && BS.player.createPlayer) {
      player = BS.player.createPlayer({ x: 0, y: 0 });
    }
    camera.x = 0;
    camera.y = 0;
    shakeAmp = 0;
    shakeT = 0;

    // Hook for enemy kills. FEAT-003 will spawn XP gems here.
    if (BS.enemies) {
      BS.enemies.onKilled = function (e) {
        if (player) player.kills++;
        if (BS.xp && typeof BS.xp.onEnemyKilled === 'function') {
          // Placeholder so FEAT-003 can plug in cleanly.
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
    if (dur > shakeT) shakeT = dur;
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
    if (BS.particles && BS.particles.update) BS.particles.update(dt);

    // Smoothly follow the player.
    var follow = 1 - Math.pow(0.001, dt);
    camera.x += (player.x - camera.x) * follow;
    camera.y += (player.y - camera.y) * follow;

    // Camera shake decay.
    if (shakeT > 0) {
      shakeT -= dt;
      if (shakeT < 0) shakeT = 0;
      var amp = shakeAmp * (shakeT > 0 ? shakeT / 0.25 : 0);
      shakeOffsetX = (Math.random() * 2 - 1) * amp;
      shakeOffsetY = (Math.random() * 2 - 1) * amp;
      if (shakeT === 0) shakeAmp = 0;
    } else {
      shakeOffsetX = 0;
      shakeOffsetY = 0;
    }

    if (!player.alive && scene === SCENE.PLAYING) {
      setScene(SCENE.GAMEOVER);
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

    if (BS.enemies && BS.enemies.draw) BS.enemies.draw(ctx, camera);
    if (BS.projectiles && BS.projectiles.draw) BS.projectiles.draw(ctx, camera);
    if (player && BS.player && BS.player.draw) BS.player.draw(ctx, player, camera);
    if (BS.particles && BS.particles.draw) BS.particles.draw(ctx);

    ctx.restore();
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
      } else if (scene === SCENE.GAMEOVER) {
        startNewRun();
      } else if (scene === SCENE.PAUSED) {
        setScene(SCENE.PLAYING);
      }
    });
    BS.input.onBlur = function () {
      if (scene === SCENE.PLAYING) setScene(SCENE.PAUSED);
    };
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
