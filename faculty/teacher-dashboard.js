/* =====================================================================
   MyIMCC Portal — Faculty Dashboard Logic (Supabase Integration Layer)
   Mirrors the student portal's dashboard.js: same helpers, same
   navigation/theme/toast/dropdown patterns, same Supabase query style.
   ===================================================================== */

let currentOfferingId = null;
let currentRoster = [];
let facultyProfile = null;

// ── Navigation (mirrors the student portal's page switcher) ─────────
function goto(page) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    const pageEl = document.getElementById('page-' + page);
    if (pageEl) pageEl.classList.add('active');
    document.querySelectorAll('.nav-item[data-page]').forEach(n => n.classList.toggle('active', n.dataset.page === page));

    const titles = {
        dashboard: 'Dashboard', classes: 'My Classes', attendance: 'Attendance',
        announcements: 'Announcements', schedule: 'Teaching Schedule',
        messages: 'Messages', profile: 'My Profile'
    };
    const titleEl = document.getElementById('pageTitle');
    if (titleEl) titleEl.textContent = titles[page] || 'Dashboard';
    document.getElementById('userDropdown')?.classList.remove('open');
    window.scrollTo({ top: 0, behavior: 'smooth' });
}
document.querySelectorAll('[data-page]').forEach(el => el.addEventListener('click', () => goto(el.dataset.page)));
document.querySelectorAll('[data-goto]').forEach(el => el.addEventListener('click', () => goto(el.dataset.goto)));

// ── Dropdown + theme toggle (same behavior as the student portal) ───
function setupDropdown(btnId, ddId) {
    const btn = document.getElementById(btnId), dd = document.getElementById(ddId);
    if (!btn || !dd) return;
    btn.addEventListener('click', e => { e.stopPropagation(); dd.classList.toggle('open'); });
    document.addEventListener('click', () => dd.classList.remove('open'));
    dd.addEventListener('click', e => e.stopPropagation());
}
setupDropdown('userBtn', 'userDropdown');

let darkMode = false;
document.getElementById('themeToggle')?.addEventListener('click', () => {
    darkMode = !darkMode;
    document.body.setAttribute('data-theme', darkMode ? 'dark' : 'light');
    const label = document.getElementById('themeLabel');
    const icon = document.getElementById('themeIcon');
    if (label) label.textContent = darkMode ? 'Light' : 'Dark';
    if (icon) {
        icon.innerHTML = darkMode
            ? '<circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4"/>'
            : '<path d="M21 12.8A9 9 0 1111.2 3 7 7 0 0021 12.8z"/>';
    }
});

// ── Toast (identical markup/behavior to the student portal) ─────────
let toastTimer;
function showToast(msg, isError = false) {
    const t = document.getElementById('toast');
    const msgEl = document.getElementById('toastMsg');
    if (!t || !msgEl) return;
    msgEl.textContent = msg;
    t.style.background = isError ? 'var(--red)' : 'var(--ink-900)';
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 3500);
}

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str ?? '';
    return div.innerHTML;
}
function initials(name) {
    return (name || '?').trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase();
}

// ── Init ──────────────────────────────────────────────────────────
async function init() {
    const auth = await requireAuth(['faculty', 'admin']);
    if (!auth) return;
    facultyProfile = auth.profile;

    const name = facultyProfile.full_name || 'Faculty';
    document.getElementById('sidebarName').textContent = name;
    document.getElementById('sidebarRole').textContent = facultyProfile.role === 'admin' ? 'Admin' : 'Faculty';
    document.getElementById('sidebarAvatar').textContent = initials(name);
    document.getElementById('topAvatar').textContent = initials(name);
    document.getElementById('topName').textContent = name.split(' ')[0] || 'Faculty';
    document.getElementById('heroGreeting').textContent = `Welcome, ${name.split(' ')[0]}! 👋`;

    document.getElementById('profileName').textContent = name;
    document.getElementById('profileEmail').textContent = auth.user?.email || '—';
    document.getElementById('profileRole').textContent = facultyProfile.role === 'admin' ? 'Admin' : 'Faculty';
    document.getElementById('profilePhone').textContent = facultyProfile.phone || '—';
    document.getElementById('profileAddress').textContent = facultyProfile.address || '—';
    document.getElementById('profileAvatar').textContent = initials(name);
    document.getElementById('editPhone').value = facultyProfile.phone || '';
    document.getElementById('editAddress').value = facultyProfile.address || '';
    document.getElementById('editAvatar').value = facultyProfile.avatar_url || '';

    await Promise.all([
        loadClasses(),
        loadAttendanceClasses(),
        loadAnnouncements(),
        loadSchedule(),
        loadMessages(),
        loadSSOLinks(facultyProfile.role || 'faculty'),
    ]);
}

