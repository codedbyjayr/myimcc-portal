'use strict';
document.addEventListener('DOMContentLoaded', async () => {
  const session = await initAuthGuard(['dean', 'admin', 'staff', 'registrar']);
  if (!session) return;
  document.getElementById('back').href = IMCC.dashboardForRole(session.profile.role);
  const rows = document.getElementById('requests');
  const message = document.getElementById('message');
  const refresh = document.getElementById('refresh');
  const statusFilter = document.getElementById('statusFilter');
  const finalizations = document.getElementById('finalizationGroups');
  const termSelect = document.getElementById('enrollmentTermSelect');
  document.getElementById('termManager').hidden = !['dean', 'admin', 'registrar'].includes(session.profile.role);
  async function load() {
    refresh.disabled = true;
    rows.innerHTML = '';
    message.textContent = 'Loading…';
    try {
      const { data, error } = await supabaseClient.rpc('list_enrollment_request_history', { p_status: statusFilter.value });
      if (error) throw error;
      const workspace = await supabaseClient.rpc('get_enrollment_workspace');
      if (workspace.error) throw workspace.error;
      finalizations.innerHTML = (workspace.data.groups || []).map(g => UIM.html`<div class="load-summary"><strong>${g.student_name}</strong> · ${g.student_no || ''} · ${g.semester} ${g.school_year} · ${g.units} units
        ${g.locked_at ? UIM.html`<span>Finalized and locked</span>` : UIM.html`<button type="button" data-finalize="${g.student_id}" data-year="${g.school_year}" data-semester="${g.semester}">Finalize Enrollment</button>`}</div>`).join('') || '<p>No enrolled students.</p>';
      const previousTerm = termSelect.value;
      termSelect.innerHTML = (workspace.data.terms || []).map(t => UIM.html`<option value="${JSON.stringify([t.school_year, t.semester])}">${t.semester} ${t.school_year} — ${t.is_open ? 'Open' : 'Closed'}</option>`).join('');
      if ([...termSelect.options].some(o => o.value === previousTerm)) termSelect.value = previousTerm;
      const groups = new Map();
      for (const request of data || []) {
        const key = JSON.stringify([request.student_id, request.school_year, request.semester]);
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(request);
      }
      rows.innerHTML = [...groups.values()].map(requests => {
        const student = requests[0];
        const pendingUnits = requests.filter(r => r.status === 'pending').reduce((total, r) => total + Number(r.units || 0), 0);
        const enrolledUnits = Number(student.enrolled_units || 0);
        return UIM.html`<section class="student-request">
          <h2>${student.student_name} <small>${student.student_no || 'No student number'}</small></h2>
          <p>${student.program || 'Program not set'} · ${student.year_level || 'Year not set'} · Section ${student.section || 'not set'}</p>
          <p>${student.semester} · ${student.school_year}</p>
          <p class="load-summary"><strong>${pendingUnits} pending units</strong> · ${enrolledUnits} enrolled units · ${pendingUnits + enrolledUnits} units if all pending subjects are approved</p>
          <div class="table-wrap"><table>
            <caption>Subjects for ${student.semester} ${student.school_year}</caption>
            <thead><tr><th>Subject</th><th>Schedule</th><th>Units</th><th>Status / Decision</th></tr></thead>
            <tbody>${requests.map(r => UIM.html`<tr>
              <td>${r.code} — ${r.title}</td><td>${r.schedule || 'Schedule TBA'}</td><td>${r.units}</td>
              <td><span class="pending-status">${r.status}</span>${r.review_note ? UIM.html`<span>${r.review_note}</span>` : ''}${r.status === 'pending' ? UIM.html`<button data-id="${r.id}" data-decision="approved">Approve</button><button data-id="${r.id}" data-decision="rejected">Reject</button>` : ''}</td></tr>`)}
            ${(student.enrolled_courses || []).map(c => UIM.html`<tr>
              <td>${c.code} — ${c.title}</td><td>${c.schedule || 'Schedule TBA'}</td><td>${c.units}</td><td>Enrolled</td></tr>`)}</tbody>
          </table></div>
        </section>`;
      }).join('');
      message.textContent = data?.length ? `${data.length} ${statusFilter.value === 'all' ? 'subject request(s)' : `${statusFilter.value} subject request(s)`} across ${groups.size} student/term group(s).` : `No ${statusFilter.value === 'all' ? 'requests' : statusFilter.value + ' requests'} found.`;
    } catch (err) { message.textContent = 'Could not load requests: ' + err.message; }
    finally { refresh.disabled = false; }
  }
  rows.addEventListener('click', async event => {
    const button = event.target.closest('button[data-id]');
    if (!button || refresh.disabled) return;
    const row = button.closest('tr');
    let reviewNote = null;
    if (button.dataset.decision === 'rejected') {
      reviewNote = window.prompt('Enter a reason for rejecting this enrollment request:')?.trim();
      if (!reviewNote) { message.textContent = 'A rejection reason is required.'; return; }
      if (reviewNote.length > 1000) { message.textContent = 'Keep the rejection reason to 1,000 characters or fewer.'; return; }
    }
    row.querySelectorAll('button').forEach(b => { b.disabled = true; });
    refresh.disabled = true;
    try {
      const { error } = await supabaseClient.rpc('review_enrollment_request', {
        p_request_id: button.dataset.id, p_decision: button.dataset.decision, p_review_note: reviewNote,
      });
      if (error) throw error;
      await load();
    } catch (err) {
      message.textContent = 'Could not review request: ' + err.message;
      row.querySelectorAll('button').forEach(b => { b.disabled = false; });
    } finally { refresh.disabled = false; }
  });
  refresh.addEventListener('click', load);
  statusFilter.addEventListener('change', load);
  finalizations.addEventListener('click', async event => {
    const button = event.target.closest('[data-finalize]');
    if (!button || refresh.disabled || !confirm('Finalize this enrollment? Subject changes for this student and term will be blocked.')) return;
    button.disabled = true;
    refresh.disabled = true;
    try {
      const { error } = await supabaseClient.rpc('finalize_enrollment', { p_student_id: button.dataset.finalize, p_school_year: button.dataset.year, p_semester: button.dataset.semester });
      if (error) throw error;
      await load();
    } catch (error) { message.textContent = 'Could not finalize enrollment: ' + error.message; }
    finally { button.disabled = false; refresh.disabled = false; }
  });
  for (const [id, open] of [['openTerm', true], ['closeTerm', false]]) {
    document.getElementById(id).addEventListener('click', async () => {
      if (refresh.disabled || !termSelect.value) return;
      const [year, semester] = JSON.parse(termSelect.value);
      refresh.disabled = true;
      try {
        const { error } = await supabaseClient.rpc('set_enrollment_term', { p_school_year: year, p_semester: semester, p_open: open });
        if (error) throw error;
        await load();
      } catch (error) { message.textContent = 'Could not update term: ' + error.message; }
      finally { refresh.disabled = false; }
    });
  }
  await load();
});
