/* =====================================================================
   MyIMCC Portal — Supabase Integration Layer
   ZERO UI CHANGES. Only data sources are replaced.
   ===================================================================== */

// ── Supabase Client ───────────────────────────────────────────────────

// DO NOT re-declare `const supabase = createClient(...)` here.
// The client is created by shared/supabase-config.js and stored in
// window.__myimcc_supabase_client__. We alias it locally for
// backward compatibility with the rest of this file.
let supabase;  // set by waitForSupabase() at bottom of file
// ── State (preserved exactly) ─────────────────────────────────────────
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

const peso = n => '₱' + Number(n).toLocaleString('en-US');
const fmtDate = iso => iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';

// ── Auth Guard ────────────────────────────────────────────────────────
async function getCurrentStudent() {
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) {
    window.location.href = 'login.html';
    return null;
  }
  state.currentUser = user;

  // Fetch profile row matching auth uid
  const { data: profile, error: pErr } = await supabase
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

// ── Navigation (preserved) ────────────────────────────────────────────
function goto(page) {
  state.page = page;
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById('page-' + page).classList.add('active');
  document.querySelectorAll('.nav-item[data-page]').forEach(n => n.classList.toggle('active', n.dataset.page === page));
  const titles = { dashboard: 'Dashboard', enrollment: 'Enrollment', billing: 'Billing & History', grades: 'Grades & Evaluation', clearance: 'Online Clearance', attendance: 'Attendance History', evaluation: 'Faculty Evaluation', profile: 'My Profile' };
  document.getElementById('pageTitle').textContent = titles[page];
  window.scrollTo(0, 0);
}
document.querySelectorAll('[data-page]').forEach(el => el.addEventListener('click', () => goto(el.dataset.page)));
document.querySelectorAll('[data-goto]').forEach(el => el.addEventListener('click', () => goto(el.dataset.goto)));

// ── Toast (preserved) ─────────────────────────────────────────────────
let toastTimer;
function showToast(msg, isError) {
  const t = document.getElementById('toast');
  document.getElementById('toastMsg').textContent = msg;
  t.style.background = isError ? 'var(--red)' : 'var(--ink-900)';
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 3500);
}

// ── Dropdowns (preserved) ─────────────────────────────────────────────
function setupDropdown(btnId, ddId) {
  const btn = document.getElementById(btnId), dd = document.getElementById(ddId);
  btn.addEventListener('click', e => { e.stopPropagation(); dd.classList.toggle('open'); });
  document.addEventListener('click', () => dd.classList.remove('open'));
  dd.addEventListener('click', e => e.stopPropagation());
}
setupDropdown('bellBtn', 'bellDropdown');
setupDropdown('userBtn', 'userDropdown');

// ── Theme (preserved) ─────────────────────────────────────────────────
document.getElementById('themeToggle').addEventListener('click', () => {
  state.darkMode = !state.darkMode;
  document.body.setAttribute('data-theme', state.darkMode ? 'dark' : 'light');
  document.getElementById('themeLabel').textContent = state.darkMode ? 'Light' : 'Dark';
  document.getElementById('themeIcon').innerHTML = state.darkMode
    ? '<circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4"/>'
    : '<path d="M21 12.8A9 9 0 1111.2 3 7 7 0 0021 12.8z"/>';
});

// ── Helpers (preserved) ───────────────────────────────────────────────
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

// ── Dashboard Loader ──────────────────────────────────────────────────
async function loadDashboard() {
  const profile = state.studentProfile;
  if (!profile) return;

  // 1. Current semester metrics
  const { data: sem, error: semErr } = await supabase
    .from('student_semesters')
    .select('*')
    .eq('student_id', profile.id)
    .eq('is_current', true)
    .single();

  if (semErr) console.error('semester fetch error:', semErr);

  // 2. Clearance summary
  const { data: clearances } = await supabase
    .from('clearances')
    .select('status')
    .eq('student_id', profile.id);

  const clearedCount = (clearances || []).filter(c => c.status === 'cleared').length;
  const totalClear = (clearances || []).length || 1;

  // 3. Next due installment
  const { data: nextDue } = await supabase
    .from('installments')
    .select('*')
    .eq('student_id', profile.id)
    .eq('status', 'pending')
    .order('due_date', { ascending: true })
    .limit(1)
    .single();

  // 4. Recent activity
  const { data: activities } = await supabase
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
      schoolYear: sem?.school_year || 'AY 2025–2026',
      semester: sem?.semester || '2nd Semester',
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

  document.getElementById('heroGreeting').textContent = `${greeting}, ${firstName}! 👋`;

  // Hero subtitle: term + program + year level (replaces hardcoded
  // "2nd Semester, AY 2025–2026 — BSIT 2nd Year")
  const heroSubtitle = document.getElementById('heroSubtitle');
  if (heroSubtitle) {
    const yr = d.student.yearLevel ? ` — ${d.student.program} ${d.student.yearLevel}` : '';
    heroSubtitle.textContent = `${d.student.semester}, ${d.student.schoolYear}${yr}`;
  }

  const heroMeta = document.querySelector('.hero .meta');
  if (heroMeta) {
    const section = d.student.section ? ` · Section: ${d.student.section}` : '';
    heroMeta.textContent = `Student No. ${studentNo}${section}`;
  }

  const sidebarAvatar = document.getElementById('sidebarAvatar');
  const sidebarName = document.getElementById('sidebarName');
  const sidebarStudentNo = document.getElementById('sidebarStudentNo');
  const topAvatar = document.getElementById('topAvatar');
  const topName = document.getElementById('topName');

  if (sidebarAvatar) sidebarAvatar.textContent = initials;
  if (sidebarName) sidebarName.textContent = studentName;
  if (sidebarStudentNo) sidebarStudentNo.textContent = studentNo;
  if (topAvatar) topAvatar.textContent = initials;
  if (topName) topName.textContent = studentName.length > 12 ? `${firstName} ${studentName.split(' ')[1]?.[0] || ''}.` : studentName;

  document.getElementById('stat-gwa').textContent = d.gwa;
  document.getElementById('stat-units').textContent = d.unitsEnrolled;
  document.getElementById('stat-subjects').textContent = `${d.subjectsEnrolled} subject${d.subjectsEnrolled === 1 ? '' : 's'}`;
  document.getElementById('stat-balance').textContent = peso(d.balance);
  document.getElementById('stat-due').textContent = d.balance > 0 && d.nextDue ? `Due ${fmtDate(d.nextDue.due_date)}` : 'All settled ✓';
  document.getElementById('stat-clearance').textContent = `${d.clearance.cleared}/${d.clearance.total}`;

  document.getElementById('activityList').innerHTML = d.activity.length
    ? d.activity.map(a => `
      <div class="activity-row">
        <div class="adot" style="background:${a.color || '#E7338A'};"></div>
        <div><div class="t">${a.description}</div><div class="d">${fmtDate(a.created_at)}</div></div>
      </div>`).join('')
    : `<div style="color:var(--ink-300);font-size:13px;">No recent activity yet.</div>`;

  // Hydrate sidebar footer
  const sf = document.getElementById('sidebarFoot');
  if (sf) {
    const sy = d.student.schoolYear || 'AY 2025–2026';
    const sem = d.student.semester || 'Sem 2';
    const prog = d.student.program || '—';
    const yr = d.student.yearLevel || '—';
    sf.innerHTML = `${sy} · ${sem}<br>${prog} — ${yr}`;
  }
}

