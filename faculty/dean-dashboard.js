// dean-dashboard.js
document.addEventListener('DOMContentLoaded', async () => {
    let supabaseClient;
    try {
        supabaseClient = await getSupabaseClientAsync();
    } catch (e) {
        console.error('Failed to init Supabase', e);
        return;
    }

    // ── Shared helpers ──────────────────────────────────────────────────
    const peso = n => '₱' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
    const getEl = id => document.getElementById(id);
    function escapeHtml(str) {
        return String(str ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }
    function initials(name) {
        return (name || '?').trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase();
    }
    function fmtDate(iso) {
        if (!iso) return '—';
        return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
    }
    let toastTimer;
    function showToast(msg, isError = false) {
        const t = getEl('toast');
        if (!t) return;
        t.textContent = msg;
        t.classList.toggle('error', isError);
        t.classList.add('show');
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => t.classList.remove('show'), 3200);
    }
    // Table-missing errors (schema not yet migrated) shouldn't look like app bugs.
    function isMissingTableError(err) {
        return err && (err.code === '42P01' || /relation .* does not exist/i.test(err.message || ''));
    }
    // Maps arbitrary status strings onto the four generic badge colors.
    function statusBadgeClass(status) {
        const map = {
            pending: 'badge-amber', approved: 'badge-green', active: 'badge-green', compliant: 'badge-green',
            rejected: 'badge-red', at_risk: 'badge-red', failed: 'badge-red', closed: 'badge-blue',
        };
        return map[status] || 'badge-blue';
    }

    // Reused verbatim from the student dashboard's enrollment conflict logic,
    // so "MWF 9:00-10:00 AM"-style schedule strings parse identically.
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
        if (dayStr === 'TTH' || dayStr === 'TH') days = dayStr === 'TTH' ? ['T', 'TH'] : ['TH'];
        else if (dayStr === 'MWF') days = ['M', 'W', 'F'];
        else if (dayStr === 'MW') days = ['M', 'W'];
        else days = dayStr.split('');

        return { days, startMin: startH * 60 + startM, endMin: endH * 60 + endM };
    }
    function schedulesConflict(a, b) {
        if (!a || !b) return false;
        if (!a.days.some(d => b.days.includes(d))) return false;
        return a.startMin < b.endMin && b.startMin < a.endMin;
    }

    const SEMESTER_ORDER = { '1st Semester': 1, '2nd Semester': 2, 'Summer': 3, 'Summer Semester': 3 };
    function termKey(schoolYear, semester) { return `${schoolYear || '—'} · ${semester || '—'}`; }
    function termSortValue(schoolYear, semester) {
        const startYear = parseInt(String(schoolYear || '0').match(/\d{4}/)?.[0] || '0', 10);
        return startYear * 10 + (SEMESTER_ORDER[semester] || 9);
    }

    // ── State ───────────────────────────────────────────────────────────
    let currentUserId = null;
    let currentProfile = null;
    let darkMode = false;
    const state = {
        profiles: [], offerings: [], grades: [], enrollments: [], facultyList: [],
        budgets: [], grants: [], notes: [], accreditation: [], appeals: [],
    };

    // ── Navigation (goto) ───────────────────────────────────────────────
    const titles = {
        dashboard: 'Dashboard',
        classes: 'My Classes',
        faculty: 'Faculty & Schedule',
        financial: 'Financial Oversight',
        compliance: 'Student Compliance',
        profile: 'My Profile',
    };

    function goto(page) {
        document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
        getEl('page-' + page)?.classList.add('active');
        document.querySelectorAll('.nav-item[data-page]').forEach(n => n.classList.toggle('active', n.dataset.page === page));
        getEl('pageTitle').textContent = titles[page] || 'Dashboard';
        getEl('userDropdown')?.classList.remove('open');
        if (page === 'profile') renderProfile();
        if (page === 'classes') loadMyClasses();
    }
    document.querySelectorAll('[data-page]').forEach(el => el.addEventListener('click', () => goto(el.dataset.page)));
    document.querySelectorAll('[data-goto]').forEach(el => el.addEventListener('click', () => goto(el.dataset.goto)));

    // ── Dropdown + theme toggle ───────────────────────────────────────────
    function setupDropdown(btnId, ddId) {
        const btn = getEl(btnId), dd = getEl(ddId);
        if (!btn || !dd) return;
        btn.addEventListener('click', e => { e.stopPropagation(); dd.classList.toggle('open'); });
        document.addEventListener('click', () => dd.classList.remove('open'));
        dd.addEventListener('click', e => e.stopPropagation());
    }
    setupDropdown('userBtn', 'userDropdown');

    getEl('themeToggle')?.addEventListener('click', () => {
        darkMode = !darkMode;
        document.body.setAttribute('data-theme', darkMode ? 'dark' : 'light');
        getEl('themeLabel').textContent = darkMode ? 'Light' : 'Dark';
        getEl('themeIcon').innerHTML = darkMode
            ? '<circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4"/>'
            : '<path d="M21 12.8A9 9 0 1111.2 3 7 7 0 0021 12.8z"/>';
    });

    // ── Auth ────────────────────────────────────────────────────────────
    async function checkDeanAuth() {
        const { data: { user }, error } = await supabaseClient.auth.getUser();
        if (error || !user) { window.location.href = '../auth/login.html'; return false; }
        currentUserId = user.id;

        const { data: profile } = await supabaseClient.from('profiles').select('*').eq('id', user.id).single();

        if (!profile || profile.status !== 'approved' || !['dean', 'admin'].includes(profile.role)) {
            alert('Unauthorized access. Dean privileges required.');
            await supabaseClient.auth.signOut();
            window.location.href = '../auth/login.html';
            return false;
        }

        currentProfile = profile;
        const name = profile.full_name || user.email;
        getEl('sidebarName').textContent = name;
        getEl('sidebarDept').textContent = profile.program || 'Dean\'s Office';
        getEl('sidebarAvatar').textContent = initials(name);
        getEl('topAvatar').textContent = initials(name);
        getEl('topName').textContent = name.split(' ')[0] || 'Dean';
        return true;
    }

    // ── Bulk data load ──────────────────────────────────────────────────
    async function loadAllData() {
        const [{ data: profiles }, { data: offerings }, { data: gradeRows }, { data: enrollRows }] = await Promise.all([
            supabaseClient.from('profiles').select('*'),
            supabaseClient.from('course_offerings').select('*'),
            supabaseClient.from('grades').select('*, course_offerings(code, title, units, program, instructor_name)'),
            supabaseClient.from('enrollments').select('student_id, status, offering_id, course_offerings(school_year, semester)').eq('status', 'enrolled'),
        ]);

        state.profiles = profiles || [];
        state.offerings = offerings || [];
        state.grades = gradeRows || [];
        state.enrollments = enrollRows || [];
        state.facultyList = state.profiles.filter(p => p.role === 'teacher' && p.status === 'approved');
    }

    // ══════════════════════════════════════════════════════════════════
    // DASHBOARD — STRATEGIC ANALYTICS
    // ══════════════════════════════════════════════════════════════════
    function renderOverview() {
        renderEnrollmentStats();
        renderProgramBars();
        renderSemesterTrend();
        renderPerformance();
        renderFlaggedCourses();
    }

    function renderEnrollmentStats() {
        const students = state.profiles.filter(p => p.role === 'student' && p.status === 'approved');
        const programs = new Set(students.map(s => s.program).filter(Boolean));

        const withFinal = state.grades.filter(g => g.final !== null && g.final !== undefined);
        const avgEquivalent = withFinal.length
            ? (withFinal.reduce((s, g) => s + Number(g.equivalent || 0), 0) / withFinal.length).toFixed(2)
            : '—';

        const retention = computeRetentionRate();

        getEl('enrollmentStats').innerHTML = `
      <div class="stat">
        <div class="stat-top"><span class="stat-label">TOTAL STUDENTS</span><div class="stat-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0116 0" /></svg>
        </div></div>
        <div class="stat-value">${students.length}</div>
        <div class="stat-sub">Across ${programs.size} program${programs.size === 1 ? '' : 's'}</div>
      </div>
      <div class="stat c2">
        <div class="stat-top"><span class="stat-label">AVG. DEPARTMENT GWA</span><div class="stat-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="12" cy="12" r="9" /><path d="M9 12l2 2 4-4" /></svg>
        </div></div>
        <div class="stat-value">${avgEquivalent}</div>
        <div class="stat-sub">From ${withFinal.length} recorded final${withFinal.length === 1 ? '' : 's'}</div>
      </div>
      <div class="stat c3">
        <div class="stat-top"><span class="stat-label">RETENTION RATE</span><div class="stat-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M3 12l6 6 12-12" /></svg>
        </div></div>
        <div class="stat-value">${retention === null ? '—' : retention.toFixed(0) + '%'}</div>
        <div class="stat-sub">${retention === null ? 'Not enough term data yet' : 'Latest vs. prior term'}</div>
      </div>
      <div class="stat c4">
        <div class="stat-top"><span class="stat-label">ACTIVE OFFERINGS</span><div class="stat-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M22 10v6M2 10l10-5 10 5-10 5-10-5z" /></svg>
        </div></div>
        <div class="stat-value">${state.offerings.length}</div>
        <div class="stat-sub">All recorded terms</div>
      </div>
    `;
    }

    function renderProgramBars() {
        const students = state.profiles.filter(p => p.role === 'student' && p.status === 'approved');
        const counts = {};
        students.forEach(s => { const p = s.program || 'Unspecified'; counts[p] = (counts[p] || 0) + 1; });
        const max = Math.max(1, ...Object.values(counts));
        const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);

        getEl('programBars').innerHTML = entries.length ? entries.map(([program, count]) => `
      <div class="bar-row">
        <div class="bar-label" title="${escapeHtml(program)}">${escapeHtml(program)}</div>
        <div class="bar-track"><div class="bar-fill" style="width:${(count / max * 100).toFixed(0)}%;"></div></div>
        <div class="bar-value">${count}</div>
      </div>
    `).join('') : '<div class="empty-state">No approved students on file.</div>';
    }

    function getTermCounts() {
        const map = {};
        state.enrollments.forEach(e => {
            const off = e.course_offerings;
            if (!off) return;
            const key = termKey(off.school_year, off.semester);
            if (!map[key]) map[key] = { set: new Set(), sortVal: termSortValue(off.school_year, off.semester) };
            map[key].set.add(e.student_id);
        });
        return Object.entries(map)
            .map(([key, v]) => ({ key, count: v.set.size, sortVal: v.sortVal, set: v.set }))
            .sort((a, b) => a.sortVal - b.sortVal);
    }

    function renderSemesterTrend() {
        const terms = getTermCounts().slice(-6);
        const max = Math.max(1, ...terms.map(t => t.count));

        getEl('semesterTrendBars').innerHTML = terms.length ? terms.map(t => `
      <div class="bar-row">
        <div class="bar-label" title="${escapeHtml(t.key)}">${escapeHtml(t.key)}</div>
        <div class="bar-track"><div class="bar-fill ok" style="width:${(t.count / max * 100).toFixed(0)}%;"></div></div>
        <div class="bar-value">${t.count}</div>
      </div>
    `).join('') : '<div class="empty-state">No enrollment history found yet.</div>';
    }

    function computeRetentionRate() {
        const terms = getTermCounts();
        if (terms.length < 2) return null;
        const prev = terms[terms.length - 2];
        const latest = terms[terms.length - 1];
        if (prev.set.size === 0) return null;
        let retained = 0;
        prev.set.forEach(id => { if (latest.set.has(id)) retained++; });
        return (retained / prev.set.size) * 100;
    }

    function renderPerformance() {
        const withRemark = state.grades.filter(g => g.remark && g.remark !== 'Pending');
        const passed = withRemark.filter(g => g.remark === 'Passed').length;
        const failed = withRemark.filter(g => g.remark === 'Failed').length;
        const pending = state.grades.length - withRemark.length;
        const total = Math.max(1, state.grades.length);

        getEl('performanceStats').innerHTML = `
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;">
        <div class="stat" style="border-left-color:var(--green);">
          <div class="stat-label">Passed</div><div class="stat-value" style="color:var(--green);font-size:22px;">${passed}</div>
        </div>
        <div class="stat" style="border-left-color:var(--red);">
          <div class="stat-label">Failed</div><div class="stat-value" style="color:var(--red);font-size:22px;">${failed}</div>
        </div>
        <div class="stat" style="border-left-color:var(--amber);">
          <div class="stat-label">Pending</div><div class="stat-value" style="color:var(--amber);font-size:22px;">${pending}</div>
        </div>
      </div>
    `;

        getEl('passFailBars').innerHTML = `
      <div class="bar-row">
        <div class="bar-label">Passed</div>
        <div class="bar-track"><div class="bar-fill ok" style="width:${(passed / total * 100).toFixed(0)}%;"></div></div>
        <div class="bar-value">${((passed / total) * 100).toFixed(0)}%</div>
      </div>
      <div class="bar-row">
        <div class="bar-label">Failed</div>
        <div class="bar-track"><div class="bar-fill danger" style="width:${(failed / total * 100).toFixed(0)}%;"></div></div>
        <div class="bar-value">${((failed / total) * 100).toFixed(0)}%</div>
      </div>
    `;
    }

    function renderFlaggedCourses() {
        const byOffering = {};
        state.grades.forEach(g => {
            if (g.final === null || g.final === undefined) return;
            const off = g.course_offerings;
            if (!off) return;
            const key = off.code || 'Unknown';
            if (!byOffering[key]) byOffering[key] = { code: off.code, program: off.program, total: 0, failed: 0 };
            byOffering[key].total++;
            if (g.remark === 'Failed') byOffering[key].failed++;
        });

        const flagged = Object.values(byOffering)
            .filter(c => c.total >= 3 && (c.failed / c.total) >= 0.3)
            .sort((a, b) => (b.failed / b.total) - (a.failed / a.total));

        const body = getEl('flaggedCoursesBody');
        const msg = getEl('noFlaggedMsg');
        if (!flagged.length) { body.innerHTML = ''; msg.style.display = 'block'; return; }
        msg.style.display = 'none';
        body.innerHTML = flagged.map(c => `
      <tr>
        <td><b>${escapeHtml(c.code)}</b></td>
        <td>${escapeHtml(c.program || '—')}</td>
        <td>${c.total}</td>
        <td><span class="badge badge-red">${((c.failed / c.total) * 100).toFixed(0)}%</span></td>
      </tr>
    `).join('');
    }

    // ── Financial Oversight ─────────────────────────────────────────────
    async function loadFinancials() {
        const [budgetsRes, grantsRes] = await Promise.all([
            supabaseClient.from('department_budgets').select('*').order('created_at', { ascending: false }),
            supabaseClient.from('grant_funding').select('*').order('created_at', { ascending: false }),
        ]);

        const notice = getEl('budgetNotice');
        if (isMissingTableError(budgetsRes.error) || isMissingTableError(grantsRes.error)) {
            notice.style.display = 'block';
            notice.innerHTML = 'Financial Oversight needs two extra tables (<code>department_budgets</code>, <code>grant_funding</code>) that aren\'t in your database yet. Run <code>dean-dashboard-schema.sql</code> in the Supabase SQL editor, then reload this page.';
            state.budgets = [];
            state.grants = [];
        } else {
            notice.style.display = 'none';
            state.budgets = budgetsRes.data || [];
            state.grants = grantsRes.data || [];
        }
        renderBudgets();
        renderGrants();
    }

    function renderBudgets() {
        const wrap = getEl('budgetBars');
        const msg = getEl('noBudgetMsg');
        if (!state.budgets.length) { wrap.innerHTML = ''; msg.style.display = 'block'; return; }
        msg.style.display = 'none';

        wrap.innerHTML = state.budgets.map(b => {
            const pct = b.allocated_budget > 0 ? Math.min(100, (b.amount_spent / b.allocated_budget) * 100) : 0;
            const cls = pct >= 95 ? 'danger' : pct >= 75 ? 'warn' : 'ok';
            return `
        <div style="margin-bottom:14px;">
          <div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:6px;">
            <span><b>${escapeHtml(b.department)}</b> <span style="color:var(--ink-500);">· ${escapeHtml(b.fiscal_year)}</span></span>
            <span>${peso(b.amount_spent)} / ${peso(b.allocated_budget)}</span>
          </div>
          <div class="bar-track" style="height:14px;">
            <div class="bar-fill ${cls}" style="width:${pct.toFixed(0)}%;"></div>
          </div>
        </div>
      `;
        }).join('');
    }

    function renderGrants() {
        const body = getEl('grantsBody');
        const msg = getEl('noGrantsMsg');
        if (!state.grants.length) { body.innerHTML = ''; msg.style.display = 'block'; return; }
        msg.style.display = 'none';
        body.innerHTML = state.grants.map(g => `
      <tr>
        <td><b>${escapeHtml(g.grant_name)}</b></td>
        <td>${escapeHtml(g.department)}</td>
        <td>${peso(g.amount)}</td>
        <td><span class="badge ${statusBadgeClass(g.status)}">${escapeHtml(g.status)}</span></td>
        <td>${escapeHtml(g.funding_source || '—')}</td>
      </tr>
    `).join('');
    }

    // ══════════════════════════════════════════════════════════════════
    // FACULTY & SCHEDULE
    // ══════════════════════════════════════════════════════════════════
    function getTermList() {
        const set = new Map();
        state.offerings.forEach(o => {
            const key = termKey(o.school_year, o.semester);
            if (!set.has(key)) set.set(key, { school_year: o.school_year, semester: o.semester, sortVal: termSortValue(o.school_year, o.semester) });
        });
        return [...set.entries()].map(([key, v]) => ({ key, ...v })).sort((a, b) => b.sortVal - a.sortVal);
    }

    let selectedTermKey = null;

    function initTermFilter() {
        const terms = getTermList();
        const select = getEl('assignSemesterFilter');
        if (!terms.length) { select.innerHTML = '<option>No terms found</option>'; return; }
        if (!selectedTermKey) selectedTermKey = terms[0].key;
        select.innerHTML = terms.map(t => `<option value="${escapeHtml(t.key)}" ${t.key === selectedTermKey ? 'selected' : ''}>${escapeHtml(t.key)}</option>`).join('');
        select.onchange = () => { selectedTermKey = select.value; renderFacultyPage(); };
    }

    function renderFacultyPage() {
        initTermFilter();
        renderWorkloads();
        renderAssignments();
        renderConflicts();
    }

    function offeringsForSelectedTerm() {
        return state.offerings.filter(o => termKey(o.school_year, o.semester) === selectedTermKey);
    }

    function renderWorkloads() {
        const offerings = offeringsForSelectedTerm();
        const byInstructor = {};
        offerings.forEach(o => {
            const name = o.instructor_name || 'Unassigned';
            if (!byInstructor[name]) byInstructor[name] = { name, sections: 0, units: 0 };
            byInstructor[name].sections++;
            byInstructor[name].units += Number(o.units || 0);
        });

        const rows = Object.values(byInstructor).sort((a, b) => b.units - a.units);
        const body = getEl('workloadBody');
        const msg = getEl('noWorkloadMsg');
        if (!rows.length) { body.innerHTML = ''; msg.style.display = 'block'; return; }
        msg.style.display = 'none';

        body.innerHTML = rows.map(r => {
            const load = r.units >= 24 ? { label: 'Heavy', cls: 'badge-red' }
                : r.units >= 12 ? { label: 'Balanced', cls: 'badge-green' }
                    : { label: 'Light', cls: 'badge-amber' };
            return `
        <tr>
          <td><b>${escapeHtml(r.name)}</b></td>
          <td>${r.sections}</td>
          <td>${r.units}</td>
          <td><span class="badge ${load.cls}">${load.label}</span></td>
        </tr>
      `;
        }).join('');
    }

    function renderAssignments() {
        const offerings = offeringsForSelectedTerm();
        const body = getEl('assignBody');
        const msg = getEl('noOfferingsMsg');
        if (!offerings.length) { body.innerHTML = ''; msg.style.display = 'block'; return; }
        msg.style.display = 'none';

        const facultyOptions = state.facultyList
            .sort((a, b) => (a.full_name || '').localeCompare(b.full_name || ''))
            .map(f => `<option value="${f.id}">${escapeHtml(f.full_name)}</option>`).join('');

        body.innerHTML = offerings.map(o => `
      <tr>
        <td><b>${escapeHtml(o.code || '—')}</b></td>
        <td>${escapeHtml(o.title || '—')}</td>
        <td>${escapeHtml(o.program || '—')}</td>
        <td>${escapeHtml(o.schedule || 'TBA')}</td>
        <td>
          <select class="field-input assign-select" style="width:auto;" data-id="${o.id}">
            <option value="">— Unassigned —</option>
            ${facultyOptions}
          </select>
        </td>
      </tr>
    `).join('');

        document.querySelectorAll('.assign-select').forEach(sel => {
            const offering = offerings.find(o => String(o.id) === sel.dataset.id);
            if (offering?.instructor_id) {
                sel.value = offering.instructor_id;
            } else if (offering?.instructor_name) {
                const match = state.facultyList.find(f => f.full_name === offering.instructor_name);
                if (match) sel.value = match.id;
            }
            sel.addEventListener('change', () => assignFaculty(sel));
        });
    }

    async function assignFaculty(sel) {
        const offeringId = sel.dataset.id;
        const facultyId = sel.value;
        const faculty = state.facultyList.find(f => f.id === facultyId);
        const instructorName = faculty ? faculty.full_name : null;

        let { error } = await supabaseClient
            .from('course_offerings')
            .update({ instructor_id: facultyId || null, instructor_name: instructorName })
            .eq('id', offeringId);

        if (error) {
            ({ error } = await supabaseClient
                .from('course_offerings')
                .update({ instructor_name: instructorName })
                .eq('id', offeringId));
        }

        if (error) { showToast('Failed to update faculty assignment: ' + error.message, true); return; }

        showToast(instructorName ? `Assigned ${instructorName}.` : 'Unassigned faculty.');
        const offering = state.offerings.find(o => String(o.id) === offeringId);
        if (offering) { offering.instructor_id = facultyId || null; offering.instructor_name = instructorName; }
        renderWorkloads();
        renderConflicts();
    }

    function renderConflicts() {
        const offerings = offeringsForSelectedTerm().filter(o => o.schedule);
        const conflicts = [];

        const byInstructor = {};
        offerings.forEach(o => { if (o.instructor_name) (byInstructor[o.instructor_name] ||= []).push(o); });
        Object.values(byInstructor).forEach(list => {
            for (let i = 0; i < list.length; i++) {
                for (let j = i + 1; j < list.length; j++) {
                    if (schedulesConflict(parseSchedule(list[i].schedule), parseSchedule(list[j].schedule))) {
                        conflicts.push({ type: 'Faculty', who: list[i].instructor_name, a: list[i], b: list[j] });
                    }
                }
            }
        });

        const byRoom = {};
        offerings.forEach(o => { if (o.room) (byRoom[o.room] ||= []).push(o); });
        Object.values(byRoom).forEach(list => {
            for (let i = 0; i < list.length; i++) {
                for (let j = i + 1; j < list.length; j++) {
                    if (list[i].instructor_name === list[j].instructor_name) continue;
                    if (schedulesConflict(parseSchedule(list[i].schedule), parseSchedule(list[j].schedule))) {
                        conflicts.push({ type: 'Room', who: list[i].room, a: list[i], b: list[j] });
                    }
                }
            }
        });

        const wrap = getEl('conflictsList');
        const msg = getEl('noConflictsMsg');
        if (!conflicts.length) { wrap.innerHTML = ''; msg.style.display = 'block'; return; }
        msg.style.display = 'none';

        wrap.innerHTML = conflicts.map(c => `
      <div class="conflict-card">
        <b>${c.type} conflict — ${escapeHtml(c.who)}:</b>
        ${escapeHtml(c.a.code)} (${escapeHtml(c.a.schedule)}) overlaps with ${escapeHtml(c.b.code)} (${escapeHtml(c.b.schedule)})
      </div>
    `).join('');
    }

    // ── Faculty Performance Log ─────────────────────────────────────────
    async function loadNotes() {
        const { data, error } = await supabaseClient.from('faculty_notes').select('*').order('created_at', { ascending: false });
        if (isMissingTableError(error)) {
            state.notes = [];
            getEl('notesBody').innerHTML = '';
            const msg = getEl('noNotesMsg');
            msg.style.display = 'block';
            msg.textContent = 'This log needs the faculty_notes table — run dean-dashboard-schema.sql, then reload.';
            return;
        }
        state.notes = data || [];
        renderNotes();
    }

    function renderNotes() {
        const body = getEl('notesBody');
        const msg = getEl('noNotesMsg');
        if (!state.notes.length) { body.innerHTML = ''; msg.style.display = 'block'; msg.textContent = 'No performance notes logged yet.'; return; }
        msg.style.display = 'none';
        const typeLabel = { evaluation: 'Evaluation', publication: 'Publication', tenure: 'Tenure Track' };
        body.innerHTML = state.notes.map(n => `
      <tr>
        <td><b>${escapeHtml(n.faculty_name)}</b></td>
        <td><span class="badge badge-blue">${escapeHtml(typeLabel[n.note_type] || n.note_type)}</span></td>
        <td>${escapeHtml(n.content)}</td>
        <td>${fmtDate(n.created_at)}</td>
      </tr>
    `).join('');
    }

    // ══════════════════════════════════════════════════════════════════
    // STUDENT COMPLIANCE
    // ══════════════════════════════════════════════════════════════════
    function renderGradReadiness() {
        const required = Number(getEl('requiredUnitsInput').value || 144);
        const seniors = state.profiles.filter(p => p.role === 'student' && p.status === 'approved' && /4/.test(String(p.year_level || '')));

        const earnedByStudent = {};
        state.grades.forEach(g => {
            if (g.remark !== 'Passed') return;
            earnedByStudent[g.student_id] = (earnedByStudent[g.student_id] || 0) + Number(g.course_offerings?.units || 0);
        });

        const body = getEl('gradReadinessBody');
        const msg = getEl('noSeniorsMsg');
        if (!seniors.length) { body.innerHTML = ''; msg.style.display = 'block'; return; }
        msg.style.display = 'none';

        const rows = seniors.map(s => {
            const earned = earnedByStudent[s.id] || 0;
            const pct = Math.min(100, (earned / required) * 100);
            const atRisk = earned < required;
            return { s, earned, pct, atRisk };
        }).sort((a, b) => a.pct - b.pct);

        body.innerHTML = rows.map(r => `
      <tr>
        <td><b>${escapeHtml(r.s.full_name || 'N/A')}</b></td>
        <td>${escapeHtml(r.s.program || '—')}</td>
        <td>${r.earned} / ${required}</td>
        <td><div class="bar-track" style="width:120px;height:10px;"><div class="bar-fill ${r.atRisk ? 'danger' : 'ok'}" style="width:${r.pct.toFixed(0)}%;"></div></div></td>
        <td><span class="badge ${r.atRisk ? 'badge-red' : 'badge-green'}">${r.atRisk ? 'At Risk' : 'On Track'}</span></td>
      </tr>
    `).join('');
    }
    getEl('requiredUnitsInput').addEventListener('input', renderGradReadiness);

    // ── Accreditation Checklist ─────────────────────────────────────────
    async function loadAccreditation() {
        const { data, error } = await supabaseClient.from('accreditation_checklist').select('*').order('updated_at', { ascending: false });
        if (isMissingTableError(error)) {
            state.accreditation = [];
            getEl('accreditationBody').innerHTML = '';
            const msg = getEl('noAccreditationMsg');
            msg.style.display = 'block';
            msg.textContent = 'This checklist needs the accreditation_checklist table — run dean-dashboard-schema.sql, then reload.';
            return;
        }
        state.accreditation = data || [];
        renderAccreditation();
    }

    function renderAccreditation() {
        const body = getEl('accreditationBody');
        const msg = getEl('noAccreditationMsg');
        if (!state.accreditation.length) { body.innerHTML = ''; msg.style.display = 'block'; msg.textContent = 'No accreditation items tracked yet.'; return; }
        msg.style.display = 'none';
        const statusLabel = { compliant: 'Compliant', pending: 'Pending', at_risk: 'At Risk' };
        body.innerHTML = state.accreditation.map(a => `
      <tr>
        <td><b>${escapeHtml(a.requirement)}</b>${a.notes ? `<div style="color:var(--ink-500);font-size:12px;margin-top:2px;">${escapeHtml(a.notes)}</div>` : ''}</td>
        <td>${escapeHtml(a.department || '—')}</td>
        <td><span class="badge ${statusBadgeClass(a.status)}">${escapeHtml(statusLabel[a.status] || a.status)}</span></td>
        <td>${a.evidence_link ? `<a href="${escapeHtml(a.evidence_link)}" target="_blank" style="color:var(--blue);">View</a>` : '—'}</td>
      </tr>
    `).join('');
    }

    // ── Appeals & Approvals ──────────────────────────────────────────────
    async function loadAppeals() {
        const { data, error } = await supabaseClient.from('appeals').select('*').order('created_at', { ascending: false });
        if (isMissingTableError(error)) {
            state.appeals = [];
            getEl('appealsBody').innerHTML = '';
            const msg = getEl('noAppealsMsg');
            msg.style.display = 'block';
            msg.textContent = 'This workflow needs the appeals table — run dean-dashboard-schema.sql, then reload.';
            return;
        }
        state.appeals = data || [];
        renderAppeals();
    }

    function renderAppeals() {
        const body = getEl('appealsBody');
        const msg = getEl('noAppealsMsg');
        if (!state.appeals.length) { body.innerHTML = ''; msg.style.display = 'block'; msg.textContent = 'No appeals on file.'; return; }
        msg.style.display = 'none';
        const typeLabel = { grade_change: 'Grade Change', prerequisite_waiver: 'Prerequisite Waiver', credit_transfer: 'Credit Transfer' };

        body.innerHTML = state.appeals.map(a => `
      <tr>
        <td><b>${escapeHtml(a.student_name)}</b></td>
        <td>${escapeHtml(typeLabel[a.appeal_type] || a.appeal_type)}</td>
        <td>${escapeHtml(a.course_code || '—')}</td>
        <td>${escapeHtml(a.reason)}</td>
        <td><span class="badge ${statusBadgeClass(a.status)}">${escapeHtml(a.status)}</span></td>
        <td>
          ${a.status === 'pending' ? `
            <button class="mini-btn success" data-id="${a.id}" data-action="approved">Approve</button>
            <button class="mini-btn danger" data-id="${a.id}" data-action="rejected">Reject</button>
          ` : `<span style="color:var(--ink-500);font-size:12px;">Reviewed ${fmtDate(a.reviewed_at)}</span>`}
        </td>
      </tr>
    `).join('');

        document.querySelectorAll('#appealsBody .mini-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                const { error } = await supabaseClient
                    .from('appeals')
                    .update({ status: btn.dataset.action, reviewed_by: currentUserId, reviewed_at: new Date().toISOString() })
                    .eq('id', btn.dataset.id);
                if (error) { showToast('Failed to update appeal: ' + error.message, true); return; }
                showToast(`Appeal ${btn.dataset.action}.`);
                loadAppeals();
            });
        });
    }

    // ══════════════════════════════════════════════════════════════════
    // PROFILE
    // ══════════════════════════════════════════════════════════════════
    function renderProfile() {
        const p = currentProfile;
        const rows = [
            ['Full Name', p.full_name],
            ['Email', p.email],
            ['ID Number', p.id_number],
            ['Department / Program', p.program],
            ['Role', 'Dean'],
        ];
        getEl('profileFields').innerHTML = rows.map(([label, value]) => `
      <div style="padding:12px 0;border-bottom:1px solid var(--line);display:flex;justify-content:space-between;gap:12px;">
        <span style="color:var(--ink-500);font-size:13px;">${escapeHtml(label)}</span>
        <span style="font-weight:700;font-size:13.5px;">${escapeHtml(value || '—')}</span>
      </div>
    `).join('');
    }

    // ══════════════════════════════════════════════════════════════════
    // MY CLASSES — grade entry for courses the dean personally handles
    // (identical mechanics to faculty-dashboard.js, scoped to this account)
    // ══════════════════════════════════════════════════════════════════
    let myOfferings = [];
    let selectedMyOffering = null;
    let myRoster = [];

    // Standard Philippine collegiate 0–100 → 1.00–5.00 conversion.
    // Adjust these cutoffs to match your institution's actual grading policy.
    function computeEquivalent(avg) {
        if (avg === null || avg === undefined || isNaN(avg)) return null;
        if (avg >= 97) return 1.00;
        if (avg >= 94) return 1.25;
        if (avg >= 91) return 1.50;
        if (avg >= 88) return 1.75;
        if (avg >= 85) return 2.00;
        if (avg >= 82) return 2.25;
        if (avg >= 79) return 2.50;
        if (avg >= 76) return 2.75;
        if (avg >= 75) return 3.00;
        return 5.00;
    }

    async function loadMyClasses() {
        // The dean may be assigned as instructor on some offerings even without
        // logging in through the faculty portal — pull straight from state if
        // already loaded, otherwise query directly.
        myOfferings = state.offerings.filter(o =>
            o.instructor_id === currentUserId || o.instructor_name === currentProfile.full_name
        );

        const notice = getEl('myClassesNotice');
        notice.style.display = myOfferings.length ? 'none' : 'block';

        myOfferings.sort((a, b) => (b.school_year || '').localeCompare(a.school_year || ''));
        renderMyCourseList();
    }

    function renderMyCourseList() {
        const wrap = getEl('myCourseList');
        const msg = getEl('noMyCoursesMsg');
        if (!myOfferings.length) { wrap.innerHTML = ''; msg.style.display = 'block'; return; }
        msg.style.display = 'none';

        wrap.innerHTML = myOfferings.map(o => `
      <button type="button" class="nav-item" style="border:1px solid var(--line);margin-bottom:8px;" data-id="${o.id}">
        <div style="text-align:left;">
          <div style="font-weight:800;font-size:13.5px;">${escapeHtml(o.code || '—')}</div>
          <div style="font-size:12px;color:var(--ink-500);font-weight:500;">${escapeHtml(o.title || '—')}</div>
          <div style="font-size:11px;color:var(--ink-300);margin-top:4px;">${escapeHtml(o.schedule || 'Schedule TBA')} · ${escapeHtml(o.semester || '')} ${escapeHtml(o.school_year || '')}</div>
        </div>
      </button>
    `).join('');

        document.querySelectorAll('#myCourseList .nav-item').forEach(btn => {
            btn.addEventListener('click', () => selectMyCourse(btn.dataset.id, btn));
        });
    }

    async function selectMyCourse(offeringId, btnEl) {
        document.querySelectorAll('#myCourseList .nav-item').forEach(b => b.classList.remove('active'));
        if (btnEl) btnEl.classList.add('active');

        selectedMyOffering = myOfferings.find(o => String(o.id) === String(offeringId));
        if (!selectedMyOffering) return;

        getEl('selectedMyCourseTitle').textContent = `${selectedMyOffering.code} — ${selectedMyOffering.title}`;
        getEl('selectedMyCourseSub').textContent = `${selectedMyOffering.semester || ''} ${selectedMyOffering.school_year || ''} · ${selectedMyOffering.schedule || 'Schedule TBA'}`;
        getEl('saveMyGradesBtn').disabled = false;

        const [{ data: enrollments }, { data: existingGrades }] = await Promise.all([
            supabaseClient.from('enrollments').select('student_id, profiles(id, full_name, student_no, id_number)').eq('offering_id', offeringId).eq('status', 'enrolled'),
            supabaseClient.from('grades').select('*').eq('offering_id', offeringId),
        ]);

        const gradeByStudent = {};
        (existingGrades || []).forEach(g => { gradeByStudent[g.student_id] = g; });

        myRoster = (enrollments || [])
            .map(e => {
                const g = gradeByStudent[e.student_id];
                return {
                    student: e.profiles, gradeId: g?.id || null,
                    prelim: g?.prelim ?? null, midterm: g?.midterm ?? null,
                    semifinal: g?.semifinal ?? null, final: g?.final ?? null,
                };
            })
            .filter(r => r.student)
            .sort((a, b) => (a.student.full_name || '').localeCompare(b.student.full_name || ''));

        renderMyRoster();
    }

    function renderMyRoster() {
        const table = getEl('myRosterTable');
        const body = getEl('myRosterBody');
        const msg = getEl('noMyRosterMsg');

        if (!myRoster.length) {
            table.style.display = 'none';
            msg.style.display = 'block';
            msg.textContent = 'No students are enrolled in this class yet.';
            return;
        }
        msg.style.display = 'none';
        table.style.display = 'table';

        const periodInput = (r, idx, field, cls) =>
            `<input type="number" min="0" max="100" step="0.01" class="field-input ${cls}" style="width:72px;" data-idx="${idx}" value="${r[field] ?? ''}">`;

        body.innerHTML = myRoster.map((r, idx) => `
      <tr>
        <td><b>${escapeHtml(r.student.full_name || 'N/A')}</b></td>
        <td>${escapeHtml(r.student.student_no || r.student.id_number || '—')}</td>
        <td>${periodInput(r, idx, 'prelim', 'my-prelim-input')}</td>
        <td>${periodInput(r, idx, 'midterm', 'my-mid-input')}</td>
        <td>${periodInput(r, idx, 'semifinal', 'my-semifinal-input')}</td>
        <td>${periodInput(r, idx, 'final', 'my-final-input')}</td>
        <td class="my-equiv-cell" data-idx="${idx}">${previewMyEquivalent(r)}</td>
        <td class="my-remark-cell" data-idx="${idx}">${previewMyRemarkBadge(r)}</td>
      </tr>
    `).join('');

        const fieldByClass = { 'my-prelim-input': 'prelim', 'my-mid-input': 'midterm', 'my-semifinal-input': 'semifinal', 'my-final-input': 'final' };
        document.querySelectorAll('.my-prelim-input, .my-mid-input, .my-semifinal-input, .my-final-input').forEach(input => {
            input.addEventListener('input', (e) => {
                const idx = Number(e.target.dataset.idx);
                const val = e.target.value === '' ? null : Number(e.target.value);
                const field = fieldByClass[[...e.target.classList].find(c => fieldByClass[c])];
                myRoster[idx][field] = val;
                document.querySelector(`.my-equiv-cell[data-idx="${idx}"]`).textContent = previewMyEquivalent(myRoster[idx]);
                document.querySelector(`.my-remark-cell[data-idx="${idx}"]`).innerHTML = previewMyRemarkBadge(myRoster[idx]);
            });
        });
    }

    // Equal-weighted average of whichever grading periods have been entered so
    // far (Pre-Lim, Midterm, Semi-Final, Final). Adjust the weights below if
    // your institution weighs periods unevenly (e.g. Final worth more).
    function myPeriodAverage(r) {
        const periods = [r.prelim, r.midterm, r.semifinal, r.final].filter(v => v !== null && v !== undefined);
        if (!periods.length) return null;
        return periods.reduce((s, v) => s + Number(v), 0) / periods.length;
    }

    function previewMyEquivalent(r) {
        const eq = computeEquivalent(myPeriodAverage(r));
        return eq === null ? '—' : eq.toFixed(2);
    }

    function previewMyRemarkBadge(r) {
        if (r.final === null || r.final === undefined) return '<span class="badge badge-amber">Pending</span>';
        const eq = computeEquivalent(myPeriodAverage(r));
        const remark = eq !== null && eq <= 3.00 ? 'Passed' : 'Failed';
        return `<span class="badge ${remark === 'Passed' ? 'badge-green' : 'badge-red'}">${remark}</span>`;
    }

    getEl('saveMyGradesBtn').addEventListener('click', async () => {
        if (!selectedMyOffering || !myRoster.length) return;
        const btn = getEl('saveMyGradesBtn');
        btn.disabled = true;
        btn.textContent = 'Saving…';

        let successCount = 0, failCount = 0;

        for (const r of myRoster) {
            const equivalent = computeEquivalent(myPeriodAverage(r));
            const remark = r.final === null || r.final === undefined ? 'Pending' : (equivalent <= 3.00 ? 'Passed' : 'Failed');

            const payload = {
                student_id: r.student.id, offering_id: selectedMyOffering.id,
                prelim: r.prelim, midterm: r.midterm, semifinal: r.semifinal, final: r.final,
                equivalent, remark,
            };

            let error;
            if (r.gradeId) {
                ({ error } = await supabaseClient.from('grades').update(payload).eq('id', r.gradeId));
            } else {
                const { data, error: insertErr } = await supabaseClient.from('grades').insert(payload).select().single();
                error = insertErr;
                if (!error && data) r.gradeId = data.id;
            }
            if (error) failCount++; else successCount++;
        }

        btn.disabled = false;
        btn.textContent = 'Save Grades';

        if (failCount === 0) showToast(`Saved grades for ${successCount} student${successCount === 1 ? '' : 's'}.`);
        else showToast(`Saved ${successCount}, failed ${failCount}. Check console for details.`, true);

        // Keep department-wide analytics (avg GWA, pass/fail bars, flagged courses) in sync.
        const { data: gradeRows } = await supabaseClient.from('grades').select('*, course_offerings(code, title, units, program, instructor_name)');
        state.grades = gradeRows || [];
        renderOverview();
        renderGradReadiness();
    });

    // ══════════════════════════════════════════════════════════════════
    // GENERIC MODAL SYSTEM
    // ══════════════════════════════════════════════════════════════════
    const modalConfigs = {
        budget: {
            title: 'Add Department Budget Entry',
            table: 'department_budgets',
            fields: [
                { name: 'department', label: 'Department / Program', type: 'text', required: true, placeholder: 'e.g. BSIT' },
                { name: 'fiscal_year', label: 'Fiscal Year', type: 'text', required: true, placeholder: 'e.g. 2025-2026' },
                { name: 'allocated_budget', label: 'Allocated Budget (₱)', type: 'number', required: true },
                { name: 'amount_spent', label: 'Amount Spent (₱)', type: 'number', required: false, default: 0 },
                { name: 'notes', label: 'Notes', type: 'textarea', required: false },
            ],
            onSaved: loadFinancials,
        },
        grant: {
            title: 'Add Grant',
            table: 'grant_funding',
            fields: [
                { name: 'grant_name', label: 'Grant Name', type: 'text', required: true },
                { name: 'department', label: 'Department', type: 'text', required: true },
                { name: 'amount', label: 'Amount (₱)', type: 'number', required: true },
                { name: 'status', label: 'Status', type: 'select', required: true, options: [{ value: 'pending', label: 'Pending' }, { value: 'active', label: 'Active' }, { value: 'closed', label: 'Closed' }] },
                { name: 'funding_source', label: 'Funding Source', type: 'text', required: false },
                { name: 'notes', label: 'Notes', type: 'textarea', required: false },
            ],
            onSaved: loadFinancials,
        },
        facultyNote: {
            title: 'Add Faculty Performance Note',
            table: 'faculty_notes',
            fields: [
                { name: 'faculty_id', label: 'Faculty Member', type: 'select', required: true, optionsFn: () => state.facultyList.map(f => ({ value: f.id, label: f.full_name })) },
                { name: 'note_type', label: 'Type', type: 'select', required: true, options: [{ value: 'evaluation', label: 'Evaluation' }, { value: 'publication', label: 'Publication' }, { value: 'tenure', label: 'Tenure Track' }] },
                { name: 'content', label: 'Note', type: 'textarea', required: true },
            ],
            transform: (values) => {
                const faculty = state.facultyList.find(f => f.id === values.faculty_id);
                return { ...values, faculty_name: faculty ? faculty.full_name : 'Unknown' };
            },
            onSaved: loadNotes,
        },
        accreditation: {
            title: 'Add Accreditation Requirement',
            table: 'accreditation_checklist',
            fields: [
                { name: 'requirement', label: 'Requirement', type: 'text', required: true, placeholder: 'e.g. Minimum instructional hours — IT301' },
                { name: 'department', label: 'Department', type: 'text', required: false },
                { name: 'status', label: 'Status', type: 'select', required: true, options: [{ value: 'compliant', label: 'Compliant' }, { value: 'pending', label: 'Pending' }, { value: 'at_risk', label: 'At Risk' }] },
                { name: 'evidence_link', label: 'Evidence Link (URL)', type: 'text', required: false },
                { name: 'notes', label: 'Notes', type: 'textarea', required: false },
            ],
            onSaved: loadAccreditation,
        },
        courseOffering: {
            title: 'Add Subject / Course Offering',
            table: 'course_offerings',
            fields: [
                { name: 'code', label: 'Subject Code', type: 'text', required: true, placeholder: 'e.g. CC 101 or IT 101' },
                { name: 'title', label: 'Course Title', type: 'text', required: true, placeholder: 'e.g. Introduction to Computing' },
                { name: 'program', label: 'Program', type: 'select', required: true, options: [{ value: 'BSIT', label: 'BSIT' }, { value: 'BSCS', label: 'BSCS' }, { value: 'BSIS', label: 'BSIS' }] },
                { name: 'year', label: 'Year Level', type: 'select', required: true, options: [{ value: '1', label: '1st Year' }, { value: '2', label: '2nd Year' }, { value: '3', label: '3rd Year' }, { value: '4', label: '4th Year' }] },
                { name: 'semester', label: 'Semester', type: 'select', required: true, options: [{ value: '1st Semester', label: '1st Semester' }, { value: '2nd Semester', label: '2nd Semester' }, { value: 'Summer', label: 'Summer' }] },
                { name: 'school_year', label: 'School Year', type: 'text', required: true, placeholder: '2026–2027', default: '2026–2027' },
                { name: 'units', label: 'Total Units', type: 'number', required: true, placeholder: '3.0', default: '3.0' },
                { name: 'schedule', label: 'Schedule', type: 'text', required: false, placeholder: 'e.g. MWF 08:00–09:30' },
                { name: 'instructor_id', label: 'Assigned Faculty', type: 'select', required: false, optionsFn: () => [{ value: '', label: '— Unassigned —' }, ...state.facultyList.map(f => ({ value: f.id, label: f.full_name }))] },
            ],
            transform: (values) => {
                const faculty = state.facultyList.find(f => f.id === values.instructor_id);
                return {
                    code: values.code,
                    title: values.title,
                    program: values.program,
                    year: Number(values.year) || 1,
                    semester: values.semester,
                    school_year: values.school_year || '2026–2027',
                    units: Number(values.units) || 3.0,
                    schedule: values.schedule || null,
                    instructor_id: values.instructor_id || null,
                    instructor_name: faculty ? faculty.full_name : null,
                };
            },
            onSaved: async () => {
                const { data: offerings } = await supabaseClient.from('course_offerings').select('*');
                state.offerings = offerings || [];
                populateSemesterFilters();
                renderWorkloads();
                renderAssignments();
                renderConflicts();
                showToast('Subject offering created successfully.');
            },
        },
        appeal: {
            title: 'Log New Appeal',
            table: 'appeals',
            fields: [
                { name: 'appeal_type', label: 'Type', type: 'select', required: true, options: [{ value: 'grade_change', label: 'Grade Change' }, { value: 'prerequisite_waiver', label: 'Prerequisite Waiver' }, { value: 'credit_transfer', label: 'Credit Transfer' }] },
                { name: 'student_name', label: 'Student Name', type: 'text', required: true },
                { name: 'course_code', label: 'Course Code', type: 'text', required: false },
                { name: 'reason', label: 'Reason / Request Details', type: 'textarea', required: true },
            ],
            transform: (values) => ({ ...values, status: 'pending', requested_by: currentUserId }),
            onSaved: loadAppeals,
        },
    };

    let activeModalKey = null;

    document.querySelectorAll('[data-modal]').forEach(btn => btn.addEventListener('click', () => openModal(btn.dataset.modal)));

    function openModal(key) {
        const cfg = modalConfigs[key];
        if (!cfg) return;
        activeModalKey = key;
        getEl('modalTitle').textContent = cfg.title;

        const form = getEl('modalForm');
        form.innerHTML = cfg.fields.map(f => {
            const id = `field_${f.name}`;
            if (f.type === 'select') {
                const options = f.options || (f.optionsFn ? f.optionsFn() : []);
                return `
          <div class="form-row">
            <label for="${id}">${escapeHtml(f.label)}</label>
            <select id="${id}" class="field-input" ${f.required ? 'required' : ''}>
              <option value="">Select…</option>
              ${options.map(o => `<option value="${escapeHtml(o.value)}">${escapeHtml(o.label)}</option>`).join('')}
            </select>
          </div>`;
            }
            if (f.type === 'textarea') {
                return `
          <div class="form-row">
            <label for="${id}">${escapeHtml(f.label)}</label>
            <textarea id="${id}" class="field-input" placeholder="${escapeHtml(f.placeholder || '')}" ${f.required ? 'required' : ''}></textarea>
          </div>`;
            }
            return `
        <div class="form-row">
          <label for="${id}">${escapeHtml(f.label)}</label>
          <input type="${f.type}" id="${id}" class="field-input" placeholder="${escapeHtml(f.placeholder || '')}" value="${f.default ?? ''}" ${f.required ? 'required' : ''}>
        </div>`;
        }).join('');

        getEl('modalOverlay').classList.add('open');
    }

    function closeModal() { getEl('modalOverlay').classList.remove('open'); activeModalKey = null; }
    getEl('modalCancelBtn').addEventListener('click', closeModal);
    getEl('modalOverlay').addEventListener('click', (e) => { if (e.target.id === 'modalOverlay') closeModal(); });

    getEl('modalSaveBtn').addEventListener('click', async () => {
        const cfg = modalConfigs[activeModalKey];
        if (!cfg) return;

        const values = {};
        for (const f of cfg.fields) {
            const el = getEl(`field_${f.name}`);
            const val = el.value.trim();
            if (f.required && !val) { showToast(`${f.label} is required.`, true); el.focus(); return; }
            values[f.name] = f.type === 'number' ? (val === '' ? null : Number(val)) : (val || null);
        }

        const payload = cfg.transform ? cfg.transform(values) : values;
        const { error } = await supabaseClient.from(cfg.table).insert(payload);

        if (error) {
            if (isMissingTableError(error)) showToast(`This feature needs the "${cfg.table}" table — run dean-dashboard-schema.sql first.`, true);
            else showToast('Failed to save: ' + error.message, true);
            return;
        }

        showToast('Saved.');
        closeModal();
        if (cfg.onSaved) cfg.onSaved();
    });

    // ── Quick Links (SSO) — same sso_links table the student portal uses ──
    async function loadSSOLinks() {
        const { data: links } = await supabaseClient.from('sso_links').select('*').eq('is_active', true).order('sort_order');
        const nav = getEl('ssoLinksNav');
        if (!nav) return;
        const role = currentProfile?.role || 'dean';
        const visible = (links || []).filter(l => (l.roles || '').split(',').map(r => r.trim()).includes(role));
        nav.innerHTML = visible.map(l => `
      <a href="${l.url}" target="_blank" class="nav-item" style="text-decoration:none;">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:17px;height:17px;"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></svg>
        ${escapeHtml(l.label)}
      </a>`).join('') || '<div class="nav-item soon" style="opacity:.4;">No links configured</div>';
    }

    // ── Logout ──────────────────────────────────────────────────────────
    getEl('signOutBtn').addEventListener('click', async () => {
        await supabaseClient.auth.signOut();
        window.location.href = '../auth/login.html';
    });

    // ── Init ────────────────────────────────────────────────────────────
    const ok = await checkDeanAuth();
    if (!ok) return;

    await loadAllData();
    await loadSSOLinks();
    renderOverview();
    renderFacultyPage();
    renderGradReadiness();
    await Promise.all([loadFinancials(), loadNotes(), loadAccreditation(), loadAppeals()]);
});