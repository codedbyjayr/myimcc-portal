/* =====================================================================
   MyIMCC Portal — Supabase Integration Layer & Application Logic
   ===================================================================== */

// ── Supabase Client Instance ─────────────────────────────────────────
let supabaseClient; // Set by waitForSupabase() at runtime

// ── Application State ────────────────────────────────────────────────
const state = {
  page: 'dashboard',
  enrollStep: 1,
  darkMode: false,
  // state.adminView removed: it existed only to expose a self-clearance
  // control inside the student portal.

  apiOnline: false,
  dashboard: null,
  courses: [],
  miscFees: [],
  selectedOfferingIds: new Set(),
  billing: { totalPaid: 0, installments: [], transactions: [] },
        grades: [],
        departments: [],
        schedule: { subjects: [], slots: [], unscheduled: [], units: 0, teachers: {}, offerings: {} },
  activity: [],
  currentUser: null,
  studentProfile: null,
};

// ── Formatting Helpers ───────────────────────────────────────────────
const peso = n => '₱' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
const fmtDate = iso => iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';
// Appointments are the one place a wrong day would mislead somebody, so they
// are rendered in Manila wall-clock time via the shared module rather than in
// the browser's own zone. A student reading from outside the Philippines would
// otherwise see a confirmed 9:00 AM slot as the previous evening.
const fmtDateTime = iso => iso ? SCHOOLTIME.formatSchoolDateTime(iso) : '—';
const getEl = id => document.getElementById(id);

function setText(id, value) {
  const el = getEl(id);
  if (el) el.textContent = value ?? '—';
}

function getTimeGreeting() {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return 'Good morning';
  if (hour === 12) return 'Good noon';
  if (hour >= 13 && hour < 18) return 'Good afternoon';
  if (hour >= 18 && hour < 22) return 'Good evening';
  return 'Good night';
}

function getInitials(name) {
  if (!name) return 'ST';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}

// ── Auth Guard & Session Management ──────────────────────────────────
// Maps non-student roles to their dashboards
const ROLE_REDIRECTS = {
  admin:   '../admin/admin-dashboard.html',
  teacher: '../faculty/teacher-dashboard.html',
  faculty: '../faculty/teacher-dashboard.html',
  dean:    '../faculty/dean-dashboard.html',
  staff:   '../staff/staff-dashboard.html',
};

async function getCurrentStudent() {
  const { data: { user }, error } = await supabaseClient.auth.getUser();
  if (error || !user) {
    window.location.href = '../auth/login.html';
    return null;
  }
  state.currentUser = user;

  const { data: profile, error: pErr } = await supabaseClient
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single();

  if (pErr || !profile) {
    console.error('Profile fetch error:', pErr);
    window.location.href = '../auth/login.html';
    return null;
  }

  // Role guard — redirect non-students to their correct dashboard
  const role = (profile.role || '').toLowerCase();
  if (role !== 'student') {
    const target = ROLE_REDIRECTS[role] || '../auth/login.html';
    console.warn(`Role "${role}" is not a student — redirecting to ${target}`);
    window.location.href = target;
    return null;
  }

  state.studentProfile = profile;
  return profile;
}

function setupAuthListener() {
  if (!supabaseClient) return;
  supabaseClient.auth.onAuthStateChange(async (event, session) => {
    if (event === 'SIGNED_OUT' || !session) {
      window.location.href = '../auth/login.html';
      return;
    }
    if (event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') {
      await getCurrentStudent();
      renderDashboard();
      loadProfile();
    }
  });
}

// ── Mobile Navigation Drawer ──────────────────────────────────────────
function closeMobileNav() {
  const sidebar = getEl('sidebar');
  const overlay = getEl('sidebarOverlay');
  if (sidebar) sidebar.classList.remove('open');
  if (overlay) overlay.classList.remove('active');
  document.body.style.overflow = '';
}

function openMobileNav() {
  const sidebar = getEl('sidebar');
  const overlay = getEl('sidebarOverlay');
  if (sidebar) sidebar.classList.add('open');
  if (overlay) overlay.classList.add('active');
  if (window.innerWidth < 1024) {
    document.body.style.overflow = 'hidden';
  }
}

function toggleMobileNav() {
  const sidebar = getEl('sidebar');
  if (sidebar && sidebar.classList.contains('open')) {
    closeMobileNav();
  } else {
    openMobileNav();
  }
}

function setupMobileNav() {
  const menuToggle = getEl('menuToggle');
  const sidebarClose = getEl('sidebarCloseBtn');
  const overlay = getEl('sidebarOverlay');

  if (menuToggle) menuToggle.addEventListener('click', toggleMobileNav);
  if (sidebarClose) sidebarClose.addEventListener('click', closeMobileNav);
  if (overlay) overlay.addEventListener('click', closeMobileNav);

  // Close drawer on Escape key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeMobileNav();
  });

  // Automatically reset body overflow on window resize if crossing desktop threshold
  window.addEventListener('resize', () => {
    if (window.innerWidth >= 1024) {
      closeMobileNav();
    }
  });
}
setupMobileNav();

// ── Navigation ────────────────────────────────────────────────────────
function goto(page) {
  state.page = page;
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const pageEl = getEl('page-' + page);
  if (pageEl) {
    pageEl.classList.add('active');
    if (window.imccFadeIn) window.imccFadeIn(pageEl);
  }

  document.querySelectorAll('.nav-item[data-page]').forEach(n => n.classList.toggle('active', n.dataset.page === page));

  const titles = {
    dashboard: 'Dashboard',
    enrollment: 'Enrollment',
    billing: 'Billing & History',
    grades: 'Grades & Evaluation',
    clearance: 'Online Clearance',
    cor: 'Certificate of Registration',
    schedule: 'Class Schedule',
    help: 'Help',
    messages: 'Messages',
    attendance: 'Attendance History',
    evaluation: 'Faculty Evaluation',
    profile: 'My Profile'
  };
  const titleEl = getEl('pageTitle');
  if (titleEl) titleEl.textContent = titles[page] || 'Dashboard';

  // Lazy load: the schedule is not in the eager boot batch, so its four
  // round-trips only happen if the student actually opens the page.
  if (page === 'schedule' && !scheduleLoaded) {
    loadSchedule().catch(err => {
      console.warn('[schedule] load error:', err);
      const body = getEl('schedBody');
      if (body) {
        body.innerHTML =
          '<tr><td colspan="6" class="table-empty">Could not load your schedule. ' +
          'Please refresh, or contact the Registrar if this continues.</td></tr>';
      }
      showToast('Could not load your schedule', true);
    });
  }

  // Same for messages: nothing is fetched until the inbox is opened.
  if (page === 'messages' && !messagesLoaded) {
    loadMessages().catch(err => {
      console.warn('[messages] load error:', err);
      const body = getEl('msgThreadsBody');
      if (body) {
        body.innerHTML =
          '<tr><td colspan="4" class="table-empty">Could not load your messages. ' +
          'Please refresh, or contact the Registrar if this continues.</td></tr>';
      }
      showToast('Could not load your messages', true);
    });
  }

  // The help page needs the student's own request history, but the assistant
  // itself calls nothing until a question is typed, so opening the page is
  // cheap.
  if (page === 'help' && !appointmentsLoaded) {
    loadHelp();
  }

  closeMobileNav();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
window.goto = goto;

document.querySelectorAll('[data-page]').forEach(el => el.addEventListener('click', () => goto(el.dataset.page)));
document.querySelectorAll('[data-goto]').forEach(el => el.addEventListener('click', () => goto(el.dataset.goto)));

// ── Toast Notification ────────────────────────────────────────────────
let toastTimer;
function showToast(msg, isError = false) {
  const t = getEl('toast');
  const msgEl = getEl('toastMsg');
  if (!t || !msgEl) return;
  msgEl.textContent = msg;
  t.style.background = isError ? 'var(--red, #D6274A)' : 'var(--ink-900, #141019)';
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 3500);
}

// ── Dropdowns Setup ───────────────────────────────────────────────────
function setupDropdown(btnId, ddId) {
  const btn = getEl(btnId), dd = getEl(ddId);
  if (!btn || !dd) return;
  btn.addEventListener('click', e => {
    e.stopPropagation();
    dd.classList.toggle('open');
  });
  document.addEventListener('click', () => dd.classList.remove('open'));
  dd.addEventListener('click', e => e.stopPropagation());
}
setupDropdown('bellBtn', 'bellDropdown');
setupDropdown('userBtn', 'userDropdown');

getEl('bellBtn')?.addEventListener('click', () => {
  if (getEl('bellDropdown')?.classList.contains('open')) markBellSeen();
});

// ── Theme Switcher ───────────────────────────────────────────────────
getEl('themeToggle')?.addEventListener('click', () => {
  state.darkMode = !state.darkMode;
  document.body.setAttribute('data-theme', state.darkMode ? 'dark' : 'light');
  const label = getEl('themeLabel');
  const icon = getEl('themeIcon');
  if (label) label.textContent = state.darkMode ? 'Light' : 'Dark';
  if (icon) {
    icon.innerHTML = state.darkMode
      ? '<circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4"/>'
      : '<path d="M21 12.8A9 9 0 1111.2 3 7 7 0 0021 12.8z"/>';
  }
});

// ── Dashboard Loader & Renderer ───────────────────────────────────────
async function loadDashboard() {
  const profile = state.studentProfile;
  if (!profile) return;

  const { data: sem, error: semErr } = await supabaseClient
    .from('student_semesters')
    .select('*')
    .eq('student_id', profile.id)
    .eq('is_current', true)
    .maybeSingle();

  if (semErr) console.error('Semester fetch error:', semErr);

  const { data: clearances } = await supabaseClient
    .from('clearances')
    .select('status')
    .eq('student_id', profile.id);

  const clearedCount = (clearances || []).filter(c => c.status === 'cleared').length;
  const totalClear = (clearances || []).length || 1;

  const { data: nextDue } = await supabaseClient
    .from('installments')
    .select('*')
    .eq('student_id', profile.id)
    .eq('status', 'pending')
    .order('due_date', { ascending: true })
    .limit(1)
    .maybeSingle();

  const { data: activities } = await supabaseClient
    .from('activities')
    .select('*')
    .eq('student_id', profile.id)
    .order('created_at', { ascending: false })
    .limit(5);

  state.dashboard = {
    student: {
      name: profile.full_name,
      studentNo: profile.student_no,
      section: profile.section,
      program: profile.program,
      yearLevel: profile.year_level,
      email: profile.email,
      avatarUrl: profile.avatar_url,
      schoolYear: sem?.school_year ? sem.school_year.replace(/[\u2013\u2014]/g, '-') : '2026-2027',
      semester: sem?.semester || '1st Semester',
    },
    gwa: sem?.gwa ?? '—',
    unitsEnrolled: sem?.units_enrolled ?? 0,
    subjectsEnrolled: sem?.subjects_enrolled ?? 0,
    balance: sem?.balance ?? 0,
    nextDue: nextDue ? { due_date: nextDue.due_date, name: nextDue.name } : null,
    clearance: { cleared: clearedCount, total: totalClear },
    activity: activities || [],
  };

  renderDashboard();
}

function renderDashboard() {
  const d = state.dashboard;
  if (!d) return;

  const greeting = getTimeGreeting();
  const studentName = d.student.name || '—';
  const studentNo = d.student.studentNo || '—';
  const initials = getInitials(studentName);
  const firstName = studentName.split(' ')[0];

  setText('heroGreeting', `${greeting}, ${firstName}!`);

  const heroSubtitle = getEl('heroSubtitle');
  if (heroSubtitle) {
    const yr = d.student.yearLevel ? ` — ${d.student.program} ${d.student.yearLevel}` : '';
    heroSubtitle.textContent = `${d.student.semester}, ${d.student.schoolYear}${yr}`;
  }

  const heroMeta = getEl('sidebarMeta');
  if (heroMeta) {
    const section = d.student.section ? ` · Section: ${d.student.section}` : '';
    heroMeta.textContent = `Student No. ${studentNo}${section}`;
  }

  const sidebarAvatar = getEl('sidebarAvatar');
  const sidebarName = getEl('sidebarName');
  const sidebarStudentNo = getEl('sidebarStudentNo');
  const topAvatar = getEl('topAvatar');
  const topName = getEl('topName');

  const avatarContent = d.student.avatarUrl
    ? `<img src="${d.student.avatarUrl}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">`
    : initials;

  if (sidebarAvatar) sidebarAvatar.innerHTML = avatarContent;
  if (sidebarName) sidebarName.textContent = studentName;
  if (sidebarStudentNo) sidebarStudentNo.textContent = studentNo;
  if (topAvatar) topAvatar.innerHTML = avatarContent;
  if (topName) topName.textContent = firstName;

  setText('stat-gwa', d.gwa);
  setText('stat-units', d.unitsEnrolled);
  setText('stat-subjects', `${d.subjectsEnrolled} subject${d.subjectsEnrolled === 1 ? '' : 's'}`);
  setText('stat-balance', peso(d.balance));
  setText('stat-due', d.balance > 0 && d.nextDue ? `Due ${fmtDate(d.nextDue.due_date)}` : 'All settled ✓');
  setText('stat-clearance', `${d.clearance.cleared}/${d.clearance.total}`);

  const actList = getEl('activityList');
  if (actList) {
    actList.innerHTML = d.activity.length
      ? d.activity.map(a => `
        <div class="activity-row" style="display:flex;align-items:center;gap:12px;margin-bottom:12px;">
          <div class="adot" style="width:8px;height:8px;border-radius:50%;background:${a.color || '#E7338A'};"></div>
          <div><div class="t" style="font-size:13px;font-weight:600;">${escapeHtml(a.description)}</div><div class="d" style="font-size:11px;color:var(--ink-500);">${fmtDate(a.created_at)}</div></div>
        </div>`).join('')
      : `<div style="color:var(--ink-300);font-size:13px;">No recent activity yet.</div>`;
  }

  const sf = getEl('sidebarFoot');
  if (sf) {
    const sy = d.student.schoolYear || '2026-2027';
    const sem = d.student.semester || '1st Semester';
    const prog = d.student.program || '—';
    const yr = d.student.yearLevel || '—';
    sf.innerHTML = `${sy} · ${sem}<br>${prog} — ${yr}`;
  }
}

// ── Announcements, Deadlines & Notifications ──────────────────────────
async function loadAnnouncements() {
  const { data: rows } = await supabaseClient
    .from('announcements')
    .select('*')
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(1);

  const banner = getEl('topBanner');
  if (rows && rows[0] && banner) {
    const a = rows[0];
    const deadline = a.deadline ? ` Deadline: <b>${fmtDate(a.deadline)}</b>.` : '';
    banner.innerHTML = `🔔 ${escapeHtml(a.content)}${deadline}`;
  }
}

async function loadDeadlines() {
  const profile = state.studentProfile;
  if (!profile) return;

  const { data: rows } = await supabaseClient
    .from('deadlines')
    .select('*')
    .eq('is_active', true)
    .order('due_date', { ascending: true })
    .limit(4);

  const container = getEl('deadlinesCard');
  if (!container) return;

  const urgencyClass = (type) => type === 'urgent' ? 'urgent' : '';
  const pillClass = (type) => type === 'urgent' ? 'pill-urgent' : 'pill-soft';
  const pillText = (type) => type === 'urgent' ? 'URGENT' : (type === 'schedule' ? 'SCHEDULE' : 'OPTIONAL');
  const dateColor = (type) => type === 'urgent' ? 'color:var(--pink-600);font-weight:700;' : 'color:var(--ink-500);';

  container.innerHTML = `<div class="card-head"><h3>Upcoming Deadlines</h3></div>` +
    ((rows && rows.length) ? rows.map(d => `
      <div class="deadline ${urgencyClass(d.type)}" style="padding:10px 0;border-bottom:1px solid var(--line);">
        <div class="deadline-top" style="display:flex;justify-space-between;align-items:center;">
          <span class="t" style="font-size:13px;font-weight:600;">${escapeHtml(d.title)}</span>
          <span class="pill ${pillClass(d.type)}">${pillText(d.type)}</span>
        </div>
        <div class="d" style="${dateColor(d.type)}font-size:12px;margin-top:2px;">${fmtDate(d.due_date)}</div>
      </div>
    `).join('') : `<div style="font-size:13px;color:var(--ink-500);padding:10px 0;">No upcoming deadlines.</div>`);
}