// ── Announcements & Banner ────────────────────────────────────────────
async function loadAnnouncements() {
  const { data: rows } = await supabase
    .from('announcements')
    .select('*')
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(1);

  const banner = document.getElementById('topBanner');
  if (rows && rows[0] && banner) {
    const a = rows[0];
    const deadline = a.deadline ? ` Deadline: <b>${fmtDate(a.deadline)}</b>.` : '';
    banner.innerHTML = `🔔 ${a.content}${deadline}`;
  }
}

// ── Deadlines ─────────────────────────────────────────────────────────
async function loadDeadlines() {
  const profile = state.studentProfile;
  if (!profile) return;
  const { data: rows } = await supabase
    .from('deadlines')
    .select('*')
    .eq('is_active', true)
    .order('due_date', { ascending: true })
    .limit(4);

  const container = document.getElementById('deadlinesCard');
  if (!container) return;

  // Rebuild exactly the same DOM structure as original
  const urgencyClass = (type) => type === 'urgent' ? 'urgent' : '';
  const pillClass = (type) => type === 'urgent' ? 'pill-urgent' : 'pill-soft';
  const pillText = (type) => type === 'urgent' ? 'URGENT' : (type === 'schedule' ? 'SCHEDULE' : 'OPTIONAL');
  const dateColor = (type) => type === 'urgent' ? 'color:var(--pink-600);font-weight:700;' : 'color:var(--ink-500);';

  container.innerHTML = `<div class="card-head"><h3>Upcoming Deadlines</h3></div>` +
    (rows || []).map(d => `
      <div class="deadline ${urgencyClass(d.type)}">
        <div class="deadline-top"><span class="t">${d.title}</span><span class="pill ${pillClass(d.type)}">${pillText(d.type)}</span></div>
        <div class="d" style="${dateColor(d.type)}">${fmtDate(d.due_date)}</div>
      </div>
    `).join('');
}

// ── Notifications ─────────────────────────────────────────────────────
async function loadNotifications() {
  const profile = state.studentProfile;
  if (!profile) return;
  const { data: rows } = await supabase
    .from('activities')
    .select('*')
    .eq('student_id', profile.id)
    .order('created_at', { ascending: false })
    .limit(3);

  const list = document.getElementById('notifList') || document.getElementById('bellDropdown');
  if (!list) return;

  // If we wrapped items in #notifList, use that; otherwise inject into dropdown
  const target = document.getElementById('notifList');
  if (target) {
    target.innerHTML = (rows || []).map(n => `
      <div class="notif-item"><div class="t">${n.description}</div><div class="d">${fmtDate(n.created_at)}</div></div>
    `).join('');
  }
}

// ── Enrollment ────────────────────────────────────────────────────────
async function loadEnrollment() {
  const profile = state.studentProfile;
  if (!profile) return;

  // 1. Resolve the student's CURRENT term dynamically (no more hardcoded
  //    '2nd Semester' / '2025–2026'). Falls back to active term from settings.
  const { data: currentSem } = await supabase
    .from('student_semesters')
    .select('school_year, semester')
    .eq('student_id', profile.id)
    .eq('is_current', true)
    .single();

  const activeSchoolYear = currentSem?.school_year || '2025–2026';
  const activeSemester = currentSem?.semester || '2nd Semester';

  // 2. Fetch current-term offerings
  const { data: offerings } = await supabase
    .from('course_offerings')
    .select('*')
    .eq('semester', activeSemester)
    .eq('school_year', activeSchoolYear);

  // 3. Fetch what this student is already enrolled in
  const { data: enrolled } = await supabase
    .from('enrollments')
    .select('offering_id')
    .eq('student_id', profile.id);

  const enrolledIds = new Set((enrolled || []).map(e => e.offering_id));

  // 4. Fetch misc fees for the active term
  const { data: misc } = await supabase
    .from('misc_fees')
    .select('*')
    .eq('semester', activeSemester)
    .eq('school_year', activeSchoolYear);

  state.courses = (offerings || []).map(o => ({
    offering_id: o.id,
    code: o.code,
    title: o.title,
    units: o.units,
    fee: o.fee,
    instructor_name: o.instructor_name,
    schedule: o.schedule,
    selected: enrolledIds.has(o.id),
  }));

  state.miscFees = misc || [];
  state.selectedOfferingIds = new Set(state.courses.filter(c => c.selected).map(c => c.offering_id));

  renderCourseList();
  renderMiscFees();
  renderBillingSummary();
}

// (renderCourseList, renderMiscFees, renderBillingSummary, renderReviewList,
//  setEnrollStep, confirmEnrollment — ALL PRESERVED EXACTLY)

// ── Schedule Conflict Detection ────────────────────────────────────
// Parses schedule strings like "MWF 8:00-9:30" or "TTh 10:00-11:30"
// Returns { days: ['M','W','F'], startMin: 480, endMin: 570 } or null
function parseSchedule(scheduleStr) {
  if (!scheduleStr) return null;
  const s = scheduleStr.trim().toUpperCase();
  // Match day pattern + time range
  const match = s.match(/^([A-Z]{1,4})\s+(\d{1,2}):(\d{2})\s*[-–]\s*(\d{1,2}):(\d{2})/);
  if (!match) return null;
  const dayStr = match[1];
  const startH = parseInt(match[2], 10);
  const startM = parseInt(match[3], 10);
  const endH = parseInt(match[4], 10);
  const endM = parseInt(match[5], 10);
  // Expand day codes
  let days = [];
  for (const ch of dayStr) {
    if (ch === 'T' && dayStr.indexOf('T') !== dayStr.lastIndexOf('T')) {
      // Handle TTh — skip second T, handled below
      continue;
    }
    days.push(ch);
  }
  // Handle TTh pattern
  if (dayStr.includes('TT') || dayStr === 'TTH') {
    days = ['T', 'TH'];
  }
  const startMin = startH * 60 + startM;
  const endMin = endH * 60 + endM;
  return { days, startMin, endMin };
}