document.getElementById('signOutBtn')?.addEventListener('click', async () => {
    try { await supabase.auth.signOut(); } catch (e) { console.warn('signOut error', e); }
    window.location.href = 'login.html';
});

document.getElementById('saveProfileBtn')?.addEventListener('click', async () => {
    try {
        const { data: { user } } = await supabase.auth.getUser();
        const update = {
            phone: document.getElementById('editPhone').value.trim() || null,
            address: document.getElementById('editAddress').value.trim() || null,
            avatar_url: document.getElementById('editAvatar').value.trim() || null,
        };
        const { error } = await supabase.from('profiles').update(update).eq('id', user.id);
        if (error) throw error;
        document.getElementById('profilePhone').textContent = update.phone || '—';
        document.getElementById('profileAddress').textContent = update.address || '—';
        showToast('Profile updated');
    } catch (err) {
        showToast('Error: ' + err.message, true);
    }
});

document.getElementById('changePassBtn')?.addEventListener('click', async () => {
    try {
        const { data: { user } } = await supabase.auth.getUser();
        const { error } = await supabase.auth.resetPasswordForEmail(user.email);
        if (error) throw error;
        showToast('Password reset email sent');
    } catch (err) {
        showToast('Error: ' + err.message, true);
    }
});

// ── Quick Links (SSO) ────────────────────────────────────────────────
async function loadSSOLinks(role) {
    const { data: links, error } = await supabase
        .from('sso_links').select('*').eq('is_active', true).order('sort_order');
    const nav = document.getElementById('ssoLinksNav');
    if (!nav) return;
    if (error) { console.warn('loadSSOLinks error', error); return; }

    const visible = (links || []).filter(l => (l.roles || '').split(',').map(r => r.trim()).includes(role));
    nav.innerHTML = visible.map(l => `
    <a href="${l.url}" target="_blank" rel="noopener" class="nav-item" style="text-decoration:none;">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:17px;height:17px;"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></svg>
      ${escapeHtml(l.label)}
    </a>`).join('') || '<div class="nav-item soon" style="opacity:.4;">No links configured</div>';
}

// ── My Classes ────────────────────────────────────────────────────────
async function loadClasses() {
    try {
        const { data: { user } } = await supabase.auth.getUser();
        const { data: profile } = await supabase.from('profiles').select('id, full_name').eq('id', user.id).single();

        const { data: offerings, error } = await supabase
            .from('course_offerings').select('*')
            .ilike('instructor_name', `%${profile.full_name}%`)
            .order('school_year', { ascending: false });
        if (error) throw error;

        const classes = await Promise.all((offerings || []).map(async (o) => {
            const { count: studentCount } = await supabase
                .from('enrollments').select('id', { count: 'exact', head: true })
                .eq('offering_id', o.id).eq('status', 'enrolled');
            const { count: gradedCount } = await supabase
                .from('grades').select('id', { count: 'exact', head: true })
                .eq('offering_id', o.id).not('final', 'is', null);
            return { ...o, student_count: studentCount || 0, graded_count: gradedCount || 0 };
        }));

        const totalStudents = classes.reduce((s, c) => s + c.student_count, 0);
        const totalPending = classes.reduce((s, c) => s + (c.student_count - c.graded_count), 0);
        document.getElementById('classCount').textContent = classes.length;
        document.getElementById('studentCount').textContent = totalStudents;
        document.getElementById('pendingGrades').textContent = totalPending;

        if (classes.length === 0) {
            document.getElementById('classesTable').innerHTML =
                '<tr><td colspan="6" style="text-align:center;padding:24px;color:var(--ink-300);">No classes assigned for this term.</td></tr>';
            return;
        }

        document.getElementById('classesTable').innerHTML = classes.map(c => `
      <tr>
        <td><strong>${escapeHtml(c.code)}</strong></td>
        <td>${escapeHtml(c.title)}</td>
        <td style="color:var(--ink-500);">${escapeHtml(c.schedule || 'TBA')}</td>
        <td>${c.student_count}</td>
        <td>${c.graded_count} / ${c.student_count}</td>
        <td><button class="btn btn-primary btn-sm" onclick="openRoster(${c.id}, '${escapeHtml(c.code)} — ${escapeHtml(c.title)}')">View Roster &amp; Grades</button></td>
      </tr>
    `).join('');
    } catch (err) {
        console.error('Load classes error:', err);
        document.getElementById('classesTable').innerHTML =
            `<tr><td colspan="6" style="text-align:center;padding:24px;color:var(--red);">Error: ${escapeHtml(err.message)}</td></tr>`;
    }
}

