// shared/faculty-chrome.js
//
// Shared UI chrome for faculty dashboards: mobile nav drawer, dropdown,
// dark mode toggle, and common helpers. Replaces ~80 identical lines
// duplicated in teacher-dashboard.js and dean-dashboard.js.
(function (global) {
  'use strict';

  var doc = global.document;
  var getEl = function (id) { return doc.getElementById(id); };

  // ── Helpers ──────────────────────────────────────────────────────────
  function escapeHtml(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function initials(name) {
    return (name || '?').trim().split(/\s+/).map(function (w) { return w[0]; }).slice(0, 2).join('').toUpperCase();
  }

  function fmtDate(iso) {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  }

  var toastTimer;
  function showToast(msg, isError) {
    var t = getEl('toast');
    if (!t) return;
    t.textContent = msg;
    t.classList.toggle('error', !!isError);
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove('show'); }, 3200);
  }

  function isMissingTableError(err) {
    return err && (err.code === '42P01' || /relation .* does not exist/i.test(err.message || ''));
  }

  // ── Mobile Navigation Drawer ─────────────────────────────────────────
  function closeMobileNav() {
    var sidebar = getEl('sidebar');
    var overlay = getEl('sidebarOverlay');
    if (sidebar) sidebar.classList.remove('open');
    if (overlay) overlay.classList.remove('active');
    doc.body.style.overflow = '';
  }

  function openMobileNav() {
    var sidebar = getEl('sidebar');
    var overlay = getEl('sidebarOverlay');
    if (sidebar) sidebar.classList.add('open');
    if (overlay) overlay.classList.add('active');
    if (global.innerWidth < 1024) doc.body.style.overflow = 'hidden';
  }

  function toggleMobileNav() {
    var sidebar = getEl('sidebar');
    if (sidebar && sidebar.classList.contains('open')) closeMobileNav();
    else openMobileNav();
  }

  /** Wire up standard sidebar toggle, close, overlay, escape, resize. */
  function initMobileNav() {
    var menuToggle = getEl('menuToggle');
    var sidebarClose = getEl('sidebarCloseBtn');
    var sidebarOverlay = getEl('sidebarOverlay');

    if (menuToggle) menuToggle.addEventListener('click', toggleMobileNav);
    if (sidebarClose) sidebarClose.addEventListener('click', closeMobileNav);
    if (sidebarOverlay) sidebarOverlay.addEventListener('click', closeMobileNav);

    doc.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeMobileNav(); });
    global.addEventListener('resize', function () { if (global.innerWidth >= 1024) closeMobileNav(); });
  }

  // ── Dropdown ─────────────────────────────────────────────────────────
  function setupDropdown(btnId, ddId) {
    var btn = getEl(btnId), dd = getEl(ddId);
    if (!btn || !dd) return;
    btn.addEventListener('click', function (e) { e.stopPropagation(); dd.classList.toggle('open'); });
    doc.addEventListener('click', function () { dd.classList.remove('open'); });
    dd.addEventListener('click', function (e) { e.stopPropagation(); });
  }

  // ── Dark mode toggle ─────────────────────────────────────────────────
  var darkMode = false;
  function initThemeToggle() {
    var toggle = getEl('themeToggle');
    if (!toggle) return;
    toggle.addEventListener('click', function () {
      darkMode = !darkMode;
      doc.body.setAttribute('data-theme', darkMode ? 'dark' : 'light');
      var label = getEl('themeLabel');
      var icon = getEl('themeIcon');
      if (label) label.textContent = darkMode ? 'Light' : 'Dark';
      if (icon) icon.innerHTML = darkMode
        ? '<circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4"/>'
        : '<path d="M21 12.8A9 9 0 1111.2 3 7 7 0 0021 12.8z"/>';
    });
  }

  /** Standard page-switch navigation for faculty dashboards. */
  function initNavigation(titles, onNavigate) {
    function goto(page) {
      doc.querySelectorAll('.page').forEach(function (p) { p.classList.remove('active'); });
      var pageEl = getEl('page-' + page);
      if (pageEl) {
        pageEl.classList.add('active');
        if (global.imccFadeIn) global.imccFadeIn(pageEl);
      }
      doc.querySelectorAll('.nav-item[data-page]').forEach(function (n) {
        n.classList.toggle('active', n.dataset.page === page);
      });
      var titleEl = getEl('pageTitle');
      if (titleEl) titleEl.textContent = titles[page] || 'Dashboard';
      var dd = getEl('userDropdown');
      if (dd) dd.classList.remove('open');
      closeMobileNav();
      if (onNavigate) onNavigate(page);
    }
    doc.querySelectorAll('[data-page]').forEach(function (el) {
      el.addEventListener('click', function () { goto(el.dataset.page); });
    });
    doc.querySelectorAll('[data-goto]').forEach(function (el) {
      el.addEventListener('click', function () { goto(el.dataset.goto); });
    });
    return goto;
  }

  /** Set up sidebar profile display. */
  function setSidebarProfile(profile, fallbackEmail) {
    var name = profile.full_name || fallbackEmail || 'User';
    var ini = initials(name);
    var dept = profile.program || (profile.role === 'dean' ? "Dean's Office" : 'Faculty');

    if (getEl('sidebarName')) getEl('sidebarName').textContent = name;
    if (getEl('sidebarDept')) getEl('sidebarDept').textContent = dept;
    if (getEl('sidebarAvatar')) getEl('sidebarAvatar').textContent = ini;
    if (getEl('topAvatar')) getEl('topAvatar').textContent = ini;
    if (getEl('topName')) getEl('topName').textContent = name.split(' ')[0] || 'Faculty';
  }

  /** Load SSO quick links from sso_links table, filtered by role. */
  async function loadSSOLinks(supabaseClient, role) {
    var res = await supabaseClient.from('sso_links').select('*').eq('is_active', true).order('sort_order');
    var nav = getEl('ssoLinksNav');
    if (!nav) return;
    var visible = (res.data || [])
      .filter(function (l) { return (l.roles || '').split(',').map(function (r) { return r.trim(); }).includes(role); })
      .filter(function (l) { return (l.label || '').trim().toLowerCase() !== 'library'; });
    nav.innerHTML = visible.map(function (l) {
      return '<a href="' + l.url + '" target="_blank" class="nav-item" style="text-decoration:none;">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:17px;height:17px;"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></svg> ' +
        escapeHtml(l.label) + '</a>';
    }).join('') || '<div class="nav-item soon" style="opacity:.4;">No links configured</div>';
  }

  // ── Export ──────────────────────────────────────────────────────────
  var api = {
    getEl: getEl,
    escapeHtml: escapeHtml,
    initials: initials,
    fmtDate: fmtDate,
    showToast: showToast,
    isMissingTableError: isMissingTableError,
    closeMobileNav: closeMobileNav,
    initMobileNav: initMobileNav,
    setupDropdown: setupDropdown,
    initThemeToggle: initThemeToggle,
    initNavigation: initNavigation,
    setSidebarProfile: setSidebarProfile,
    loadSSOLinks: loadSSOLinks,
    isDarkMode: function () { return darkMode; }
  };

  global.FC = api;
  global.IMCC = Object.assign(global.IMCC || {}, { FC: api });
})(typeof window !== 'undefined' ? window : globalThis);
