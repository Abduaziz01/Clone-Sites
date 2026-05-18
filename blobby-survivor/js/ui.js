// ui.js: HUD rendering and overlay screens (title, pause, level-up cards, game-over, toasts).
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
    host.className = 'toast-host';
    document.body.appendChild(host);
    return host;
  }

  function showToast(msg, ms) {
    var host = ensureToastHost();
    var node = document.createElement('div');
    node.className = 'toast';
    node.textContent = msg;
    host.appendChild(node);
    // Fade in.
    window.setTimeout(function () { node.classList.add('toast-in'); }, 16);
    var dur = ms || 2200;
    window.setTimeout(function () { node.classList.remove('toast-in'); }, Math.max(200, dur - 250));
    window.setTimeout(function () {
      if (node.parentNode) node.parentNode.removeChild(node);
    }, dur + 50);
  }

  // ----- HUD rendering with cached lookups -----
  var hud = null; // cached DOM refs
  function getHud() {
    if (hud && hud._ready) return hud;
    hud = {
      hpFill: document.getElementById('hpFill'),
      hpLabel: document.getElementById('hpLabel'),
      xpFill: document.getElementById('xpFill'),
      xpLabel: document.getElementById('xpLabel'),
      levelValue: document.getElementById('levelValue'),
      timeValue: document.getElementById('timeValue'),
      killsValue: document.getElementById('killsValue'),
      weapons: document.getElementById('weapons'),
      _weaponNodes: {}
    };
    hud._ready = !!(hud.hpFill && hud.xpFill && hud.weapons);
    return hud;
  }

  function fmtTime(sec) {
    if (sec == null || sec < 0 || isNaN(sec)) sec = 0;
    var s = Math.floor(sec);
    var mm = Math.floor(s / 60);
    var ss = s % 60;
    var mmStr = mm < 10 ? ('0' + mm) : ('' + mm);
    var ssStr = ss < 10 ? ('0' + ss) : ('' + ss);
    return mmStr + ':' + ssStr;
  }

  function dotsFor(level, max) {
    var s = '';
    for (var i = 0; i < max; i++) {
      s += (i < level) ? 'o' : '.';
      if (i < max - 1) s += ' ';
    }
    return s;
  }

  function renderHUD(state) {
    if (!state || !state.player) return;
    var h = getHud();
    if (!h._ready) return;
    var p = state.player;

    // HP
    var hpPct = p.maxHp > 0 ? Math.max(0, Math.min(1, p.hp / p.maxHp)) : 0;
    h.hpFill.style.width = (hpPct * 100).toFixed(1) + '%';
    h.hpLabel.textContent = Math.ceil(p.hp) + ' / ' + p.maxHp;

    // XP
    var need = (BS.xp && BS.xp.xpForLevel) ? BS.xp.xpForLevel(p.level) : 1;
    if (need <= 0) need = 1;
    var xpPct = Math.max(0, Math.min(1, (p.xp || 0) / need));
    h.xpFill.style.width = (xpPct * 100).toFixed(1) + '%';
    h.xpLabel.textContent = (p.xp || 0) + ' / ' + need;

    h.levelValue.textContent = '' + p.level;
    h.timeValue.textContent = fmtTime(state.elapsedSec);
    h.killsValue.textContent = '' + (state.kills || 0);

    // Weapons
    var summary = (BS.weapons && BS.weapons.summary) ? BS.weapons.summary(p) : [];
    var existingIds = {};
    for (var i = 0; i < summary.length; i++) existingIds[summary[i].id] = true;

    // Remove chips for weapons no longer owned.
    var nodes = h._weaponNodes;
    var keys = Object.keys(nodes);
    for (var k = 0; k < keys.length; k++) {
      if (!existingIds[keys[k]]) {
        var n = nodes[keys[k]];
        if (n && n.parentNode) n.parentNode.removeChild(n);
        delete nodes[keys[k]];
      }
    }

    for (var w = 0; w < summary.length; w++) {
      var s = summary[w];
      var node = nodes[s.id];
      if (!node) {
        node = document.createElement('div');
        node.className = 'weapon-chip';
        var nm = document.createElement('span');
        nm.className = 'weapon-name';
        var dt = document.createElement('span');
        dt.className = 'weapon-dots';
        node.appendChild(nm);
        node.appendChild(dt);
        h.weapons.appendChild(node);
        nodes[s.id] = node;
        node._nm = nm;
        node._dt = dt;
      }
      node._nm.textContent = s.name;
      node._dt.textContent = dotsFor(s.level, s.maxLevel);
      if (s.level >= s.maxLevel) {
        node.classList.add('weapon-max');
      } else {
        node.classList.remove('weapon-max');
      }
    }
  }

  // ----- Level up -----
  // Active picker handler so input keys 1/2/3 only fire while a card is up.
  var activePicker = null;

  function kindLabel(kind) {
    if (kind === 'weapon-new') return 'New Weapon';
    if (kind === 'weapon-up') return 'Weapon +';
    if (kind === 'passive') return 'Passive';
    if (kind === 'heal') return 'Heal';
    return kind;
  }

  function escapeHtml(s) {
    return ('' + s).replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  }

  function stacksLine(choice, player) {
    if (!choice) return '';
    if (choice.kind === 'weapon-new') return 'New';
    if (choice.kind === 'weapon-up') {
      var cur = choice.currentStacks(player);
      return 'Level: ' + cur + ' / ' + choice.maxStacks + '  &rarr;  ' + (cur + 1);
    }
    if (choice.kind === 'passive') {
      var cs = choice.currentStacks(player);
      return 'Stacks: ' + cs + ' / ' + choice.maxStacks + '  &rarr;  ' + (cs + 1);
    }
    return '';
  }

  function showLevelUp(choices, onPick) {
    var player = BS.game && BS.game.getPlayer ? BS.game.getPlayer() : null;
    var n = (choices && choices.length) || 0;
    var html = '<div class="panel level-up">';
    html += '<h1 class="title">Level up!</h1>';
    var promptKeys = '';
    for (var pk = 0; pk < n; pk++) {
      promptKeys += (pk > 0 ? (pk === n - 1 ? ', or ' : ', ') : '') + (pk + 1);
    }
    html += '<p class="subtitle">Choose an upgrade. Press ' + (promptKeys || '1') + '.</p>';
    html += '<div class="level-up-grid level-up-grid-' + Math.max(1, n) + '">';
    for (var i = 0; i < n; i++) {
      var c = choices[i];
      var kindClass = 'kind-' + (c.kind || 'passive');
      html += '<button class="level-up-card ' + kindClass + '" data-idx="' + i + '" type="button">';
      html += '<div class="card-key">' + (i + 1) + '</div>';
      html += '<div class="card-kind">' + escapeHtml(kindLabel(c.kind)) + '</div>';
      html += '<div class="card-name">' + escapeHtml(c.name) + '</div>';
      html += '<div class="card-desc">' + escapeHtml(c.desc || '') + '</div>';
      html += '<div class="card-stacks">' + stacksLine(c, player) + '</div>';
      html += '</button>';
    }
    html += '</div></div>';
    show(html);

    function pick(idx) {
      var c = choices[idx];
      if (!c) return;
      activePicker = null; // disarm before invoking, in case onPick chains.
      try {
        if (typeof onPick === 'function') onPick(c);
      } catch (e) { /* swallow */ }
    }

    // Wire button clicks.
    var overlay = el();
    if (overlay) {
      var btns = overlay.querySelectorAll('.level-up-card');
      for (var b = 0; b < btns.length; b++) {
        (function (idx, btn) {
          btn.addEventListener('click', function () { pick(idx); });
        })(b, btns[b]);
      }
      // Focus the first card so Enter or Space activates it.
      if (btns[0]) {
        try { btns[0].focus(); } catch (e2) { /* ignore */ }
      }
    }

    activePicker = pick;
  }

  // Bind digit keys 1-3 once; handler checks activePicker so it noops when no card is up.
  if (BS.input && typeof BS.input.onKeyDown === 'function') {
    BS.input.onKeyDown('Digit1', function () { if (activePicker) activePicker(0); });
    BS.input.onKeyDown('Digit2', function () { if (activePicker) activePicker(1); });
    BS.input.onKeyDown('Digit3', function () { if (activePicker) activePicker(2); });
  }

  // ----- Game over -----
  // Track active restart handler so Enter only fires while game-over is up.
  var activeRestart = null;

  function showGameOver(stats, onRestart) {
    stats = stats || {};
    var weaponList = '';
    var ws = stats.weapons || [];
    if (ws.length === 0) {
      weaponList = '<li class="empty">(none)</li>';
    } else {
      for (var i = 0; i < ws.length; i++) {
        var w = ws[i];
        weaponList += '<li><span class="go-w-name">' + escapeHtml(w.name) + '</span>' +
                      '<span class="go-w-level">Lv ' + w.level + ' / ' + w.maxLevel + '</span></li>';
      }
    }
    var cause = stats.cause || 'You were swarmed.';
    var html = '<div class="panel game-over">';
    html += '<h1 class="title">Game Over</h1>';
    html += '<p class="subtitle">' + escapeHtml(cause) + '</p>';
    html += '<ul class="go-stats">';
    html += '<li><span>Survived</span><span>' + fmtTime(stats.timeSec) + '</span></li>';
    html += '<li><span>Level</span><span>' + (stats.level || 1) + '</span></li>';
    html += '<li><span>Kills</span><span>' + (stats.kills || 0) + '</span></li>';
    html += '</ul>';
    html += '<div class="go-weapons-title">Weapons</div>';
    html += '<ul class="go-weapons">' + weaponList + '</ul>';
    html += '<button class="button" id="restartBtn" type="button">Restart</button>';
    html += '<p class="hint">Press Enter to restart.</p>';
    html += '</div>';
    show(html);

    function restart() {
      activeRestart = null;
      try {
        if (typeof onRestart === 'function') onRestart();
      } catch (e) { /* swallow */ }
    }

    var btn = document.getElementById('restartBtn');
    if (btn) {
      btn.addEventListener('click', restart);
      try { btn.focus(); } catch (e) { /* ignore */ }
    }
    activeRestart = restart;
  }

  // Bind Enter once for game-over restart; noops when not active.
  if (BS.input && typeof BS.input.onKeyDown === 'function') {
    BS.input.onKeyDown('Enter', function () {
      if (activeRestart) activeRestart();
    });
  }

  BS.ui = {
    showTitle: showTitle,
    showPause: showPause,
    showLevelUp: showLevelUp,
    showGameOver: showGameOver,
    hideOverlay: hideOverlay,
    showToast: showToast,
    renderHUD: renderHUD,
    // expose for tests/debug.
    _isLevelUpActive: function () { return !!activePicker; },
    _isGameOverActive: function () { return !!activeRestart; },
    _resetActive: function () { activePicker = null; activeRestart = null; }
  };
})();
