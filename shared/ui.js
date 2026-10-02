// shared/ui.js
//
// Shared DOM helpers: escaping, templating, toasts, focus management.
//
// The reason this exists: the portals built table rows and cards with
// string concatenation into innerHTML, interpolating values straight from
// the database. A student who set their name to `<img src=x onerror=...>`
// executed script inside an administrator's session. The `html` tagged
// template below makes that the default-safe path, and `raw()` is the
// explicit, greppable opt-out for markup we generated ourselves.
(function (global) {
  'use strict';

  const doc = global.document;

  // ── Escaping ────────────────────────────────────────────────────────
  const HTML_ESCAPES = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  };

  /**
   * Escape a value for interpolation into HTML text or a quoted
   * attribute. Not for URLs, script, or CSS — see safeUrl().
   */
  function escapeHtml(value) {
    if (value === null || value === undefined) return '';
    return String(value).replace(/[&<>"']/g, ch => HTML_ESCAPES[ch]);
  }

  /**
   * Return a value as trusted markup, bypassing escaping. Only for strings
   * this codebase built itself. Every use is a decision to review.
   */
  function raw(value) {
    return { __imccRaw: String(value === null || value === undefined ? '' : value) };
  }

  function isRaw(v) {
    return v && typeof v === 'object' && v.__imccRaw !== undefined;
  }

  // A String subclass, so `html` results can be assigned straight to
  // innerHTML while still being recognised as already-safe when nested
  // inside another `html` template. Without the marker, composing
  // fragments would escape the inner one a second time.
  class HtmlString extends String {}
  Object.defineProperty(HtmlString.prototype, '__imccHtml', { value: true });

  function isHtmlString(v) {
    return v instanceof HtmlString
      || (v && typeof v === 'object' && v.__imccHtml === true);
  }

  function interpolate(value) {
    if (isRaw(value)) return value.__imccRaw;
    // Already-safe output of a nested template: inline, never re-escape.
    if (isHtmlString(value)) return value.toString();
    // Arrays are fragment lists, so they concatenate rather than
    // stringifying with commas: rows.map(r => html`<tr>..</tr>`).
    if (Array.isArray(value)) return value.map(interpolate).join('');
    return escapeHtml(value);
  }

  /**
   * Tagged template that escapes every interpolation by default.
   *
   *   row.innerHTML = UI.html`<td>${s.full_name}</td>`;
   *
   * Arrays are joined, nested `html` results are inlined without a second
   * escape, and `raw()` is the explicit opt-out for markup we built.
   */
  function html(strings) {
    let out = strings[0];
    for (let i = 1; i < arguments.length; i++) {
      out += interpolate(arguments[i]) + strings[i];
    }
    return new HtmlString(out);
  }
  // Exported so callers can build fragments without a wrapper element.
  html.raw = raw;

  /**
   * Allow only same-origin-safe URL schemes. Blocks `javascript:` and
   * `data:` payloads injected through profile image or link fields.
   */
  function safeUrl(value, fallback) {
    const fallbackValue = fallback === undefined ? '' : fallback;
    if (typeof value !== 'string') return fallbackValue;
    const trimmed = value.trim();
    if (!trimmed) return fallbackValue;

    // Relative paths and fragments are fine.
    if (/^[#/?]/.test(trimmed)) return trimmed;

    let parsed;
    try {
      parsed = new URL(trimmed, global.location ? global.location.href : 'https://localhost/');
    } catch (e) {
      return fallbackValue;
    }

    const scheme = (parsed.protocol || '').toLowerCase();
    if (scheme === 'javascript:' || scheme === 'data:' || scheme === 'vbscript:') {
      return fallbackValue;
    }
    if (scheme === 'http:' || scheme === 'https:') return trimmed;
    return fallbackValue;
  }

  // ── DOM ─────────────────────────────────────────────────────────────
  function getEl(id) {
    return doc ? doc.getElementById(id) : null;
  }

  function qs(selector, root) {
    return (root || doc).querySelector(selector);
  }

  function qsa(selector, root) {
    return Array.prototype.slice.call((root || doc).querySelectorAll(selector));
  }

  function on(root, type, selector, handler) {
    if (!root) return;
    if (selector) {
      root.addEventListener(type, function (event) {
        const target = event.target instanceof Element ? event.target.closest(selector) : null;
        if (target && root.contains(target)) handler(event, target);
      });
    } else {
      root.addEventListener(type, handler);
    }
  }

  /** Replace a container's contents with text, clearing any stale HTML. */
  function setText(node, value) {
    if (node) node.textContent = value === null || value === undefined ? '' : String(value);
  }

  // ── Toasts ──────────────────────────────────────────────────────────
  // Layered above modals: an overlay that outranks the toast means a
  // failed save inside a dialog shows no feedback at all.
  const TOAST_Z = 10000;
  let toastHost = null;

  function initToasts() {
    if (toastHost || !doc) return toastHost;
    toastHost = doc.getElementById('toastHost');
    if (!toastHost) {
      toastHost = doc.createElement('div');
      toastHost.id = 'toastHost';
      toastHost.className = 'toast-host';
      toastHost.setAttribute('role', 'status');
      toastHost.setAttribute('aria-live', 'polite');
      doc.body.appendChild(toastHost);
    }
    return toastHost;
  }

  const TOAST_ICONS = {
    success: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>',
    error: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M12 8v5"/><circle cx="12" cy="16.5" r="0.5" fill="currentColor"/><circle cx="12" cy="12" r="9"/></svg>',
    info: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M12 16v-5"/><circle cx="12" cy="7.5" r="0.5" fill="currentColor"/><circle cx="12" cy="12" r="9"/></svg>'
  };

  /**
   * Show a transient message.
   * @param {string} message
   * @param {object} [opts]
   * @param {'success'|'error'|'info'} [opts.type='info']
   * @param {number} [opts.duration=4000]  Errors persist longer.
   */
  function toast(message, opts) {
    const options = (typeof opts === 'boolean')
      ? { type: opts ? 'error' : 'success' }
      : (opts || {});
    const type = options.type || 'info';
    const host = initToasts();
    if (!host) return null;

    const item = doc.createElement('div');
    item.className = 'toast toast--' + type;
    item.style.zIndex = String(TOAST_Z);
    item.innerHTML = html`${raw(TOAST_ICONS[type] || '')}<span>${message}</span>`;

    host.appendChild(item);

    const duration = options.duration || (type === 'error' ? 7000 : 4000);
    const remove = () => {
      if (!item.parentNode) return;
      item.classList.add('toast--leaving');
      setTimeout(() => { if (item.parentNode) item.parentNode.removeChild(item); }, 200);
    };
    const timer = setTimeout(remove, duration);
    item.addEventListener('click', () => { clearTimeout(timer); remove(); });

    return item;
  }

  // ── Async state ─────────────────────────────────────────────────────
  /** Disable a button and show a busy label, restoring it afterwards. */
  async function withBusy(button, label, work) {
    if (!button) return work();
    const original = button.innerHTML;
    const wasDisabled = button.disabled;
    button.disabled = true;
    if (label) button.innerHTML = String(label);
    try {
      return await work();
    } finally {
      button.disabled = wasDisabled;
      button.innerHTML = original;
    }
  }

  /** Yield to the browser so a loading state can paint before work starts. */
  function nextFrame() {
    return new Promise(resolve => {
      if (global.requestAnimationFrame) global.requestAnimationFrame(() => resolve());
      else setTimeout(resolve, 0);
    });
  }

  // ── Formatting ──────────────────────────────────────────────────────
  function formatDate(value, opts) {
    if (!value) return '';
    const d = value instanceof Date ? value : new Date(value);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleDateString('en-PH', opts || { year: 'numeric', month: 'short', day: 'numeric' });
  }

  function formatDateTime(value) {
    if (!value) return '';
    const d = value instanceof Date ? value : new Date(value);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleString('en-PH', {
      year: 'numeric', month: 'short', day: 'numeric',
      hour: 'numeric', minute: '2-digit'
    });
  }

  /** Pluralise a count, e.g. pluralize(1,'subject') -> "1 subject". */
  function pluralize(count, singular, plural) {
    const n = Number(count) || 0;
    const word = n === 1 ? singular : (plural || singular + 's');
    return n + ' ' + word;
  }

  // ── Focus management ────────────────────────────────────────────────
  const FOCUSABLE = [
    'a[href]', 'button:not([disabled])', 'input:not([disabled]):not([type="hidden"])',
    'select:not([disabled])', 'textarea:not([disabled])', '[tabindex]:not([tabindex="-1"])'
  ].join(',');

  function focusablesIn(root) {
    return qsa(FOCUSABLE, root).filter(node => {
      if (node.hasAttribute('disabled')) return false;
      if (node.getAttribute('aria-hidden') === 'true') return false;
      return node.offsetParent !== null || node === doc.activeElement;
    });
  }

  /**
   * Show a dialog: moves focus in, traps Tab, restores focus on close.
   * Returns a close() function.
   */
  function openDialog(dialog, opts) {
    if (!dialog) return () => {};
    const options = opts || {};
    const previouslyFocused = doc.activeElement;

    if (!dialog.hasAttribute('role')) dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    dialog.hidden = false;
    dialog.classList.remove('hidden');

    const onKeydown = (event) => {
      if (event.key === 'Escape' && options.closeOnEscape !== false) {
        event.preventDefault();
        close();
        return;
      }
      if (event.key !== 'Tab') return;
      const items = focusablesIn(dialog);
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && doc.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && doc.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    function onBackdropClick(event) {
      if (options.closeOnBackdrop && event.target === dialog) close();
    }

    const onFocusIn = (event) => {
      if (!dialog.contains(event.target)) {
        const items = focusablesIn(dialog);
        if (items.length) items[0].focus();
      }
    };

    function close() {
      dialog.removeEventListener('keydown', onKeydown);
      dialog.removeEventListener('mousedown', onBackdropClick);
      doc.removeEventListener('focusin', onFocusIn);
      dialog.hidden = true;
      dialog.classList.add('hidden');
      if (previouslyFocused && typeof previouslyFocused.focus === 'function') {
        previouslyFocused.focus();
      }
      if (typeof options.onClose === 'function') options.onClose();
    }

    dialog.addEventListener('keydown', onKeydown);
    if (options.closeOnBackdrop) dialog.addEventListener('mousedown', onBackdropClick);
    doc.addEventListener('focusin', onFocusIn);

    const initial = dialog.querySelector('[data-autofocus]') || focusablesIn(dialog)[0];
    if (initial) initial.focus();

    return close;
  }

  // ── Export ──────────────────────────────────────────────────────────
  const api = {
    escapeHtml,
    raw,
    html,
    safeUrl,
    getEl,
    qs,
    qsa,
    on,
    setText,
    toast,
    initToasts,
    withBusy,
    nextFrame,
    formatDate,
    formatDateTime,
    pluralize,
    openDialog,
    focusablesIn,
    TOAST_Z
  };

  global.UIM = api;
  // Merge into IMCC so portals that already load identity.js get one namespace.
  global.IMCC = Object.assign(global.IMCC || {}, api);
})(typeof window !== 'undefined' ? window : globalThis);
