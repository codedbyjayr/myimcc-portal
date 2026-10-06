// shared/grading.js
//
// Philippine collegiate grading: 0–100 raw → 1.00–5.00 equivalent.
// Single source of truth — replaces the identical hardcoded functions
// in teacher-dashboard.js and dean-dashboard.js.
(function (global) {
  'use strict';

  // ponytail: hardcoded scale matching the grading_scale table rows.
  // If grading_scale ever needs to be admin-editable at runtime,
  // fetch the table once at init and build this map dynamically.
  function computeEquivalent(avg) {
    if (avg === null || avg === undefined || isNaN(avg)) return null;
    if (avg >= 96) return 1.00;
    if (avg >= 94) return 1.25;
    if (avg >= 92) return 1.50;
    if (avg >= 89) return 1.75;
    if (avg >= 86) return 2.00;
    if (avg >= 83) return 2.25;
    if (avg >= 80) return 2.50;
    if (avg >= 76) return 2.75;
    if (avg >= 75) return 3.00;
    return 5.00;
  }

  /** Equal-weighted average of whichever grading periods have values. */
  function periodAverage(r) {
    var periods = [r.prelim, r.midterm, r.semifinal, r.final].filter(function (v) {
      return v !== null && v !== undefined;
    });
    if (!periods.length) return null;
    return periods.reduce(function (s, v) { return s + Number(v); }, 0) / periods.length;
  }

  function previewEquivalent(r) {
    var eq = computeEquivalent(periodAverage(r));
    return eq === null ? '—' : eq.toFixed(2);
  }

  function previewRemarkBadge(r) {
    if (r.final === null || r.final === undefined) return '<span class="badge badge-amber">Pending</span>';
    var eq = computeEquivalent(periodAverage(r));
    var remark = eq !== null && eq <= 3.00 ? 'Passed' : 'Failed';
    return '<span class="badge ' + (remark === 'Passed' ? 'badge-green' : 'badge-red') + '">' + remark + '</span>';
  }

  /** Build the remark string for a grade save payload. */
  function computeRemark(r) {
    if (r.final === null || r.final === undefined) return 'Pending';
    var eq = computeEquivalent(periodAverage(r));
    return eq !== null && eq <= 3.00 ? 'Passed' : 'Failed';
  }

  function escapeHtml(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function renderHistoryRows(rows, targetStudent, onRevert) {
    var doc = typeof document !== 'undefined' ? document : null;
    if (!doc) return;
    var body = doc.getElementById('gradeHistoryBody');
    var noMsg = doc.getElementById('noGradeHistoryMsg');
    if (!body) return;

    if (!rows || !rows.length) {
      body.innerHTML = '';
      if (noMsg) noMsg.style.display = 'block';
      return;
    }

    if (noMsg) noMsg.style.display = 'none';
    body.innerHTML = rows.map(function (h) {
      var dt = new Date(h.created_at).toLocaleString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric',
        hour: 'numeric', minute: '2-digit', hour12: true
      });
      var typeLabel = h.change_type === 'revert' ? 'Reverted' : (h.change_type === 'initial_entry' ? 'Initial' : 'Updated');
      var typeClass = h.change_type || 'before_update';
      var studentCol = targetStudent ? '' : '<td><b>' + escapeHtml(h.student_name || 'N/A') + '</b><br><small style="color:var(--ink-500);">' + escapeHtml(h.student_no || '') + '</small></td>';

      return '<tr>' +
        '<td style="white-space:nowrap;font-size:11.5px;">' + escapeHtml(dt) + '</td>' +
        studentCol +
        '<td style="font-size:12px;">' + escapeHtml(h.changed_by_name || 'Faculty / Dean') + '</td>' +
        '<td><span class="history-badge ' + typeClass + '">' + typeLabel + '</span></td>' +
        '<td><span class="history-chip">' + (h.prelim != null ? Number(h.prelim).toFixed(2) : '—') + '</span></td>' +
        '<td><span class="history-chip">' + (h.midterm != null ? Number(h.midterm).toFixed(2) : '—') + '</span></td>' +
        '<td><span class="history-chip">' + (h.semifinal != null ? Number(h.semifinal).toFixed(2) : '—') + '</span></td>' +
        '<td><span class="history-chip">' + (h.final != null ? Number(h.final).toFixed(2) : '—') + '</span></td>' +
        '<td><b>' + (h.equivalent != null ? Number(h.equivalent).toFixed(2) : '—') + '</b></td>' +
        '<td>' + (h.remark ? '<span class="badge ' + (h.remark === 'Passed' ? 'badge-green' : (h.remark === 'Failed' ? 'badge-red' : 'badge-amber')) + '">' + escapeHtml(h.remark) + '</span>' : '—') + '</td>' +
        '<td style="text-align:center;white-space:nowrap;">' +
        '<button type="button" class="btn btn-outline revert-btn" data-hist-id="' + h.id + '" data-student-id="' + h.student_id + '" style="padding:3px 8px;font-size:11.5px;color:var(--pink-600);border-color:var(--pink-200);" title="Revert to this past version">⏪ Revert</button>' +
        '</td></tr>';
    }).join('');

    body.querySelectorAll('.revert-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var histId = btn.dataset.histId;
        var studentId = btn.dataset.studentId;
        var histEntry = rows.find(function (x) { return x.id === histId; });
        if (onRevert) onRevert(histEntry, studentId);
      });
    });
  }

  async function executeRevert(options) {
    var supabaseClient = options.supabaseClient;
    var histEntry = options.histEntry;
    var studentRosterItem = options.studentRosterItem;
    var roleLabel = options.roleLabel ? (' ' + options.roleLabel) : '';
    var showToast = options.showToast || (global.FC && global.FC.showToast) || alert;
    var onDone = options.onDone;

    if (!histEntry) return;
    var studentName = histEntry.student_name || (studentRosterItem && studentRosterItem.student && studentRosterItem.student.full_name) || 'student';
    var formattedDate = new Date(histEntry.created_at).toLocaleString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true
    });

    var promptMsg = 'Confirm Reverting Grade for ' + studentName + roleLabel + '\n\n' +
      'This will restore the previous scores recorded on ' + formattedDate + ':\n' +
      '• Pre-Lim: ' + (histEntry.prelim != null ? histEntry.prelim : '—') + '\n' +
      '• Midterm: ' + (histEntry.midterm != null ? histEntry.midterm : '—') + '\n' +
      '• Semi-Final: ' + (histEntry.semifinal != null ? histEntry.semifinal : '—') + '\n' +
      '• Final: ' + (histEntry.final != null ? histEntry.final : '—') + '\n' +
      '• Equivalent: ' + (histEntry.equivalent != null ? histEntry.equivalent : '—') + '\n' +
      '• Remark: ' + (histEntry.remark || '—') + '\n\n' +
      'Enter reason / note for this revision (optional):';

    var def = options.defaultReason || ('Reverted to version from ' + formattedDate);
    var reason = prompt(promptMsg, def);
    if (reason === null) return;

    showToast('Reverting grade…');

    var res = await supabaseClient.rpc('revert_grade', {
      p_history_id: histEntry.id,
      p_reason: reason.trim() || def
    });

    if (res.error) {
      showToast('Failed to revert: ' + res.error.message, true);
      return;
    }

    if (studentRosterItem) {
      studentRosterItem.prelim = histEntry.prelim != null ? Number(histEntry.prelim) : null;
      studentRosterItem.midterm = histEntry.midterm != null ? Number(histEntry.midterm) : null;
      studentRosterItem.semifinal = histEntry.semifinal != null ? Number(histEntry.semifinal) : null;
      studentRosterItem.final = histEntry.final != null ? Number(histEntry.final) : null;
      studentRosterItem.equivalent = histEntry.equivalent != null ? Number(histEntry.equivalent) : null;
      studentRosterItem.remark = histEntry.remark || 'Pending';
      if (res.data && res.data.id) studentRosterItem.gradeId = res.data.id;
    }

    if (onDone) onDone(res.data, studentRosterItem);
  }

  var api = {
    computeEquivalent: computeEquivalent,
    periodAverage: periodAverage,
    previewEquivalent: previewEquivalent,
    previewRemarkBadge: previewRemarkBadge,
    computeRemark: computeRemark,
    renderHistoryRows: renderHistoryRows,
    executeRevert: executeRevert
  };

  global.Grading = api;
  global.IMCC = Object.assign(global.IMCC || {}, api);
})(typeof window !== 'undefined' ? window : globalThis);
