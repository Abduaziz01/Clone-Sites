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

  // ----- Toast -----
  function ensureToastHost() {
    var host = document.getElementById('bsToastHost');
    if (host) return host;
    host = document.createElement('div');
    host.id = 'bsToastHost';
    host.style.position = 'fixed';
    host.style.top = '12%';
    host.style.left = '50%';
    host.style.transform = 'translateX(-50%)';
    host.style.zIndex = '11';
    host.style.pointerEvents = 'none';
    host.style.display = 'flex';
    host.style.flexDirection = 'column';
    host.style.alignItems = 'center';
    host.style.gap = '8px';
    document.body.appendChild(host);
    return host;
  }

  function showToast(msg, ms) {
    var host = ensureToastHost();
    var node = document.createElement('div');
    node.textContent = msg;
    node.style.padding = '8px 16px';
    node.style.background = 'rgba(18, 26, 44, 0.85)';
    node.style.border = '1px solid rgba(140, 180, 230, 0.35)';
    node.style.borderRadius = '8px';
    node.style.color = '#e6efff';
    node.style.fontSize = '14px';
    node.style.letterSpacing = '1px';
    node.style.boxShadow = '0 6px 20px rgba(0,0,0,0.4)';
    node.style.opacity = '0';
    node.style.transition = 'opacity 0.25s ease';
    host.appendChild(node);
    // Fade in.
    window.setTimeout(function () { node.style.opacity = '1'; }, 16);
    var dur = ms || 2000;
    window.setTimeout(function () { node.style.opacity = '0'; }, Math.max(200, dur - 250));
    window.setTimeout(function () {
      if (node.parentNode) node.parentNode.removeChild(node);
    }, dur + 50);
  }

  BS.ui = {
    showTitle: showTitle,
    showPause: showPause,
    hideOverlay: hideOverlay,
    showToast: showToast
  };
})();