async function openRoster(offeringId, title) {
    currentOfferingId = offeringId;
    document.getElementById('gradeModalTitle').textContent = title;
    document.getElementById('gradeModal').style.display = 'flex';
    document.getElementById('gradeModalBody').innerHTML = '<p>Loading roster...</p>';

    try {
        const { data: enrollments, error } = await supabase
            .from('enrollments')
            .select('student_id, profiles!inner(student_no, full_name, program), grades(midterm, final, equivalent, remark)')
            .eq('offering_id', offeringId).eq('status', 'enrolled');
        if (error) throw error;

        currentRoster = enrollments || [];
        if (currentRoster.length === 0) {
            document.getElementById('gradeModalBody').innerHTML =
                '<p style="text-align:center;color:var(--ink-300);padding:24px;">No students enrolled in this class.</p>';
            return;
        }

        const rows = currentRoster.map((e, i) => {
            const g = e.grades || {};
            return `
        <div class="grade-input">
          <div>
            <strong>${escapeHtml(e.profiles.full_name)}</strong><br>
            <span style="font-size:11px;color:var(--ink-500);">${escapeHtml(e.profiles.student_no)} · ${escapeHtml(e.profiles.program)}</span>
          </div>
          <div>
            <label>Midterm</label>
            <input type="number" class="field-input" step="0.01" min="1" max="5" value="${g.midterm || ''}" data-idx="${i}" data-field="midterm" placeholder="—">
          </div>
          <div>
            <label>Final</label>
            <input type="number" class="field-input" step="0.01" min="1" max="5" value="${g.final || ''}" data-idx="${i}" data-field="final" placeholder="—">
          </div>
          <div>
            <label>Remark</label>
            <select class="field-input" data-idx="${i}" data-field="remark">
              <option value="Pending" ${g.remark === 'Pending' || !g.remark ? 'selected' : ''}>Pending</option>
              <option value="Passed" ${g.remark === 'Passed' ? 'selected' : ''}>Passed</option>
              <option value="Failed" ${g.remark === 'Failed' ? 'selected' : ''}>Failed</option>
            </select>
          </div>
        </div>`;
        }).join('');

        document.getElementById('gradeModalBody').innerHTML = `
      ${rows}
      <button class="btn btn-primary" style="margin-top:16px;width:100%;justify-content:center;padding:12px;" onclick="saveGrades()">Save Grades</button>
    `;
    } catch (err) {
        document.getElementById('gradeModalBody').innerHTML = `<p style="color:var(--red);">Error: ${escapeHtml(err.message)}</p>`;
    }
}

async function saveGrades() {
    const inputs = document.querySelectorAll('#gradeModalBody input, #gradeModalBody select');
    const updates = {};
    inputs.forEach(input => {
        const idx = parseInt(input.dataset.idx);
        const field = input.dataset.field;
        const val = input.value.trim();
        if (!updates[idx]) updates[idx] = {};
        if (val) updates[idx][field] = field === 'remark' ? val : parseFloat(val);
    });

    try {
        for (const [idx, gradeData] of Object.entries(updates)) {
            const enrollment = currentRoster[parseInt(idx)];
            if (!enrollment) continue;
            const gradeRow = { student_id: enrollment.student_id, offering_id: currentOfferingId, ...gradeData };
            if (gradeData.final) {
                const final = parseFloat(gradeData.final);
                gradeRow.equivalent = final;
                if (!gradeData.remark || gradeData.remark === 'Pending') gradeRow.remark = final <= 3.0 ? 'Passed' : 'Failed';
            }
            const { error } = await supabase.from('grades').upsert(gradeRow, { onConflict: 'student_id,offering_id' });
            if (error) console.error('Grade save error for student:', enrollment.student_id, error);
        }
        showToast('Grades saved successfully');
        closeGradeModal();
        await loadClasses();
    } catch (err) {
        showToast('Error saving grades: ' + err.message, true);
    }
}

