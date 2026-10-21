'use strict';
document.addEventListener('DOMContentLoaded', async () => {
  const session = await initAuthGuard(['dean', 'admin', 'staff', 'registrar']);
  if (!session) return;
  document.getElementById('back').href = IMCC.dashboardForRole(session.profile.role);
  const rows = document.getElementById('requests');
  const message = document.getElementById('message');
  const refresh = document.getElementById('refresh');
  const statusFilter = document.getElementById('statusFilter');
  async function load() {
    refresh.disabled = true;
    rows.innerHTML = '';
    message.textContent = 'Loading…';
    try {
      const { data, error } = await supabaseClient.rpc('list_enrollment_request_history', { p_status: statusFilter.value });
      if (error) throw error;
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
          <header class="student-header"><div><h2>${student.student_name} <small>${student.student_no || 'No student number'}</small></h2>
          <p class="student-meta">${student.program || 'Program not set'} · ${student.year_level || 'Year not set'} · Section ${student.section || 'not set'}</p></div>
          <p class="term-label">${student.semester} · ${student.school_year}</p></header>
          <div class="load-summary"><div><strong>${pendingUnits} pending units</strong><span>Awaiting a decision</span></div><div><strong>${enrolledUnits} enrolled units</strong><span>Current approved load</span></div><div><strong>${pendingUnits + enrolledUnits} units if all pending subjects are approved</strong><span>Proposed semester load</span></div></div>
          <div class="table-wrap"><table>
            <caption>Subjects for ${student.semester} ${student.school_year}</caption>
            <thead><tr><th>Subject</th><th>Schedule</th><th>Units</th><th>Status / Decision</th></tr></thead>
            <tbody>${requests.map(r => UIM.html`<tr>
              <td>${r.code} — ${r.title}</td><td>${r.schedule || 'Schedule TBA'}</td><td>${r.units}</td>
              <td><span class="status-badge status-${r.status}">${r.status}</span>${r.review_note ? UIM.html`<span class="review-note">${r.review_note}</span>` : ''}${r.status === 'pending' ? UIM.html`<div class="decision-actions"><button data-id="${r.id}" data-decision="approved">Approve</button><button data-id="${r.id}" data-decision="rejected">Reject</button></div>` : ''}</td></tr>`)}
            ${(student.enrolled_courses || []).map(c => UIM.html`<tr>
              <td>${c.code} — ${c.title}</td><td>${c.schedule || 'Schedule TBA'}</td><td>${c.units}</td><td><span class="status-badge status-enrolled">Enrolled</span></td></tr>`)}</tbody>
          </table></div>
        </section>`;
      }).join('') || UIM.html`<section class="request-empty"><div class="empty-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 4H5a2 2 0 0 0-2 2v14h18V6a2 2 0 0 0-2-2h-3M8 2h8v5H8zM8 13l3 3 5-5"/></svg></div><h2>${statusFilter.value === 'pending' ? 'Nothing waiting for review' : 'No matching requests'}</h2><p>${statusFilter.value === 'pending' ? 'New subject requests will appear here when students submit their proposed load. You can still review previous decisions.' : 'There are no requests in this view. Change the status filter or refresh to check for updates.'}</p>${statusFilter.value !== 'all' ? UIM.html`<button type="button" data-history="all">View decision history</button>` : ''}</section>`;
      message.textContent = data?.length ? `${data.length} ${statusFilter.value === 'all' ? 'subject request(s)' : `${statusFilter.value} subject request(s)`} across ${groups.size} student/term group(s).` : `No ${statusFilter.value === 'all' ? 'requests' : statusFilter.value + ' requests'} found.`;
    } catch (err) { message.textContent = 'Could not load requests: ' + err.message; }
    finally { refresh.disabled = false; }
  }
  rows.addEventListener('click', async event => {
    const button = event.target.closest('button[data-id],button[data-history]');
    if (!button || refresh.disabled) return;
    if (button.dataset.history === 'all') { statusFilter.value = 'all'; await load(); return; }
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
  await load();
});
