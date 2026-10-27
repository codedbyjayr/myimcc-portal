// dean-dashboard.js
document.addEventListener('DOMContentLoaded', async () => {
    let supabaseClient;
    try {
        supabaseClient = await getSupabaseClientAsync();
    } catch (e) {
        console.error('Failed to init Supabase', e);
        return;
    }

    // ── Shared helpers — delegated to shared/faculty-chrome.js (FC) ──
    const getEl = FC.getEl;
    const escapeHtml = FC.escapeHtml;
    const fmtDate = FC.fmtDate;
    const showToast = FC.showToast;
    const isMissingTableError = FC.isMissingTableError;
    const peso = n => '₱' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
    function statusBadgeClass(status) {
        const map = {
            pending: 'badge-amber', approved: 'badge-green', active: 'badge-green', compliant: 'badge-green',
            rejected: 'badge-red', at_risk: 'badge-red', failed: 'badge-red', closed: 'badge-blue',
        };
        return map[status] || 'badge-blue';
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
        notes: [], courses: [], appeals: [],
        // Instructor options loaded from the get_subject_instructor_options RPC.
        // Each entry: { id, full_name, role }
        instructorOptions: null,   // null = not yet loaded; [] = loaded but empty
        instructorOptionsError: null,
    };

    // ── Mobile Navigation — delegated to FC ──
    FC.initMobileNav();

    // ── Navigation — delegated to FC ──
    const goto = FC.initNavigation({
        dashboard: 'Dashboard',
        classes: 'My Classes',
        faculty: 'Faculty & Schedule',
        records: 'View Records',
        compliance: 'Student Compliance',
        profile: 'My Profile',
    }, function (page) {
        if (page === 'profile') renderProfile();
        if (page === 'classes') loadMyClasses();
        if (page === 'records') renderStudentPicker('record');
        if (page === 'compliance') renderStudentPicker('clearance');
    });

    // ── Dropdown + theme — delegated to FC ──
    FC.setupDropdown('userBtn', 'userDropdown');
    FC.initThemeToggle();

    // ── Auth ────────────────────────────────────────────────────────────
    async function checkDeanAuth() {
        const session = await initAuthGuard(['dean', 'admin']);
        if (!session) return false;
        currentUserId = session.user.id;
        currentProfile = session.profile;
        FC.setSidebarProfile(currentProfile, session.user.email);
        return true;
    }

    // ── Bulk data load ──────────────────────────────────────────────────

    /**
     * Load instructor options via the get_subject_instructor_options RPC.
     * Returns approved active teachers/faculty and the signed-in dean.
     * Results are cached in state.instructorOptions so repeated calls are cheap.
     * @param {boolean} force - if true, bypasses the cache and re-fetches.
     */
    async function loadInstructorOptions(force = false) {
        if (!force && state.instructorOptions !== null) return;

        state.instructorOptions = null;  // mark as loading
        state.instructorOptionsError = null;

        const { data, error } = await supabaseClient.rpc('get_subject_instructor_options');

        if (error) {
            console.error('get_subject_instructor_options RPC error:', error);
            state.instructorOptions = [];
            state.instructorOptionsError = error.message || 'Unknown RPC error';
        } else {
            // A dean may teach a subject themselves, alongside eligible teachers/faculty.
            state.instructorOptions = (data || []).filter(r =>
                r.role === 'teacher' || r.role === 'faculty' || (r.role === 'dean' && r.id === currentUserId)
            );
            state.instructorOptionsError = null;
        }

        // Also mirror into facultyList so the inline-assign dropdowns in the
        // Faculty & Schedule tab stay in sync (they use state.facultyList).
        if (state.instructorOptions.length) {
            state.facultyList = state.instructorOptions.map(r => ({
                id: r.id,
                full_name: r.full_name,
                role: r.role,
                status: 'approved',
            }));
        }
    }

    async function loadAllData() {
        const results = await Promise.all([
            supabaseClient.rpc('list_student_records'),
            IMCC.fetchAll(() => supabaseClient.from('course_offerings').select('*')),
            IMCC.fetchAll(() => supabaseClient.from('grades').select('*, course_offerings(code, title, units, program, instructor_name)')),
            IMCC.fetchAll(() => supabaseClient.from('enrollments').select('id, student_id, status, offering_id, course_offerings(school_year, semester)').eq('status', 'enrolled')),
            IMCC.fetchAll(() => supabaseClient.from('courses').select('*').order('code')),
        ]);

        const failure = results.find(result => result.error || !Array.isArray(result.data));
        if (failure) throw new Error(failure.error?.message || 'Dashboard data is unavailable.');
        const [{ data: profiles }, { data: offerings }, { data: gradeRows }, { data: enrollRows }, { data: courses }] = results;

        state.profiles = [currentProfile, ...(profiles || [])].filter(Boolean);
        state.offerings = offerings || [];
        state.grades = gradeRows || [];
        state.enrollments = enrollRows || [];
        state.courses = courses || [];

        // Build an initial facultyList from profiles for cases where the RPC
        // hasn't loaded yet. The RPC result will overwrite this once ready.
        state.facultyList = state.profiles.filter(
            p => ['teacher', 'faculty', 'dean'].includes(p.role) && p.status === 'approved'
        );

        // Both assignment dropdowns need the complete list before the first render.
        await loadInstructorOptions();
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
        getEl('assignYearFilter').onchange = renderFacultyPage;
    }

    function renderFacultyPage() {
        initTermFilter();
        renderWorkloads();
        renderAssignments();
        loadFacultyEvaluations();
    }

    function offeringsForSelectedTerm() {
        const year = getEl('assignYearFilter').value;
        return state.offerings.filter(o => termKey(o.school_year, o.semester) === selectedTermKey && (!year || String(o.year) === year));
    }

    function renderWorkloads() {
        const offerings = offeringsForSelectedTerm();
        const byInstructor = {};
        offerings.forEach(o => {
            const id = o.instructor_id || 'unassigned';
            const name = o.instructor_name || 'Unassigned';
            if (!byInstructor[id]) byInstructor[id] = { name, sections: 0, units: 0 };
            byInstructor[id].sections++;
            byInstructor[id].units += Number(o.units || 0);
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

        // Use RPC-based instructor list when available; fall back to profiles-derived facultyList.
        const instructorSource = (state.instructorOptions && state.instructorOptions.length)
            ? state.instructorOptions
            : state.facultyList.filter(f => f.role === 'teacher' || f.role === 'faculty' || (f.role === 'dean' && f.id === currentUserId));
        const facultyOptions = instructorSource
            .slice().sort((a, b) => (a.full_name || '').localeCompare(b.full_name || ''))
            .map(f => `<option value="${f.id}">${escapeHtml(f.full_name)}${f.id === currentUserId ? ' (You)' : ''}</option>`).join('');

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
        <td>
          <div style="display:flex;gap:6px;align-items:center;">
            <button type="button" class="mini-btn edit-offering-btn" data-id="${o.id}" style="background:var(--blue,#0284c7);color:#fff;border:none;padding:4px 8px;border-radius:6px;cursor:pointer;font-weight:600;font-size:11.5px;">Edit</button>
            <button type="button" class="mini-btn danger delete-offering-btn" data-id="${o.id}">Delete</button>
          </div>
        </td>
      </tr>
    `).join('');

        document.querySelectorAll('.assign-select').forEach(sel => {
            const offering = offerings.find(o => String(o.id) === sel.dataset.id);
            if (offering?.instructor_id) {
                sel.value = offering.instructor_id;
            } else if (offering?.instructor_name) {
                // Try RPC-based list first, then fall back to profiles-derived list.
                const sourceList = (state.instructorOptions && state.instructorOptions.length)
                    ? state.instructorOptions
                    : state.facultyList;
                const match = sourceList.find(f => f.full_name === offering.instructor_name);
                if (match) sel.value = match.id;
            }
            sel.addEventListener('change', () => assignFaculty(sel));
        });

        document.querySelectorAll('.edit-offering-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const offering = offerings.find(o => String(o.id) === btn.dataset.id);
                if (offering) openModal('courseOffering', offering);
            });
        });

        document.querySelectorAll('.delete-offering-btn').forEach(btn => {
            btn.addEventListener('click', () => deleteOffering(btn.dataset.id));
        });
    }

    async function deleteOffering(offeringId) {
        if (!confirm('Are you sure you want to delete this subject offering?')) return;
        const { error } = await supabaseClient.from('course_offerings').delete().eq('id', offeringId);
        if (error) { showToast('Failed to delete offering: ' + error.message, true); return; }
        showToast('Subject offering deleted.');
        state.offerings = state.offerings.filter(o => String(o.id) !== String(offeringId));
        renderFacultyPage();
        loadMyClasses();
    }

    async function assignFaculty(sel) {
        const offeringId = sel.dataset.id;
        const offering = state.offerings.find(o => String(o.id) === offeringId);
        if (!offering || sel.disabled) return;
        const previousId = offering.instructor_id || '';
        const facultyId = sel.value;
        const faculty = state.facultyList.find(f => f.id === facultyId);
        if (facultyId && !faculty) {
            sel.value = previousId;
            showToast('Selected instructor is unavailable. Refresh and try again.', true);
            return;
        }
        sel.disabled = true;
        try {
            // The database trigger synchronizes assignments in this same transaction.
            const { data, error } = await supabaseClient.from('course_offerings')
                .update({ instructor_id: facultyId || null, instructor_name: faculty?.full_name || null })
                .eq('id', offeringId).select().single();
            if (error) throw error;
            if (!data) throw new Error('No subject offering was updated.');
            Object.assign(offering, data);
            sel.value = offering.instructor_id || '';
        } catch (error) {
            sel.value = previousId;
            showToast('Failed to update faculty assignment: ' + error.message, true);
            return;
        } finally {
            sel.disabled = false;
        }
        showToast(offering.instructor_name ? 'Assigned ' + offering.instructor_name + '.' : 'Unassigned faculty.');
        renderWorkloads();
        loadMyClasses();
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

    // ── Faculty Student Evaluations ─────────────────────────────────────
    async function loadFacultyEvaluations() {
        const { data, error } = await supabaseClient
            .from('instructor_evaluation_summary')
            .select('*')
            .order('school_year', { ascending: false });

        renderFacultyEvaluations(data || []);
    }

    function renderFacultyEvaluations(rows) {
        const body = getEl('deanEvalBody');
        const noMsg = getEl('noDeanEvalMsg');
        if (!body) return;

        if (!rows || !rows.length) {
            body.innerHTML = '';
            if (noMsg) noMsg.style.display = 'block';
            return;
        }

        if (noMsg) noMsg.style.display = 'none';
        body.innerHTML = rows.map(r => `
            <tr>
                <td><b>${escapeHtml(r.instructor_name || 'Unknown')}</b></td>
                <td>${escapeHtml(r.school_year)} · ${escapeHtml(r.semester)}</td>
                <td>${r.total_evaluations || 0}</td>
                <td>${r.avg_teaching_clarity != null ? Number(r.avg_teaching_clarity).toFixed(2) : '—'}</td>
                <td>${r.avg_knowledge != null ? Number(r.avg_knowledge).toFixed(2) : '—'}</td>
                <td>${r.avg_availability != null ? Number(r.avg_availability).toFixed(2) : '—'}</td>
                <td>${r.avg_fairness != null ? Number(r.avg_fairness).toFixed(2) : '—'}</td>
                <td>${r.avg_punctuality != null ? Number(r.avg_punctuality).toFixed(2) : '—'}</td>
                <td><b style="color:var(--brand);">${r.avg_overall != null ? Number(r.avg_overall).toFixed(2) + ' / 5.00' : '—'}</b></td>
            </tr>
        `).join('');
    }

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


    let selectedRecord = { record: null, clearance: null };
    function renderStudentPicker(kind) {
        const query = getEl(kind + 'Search').value.trim().toLowerCase();
        const students = state.profiles.filter(p => p.role === 'student' && (p.full_name + ' ' + (p.student_no || '') + ' ' + (p.program || '')).toLowerCase().includes(query));
        getEl(kind + 'Students').innerHTML = students.map(p => '<button class="nav-item" type="button" data-student="' + escapeHtml(p.id) + '">' + escapeHtml(p.full_name) + '<small>' + escapeHtml([p.student_no, p.program, p.year_level].filter(Boolean).join(' · ')) + '</small></button>').join('') || '<p>No matching students.</p>';
    }
    function recordsTable(rows, columns) {
        if (!rows?.length) return '<p>No records.</p>';
        return '<div class="table-responsive"><table><thead><tr>' + columns.map(([label]) => '<th>' + escapeHtml(label) + '</th>').join('') + '</tr></thead><tbody>' + rows.map(row => '<tr>' + columns.map(([, value]) => '<td>' + escapeHtml(value(row) ?? '—') + '</td>').join('') + '</tr>').join('') + '</tbody></table></div>';
    }
    for (const kind of ['record', 'clearance']) {
        getEl(kind + 'Search').addEventListener('input', () => renderStudentPicker(kind));
        getEl(kind + 'Students').addEventListener('click', async event => {
            const id = event.target.closest('[data-student]')?.dataset.student;
            if (!id) return;
            selectedRecord[kind] = id;
            const target = getEl(kind + 'Details');
            target.textContent = 'Loading records…';
            getEl(kind + 'Title').textContent = state.profiles.find(p => p.id === id)?.full_name || 'Student records';
            const { data, error } = await supabaseClient.rpc('get_student_record', { p_student_id: id });
            if (selectedRecord[kind] !== id) return;
            if (error) { target.textContent = 'Could not load records: ' + error.message; return; }
            const clearance = recordsTable(data.clearances, [['Office', r => r.department_name], ['Status', r => r.status], ['Note', r => r.note], ['Cleared', r => fmtDate(r.cleared_at)]]);
            if (kind === 'clearance') { target.innerHTML = clearance; return; }
            const p = data.profile;
            target.innerHTML = '<h4>Student Information</h4>' + recordsTable([p], [['Student No.', r => r.student_no || r.id_number], ['Program', r => r.program], ['Year / Section', r => [r.year_level, r.section].filter(Boolean).join(' / ')], ['Email', r => r.email], ['Phone', r => r.phone], ['Address', r => r.address]]) +
                '<h4>Enrollment & Terms</h4>' + recordsTable(data.enrollments, [['Subject', r => r.code + ' — ' + r.title], ['Term', r => r.semester + ' ' + r.school_year], ['Status', r => r.status], ['Units', r => r.units]]) +
                '<h4>Grades</h4>' + recordsTable(data.grades, [['Subject', r => r.code], ['Term', r => r.semester + ' ' + r.school_year], ['Prelim', r => Grading.formatGrade(r.prelim)], ['Midterm', r => Grading.formatGrade(r.midterm)], ['Semifinal', r => Grading.formatGrade(r.semifinal)], ['Final', r => Grading.formatGrade(r.final)], ['Equivalent', r => Grading.formatGrade(r.equivalent)], ['Remark', r => r.remark]]) +
                '<h4>Clearance</h4>' + clearance +
                '<h4>Attendance</h4>' + recordsTable(data.attendance, [['Subject', r => r.code], ['Date', r => fmtDate(r.date)], ['Status', r => r.status], ['Notes', r => r.notes]]) +
                '<h4>Payment Records</h4>' + recordsTable(data.transactions, [['Receipt', r => r.or_number], ['Date', r => fmtDate(r.txn_date)], ['Description', r => r.description], ['Amount', r => peso(r.amount)]]) +
                '<h4>Balance</h4><p>' + escapeHtml(peso(data.billing?.balance)) + '</p>' +
                '<h4>Installments</h4>' + recordsTable(data.installments, [['Name', r => r.name], ['Due', r => fmtDate(r.due_date)], ['Amount', r => peso(r.amount)], ['Status', r => r.status]]);
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

    // Grade helpers — delegated to shared/grading.js
    const gradingWorkspace = Grading.initWorkspace();

    let deanCourseScope = 'my';

    getEl('deanScopeMyBtn')?.addEventListener('click', () => {
        if (!gradingWorkspace.canLeave()) return;
        gradingWorkspace.markClean();
        deanCourseScope = 'my';
        if (getEl('deanScopeMyBtn')) getEl('deanScopeMyBtn').className = 'btn btn-primary';
        if (getEl('deanScopeAllBtn')) getEl('deanScopeAllBtn').className = 'btn btn-ghost';
        loadMyClasses();
    });

    getEl('deanScopeAllBtn')?.addEventListener('click', () => {
        if (!gradingWorkspace.canLeave()) return;
        gradingWorkspace.markClean();
        deanCourseScope = 'all';
        if (getEl('deanScopeMyBtn')) getEl('deanScopeMyBtn').className = 'btn btn-ghost';
        if (getEl('deanScopeAllBtn')) getEl('deanScopeAllBtn').className = 'btn btn-primary';
        loadMyClasses();
    });

    async function loadMyClasses(autoSelectId = null) {
        if (deanCourseScope === 'all') {
            myOfferings = (state.offerings || []).slice();
        } else {
            myOfferings = (state.offerings || []).filter(o =>
                (o.instructor_id && o.instructor_id === currentUserId) ||
                (o.instructor_name && currentProfile && o.instructor_name === currentProfile.full_name)
            );

            if (!myOfferings.length) {
                // Fall back to teacher_assignments table
                const { data: taRows } = await supabaseClient
                    .from('teacher_assignments')
                    .select('offering_id, course_offerings(*)')
                    .eq('teacher_id', currentUserId)
                    .eq('is_active', true);
                if (taRows && taRows.length > 0) {
                    myOfferings = taRows.map(t => t.course_offerings).filter(Boolean);
                }
            }
        }

        myOfferings.sort((a, b) => (b.school_year || '').localeCompare(a.school_year || ''));
        renderMyCourseList(autoSelectId);
    }

    function renderMyCourseList(autoSelectId = null) {
        const visibleOfferings = gradingWorkspace.setCourses(myOfferings, selectedMyOffering?.id, renderMyCourseList);
        const wrap = getEl('myCourseList');
        const msg = getEl('noMyCoursesMsg');
        if (!visibleOfferings.length) {
            if (wrap) wrap.innerHTML = '';
            if (msg) { msg.style.display = 'block'; msg.textContent = deanCourseScope === 'my' ? 'No classes assigned. Switch to All Classes, or assign yourself under Faculty & Schedule.' : 'No course offerings found.'; }
            if (getEl('selectedMyCourseTitle')) getEl('selectedMyCourseTitle').textContent = 'Select a class';
            if (getEl('selectedMyCourseSub')) getEl('selectedMyCourseSub').textContent = '';
            if (getEl('saveMyGradesBtn')) getEl('saveMyGradesBtn').disabled = true;
            if (getEl('deanClassAuditLogBtn')) getEl('deanClassAuditLogBtn').style.display = 'none';
            if (getEl('myRosterTable')) getEl('myRosterTable').style.display = 'none';
            if (getEl('noMyRosterMsg')) {
                getEl('noMyRosterMsg').style.display = 'block';
                getEl('noMyRosterMsg').textContent = deanCourseScope === 'my' ? 'No course offerings are assigned to you yet.' : 'No course offerings found.';
            }
            return;
        }
        if (msg) msg.style.display = 'none';

        wrap.innerHTML = visibleOfferings.map(o => `
      <button type="button" class="nav-item dean-course-item" style="border:1px solid var(--line);margin-bottom:8px;width:100%;text-align:left;display:block;padding:10px 14px;" data-id="${o.id}">
        <div style="font-weight:800;font-size:13.5px;">${escapeHtml(o.code || '—')}</div>
        <div style="font-size:12px;color:var(--ink-500);font-weight:500;">${escapeHtml(o.title || '—')}</div>
        <div style="font-size:11px;color:var(--ink-300);margin-top:4px;">${escapeHtml(o.schedule || 'Schedule TBA')} · ${escapeHtml(o.semester || '')} ${escapeHtml(o.school_year || '')}</div>
        ${deanCourseScope === 'all' ? `<div style="font-size:11px;color:var(--pink-600);font-weight:600;margin-top:4px;">👨‍🏫 ${escapeHtml(o.instructor_name || 'Unassigned')}</div>` : ''}
      </button>
    `).join('');

        document.querySelectorAll('#myCourseList .nav-item').forEach(btn => {
            btn.addEventListener('click', () => selectMyCourse(btn.dataset.id, btn));
        });

        // Automatically select target course or first course so it displays immediately!
        const targetId = autoSelectId || (selectedMyOffering ? selectedMyOffering.id : visibleOfferings[0]?.id);
        const targetBtn = document.querySelector(`#myCourseList .nav-item[data-id="${targetId}"]`) || document.querySelector('#myCourseList .nav-item');
        if (targetBtn) {
            selectMyCourse(targetBtn.dataset.id, targetBtn);
        }
    }

    async function selectMyCourse(offeringId, btnEl) {
        if (!gradingWorkspace.canLeave()) return;
        gradingWorkspace.startClass(offeringId);
        document.querySelectorAll('#myCourseList .nav-item').forEach(b => b.classList.remove('active'));
        if (btnEl) btnEl.classList.add('active');

        selectedMyOffering = myOfferings.find(o => String(o.id) === String(offeringId));
        if (!selectedMyOffering) return;
        selectedMyOffering.canEditGrades = false;

        getEl('selectedMyCourseTitle').textContent = `${selectedMyOffering.code} — ${selectedMyOffering.title}`;
        getEl('selectedMyCourseSub').textContent = `Section ${selectedMyOffering.section || '—'} · ${selectedMyOffering.semester || ''} ${selectedMyOffering.school_year || ''} · ${selectedMyOffering.schedule || 'Schedule TBA'}${selectedMyOffering.instructor_name ? ` · Instructor: ${selectedMyOffering.instructor_name}` : ''}`;
        getEl('saveMyGradesBtn').disabled = true;

        const [{ data: enrollments, error: rosterError }, { data: existingGrades, error: gradesError }, { data: offeringState, error: offeringError }, assignment] = await Promise.all([
            supabaseClient.rpc('get_class_roster', { p_offering_id: Number(offeringId) }),
            supabaseClient.from('grades').select('*').eq('offering_id', offeringId),
            supabaseClient.from('course_offerings').select('grades_locked').eq('id', offeringId).single(),
            currentProfile.role === 'admin' ? Promise.resolve({ data: [true] }) : supabaseClient.from('teacher_assignments').select('offering_id').eq('teacher_id', currentUserId).eq('offering_id', offeringId).eq('is_active', true).limit(1),
        ]);

        if (String(selectedMyOffering?.id) !== String(offeringId)) return;
        if (gradesError || offeringError) { myRoster = []; renderMyRoster(); showToast('Could not load grades or finalization status. Please retry.', true); return; }
        selectedMyOffering.grades_locked = offeringState?.grades_locked === true;
        selectedMyOffering.canEditGrades = !assignment.error && assignment.data?.length > 0;
        gradingWorkspace.setReadOnly(!selectedMyOffering.canEditGrades);
        if (assignment.error) showToast('Could not verify teaching assignment. Class is read-only; retry to edit.', true);
        gradingWorkspace.setLocked(selectedMyOffering.grades_locked);
        if (rosterError) { myRoster = []; renderMyRoster(); showToast('Could not load class roster: ' + rosterError.message, true); return; }

        const gradeByStudent = {};
        (existingGrades || []).forEach(g => { gradeByStudent[g.student_id] = g; });

        myRoster = (enrollments || [])
            .map(e => {
                const g = gradeByStudent[e.student_id];
                return {
                    student: e.profiles, gradeId: g?.id || null, savedGrade: g || null, grade_scale: g ? (g.grade_scale || 'percentage') : 'school', equivalent: g?.equivalent == null ? null : Number(g.equivalent), remark: g?.remark,
                    prelim: g?.prelim ?? null, midterm: g?.midterm ?? null,
                    semifinal: g?.semifinal ?? null, final: g?.final ?? null,
                };
            })
            .filter(r => r.student)
            .sort((a, b) => (a.student.full_name || '').localeCompare(b.student.full_name || ''));

        renderMyRoster();
        gradingWorkspace.markClean();
        gradingWorkspace.refresh();
        if (getEl('deanClassAuditLogBtn')) getEl('deanClassAuditLogBtn').style.display = myRoster.length > 0 ? 'inline-flex' : 'none';
    }

    function renderMyRoster() {
        const table = getEl('myRosterTable');
        const body = getEl('myRosterBody');
        const msg = getEl('noMyRosterMsg');
        gradingWorkspace.setRosterCount(myRoster.length);

        if (!myRoster.length) {
            table.style.display = 'none';
            msg.style.display = 'block';
            msg.textContent = 'No students are enrolled in this class yet.';
            if (getEl('deanClassAuditLogBtn')) getEl('deanClassAuditLogBtn').style.display = 'none';
            return;
        }
        msg.style.display = 'none';
        table.style.display = 'table';
        if (getEl('deanClassAuditLogBtn')) getEl('deanClassAuditLogBtn').style.display = 'inline-flex';

        const periodInput = (r, idx, field, cls) =>
            `<input type="number" min="1" max="${r.grade_scale === 'percentage' ? 100 : 5}" step="0.01" class="field-input ${cls}" style="width:72px;" data-idx="${idx}" ${window.IMCC_DEVELOPER_VIEW || !selectedMyOffering?.canEditGrades || selectedMyOffering?.grades_locked || r.grade_scale === 'percentage' ? 'readonly' : ''} aria-label="${escapeHtml(r.student.full_name || 'Student')} ${field} school grade" value="${r[field] ?? ''}">`;

        body.innerHTML = myRoster.map((r, idx) => `
      <tr>
        <td><b>${escapeHtml(r.student.full_name || 'N/A')}</b><small class="student-number">${escapeHtml(r.student.student_no || r.student.id_number || '—')}</small></td>
        <td>${periodInput(r, idx, 'prelim', 'my-prelim-input')}</td>
        <td>${periodInput(r, idx, 'midterm', 'my-mid-input')}</td>
        <td>${periodInput(r, idx, 'semifinal', 'my-semifinal-input')}</td>
        <td>${periodInput(r, idx, 'final', 'my-final-input')}</td>
        <td>${periodInput(r, idx, 'equivalent', 'my-equivalent-input')}</td>
        <td class="my-remark-cell" data-idx="${idx}">${previewMyRemarkBadge(r)}</td>
        <td style="text-align:center;white-space:nowrap;">
          <button type="button" class="btn btn-ghost dean-grade-hist-btn" data-idx="${idx}" style="padding:4px 9px;font-size:12px;display:inline-flex;align-items:center;gap:4px;" title="View history & revert">
            <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 14 14"/></svg>
            History
          </button>
        </td>
      </tr>
    `).join('');

        const fieldByClass = { 'my-prelim-input': 'prelim', 'my-mid-input': 'midterm', 'my-semifinal-input': 'semifinal', 'my-final-input': 'final', 'my-equivalent-input': 'equivalent' };
        document.querySelectorAll('.my-prelim-input, .my-mid-input, .my-semifinal-input, .my-final-input, .my-equivalent-input').forEach(input => {
            input.addEventListener('input', (e) => {
                const idx = Number(e.target.dataset.idx);
                const val = e.target.value === '' ? null : Number(e.target.value);
                const field = fieldByClass[[...e.target.classList].find(c => fieldByClass[c])];
                myRoster[idx][field] = val;
                document.querySelector(`.my-remark-cell[data-idx="${idx}"]`).innerHTML = previewMyRemarkBadge(myRoster[idx]);
            });
        });

        document.querySelectorAll('.dean-grade-hist-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const idx = Number(btn.dataset.idx);
                if (myRoster[idx]) openDeanStudentGradeHistory(myRoster[idx]);
            });
        });
    }

    document.querySelector('.lock-grades-btn').addEventListener('click', async () => {
        if (!selectedMyOffering || !gradingWorkspace.canFinalize()) return;
        if (!confirm('Lock all grades for this class? Normal grade entry and history reverts will be disabled.')) return;
        const button = document.querySelector('.lock-grades-btn');
        button.disabled = true;
        try {
            const { error } = await supabaseClient.rpc('lock_class_grades', { p_offering_id: Number(selectedMyOffering.id) });
            if (error) throw error;
            selectedMyOffering.grades_locked = true;
            gradingWorkspace.setLocked(true);
            renderMyRoster();
            gradingWorkspace.markClean();
            showToast('Grades finalized and locked.');
        } catch (error) { showToast('Could not lock grades: ' + error.message, true); }
        finally { gradingWorkspace.refresh(); }
    });

    // Grade preview — delegated to shared/grading.js
    function previewMyEquivalent(r) { return Grading.previewEquivalent(r); }
    function previewMyRemarkBadge(r) { return Grading.previewRemarkBadge(r); }

    getEl('saveMyGradesBtn').addEventListener('click', async () => {
        if (!selectedMyOffering?.canEditGrades || !myRoster.length) return;
        const btn = getEl('saveMyGradesBtn');
        if (!gradingWorkspace.validate()) return;
        gradingWorkspace.setSaving(true);
        btn.disabled = true;
        btn.textContent = 'Saving…';

        let successCount = 0, failCount = 0;

        try {
            for (const r of myRoster) {
                if (r.grade_scale === 'percentage' || selectedMyOffering?.grades_locked) continue;
                const { data, error, skipped } = await Grading.saveGrade(supabaseClient, r, selectedMyOffering.id);
                if (skipped) continue;
                if (error || !data) { failCount++; showToast(`${r.student.full_name || 'Student'}: ${error?.message || 'Save failed'}`, true); }
                else { Object.assign(r, data, { gradeId: data.id, savedGrade: data }); successCount++; }
            }

        } catch (error) {
            failCount++;
            showToast('Could not save grades: ' + error.message, true);
        } finally {
            gradingWorkspace.setSaving(false);
        }
        if (successCount) renderMyRoster();
        if (failCount === 0) gradingWorkspace.markClean();
        else gradingWorkspace.saveFailed();
        btn.textContent = 'Save Grades';

        if (failCount === 0) showToast(`Saved grades for ${successCount} student${successCount === 1 ? '' : 's'}.`);
        else showToast(`Saved ${successCount}, failed ${failCount}. Changes kept; reload the class to resolve conflicts.`, true);

        // Keep department-wide analytics (avg GWA, pass/fail bars, flagged courses) in sync.
        const { data: gradeRows, error: refreshError } = await IMCC.fetchAll(() => supabaseClient.from('grades').select('*, course_offerings(code, title, units, program, instructor_name)'));
        if (refreshError) { showToast('Grades saved, but reports could not refresh. Displayed reports may be outdated.', true); return; }
        state.grades = gradeRows;
        renderOverview();
        renderGradReadiness();
    });

    // ── Dean Grade History & Revert System ───────────────────────────────
    async function openDeanStudentGradeHistory(r) {
        if (!selectedMyOffering || !r || !r.student) return;
        const modal = getEl('gradeHistoryModal');
        const title = getEl('gradeHistoryModalTitle');
        const sub = getEl('gradeHistoryModalSub');
        const currentBox = getEl('gradeHistoryCurrentBox');
        const body = getEl('gradeHistoryBody');
        const noMsg = getEl('noGradeHistoryMsg');

        title.textContent = `Grade History — ${r.student.full_name || 'Student'}`;
        sub.textContent = `${selectedMyOffering.code}: ${selectedMyOffering.title} · Student No: ${r.student.student_no || r.student.id_number || 'N/A'}`;

        const eq = previewMyEquivalent(r);
        const rem = previewMyRemarkBadge(r);

        currentBox.innerHTML = `
            <div style="display:flex;justify-content:space-between;align-items:center;">
                <span style="font-weight:700;font-size:13px;color:var(--ink-700);">Current Active Grade</span>
                <span style="font-size:11.5px;color:var(--ink-500);font-weight:500;">Saved in Portal</span>
            </div>
            <div class="current-grade-grid">
                <div class="current-grade-item"><div class="current-grade-label">Prelim</div><div class="current-grade-val">${r.prelim != null ? r.prelim : '—'}</div></div>
                <div class="current-grade-item"><div class="current-grade-label">Midterm</div><div class="current-grade-val">${r.midterm != null ? r.midterm : '—'}</div></div>
                <div class="current-grade-item"><div class="current-grade-label">Semi-Final</div><div class="current-grade-val">${r.semifinal != null ? r.semifinal : '—'}</div></div>
                <div class="current-grade-item"><div class="current-grade-label">Final</div><div class="current-grade-val">${r.final != null ? r.final : '—'}</div></div>
                <div class="current-grade-item"><div class="current-grade-label">Equivalent</div><div class="current-grade-val">${eq}</div></div>
                <div class="current-grade-item"><div class="current-grade-label">Remark</div><div class="current-grade-val" style="font-size:12px;">${rem}</div></div>
            </div>
        `;

        body.innerHTML = '<tr><td colspan="11" style="text-align:center;padding:24px;color:var(--ink-500);">Loading revision history…</td></tr>';
        noMsg.style.display = 'none';
        modal.classList.add('open');

        const { data: historyRows, error } = await supabaseClient
            .from('v_grade_history')
            .select('*')
            .eq('offering_id', selectedMyOffering.id)
            .eq('student_id', r.student.id)
            .order('created_at', { ascending: false });

        if (error) {
            body.innerHTML = `<tr><td colspan="11" style="text-align:center;padding:24px;color:var(--red);">Failed to load history: ${escapeHtml(error.message)}</td></tr>`;
            return;
        }

        renderDeanHistoryRows(historyRows || [], r);
    }

    async function openDeanClassGradeHistory() {
        if (!selectedMyOffering) return;
        const modal = getEl('gradeHistoryModal');
        const title = getEl('gradeHistoryModalTitle');
        const sub = getEl('gradeHistoryModalSub');
        const currentBox = getEl('gradeHistoryCurrentBox');
        const body = getEl('gradeHistoryBody');
        const noMsg = getEl('noGradeHistoryMsg');

        title.textContent = `Class Grade Audit Log — ${selectedMyOffering.code}`;
        sub.textContent = `${selectedMyOffering.title} · ${selectedMyOffering.semester || ''} ${selectedMyOffering.school_year || ''}`;

        currentBox.innerHTML = `
            <div style="display:flex;justify-content:space-between;align-items:center;">
                <span style="font-weight:700;font-size:13px;color:var(--ink-700);">Class Audit Trail & Revision History (Dean Oversight)</span>
                <span style="font-size:12px;color:var(--ink-500);">${myRoster.length} students enrolled</span>
            </div>
            <div style="font-size:12px;color:var(--ink-500);margin-top:6px;">
                Complete record of all grade entries, faculty updates, and reversions for this class. Reverting will restore prior grade values and append a new audit log.
            </div>
        `;

        body.innerHTML = '<tr><td colspan="11" style="text-align:center;padding:24px;color:var(--ink-500);">Loading class grade history…</td></tr>';
        noMsg.style.display = 'none';
        modal.classList.add('open');

        const { data: historyRows, error } = await supabaseClient
            .from('v_grade_history')
            .select('*')
            .eq('offering_id', selectedMyOffering.id)
            .order('created_at', { ascending: false });

        if (error) {
            body.innerHTML = `<tr><td colspan="11" style="text-align:center;padding:24px;color:var(--red);">Failed to load history: ${escapeHtml(error.message)}</td></tr>`;
            return;
        }

        renderDeanHistoryRows(historyRows || [], null);
    }

    function renderDeanHistoryRows(rows, targetStudent) {
        Grading.renderHistoryRows(rows, targetStudent, (histEntry, studentId) => {
            executeDeanRevert(histEntry, targetStudent || myRoster.find(x => x.student.id === studentId));
        }, selectedMyOffering?.grades_locked, !selectedMyOffering?.canEditGrades);
    }

    async function executeDeanRevert(histEntry, studentRosterItem) {
        await Grading.executeRevert({
            supabaseClient,
            histEntry,
            studentRosterItem,
            locked: selectedMyOffering?.grades_locked,
            readOnly: !selectedMyOffering?.canEditGrades,
            roleLabel: '(Dean Oversight)',
            showToast,
            async onDone(data, item) {
                if (item) {
                    renderMyRoster();
                    if (getEl('gradeHistoryModal').classList.contains('open')) {
                        openDeanStudentGradeHistory(item);
                    }
                } else if (selectedMyOffering) {
                    selectMyCourse(selectedMyOffering.id);
                }
                showToast('Grade successfully reverted!');

                // Refresh overview
                const { data: gradeRows, error } = await IMCC.fetchAll(() => supabaseClient.from('grades').select('*, course_offerings(code, title, units, program, instructor_name)'));
                if (error) { showToast('Grade reverted, but reports could not refresh. Displayed reports may be outdated.', true); return; }
                state.grades = gradeRows;
                renderOverview();
                    }
        });
    }

    getEl('gradeHistoryCloseBtn')?.addEventListener('click', () => getEl('gradeHistoryModal').classList.remove('open'));
    getEl('gradeHistoryDoneBtn')?.addEventListener('click', () => getEl('gradeHistoryModal').classList.remove('open'));
    getEl('deanClassAuditLogBtn')?.addEventListener('click', openDeanClassGradeHistory);

    getEl('deanAddClassBtn')?.addEventListener('click', () => {
        openModal('courseOffering');
    });

    // ══════════════════════════════════════════════════════════════════
    // GENERIC MODAL SYSTEM
    // ══════════════════════════════════════════════════════════════════
    const modalConfigs = {
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
        courseOffering: {
            title: 'Add Subject / Course Offering',
            table: 'course_offerings',
            fields: [
                { name: 'catalog_search', label: 'Search subjects', type: 'search', required: false, placeholder: 'Subject code or title' },
                { name: 'catalog_course', label: 'Quick Select Subject from Curriculum (Auto-fills details)', type: 'select', required: false, optionsFn: () => [{ value: '', label: '— Choose from Curriculum (50+ Subjects) —' }, ...state.courses.map(c => ({ value: c.code, label: `${c.code} — ${c.title} (${(c.lec_units || 0) + (c.lab_units || 0) || c.units || 3.0} units)` }))] },
                { name: 'code', label: 'Subject Code', type: 'text', required: true, placeholder: 'e.g. CAP 102 or CC 101' },
                { name: 'title', label: 'Course Title', type: 'text', required: true, placeholder: 'e.g. Capstone Project and Research 2' },
                { name: 'program', label: 'Program', type: 'select', required: true, options: [{ value: 'BSIT', label: 'BSIT' }, { value: 'BSCS', label: 'BSCS' }, { value: 'BSIS', label: 'BSIS' }] },
                { name: 'year', label: 'Year Level', type: 'select', required: true, options: [{ value: '1', label: '1st Year' }, { value: '2', label: '2nd Year' }, { value: '3', label: '3rd Year' }, { value: '4', label: '4th Year' }] },
                { name: 'semester', label: 'Semester', type: 'select', required: true, options: [{ value: '1st Semester', label: '1st Semester' }, { value: '2nd Semester', label: '2nd Semester' }, { value: 'Summer', label: 'Summer' }] },
                { name: 'school_year', label: 'School Year', type: 'text', required: true, placeholder: '2026-2027', default: '2026-2027' },
                { name: 'units', label: 'Total Units', type: 'number', required: true, placeholder: '3.0', default: '3.0' },
                { name: 'schedule', label: 'Schedule', type: 'text', required: false, placeholder: 'e.g. MWF 08:00–09:30 or TTH 13:00–14:30' },
                // instructor_id uses a dedicated async-populated dropdown (type: 'instructor_select').
                // openModal handles the RPC load and renders the <select> itself.
                { name: 'instructor_id', label: 'Assigned Instructor (optional)', type: 'instructor_select', required: false },
            ],
            transform: (values) => {
                // Resolve full_name from whichever instructor list is available.
                const instructorSource = (state.instructorOptions && state.instructorOptions.length)
                    ? state.instructorOptions
                    : state.facultyList;
                const instructor = instructorSource.find(f => f.id === values.instructor_id);
                return {
                    code: values.code,
                    title: values.title,
                    program: values.program,
                    year: Number(values.year) || 1,
                    semester: values.semester,
                    school_year: values.school_year || '2026–2027',
                    units: Number(values.units),
                    schedule: values.schedule || null,
                    // Set instructor_id to the selected profile's id (null if unselected).
                    instructor_id: values.instructor_id || null,
                    // Set instructor_name to the selected profile's full_name (null if unselected).
                    instructor_name: instructor ? instructor.full_name : null,
                };
            },
            onSaved: async (savedRow) => {
                const { data: offerings, error } = await IMCC.fetchAll(() => supabaseClient.from('course_offerings').select('*'));
                if (error) { showToast('Subject saved, but the list could not refresh. Reload to retry.', true); return; }
                state.offerings = offerings;
                renderFacultyPage();
                await loadMyClasses(savedRow?.id);
                showToast('Subject offering saved successfully.');
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
    let editingOfferingId = null;

    document.querySelectorAll('[data-modal]').forEach(btn => btn.addEventListener('click', () => openModal(btn.dataset.modal)));

    // An unavailable instructor list must still allow saving an unassigned subject.
    function renderInstructorDropdown(existingInstructorId = null, existingInstructorName = null) {
        const wrapper = getEl('instructorSelectWrapper');
        if (!wrapper) return;
        const options = state.instructorOptions || [];
        const legacy = existingInstructorId && !options.some(f => String(f.id) === String(existingInstructorId));
        wrapper.innerHTML = '<label for="field_instructor_id">Assigned Instructor (optional)</label>' +
            '<select id="field_instructor_id" class="field-input"><option value="">Unassigned — pending assignment</option>' +
            (legacy ? '<option selected value="' + escapeHtml(existingInstructorId) + '">' + escapeHtml(existingInstructorName || 'Previous instructor') + ' (choose an active replacement or Unassigned)</option>' : '') +
            options.map(f => '<option value="' + escapeHtml(f.id) + '" ' + (String(f.id) === String(existingInstructorId) ? 'selected' : '') + '>' + escapeHtml(f.full_name) + (f.id === currentUserId ? ' (You)' : '') + '</option>').join('') + '</select>' +
            (state.instructorOptions === null ? '<p role="status">Loading instructors. You can save the subject as unassigned.</p>' : state.instructorOptionsError ? '<p role="status">Instructors could not be loaded. Save as unassigned or <button type="button" id="retryInstructorLoad">Retry</button>.</p>' : '');
        getEl('retryInstructorLoad')?.addEventListener('click', async () => { await loadInstructorOptions(true); renderInstructorDropdown(existingInstructorId, existingInstructorName); });
    }

    function openModal(key, initialValues = null) {
        const cfg = modalConfigs[key];
        if (!cfg) return;
        activeModalKey = key;
        editingOfferingId = (initialValues && initialValues.id) ? initialValues.id : null;
        getEl('modalTitle').textContent = editingOfferingId ? `Edit ${cfg.title.replace(/^Add\s+/i, '')}` : cfg.title;

        getEl('modalOverlay').classList.toggle('course-offering-modal', key === 'courseOffering');
        getEl('modalSaveBtn').textContent = key === 'courseOffering' ? (editingOfferingId ? 'Save changes' : 'Add course offering') : 'Save';
        const form = getEl('modalForm');
        form.innerHTML = cfg.fields.map(f => {
            const id = `field_${f.name}`;
            const initialVal = (initialValues && initialValues[f.name] !== undefined) ? initialValues[f.name] : (f.default ?? '');

            // instructor_select: rendered asynchronously by renderInstructorDropdown().
            // We emit a wrapper div here; the actual <select> is injected after the RPC.
            if (f.type === 'instructor_select') {
                return `<div class="form-row" id="instructorSelectWrapper"></div>`;
            }

            if (f.type === 'select') {
                const options = f.options || (f.optionsFn ? f.optionsFn() : []);
                return `
          <div class="form-row">
            <label for="${id}">${escapeHtml(f.label)}</label>
            <select id="${id}" class="field-input" ${f.required ? 'required' : ''}>
              <option value="">Select…</option>
              ${options.map(o => `<option value="${escapeHtml(o.value)}" ${String(o.value) === String(initialVal) ? 'selected' : ''}>${escapeHtml(o.label)}</option>`).join('')}
            </select>
          </div>`;
            }
            if (f.type === 'textarea') {
                return `
          <div class="form-row">
            <label for="${id}">${escapeHtml(f.label)}</label>
            <textarea id="${id}" class="field-input" placeholder="${escapeHtml(f.placeholder || '')}" ${f.required ? 'required' : ''}>${escapeHtml(String(initialVal || ''))}</textarea>
          </div>`;
            }
            return `
        <div class="form-row">
          <label for="${id}">${escapeHtml(f.label)}</label>
          <input type="${f.type}" id="${id}" class="field-input" placeholder="${escapeHtml(f.placeholder || '')}" value="${escapeHtml(String(initialVal ?? ''))}" ${f.required ? 'required' : ''}>
        </div>`;
        }).join('');

        // If courseOffering, bind catalog course auto-fill and populate instructor dropdown.
        if (key === 'courseOffering') {
            const codeInput = getEl('field_code');
            const search = getEl('field_catalog_search');
            const catalogSelect = getEl('field_catalog_course');
            const insights = window.imccSubjectPicker(catalogSelect, search, state.courses, form);

            const isEdit = Boolean(editingOfferingId);
            const existingInstructorId = (initialValues && initialValues.instructor_id) ? initialValues.instructor_id : null;
            const existingInstructorName = (initialValues && initialValues.instructor_name) ? initialValues.instructor_name : null;

            // Show whatever we have immediately (may be loading state, legacy state, or eligible).
            renderInstructorDropdown(existingInstructorId, existingInstructorName, isEdit);

            // If the RPC hasn't resolved yet, kick off the load and refresh the dropdown when done.
            if (state.instructorOptions === null) {
                loadInstructorOptions().then(() => renderInstructorDropdown(existingInstructorId, existingInstructorName, isEdit));
            } else if (!state.instructorOptions.length && !state.instructorOptionsError) {
                // We have a stale empty result — re-fetch once to be sure.
                loadInstructorOptions(true).then(() => renderInstructorDropdown(existingInstructorId, existingInstructorName, isEdit));
            }

            // Add datalist for codeInput
            if (codeInput && state.courses && state.courses.length) {
                let dl = getEl('deanCurriculumDatalist');
                if (!dl) {
                    dl = document.createElement('datalist');
                    dl.id = 'deanCurriculumDatalist';
                    document.body.appendChild(dl);
                }
                dl.innerHTML = state.courses.map(c => `<option value="${escapeHtml(c.code)}">${escapeHtml(c.title)}</option>`).join('');
                codeInput.setAttribute('list', 'deanCurriculumDatalist');
                codeInput.setAttribute('autocomplete', 'off');
            }

            const applyCourse = (c) => {
                if (!c) return;
                insights.textContent = [c.code + ' — ' + c.title, 'Year ' + (c.year_level || '—'), c.semester === 3 ? 'Summer' : c.semester === 2 ? '2nd Semester' : '1st Semester', ((c.lec_units || 0) + (c.lab_units || 0) || c.units || 3) + ' units', 'Prerequisites: ' + (c.prerequisites || 'None')].join(' · ');
                const units = (c.lec_units || 0) + (c.lab_units || 0) || c.units || 3.0;
                const semStr = c.semester === 2 ? '2nd Semester' : (c.semester === 3 ? 'Summer' : '1st Semester');
                if (getEl('field_code')) getEl('field_code').value = c.code || '';
                if (getEl('field_title')) getEl('field_title').value = c.title || '';
                if (getEl('field_units')) getEl('field_units').value = units;
                if (getEl('field_program')) getEl('field_program').value = c.program || 'BSIT';
                if (getEl('field_year') && c.year_level) getEl('field_year').value = String(c.year_level);
                if (getEl('field_semester')) getEl('field_semester').value = semStr;
                if (catalogSelect) catalogSelect.value = c.code || '';
            };

            catalogSelect?.addEventListener('change', (e) => {
                const val = (e.target.value || '').trim().toLowerCase();
                const matched = state.courses.find(c => c.code.toLowerCase() === val);
                if (matched) applyCourse(matched);
            });

            codeInput?.addEventListener('input', (e) => {
                const rawVal = (e.target.value || '').trim();
                const normalized = rawVal.replace(/\s+/g, '').toLowerCase();
                if (!normalized) return;
                const matched = state.courses.find(c =>
                    c.code.toLowerCase() === rawVal.toLowerCase() ||
                    c.code.replace(/\s+/g, '').toLowerCase() === normalized
                );
                if (matched) applyCourse(matched);
            });
        }

        getEl('modalOverlay').classList.add('open');
    }

    function closeModal() { getEl('modalOverlay').classList.remove('open'); activeModalKey = null; editingOfferingId = null; }
    getEl('modalCancelBtn').addEventListener('click', closeModal);
    getEl('modalOverlay').addEventListener('click', (e) => { if (e.target.id === 'modalOverlay') closeModal(); });

    getEl('modalSaveBtn').addEventListener('click', async () => {
        const cfg = modalConfigs[activeModalKey];
        if (!cfg) return;

        const values = {};
        for (const f of cfg.fields) {
            // Skip the catalog auto-fill helper and the instructor_select placeholder
            // (instructor_select is validated and read specifically below).
            if (f.name === 'catalog_course' || f.name === 'catalog_search') continue;
            if (f.type === 'instructor_select') continue;

            const el = getEl(`field_${f.name}`);
            if (!el) continue;
            const val = el.value.trim();
            if (f.required && !val) { showToast(`${f.label} is required.`, true); if (el.closest('details')) el.closest('details').open = true; el.focus(); return; }
            if (f.type === 'number' && (!Number.isFinite(Number(val)) || Number(val) <= 0)) { showToast(`${f.label} must be a positive number.`, true); el.focus(); return; }
            values[f.name] = f.type === 'number' ? (val === '' ? null : Number(val)) : (val || null);
        }

        // Special handling for courseOffering: instructor assignment validation & atomic save
        if (activeModalKey === 'courseOffering') {
            const selectedInstructorId = getEl('field_instructor_id')?.value.trim() || '';
            const selectedInstructor = (state.instructorOptions || []).find(o => String(o.id) === selectedInstructorId);
            if (selectedInstructorId && !selectedInstructor) {
                showToast('Choose an approved active instructor or leave the subject unassigned.', true); return;
            }
            values.instructor_id = selectedInstructor?.id || null;
            values.instructor_name = selectedInstructor?.full_name || null;

            const saveBtn = getEl('modalSaveBtn');
            const originalBtnText = saveBtn.textContent;
            saveBtn.disabled = true;
            saveBtn.textContent = 'Saving…';

            try {
                // Attempt atomic write via Postgres RPC
                const rpcPayload = {
                    p_offering_id: editingOfferingId ? Number(editingOfferingId) : null,
                    p_code: values.code,
                    p_title: values.title,
                    p_units: Number(values.units),
                    p_program: values.program,
                    p_year: Number(values.year) || 1,
                    p_semester: values.semester,
                    p_school_year: values.school_year || '2026–2027',
                    p_schedule: values.schedule || null,
                    p_instructor_id: selectedInstructor?.id || null,
                };

                let savedRow = null;
                let saveErr = null;

                const { data: rpcData, error: rpcErr } = await supabaseClient.rpc(
                    'save_course_offering_with_instructor',
                    rpcPayload
                );

                if (!rpcErr) {
                    savedRow = rpcData;
                } else {
                    // A direct offering write is also atomic through the database assignment trigger.
                    const isRpcMissing = rpcErr.code === 'PGRST202' ||
                        (rpcErr.message && rpcErr.message.includes('function') && rpcErr.message.includes('does not exist'));

                    if (isRpcMissing) {
                        console.warn('save_course_offering_with_instructor RPC not found, falling back to trigger-synchronized offering write:', rpcErr.message);
                        const directPayload = {
                            code: values.code,
                            title: values.title,
                            program: values.program,
                            year: Number(values.year) || 1,
                            semester: values.semester,
                            school_year: values.school_year || '2026–2027',
                            units: Number(values.units),
                            schedule: values.schedule || null,
                            instructor_id: selectedInstructor?.id || null,
                            instructor_name: selectedInstructor?.full_name || null,
                        };

                        if (editingOfferingId) {
                            const { data, error } = await supabaseClient.from('course_offerings')
                                .update(directPayload).eq('id', editingOfferingId).select().single();
                            if (error) {
                                saveErr = error;
                            } else {
                                savedRow = data;
                            }
                        } else {
                            const { data, error } = await supabaseClient.from('course_offerings')
                                .insert(directPayload).select().single();
                            if (error) {
                                saveErr = error;
                            } else {
                                savedRow = data;
                            }
                        }
                    } else {
                        saveErr = rpcErr;
                    }
                }

                if (saveErr) {
                    showToast('Failed to save offering: ' + (saveErr.message || 'Database error'), true);
                    return;
                }

                showToast(editingOfferingId ? 'Updated successfully.' : 'Saved successfully.');
                closeModal();
                if (cfg.onSaved) cfg.onSaved(savedRow);
            } finally {
                saveBtn.disabled = false;
                saveBtn.textContent = originalBtnText;
            }
            return;
        }

        // Standard save logic for faculty notes and appeals.
        const payload = cfg.transform ? cfg.transform(values) : values;
        let saveRes;
        if (editingOfferingId) {
            saveRes = await supabaseClient.from(cfg.table).update(payload).eq('id', editingOfferingId).select().single();
        } else {
            saveRes = await supabaseClient.from(cfg.table).insert(payload).select().single();
        }

        const { data: savedRow, error } = saveRes;

        if (error) {
            if (isMissingTableError(error)) showToast(`This feature needs the "${cfg.table}" table — run dean-dashboard-schema.sql first.`, true);
            else showToast('Failed to save: ' + error.message, true);
            return;
        }

        showToast(editingOfferingId ? 'Updated successfully.' : 'Saved successfully.');
        closeModal();
        if (cfg.onSaved) cfg.onSaved(savedRow);
    });

    // ── Quick Links (SSO) — delegated to FC ──
    async function loadSSOLinks() {
        await FC.loadSSOLinks(supabaseClient, currentProfile?.role || 'dean');
    }

    // ── Logout ──────────────────────────────────────────────────────────
    getEl('signOutBtn').addEventListener('click', async () => {
        await supabaseClient.auth.signOut();
        window.location.href = '../auth/login.html';
    });

    // ── Init ────────────────────────────────────────────────────────────
    const ok = await checkDeanAuth();
    if (!ok) return;

    try { await loadAllData(); }
    catch (error) {
        if (window.imccHidePreloader) window.imccHidePreloader();
        getEl('pageTitle').textContent = 'Dashboard unavailable';
        const notice = document.createElement('p');
        notice.setAttribute('role', 'alert');
        notice.textContent = 'Could not load dashboard data. Reload to retry. Reports are unavailable.';
        getEl('page-dashboard').replaceChildren(notice);
        showToast('Could not load dashboard: ' + error.message, true);
        return;
    }
    await loadSSOLinks();
    getEl('refreshEnrollmentNotifications').addEventListener('click', () => FC.loadEnrollmentNotifications(supabaseClient));
    await FC.loadEnrollmentNotifications(supabaseClient);
    renderOverview();
    renderFacultyPage();
    await loadMyClasses();
    renderGradReadiness();
    await Promise.all([loadNotes(), loadAppeals()]);
    renderStudentPicker('clearance');
    renderStudentPicker('record');

    if (window.imccHidePreloader) window.imccHidePreloader();
});