async function loadNotifications() {
  const profile = state.studentProfile;
  if (!profile) return;

  const { data: rows } = await supabaseClient
    .from('activities')
    .select('*')
    .eq('student_id', profile.id)
    .order('created_at', { ascending: false })
    .limit(3);

  if (Array.isArray(rows)) {
    pendingNotifIds = rows.map(r => r.id);
  } else {
    pendingNotifIds = [];
  }
  refreshBellDot();

  const target = getEl('notifList');
  if (target) {
    target.innerHTML = (rows && rows.length) ? rows.map(n => `
      <div class="notif-item" style="padding:10px 14px;border-bottom:1px solid var(--line);">
        <div class="t" style="font-size:12px;font-weight:600;">${escapeHtml(n.description)}</div>
        <div class="d" style="font-size:10px;color:var(--ink-500);">${fmtDate(n.created_at)}</div>
      </div>
    `).join('') : `<div class="notif-item"><div class="t">No new notifications</div></div>`;
  }
}

// ── Notification unread badge (client-side "seen" tracking) ───────────
let pendingNotifIds = [];
function notifSeenKey() {
  return `imcc_notif_seen_${state.studentProfile?.id || 'anon'}`;
}
function getNotifSeen() {
  try {
    return new Set(JSON.parse(localStorage.getItem(notifSeenKey()) || '[]'));
  } catch (e) {
    return new Set();
  }
}
function saveNotifSeen(set) {
  try {
    localStorage.setItem(notifSeenKey(), JSON.stringify(Array.from(set)));
  } catch (e) { /* storage unavailable */ }
}
function refreshBellDot() {
  const dot = getEl('notifDot');
  if (!dot) return;
  const seen = getNotifSeen();
  const unseen = pendingNotifIds.filter(id => !seen.has(id)).length;
  dot.textContent = unseen > 9 ? '9+' : unseen;
  dot.classList.toggle('show', unseen > 0);
}
function markBellSeen() {
  const seen = getNotifSeen();
  pendingNotifIds.forEach(id => seen.add(id));
  saveNotifSeen(seen);
  refreshBellDot();
}

// ── Enrollment Module ────────────────────────────────────────────────
async function loadEnrollment() {
  const profile = state.studentProfile;
  if (!profile) return;

  const { data: currentSem } = await supabaseClient
    .from('student_semesters')
    .select('school_year, semester')
    .eq('student_id', profile.id)
    .eq('is_current', true)
    .maybeSingle();

  const activeSchoolYear = currentSem?.school_year ? currentSem.school_year.replace(/[\u2013\u2014]/g, '-') : '2026-2027';
  const activeSemester = currentSem?.semester || '1st Semester';

  const sectionTitle = getEl('enrollmentSectionTitle');
  if (sectionTitle) {
    sectionTitle.textContent = `Available Courses — ${activeSemester} ${activeSchoolYear}`;
  }

  const { data: offerings } = await supabaseClient
    .from('course_offerings')
    .select('*')
    .eq('semester', activeSemester)
    .eq('school_year', activeSchoolYear);

  const { data: enrolled } = await supabaseClient
    .from('enrollments')
    .select('offering_id')
    .eq('student_id', profile.id);

  const enrolledIds = new Set((enrolled || []).map(e => String(e.offering_id)));

  const { data: misc } = await supabaseClient
    .from('misc_fees')
    .select('*')
    .eq('semester', activeSemester)
    .eq('school_year', activeSchoolYear);

  state.courses = (offerings || []).map(o => ({
    offering_id: String(o.id),
    code: o.code,
    title: o.title,
    units: o.units,
    fee: o.fee,
    instructor_name: o.instructor_name,
    schedule: o.schedule,
    selected: enrolledIds.has(String(o.id)),
  }));

  state.miscFees = misc || [];
  state.selectedOfferingIds = new Set(state.courses.filter(c => c.selected).map(c => c.offering_id));

  renderCourseList();
  renderMiscFees();
  renderBillingSummary();
}

// Schedule parser & conflict detection — delegated to shared/datetime.js (SCHOOLTIME)
const parseSchedule = SCHOOLTIME.parseSchedule;
const schedulesConflict = SCHOOLTIME.schedulesConflict;

function checkScheduleConflict(courseId) {
  const newCourse = state.courses.find(c => c.offering_id === courseId);
  if (!newCourse) return null;
  const newSched = parseSchedule(newCourse.schedule);
  if (!newSched) return null;

  for (const id of state.selectedOfferingIds) {
    if (id === courseId) continue;
    const existing = state.courses.find(c => c.offering_id === id);
    if (!existing) continue;
    const existingSched = parseSchedule(existing.schedule);
    if (schedulesConflict(newSched, existingSched)) return existing;
  }
  return null;
}

function renderCourseList() {
  const container = getEl('courseList');
  if (!container) return;

  container.innerHTML = state.courses.map(c => {
    const checked = state.selectedOfferingIds.has(c.offering_id);
    return `
    <div class="course-row ${checked ? 'checked' : ''}" data-id="${c.offering_id}">
      <div class="chk">${checked ? '✓' : ''}</div>
      <div>
        <div class="code">${escapeHtml(c.code)}</div>
        <div class="title">${escapeHtml(c.title)}</div>
        <div class="meta">${escapeHtml(c.instructor_name || 'TBA')} · ${escapeHtml(c.schedule || 'Schedule TBA')}</div>
      </div>
      <div class="fee">
        <div class="units">${c.units} units</div>
        <div class="amt">${peso(c.fee)}</div>
      </div>
    </div>`;
  }).join('');

  container.querySelectorAll('.course-row').forEach(row => {
    row.addEventListener('click', () => {
      const id = String(row.dataset.id);
      if (state.selectedOfferingIds.has(id)) {
        state.selectedOfferingIds.delete(id);
        renderCourseList();
        renderBillingSummary();
      } else {
        const conflict = checkScheduleConflict(id);
        if (conflict) {
          const newCourse = state.courses.find(c => c.offering_id === id);
          showToast(`⚠ Schedule conflict: ${newCourse.code} overlaps with ${conflict.code} (${conflict.schedule})`, true);
          return;
        }
        state.selectedOfferingIds.add(id);
        renderCourseList();
        renderBillingSummary();
      }
    });
  });
}

function renderMiscFees() {
  const el = getEl('miscFeeLines');
  if (!el) return;
  el.innerHTML = state.miscFees
    .map(f => `<div class="fee-line"><span>${escapeHtml(f.name)}</span><b>${peso(f.amount)}</b></div>`)
    .join('');
}

function miscTotal() {
  return state.miscFees.reduce((s, f) => s + Number(f.amount || 0), 0);
}

function renderBillingSummary() {
  const selected = state.courses.filter(c => state.selectedOfferingIds.has(c.offering_id));
  const tLines = getEl('tuitionLines');
  if (tLines) {
    tLines.innerHTML = selected.length
      ? selected.map(c => `<div class="fee-line"><span>${escapeHtml(c.code)}</span><b>${peso(c.fee)}</b></div>`).join('')
      : `<div class="fee-line" style="color:var(--ink-300);">No subjects selected yet</div>`;
  }

  const tuitionSum = selected.reduce((s, c) => s + Number(c.fee || 0), 0);
  const total = tuitionSum + miscTotal();

  setText('feeTotal', peso(total));
  const units = selected.reduce((s, c) => s + Number(c.units || 0), 0);
  setText('feeSub', `${units} units · ${selected.length} subject${selected.length === 1 ? '' : 's'}`);

  const proceedBtn = getEl('proceedBtn');
  if (proceedBtn) proceedBtn.disabled = selected.length === 0;
}

function renderReviewList() {
  const container = getEl('reviewCourseList');
  if (!container) return;

  const selected = state.courses.filter(c => state.selectedOfferingIds.has(c.offering_id));
  const tuitionSum = selected.reduce((s, c) => s + Number(c.fee || 0), 0);

  container.innerHTML = selected.map(c => `
    <div class="course-row checked" style="cursor:default;">
      <div class="chk">✓</div>
      <div>
        <div class="code">${escapeHtml(c.code)}</div>
        <div class="title">${escapeHtml(c.title)}</div>
        <div class="meta">${escapeHtml(c.instructor_name || 'TBA')} · ${escapeHtml(c.schedule || 'Schedule TBA')}</div>
      </div>
      <div class="fee">
        <div class="units">${c.units} units</div>
        <div class="amt">${peso(c.fee)}</div>
      </div>
    </div>`).join('') + `
    <div style="display:flex;justify-content:space-between;padding:14px 16px;background:var(--pink-50, #fdf2f8);border-radius:12px;margin-top:12px;">
      <b>Total Amount Due</b><b style="color:var(--pink-600, #db2777);">${peso(tuitionSum + miscTotal())}</b>
    </div>
    <button class="btn btn-primary" id="confirmEnrollBtn" style="width:100%;justify-content:center;margin-top:16px;">Confirm Enrollment →</button>`;

  const confirmBtn = getEl('confirmEnrollBtn');
  if (confirmBtn) {
    confirmBtn.replaceWith(confirmBtn.cloneNode(true));
    getEl('confirmEnrollBtn')?.addEventListener('click', confirmEnrollment);
  }
}

function setEnrollStep(step) {
  state.enrollStep = step;
  const s1 = getEl('enrollStep1');
  const s2 = getEl('enrollStep2');
  const s3 = getEl('enrollStep3');
  if (s1) s1.style.display = step === 1 ? 'block' : 'none';
  if (s2) s2.style.display = step === 2 ? 'block' : 'none';
  if (s3) s3.style.display = step === 3 ? 'block' : 'none';

  [1, 2, 3].forEach(n => {
    const tab = getEl('stepTab' + n);
    if (tab) {
      tab.classList.toggle('active', n === step);
      tab.classList.toggle('done', n < step);
    }
  });
  if (step === 2) renderReviewList();
}
window.setEnrollStep = setEnrollStep;

getEl('proceedBtn')?.addEventListener('click', () => setEnrollStep(2));
getEl('backToStep1')?.addEventListener('click', () => setEnrollStep(1));

async function confirmEnrollment() {
  const profile = state.studentProfile;
  const btn = getEl('confirmEnrollBtn');
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Submitting…';
  }
  try {
    const inserts = [...state.selectedOfferingIds].map(oid => ({
      student_id: profile.id,
      offering_id: oid,
      status: 'enrolled',
    }));
    const { error } = await supabaseClient.from('enrollments').insert(inserts);
    if (error) throw error;

    setEnrollStep(3);
    showToast('Enrollment confirmed successfully');
    await Promise.all([loadDashboard(), loadEnrollment()]);
  } catch (err) {
    showToast('Could not confirm enrollment: ' + err.message, true);
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Confirm Enrollment →';
    }
  }
}

// ── Billing Module ───────────────────────────────────────────────────
async function loadBilling() {
  const profile = state.studentProfile;
  if (!profile) return;

  // Get current semester
  const { data: sem } = await supabaseClient
    .from('student_semesters')
    .select('school_year, semester')
    .eq('student_id', profile.id)
    .eq('is_current', true)
    .maybeSingle();

  const activeSchoolYear = sem?.school_year || '2026-2027';
  const activeSemester = sem?.semester || '1st Semester';

  const [summaryRes, txnsRes, instRes, enrollmentsRes, miscRes] = await Promise.all([
    supabaseClient.from('billing_summary').select('*').eq('student_id', profile.id).maybeSingle(),
    supabaseClient.from('transactions').select('*').eq('student_id', profile.id).order('txn_date', { ascending: false }),
    supabaseClient.from('installments').select('*').eq('student_id', profile.id).order('due_date', { ascending: true }),
    supabaseClient.from('enrollments').select('offering_id, course_offerings(code, title, units, fee, semester, school_year)').eq('student_id', profile.id).eq('status', 'enrolled'),
    supabaseClient.from('misc_fees').select('*').eq('semester', activeSemester).eq('school_year', activeSchoolYear),
  ]);

  // Compute tuition from currently enrolled courses this semester
  const enrolledCourses = (enrollmentsRes.data || [])
    .map(e => e.course_offerings)
    .filter(c => c && c.school_year === activeSchoolYear && c.semester === activeSemester);

  const tuitionTotal = enrolledCourses.reduce((s, c) => s + Number(c.fee || 0), 0);
  const miscTotal = (miscRes.data || []).reduce((s, f) => s + Number(f.amount || 0), 0);
  const totalAssessment = tuitionTotal + miscTotal;
  const totalPaid = Number(summaryRes.data?.total_paid || 0);
  const balance = Math.max(0, totalAssessment - totalPaid);

  // Installments come from the installments table only.
  //
  // This previously invented a 32/25/25/remainder schedule whenever the
  // table was empty, which displayed fabricated amounts, due dates and
  // "Pay Now" buttons for a payment plan the school had never issued. An
  // empty schedule is now reported as "not published" instead.
  const installments = instRes.data || [];
  const schedulePublished = installments.length > 0;

  state.billing = {
    totalPaid,
    totalAssessment,
    tuitionTotal,
    miscTotal,
    balance,
    installments,
    schedulePublished,
    transactions: txnsRes.data || [],
    enrolledCourses,
    miscFeesList: miscRes.data || [],
    activeSemester,
    activeSchoolYear,
  };

  renderBillingStats();
  renderBillingBreakdown();
  renderInstallments();
  renderUpay();
  renderTxns();
}

function renderBillingStats() {
  const b = state.billing;
  const pending = b.installments.filter(i => i.status === 'pending');
  setText('bill-totalpaid', peso(b.totalPaid));
  setText('bill-balance', peso(b.balance));
  const next = pending[0];
  setText('bill-nextdate', next?.due_date ? fmtDate(next.due_date).split(',')[0] : (next ? 'See schedule' : '—'));
  setText('bill-nextlabel', next ? next.name.toLowerCase() : 'nothing due');
}

function renderBillingBreakdown() {
  const b = state.billing;
  const target = getEl('billingBreakdown');
  if (!target) return;

  const courseRows = (b.enrolledCourses || []).map(c =>
    `<tr><td>${escapeHtml(c.code)}</td><td>${escapeHtml(c.title)}</td><td style="text-align:right">${Number(c.units||0).toFixed(1)} u</td><td style="text-align:right;font-weight:700;">${peso(c.fee)}</td></tr>`
  ).join('');

  const miscRows = (b.miscFeesList || []).map(f =>
    `<tr><td colspan="3" style="color:var(--ink-500)">${escapeHtml(f.name)}</td><td style="text-align:right;">${peso(f.amount)}</td></tr>`
  ).join('');

  const installRows = (b.installments || []).map(i => {
    const pct = b.totalAssessment > 0 ? Math.round((Number(i.amount)/b.totalAssessment)*100) : 0;
    const paid = i.status === 'paid';
    return `<tr>
      <td><b>${escapeHtml(i.name)}</b></td>
      <td>${i.due_date ? fmtDate(i.due_date) : '<span style="color:var(--ink-300)">TBA</span>'}</td>
      <td style="text-align:right;font-weight:800;color:${paid ? 'var(--green)' : 'var(--pink-600)'};">${peso(i.amount)}</td>
      <td><span style="font-size:10px;font-weight:800;color:${paid ? 'var(--green)' : 'var(--amber)'};">${paid ? '✓ PAID' : `${pct}%`}</span></td>
    </tr>`;
  }).join('');

  target.innerHTML = `
    <div style="border:1px solid var(--line);border-radius:12px;overflow:hidden;margin-bottom:16px;">
      <div style="background:var(--card);padding:12px 16px;font-weight:800;font-size:13px;border-bottom:1px solid var(--line);">
        📚 Enrolled Subjects — ${escapeHtml(b.activeSemester)} ${escapeHtml(b.activeSchoolYear)}
      </div>
      <table style="width:100%;border-collapse:collapse;font-size:13px;">
        <thead><tr style="background:var(--bg);">
          <th style="padding:8px 12px;text-align:left;color:var(--ink-500);font-size:11px;">CODE</th>
          <th style="padding:8px 12px;text-align:left;color:var(--ink-500);font-size:11px;">SUBJECT</th>
          <th style="padding:8px 12px;text-align:right;color:var(--ink-500);font-size:11px;">UNITS</th>
          <th style="padding:8px 12px;text-align:right;color:var(--ink-500);font-size:11px;">FEE</th>
        </tr></thead>
        <tbody>${courseRows || '<tr><td colspan="4" style="padding:12px;text-align:center;color:var(--ink-400);">No enrolled subjects this term.</td></tr>'}</tbody>
        ${miscRows ? `<tbody style="border-top:1px solid var(--line);">${miscRows}</tbody>` : ''}
        <tfoot style="border-top:2px solid var(--line);background:var(--bg);">
          <tr><td colspan="3" style="padding:10px 12px;font-weight:800;">Tuition Subtotal</td><td style="padding:10px 12px;text-align:right;font-weight:800;">${peso(b.tuitionTotal)}</td></tr>
          ${b.miscTotal ? `<tr><td colspan="3" style="padding:4px 12px;color:var(--ink-500);">Miscellaneous Fees</td><td style="padding:4px 12px;text-align:right;">${peso(b.miscTotal)}</td></tr>` : ''}
          <tr style="background:rgba(231,51,138,0.06);"><td colspan="3" style="padding:10px 12px;font-weight:800;color:var(--pink-600);">Total Assessment</td><td style="padding:10px 12px;text-align:right;font-weight:800;color:var(--pink-600);font-size:15px;">${peso(b.totalAssessment)}</td></tr>
        </tfoot>
      </table>
    </div>
    ${installRows ? `
    <div style="border:1px solid var(--line);border-radius:12px;overflow:hidden;">
      <div style="background:var(--card);padding:12px 16px;font-weight:800;font-size:13px;border-bottom:1px solid var(--line);">
        💳 Per-Term Payment Schedule
      </div>
      <table style="width:100%;border-collapse:collapse;font-size:13px;">
        <thead><tr style="background:var(--bg);">
          <th style="padding:8px 12px;text-align:left;color:var(--ink-500);font-size:11px;">TERM</th>
          <th style="padding:8px 12px;text-align:left;color:var(--ink-500);font-size:11px;">DUE DATE</th>
          <th style="padding:8px 12px;text-align:right;color:var(--ink-500);font-size:11px;">AMOUNT</th>
          <th style="padding:8px 12px;text-align:center;color:var(--ink-500);font-size:11px;">STATUS</th>
        </tr></thead>
        <tbody>${installRows}</tbody>
        <tfoot style="border-top:2px solid var(--line);background:var(--bg);">
          <tr><td colspan="2" style="padding:10px 12px;font-weight:800;">Total Paid</td><td style="padding:10px 12px;text-align:right;color:var(--green);font-weight:800;">${peso(b.totalPaid)}</td><td></td></tr>
          <tr><td colspan="2" style="padding:4px 12px;font-weight:800;color:var(--red);">Remaining Balance</td><td style="padding:4px 12px;text-align:right;color:var(--red);font-weight:800;font-size:15px;">${peso(b.balance)}</td><td></td></tr>
        </tfoot>
      </table>
    </div>` : ''}`;
}


