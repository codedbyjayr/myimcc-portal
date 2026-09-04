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
  adminView: false,
  apiOnline: false,
  dashboard: null,
  courses: [],
  miscFees: [],
  selectedOfferingIds: new Set(),
  billing: { totalPaid: 0, installments: [], transactions: [] },
  grades: [],
  departments: [],
  activity: [],
  currentUser: null,
  studentProfile: null,
};

// ── Formatting Helpers ───────────────────────────────────────────────
const peso = n => '₱' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
const fmtDate = iso => iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';
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
  if (pageEl) pageEl.classList.add('active');

  document.querySelectorAll('.nav-item[data-page]').forEach(n => n.classList.toggle('active', n.dataset.page === page));

  const titles = {
    dashboard: 'Dashboard',
    enrollment: 'Enrollment',
    billing: 'Billing & History',
    grades: 'Grades & Evaluation',
    clearance: 'Online Clearance',
    cor: 'Certificate of Registration',
    attendance: 'Attendance History',
    evaluation: 'Faculty Evaluation',
    profile: 'My Profile'
  };
  const titleEl = getEl('pageTitle');
  if (titleEl) titleEl.textContent = titles[page] || 'Dashboard';
  
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
  t.style.background = isError ? 'var(--red, #ef4444)' : 'var(--ink-900, #0f172a)';
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

  setText('heroGreeting', `${greeting}, ${firstName}! 👋`);

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