function schedulesConflict(a, b) {
  if (!a || !b) return false;
  // Check for overlapping days
  const sharedDays = a.days.some(d => b.days.includes(d));
  if (!sharedDays) return false;
  // Check for time overlap
  return a.startMin < b.endMin && b.startMin < a.endMin;
}

function checkScheduleConflict(courseId) {
  const newCourse = state.courses.find(c => c.offering_id === courseId);
  if (!newCourse) return null;
  const newSched = parseSchedule(newCourse.schedule);
  if (!newSched) return null; // Can't parse, allow it
  for (const id of state.selectedOfferingIds) {
    if (id === courseId) continue;
    const existing = state.courses.find(c => c.offering_id === id);
    if (!existing) continue;
    const existingSched = parseSchedule(existing.schedule);
    if (schedulesConflict(newSched, existingSched)) {
      return existing; // Return the conflicting course
    }
  }
  return null;
}

function renderCourseList() {
  document.getElementById('courseList').innerHTML = state.courses.map(c => {
    const checked = state.selectedOfferingIds.has(c.offering_id);
    return `
    <div class="course-row ${checked ? 'checked' : ''}" data-id="${c.offering_id}">
      <div class="chk">${checked ? '✓' : ''}</div>
      <div>
        <div class="code">${c.code}</div>
        <div class="title">${c.title}</div>
        <div class="meta">${c.instructor_name || 'TBA'} · ${c.schedule || 'Schedule TBA'}</div>
      </div>
      <div class="fee">
        <div class="units">${c.units} units</div>
        <div class="amt">${peso(c.fee)}</div>
      </div>
    </div>`;
  }).join('');
  document.querySelectorAll('.course-row').forEach(row => {
    row.addEventListener('click', () => {
      const id = Number(row.dataset.id);
      if (state.selectedOfferingIds.has(id)) {
        state.selectedOfferingIds.delete(id);
        renderCourseList();
        renderBillingSummary();
      } else {
        // Gap 1: Schedule conflict detection
        const conflict = checkScheduleConflict(id);
        if (conflict) {
          const newCourse = state.courses.find(c => c.offering_id === id);
          showToast(`⚠ Schedule conflict: ${newCourse.code} overlaps with ${conflict.code} (${conflict.schedule})`, true);
          return; // Block selection
        }
        state.selectedOfferingIds.add(id);
        renderCourseList();
        renderBillingSummary();
      }
    });
  });
}

function renderMiscFees() {
  document.getElementById('miscFeeLines').innerHTML = state.miscFees
    .map(f => `<div class="fee-line"><span>${f.name}</span><b>${peso(f.amount)}</b></div>`)
    .join('');
}

function miscTotal() {
  return state.miscFees.reduce((s, f) => s + Number(f.amount), 0);
}

function renderBillingSummary() {
  const selected = state.courses.filter(c => state.selectedOfferingIds.has(c.offering_id));
  document.getElementById('tuitionLines').innerHTML = selected.length
    ? selected.map(c => `<div class="fee-line"><span>${c.code}</span><b>${peso(c.fee)}</b></div>`).join('')
    : `<div class="fee-line" style="color:var(--ink-300);">No subjects selected yet</div>`;
  const tuitionSum = selected.reduce((s, c) => s + Number(c.fee), 0);
  const total = tuitionSum + miscTotal();
  document.getElementById('feeTotal').textContent = peso(total);
  const units = selected.reduce((s, c) => s + Number(c.units), 0);
  document.getElementById('feeSub').textContent = `${units} units · ${selected.length} subject${selected.length === 1 ? '' : 's'}`;
  document.getElementById('proceedBtn').disabled = selected.length === 0;
}

function renderReviewList() {
  const selected = state.courses.filter(c => state.selectedOfferingIds.has(c.offering_id));
  const tuitionSum = selected.reduce((s, c) => s + Number(c.fee), 0);
  document.getElementById('reviewCourseList').innerHTML = selected.map(c => `
    <div class="course-row checked" style="cursor:default;">
      <div class="chk">✓</div>
      <div><div class="code">${c.code}</div><div class="title">${c.title}</div><div class="meta">${c.instructor_name || 'TBA'} · ${c.schedule || 'Schedule TBA'}</div></div>
      <div class="fee"><div class="units">${c.units} units</div><div class="amt">${peso(c.fee)}</div></div>
    </div>`).join('') + `
    <div style="display:flex;justify-content:space-between;padding:14px 16px;background:var(--pink-50);border-radius:12px;margin-top:8px;">
      <b>Total Amount Due</b><b style="color:var(--pink-600);">${peso(tuitionSum + miscTotal())}</b>
    </div>
    <button class="btn btn-primary" id="confirmEnrollBtn" style="width:100%;justify-content:center;margin-top:16px;">Confirm Enrollment →</button>`;
  document.getElementById('confirmEnrollBtn').addEventListener('click', confirmEnrollment);
}

function setEnrollStep(step) {
  state.enrollStep = step;
  document.getElementById('enrollStep1').style.display = step === 1 ? 'block' : 'none';
  document.getElementById('enrollStep2').style.display = step === 2 ? 'block' : 'none';
  document.getElementById('enrollStep3').style.display = step === 3 ? 'block' : 'none';
  [1, 2, 3].forEach(n => {
    const tab = document.getElementById('stepTab' + n);
    tab.classList.toggle('active', n === step);
    tab.classList.toggle('done', n < step);
  });
  if (step === 2) renderReviewList();
}
document.getElementById('proceedBtn').addEventListener('click', () => setEnrollStep(2));
document.getElementById('backToStep1').addEventListener('click', () => setEnrollStep(1));

async function confirmEnrollment() {
  const profile = state.studentProfile;
  const btn = document.getElementById('confirmEnrollBtn');
  btn.disabled = true;
  btn.textContent = 'Submitting…';
  try {
    const inserts = [...state.selectedOfferingIds].map(oid => ({
      student_id: profile.id,
      offering_id: oid,
      status: 'enrolled',
    }));
    const { error } = await supabase.from('enrollments').insert(inserts);
    if (error) throw error;

    setEnrollStep(3);
    showToast('Enrollment confirmed successfully');
    await Promise.all([loadDashboard(), loadEnrollment()]);
  } catch (err) {
    showToast('Could not confirm enrollment: ' + err.message, true);
    btn.disabled = false;
    btn.textContent = 'Confirm Enrollment →';
  }
}