function renderTxns() {
  const target = getEl('txnBody');
  if (!target) return;
  target.innerHTML = (state.billing.transactions.length) ? state.billing.transactions.map(t => `
    <tr>
      <td class="or-num">${escapeHtml(t.or_number || '—')}</td>
      <td>${fmtDate(t.txn_date)}</td>
      <td>${escapeHtml(t.description)}</td>
      <td><span class="chan">${escapeHtml(t.channel)}</span></td>
      <td class="amt-green">${peso(t.amount)}</td>
      <td><button class="mini-btn" onclick="showToast('OR #${t.or_number || ''} recorded.')">View</button></td>
    </tr>`).join('') : `<tr><td colspan="6" style="text-align:center;color:var(--ink-300);padding:20px;">No transaction records found.</td></tr>`;
}

function renderInstallments() {
  const target = getEl('instList');
  if (!target) return;

  const list = state.billing.installments || [];

  // An empty schedule means the school has not published one. It does not
  // mean the balance is settled, and it must not be rendered as if it did.
  if (!list.length) {
    target.innerHTML = `
      <div class="inst-empty" style="text-align:center;padding:22px 12px;color:var(--ink-500);font-size:13px;line-height:1.5;">
        No installment schedule has been published yet.<br>
        <span style="font-size:12px;">Your assessed balance is shown above. Please confirm payment terms with the Cashier's Office.</span>
      </div>`;
    return;
  }

  target.innerHTML = list.map(i => `
    <div class="inst-row" style="display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--line);">
      <div><div class="n" style="font-size:13px;font-weight:600;">${escapeHtml(i.name)}</div><div class="dt" style="font-size:11px;color:var(--ink-500);">${i.due_date ? 'Due ' + escapeHtml(fmtDate(i.due_date)) : 'No due date set'}</div></div>
      <div style="text-align:right;">
        <div class="${i.status === 'paid' ? 'amt-strike' : 'amt-pink'}" style="font-weight:700;">${peso(i.amount)}</div>
        <div style="font-size:10.5px;font-weight:800;color:${i.status === 'paid' ? 'var(--green)' : 'var(--red)'};">${i.status === 'paid' ? '✓ PAID' : 'PENDING'}</div>
      </div>
    </div>`).join('');
}

function renderUpay() {
  const target = getEl('upayList');
  if (!target) return;

  const list = state.billing.installments || [];

  if (!list.length) {
    target.innerHTML = `
      <div class="upay" style="text-align:center;padding:18px 14px;color:var(--ink-500);font-size:13px;line-height:1.5;">
        <b style="display:block;margin-bottom:6px;color:var(--ink-900);font-size:14px;">No payment schedule published</b>
        Pay at the Cashier's Office or through your designated payment channel.<br>
        <span style="font-size:12px;">A schedule appears here once the Cashier's Office issues it.</span>
      </div>`;
    return;
  }

  const pending = list.filter(i => i.status === 'pending');

  target.innerHTML = pending.length ? pending.map(i => `
    <div class="upay due" style="padding:12px;border:1px solid var(--line);border-radius:8px;margin-bottom:10px;">
      <div class="upay-top" style="display:flex;justify-content:space-between;align-items:center;">
        <span class="t" style="font-weight:600;font-size:13px;">${escapeHtml(i.name)}</span>
        <span class="pill pill-urgent">PENDING</span>
      </div>
      <div class="amt" style="color:var(--pink-600);font-size:18px;font-weight:800;margin:6px 0;">${peso(i.amount)}</div>
      <div class="due-date" style="font-size:12px;color:var(--ink-500);">${i.due_date ? 'Due: ' + escapeHtml(fmtDate(i.due_date)) : 'Due date not set'}</div>
      <div style="margin-top:10px;font-size:12px;color:var(--ink-500);line-height:1.5;">
        Pay at the Cashier's Office. Payment status is recorded by cashier staff.
      </div>
    </div>`).join('') : `
    <div class="upay" style="text-align:center;color:var(--green);font-weight:700;padding:15px;">✓ All installments recorded as paid</div>`;
}

// payInstallment() was removed. It was not a payment flow: it wrote
// status='paid' straight to the installments table, which the RLS policy
// "Students update own installments" allowed a student to do for their
// own rows. A student could therefore settle their own tuition, and a
// zero balance then cleared the cashier's hold on clearance. Recording a
// payment is a cashier action; see database/security-hardening-phase0b.sql.

getEl('exportBtn')?.addEventListener('click', () => {
  if (!state.billing.transactions.length) {
    showToast('No transactions to export.', true);
    return;
  }
  const csv = [
    ['OR NUMBER', 'DATE', 'DESCRIPTION', 'CHANNEL', 'AMOUNT'],
    ...state.billing.transactions.map(t => [t.or_number, t.txn_date, `"${t.description}"`, t.channel, t.amount])
  ].map(r => r.join(',')).join('\n');

  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `MyIMCC_Transactions_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
});

// ── Grades Module ────────────────────────────────────────────────────
// Term filter state for grades dropdown
let _gradesSelectedTerm = null;

function gradesForSelectedTerm() {
  if (!_gradesSelectedTerm || !state.grades || !state.grades.length) return state.grades || [];
  const [sy, sem] = _gradesSelectedTerm.split('|');
  return state.grades.filter(g => g.school_year === sy && g.semester === sem);
}

function buildGradesTermDropdown() {
  const termMap = new Map();
  (state.grades || []).forEach(g => {
    if (!g.school_year) return;
    const key = `${g.school_year}|${g.semester}`;
    termMap.set(key, { key, school_year: g.school_year, semester: g.semester });
  });
  const terms = [...termMap.values()].sort((a, b) => {
    const ya = parseInt(a.school_year), yb = parseInt(b.school_year);
    if (ya !== yb) return yb - ya;
    return a.semester.includes('2nd') ? 1 : -1;
  });

  if (!_gradesSelectedTerm && terms.length) _gradesSelectedTerm = terms[0].key;

  let dd = getEl('gradeTermSelect');
  if (!dd) {
    const gradesTitle = getEl('gradesTitle');
    if (gradesTitle && gradesTitle.parentNode) {
      const wrap = document.createElement('div');
      wrap.style.cssText = 'display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:12px;';
      const lbl = document.createElement('label');
      lbl.style.cssText = 'font-size:12px;font-weight:700;color:var(--ink-500);white-space:nowrap;';
      lbl.textContent = 'Semester:';
      dd = document.createElement('select');
      dd.id = 'gradeTermSelect';
      dd.style.cssText = 'background:var(--card,#fff);border:1px solid var(--line);border-radius:8px;padding:6px 12px;font-size:13px;font-weight:600;color:var(--ink-900);outline:none;cursor:pointer;';
      dd.addEventListener('change', () => {
        _gradesSelectedTerm = dd.value;
        renderGrades();
        renderGradeStats();
        renderGradesHeader();
      });
      wrap.appendChild(lbl);
      wrap.appendChild(dd);
      gradesTitle.parentNode.insertBefore(wrap, gradesTitle.nextSibling);
    }
  }

  if (dd) {
    dd.innerHTML = terms.map(t =>
      `<option value="${t.key}" ${t.key === _gradesSelectedTerm ? 'selected' : ''}>${t.semester} — ${t.school_year}</option>`
    ).join('');
  }
}

async function loadGrades() {
  const profile = state.studentProfile;
  if (!profile) return;

  const { data: rows } = await supabaseClient
    .from('grades')
    .select('*, course_offerings(code, title, units, instructor_name, semester, school_year)')
    .eq('student_id', profile.id);

  state.grades = (rows || []).map(g => ({
    code: g.course_offerings?.code || '—',
    title: g.course_offerings?.title || '—',
    instructor_name: g.course_offerings?.instructor_name,
    units: g.course_offerings?.units,
    semester: g.course_offerings?.semester || '',
    school_year: g.course_offerings?.school_year || '',
    prelim: g.prelim,
    midterm: g.midterm,
    semifinal: g.semifinal,
    final: g.final,
    equivalent: g.equivalent,
    ai_predicted_grade: g.ai_predicted_grade,
    ai_predicted_equivalent: g.ai_predicted_equivalent,
    remark: g.remark || 'Pending',
  }));

  buildGradesTermDropdown();
  renderGrades();
  renderGradeStats();
  renderGradesHeader();
  setupProspectusButton();
}


function renderGradeStats() {
  const termGrades = gradesForSelectedTerm();
  const withFinal = termGrades.filter(g => g.final !== null && g.final !== undefined);
  const avg = withFinal.length ? (withFinal.reduce((s, g) => s + Number(g.equivalent || 0), 0) / withFinal.length).toFixed(2) : '—';
  const highest = withFinal.length ? Math.max(...withFinal.map(g => Number(g.final))) : '—';
  const highestCourse = withFinal.find(g => Number(g.final) === highest);
  const completed = withFinal.length;
  const total = termGrades.length;

  setText('grade-gwa', avg);
  setText('grade-gwa-sub', `${completed} subject${completed === 1 ? '' : 's'} with final grades`);
  setText('grade-highest', highest);
  setText('grade-highest-course', highestCourse ? `${highestCourse.code} — Final` : '—');

  const withAi = state.grades.filter(g => g.ai_predicted_equivalent !== null && g.ai_predicted_equivalent !== undefined);
  const aiAvg = withAi.length ? (withAi.reduce((s, g) => s + Number(g.ai_predicted_equivalent), 0) / withAi.length).toFixed(2) : '—';
  setText('grade-ai', aiAvg);
  setText('grade-completed', `${completed}/${total}`);
}

function renderGrades() {
  const target = getEl('gradesBody');
  if (!target) return;
  const periodCell = (val) => val !== null && val !== undefined
    ? `<span style="color:var(--blue);font-weight:700;">${val}</span>`
    : `<span style="font-style:italic;color:var(--ink-300);">—</span>`;

  const termGrades = gradesForSelectedTerm();
  if (!termGrades || termGrades.length === 0) {
    target.innerHTML = `<tr><td colspan="11" style="text-align:center;color:var(--ink-400);padding:36px;font-size:13px;">No grades recorded for this term yet. Once faculty encodes your grades, they will appear here.</td></tr>`;
    return;
  }

  target.innerHTML = termGrades.map(g => `
    <tr>
      <td class="or-num">${escapeHtml(g.code)}</td>
      <td>${escapeHtml(g.title)}</td>
      <td style="color:var(--ink-500);">${escapeHtml(g.instructor_name || 'TBA')}</td>
      <td>${g.units || '—'}</td>
      <td>${periodCell(g.prelim)}</td>
      <td>${periodCell(g.midterm)}</td>
      <td>${periodCell(g.semifinal)}</td>
      <td style="${g.final !== null && g.final !== undefined ? 'color:var(--green);font-weight:700;' : 'font-style:italic;color:var(--ink-300);'}">${g.final ?? 'Pending'}</td>
      <td style="font-weight:800;">${g.equivalent ?? '–'}</td>
      <td><span class="pred-chip" style="background:var(--pink-50, #fdf2f8);color:var(--pink-600, #db2777);padding:2px 8px;border-radius:12px;font-weight:600;font-size:12px;">~ ${g.ai_predicted_grade ?? '–'} <small>(${g.ai_predicted_equivalent ?? '–'})</small></span></td>
      <td><span class="badge ${g.remark === 'Passed' ? 'badge-green' : 'badge-blue'}">${escapeHtml(g.remark)}</span></td>
    </tr>`).join('');
}

function renderGradesHeader() {
  const profile = state.studentProfile;
  const program = profile?.program || 'BSIT';
  const yearLevel = profile?.year_level || '';
  const section = profile?.section || '';

  // Use selected term from dropdown, fall back to current semester
  let semester = '1st Semester', schoolYear = '2026-2027';
  if (_gradesSelectedTerm) {
    const [sy, sem] = _gradesSelectedTerm.split('|');
    schoolYear = sy;
    semester = sem;
  }

  const setTitle = getEl('gradesTitle');
  if (setTitle) {
    setTitle.innerHTML = `Grades — ${semester}, ${schoolYear}<br><span style="font-weight:500;font-size:12px;color:var(--ink-500);" id="gradesSubtitle">${escapeHtml(program)} ${escapeHtml(yearLevel)}${section ? ' · Section ' + escapeHtml(section) : ''}</span>`;
  }
  setText('gradesTermPill', `${semester} ${schoolYear}`);

  const termGrades = gradesForSelectedTerm();
  const aiEl = getEl('aiInsightText');
  if (aiEl) {
    const withAi = termGrades.filter(g => g.ai_predicted_equivalent !== null && g.ai_predicted_equivalent !== undefined);
    const aiAvg = withAi.length ? (withAi.reduce((s, g) => s + Number(g.ai_predicted_equivalent), 0) / withAi.length) : null;

    if (aiAvg !== null) {
      const track = aiAvg <= 1.75 ? "Dean's List" : aiAvg <= 2.5 ? 'Good Standing' : 'At Risk';
      const weakest = withAi.reduce((min, g) => Number(g.ai_predicted_equivalent) < Number(min.ai_predicted_equivalent) ? g : min, withAi[0]);
      const weakTxt = weakest ? ` Focus on ${weakest.code} (${weakest.title}) for improvement.` : '';
      aiEl.innerHTML = `Predicted GWA of <b>${aiAvg.toFixed(2)}</b> — <b>${track}</b> track.${weakTxt}`;
    } else {
      aiEl.textContent = 'AI predictions will appear once Pre-Lim or Midterm grade data is available.';
    }
  }
}


// ── Degree Prospectus Modal ──────────────────────────────────────────
function setupProspectusButton() {
  const prospectusBtn = getEl('prospectusBtn');
  if (prospectusBtn) {
    prospectusBtn.removeEventListener('click', viewProspectus);
    prospectusBtn.addEventListener('click', viewProspectus);
  }

  const closeBtn = getEl('prospectusClose');
  const overlay = getEl('prospectusOverlay');
  const modal = getEl('prospectusModal');

  const closeModal = () => {
    if (modal) modal.style.display = 'none';
    const dyn = document.querySelector('.prospectus-modal-dynamic');
    if (dyn) dyn.remove();
  };

  closeBtn?.removeEventListener('click', closeModal);
  closeBtn?.addEventListener('click', closeModal);
  overlay?.removeEventListener('click', closeModal);
  overlay?.addEventListener('click', closeModal);

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeModal();
  });
}

function getOrdinalSuffix(n) {
  const num = Number(n) || 1;
  const s = ["th", "st", "nd", "rd"];
  const v = num % 100;
  return num + (s[(v - 20) % 10] || s[v] || s[0]);
}

async function viewProspectus() {
  const profile = state.studentProfile;
  if (!profile) return;

  try {
    // 1. Fetch full degree curriculum courses from 'courses' table
    let { data: courses, error: cErr } = await supabaseClient
      .from('courses')
      .select('*')
      .order('year_level', { ascending: true })
      .order('semester', { ascending: true })
      .order('code', { ascending: true });

    if (cErr) console.warn('Courses fetch error, falling back to course_offerings:', cErr);

    // Fallback if courses table returned no records
    if (!courses || courses.length === 0) {
      const { data: offerings } = await supabaseClient
        .from('course_offerings')
        .select('*')
        .order('year', { ascending: true })
        .order('semester', { ascending: true });

      courses = (offerings || []).map(o => ({
        code: o.code,
        title: o.title,
        year_level: o.year || 1,
        semester: o.semester === '2nd Semester' ? 2 : 1,
        lec_units: Number(o.units || 3),
        lab_units: 0,
        prerequisites: o.prerequisites || 'None',
      }));
    }

    // 2. Fetch student's grades and enrollments
    const [{ data: gradesData }, { data: enrollmentsData }] = await Promise.all([
      supabaseClient
        .from('grades')
        .select('equivalent, final, remark, course_offerings(code)')
        .eq('student_id', profile.id),
      supabaseClient
        .from('enrollments')
        .select('status, course_offerings(code)')
        .eq('student_id', profile.id)
    ]);

    // Build lookup maps
    const completedMap = {};
    (gradesData || []).forEach(g => {
      const code = g.course_offerings?.code;
      if (code) {
        const isPassed = g.remark === 'Passed' || (g.equivalent && Number(g.equivalent) <= 3.0 && Number(g.equivalent) > 0);
        completedMap[code.trim().toUpperCase()] = {
          grade: g.final || g.equivalent,
          isPassed: isPassed,
          status: isPassed ? 'completed' : 'enrolled',
        };
      }
    });

    (enrollmentsData || []).forEach(e => {
      const code = e.course_offerings?.code;
      if (code && !completedMap[code.trim().toUpperCase()]) {
        completedMap[code.trim().toUpperCase()] = {
          grade: null,
          isPassed: false,
          status: 'enrolled',
        };
      }
    });

    const programName = profile.program || 'BSIT';
    let totalUnits = 0;
    let unitsCompleted = 0;

    // Group courses by Year and Semester
    const bySem = {};
    (courses || []).forEach(c => {
      const yr = Number(c.year_level || 1);
      const sem = Number(c.semester || 1);
      const key = `${yr}-${sem}`;
      const units = (Number(c.lec_units) || 0) + (Number(c.lab_units) || 0) || Number(c.units || 3);
      totalUnits += units;

      if (!bySem[key]) {
        bySem[key] = {
          year: yr,
          semester: sem,
          semesterLabel: `${getOrdinalSuffix(yr)} Year — ${getOrdinalSuffix(sem)} Semester`,
          courses: []
        };
      }

      const codeClean = (c.code || '').trim().toUpperCase();
      const studentRec = completedMap[codeClean];
      const isCompleted = studentRec?.isPassed || false;
      const isEnrolled = !!studentRec && !isCompleted;

      if (isCompleted) {
        unitsCompleted += units;
      }

      // Identify major subjects
      const isMajor = !!(c.is_major || /^(IT|NET|IAS|CAP|SIA|SA|PROF|IM|IPT|CS|CC)/i.test(c.code || ''));

      bySem[key].courses.push({
        code: c.code,
        title: c.title,
        units: units,
        lecUnits: c.lec_units,
        labUnits: c.lab_units,
        prerequisites: c.prerequisites,
        isMajor: isMajor,
        completed: isCompleted,
        enrolled: isEnrolled,
        grade: studentRec?.grade || null,
      });
    });

    const completionPercentage = totalUnits > 0 ? Math.round((unitsCompleted / totalUnits) * 100) : 0;

    showProspectusModal({
      program: programName,
      totalUnits,
      unitsCompleted,
      completionPercentage,
      bySemester: Object.values(bySem).sort((a, b) => a.year === b.year ? a.semester - b.semester : a.year - b.year),
    });
  } catch (err) {
    showToast('Could not load degree prospectus: ' + err.message, true);
    console.error('Prospectus error:', err);
  }
}
window.viewProspectus = viewProspectus;

function showProspectusModal(data) {
  const modal = getEl('prospectusModal');
  const container = getEl('prospectusContainer');
  const subtitle = getEl('prospectusSubtitle');
  const fill = getEl('prospectusProgressFill');
  const text = getEl('prospectusProgressText');

  if (modal && container) {
    if (subtitle) subtitle.textContent = `${data.program || 'BSIT'} — Bachelor of Science in Information Technology`;
    if (fill) fill.style.width = `${data.completionPercentage || 0}%`;
    if (text) text.textContent = `Overall Curriculum Completion: ${data.completionPercentage || 0}% (${data.unitsCompleted || 0} / ${data.totalUnits || 0} units)`;

    container.innerHTML = (data.bySemester || []).map(sem => `
      <div class="semester-block">
        <div class="semester-title">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="display:inline-block;vertical-align:middle;margin-right:4px;">
            <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>
            <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
          </svg>
          ${sem.semesterLabel}
        </div>
        <div class="course-list">
          ${(sem.courses || []).map(c => `
            <div class="prospectus-course ${c.isMajor ? 'is-major' : ''}" data-status="${c.completed ? 'completed' : 'pending'}">
              <span class="course-status">${c.completed ? '✓' : (c.enrolled ? '⏳' : '○')}</span>
              <div class="course-info">
                <div class="code-line">
                  <span class="code">${escapeHtml(c.code)}</span>
                  ${c.isMajor ? '<span class="major-badge">⭐ MAJOR</span>' : ''}
                  ${c.prerequisites && c.prerequisites !== 'None' ? `<span style="font-size:10px;color:var(--ink-400);background:var(--bg);padding:1px 6px;border-radius:4px;border:1px solid var(--line);margin-left:4px;">Prereq: ${escapeHtml(c.prerequisites)}</span>` : ''}
                </div>
                <div class="title">${escapeHtml(c.title)}</div>
                <div class="meta">${c.lecUnits !== undefined ? `${c.lecUnits} Lec` : ''}${c.labUnits ? ` · ${c.labUnits} Lab` : ''}${c.completed && c.grade ? ` · Final Grade: <strong>${c.grade}</strong>` : (c.enrolled ? ' · Currently Enrolled' : '')}</div>
              </div>
              <div class="units">${c.units} Units</div>
            </div>
          `).join('')}
        </div>
      </div>
    `).join('');

    modal.style.display = 'flex';
  } else {
    // Dynamic fallback modal
    const existing = document.querySelector('.prospectus-modal-dynamic');
    if (existing) existing.remove();

    const dynModal = document.createElement('div');
    dynModal.className = 'prospectus-modal prospectus-modal-dynamic';
    dynModal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:1100;display:flex;align-items:center;justify-content:center;padding:20px;';

    dynModal.innerHTML = `
      <div class="prospectus-content" style="background:var(--bg-card, #ffffff);border:1px solid var(--line, #cbd5e1);border-radius:14px;padding:24px;max-width:760px;width:100%;max-height:85vh;overflow-y:auto;box-shadow:0 20px 40px rgba(0,0,0,0.3);">
        <div class="prospectus-header" style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:16px;">
          <div>
            <h2 style="margin:0;font-size:20px;color:var(--ink-900);">Degree Prospectus</h2>
            <p style="margin:4px 0 0;font-size:13px;color:var(--ink-500);">${escapeHtml(data.program || 'BSIT')} — Total ${data.totalUnits || 0} Units</p>
          </div>
          <button class="prospectus-close" onclick="this.closest('.prospectus-modal-dynamic').remove()" style="background:none;border:none;font-size:24px;cursor:pointer;color:var(--ink-500);">&times;</button>
        </div>
        <div class="prospectus-body">
          <div class="prospectus-progress" style="margin-bottom:20px;">
            <div class="progress-bar" style="height:10px;background:var(--line);border-radius:5px;overflow:hidden;"><div class="progress-fill" style="width:${data.completionPercentage || 0}%;height:100%;background:var(--pink-500, #ec4899);"></div></div>
            <div class="progress-text" style="font-size:12px;color:var(--ink-600);margin-top:6px;font-weight:600;">Overall Curriculum Completion: ${data.completionPercentage || 0}% (${data.unitsCompleted || 0} / ${data.totalUnits || 0} units)</div>
          </div>
          <div class="prospectus-courses">
            ${(data.bySemester || []).length > 0 ? data.bySemester.map(sem => `
              <div class="semester-block" style="margin-bottom:18px;">
                <div class="semester-title" style="font-weight:700;font-size:14px;color:var(--ink-800);margin-bottom:8px;border-bottom:1px solid var(--line);padding-bottom:4px;">${sem.semesterLabel}</div>
                <div class="course-list">
                  ${(sem.courses || []).map(c => `
                    <div class="prospectus-course" style="display:flex;align-items:center;justify-content:space-between;padding:10px;border-radius:8px;margin-bottom:6px;background:var(--bg, #f8fafc);border:1px solid var(--line);">
                      <div style="display:flex;align-items:center;gap:10px;">
                        <span class="course-status" style="font-weight:800;color:${c.completed ? 'var(--green, #10b981)' : 'var(--ink-300)'};">${c.completed ? '✓' : (c.enrolled ? '⏳' : '○')}</span>
                        <div>
                          <div class="code-line">
                            <span class="code" style="font-weight:700;font-size:13px;color:var(--pink-600);">${escapeHtml(c.code)}</span>
                            ${c.isMajor ? '<span style="font-size:10px;background:var(--pink-50);color:var(--pink-600);padding:2px 6px;border-radius:4px;margin-left:6px;font-weight:700;">⭐ MAJOR</span>' : ''}
                            ${c.prerequisites && c.prerequisites !== 'None' ? `<span style="font-size:10px;color:var(--ink-400);background:var(--bg);padding:1px 6px;border-radius:4px;margin-left:4px;">Prereq: ${escapeHtml(c.prerequisites)}</span>` : ''}
                          </div>
                          <div class="title" style="font-size:12px;color:var(--ink-700);">${escapeHtml(c.title)}</div>
                        </div>
                      </div>
                      <div class="meta" style="font-size:12px;font-weight:600;color:var(--ink-700);">${c.units} units${c.completed && c.grade ? ` · Grade: <strong>${c.grade}</strong>` : (c.enrolled ? ' · Enrolled' : '')}</div>
                    </div>
                  `).join('')}
                </div>
              </div>
            `).join('') : '<div style="text-align:center;padding:30px;color:var(--ink-500);">No curriculum data available.</div>'}
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(dynModal);
  }
}