function parseSchedule(scheduleStr) {
  if (!scheduleStr) return null;
  const s = scheduleStr.trim().toUpperCase();

  const match = s.match(/^([A-Z]{1,4})\s+(\d{1,2}):(\d{2})\s*(AM|PM)?\s*[-–]\s*(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
  if (!match) return null;

  const dayStr = match[1];
  let startH = parseInt(match[2], 10);
  const startM = parseInt(match[3], 10);
  let startMeridiem = match[4];

  let endH = parseInt(match[5], 10);
  const endM = parseInt(match[6], 10);
  const endMeridiem = match[7];

  if (!startMeridiem && endMeridiem) {
    startMeridiem = (startH < endH || startH === 12) ? endMeridiem : (endMeridiem === 'PM' ? 'AM' : 'PM');
  }

  if (startMeridiem === 'PM' && startH < 12) startH += 12;
  if (startMeridiem === 'AM' && startH === 12) startH = 0;
  if (endMeridiem === 'PM' && endH < 12) endH += 12;
  if (endMeridiem === 'AM' && endH === 12) endH = 0;

  let days = [];
  if (dayStr === 'TTH' || dayStr === 'TH') {
    days = dayStr === 'TTH' ? ['T', 'TH'] : ['TH'];
  } else if (dayStr === 'MWF') {
    days = ['M', 'W', 'F'];
  } else if (dayStr === 'MW') {
    days = ['M', 'W'];
  } else {
    days = dayStr.split('');
  }

  return { days, startMin: startH * 60 + startM, endMin: endH * 60 + endM };
}

function schedulesConflict(a, b) {
  if (!a || !b) return false;
  const sharedDays = a.days.some(d => b.days.includes(d));
  if (!sharedDays) return false;
  return a.startMin < b.endMin && b.startMin < a.endMin;
}

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

  const { data: summary } = await supabaseClient
    .from('billing_summary')
    .select('*')
    .eq('student_id', profile.id)
    .maybeSingle();

  const { data: txns } = await supabaseClient
    .from('transactions')
    .select('*')
    .eq('student_id', profile.id)
    .order('txn_date', { ascending: false });

  const { data: inst } = await supabaseClient
    .from('installments')
    .select('*')
    .eq('student_id', profile.id)
    .order('due_date', { ascending: true });

  state.billing = {
    totalPaid: summary?.total_paid || 0,
    installments: inst || [],
    transactions: txns || [],
  };

  renderTxns();
  renderInstallments();
  renderUpay();
  renderBillingStats();
}

function renderBillingStats() {
  const pending = state.billing.installments.filter(i => i.status === 'pending');
  setText('bill-totalpaid', peso(state.billing.totalPaid));
  setText('bill-balance', peso(pending.reduce((s, i) => s + Number(i.amount || 0), 0)));
  const next = pending[0];
  setText('bill-nextdate', next ? fmtDate(next.due_date).split(',')[0] : '—');
  setText('bill-nextlabel', next ? next.name.toLowerCase() : 'nothing due');
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
  target.innerHTML = state.billing.installments.map(i => `
    <div class="inst-row" style="display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--line);">
      <div><div class="n" style="font-size:13px;font-weight:600;">${escapeHtml(i.name)}</div><div class="dt" style="font-size:11px;color:var(--ink-500);">${fmtDate(i.due_date)}</div></div>
      <div style="text-align:right;">
        <div class="${i.status === 'paid' ? 'amt-strike' : 'amt-pink'}" style="font-weight:700;">${peso(i.amount)}</div>
        <div style="font-size:10.5px;font-weight:800;color:${i.status === 'paid' ? 'var(--green)' : 'var(--red)'};">${i.status === 'paid' ? '✓ PAID' : 'PENDING'}</div>
      </div>
    </div>`).join('');
}

function renderUpay() {
  const target = getEl('upayList');
  if (!target) return;
  const pending = state.billing.installments.filter(i => i.status === 'pending');
  target.innerHTML = pending.length ? pending.map(i => `
    <div class="upay due" style="padding:12px;border:1px solid var(--line);border-radius:8px;margin-bottom:10px;">
      <div class="upay-top" style="display:flex;justify-content:space-between;align-items:center;">
        <span class="t" style="font-weight:600;font-size:13px;">${escapeHtml(i.name)}</span>
        <span class="pill pill-urgent">DUE SOON</span>
      </div>
      <div class="amt" style="color:var(--pink-600);font-size:18px;font-weight:800;margin:6px 0;">${peso(i.amount)}</div>
      <div class="due-date" style="font-size:12px;color:var(--ink-500);">Due: ${fmtDate(i.due_date)}</div>
      <button class="btn btn-primary" style="width:100%;justify-content:center;margin-top:10px;" onclick="payInstallment('${i.id}')">Pay Now</button>
    </div>`).join('') : `
    <div class="upay" style="text-align:center;color:var(--green);font-weight:700;padding:15px;">✓ All balances settled</div>`;
}

async function payInstallment(id) {
  try {
    const { data, error } = await supabaseClient
      .from('installments')
      .update({ status: 'paid', paid_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;

    showToast(`Payment received — OR ${data.or_number || 'Processed'}`);
    await Promise.all([loadBilling(), loadDashboard(), loadClearance()]);
  } catch (err) {
    showToast('Payment failed: ' + err.message, true);
  }
}
window.payInstallment = payInstallment;

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
async function loadGrades() {
  const profile = state.studentProfile;
  if (!profile) return;

  const { data: rows } = await supabaseClient
    .from('grades')
    .select('*, course_offerings(code, title, units, instructor_name)')
    .eq('student_id', profile.id);

  state.grades = (rows || []).map(g => ({
    code: g.course_offerings?.code || '—',
    title: g.course_offerings?.title || '—',
    instructor_name: g.course_offerings?.instructor_name,
    units: g.course_offerings?.units,
    prelim: g.prelim,
    midterm: g.midterm,
    semifinal: g.semifinal,
    final: g.final,
    equivalent: g.equivalent,
    ai_predicted_grade: g.ai_predicted_grade,
    ai_predicted_equivalent: g.ai_predicted_equivalent,
    remark: g.remark || 'Pending',
  }));

  renderGrades();
  renderGradeStats();
  renderGradesHeader();
  setupProspectusButton();
}

function renderGradeStats() {
  const withFinal = state.grades.filter(g => g.final !== null && g.final !== undefined);
  const avg = withFinal.length ? (withFinal.reduce((s, g) => s + Number(g.equivalent || 0), 0) / withFinal.length).toFixed(2) : '—';
  const highest = withFinal.length ? Math.max(...withFinal.map(g => Number(g.final))) : '—';
  const highestCourse = withFinal.find(g => Number(g.final) === highest);
  const completed = withFinal.length;
  const total = state.grades.length;

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

  if (!state.grades || state.grades.length === 0) {
    target.innerHTML = `<tr><td colspan="11" style="text-align:center;color:var(--ink-400);padding:36px;font-size:13px;">No enrolled course grades recorded for this term yet. Once faculty encodes your grades, they will appear here.</td></tr>`;
    return;
  }

  target.innerHTML = state.grades.map(g => `
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
  const d = state.dashboard;
  const profile = state.studentProfile;
  const program = d?.student?.program || profile?.program || 'BSIT';
  const yearLevel = d?.student?.yearLevel || profile?.year_level || '';
  const section = d?.student?.section || profile?.section || '';
  const semester = d?.student?.semester || '1st Semester';
  const schoolYear = d?.student?.schoolYear || '2026-2027';

  const setTitle = getEl('gradesTitle');
  if (setTitle) {
    setTitle.innerHTML = `Grades — ${semester}, ${schoolYear}<br><span style="font-weight:500;font-size:12px;color:var(--ink-500);" id="gradesSubtitle">${escapeHtml(program)} ${escapeHtml(yearLevel)}${section ? ' · Section ' + escapeHtml(section) : ''}</span>`;
  }
  setText('gradesTermPill', `${semester} ${schoolYear}`);

  const aiEl = getEl('aiInsightText');
  if (aiEl) {
    const withFinal = state.grades.filter(g => g.final !== null && g.final !== undefined);
    const curAvg = withFinal.length ? (withFinal.reduce((s, g) => s + Number(g.equivalent || 0), 0) / withFinal.length) : null;
    const withAi = state.grades.filter(g => g.ai_predicted_equivalent !== null && g.ai_predicted_equivalent !== undefined);
    const aiAvg = withAi.length ? (withAi.reduce((s, g) => s + Number(g.ai_predicted_equivalent), 0) / withAi.length) : null;

    if (curAvg !== null && aiAvg !== null) {
      const track = aiAvg <= 1.75 ? "Dean's List" : aiAvg <= 2.5 ? 'Good Standing' : 'At Risk';
      const weakest = withAi.reduce((min, g) => Number(g.ai_predicted_equivalent) < Number(min.ai_predicted_equivalent) ? g : min, withAi[0]);
      const weakTxt = weakest ? ` Focus on ${weakest.code} (${weakest.title}) where your trajectory shows the most room for improvement.` : '';
      aiEl.innerHTML = `Based on your recorded grading periods, our AI model predicts a final GWA of <b>${aiAvg.toFixed(2)}</b> — placing you on the <b>${track}</b> track.${weakTxt}`;
    } else {
      aiEl.textContent = 'AI predictions will appear here once Pre-Lim or Midterm grades and prediction data are available.';
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
      .single();

    const activeSchoolYear = sem?.school_year || '2025–2026';
    const activeSemester = sem?.semester || '2nd Semester';

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

    const { data: sigs } = await supabaseClient
      .from('cor_signatories')
      .select('*')
      .limit(1)
      .single();

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

window.addEventListener('afterprint', () => {
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
    let actionBtn = '';
    if (d.department_code === 'cashier' && d.status === 'action_required') {
      actionBtn = `<button class="mini-btn" onclick="goto('billing')" style="margin-top:10px;background:var(--pink-600);color:#fff;border:none;padding:6px 12px;border-radius:6px;font-weight:600;cursor:pointer;">Pay Balance →</button>`;
    }
    if (state.adminView && d.status !== 'cleared') {
      actionBtn += ` <button class="mini-btn" style="margin-top:10px;background:var(--pink-600);color:#fff;border:none;padding:6px 12px;border-radius:6px;font-weight:600;cursor:pointer;" onclick="adminClear('${d.department_code}')">Mark Cleared (Admin Simulation)</button>`;
    }
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

async function adminClear(code) {
  const profile = state.studentProfile;
  try {
    const { error } = await supabaseClient
      .from('clearances')
      .update({ status: 'cleared', cleared_at: new Date().toISOString() })
      .eq('student_id', profile.id)
      .eq('department_code', code);
    if (error) throw error;

    const dept = state.departments.find(d => d.department_code === code);
    showToast(`${dept ? dept.department_name : code} marked as cleared`);
    await Promise.all([loadClearance(), loadDashboard()]);
  } catch (err) {
    showToast('Could not update clearance: ' + err.message, true);
  }
}
window.adminClear = adminClear;

getEl('adminToggle')?.addEventListener('click', () => {
  state.adminView = !state.adminView;
  renderClearance();
  showToast(state.adminView ? 'Admin view enabled — you can now simulate approvals' : 'Admin view disabled');
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

function getLocalFaqAnswer(q) {
  const lower = q.toLowerCase();
  if (lower.includes('enroll')) return { text: 'Enrollment is open until the deadline shown in your dashboard. Settle balances first, then select courses under the Enrollment tab.', sources: [{ category: 'Enrollment' }] };
  if (lower.includes('balance') || lower.includes('pay')) return { text: 'You can view your balance under Billing & History. Click Pay Now on any pending installment.', sources: [{ category: 'Billing' }] };
  if (lower.includes('grade')) return { text: 'Grades are posted under Grades & Evaluation. AI predictions are estimates based on midterm performance.', sources: [{ category: 'Grades' }] };
  if (lower.includes('clearance')) return { text: 'Clearance requires all departments to mark you as cleared. Pay any balances and complete required interviews.', sources: [{ category: 'Clearance' }] };
  return { text: 'I can help with enrollment, billing, grades, and clearance. For specific concerns, email registrar@imcc.edu.ph.', sources: [] };
}

chatSend?.addEventListener('click', sendChatMessage);
chatInput?.addEventListener('keydown', (e) => { if (e.key === 'Enter') sendChatMessage(); });

// ── MFA Configuration Module ─────────────────────────────────────────
let currentMfaFactorId = null;
let currentMfaSecret = null;
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
      const { data: enrollData, error: enrollError } = await supabaseClient.auth.mfa.enroll({
        factorType: 'totp',
        issuer: 'MyIMCC Portal',
        friendlyName: profile.email || profile.student_no
      });

      if (!enrollError && enrollData) {
        currentMfaFactorId = enrollData.id;
        currentMfaSecret = enrollData.totp.secret;
        if (mfaQrImg) mfaQrImg.src = enrollData.totp.qr_code;
        if (mfaSecretText) mfaSecretText.textContent = `Secret: ${enrollData.totp.secret}`;
        if (mfaCodeInput) mfaCodeInput.value = '';
        if (mfaModal) mfaModal.style.display = 'flex';
        return;
      }

      const { data, error } = await supabaseClient.functions.invoke('mfa-enroll', {
        body: { user_id: profile.id },
      });
      if (error) throw error;
      if (data && data.success && data.needsEnrollment) {
        currentMfaSecret = data.secret;
        if (mfaQrImg) mfaQrImg.src = data.qrUrl;
        if (mfaSecretText) mfaSecretText.textContent = `Secret: ${data.secret}`;
        if (mfaCodeInput) mfaCodeInput.value = '';
        if (mfaModal) mfaModal.style.display = 'flex';
      }
    } catch (err) {
      showToast('MFA setup error: ' + err.message, true);
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
    try {
      if (currentMfaFactorId) {
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
        return;
      }

      const { data, error } = await supabaseClient.functions.invoke('mfa-verify', {
        body: { user_id: profile.id, secret: currentMfaSecret, code },
      });
      if (error) throw error;
      if (data && data.success) {
        showToast('MFA Google Authenticator enabled successfully!');
        if (mfaModal) mfaModal.style.display = 'none';
      }
    } catch (err) {
      showToast('MFA verification failed: ' + err.message, true);
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
  const visible = (links || []).filter(l => (l.roles || '').split(',').map(r => r.trim()).includes(role));
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
    const { error } = await supabaseClient.from('profiles').update({
      phone,
      address,
      avatar_url,
    }).eq('id', profile.id);

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

// ── Application Initialization ───────────────────────────────────────
async function init() {
  const profile = await getCurrentStudent();
  if (!profile) return;

  setupAuthListener();
  state.apiOnline = true;
  try {
    await Promise.all([
      loadDashboard(),
      loadEnrollment(),
      loadBilling(),
      loadGrades(),
      loadClearance(),
      loadCor(),
      loadAnnouncements(),
      loadDeadlines(),
      loadNotifications(),
      loadSSOLinks(),
      loadAttendance(),
      loadFacultyEval(),
      loadProfile(),
    ]);
  } catch (err) {
    showToast('Failed to load portal data: ' + err.message, true);
    console.error('Initialization error:', err);
  }
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