function closeGradeModal() {
    document.getElementById('gradeModal').style.display = 'none';
    currentOfferingId = null;
    currentRoster = [];
}

// ── Attendance ───────────────────────────────────────────────────────
let attendanceRoster = [];

async function loadAttendanceClasses() {
    const { data: { user } } = await supabase.auth.getUser();
    const { data: profile } = await supabase.from('profiles').select('id, full_name').eq('id', user.id).single();
    const { data: offerings } = await supabase.from('course_offerings').select('id, code, title').ilike('instructor_name', `%${profile.full_name}%`);
    const sel = document.getElementById('attendanceClass');
    sel.innerHTML = '<option value="">Select a class...</option>' + (offerings || []).map(o => `<option value="${o.id}">${escapeHtml(o.code)} — ${escapeHtml(o.title)}</option>`).join('');
}

async function loadAttendanceRoster() {
    const offeringId = parseInt(document.getElementById('attendanceClass').value);
    const date = document.getElementById('attendanceDate').value;
    const container = document.getElementById('attendanceRoster');
    if (!offeringId || !date) {
        container.innerHTML = '<div style="color:var(--ink-300);font-size:13px;text-align:center;padding:20px;">Select a class and date to take attendance.</div>';
        return;
    }
    container.innerHTML = '<div style="color:var(--ink-300);font-size:13px;text-align:center;padding:20px;">Loading roster...</div>';

    const { data: enrollments } = await supabase
        .from('enrollments')
        .select('student_id, profiles!inner(student_no, full_name)')
        .eq('offering_id', offeringId).eq('status', 'enrolled');

    const { data: existing } = await supabase
        .from('attendance').select('student_id, status')
        .eq('offering_id', offeringId).eq('date', date);
    const existingMap = Object.fromEntries((existing || []).map(a => [a.student_id, a.status]));

    attendanceRoster = enrollments || [];
    if (attendanceRoster.length === 0) {
        container.innerHTML = '<div style="color:var(--ink-300);font-size:13px;text-align:center;padding:20px;">No students enrolled in this class.</div>';
        return;
    }

    container.innerHTML = `
    <div class="table-wrap">
      <table class="data-table">
        <thead><tr><th>Student</th><th>No.</th><th>Status</th></tr></thead>
        <tbody>
          ${attendanceRoster.map(e => {
        const status = existingMap[e.student_id] || '';
        return `<tr>
              <td><strong>${escapeHtml(e.profiles.full_name)}</strong></td>
              <td style="font-family:monospace;font-size:12px;">${escapeHtml(e.profiles.student_no || '—')}</td>
              <td>
                <select class="field-input" style="width:auto;" onchange="markAttendance('${e.student_id}', this.value)">
                  <option value="">—</option>
                  <option value="present" ${status === 'present' ? 'selected' : ''}>Present</option>
                  <option value="late" ${status === 'late' ? 'selected' : ''}>Late</option>
                  <option value="absent" ${status === 'absent' ? 'selected' : ''}>Absent</option>
                  <option value="excused" ${status === 'excused' ? 'selected' : ''}>Excused</option>
                </select>
              </td>
            </tr>`;
    }).join('')}
        </tbody>
      </table>
    </div>`;
}

async function markAttendance(studentId, status) {
    if (!status) return;
    const offeringId = parseInt(document.getElementById('attendanceClass').value);
    const date = document.getElementById('attendanceDate').value;
    const { data: { user } } = await supabase.auth.getUser();
    const e = attendanceRoster.find(r => r.student_id === studentId);
    try {
        const { error } = await supabase.from('attendance').upsert({
            student_id: studentId, offering_id: offeringId, date: date,
            status: status, marked_by: user.id
        }, { onConflict: 'student_id,offering_id,date' });
        if (error) throw error;
        showToast(`${e?.profiles?.full_name || 'Student'} marked ${status}`);
    } catch (err) {
        showToast('Error: ' + err.message, true);
    }
}