// ── Certificate of Registration (COR) Page ───────────────────────────
async function loadCor() {
  const container = getEl('corDocContainer');
  const printBtn = getEl('corPrintBtn');
  if (printBtn) {
    printBtn.removeEventListener('click', printCorPage);
    printBtn.addEventListener('click', printCorPage);
  }

  try {
    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) return;

    const profile = state.studentProfile;
    if (!profile) throw new Error('Profile not found');

    const { data: sem } = await supabaseClient
      .from('student_semesters')
      .select('*')
      .eq('student_id', profile.id)
      .eq('is_current', true)
      .maybeSingle();

    const activeSchoolYear = sem?.school_year || '2026-2027';
    const activeSemester = sem?.semester || '1st Semester';

    const { data: enrollments } = await supabaseClient
      .from('enrollments')
      .select('offering_id, course_offerings(*)')
      .eq('student_id', profile.id)
      .eq('status', 'enrolled');

    const courses = (enrollments || [])
      .map(e => e.course_offerings)
      .filter(c => c && c.school_year === activeSchoolYear && c.semester === activeSemester);

    const { data: miscFees } = await supabaseClient
      .from('misc_fees')
      .select('*')
      .eq('school_year', activeSchoolYear)
      .eq('semester', activeSemester);

    const { data: billing } = await supabaseClient
      .from('billing_summary')
      .select('*')
      .eq('student_id', profile.id)
      .single();

    // ponytail: cor_signatories table consolidated into system_settings
    const { data: sigRows } = await supabaseClient
      .from('system_settings')
      .select('key, value')
      .in('key', ['cor_cashier_name', 'cor_registrar_name']);
    const sigs = {
      cashier_name: sigRows?.find(r => r.key === 'cor_cashier_name')?.value || '—',
      registrar_name: sigRows?.find(r => r.key === 'cor_registrar_name')?.value || '—'
    };

    renderCorPage({ profile, user, activeSchoolYear, activeSemester, courses, miscFees, billing, sigs });
  } catch (err) {
    if (container) container.innerHTML = `<div class="cor-loading">Could not load your COR: ${escapeHtml(err.message)}</div>`;
    console.error(err);
  }
}

function renderCorPage(d) {
  const { profile, user, activeSchoolYear, activeSemester, courses, miscFees, billing, sigs } = d;
  const container = getEl('corDocContainer');
  if (!container) return;

  const totalUnits = courses.reduce((s, c) => s + Number(c.units || 0), 0);
  const tuition = courses.reduce((s, c) => s + Number(c.fee || 0), 0);
  const misc = (miscFees || []).reduce((s, f) => s + Number(f.amount || 0), 0);
  const totalAssessment = tuition + misc;
  const totalPaid = billing?.total_paid || 0;
  const balance = billing?.balance ?? (totalAssessment - totalPaid);

  let statusLabel = 'OFFICIALLY ENROLLED';
  let statusColor = 'var(--green)';
  if (courses.length === 0) { statusLabel = 'NOT ENROLLED'; statusColor = 'var(--red)'; }
  else if (balance > 0) { statusLabel = 'PARTIAL PAYMENT'; statusColor = 'var(--amber)'; }

  const rowsHtml = courses.length ? courses.map(c => `
        <tr>
          <td class="cor-font-mono">${escapeHtml(c.code || '—')}</td>
          <td>${escapeHtml(c.title || '—')}</td>
          <td class="cor-text-right">${Number(c.units || 0).toFixed(1)}</td>
          <td>${escapeHtml(c.schedule || 'TBA')}</td>
          <td>${escapeHtml(c.instructor_name || 'TBA')}</td>
        </tr>`).join('') : `
        <tr>
          <td class="cor-font-mono">—</td>
          <td>No enrolled subjects found for this term.</td>
          <td class="cor-text-right">—</td>
          <td>—</td>
          <td>—</td>
        </tr>`;

  container.innerHTML = `
    <div class="cor-doc">
      <div class="cor-doc-head">
        <div class="cor-brand">
          <img src="logo.png" alt="Iligan Medical Center College Official Logo" class="cor-logo-img" onerror="this.style.display='none';">
          <div class="cor-school-info">
            <h1>Iligan Medical Center College</h1>
            <p>San Miguel, Iligan City, Lanao del Norte, Philippines</p>
            <div class="cor-registrar-label">Office of the College Registrar</div>
          </div>
        </div>
        <div class="cor-doc-title">
          <h2>Certificate of<br>Registration</h2>
          <span>AY ${escapeHtml(activeSchoolYear)} · ${escapeHtml(activeSemester)}</span>
        </div>
      </div>

      <div class="cor-info-grid">
        <div class="cor-info-item"><span>Student No:</span> <strong>${escapeHtml(profile.student_no || '—')}</strong></div>
        <div class="cor-info-item"><span>Program:</span> <strong>${escapeHtml(profile.program || '—')}</strong></div>
        <div class="cor-info-item"><span>Student Name:</span> <strong>${escapeHtml(profile.full_name || '—')}</strong></div>
        <div class="cor-info-item"><span>Year / Section:</span> <strong>${escapeHtml(`${profile.year_level || '—'}${profile.section ? ' — Section ' + profile.section : ''}`)}</strong></div>
        <div class="cor-info-item"><span>Email:</span> <strong>${escapeHtml(profile.email || user.email || '—')}</strong></div>
        <div class="cor-info-item"><span>Date Issued:</span> <strong>${escapeHtml(fmtDate(new Date().toISOString()))}</strong></div>
      </div>

      <div class="cor-section-heading">Enrolled Subjects &amp; Schedule</div>
      <table>
        <thead>
          <tr>
            <th>Course Code</th>
            <th>Course Title</th>
            <th class="cor-text-right">Units</th>
            <th>Schedule</th>
            <th>Instructor</th>
          </tr>
        </thead>
        <tbody>${rowsHtml}</tbody>
      </table>

      <div class="cor-section-heading">Assessment &amp; Payment Summary</div>
      <div class="cor-financial-grid">
        <div class="cor-summary-card">
          <div class="cor-summary-card-header">Tuition &amp; Fees Breakdown</div>
          <div class="cor-summary-row"><span>Total Enrolled Units:</span> <strong>${totalUnits.toFixed(1)} Units</strong></div>
          <div class="cor-summary-row"><span>Tuition Assessment:</span> <span>${peso(tuition)}</span></div>
          <div class="cor-summary-row"><span>Miscellaneous Fees:</span> <span>${peso(misc)}</span></div>
          <div class="cor-summary-row cor-total"><span>Total Assessment:</span> <span>${peso(totalAssessment)}</span></div>
        </div>
        <div class="cor-summary-card">
          <div class="cor-summary-card-header">Account Standing</div>
          <div class="cor-summary-row"><span>Total Amount Paid:</span> <span style="color:var(--green);font-weight:700;">${peso(totalPaid)}</span></div>
          <div class="cor-summary-row"><span>Balance Remaining:</span> <span style="color:var(--red);font-weight:700;">${peso(balance)}</span></div>
          <div class="cor-summary-row"><span>Status:</span> <span class="cor-watermark-stamp" style="border-color:${statusColor};color:${statusColor};">${statusLabel}</span></div>
        </div>
      </div>

      <div class="cor-signatures">
        <div class="cor-sig-block">
          <div class="cor-sig-line">${escapeHtml(profile.full_name || '—')}</div>
          <div class="cor-sig-title">Student Signature</div>
        </div>
        <div class="cor-sig-block">
          <div class="cor-sig-line">${escapeHtml(sigs?.cashier_name || '—')}</div>
          <div class="cor-sig-title">Cashier / Accounting Officer</div>
        </div>
        <div class="cor-sig-block">
          <div class="cor-sig-line">${escapeHtml(sigs?.registrar_name || '—')}</div>
          <div class="cor-sig-title">College Registrar</div>
        </div>
      </div>

      <div class="cor-doc-footer">
        <strong>Iligan Medical Center College</strong> · San Miguel, Iligan City, Lanao del Norte 9200<br>
        Tel: (063) 221-4050 · Email: registrar@imcc.edu.ph · This document is electronically generated.
      </div>
    </div>`;
}