// ── Billing ───────────────────────────────────────────────────────────
async function loadBilling() {
  const profile = state.studentProfile;
  if (!profile) return;

  const { data: summary } = await supabase
    .from('billing_summary')
    .select('*')
    .eq('student_id', profile.id)
    .single();

  const { data: txns } = await supabase
    .from('transactions')
    .select('*')
    .eq('student_id', profile.id)
    .order('txn_date', { ascending: false });

  const { data: inst } = await supabase
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
  document.getElementById('bill-totalpaid').textContent = peso(state.billing.totalPaid);
  document.getElementById('bill-balance').textContent = peso(pending.reduce((s, i) => s + Number(i.amount), 0));
  const next = pending[0];
  document.getElementById('bill-nextdate').textContent = next ? fmtDate(next.due_date).split(',')[0] : '—';
  document.getElementById('bill-nextlabel').textContent = next ? next.name.toLowerCase() : 'nothing due';
}

function renderTxns() {
  document.getElementById('txnBody').innerHTML = state.billing.transactions.map(t => `
    <tr>
      <td class="or-num">${t.or_number}</td>
      <td>${fmtDate(t.txn_date)}</td>
      <td>${t.description}</td>
      <td><span class="chan">${t.channel}</span></td>
      <td class="amt-green">${peso(t.amount)}</td>
      <td><button class="mini-btn">View</button></td>
    </tr>`).join('');
}

function renderInstallments() {
  document.getElementById('instList').innerHTML = state.billing.installments.map(i => `
    <div class="inst-row">
      <div><div class="n">${i.name}</div><div class="dt">${fmtDate(i.due_date)}</div></div>
      <div style="text-align:right;">
        <div class="${i.status === 'paid' ? 'amt-strike' : 'amt-pink'}">${peso(i.amount)}</div>
        <div style="font-size:10.5px;font-weight:800;color:${i.status === 'paid' ? 'var(--green)' : 'var(--red)'};">${i.status === 'paid' ? '✓ PAID' : 'PENDING'}</div>
      </div>
    </div>`).join('');
}

function renderUpay() {
  const pending = state.billing.installments.filter(i => i.status === 'pending');
  document.getElementById('upayList').innerHTML = pending.length ? pending.map(i => `
    <div class="upay due">
      <div class="upay-top"><span class="t">${i.name}</span><span class="pill pill-urgent">DUE SOON</span></div>
      <div class="amt" style="color:var(--pink-600);">${peso(i.amount)}</div>
      <div class="due-date">Due: ${fmtDate(i.due_date)}</div>
      <button class="btn btn-primary" style="width:100%;justify-content:center;margin-top:10px;" onclick="payInstallment(${i.id})">Pay Now</button>
    </div>`).join('') : `
    <div class="upay" style="text-align:center;color:var(--green);font-weight:700;">✓ All balances settled</div>`;
}