// ── Announcements ────────────────────────────────────────────────────
async function loadAnnouncements() {
    const { data: { user } } = await supabase.auth.getUser();
    const { data: profile } = await supabase.from('profiles').select('id').eq('id', user.id).single();
    const { data: anns } = await supabase.from('class_announcements').select('*, course_offerings(code, title)').eq('author_id', profile.id).order('created_at', { ascending: false });
    const list = document.getElementById('announcementList');
    if (!anns || anns.length === 0) { list.innerHTML = '<span style="color:var(--ink-300);">No announcements posted yet.</span>'; return; }
    list.innerHTML = anns.map(a => `
    <div style="padding:12px 0;border-bottom:1px solid var(--line);">
      <div style="display:flex;justify-content:space-between;align-items:start;gap:10px;flex-wrap:wrap;">
        <div>
          <strong>${escapeHtml(a.title)}</strong> <span style="font-size:11px;color:var(--ink-500);">— ${escapeHtml(a.course_offerings?.code || '')} ${escapeHtml(a.course_offerings?.title || '')}</span>
        </div>
        <span style="font-size:11px;color:var(--ink-500);">${new Date(a.created_at).toLocaleDateString()}</span>
      </div>
      <p style="margin:6px 0 0;font-size:13px;color:var(--ink-700);">${escapeHtml(a.body)}</p>
    </div>`).join('');
}

function openAnnouncementModal() {
    document.getElementById('gradeModalTitle').textContent = 'Post Class Announcement';
    document.getElementById('gradeModal').style.display = 'flex';
    document.getElementById('gradeModalBody').innerHTML = `
    <div style="margin-bottom:12px;"><label style="font-size:12px;font-weight:600;display:block;margin-bottom:5px;">Class</label>
      <select class="field-input" id="ann_class"><option value="">Select class...</option></select></div>
    <div style="margin-bottom:12px;"><label style="font-size:12px;font-weight:600;display:block;margin-bottom:5px;">Title</label>
      <input type="text" class="field-input" id="ann_title" placeholder="Midterm exam schedule"></div>
    <div style="margin-bottom:12px;"><label style="font-size:12px;font-weight:600;display:block;margin-bottom:5px;">Message</label>
      <textarea class="field-input" id="ann_body" rows="4" placeholder="Announcement details..."></textarea></div>
    <button class="btn btn-primary" style="width:100%;justify-content:center;padding:12px;" onclick="postAnnouncement()">Post Announcement</button>
  `;
    supabase.from('course_offerings').select('id, code, title').ilike('instructor_name', '%').then(({ data }) => {
        document.getElementById('ann_class').innerHTML = '<option value="">Select class...</option>' + (data || []).map(c => `<option value="${c.id}">${escapeHtml(c.code)} — ${escapeHtml(c.title)}</option>`).join('');
    });
}

async function postAnnouncement() {
    const { data: { user } } = await supabase.auth.getUser();
    const offeringId = parseInt(document.getElementById('ann_class').value);
    const title = document.getElementById('ann_title').value.trim();
    const body = document.getElementById('ann_body').value.trim();
    if (!offeringId || !title || !body) { showToast('All fields required', true); return; }
    try {
        const { error } = await supabase.from('class_announcements').insert({ author_id: user.id, offering_id: offeringId, title, body });
        if (error) throw error;
        showToast('Announcement posted'); closeGradeModal(); await loadAnnouncements();
    } catch (err) { showToast('Error: ' + err.message, true); }
}

// ── Schedule ─────────────────────────────────────────────────────────
async function loadSchedule() {
    const { data: { user } } = await supabase.auth.getUser();
    const { data: profile } = await supabase.from('profiles').select('id, full_name').eq('id', user.id).single();
    const { data: offerings } = await supabase.from('course_offerings').select('id, code, title').ilike('instructor_name', `%${profile.full_name}%`);
    const offeringIds = (offerings || []).map(o => o.id);
    if (offeringIds.length === 0) {
        document.getElementById('scheduleTable').innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--ink-300);">No schedule found.</td></tr>'; return;
    }
    const { data: slots } = await supabase.from('timetable').select('*, course_offerings(code, title), rooms(name)').in('offering_id', offeringIds).order('day_of_week').order('start_time');
    document.getElementById('scheduleTable').innerHTML = (slots || []).length ? slots.map(t => `<tr><td><strong>${escapeHtml(t.course_offerings?.code || '—')}</strong> ${escapeHtml(t.course_offerings?.title || '')}</td><td>${escapeHtml(t.day_of_week)}</td><td>${escapeHtml(t.start_time)}</td><td>${escapeHtml(t.end_time)}</td><td>${escapeHtml(t.rooms?.name || 'TBA')}</td></tr>`).join('') : '<tr><td colspan="5" style="text-align:center;color:var(--ink-300);">No timetable slots assigned.</td></tr>';
}