function printCorPage() {
  document.body.classList.add('is-printing-cor');
  window.print();
}

window.addEventListener('beforeprint', () => {
  // Ctrl+P and File > Print never went through printCorPage(), so
  // is-printing-cor was absent and every COR-specific print rule was
  // skipped. Set the class here when the student is already on the COR
  // page, so both entry points produce the same document.
  if (state.page === 'cor' && !document.body.classList.contains('is-printing-cor')) {
    document.body.classList.add('is-printing-cor');
  }

  const doc = document.querySelector('body.is-printing-cor .cor-doc');
  if (!doc) return;
  doc.style.zoom = ''; // reset any previous scale before re-measuring
  const availW = ((210 - 20) / 25.4) * 96; // A4 - 10mm margins, px @96dpi
  const availH = ((297 - 20) / 25.4) * 96;
  const prevW = doc.style.width;
  doc.style.width = availW + 'px'; // measure at printable width so height is accurate
  const height = doc.offsetHeight;
  doc.style.width = prevW;
  const scale = Math.min(1, (availH / height) * 0.99); // fill the page, 1% safety margin
  doc.style.zoom = scale.toFixed(4);
});

window.addEventListener('afterprint', () => {
  const doc = document.querySelector('body.is-printing-cor .cor-doc');
  if (doc) doc.style.zoom = '';
  document.body.classList.remove('is-printing-cor');
});

// ── Clearance Module ─────────────────────────────────────────────────
const statusMeta = {
  cleared: { label: 'Cleared', badge: 'badge-green', dotColor: 'var(--green)', card: 'st-cleared' },
  pending: { label: 'Pending', badge: 'badge-amber', dotColor: 'var(--amber)', card: 'st-pending' },
  action_required: { label: 'Action Required', badge: 'badge-red', dotColor: 'var(--red)', card: 'st-action' },
};

async function loadClearance() {
  const profile = state.studentProfile;
  if (!profile) return;

  let { data: rows, error } = await supabaseClient
    .from('clearances')
    .select('*')
    .eq('student_id', profile.id)
    .order('department_name', { ascending: true });

  // Self-healing: If no clearances exist for this student yet, initialize them
  if (!rows || rows.length === 0) {
    try {
      await supabaseClient.rpc('initialize_student_clearances', { target_student_id: profile.id });
      const { data: refreshed } = await supabaseClient
        .from('clearances')
        .select('*')
        .eq('student_id', profile.id)
        .order('department_name', { ascending: true });
      rows = refreshed || [];
    } catch (e) {
      console.warn('Could not run initialize_student_clearances RPC:', e);
    }
  }

  state.departments = rows || [];
  renderClearance();
}

function renderClearance() {
  const grid = getEl('deptGrid');
  if (!grid) return;

  if (!state.departments || state.departments.length === 0) {
    grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;color:var(--ink-400);padding:30px;background:var(--card);border-radius:12px;border:1px dashed var(--line);">No clearance records found for this term.</div>';
    setText('clearFrac', '0/0 Cleared');
    const fill = getEl('clearFill');
    if (fill) fill.style.width = '0%';
    setText('clearRemaining', 'No clearance departments required.');
    return;
  }

  const cleared = state.departments.filter(d => d.status === 'cleared').length;
  const totalDepts = state.departments.length || 1;
  setText('clearFrac', `${cleared}/${totalDepts} Cleared`);

  const fill = getEl('clearFill');
  if (fill) fill.style.width = (cleared / totalDepts * 100) + '%';

  const remaining = totalDepts - cleared;
  setText('clearRemaining', remaining === 0 ? '✓ All departments cleared. You are in good standing!' : `${remaining} department(s) remaining.`);

  grid.innerHTML = state.departments.map(d => {
    const m = statusMeta[d.status] || statusMeta.pending;
    // A student may only nudge themselves to the billing page. Marking a
    // department cleared is a staff action; the previous "Toggle Admin
    // View" control in this page let any student do it, and the database
    // policy allowed the underlying UPDATE as well.
    const actionBtn = (d.department_code === 'cashier' && d.status === 'action_required')
      ? `<button class="mini-btn" type="button" data-goto="billing">Pay Balance →</button>`
      : '';
    return `
    <div class="dept-card ${m.card}" style="padding:18px;border:1px solid var(--line);border-radius:14px;background:var(--card);box-shadow:var(--shadow-sm);transition:all 0.2s;">
      <div class="dept-top" style="display:flex;justify-content:space-between;align-items:center;">
        <div style="display:flex;gap:12px;align-items:center;">
          <div class="dept-icon" style="font-size:24px;width:40px;height:40px;display:flex;align-items:center;justify-content:center;background:var(--bg);border-radius:10px;">${d.icon || '📄'}</div>
          <div>
            <div class="dept-name" style="font-weight:700;font-size:15px;color:var(--ink-900);">${escapeHtml(d.department_name)}</div>
            <div class="dept-officer" style="font-size:12px;color:var(--ink-500);">${escapeHtml(d.officer_name || '')}</div>
          </div>
        </div>
        <span class="badge ${m.badge}">${m.label}</span>
      </div>
      <div class="dept-note" style="font-size:13px;color:var(--ink-600);margin:12px 0 8px;">${escapeHtml(d.note || '')}</div>
      <div class="dept-status" style="font-size:12px;font-weight:600;display:flex;align-items:center;gap:6px;color:var(--ink-500);">
        <span class="sdot" style="width:8px;height:8px;border-radius:50%;background:${m.dotColor};"></span>
        ${d.status === 'cleared' ? 'Digitally Signed & Cleared' : (d.status === 'action_required' ? 'Student Action Required' : 'Awaiting Department Review')}
      </div>
      ${actionBtn ? `<div style="margin-top:6px;">${actionBtn}</div>` : ''}
    </div>`;
  }).join('');
}

// NOTE: adminClear() and the #adminToggle "Admin View" control were
// removed. A student could mark any department cleared, and the
// clearances RLS policy permitted the underlying UPDATE. Clearance is now
// a staff action; see database/security-hardening-phase0b.sql.

// The "Pay Balance" button in the clearance grid routes rather than
// calling a global, so it works without an inline handler.
document.addEventListener('click', event => {
  const target = event.target instanceof Element
    ? event.target.closest('[data-goto]')
    : null;
  if (target && document.body.contains(target)) goto(target.dataset.goto);
});

// ── FAQ Chatbot Module ───────────────────────────────────────────────
const chatState = { open: false, history: [], sending: false };

const chatFab = getEl('chatFab');
const chatPanel = getEl('chatPanel');
const chatClose = getEl('chatClose');
const chatMessages = getEl('chatMessages');
const chatInput = getEl('chatInput');
const chatSend = getEl('chatSend');

function toggleChat(open) {
  chatState.open = open ?? !chatState.open;
  if (chatPanel) chatPanel.classList.toggle('open', chatState.open);
  if (chatState.open && chatInput) chatInput.focus();
}
window.toggleChat = toggleChat;

chatFab?.addEventListener('click', () => toggleChat());
chatClose?.addEventListener('click', () => toggleChat(false));

function formatMessageText(str) {
  if (!str) return '';
  let escaped = escapeHtml(str);
  escaped = escaped.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  escaped = escaped.replace(/\n/g, '<br>');
  return escaped;
}

function appendChatMessage(role, text, sources) {
  if (!chatMessages) return;
  const row = document.createElement('div');
  row.className = `chat-msg ${role}`;
  const sourcesHtml = sources && sources.length
    ? `<div class="chat-sources" style="margin-top:6px;display:flex;gap:4px;flex-wrap:wrap;">${sources.map(s => `<span class="chat-source-pill" style="font-size:10px;background:rgba(231,51,138,0.1);color:var(--pink-600);padding:2px 6px;border-radius:10px;font-weight:700;">${s.category}</span>`).join('')}</div>`
    : '';
  const content = role === 'bot' ? formatMessageText(text) : escapeHtml(text);
  row.innerHTML = `<div class="chat-bubble">${content}${sourcesHtml}</div>`;
  chatMessages.appendChild(row);
  chatMessages.scrollTop = chatMessages.scrollHeight;
  return row;
}

