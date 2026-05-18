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

  function setScene(next) {
    scene = next;
    if (scene === SCENE.TITLE) {
      if (BS.ui && BS.ui.showTitle) BS.ui.showTitle();
    } else if (scene === SCENE.PAUSED) {
      if (BS.ui && BS.ui.showPause) BS.ui.showPause();
    } else if (scene === SCENE.PLAYING) {
      if (BS.ui && BS.ui.hideOverlay) BS.ui.hideOverlay();
    }
  }

  function resize() {
    if (!canvas) return;
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }

  function startNewRun() {
    if (BS.player && BS.player.createPlayer) {
      player = BS.player.createPlayer({ x: 0, y: 0 });
    }
    camera.x = 0;
    camera.y = 0;
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

  function update(dt) {
    if (scene !== SCENE.PLAYING) return;
    if (player && BS.player && BS.player.update) {
      BS.player.update(player, dt, BS.input);
    }
    if (player) {
      // Smoothly follow the player.
      var follow = 1 - Math.pow(0.001, dt); // ~snappy
      camera.x += (player.x - camera.x) * follow;
      camera.y += (player.y - camera.y) * follow;
    }
  }

  function drawGrid() {
    if (!ctx || !canvas) return;
    var size = 64;
    var w = canvas.width;
    var h = canvas.height;

    // Compute the world-space bounds visible on screen.
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

    // A brighter cross at world origin so the player can see "where home is".
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

    // Background fill (dark).
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#0e1320';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    if (scene === SCENE.TITLE) {
      // Title scene: just leave a dark canvas; overlay div renders the title.
      return;
    }

    // World transform: camera centered.
    ctx.save();
    ctx.translate(-camera.x + canvas.width / 2, -camera.y + canvas.height / 2);

    drawGrid();

    if (player && BS.player && BS.player.draw) {
      BS.player.draw(ctx, player, camera);
    }

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
  }

  function boot() {
    canvas = document.getElementById('game');
    if (!canvas) {
      // No canvas: bail. Should not happen if HTML is correct.
      return;
    }
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
