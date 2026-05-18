(function () {
  window.BS = window.BS || {};

  var held = new Set();
  var oneShotHandlers = {}; // code -> array of handlers
  var blurHandler = null;

  function isPressed(code) {
    return held.has(code);
  }

  function getAxis() {
    var x = 0;
    var y = 0;
    if (held.has('KeyW') || held.has('ArrowUp')) y -= 1;
    if (held.has('KeyS') || held.has('ArrowDown')) y += 1;
    if (held.has('KeyA') || held.has('ArrowLeft')) x -= 1;
    if (held.has('KeyD') || held.has('ArrowRight')) x += 1;
    if (x !== 0 && y !== 0) {
      var inv = 1 / Math.sqrt(2);
      x *= inv;
      y *= inv;
    }
    return { x: x, y: y };
  }

  function onKeyDown(code, handler) {
    if (!oneShotHandlers[code]) oneShotHandlers[code] = [];
    oneShotHandlers[code].push(handler);
  }

  function fireOneShot(code) {
    var list = oneShotHandlers[code];
    if (!list) return;
    for (var i = 0; i < list.length; i++) {
      try { list[i](); } catch (e) { /* swallow handler errors */ }
    }
  }

  window.addEventListener('keydown', function (ev) {
    var code = ev.code;
    // Avoid page scrolling on arrows / space.
    if (code === 'ArrowUp' || code === 'ArrowDown' ||
        code === 'ArrowLeft' || code === 'ArrowRight' ||
        code === 'Space') {
      ev.preventDefault();
    }
    if (!held.has(code)) {
      // First press, fire one-shot handlers.
      fireOneShot(code);
    }
    held.add(code);
  }, { passive: false });

  window.addEventListener('keyup', function (ev) {
    held.delete(ev.code);
  });

  window.addEventListener('blur', function () {
    held.clear();
    if (typeof blurHandler === 'function') {
      try { blurHandler(); } catch (e) { /* swallow */ }
    }
  });

  BS.input = {
    held: held,
    isPressed: isPressed,
    getAxis: getAxis,
    onKeyDown: onKeyDown,
    set onBlur(fn) { blurHandler = fn; },
    get onBlur() { return blurHandler; }
  };
})();