// ── Messaging ────────────────────────────────────────────────────────
async function loadMessages() {
    const { data: { user } } = await supabase.auth.getUser();
    const { data: msgs } = await supabase.from('messages').select('*, sender:profiles!sender_id(full_name), recipient:profiles!recipient_id(full_name)').or(`recipient_id.eq.${user.id},sender_id.eq.${user.id}`).order('created_at', { ascending: false }).limit(20);
    const list = document.getElementById('messageList');
    if (!msgs || msgs.length === 0) { list.innerHTML = '<span style="color:var(--ink-300);">No messages yet.</span>'; return; }
    list.innerHTML = msgs.map(m => {
        const isSent = m.sender_id === user.id;
        const otherName = isSent ? m.recipient?.full_name : m.sender?.full_name;
        return `<div style="padding:10px 0;border-bottom:1px solid var(--line);">
      <div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px;">
        <strong>${isSent ? '→ To: ' : '← From: '}${escapeHtml(otherName || '—')}</strong>
        <span style="font-size:11px;color:var(--ink-500);">${new Date(m.created_at).toLocaleDateString()}</span>
      </div>
      ${m.subject ? `<div style="font-size:12px;font-weight:600;margin:2px 0;">${escapeHtml(m.subject)}</div>` : ''}
      <div style="font-size:13px;color:var(--ink-700);">${escapeHtml(m.body)}</div>
      ${!isSent && !m.is_read ? '<span class="badge badge-red" style="margin-top:4px;display:inline-block;">NEW</span>' : ''}
    </div>`;
    }).join('');
}

function openMessageModal() {
    document.getElementById('gradeModalTitle').textContent = 'New Internal Message';
    document.getElementById('gradeModal').style.display = 'flex';
    document.getElementById('gradeModalBody').innerHTML = `
    <div style="margin-bottom:12px;"><label style="font-size:12px;font-weight:600;display:block;margin-bottom:5px;">To (Staff/Admin only)</label>
      <select class="field-input" id="msg_recipient"><option value="">Select recipient...</option></select></div>
    <div style="margin-bottom:12px;"><label style="font-size:12px;font-weight:600;display:block;margin-bottom:5px;">Subject</label>
      <input type="text" class="field-input" id="msg_subject" placeholder="Subject"></div>
    <div style="margin-bottom:12px;"><label style="font-size:12px;font-weight:600;display:block;margin-bottom:5px;">Message</label>
      <textarea class="field-input" id="msg_body" rows="4" placeholder="Message..."></textarea></div>
    <button class="btn btn-primary" style="width:100%;justify-content:center;padding:12px;" onclick="sendMessage()">Send Message</button>
  `;
    supabase.from('profiles').select('id, full_name').in('role', ['staff', 'admin', 'faculty']).then(({ data }) => {
        document.getElementById('msg_recipient').innerHTML = '<option value="">Select recipient...</option>' + (data || []).map(p => `<option value="${p.id}">${escapeHtml(p.full_name)}</option>`).join('');
    });
}

async function sendMessage() {
    const { data: { user } } = await supabase.auth.getUser();
    const recipientId = document.getElementById('msg_recipient').value;
    const subject = document.getElementById('msg_subject').value.trim();
    const body = document.getElementById('msg_body').value.trim();
    if (!recipientId || !body) { showToast('Recipient and message required', true); return; }
    try {
        const { error } = await supabase.from('messages').insert({ sender_id: user.id, recipient_id: recipientId, subject: subject || null, body });
        if (error) throw error;
        showToast('Message sent'); closeGradeModal(); await loadMessages();
    } catch (err) { showToast('Error: ' + err.message, true); }
}

init();