function showTypingIndicator() {
  if (!chatMessages) return;
  const row = document.createElement('div');
  row.className = 'chat-msg bot';
  row.id = 'chatTyping';
  row.innerHTML = `<div class="chat-bubble"><div class="chat-typing"><span></span><span></span><span></span></div></div>`;
  chatMessages.appendChild(row);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function removeTypingIndicator() {
  const el = getEl('chatTyping');
  if (el) el.remove();
}

async function sendChatMessage() {
  if (!chatInput) return;
  const text = chatInput.value.trim();
  if (!text || chatState.sending) return;

  appendChatMessage('user', text);
  chatInput.value = '';
  chatState.sending = true;
  if (chatSend) chatSend.disabled = true;
  showTypingIndicator();

  try {
    const { data, error } = await supabaseClient.functions.invoke('faq-assistant', {
      body: { message: text, history: chatState.history },
    });

    if (error) throw error;

    removeTypingIndicator();
    appendChatMessage('bot', data.answer, data.sources);
    chatState.history.push({ role: 'user', content: text }, { role: 'assistant', content: data.answer });
    chatState.history = chatState.history.slice(-6);
  } catch (err) {
    removeTypingIndicator();
    const fallback = getLocalFaqAnswer(text);
    appendChatMessage('bot', fallback.text, fallback.sources);
  } finally {
    chatState.sending = false;
    if (chatSend) chatSend.disabled = false;
  }
}

// Offline fallback used only when the FAQ edge function cannot be reached.
// These are navigation hints, not policy, and they report no "source":
// a category label on an unverified answer is exactly the fabricated
// citation this is meant to avoid. Billing intentionally does not mention
// a Pay Now button; payment is recorded by cashier staff.
function getLocalFaqAnswer(q) {
  const lower = q.toLowerCase();
  if (lower.includes('enroll')) return { text: 'Enrollment is open until the deadline shown in your dashboard. Settle balances first, then select courses under the Enrollment tab.', sources: [] };
  if (lower.includes('balance') || lower.includes('pay')) return { text: 'You can view your assessed balance and any published installment schedule under Billing & History. Payments are recorded by Cashier staff; there is no online payment button on this page.', sources: [] };
  if (lower.includes('grade')) return { text: 'Grades are posted under Grades & Evaluation. AI predictions are estimates based on midterm performance, not official grades.', sources: [] };
  if (lower.includes('clearance')) return { text: 'Clearance requires all departments to mark you as cleared. Pay any balances with the Cashier and complete any outstanding requirements.', sources: [] };
  return { text: 'I can help with enrollment, billing, grades, and clearance. For official answers, email registrar@imcc.edu.ph.', sources: [] };
}

chatSend?.addEventListener('click', sendChatMessage);
chatInput?.addEventListener('keydown', (e) => { if (e.key === 'Enter') sendChatMessage(); });

// ── MFA Configuration Module (Built-in Supabase Auth TOTP) ─────────
let currentMfaFactorId = null;
const mfaSetupBtn = getEl('mfaSetupBtn');
const mfaModal = getEl('mfaModal');
const mfaCloseBtn = getEl('mfaCloseBtn');
const mfaConfirmBtn = getEl('mfaConfirmBtn');
const mfaQrImg = getEl('mfaQrImg');
const mfaSecretText = getEl('mfaSecretText');
const mfaCodeInput = getEl('mfaCodeInput');

if (mfaSetupBtn) {
  mfaSetupBtn.addEventListener('click', async (e) => {
    e.preventDefault();
    const profile = state.studentProfile;
    if (!profile) {
      showToast('Please log in again to set up MFA.', true);
      return;
    }
    try {
      // Clean up any stale unverified factors
      const { data: factorData } = await supabaseClient.auth.mfa.listFactors();
      const unverifiedFactors = (factorData?.totp || []).filter(f => f.status === 'unverified');
      for (const factor of unverifiedFactors) {
        await supabaseClient.auth.mfa.unenroll({ factorId: factor.id });
      }

      const { data: enrollData, error: enrollError } = await supabaseClient.auth.mfa.enroll({
        factorType: 'totp',
        issuer: 'MyIMCC Portal',
        friendlyName: profile.email || profile.student_no || 'Student'
      });

      if (enrollError || !enrollData) {
        throw enrollError || new Error('Could not initialize TOTP enrollment.');
      }

      currentMfaFactorId = enrollData.id;
      if (mfaQrImg) mfaQrImg.src = enrollData.totp.qr_code;
      if (mfaSecretText) mfaSecretText.textContent = `Manual Key: ${enrollData.totp.secret}`;
      if (mfaCodeInput) mfaCodeInput.value = '';
      if (mfaModal) mfaModal.style.display = 'flex';
      if (mfaCodeInput) mfaCodeInput.focus();
    } catch (err) {
      showToast('MFA setup error: ' + (err.message || err), true);
    }
  });
}

if (mfaCloseBtn) {
  mfaCloseBtn.addEventListener('click', () => {
    if (mfaModal) mfaModal.style.display = 'none';
  });
}

if (mfaConfirmBtn) {
  mfaConfirmBtn.addEventListener('click', async () => {
    const code = mfaCodeInput ? mfaCodeInput.value.trim() : '';
    if (!code || code.length !== 6) {
      showToast('Please enter a valid 6-digit TOTP verification code.', true);
      return;
    }
    const profile = state.studentProfile;
    if (!profile) {
      showToast('Please log in again to verify MFA.', true);
      return;
    }
    if (!currentMfaFactorId) {
      showToast('Enrollment expired. Please click Setup Google MFA again.', true);
      return;
    }
    try {
      const { data: challengeData, error: challengeErr } = await supabaseClient.auth.mfa.challenge({
        factorId: currentMfaFactorId
      });
      if (challengeErr) throw challengeErr;

      const { error: verifyErr } = await supabaseClient.auth.mfa.verify({
        factorId: currentMfaFactorId,
        challengeId: challengeData.id,
        code: code
      });
      if (verifyErr) throw verifyErr;

      showToast('MFA Google Authenticator enabled successfully!');
      if (mfaModal) mfaModal.style.display = 'none';
    } catch (err) {
      showToast('MFA verification failed: ' + (err.message || err), true);
    }
  });
}

// ── Sign-out Module ──────────────────────────────────────────────────
getEl('signOutBtn')?.addEventListener('click', async () => {
  try {
    await supabaseClient.auth.signOut();
  } catch (e) {
    console.warn('signOut error', e);
  }
  window.location.href = '../auth/login.html';
});

// ── Quick Links (SSO) Module ─────────────────────────────────────────
async function loadSSOLinks() {
  const { data: links } = await supabaseClient.from('sso_links').select('*').eq('is_active', true).order('sort_order');
  const nav = getEl('ssoLinksNav');
  if (!nav) return;
  const role = state.studentProfile?.role || 'student';
  const visible = (links || []).filter(l => (l.roles || '').split(',').map(r => r.trim()).includes(role))
    .filter(l => (l.label || '').trim().toLowerCase() !== 'library');
  nav.innerHTML = visible.map(l => `
    <a href="${l.url}" target="_blank" class="nav-item" style="text-decoration:none;">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:17px;height:17px;"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></svg>
      ${escapeHtml(l.label)}
    </a>`).join('') || '<div class="nav-item soon" style="opacity:.4;">No links configured</div>';
}

// ── Attendance Module ────────────────────────────────────────────────
async function loadAttendance() {
  const profile = state.studentProfile;
  if (!profile) return;

  const { data: records } = await supabaseClient
    .from('attendance')
    .select('*, course_offerings(code, title)')
    .eq('student_id', profile.id)
    .order('date', { ascending: false });

  const stats = { present: 0, absent: 0, late: 0, excused: 0 };
  (records || []).forEach(r => { if (stats[r.status] !== undefined) stats[r.status]++; });
  const total = (records || []).length;

  setText('att-total', total);
  setText('att-present', stats.present);
  setText('att-late', stats.late);
  setText('att-absent', stats.absent);

  const badgeClass = { present: 'badge-green', absent: 'badge-red', late: 'badge-amber', excused: 'badge-blue' };
  const attBody = getEl('attBody');
  if (attBody) {
    attBody.innerHTML = (records && records.length)
      ? records.map(r => `<tr>
          <td>${fmtDate(r.date)}</td>
          <td><strong>${escapeHtml(r.course_offerings?.code || '—')}</strong> ${escapeHtml(r.course_offerings?.title || '')}</td>
          <td><span class="badge ${badgeClass[r.status] || 'badge-amber'}">${escapeHtml(String(r.status).toUpperCase())}</span></td>
          <td style="font-size:12px;color:var(--ink-500);">${escapeHtml(r.notes || '—')}</td>
        </tr>`).join('')
      : '<tr><td colspan="4" style="text-align:center;color:var(--ink-300);padding:20px;">No attendance records found.</td></tr>';
  }
}

// ── Faculty Evaluation Module ────────────────────────────────────────
async function loadFacultyEval() {
  const profile = state.studentProfile;
  if (!profile) return;

  const { data: currentSem } = await supabaseClient
    .from('student_semesters')
    .select('school_year, semester')
    .eq('student_id', profile.id)
    .eq('is_current', true)
    .maybeSingle();

  const sy = currentSem?.school_year ? currentSem.school_year.replace(/[\u2013\u2014]/g, '-') : '2026-2027';
  const sem = currentSem?.semester || '1st Semester';
  setText('evalTermPill', `${sem} ${sy}`);

  const { data: enrollments } = await supabaseClient
    .from('enrollments')
    .select('offering_id, course_offerings(id, code, title, instructor_name)')
    .eq('student_id', profile.id)
    .eq('status', 'enrolled');

  const evalStatus = getEl('evalStatus');
  const evalList = getEl('evalList');

  if (!enrollments || enrollments.length === 0) {
    if (evalStatus) {
      evalStatus.style.display = 'block';
      evalStatus.innerHTML = 'No enrolled courses found for this semester. Please enroll first before evaluating faculty.';
    }
    return;
  }

  const instructorMap = {};
  enrollments.forEach(e => {
    const off = e.course_offerings;
    if (!off || !off.instructor_name) return;
    if (!instructorMap[off.instructor_name]) {
      instructorMap[off.instructor_name] = { name: off.instructor_name, courses: [] };
    }
    instructorMap[off.instructor_name].courses.push({ code: off.code, title: off.title, offering_id: off.id });
  });

  const instructors = Object.values(instructorMap);
  if (instructors.length === 0) {
    if (evalStatus) {
      evalStatus.style.display = 'block';
      evalStatus.innerHTML = 'No instructor information available for your enrolled courses.';
    }
    return;
  }

  const { data: existing } = await supabaseClient
    .from('faculty_evaluations')
    .select('instructor_name')
    .eq('student_id', profile.id)
    .eq('school_year', sy)
    .eq('semester', sem);

  const evaluatedNames = new Set((existing || []).map(e => e.instructor_name));
  if (evalStatus) evalStatus.style.display = 'none';

  const evalQuestions = [
    { key: 'teaching_clarity', label: 'The instructor explains concepts clearly and understandably.' },
    { key: 'knowledge', label: 'The instructor demonstrates deep knowledge of the subject matter.' },
    { key: 'availability', label: 'The instructor is approachable and available for consultation.' },
    { key: 'fairness', label: 'Grading and assessments are fair and transparent.' },
    { key: 'punctuality', label: 'The instructor starts and ends classes on time.' },
  ];

  if (evalList) {
    evalList.innerHTML = instructors.map(inst => {
      const submitted = evaluatedNames.has(inst.name);
      const courseList = inst.courses.map(c => `${c.code} — ${c.title}`).join(', ');
      return `
      <div class="card card-pad" style="margin-bottom:16px;border:1px solid var(--line);${submitted ? 'opacity:0.7;' : ''}">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:12px;">
          <div>
            <div style="font-weight:800;font-size:15px;">${escapeHtml(inst.name)}</div>
            <div style="font-size:12px;color:var(--ink-500);">${escapeHtml(courseList)}</div>
          </div>
          ${submitted ? '<span class="badge badge-green">✓ Submitted</span>' : '<span class="badge badge-amber">Pending</span>'}
        </div>
        ${submitted ? '' : `
        <div class="eval-form" data-instructor="${escapeHtml(inst.name)}">
          ${evalQuestions.map((q) => `
            <div class="eval-question" style="margin-bottom:12px;">
              <div class="eval-q-label" style="font-size:13px;font-weight:600;margin-bottom:4px;">${q.label}</div>
              <div class="eval-stars" data-key="${q.key}" style="display:flex;gap:4px;">
                ${[1, 2, 3, 4, 5].map(n => `<span class="eval-star" data-val="${n}" style="font-size:22px;cursor:pointer;color:var(--ink-300);transition:color 0.15s;">★</span>`).join('')}
              </div>
            </div>
          `).join('')}
          <div class="field" style="margin-top:12px;">
            <label style="font-size:12px;font-weight:600;color:var(--ink-700);display:block;margin-bottom:4px;">Additional Comments (optional)</label>
            <textarea class="eval-comment" style="width:100%;padding:10px 14px;border:1.5px solid var(--line);border-radius:10px;font-size:13px;min-height:70px;resize:vertical;font-family:inherit;" placeholder="Share specific feedback..."></textarea>
          </div>
          <button class="btn btn-primary eval-submit-btn" style="width:100%;justify-content:center;margin-top:12px;" data-instructor="${escapeHtml(inst.name)}">Submit Anonymous Evaluation</button>
        </div>
        `}
      </div>`;
    }).join('');

    evalList.querySelectorAll('.eval-stars').forEach(starGroup => {
      const stars = starGroup.querySelectorAll('.eval-star');
      stars.forEach(star => {
        star.addEventListener('click', () => {
          const val = parseInt(star.dataset.val, 10);
          stars.forEach((s, i) => {
            s.style.color = i < val ? 'var(--pink-500, #ec4899)' : 'var(--ink-300, #cbd5e1)';
          });
          starGroup.dataset.selected = val;
        });
      });
    });

    evalList.querySelectorAll('.eval-submit-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const instructorName = btn.dataset.instructor;
        const form = btn.closest('.eval-form');
        const ratings = {};
        let allRated = true;

        form.querySelectorAll('.eval-stars').forEach(sg => {
          const val = sg.dataset.selected;
          if (!val) { allRated = false; }
          ratings[sg.dataset.key] = val ? parseInt(val, 10) : null;
        });

        if (!allRated) {
          showToast('Please rate all 5 questions before submitting.', true);
          return;
        }

        const comment = form.querySelector('.eval-comment')?.value.trim() || null;
        btn.disabled = true;
        btn.textContent = 'Submitting…';

        try {
          const { error } = await supabaseClient.from('faculty_evaluations').insert({
            student_id: profile.id,
            instructor_name: instructorName,
            school_year: sy,
            semester: sem,
            teaching_clarity: ratings.teaching_clarity,
            knowledge: ratings.knowledge,
            availability: ratings.availability,
            fairness: ratings.fairness,
            punctuality: ratings.punctuality,
            comment,
          });
          if (error) throw error;

          showToast('Evaluation submitted anonymously. Thank you!');
          await loadFacultyEval();
        } catch (err) {
          showToast('Error submitting evaluation: ' + err.message, true);
          btn.disabled = false;
          btn.textContent = 'Submit Anonymous Evaluation';
        }
      });
    });
  }
}

// ── Profile Module ───────────────────────────────────────────────────
async function loadProfile() {
  const p = state.studentProfile;
  if (!p) return;

  setText('profileName', p.full_name);
  setText('profileEmail', p.email);
  setText('profileStudentNo', p.student_no);
  setText('profileProgram', p.program);
  setText('profileYear', p.year_level);
  setText('profileSection', p.section);
  setText('profilePhone', p.phone);
  setText('profileAddress', p.address);

  const avatar = getEl('profileAvatar');
  if (avatar) {
    if (p.avatar_url) {
      avatar.innerHTML = `<img src="${p.avatar_url}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">`;
    } else {
      avatar.textContent = getInitials(p.full_name);
    }
  }

  const editPhone = getEl('editPhone');
  const editAddress = getEl('editAddress');
  const editAvatar = getEl('editAvatar');
  if (editPhone) editPhone.value = p.phone || '';
  if (editAddress) editAddress.value = p.address || '';
  if (editAvatar) editAvatar.value = p.avatar_url || '';
}

getEl('saveProfileBtn')?.addEventListener('click', async () => {
  const profile = state.studentProfile;
  if (!profile) return;

  const phone = getEl('editPhone')?.value.trim() || null;
  const address = getEl('editAddress')?.value.trim() || null;
  const avatar_url = getEl('editAvatar')?.value.trim() || null;

  try {
    const updateData = {};
    if (phone !== null) updateData.phone = phone;
    if (address !== null) updateData.address = address;
    if (avatar_url !== null) updateData.avatar_url = avatar_url;

    const { error } = await supabaseClient.from('profiles').update(updateData).eq('id', profile.id);

    if (error) throw error;

    state.studentProfile.phone = phone;
    state.studentProfile.address = address;
    state.studentProfile.avatar_url = avatar_url;
    if (state.dashboard) state.dashboard.student.avatarUrl = avatar_url;

    showToast('Profile updated successfully');
    loadProfile();
    renderDashboard();
  } catch (err) {
    showToast('Error updating profile: ' + err.message, true);
  }
});

getEl('changePassBtn')?.addEventListener('click', async () => {
  try {
    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user?.email) throw new Error('User email not found');
    const { error } = await supabaseClient.auth.resetPasswordForEmail(user.email);
    if (error) throw error;
    showToast('Password reset email sent to ' + user.email);
  } catch (err) {
    showToast('Error: ' + err.message, true);
  }
});

// ── Messages ─────────────────────────────────────────────────────────
// Reads the real messages table (database/supabase-schema-v2.sql:77).
//
// A student may read threads addressed to them, ask the help desk a
// question, and reply. They cannot start a message to another student:
// there is no recipient field in the UI, and the database rejects a
// student-to-student message outright (see database/messaging-qa.sql).
const MESSAGES_TABLE = 'messages';

let messagesLoaded = false;
let allMessages = [];
let messageOffices = [];
let openMsgPeerId = null;

const MSG_TOPICS = {
  enrollment:  'Enrollment',
  grades:      'Grades & Evaluation',
  billing:     'Billing & Payment',
  clearance:   'Online Clearance',
  schedule:    'Class Schedule',
  registration:'Registration',
  other:       'Other'
};

function topicLabel(topic) {
  return MSG_TOPICS[topic] || null;
}

function fmtMsgStamp(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString(undefined, {
    year: 'numeric', month: 'short', day: '2-digit',
    hour: '2-digit', minute: '2-digit'
  });
}

function myStudentId() {
  return state.studentProfile ? state.studentProfile.id : null;
}

// The inbox used to stop at a hard 300 rows with nothing on screen saying so.
// A student's oldest threads simply vanished past that point, which reads as
// "the school never wrote to me" rather than "there is more, ask for it".
//
// So the limit grows on request instead. One extra row is fetched beyond the
// current limit purely to answer "is there more?", and then discarded, so the
// button never appears on a fully-loaded inbox.
const MESSAGES_PAGE_SIZE = 100;
let messagesLimit = MESSAGES_PAGE_SIZE;

async function loadMessages() {
  const me = myStudentId();
  const body = getEl('msgThreadsBody');
  if (!me || !body) return;

  const { data, error } = await supabaseClient
    .from(MESSAGES_TABLE)
    .select('id, sender_id, recipient_id, subject, topic, body, is_read, read_at, created_at')
    .or(`sender_id.eq.${me},recipient_id.eq.${me}`)
    .order('created_at', { ascending: false })
    .limit(messagesLimit + 1);

  if (error) throw error;

  const rows = data || [];
  const hasMore = rows.length > messagesLimit;
  allMessages = hasMore ? rows.slice(0, messagesLimit) : rows;

  // Sender names. Only staff can appear as senders here, but resolve them
  // generally so a thread never renders as "Unknown".
  const senderIds = [...new Set(allMessages.map(m => m.sender_id).filter(Boolean))];
  if (senderIds.length) {
    const { data: people } = await supabaseClient
      .from('profiles')
      .select('id, full_name, role')
      .in('id', senderIds);
    messageOffices = people || [];
  }

  messagesLoaded = true;
  renderMessageThreads();
  updateMsgBadge();
  renderMessagesPagination(hasMore);
}

function renderMessagesPagination(hasMore) {
  const button = getEl('msgLoadMore');
  const note = getEl('msgOlderNote');
  if (button) {
    button.hidden = !hasMore;
    button.disabled = false;
    button.textContent = 'Load older messages';
  }
  if (note) {
    if (hasMore) {
      note.textContent = `Showing the ${messagesLimit} most recent messages. `
        + 'Older conversations are still available.';
      note.hidden = false;
    } else if (messagesLimit > MESSAGES_PAGE_SIZE) {
      note.textContent = 'That is the whole conversation history.';
      note.hidden = false;
    } else {
      note.hidden = true;
    }
  }
}

getEl('msgLoadMore')?.addEventListener('click', async () => {
  const button = getEl('msgLoadMore');
  if (button) {
    button.disabled = true;
    button.textContent = 'Loading…';
  }
  messagesLimit += MESSAGES_PAGE_SIZE;
  try {
    await loadMessages();
  } catch (err) {
    // Put the limit back so a failed page does not leave the count lying about
    // how much has been loaded. messagesLoaded stays true: the inbox really is
    // loaded, only the extra page is missing, and clearing it would drop the
    // list back to its loading state.
    messagesLimit -= MESSAGES_PAGE_SIZE;
    renderMessagesPagination(false);
    console.warn('[messages] could not load older messages:', err);
    showToast('Could not load older messages. Please try again.', true);
  }
});

function officeName(id) {
  const person = messageOffices.find(p => p.id === id);
  if (person) return person.full_name || 'School office';
  // Fall back to the thread's own subject line rather than inventing a name.
  return 'School office';
}

function updateMsgBadge() {
  const me = myStudentId();
  const unread = allMessages.filter(m => m.recipient_id === me && !m.is_read).length;
  const badge = getEl('msgUnreadBadge');
  if (!badge) return;
  badge.textContent = String(unread);
  badge.hidden = unread === 0;
}

function renderMessageThreads() {
  const body = getEl('msgThreadsBody');
  const empty = getEl('msgEmpty');
  const greeting = getEl('msgGreeting');
  if (!body) return;

  const me = myStudentId();
  const groups = new Map();

  allMessages.forEach(message => {
    const otherId = message.sender_id === me ? message.recipient_id : message.sender_id;
    if (!otherId) return;
    if (!groups.has(otherId)) groups.set(otherId, []);
    groups.get(otherId).push(message);
  });

  const threads = [...groups.entries()]
    .map(([peerId, items]) => {
      const sorted = [...items].sort((a, b) =>
        String(b.created_at).localeCompare(String(a.created_at)));
      const unread = sorted.filter(m => m.recipient_id === me && !m.is_read).length;
      // `sorted` is newest first, so the first entry with a topic is the most
      // recent one. Taken from anywhere in the thread rather than from the
      // last message, because a reply carries no topic: labelling a thread from
      // its newest message made an enrollment request read as a generic
      // "Question asked" the moment anybody replied to it.
      const topicSource = sorted.find(m => m.topic) || sorted[0];
      return { peerId, last: sorted[0], topicSource, unread };
    })
    .sort((a, b) => String(b.last.created_at).localeCompare(String(a.last.created_at)));

  if (!threads.length) {
    body.innerHTML = '';
    if (empty) empty.hidden = false;
    if (greeting) greeting.hidden = false;
    return;
  }

  if (empty) empty.hidden = true;
  if (greeting) greeting.hidden = true;

  body.innerHTML = threads.map(thread => {
    // The subject comes from the most recent message that has one, so a reply
    // in the middle of a thread does not erase what the thread is about.
    const labelled = thread.topicSource;
    const topic = topicLabel(labelled.topic);
    const subject = topic
      || (labelled.subject
            || (thread.last.sender_id === me
                  ? 'Your message'
                  : 'Reply from the Registrar\'s Office'));
    const preview = (thread.last.body || '').replace(/\s+/g, ' ').slice(0, 90);
    const status = thread.unread > 0
      ? '<span class="pill-unread">New</span>'
      : '<span class="pill-read">Read</span>';

    return `
      <tr class="${thread.unread > 0 ? 'msg-row-unread' : ''}">
        <td>
          <button type="button" class="msg-thread-open" data-msg-peer="${escapeHtml(thread.peerId)}">
            ${escapeHtml(officeName(thread.peerId))}
          </button>
        </td>
        <td>${escapeHtml(subject)}</td>
        <td>
          <span class="msg-preview">${escapeHtml(preview)}</span>
          <div class="msg-stamp">${escapeHtml(fmtMsgStamp(thread.last.created_at))}</div>
        </td>
        <td>${status}</td>
      </tr>`;
  }).join('');
}