async function payInstallment(id) {
  try {
    const { data, error } = await supabase
      .from('installments')
      .update({ status: 'paid', paid_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;

    showToast(`Payment received — OR ${data.or_number || 'N/A'}`);
    await Promise.all([loadBilling(), loadDashboard(), loadClearance()]);
  } catch (err) {
    showToast('Payment failed: ' + err.message, true);
  }
}

document.getElementById('exportBtn').addEventListener('click', () => {
  // Generate CSV client-side from state
  const csv = [
    ['OR NUMBER', 'DATE', 'DESCRIPTION', 'CHANNEL', 'AMOUNT'],
    ...state.billing.transactions.map(t => [t.or_number, t.txn_date, t.description, t.channel, t.amount])
  ].map(r => r.join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank');
});

// ── Grades ────────────────────────────────────────────────────────────
async function loadGrades() {
  const profile = state.studentProfile;
  if (!profile) return;

  const { data: rows } = await supabase
    .from('grades')
    .select('*, course_offerings(code, title, units, instructor_name)')
    .eq('student_id', profile.id);

  state.grades = (rows || []).map(g => ({
    code: g.course_offerings?.code || '—',
    title: g.course_offerings?.title || '—',
    instructor_name: g.course_offerings?.instructor_name,
    units: g.course_offerings?.units,
    midterm: g.midterm,
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
  // Compute from live grade data
  const withFinal = state.grades.filter(g => g.final !== null && g.final !== undefined);
  const avg = withFinal.length ? (withFinal.reduce((s, g) => s + Number(g.equivalent || 0), 0) / withFinal.length).toFixed(2) : '—';
  const highest = withFinal.length ? Math.max(...withFinal.map(g => Number(g.final))) : '—';
  const highestCourse = withFinal.find(g => Number(g.final) === highest);
  const completed = withFinal.length;
  const total = state.grades.length;

  const setText = (id, txt) => { const el = document.getElementById(id); if (el) el.textContent = txt; };

  setText('grade-gwa', avg);
  setText('grade-gwa-sub', `${completed} subject${completed === 1 ? '' : 's'} with final grades`);
  setText('grade-highest', highest);
  setText('grade-highest-course', highestCourse ? `${highestCourse.code} — Final` : '—');

  // AI Predicted GWA: average of ai_predicted_equivalent across graded courses.
  const withAi = state.grades.filter(g => g.ai_predicted_equivalent !== null && g.ai_predicted_equivalent !== undefined);
  const aiAvg = withAi.length ? (withAi.reduce((s, g) => s + Number(g.ai_predicted_equivalent), 0) / withAi.length).toFixed(2) : '—';
  setText('grade-ai', aiAvg);

  setText('grade-completed', `${completed}/${total}`);
}

function renderGrades() {
  document.getElementById('gradesBody').innerHTML = state.grades.map(g => `
    <tr>
      <td class="or-num">${g.code}</td>
      <td>${g.title}</td>
      <td style="color:var(--ink-500);">${g.instructor_name || 'TBA'}</td>
      <td>${g.units}</td>
      <td style="color:var(--blue);font-weight:700;">${g.midterm ?? '—'}</td>
      <td style="${g.final ? 'color:var(--green);font-weight:700;' : 'font-style:italic;color:var(--ink-300);'}">${g.final ?? 'Pending'}</td>
      <td style="font-weight:800;">${g.equivalent ?? '–'}</td>
      <td><span class="pred-chip">~ ${g.ai_predicted_grade ?? '–'} <small>(${g.ai_predicted_equivalent ?? '–'})</small></span></td>
      <td><span class="badge ${g.remark === 'Passed' ? 'badge-green' : 'badge-blue'}">${g.remark}</span></td>
    </tr>`).join('');
}

// Hydrate the Grades card header (term / program / section) and the AI insight
// paragraph — replaces the hardcoded "2nd Semester, AY 2025–2026 — BSIT 2nd Year ·
// Section 2-A" and the static AI insight text.
function renderGradesHeader() {
  const d = state.dashboard;
  if (!d) return;
  const setTitle = document.getElementById('gradesTitle');
  if (setTitle) {
    setTitle.innerHTML = `Grades — ${d.student.semester}, ${d.student.schoolYear}<br><span
      style="font-weight:500;font-size:12px;color:var(--ink-500);" id="gradesSubtitle">${d.student.program || '—'} ${d.student.yearLevel || ''}${d.student.section ? ' · Section ' + d.student.section : ''}</span>`;
  }
  const termPill = document.getElementById('gradesTermPill');
  if (termPill) {
    termPill.textContent = `${d.student.semester} ${d.student.schoolYear}`;
  }

  // AI insight: dynamic copy based on predicted GWA vs current GWA.
  const aiEl = document.getElementById('aiInsightText');
  if (aiEl) {
    const withFinal = state.grades.filter(g => g.final !== null && g.final !== undefined);
    const curAvg = withFinal.length ? (withFinal.reduce((s, g) => s + Number(g.equivalent || 0), 0) / withFinal.length) : null;
    const withAi = state.grades.filter(g => g.ai_predicted_equivalent !== null && g.ai_predicted_equivalent !== undefined);
    const aiAvg = withAi.length ? (withAi.reduce((s, g) => s + Number(g.ai_predicted_equivalent), 0) / withAi.length) : null;

    if (curAvg !== null && aiAvg !== null) {
      const track = aiAvg <= 1.75 ? "Dean's List" : aiAvg <= 2.5 ? 'Good Standing' : 'At Risk';
      const weakest = withAi.reduce((min, g) => Number(g.ai_predicted_equivalent) < Number(min.ai_predicted_equivalent) ? g : min, withAi[0]);
      const weakTxt = weakest ? ` Focus on ${weakest.code} (${weakest.title}) where your trajectory shows the most room for improvement.` : '';
      aiEl.innerHTML = `Based on your midterm performance, our AI model predicts a final GWA of <b>${aiAvg.toFixed(2)}</b> — placing you on the <b>${track}</b> track.${weakTxt}`;
    } else {
      aiEl.textContent = 'AI predictions will appear here once midterm grades and prediction data are available.';
    }
  }
}

// ── Prospectus (preserved) ────────────────────────────────────────────
function setupProspectusButton() {
  const prospectusBtn = document.getElementById('prospectusBtn');
  if (prospectusBtn) {
    prospectusBtn.removeEventListener('click', viewProspectus);
    prospectusBtn.addEventListener('click', viewProspectus);
  }
}

async function viewProspectus() {
  const profile = state.studentProfile;
  try {
    const { data: courses } = await supabase
      .from('course_offerings')
      .select('*')
      .eq('program', profile.program)
      .order('year', { ascending: true })
      .order('semester', { ascending: true });

    const { data: completed } = await supabase
      .from('enrollments')
      .select('offering_id, grades(final)')
      .eq('student_id', profile.id)
      .eq('status', 'enrolled');

    const completedIds = new Set((completed || []).map(e => e.offering_id));
    const totalUnits = (courses || []).reduce((s, c) => s + Number(c.units), 0);
    const unitsCompleted = (courses || []).filter(c => completedIds.has(c.id)).reduce((s, c) => s + Number(c.units), 0);
    const pct = totalUnits ? Math.round((unitsCompleted / totalUnits) * 100) : 0;

    // Group by semester
    const bySem = {};
    (courses || []).forEach(c => {
      const key = `${c.year}-${c.semester}`;
      if (!bySem[key]) bySem[key] = { year: c.year, semester: c.semester, semesterLabel: `${c.year}nd Year - ${c.semester} Sem`, courses: [] };
      bySem[key].courses.push({
        code: c.code,
        title: c.title,
        units: c.units,
        isMajor: c.is_major,
        completed: completedIds.has(c.id),
        grade: completed?.find(e => e.offering_id === c.id)?.grades?.final,
      });
    });

    showProspectusModal({
      program: profile.program,
      totalUnits,
      unitsCompleted,
      completionPercentage: pct,
      bySemester: Object.values(bySem),
    });
  } catch (err) {
    showToast('Could not load degree prospectus: ' + err.message, true);
    console.error(err);
  }
}

function showProspectusModal(data) {
  const modal = document.createElement('div');
  modal.className = 'prospectus-modal';
  modal.innerHTML = `
    <div class="prospectus-overlay" onclick="this.parentElement.remove()"></div>
    <div class="prospectus-content">
      <div class="prospectus-header">
        <h2>Degree Prospectus</h2>
        <p>${data.program || 'BSIT'} — Total ${data.totalUnits || 162} Units</p>
        <button class="prospectus-close" onclick="this.closest('.prospectus-modal').remove()">×</button>
      </div>
      <div class="prospectus-body">
        <div class="prospectus-progress">
          <div class="progress-bar"><div class="progress-fill" style="width: ${data.completionPercentage || 0}%"></div></div>
          <div class="progress-text">Overall Curriculum Completion: ${data.completionPercentage || 0}% (${data.unitsCompleted || 0} / ${data.totalUnits || 162} units)</div>
        </div>
        <div class="prospectus-courses">
          ${(data.bySemester || []).length > 0 ? data.bySemester.map(sem => {
    const yOrd = sem.year === 1 ? '1st' : sem.year === 2 ? '2nd' : sem.year === 3 ? '3rd' : `${sem.year}th`;
    const sOrd = sem.semester === 1 ? '1st' : sem.semester === 2 ? '2nd' : `${sem.semester}th`;
    const label = sem.semesterLabel || `${yOrd} Year - ${sOrd} Sem`;
    return `
            <div class="semester-block">
              <div class="semester-title">${label}</div>
              <div class="course-list">
                ${(sem.courses || []).map(c => `
                  <div class="prospectus-course ${c.isMajor ? 'is-major' : ''}" data-status="${c.completed ? 'completed' : 'pending'}">
                    <div class="course-status">${c.completed ? '✓' : '○'}</div>
                    <div class="course-info">
                      <div class="code-line">
                        <span class="code">${c.code}</span>
                        ${c.isMajor ? '<span class="major-badge">⭐ MAJOR</span>' : ''}
                      </div>
                      <div class="title">${c.title}</div>
                      <div class="meta">${c.units} units${c.completed ? ` · Grade: <strong>${c.grade}</strong>` : ''}</div>
                    </div>
                    <div class="units">${c.units} units</div>
                  </div>
                `).join('')}
              </div>
            </div>
            `;
  }).join('') : '<div style="text-align:center;padding:40px;color:var(--ink-500);">No courses loaded yet</div>'}
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  modal.style.display = 'flex';
}

// ── Clearance ─────────────────────────────────────────────────────────
const statusMeta = {
  cleared: { label: 'Cleared', badge: 'badge-green', dotColor: 'var(--green)', card: 'st-cleared' },
  pending: { label: 'Pending', badge: 'badge-amber', dotColor: 'var(--amber)', card: 'st-pending' },
  action_required: { label: 'Action Required', badge: 'badge-red', dotColor: 'var(--red)', card: 'st-action' },
};

async function loadClearance() {
  const profile = state.studentProfile;
  if (!profile) return;
  const { data: rows } = await supabase
    .from('clearances')
    .select('*')
    .eq('student_id', profile.id);

  state.departments = rows || [];
  renderClearance();
}

function renderClearance() {
  if (!state.departments || state.departments.length === 0) {
    document.getElementById('deptGrid').innerHTML = '<div style="grid-column:1/-1;text-align:center;color:var(--ink-300);padding:20px;">No clearance records found.</div>';
    return;
  }

  const cleared = state.departments.filter(d => d.status === 'cleared').length;
  const totalDepts = state.departments.length || 1;
  document.getElementById('clearFrac').textContent = `${cleared}/${totalDepts} Cleared`;
  document.getElementById('clearFill').style.width = (cleared / totalDepts * 100) + '%';
  const remaining = totalDepts - cleared;
  document.getElementById('clearRemaining').textContent = remaining === 0 ? 'All departments cleared. You are good to go!' : `${remaining} department(s) remaining.`;

  document.getElementById('deptGrid').innerHTML = state.departments.map(d => {
    const m = statusMeta[d.status] || statusMeta.pending;
    let actionBtn = '';
    if (d.department_code === 'cashier' && d.status === 'action_required') {
      actionBtn = `<button class="mini-btn" onclick="goto('billing')" style="margin-top:8px;">Pay Balance →</button>`;
    }
    if (state.adminView && d.status !== 'cleared' && d.department_code !== 'dean') {
      actionBtn += ` <button class="mini-btn" style="margin-top:8px;background:var(--pink-600);color:#fff;border-color:var(--pink-600);" onclick="adminClear('${d.department_code}')">Mark as Cleared (Admin)</button>`;
    }
    return `
    <div class="dept-card ${m.card}">
      <div class="dept-top">
        <div style="display:flex;gap:10px;align-items:center;">
          <div class="dept-icon">${d.icon || '📄'}</div>
          <div><div class="dept-name">${d.department_name}</div><div class="dept-officer">${d.officer_name || ''}</div></div>
        </div>
        <span class="badge ${m.badge}">${m.label}</span>
      </div>
      <div class="dept-note">${d.note || ''}</div>
      <div class="dept-status"><span class="sdot" style="background:${m.dotColor};"></span>${d.status === 'cleared' ? 'Digitally Signed & Cleared' : (d.status === 'action_required' ? 'Student Action Required' : 'Awaiting Review')}</div>
      ${actionBtn}
    </div>`;
  }).join('');
}

async function adminClear(code) {
  const profile = state.studentProfile;
  try {
    const { error } = await supabase
      .from('clearances')
      .update({ status: 'cleared' })
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

document.getElementById('adminToggle').addEventListener('click', () => {
  state.adminView = !state.adminView;
  renderClearance();
  showToast(state.adminView ? 'Admin view enabled — you can now simulate approvals' : 'Admin view disabled');
});

// ── FAQ Chatbot (Supabase-powered) ────────────────────────────────────
const chatState = { open: false, history: [], sending: false };

const chatFab = document.getElementById('chatFab');
const chatPanel = document.getElementById('chatPanel');
const chatClose = document.getElementById('chatClose');
const chatMessages = document.getElementById('chatMessages');
const chatInput = document.getElementById('chatInput');
const chatSend = document.getElementById('chatSend');

function toggleChat(open) {
  chatState.open = open ?? !chatState.open;
  chatPanel.classList.toggle('open', chatState.open);
  if (chatState.open) chatInput.focus();
}
chatFab.addEventListener('click', () => toggleChat());
chatClose.addEventListener('click', () => toggleChat(false));

function formatMessageText(str) {
  if (!str) return '';
  let escaped = escapeHtml(str);
  escaped = escaped.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  escaped = escaped.replace(/\n/g, '<br>');
  return escaped;
}

function appendChatMessage(role, text, sources) {
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

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function showTypingIndicator() {
  const row = document.createElement('div');
  row.className = 'chat-msg bot';
  row.id = 'chatTyping';
  row.innerHTML = `<div class="chat-bubble"><div class="chat-typing"><span></span><span></span><span></span></div></div>`;
  chatMessages.appendChild(row);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function removeTypingIndicator() {
  const el = document.getElementById('chatTyping');
  if (el) el.remove();
}

async function sendChatMessage() {
  const text = chatInput.value.trim();
  if (!text || chatState.sending) return;

  appendChatMessage('user', text);
  chatInput.value = '';
  chatState.sending = true;
  chatSend.disabled = true;
  showTypingIndicator();

  try {
    // Option A: Call a Supabase Edge Function
    const { data, error } = await supabase.functions.invoke('faq-assistant', {
      body: { message: text, history: chatState.history },
    });

    if (error) throw error;

    removeTypingIndicator();
    appendChatMessage('bot', data.answer, data.sources);
    chatState.history.push({ role: 'user', content: text }, { role: 'assistant', content: data.answer });
    chatState.history = chatState.history.slice(-6);
  } catch (err) {
    // Option B: Fallback to simple keyword match if edge function unavailable
    removeTypingIndicator();
    const fallback = getLocalFaqAnswer(text);
    appendChatMessage('bot', fallback.text, fallback.sources);
  } finally {
    chatState.sending = false;
    chatSend.disabled = false;
  }
}

// Local FAQ fallback (zero external dependency)
function getLocalFaqAnswer(q) {
  const lower = q.toLowerCase();
  if (lower.includes('enroll')) return { text: 'Enrollment is open until the deadline shown in your dashboard. Settle balances first, then select courses under the Enrollment tab.', sources: [{ category: 'Enrollment' }] };
  if (lower.includes('balance') || lower.includes('pay')) return { text: 'You can view your balance under Billing & History. Click Pay Now on any pending installment.', sources: [{ category: 'Billing' }] };
  if (lower.includes('grade')) return { text: 'Grades are posted under Grades & Evaluation. AI predictions are estimates based on midterm performance.', sources: [{ category: 'Grades' }] };
  if (lower.includes('clearance')) return { text: 'Clearance requires all departments to mark you as cleared. Pay any balances and complete required interviews.', sources: [{ category: 'Clearance' }] };
  return { text: 'I can help with enrollment, billing, grades, and clearance. For specific concerns, email registrar@imcc.edu.ph.', sources: [] };
}

chatSend.addEventListener('click', sendChatMessage);
chatInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') sendChatMessage(); });

// ── MFA (Supabase Auth + TOTP) ────────────────────────────────────────
let currentMfaSecret = null;
const mfaSetupBtn = document.getElementById('mfaSetupBtn');
const mfaModal = document.getElementById('mfaModal');
const mfaCloseBtn = document.getElementById('mfaCloseBtn');
const mfaConfirmBtn = document.getElementById('mfaConfirmBtn');
const mfaQrImg = document.getElementById('mfaQrImg');
const mfaSecretText = document.getElementById('mfaSecretText');
const mfaCodeInput = document.getElementById('mfaCodeInput');

if (mfaSetupBtn) {
  mfaSetupBtn.addEventListener('click', async (e) => {
    e.preventDefault();
    const profile = state.studentProfile;
    if (!profile) {
      showToast('Please log in again to set up MFA.', true);
      return;
    }
    try {
      // Invoke edge function for TOTP enrollment
      const { data, error } = await supabase.functions.invoke('mfa-enroll', {
        body: { user_id: profile.id },
      });
      if (error) throw error;
      if (data.success && data.needsEnrollment) {
        currentMfaSecret = data.secret;
        mfaQrImg.src = data.qrUrl;
        mfaSecretText.textContent = `Secret: ${data.secret}`;
        mfaCodeInput.value = '';
        mfaModal.style.display = 'flex';
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
    const code = mfaCodeInput.value.trim();
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
      const { data, error } = await supabase.functions.invoke('mfa-verify', {
        body: { user_id: profile.id, secret: currentMfaSecret, code },
      });
      if (error) throw error;
      if (data.success) {
        showToast('MFA Google Authenticator enabled successfully!');
        if (mfaModal) mfaModal.style.display = 'none';
      }
    } catch (err) {
      showToast('MFA verification failed: ' + err.message, true);
    }
  });
}

// ── Sign-out (Supabase Auth) ─────────────────────────────────────────
document.getElementById('signOutBtn').addEventListener('click', async () => {
  try {
    await supabase.auth.signOut();
  } catch (e) {
    console.warn('signOut error', e);
  }
  window.location.href = 'login.html';
});

// ── SSO Navigation Links ─────────────────────────────────────────────
async function loadSSOLinks() {
  const { data: links } = await supabase.from('sso_links').select('*').eq('is_active', true).order('sort_order');
  const nav = document.getElementById('ssoLinksNav');
  if (!nav) return;
  const role = state.studentProfile?.role || 'student';
  const visible = (links || []).filter(l => l.roles.split(',').map(r => r.trim()).includes(role));
  nav.innerHTML = visible.map(l => `
    <a href="${l.url}" target="_blank" class="nav-item" style="text-decoration:none;">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:17px;height:17px;"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></svg>
      ${l.label}
    </a>`).join('') || '<div class="nav-item soon" style="opacity:.4;">No links configured</div>';
}

// ── Attendance ────────────────────────────────────────────────────────
async function loadAttendance() {
  const profile = state.studentProfile;
  if (!profile) return;
  const { data: records } = await supabase
    .from('attendance')
    .select('*, course_offerings(code, title)')
    .eq('student_id', profile.id)
    .order('date', { ascending: false });

  const stats = { present: 0, absent: 0, late: 0, excused: 0 };
  (records || []).forEach(r => { if (stats[r.status] !== undefined) stats[r.status]++; });
  const total = (records || []).length;

  const val = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  val('att-total', total);
  val('att-present', stats.present);
  val('att-late', stats.late);
  val('att-absent', stats.absent);

  const badgeClass = { present: 'badge-green', absent: 'badge-red', late: 'badge-amber', excused: 'badge-blue' };
  document.getElementById('attBody').innerHTML = (records || []).length
    ? records.map(r => `<tr>
        <td>${fmtDate(r.date)}</td>
        <td><strong>${r.course_offerings?.code || '—'}</strong> ${r.course_offerings?.title || ''}</td>
        <td><span class="badge ${badgeClass[r.status] || 'badge-amber'}">${r.status.toUpperCase()}</span></td>
        <td style="font-size:12px;color:var(--ink-500);">${r.notes || '—'}</td>
      </tr>`).join('')
    : '<tr><td colspan="4" style="text-align:center;color:var(--ink-300);padding:20px;">No attendance records found.</td></tr>';
}

// ── Faculty Evaluation (Anonymous) ──────────────────────────────────
async function loadFacultyEval() {
  const profile = state.studentProfile;
  if (!profile) return;

  // Get current term
  const { data: currentSem } = await supabase
    .from('student_semesters')
    .select('school_year, semester')
    .eq('student_id', profile.id)
    .eq('is_current', true)
    .single();

  const sy = currentSem?.school_year || '2025–2026';
  const sem = currentSem?.semester || '2nd Semester';
  const termPill = document.getElementById('evalTermPill');
  if (termPill) termPill.textContent = `${sem} ${sy}`;

  // Get courses the student is enrolled in this term with instructor info
  const { data: enrollments } = await supabase
    .from('enrollments')
    .select('offering_id, course_offerings(id, code, title, instructor_name)')
    .eq('student_id', profile.id)
    .eq('status', 'enrolled');

  if (!enrollments || enrollments.length === 0) {
    document.getElementById('evalStatus').innerHTML = 'No enrolled courses found for this semester. Please enroll first before evaluating faculty.';
    return;
  }

  // Group by instructor (some instructors may teach multiple courses)
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
    document.getElementById('evalStatus').innerHTML = 'No instructor information available for your enrolled courses.';
    return;
  }

  // Check which instructors the student has already evaluated this term
  const { data: existing } = await supabase
    .from('faculty_evaluations')
    .select('instructor_name')
    .eq('student_id', profile.id)
    .eq('school_year', sy)
    .eq('semester', sem);

  const evaluatedNames = new Set((existing || []).map(e => e.instructor_name));
  document.getElementById('evalStatus').style.display = 'none';

  const evalQuestions = [
    { key: 'teaching_clarity', label: 'The instructor explains concepts clearly and understandably.' },
    { key: 'knowledge', label: 'The instructor demonstrates deep knowledge of the subject matter.' },
    { key: 'availability', label: 'The instructor is approachable and available for consultation.' },
    { key: 'fairness', label: 'Grading and assessments are fair and transparent.' },
    { key: 'punctuality', label: 'The instructor starts and ends classes on time.' },
  ];

  document.getElementById('evalList').innerHTML = instructors.map(inst => {
    const submitted = evaluatedNames.has(inst.name);
    const courseList = inst.courses.map(c => `${c.code} — ${c.title}`).join(', ');
    return `
    <div class="card card-pad" style="margin-bottom:16px;border:1px solid var(--line);${submitted ? 'opacity:0.6;' : ''}">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:12px;">
        <div>
          <div style="font-weight:800;font-size:15px;">${inst.name}</div>
          <div style="font-size:12px;color:var(--ink-500);">${courseList}</div>
        </div>
        ${submitted ? '<span class="badge badge-green">✓ Submitted</span>' : '<span class="badge badge-amber">Pending</span>'}
      </div>
      ${submitted ? '' : `
      <div class="eval-form" data-instructor="${inst.name.replace(/"/g, '&quot;')}">
        ${evalQuestions.map((q, i) => `
          <div class="eval-question">
            <div class="eval-q-label">${q.label}</div>
            <div class="eval-stars" data-key="${q.key}">
              ${[1, 2, 3, 4, 5].map(n => `<span class="eval-star" data-val="${n}" style="font-size:22px;cursor:pointer;color:var(--ink-300);transition:color 0.15s;">★</span>`).join('')}
            </div>
          </div>
        `).join('')}
        <div class="field" style="margin-top:12px;">
          <label style="font-size:12px;font-weight:600;color:var(--ink-700);">Additional Comments (optional)</label>
          <textarea class="eval-comment" style="width:100%;padding:10px 14px;border:1.5px solid var(--line);border-radius:10px;font-size:13px;min-height:70px;resize:vertical;font-family:inherit;" placeholder="Share specific feedback..."></textarea>
        </div>
        <button class="btn btn-primary eval-submit-btn" style="width:100%;justify-content:center;margin-top:12px;" data-instructor="${inst.name.replace(/"/g, '&quot;')}">Submit Anonymous Evaluation</button>
      </div>
      `}
    </div>`;
  }).join('');

  // Attach star rating + submit handlers
  document.querySelectorAll('.eval-stars').forEach(starGroup => {
    const stars = starGroup.querySelectorAll('.eval-star');
    stars.forEach(star => {
      star.addEventListener('click', () => {
        const val = parseInt(star.dataset.val, 10);
        stars.forEach((s, i) => {
          s.style.color = i < val ? 'var(--pink-500)' : 'var(--ink-300)';
        });
        starGroup.dataset.selected = val;
      });
    });
  });

  document.querySelectorAll('.eval-submit-btn').forEach(btn => {
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

      const comment = form.querySelector('.eval-comment').value.trim();
      btn.disabled = true;
      btn.textContent = 'Submitting…';

      try {
        const { error } = await supabase.from('faculty_evaluations').insert({
          student_id: profile.id,
          instructor_name: instructorName,
          school_year: sy,
          semester: sem,
          teaching_clarity: ratings.teaching_clarity,
          knowledge: ratings.knowledge,
          availability: ratings.availability,
          fairness: ratings.fairness,
          punctuality: ratings.punctuality,
          comment: comment || null,
        });
        if (error) throw error;

        showToast('Evaluation submitted anonymously. Thank you!');
        await loadFacultyEval(); // Refresh to show ✓ Submitted state
      } catch (err) {
        showToast('Error submitting evaluation: ' + err.message, true);
        btn.disabled = false;
        btn.textContent = 'Submit Anonymous Evaluation';
      }
    });
  });
}

// ── Profile Management ───────────────────────────────────────────────
async function loadProfile() {
  const p = state.studentProfile;
  if (!p) return;
  const val = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v || '—'; };
  val('profileName', p.full_name);
  val('profileEmail', p.email);
  val('profileStudentNo', p.student_no);
  val('profileProgram', p.program);
  val('profileYear', p.year_level);
  val('profileSection', p.section);
  val('profilePhone', p.phone);
  val('profileAddress', p.address);
  const avatar = document.getElementById('profileAvatar');
  if (avatar) {
    if (p.avatar_url) { avatar.innerHTML = `<img src="${p.avatar_url}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">`; }
    else { avatar.textContent = getInitials(p.full_name); }
  }
  const editPhone = document.getElementById('editPhone');
  const editAddress = document.getElementById('editAddress');
  const editAvatar = document.getElementById('editAvatar');
  if (editPhone) editPhone.value = p.phone || '';
  if (editAddress) editAddress.value = p.address || '';
  if (editAvatar) editAvatar.value = p.avatar_url || '';
}

document.getElementById('saveProfileBtn')?.addEventListener('click', async () => {
  const profile = state.studentProfile;
  if (!profile) return;
  try {
    const { error } = await supabase.from('profiles').update({
      phone: document.getElementById('editPhone').value.trim() || null,
      address: document.getElementById('editAddress').value.trim() || null,
      avatar_url: document.getElementById('editAvatar').value.trim() || null,
    }).eq('id', profile.id);
    if (error) throw error;
    state.studentProfile.phone = document.getElementById('editPhone').value.trim() || null;
    state.studentProfile.address = document.getElementById('editAddress').value.trim() || null;
    state.studentProfile.avatar_url = document.getElementById('editAvatar').value.trim() || null;
    showToast('Profile updated successfully');
    loadProfile();
  } catch (err) {
    showToast('Error updating profile: ' + err.message, true);
  }
});

document.getElementById('changePassBtn')?.addEventListener('click', async () => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.auth.resetPasswordForEmail(user.email);
    if (error) throw error;
    showToast('Password reset email sent to ' + user.email);
  } catch (err) {
    showToast('Error: ' + err.message, true);
  }
});

// ── Init ──────────────────────────────────────────────────────────────
async function init() {
  const profile = await getCurrentStudent();
  if (!profile) return;

  state.apiOnline = true;
  try {
    await Promise.all([
      loadDashboard(),
      loadEnrollment(),
      loadBilling(),
      loadGrades(),
      loadClearance(),
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
    console.error(err);
  }
}
// Wait for shared supabase-config.js to finish, then init
(function waitForSupabase() {
  if (window.__myimcc_supabase_client__) {
    supabase = window.__myimcc_supabase_client__;
    init();
  } else {
    window.addEventListener('supabase:ready', function onReady() {
      window.removeEventListener('supabase:ready', onReady);
      supabase = window.__myimcc_supabase_client__;
      init();
    });
  }
})();
