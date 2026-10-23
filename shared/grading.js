// shared/grading.js
//
// School grades are stored directly; legacy percentages await school review.
// Single source of truth — replaces the identical hardcoded functions
// in teacher-dashboard.js and dean-dashboard.js.
(function (global) {
  'use strict';

  const gradeScale = [
    [1,99,100,'Excellent'], [1.1,98,98,'Excellent'], [1.2,97,97,'Excellent'],
    [1.25,96,98,'Outstanding'], [1.3,96,96,'Outstanding'], [1.4,94,94,'Outstanding'],
    [1.5,93,95,'Superior'], [1.6,92,92,'Superior'], [1.7,91,91,'Very Good'],
    [1.75,90,92,'Very Good'], [1.8,89,89,'Very Good'], [1.9,88,88,'Good'],
    [2,87,89,'Good'], [2.1,86,86,'Good'], [2.2,85,85,'Satisfactory'],
    [2.25,84,86,'Satisfactory'], [2.3,84,84,'Satisfactory'], [2.4,82,82,'Satisfactory'],
    [2.5,81,83,'Fairly Satisfactory'], [2.6,80,80,'Fairly Satisfactory'], [2.7,79,79,'Fair'],
    [2.75,78,80,'Fair'], [2.8,77,77,'Fair'], [2.9,76,76,'Passing'],
    [3,75,77,'Passing (minimum)'], [4,null,null,'Conditional / INC'], [5,0,74.99,'Failed']
  ];
  function isSchoolGrade(value) {
    return value !== null && value !== undefined && value !== '' && gradeScale.some(row => row[0] === Number(value));
  }
  function gradeDescription(value) {
    return isSchoolGrade(value) ? gradeScale.find(row => row[0] === Number(value))[3] : '';
  }
  // Exact percentage rows take priority over the supplied overlapping ranges.
  function computeEquivalent(avg) {
    if (avg === null || avg === undefined || avg === '' || !Number.isFinite(Number(avg)) || Number(avg) < 0 || Number(avg) > 100) return null;
    const percentage = Number(avg);
    if (percentage < 75) return 5;
    const exact = gradeScale.find(row => row[1] === percentage && row[2] === percentage);
    return (exact || gradeScale.find(row => row[1] !== null && percentage >= row[1] && percentage <= row[2]))?.[0] ?? null;
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
    var eq = r.equivalent;
    return eq == null ? '—' : Number(eq).toFixed(2);
  }

  function previewRemarkBadge(r) {
    if (r.final == null || r.equivalent == null) return '<span class="badge badge-amber">Pending</span>';
    var remark = computeRemark(r);
    return '<span class="badge ' + (remark === 'Passed' ? 'badge-green' : remark === 'Failed' ? 'badge-red' : 'badge-amber') + '">' + remark + '</span>';
  }

  /** Build the remark string for a grade save payload. */
  function computeRemark(r) {
    if (r.remark === 'Dropped') return 'Dropped';
    if (r.final == null || r.equivalent == null) return 'Pending';
    if (r.grade_scale === 'percentage') return r.remark || 'Pending';
    var eq = isSchoolGrade(r.equivalent) ? Number(r.equivalent) : null;
    if (eq === 4) return 'Conditional';
    return eq !== null && eq <= 3.00 ? 'Passed' : 'Failed';
  }

  function estimate(r) {
    if (r.grade_scale !== 'school' || r.final != null || r.remark === 'Dropped') return null;
    const values = [r.prelim, r.midterm, r.semifinal].filter(v => isSchoolGrade(v) && Number(v) !== 4);
    return values.length ? Number((values.reduce((sum, v) => sum + Number(v), 0) / values.length).toFixed(2)) : null;
  }

  function weightedGwa(rows) {
    const eligible = rows.filter(r => r.final != null && r.remark !== 'Dropped' && Number(r.equivalent) >= 1 && Number(r.equivalent) <= 5 && Number(r.equivalent) !== 4);
    if (!eligible.length || eligible.some(r => !(Number(r.units) > 0))) return null;
    return eligible.reduce((sum, r) => sum + Number(r.equivalent) * Number(r.units), 0) / eligible.reduce((sum, r) => sum + Number(r.units), 0);
  }

  function formatGrade(value) {
    return value != null && Number.isFinite(Number(value)) && Number(value) >= 1 && Number(value) <= 5 ? Number(value).toFixed(2) : '—';
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
      studentRosterItem.grade_scale = res.data?.grade_scale || histEntry.grade_scale || 'percentage';
      if (res.data && res.data.id) studentRosterItem.gradeId = res.data.id;
    }

    if (onDone) onDone(res.data, studentRosterItem);
  }

  // Both faculty pages keep their existing selection/save handlers and share this workspace UI.
  function initWorkspace() {
    const page = document.getElementById('page-classes');
    const picker = page.querySelector('.grading-class-select');
    const list = page.querySelector('.grading-course-list');
    const card = page.querySelector('.grading-card');
    const status = page.querySelector('.grading-save-status');
    const actions = page.querySelector('.grading-actions');
    const saveButton = actions.querySelector('button');
    const period = page.querySelector('.grading-period');
    const details = page.querySelector('.grading-class-details');
    const compact = global.matchMedia('(max-width: 1199px)');
    const syncDetails = () => { details.open = !compact.matches; };
    compact.addEventListener('change', syncDetails);
    syncDetails();
    const showPeriod = () => { page.dataset.gradingPeriod = period.value; };
    period.addEventListener('change', showPeriod);
    showPeriod();
    const readOnly = !!global.IMCC_DEVELOPER_VIEW;
    let baseline = '', saving = false, selectedId = '', courses = [], saveError = false;
    const inputs = () => [...card.querySelectorAll('tbody input[type="number"]')];
    const snapshot = () => JSON.stringify(inputs().map(input => input.value));
    const dirty = () => !readOnly && snapshot() !== baseline;
    function updateStatus() {
      status.textContent = readOnly ? 'Read-only preview' : saving ? 'Saving…' : saveError ? 'Save failed · changes kept' : dirty() ? 'Unsaved changes' : 'No unsaved changes';
      saveButton.disabled = readOnly || saving || !dirty() || !inputs().length;
    }
    function markClean() { baseline = snapshot(); saveError = false; updateStatus(); }
    function canLeave() {
      if (saving) return false;
      return !dirty() || global.confirm('Discard unsaved grade changes?');
    }
    picker.addEventListener('change', () => {
      const id = picker.value;
      picker.value = selectedId;
      [...list.querySelectorAll('[data-id]')].find(button => button.dataset.id === id)?.click();
    });
    page.addEventListener('input', () => { saveError = false; updateStatus(); });
    document.addEventListener('click', event => {
      const target = event.target.closest('[data-page], [data-goto], a[href], #signOutBtn, .revert-btn');
      if (!target) return;
      if (!canLeave()) { event.preventDefault(); event.stopImmediatePropagation(); return; }
      if (dirty()) {
        const saved = JSON.parse(baseline);
        inputs().forEach((input, index) => { input.value = saved[index]; input.dispatchEvent(new Event('input', { bubbles: true })); });
        markClean();
      }
    }, true);
    global.addEventListener('beforeunload', event => {
      if (dirty() || saving) { event.preventDefault(); event.returnValue = ''; }
    });
    markClean();
    return {
      canLeave, markClean, refresh: updateStatus,
      saveFailed() { saveError = true; updateStatus(); },
      setCourses(offerings, selected) {
        courses = offerings;
        picker.replaceChildren(new Option('Select a class', ''));
        for (const course of courses) {
          picker.add(new Option(`${course.code || '—'} — ${course.title || 'Untitled'} · Section ${course.section || '—'}`, String(course.id)));
        }
        picker.disabled = !courses.length;
        picker.value = selected == null ? '' : String(selected);
        if (!courses.length) { card.hidden = true; card.querySelector('tbody').replaceChildren(); markClean(); }
      },
      startClass(id) {
        selectedId = String(id);
        picker.value = selectedId;
        card.hidden = false;
        card.querySelector('tbody').replaceChildren();
        card.querySelector('table').style.display = 'none';
        const empty = card.querySelector('.empty-state');
        empty.style.display = 'block'; empty.textContent = 'Loading class roster…';
        actions.hidden = true;
        markClean();
      },
      setRosterCount(count) {
        let label = card.querySelector('.grading-student-count');
        if (!label) { label = document.createElement('p'); label.className = 'sub grading-student-count'; card.querySelector('.card-head').after(label); }
        const course = courses.find(course => String(course.id) === selectedId);
        label.textContent = `Section ${course?.section || '—'} · ${count} student${count === 1 ? '' : 's'}`;
        actions.hidden = !count;
        card.querySelectorAll('.grading-help, .grading-period-control').forEach(el => { el.hidden = !count; });
        if (readOnly) inputs().forEach(input => { input.readOnly = true; });
      },
      setSaving(value) {
        saving = value;
        saveError = false;
        inputs().forEach(input => { input.disabled = value; });
        picker.disabled = value;
        updateStatus();
      },
      validate() {
        if (readOnly || saving) return false;
        inputs().forEach(input => input.setCustomValidity(input.readOnly || input.value === '' || isSchoolGrade(input.value) ? '' : 'Choose a school grade from 1.00 to 3.00, 4.00, or 5.00.'));
        const invalid = inputs().find(input => !input.validity.valid);
        if (!invalid) {
          for (const row of card.querySelectorAll('tbody tr')) {
            const final = row.querySelector('input.final-input, input.my-final-input');
            const equivalent = row.querySelector('input.equivalent-input, input.my-equivalent-input');
            if (final && equivalent && final.value !== '' && equivalent.value === '' && !equivalent.readOnly) {
              equivalent.setCustomValidity('Enter the official Equivalent before saving a final grade.');
              period.value = '6'; showPeriod(); equivalent.reportValidity(); return false;
            }
            if (final && equivalent && final.value === '' && equivalent.value !== '' && !final.readOnly) {
              final.setCustomValidity('Enter Final before its official Equivalent.');
              period.value = '5'; showPeriod(); final.reportValidity(); return false;
            }
          }
        }
        if (invalid) {
          period.value = String(invalid.closest('td').cellIndex + 1);
          showPeriod();
          invalid.reportValidity();
        }
        return !invalid;
      }
    };
  }

  var api = {
    initWorkspace: initWorkspace,
    computeEquivalent: computeEquivalent,
    isSchoolGrade: isSchoolGrade,
    gradeDescription: gradeDescription,
    estimate: estimate,
    weightedGwa: weightedGwa,
    formatGrade: formatGrade,
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