function openMsgThread(peerId) {
  const me = myStudentId();
  openMsgPeerId = peerId;

  const panel = getEl('msgThreadPanel');
  if (panel) panel.classList.remove('hidden');

  const office = messageOffices.find(p => p.id === peerId);
  const displayName = office ? (office.full_name || 'School office') : 'Registrar Help Desk';
  const nameEl = getEl('msgPeerName');
  if (nameEl) nameEl.textContent = displayName;

  const items = allMessages
    .filter(m => (m.sender_id === me && m.recipient_id === peerId)
               || (m.sender_id === peerId && m.recipient_id === me))
    .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));

  const history = getEl('msgHistory');
  if (history) {
    // The greeting is rendered, not stored. RLS only lets a user insert a
    // message whose sender_id is their own id, so a bot-authored row could not
    // be created by the student, and hardcoding one into the seed would put
    // fake correspondence in the help desk queue.
    const greeting = items.length ? '' : `
      <article class="msg-item msg-item-bot">
        <div class="msg-item-head">
          <span>Registrar Help Desk</span>
        </div>
        <div class="msg-item-body">
          Your question has been sent to the Registrar's Office. A member of staff
          will reply here. You can add more detail at any time.
        </div>
      </article>`;

    history.innerHTML = greeting + items.map(m => {
      const mine = m.sender_id === me;
      const topic = topicLabel(m.topic);
      return `
        <article class="msg-item ${mine ? 'mine' : ''}">
          <div class="msg-item-head">
            <span>${escapeHtml(mine ? 'You' : displayName)}</span>
            <span>${escapeHtml(fmtMsgStamp(m.created_at))}</span>
          </div>
          ${topic ? `<div class="msg-item-subject">${escapeHtml(topic)}</div>` : ''}
          <div class="msg-item-body">${escapeHtml(m.body || '')}</div>
        </article>`;
    }).join('');
  }

  markMsgThreadRead(peerId);
}

async function markMsgThreadRead(peerId) {
  const me = myStudentId();
  const unread = allMessages.filter(m =>
    m.sender_id === peerId && m.recipient_id === me && !m.is_read);
  if (!unread.length) return;

  const stamp = new Date().toISOString();
  // Only is_read / read_at are writable. Phase 0b narrows the column
  // grant so a recipient cannot rewrite the sender's message text.
  const { error } = await supabaseClient
    .from(MESSAGES_TABLE)
    .update({ is_read: true, read_at: stamp })
    .in('id', unread.map(m => m.id));

  if (error) {
    console.warn('[messages] could not mark read:', error);
    return;
  }

  unread.forEach(m => { m.is_read = true; m.read_at = stamp; });
  renderMessageThreads();
  updateMsgBadge();
}

async function sendStudentMessage(recipientId, subject, body, topic) {
  const me = myStudentId();
  if (!me) throw new Error('Not signed in');

  const { data, error } = await supabaseClient
    .from(MESSAGES_TABLE)
    .insert({
      sender_id: me,
      recipient_id: recipientId,
      subject: subject || null,
      topic: topic || null,
      body
    })
    .select('id, sender_id, recipient_id, subject, topic, body, is_read, read_at, created_at')
    .single();

  if (error) throw error;
  allMessages.unshift(data);
  renderMessageThreads();
  return data;
}

function wireMessaging() {
  document.addEventListener('click', event => {
    const opener = event.target instanceof Element
      ? event.target.closest('[data-msg-peer]')
      : null;
    if (opener) openMsgThread(opener.dataset.msgPeer);
  });

  getEl('btnCloseThread')?.addEventListener('click', () => {
    openMsgPeerId = null;
    getEl('msgThreadPanel')?.classList.add('hidden');
  });

  getEl('msgReplyForm')?.addEventListener('submit', async event => {
    event.preventDefault();
    const field = getEl('msgReplyBody');
    const body = field.value.trim();
    if (!body || !openMsgPeerId) return;

    const button = getEl('btnSendReply');
    button.disabled = true;
    const originalLabel = button.textContent;
    button.textContent = 'Sending…';
    try {
      await sendStudentMessage(openMsgPeerId, null, body, null);
      field.value = '';
      openMsgThread(openMsgPeerId);
      showToast('Reply sent');
    } catch (err) {
      showToast('Could not send your reply: ' + err.message, true);
    } finally {
      button.disabled = false;
      button.textContent = originalLabel;
    }
  });

  // Empty-state signposts. Without these the page reads as a dead end: a
  // student with no threads would see a heading and a table and no way to
  // start anything.
  getEl('btnGotoHelp')?.addEventListener('click', () => {
    goto('help');
  });

  getEl('btnGotoBooking')?.addEventListener('click', () => {
    goto('help');
    // The form is lower down the same page, so bring it into view rather than
    // dropping the student at the top of a long assistant thread.
    requestAnimationFrame(() => {
      const field = getEl('bookTopic');
      field?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      field?.focus?.();
    });
  });
}

// ── Help assistant + consultation booking ──────────────────────────────
// The assistant answers portal and school how-to questions from published
// articles and shows which article it used. It is deliberately not a channel
// to a person: when it cannot help, the answer is to book a consultation,
// which is the thing staff are actually notified about.
const FAQ_FUNCTION = 'faq-assistant';
const BOOK_TOPICS = {
  enrollment: 'Enrollment',
  grades: 'Grades & Evaluation',
  billing: 'Billing & Payment',
  clearance: 'Online Clearance',
  schedule: 'Class Schedule',
  registration: 'Registration',
  other: 'Other'
};

let helpHistory = [];
let helpBusy = false;
let appointmentsLoaded = false;
let myAppointments = [];
let lastUnansweredQuestion = '';

function setHelpBusy(busy) {
  helpBusy = busy;
  const button = getEl('helpSend');
  if (button) {
    button.disabled = busy;
    button.textContent = busy ? 'Thinking…' : 'Ask';
  }
}

