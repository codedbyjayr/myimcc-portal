/* =====================================================================
   MyIMCC Portal — Professional Loading & Skeleton System
   Shared helpers: non-blocking top progress bar, skeleton builders, and fade-ins.
   ===================================================================== */

(function () {
  'use strict';

  var preloaderEl = null;
  var hidden = false;

  /* Build the non-blocking top progress bar */
  function ensurePreloader() {
    if (preloaderEl) return preloaderEl;
    var el = document.getElementById('imccPreloader');
    if (!el) {
      el = document.createElement('div');
      el.className = 'imcc-preloader';
      el.id = 'imccPreloader';
      el.setAttribute('role', 'progressbar');
      el.setAttribute('aria-label', 'Loading page content');
      el.innerHTML = '<div class="pl-bar"></div>';
      document.body.insertBefore(el, document.body.firstChild);
    }
    preloaderEl = el;
    return el;
  }

  /* Expose: hide the preloader smoothly without artificial delay */
  window.imccHidePreloader = function (immediate) {
    var wrapUp = function () {
      var el = preloaderEl || document.getElementById('imccPreloader');
      if (!el) return;
      hidden = true;
      el.classList.add('hidden');
      setTimeout(function () {
        if (el && el.parentNode) {
          el.parentNode.removeChild(el);
        }
      }, immediate ? 0 : 260);
    };

    if (immediate) { wrapUp(); return; }
    // Zero artificial delay — hide as soon as ready
    wrapUp();
  };

  /* Expose: force the preloader to appear during async fetches */
  window.imccShowPreloader = function () {
    hidden = false;
    var el = ensurePreloader();
    el.classList.remove('hidden');
  };

  /* Expose: fade a section in smoothly */
  window.imccFadeIn = function (el, slow) {
    if (!el) return;
    el.classList.remove('imcc-fade-in', 'imcc-fade-in-slow');
    void el.offsetWidth;
    el.classList.add(slow ? 'imcc-fade-in-slow' : 'imcc-fade-in');
  };

  /* Expose: skeleton placeholders builder */
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
      var w = 100 - ((i % 3) * 14);
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

  /* Expose: table rows skeleton builder */
  window.imccTableSkeleton = function (cols, rows) {
    cols = cols || 4;
    rows = rows || 4;
    var out = '';
    for (var r = 0; r < rows; r++) {
      out += '<tr class="imcc-skel-table-row">';
      for (var c = 0; c < cols; c++) {
        var w = 55 + ((c * 19 + r * 11) % 35);
        out += '<td><div class="imcc-skel imcc-skel-line" style="width:' + w + '%;"></div></td>';
      }
      out += '</tr>';
    }
    return out;
  };

  /* Expose: empty a container and stamp skeleton into it */
  window.imccWithSkeleton = function (container, opts) {
    if (!container) return;
    container.innerHTML = imccSkeleton(opts || { lines: 3, rows: 2 });
  };

  /* Auto-create top progress bar */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', ensurePreloader);
  } else {
    ensurePreloader();
  }

  /* Fallback: hide after window load */
  window.addEventListener('load', function () {
    window.imccHidePreloader();
  });

  /* Safety net in case no script calls it */
  setTimeout(function () {
    window.imccHidePreloader(true);
  }, 4000);
})();