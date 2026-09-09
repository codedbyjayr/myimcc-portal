/* =====================================================================
   MyIMCC Portal — Smooth Loading System
   Shared helpers: branded preloader, skeleton builders, and fade-ins.

   Usage:
     1. Include shared/loading.css in <head>.
     2. Include shared/loading.js after the CSS.
     3. Call `imccHidePreloader()` in your page script once data is
        rendered, or let it auto-hide on window 'load'.
     4. For dashboard sections: wrap container with class="imcc-section"
        or call `imccFadeIn(el)` to play the fade-in.
        Use `imccSkeleton(lines)` to insert shimmer placeholders.
   ===================================================================== */

(function () {
  'use strict';

  var MIN_DISPLAY_MS = 450;   // keep preloader visible at least this long
  var startedAt = Date.now();
  var preloaderEl = null;
  var hidden = false;

  /* Build the preloader DOM once */
  function ensurePreloader() {
    if (preloaderEl) return preloaderEl;
    var el = document.createElement('div');
    el.className = 'imcc-preloader';
    el.id = 'imccPreloader';
    el.innerHTML =
      '<div class="pl-mark">MI</div>' +
      '<div class="pl-ring"></div>' +
      '<div class="pl-text">Loading MyIMCC…</div>';
    document.body.insertBefore(el, document.body.firstChild);
    preloaderEl = el;
    return el;
  }

  /* Expose: hide the preloader with a smooth fade */
  window.imccHidePreloader = function (immediate) {
    var wrapUp = function () {
      if (hidden || !preloaderEl) return;
      hidden = true;
      preloaderEl.classList.add('hidden');
      setTimeout(function () {
        if (preloaderEl && preloaderEl.parentNode) {
          preloaderEl.parentNode.removeChild(preloaderEl);
        }
      }, 550);
    };

    if (immediate) { wrapUp(); return; }

    var elapsed = Date.now() - startedAt;
    var remaining = Math.max(0, MIN_DISPLAY_MS - elapsed);
    setTimeout(wrapUp, remaining);
  };

  /* Expose: force the preloader to appear (e.g. before a long load) */
  window.imccShowPreloader = function () {
    hidden = false;
    var el = ensurePreloader();
    el.classList.remove('hidden');
    startedAt = Date.now();
  };

  /* Expose: fade a section in (use on containers updated by JS) */
  window.imccFadeIn = function (el, slow) {
    if (!el) return;
    el.classList.remove('imcc-fade-in', 'imcc-fade-in-slow');
    // Force reflow so the animation restarts even on repeated updates.
    void el.offsetWidth;
    el.classList.add(slow ? 'imcc-fade-in-slow' : 'imcc-fade-in');
  };

  /* Expose: skeleton placeholders builder
     imccSkeleton({ title, avatar, lines, rows, card, chip }) */
  window.imccSkeleton = function (opts) {
    opts = opts || {};
    var html = '';
    if (opts.card) {
      html += '<div class="imcc-skel-card imcc-skel"></div>';
    }
    if (opts.avatar) {
      html += '<div class="imcc-skel-row" style="display:flex;gap:10px;align-items:center;">';
      html += '<div class="imcc-skel-avatar imcc-skel"></div>';
      html += '<div style="flex:1">';
      html += '<div class="imcc-skel-line imcc-skel" style="width:60%;"></div>';
      html += '<div class="imcc-skel-line imcc-skel" style="width:35%;"></div>';
      html += '</div></div>';
    }
    if (opts.title) {
      html += '<div class="imcc-skel-title imcc-skel"></div>';
    }
    for (var i = 0; i < (opts.lines || 0); i++) {
      var w = 100 - ((i % 3) * 12);
      html += '<div class="imcc-skel-line imcc-skel" style="width:' + w + '%;"></div>';
    }
    for (var j = 0; j < (opts.rows || 0); j++) {
      html += '<div class="imcc-skel-row imcc-skel"></div>';
    }
    if (opts.chip) {
      html += '<div class="imcc-skel-chip imcc-skel"></div>';
    }
    return html;
  };

  /* Expose: empty a container and stamp skeleton rows into it */
  window.imccWithSkeleton = function (container, opts) {
    if (!container) return;
    container.innerHTML = imccSkeleton(opts || { card: true, lines: 3, rows: 3 });
  };

  /* Auto-create the preloader on first meaningful paint. */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', ensurePreloader);
  } else {
    ensurePreloader();
  }

  /* Fallback: hide after 'load' even if the page script never calls it. */
  window.addEventListener('load', function () {
    imccHidePreloader();
  });

  /* Safety net in case neither auth guard nor data calls it. */
  setTimeout(function () {
    imccHidePreloader(true);
  }, 8000);
})();