// The assistant is markdown-ish. Only a small, known set of inline marks is
// converted, and everything is escaped first, so a model response cannot
// inject markup into the page.
function renderHelpText(text) {
  return escapeHtml(String(text || ''))
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[\s(])\*([^*\n]+)\*/g, '$1<em>$2</em>')
    .replace(/`([^`\n]+)`/g, '<code>$1</code>')
    .replace(/\n{2,}/g, '<br><br>')
    .replace(/\n/g, '<br>');
}

function appendHelpTurn(role, html) {
  const log = getEl('helpLog');
  if (!log) return;
  const article = document.createElement('article');
  article.className = role === 'user' ? 'msg-item mine' : 'msg-item msg-item-bot';
  const who = role === 'user' ? 'You' : 'Portal Assistant';
  article.innerHTML =
    `<div class="msg-item-head"><span>${escapeHtml(who)}</span></div>` +
    `<div class="msg-item-body">${html}</div>`;
  log.appendChild(article);
  log.scrollTop = log.scrollHeight;
}

function renderHelpSources(sources) {
  if (!Array.isArray(sources) || !sources.length) return '';
  const items = sources.map(source => `
    <li>
      <span class="help-src-cat">${escapeHtml(source.category || 'Article')}</span>
      <span class="help-src-q">${escapeHtml(source.question || '')}</span>
    </li>`).join('');
  return `<details class="help-sources">
    <summary>Sources (${sources.length})</summary>
    <ul>${items}</ul>
    <p class="help-src-note">
      Answers are drawn only from these published articles. If something here
      looks wrong, book a consultation.
    </p>
  </details>`;
}

async function askHelpAssistant(question) {
  const trimmed = (question || '').trim();
  if (!trimmed || helpBusy) return;

  appendHelpTurn('user', renderHelpText(trimmed));
  setHelpBusy(true);

  try {
    const { data: sessionData } = await supabaseClient.auth.getSession();
    const token = sessionData?.session?.access_token;

    const response = await supabaseClient.functions.invoke(FAQ_FUNCTION, {
      body: { message: trimmed, history: helpHistory },
      headers: token ? { Authorization: `Bearer ${token}` } : undefined
    });

    if (response.error) throw new Error(response.error.message);

    const answer = response.data?.answer;
    const sources = response.data?.sources;
    const resolved = response.data?.resolved !== false;

    if (!answer) throw new Error('The assistant returned nothing.');

    appendHelpTurn('bot', renderHelpText(answer) + renderHelpSources(sources));

    // Bounded so a long session cannot grow the request without limit.
    helpHistory.push({ role: 'user', content: trimmed });
    helpHistory.push({ role: 'assistant', content: String(answer).slice(0, 1500) });
    if (helpHistory.length > 10) helpHistory = helpHistory.slice(-10);

    if (!resolved) {
      lastUnansweredQuestion = trimmed;
      revealBooking(trimmed);
    }
  } catch (err) {
    console.error('[help] assistant failed:', err);
    appendHelpTurn('bot',
      'The assistant is not available right now. You can book a consultation and '
      + 'staff will be notified instead.');
    revealBooking(trimmed);
  } finally {
    setHelpBusy(false);
  }
}

// ── Booking ───────────────────────────────────────────────────────────
function revealBooking(question) {
  const card = getEl('bookCard');
  if (card) card.scrollIntoView({ behavior: 'smooth', block: 'start' });

  const notes = getEl('bookNotes');
  if (notes && question && !notes.value.trim()) {
    notes.value = question;
    notes.focus();
  }
  const topic = getEl('bookTopic');
  if (topic && !topic.value) topic.focus();
}

function bookStatusBadge(status) {
  const map = {
    pending:   ['Awaiting confirmation', 'book-pill-pending'],
    confirmed: ['Confirmed', 'book-pill-confirmed'],
    declined:  ['Declined', 'book-pill-declined'],
    completed: ['Completed', 'book-pill-done'],
    cancelled: ['Cancelled', 'book-pill-cancelled'],
    no_show:   ['No show', 'book-pill-done']
  };
  const [label, cls] = map[status] || ['Unknown', 'book-pill-cancelled'];
  return `<span class="book-pill ${cls}">${escapeHtml(label)}</span>`;
}

function renderMyAppointments() {
  const target = getEl('bookList');
  const wrap = getEl('bookListWrap');
  if (!target || !wrap) return;

  if (!myAppointments.length) {
    wrap.hidden = true;
    return;
  }
  wrap.hidden = false;

  target.innerHTML = myAppointments.map(appt => {
    // One instant, not a date and a wall-clock string. A confirmed slot
    // replaces the requested one; until then the student is looking at their
    // own preference, which is not an arrangement, and saying so matters.
    const when = appt.scheduled_at || appt.preferred_at;
    const confirmed = appt.scheduled_at
      ? `<div class="book-when-final">
           Confirmed: ${escapeHtml(fmtDateTime(when))}
         </div>`
      : `<div class="book-when-final muted-note">
           Requested: ${escapeHtml(fmtDateTime(when))}
         </div>`;

    const cancellable = appt.status === 'pending';

    return `
      <article class="book-item">
        <div class="book-item-head">
          <span class="book-item-topic">${escapeHtml(BOOK_TOPICS[appt.topic] || 'Other')}</span>
          ${bookStatusBadge(appt.status)}
        </div>
        ${confirmed}
        <div class="book-item-meta">${escapeHtml(appt.mode.replace('_', ' '))}</div>
        ${appt.notes ? `<div class="book-item-notes">${escapeHtml(appt.notes)}</div>` : ''}
        ${appt.staff_note ? `<div class="book-item-staff">Staff: ${escapeHtml(appt.staff_note)}</div>` : ''}
        ${cancellable
          ? `<button class="mini-btn book-cancel" type="button"
                     data-book-cancel="${escapeHtml(appt.id)}">Cancel request</button>`
          : ''}
      </article>`;
  }).join('');
}

async function loadAppointments() {
  const me = myStudentId();
  if (!me) return;

  const { data, error } = await supabaseClient
    .from('appointments')
    .select('id, topic, preferred_at, scheduled_at, '
          + 'mode, notes, staff_note, status, created_at')
    .eq('student_id', me)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) throw error;

  myAppointments = data || [];
  appointmentsLoaded = true;
  renderMyAppointments();
}

async function submitBooking(event) {
  event.preventDefault();
  const errorEl = getEl('bookError');
  if (errorEl) errorEl.hidden = true;

  const topic = getEl('bookTopic')?.value || '';
  const date = getEl('bookDate')?.value || '';
  const time = getEl('bookTime')?.value || '';
  const mode = getEl('bookMode')?.value || 'in_person';
  const notes = getEl('bookNotes')?.value.trim() || '';

  if (!topic || !date || !time) {
    if (errorEl) {
      errorEl.textContent = 'Choose a topic, a date and a preferred time.';
      errorEl.hidden = false;
    }
    return;
  }

  // The form collects Manila wall-clock time because that is what the student
  // means, but the column is timestamptz, so it is converted to an absolute
  // instant here. Sending the raw "2026-06-15" + "09:00" would leave the
  // database to guess a zone, and staff would read it in their own.
  const preferredAt = SCHOOLTIME.schoolLocalToIso(date, time);
  if (!preferredAt) {
    if (errorEl) {
      errorEl.textContent = 'That date and time could not be read. '
        + 'Pick a valid date and time.';
      errorEl.hidden = false;
    }
    return;
  }

  if (SCHOOLTIME.isPast(preferredAt)) {
    if (errorEl) {
      errorEl.textContent = date === SCHOOLTIME.schoolToday()
        ? 'That time has already passed today. Choose a later time.'
        : 'That date has already passed. Choose an upcoming date.';
      errorEl.hidden = false;
    }
    return;
  }

  const button = getEl('bookSubmit');
  button.disabled = true;
  const label = button.textContent;
  button.textContent = 'Sending…';

  try {
    const { error } = await supabaseClient.from('appointments').insert({
      topic,
      preferred_at: preferredAt,
      mode,
      notes: notes || null,
      // Copies the question the bot could not answer, so staff see the context
      // the student already tried to get answered.
      question: lastUnansweredQuestion || null
    });

    if (error) throw error;

    getEl('bookForm')?.reset();
    lastUnansweredQuestion = '';
    showToast('Consultation requested. Staff will confirm the time in Messages.');
    await loadAppointments();
    // The trigger created a message to the help desk, so the inbox needs to
    // pick it up rather than showing a stale thread list.
    if (messagesLoaded) {
      loadMessages().catch(err => console.warn('[messages] refresh failed:', err));
    }
  } catch (err) {
    if (errorEl) {
      errorEl.textContent = 'Could not send your request: ' + err.message;
      errorEl.hidden = false;
    }
    console.error('[booking] insert failed:', err);
  } finally {
    button.disabled = false;
    button.textContent = label;
  }
}

async function cancelBooking(id) {
  const ok = window.confirm('Cancel this consultation request?');
  if (!ok) return;

  // RLS only permits a student to move their own pending request to
  // cancelled, so a confirmed one is refused here rather than failing later.
  const { error } = await supabaseClient
    .from('appointments')
    .update({ status: 'cancelled' })
    .eq('id', id)
    .eq('status', 'pending');

  if (error) {
    showToast('Could not cancel: ' + error.message, true);
    return;
  }
  showToast('Request cancelled');
  await loadAppointments();
}

function wireHelp() {
  getEl('helpForm')?.addEventListener('submit', event => {
    event.preventDefault();
    const field = getEl('helpInput');
    const question = field.value;
    field.value = '';
    askHelpAssistant(question);
  });

  // Suggested questions. data-ask is a fixed string from this file, but it is
  // still escaped on the way into the textarea rather than trusted.
  document.addEventListener('click', event => {
    const chip = event.target instanceof Element
      ? event.target.closest('[data-ask]')
      : null;
    if (!chip) return;
    const question = chip.dataset.ask || '';
    const field = getEl('helpInput');
    if (field) field.value = question;
    askHelpAssistant(question);
  });

  getEl('bookForm')?.addEventListener('submit', submitBooking);

  getEl('bookList')?.addEventListener('click', event => {
    const button = event.target instanceof Element
      ? event.target.closest('[data-book-cancel]')
      : null;
    if (button) cancelBooking(button.dataset.bookCancel);
  });

  // Default the date to tomorrow. Not today: a request made this afternoon
  // for "this afternoon" is not something staff can act on.
  //
  // Computed on the Manila calendar, not the browser's. Using
  // `toISOString().slice(0, 10)` here would take the UTC date, which is a
  // different day for eight hours every evening, and would hand a student in
  // another country a minimum date that has nothing to do with the school.
  const dateField = getEl('bookDate');
  if (dateField) {
    const p = SCHOOLTIME.schoolNowParts();
    // Date.UTC is used only as a calendar calculator here: it normalises
    // month lengths and leap years without involving any time zone.
    const next = new Date(Date.UTC(p.year, p.month - 1, p.day + 1));
    dateField.min = next.toISOString().slice(0, 10);
  }

  // Say which zone the time is in, rather than relying on the student noticing
  // it, since the stored value is an instant but the student picks a wall
  // clock. Telling them once here is cheaper than a missed appointment.
  const manilaNote = getEl('bookManilaNote');
  if (manilaNote) {
    manilaNote.textContent =
      'It is currently ' + SCHOOLTIME.formatSchoolDateTime(new Date())
      + '. Times you enter are read as Manila time.';
  }
}

/**
 * Warn when a filed request could not actually reach anybody.
 *
 * The notification trigger raises a WARNING and returns instead of failing
 * when no registrar or admin account is active, so the insert succeeds and the
 * request sits in the staff queue unseen. From the student's side that is
 * indistinguishable from being ignored, so the state is surfaced instead of
 * left to be discovered. The request is still filed on purpose: staff may be
 * back shortly, and losing the question would be worse than a late one.
 *
 * This has its own element rather than reusing `bookError`, which carries
 * validation and load failures; overwriting one with the other would lose the
 * more specific message.
 */
function showHelpDeskUnreachable() {
  const el = getEl('bookDeskWarning');
  if (!el) return false;
  el.textContent =
    'The Registrar\'s Office currently has no active staff account, so a request '
    + 'would be saved without notifying anyone. Please contact the school in person, '
    + 'or ask again later.';
  el.hidden = false;
  return false;
}

function clearHelpDeskUnreachable() {
  const el = getEl('bookDeskWarning');
  if (el) el.hidden = true;
  return true;
}

/**
 * Resolve the help desk once per page load, independently of the inbox.
 *
 * This deliberately does not reuse the recipient fetched while loading
 * Messages. Both are loaded lazily on first visit to their page, so a student
 * who opens Help before Messages would be told nobody can be notified when in
 * fact the office is staffed.
 */
let helpDeskChecked = false;
async function ensureHelpDeskChecked() {
  if (helpDeskChecked) return;

  const { data, error } = await supabaseClient.rpc('helpdesk_recipient_id');
  helpDeskChecked = true;

  if (error) {
    // The RPC itself is missing or broken. That is a deployment problem, not a
    // statement about the office being closed, so it is logged and the student
    // is not alarmed.
    console.warn('[booking] help desk check failed:', error);
    clearHelpDeskUnreachable();
    return;
  }

  if (data) clearHelpDeskUnreachable();
  else showHelpDeskUnreachable();
}

function loadHelp() {
  // The assistant and the booking form share one page, so this is where the
  // help desk is checked: a student who cannot reach staff should find out
  // before filling in a form, not after.
  ensureHelpDeskChecked().catch(err =>
    console.warn('[booking] help desk check failed:', err));

  return loadAppointments().catch(err => {
    console.warn('[booking] load error:', err);
    const errorEl = getEl('bookError');
    if (errorEl) {
      errorEl.textContent =
        'Your existing requests could not be loaded. You can still send a new one.';
      errorEl.hidden = false;
    }
  });
}

// ── Class Schedule ────────────────────────────────────────────────────
// Reads the real timetable. The tables were defined in
// database/supabase-schema-v2.sql (timetable / rooms) but nothing in the
// portal ever queried them, so this is the first reader.
//
// Chain: enrollments -> timetable -> course_offerings, plus rooms and the
// teacher profile. Kept to three round-trips, and rooms/offerings are
// embedded because timetable has exactly one FK to each.
const DAY_ORDER = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

let scheduleLoaded = false;

function fmtTime(value) {
  if (!value) return '—';
  // TIME arrives as "HH:MM:SS"; show 12-hour without touching Date, which
  // would re-interpret it in the viewer's timezone.
  const match = String(value).match(/^(\d{2}):(\d{2})/);
  if (!match) return String(value);
  let h = Number(match[1]);
  const m = match[2];
  const suffix = h >= 12 ? 'PM' : 'AM';
  h = h % 12;
  if (h === 0) h = 12;
  return `${h}:${m} ${suffix}`;
}

async function loadSchedule() {
  const profile = state.studentProfile;
  const body = getEl('schedBody');
  if (!profile || !body) return;

  body.innerHTML = '<tr><td colspan="6" class="table-empty">Loading your schedule…</td></tr>';
  const note = getEl('schedNote');
  if (note) note.hidden = true;

  // 1. Which offerings is this student actually enrolled in?
  const { data: enrollments, error: enrErr } = await supabaseClient
    .from('enrollments')
    .select('offering_id')
    .eq('student_id', profile.id)
    .eq('status', 'enrolled');

  if (enrErr) throw enrErr;

  const offeringIds = [...new Set((enrollments || []).map(e => e.offering_id).filter(id => id !== null))];

  state.schedule = { subjects: [], slots: [], unscheduled: [], units: 0 };

  if (!offeringIds.length) {
    // Latch the loaded flag here too. Without it the lazy-load guard above
    // re-runs this whole function on every visit to the tab, so a student with
    // no enrolments saw a "Loading your schedule…" flash and paid for the same
    // query again on every click. Latching is only wrong on the error paths
    // above, where retrying is the right behaviour, so keep those unlatched.
    scheduleLoaded = true;
    renderSchedule();
    return;
  }

  // 2. Meeting times for those offerings.
  const { data: slots, error: slotErr } = await supabaseClient
    .from('timetable')
    .select('id, offering_id, day_of_week, start_time, end_time, teacher_id, room:rooms(name, building, type), offering:course_offerings(code, title, units, instructor_name)')
    .in('offering_id', offeringIds);

  if (slotErr) throw slotErr;

  // 3. Teacher names, keyed by id. Fetched separately rather than embedded:
  // timetable has one FK to profiles, but the generated constraint name is
  // an implementation detail and a wrong guess fails the whole query.
  const teacherIds = [...new Set((slots || []).map(s => s.teacher_id).filter(Boolean))];
  let teachers = {};
  if (teacherIds.length) {
    const { data: teacherRows } = await supabaseClient
      .from('profiles')
      .select('id, full_name')
      .in('id', teacherIds);
    teachers = Object.fromEntries((teacherRows || []).map(t => [t.id, t.full_name]));
  }

  // Subjects enrolled but with no timetable row are reported, not hidden
  // and not given an invented time.
  const scheduledOfferingIds = new Set((slots || []).map(s => s.offering_id));
  const unscheduled = offeringIds.filter(id => !scheduledOfferingIds.has(id));

  // Units come from the offerings the student is enrolled in.
  const { data: offeringRows } = await supabaseClient
    .from('course_offerings')
    .select('id, code, title, units, instructor_name')
    .in('id', offeringIds);
  const offerings = Object.fromEntries((offeringRows || []).map(o => [o.id, o]));

  state.schedule = {
    subjects: offeringRows || [],
    slots: slots || [],
    unscheduled,
    units: (offeringRows || []).reduce((sum, o) => sum + Number(o.units || 0), 0),
    teachers,
    offerings,
  };

  scheduleLoaded = true;
  renderSchedule();
}

function renderSchedule() {
  const s = state.schedule || { subjects: [], slots: [], unscheduled: [], units: 0 };
  const body = getEl('schedBody');
  if (!body) return;

  const setText = (id, value) => {
    const el = getEl(id);
    if (el) el.textContent = value;
  };

  setText('sched-subjects', String(s.subjects.length));
  setText('sched-sessions', String(s.slots.length));
  setText('sched-units', s.units ? String(s.units) : '0');
  setText('sched-unscheduled', String(s.unscheduled.length));

  const note = getEl('schedNote');
  if (note) {
    const notes = [];
    if (s.unscheduled.length) {
      notes.push(
        `${s.unscheduled.length} enrolled subject${s.unscheduled.length === 1 ? ' has' : 's have'} ` +
        `no meeting time published yet. Confirm with the Registrar.`
      );
    }
    if (!s.slots.length && s.subjects.length) {
      notes.push('The Registrar has not published meeting times for this term.');
    }
    if (notes.length) {
      note.textContent = notes.join(' ');
      note.hidden = false;
    } else {
      note.hidden = true;
    }
  }

  if (!s.subjects.length) {
    body.innerHTML = `
      <tr>
        <td colspan="6" class="table-empty">
          You are not enrolled in any subjects this term.
          <br><span class="table-empty-hint">Enrolled subjects and their meeting times appear here once enrollment is confirmed.</span>
        </td>
      </tr>`;
    return;
  }

  if (!s.slots.length) {
    // Enrolled, but nothing scheduled. Say exactly that.
    const rows = s.subjects
      .map(o => `
        <tr>
          <td><span class="chip chip-muted">Not set</span></td>
          <td>—</td>
          <td>
            <div class="sched-subject">${escapeHtml(o.code)}</div>
            <div class="sched-title">${escapeHtml(o.title)}</div>
          </td>
          <td>${escapeHtml(String(o.units ?? ''))}</td>
          <td>—</td>
          <td>${escapeHtml(o.instructor_name || '—')}</td>
        </tr>`)
      .join('');
    body.innerHTML = rows;
    return;
  }

  // Sort the data, not the rendered strings. Ordering by day then start
  // time is the only useful order for a timetable; the order rows come
  // back from Postgres is not meaningful.
  const ordered = [...s.slots].sort((a, b) => {
    const dayDiff = DAY_ORDER.indexOf(a.day_of_week) - DAY_ORDER.indexOf(b.day_of_week);
    if (dayDiff !== 0) return dayDiff;
    return String(a.start_time || '').localeCompare(String(b.start_time || ''));
  });

  // Which class is running right now, in Manila. Read once per render so every
  // row is judged against the same instant instead of each row asking the clock
  // separately and straddling a minute boundary.
  const nowClock = SCHOOLTIME.schoolNowClock();

  const rows = ordered
    .map(slot => {
      const offering = s.offerings?.[slot.offering_id] || slot.offering || {};
      const room = slot.room;
      const roomLabel = room
        ? [room.name, room.building].filter(Boolean).join(' · ')
        : '—';
      const teacher = s.teachers?.[slot.teacher_id]
        || offering.instructor_name
        || '—';

      // Half-open [start, end), judged in Manila. The predicate lives in
      // shared/datetime.js so it can be unit-tested against a pinned clock
      // instead of only ever running when a class happens to be live.
      const isNow = SCHOOLTIME.isSlotNow(slot, nowClock);

      return `
        <tr${isNow ? ' class="sched-now"' : ''}>
          <td><span class="chip">${escapeHtml(slot.day_of_week)}${isNow ? ' &middot; Now' : ''}</span></td>
          <td class="sched-time">${escapeHtml(fmtTime(slot.start_time))} – ${escapeHtml(fmtTime(slot.end_time))}</td>
          <td>
            <div class="sched-subject">${escapeHtml(offering.code || '—')}</div>
            <div class="sched-title">${escapeHtml(offering.title || '')}</div>
          </td>
          <td>${escapeHtml(String(offering.units ?? ''))}</td>
          <td>${escapeHtml(roomLabel)}</td>
          <td>${escapeHtml(teacher)}</td>
        </tr>`;
    })
    .join('');

  body.innerHTML = rows;
}

getEl('schedRefresh')?.addEventListener('click', async () => {
  try {
    await loadSchedule();
    showToast('Schedule refreshed');
  } catch (err) {
    showToast('Could not load your schedule: ' + err.message, true);
  }
});

// The "now" highlight is only true at the instant it was rendered, so a tab left
// open across a class boundary would go stale and point at the wrong row.
// Re-render on a timer, gated on the schedule page actually being on screen and
// the document being visible: a background tab has nobody reading the highlight,
// and re-rendering it there would be work for nothing.
setInterval(() => {
  if (state.page !== 'schedule') return;
  if (document.hidden) return;
  if (!scheduleLoaded) return;
  if (!getEl('schedBody')) return;
  renderSchedule();
}, 60000);

// ── Load failure reporting ───────────────────────────────────────────
// A failed fetch used to be logged to the console and nothing else, so a
// student whose billing query errored saw a permanent "—" and had no way
// to tell that apart from "you have no balance". Silent failure reads as
// "no data", which is exactly the wrong thing to show about money.
const FAILED_SECTIONS = Object.freeze({
  dashboard: 'Dashboard summary',
  enrollment: 'Course selection',
  billing: 'Billing & History',
  grades: 'Grades & Evaluation',
  clearance: 'Online Clearance',
  cor: 'Certificate of Registration',
  attendance: 'Attendance History',
  evaluation: 'Faculty Evaluation',
  profile: 'My Profile',
  announcements: 'Announcements',
  deadlines: 'Deadlines',
  notifications: 'Notifications',
  sso: 'Quick Links'
});

let loadFailureBanner = null;

function showLoadFailures(failures) {
  if (!failures.length || loadFailureBanner) return;

  const host = getEl('pageTitle')?.closest('.topbar')?.parentElement
    || getEl('page-dashboard')?.parentElement
    || document.querySelector('.main');
  if (!host) return;

  const banner = document.createElement('div');
  banner.className = 'load-failure-banner';
  banner.setAttribute('role', 'alert');

  const names = failures
    .map(key => FAILED_SECTIONS[key] || key)
    .join(', ');

  banner.innerHTML = `
    <div class="load-failure-inner">
      <strong>Some sections could not be loaded.</strong>
      <span>Affected: ${escapeHtml(names)}. The figures shown in these sections may be
      incomplete. Refresh to try again, or contact the Registrar if it continues.</span>
    </div>
    <button type="button" class="load-failure-dismiss" aria-label="Dismiss this notice">&times;</button>`;

  banner.querySelector('.load-failure-dismiss')?.addEventListener('click', () => {
    banner.remove();
    loadFailureBanner = null;
  });

  host.insertBefore(banner, host.firstChild);
  loadFailureBanner = banner;
}

// ── Application Initialization ───────────────────────────────────────
async function init() {
  const profile = await getCurrentStudent();
  if (!profile) return;

  setupAuthListener();
  wireMessaging();
  wireHelp();
  state.apiOnline = true;

  // Load all modules independently — a failure in one should not block the rest
  const failures = [];
  const loadSafely = (name, fn) => fn().catch(err => {
    console.warn(`[${name}] load error:`, err);
    failures.push(name);
  });

  await Promise.all([
    loadSafely('dashboard',    loadDashboard),
    loadSafely('enrollment',   loadEnrollment),
    loadSafely('billing',      loadBilling),
    loadSafely('grades',       loadGrades),
    loadSafely('clearance',    loadClearance),
    loadSafely('cor',          loadCor),
    loadSafely('announcements',loadAnnouncements),
    loadSafely('deadlines',    loadDeadlines),
    loadSafely('notifications',loadNotifications),
    loadSafely('sso',          loadSSOLinks),
    loadSafely('attendance',   loadAttendance),
    loadSafely('evaluation',   loadFacultyEval),
    loadSafely('profile',      loadProfile),
  ]);

  // A silent failure is indistinguishable from an empty account, so say so.
  showLoadFailures(failures);
  if (failures.length) {
    showToast(`Could not load ${failures.length} section(s). See the notice at the top of the page.`, true);
  }

  if (window.imccHidePreloader) window.imccHidePreloader();
}

// Wait for shared supabase-config.js to initialize window.__myimcc_supabase_client__
(function waitForSupabase() {
  if (window.__myimcc_supabase_client__) {
    supabaseClient = window.__myimcc_supabase_client__;
    init();
  } else {
    window.addEventListener('supabase:ready', function onReady() {
      window.removeEventListener('supabase:ready', onReady);
      supabaseClient = window.__myimcc_supabase_client__;
      init();
    });
  }
})();