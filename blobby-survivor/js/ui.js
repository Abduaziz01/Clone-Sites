(function () {
  window.BS = window.BS || {};

  function el() {
    return document.getElementById('overlay');
  }

  function show(html) {
    var overlay = el();
    if (!overlay) return;
    overlay.innerHTML = html;
    overlay.classList.add('visible');
    overlay.classList.remove('hidden');
  }

  function hideOverlay() {
    var overlay = el();
    if (!overlay) return;
    overlay.innerHTML = '';
    overlay.classList.remove('visible');
    overlay.classList.add('hidden');
  }

  function showTitle() {
    show(
      '<div class="panel">' +
        '<h1 class="title">Blobby Survivor</h1>' +
        '<p class="subtitle">Survive the blob horde</p>' +
        '<button class="button" id="startBtn" type="button">Start</button>' +
        '<p class="hint">' +
          'WASD or Arrow keys to move' +
          '<br/>Esc to pause' +
          '<br/>M to mute' +
        '</p>' +
      '</div>'
    );
    var btn = document.getElementById('startBtn');
    if (btn) {
      btn.addEventListener('click', function () {
        if (BS.audio && typeof BS.audio.init === 'function') BS.audio.init();
        if (BS.game && typeof BS.game.startNewRun === 'function') BS.game.startNewRun();
      });
      // Auto-focus so Enter triggers the button.
      try { btn.focus(); } catch (e) { /* ignore */ }
    }
  }

  function showPause() {
    show(
      '<div class="panel">' +
        '<h1 class="title">Paused</h1>' +
        '<p class="subtitle">Take a breath.</p>' +
        '<button class="button" id="resumeBtn" type="button">Resume</button>' +
        '<p class="hint">Press Esc to resume</p>' +
      '</div>'
    );
    var btn = document.getElementById('resumeBtn');
    if (btn) {
      btn.addEventListener('click', function () {
        if (BS.game && typeof BS.game.resume === 'function') BS.game.resume();
      });
      try { btn.focus(); } catch (e) { /* ignore */ }
    }
  }

  BS.ui = {
    showTitle: showTitle,
    showPause: showPause,
    hideOverlay: hideOverlay
  };
})();
