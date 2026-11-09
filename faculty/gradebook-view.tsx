const gradeFields = [
  ['prelim', 'prelim-input', 'Prelim'], ['midterm', 'mid-input', 'Midterm'],
  ['semifinal', 'semifinal-input', 'Semi-Final'], ['final', 'final-input', 'Final'],
  ['equivalent', 'equivalent-input', 'Equivalent'],
] as const;
type Grade = Partial<Record<typeof gradeFields[number][0], number | string | null>> & { remark?: string };
type GradeRow = Grade & {
  student: { id: string; full_name?: string; student_no?: string; id_number?: string };
  grade_scale: string;
  draftRemark: string;
};
type Revision = Grade & {
  id: string; student_id: string; student_name?: string; student_no?: string;
  created_at: string; changed_by_name?: string; change_type?: string;
};

function GradeRemark({ remark }: { remark: string }) {
  return <span className={`badge ${remark === 'Passed' ? 'badge-green' : remark === 'Failed' ? 'badge-red' : 'badge-amber'}`}>{remark}</span>;
}

export function GradeRows({ rows, readOnly, dean = false }: { rows: GradeRow[]; readOnly: boolean; dean?: boolean }) {
  return <>{rows.map((row, index) => <tr key={row.student.id} data-idx={index}>
    <td><b>{row.student.full_name || 'N/A'}</b><small className="student-number">{row.student.student_no || row.student.id_number || '—'}</small></td>
    {gradeFields.map(([field, fieldClass]) => <td key={field}>
      <input type="number" min={1} max={row.grade_scale === 'percentage' ? 100 : 5} step="0.01"
        className={`field-input w-[72px] ${dean ? "my-" : ""}${fieldClass}`} data-idx={index} data-grade-field={field}
        readOnly={readOnly || row.grade_scale === 'percentage'} defaultValue={row[field] ?? ''}
        aria-label={`${row.student.full_name || 'Student'} ${field} school grade`} />
    </td>)}
    <td className={dean ? "my-remark-cell" : "remark-cell"} data-idx={index}><GradeRemark remark={row.draftRemark} /></td>
    <td className="text-center whitespace-nowrap">
      <button type="button" className={`btn btn-ghost ${dean ? "dean-grade-hist-btn" : "grade-hist-btn"} inline-flex items-center gap-1 px-2 py-1 text-xs`}
        data-idx={index} title="View history & revert">
        <svg aria-hidden="true" viewBox="0 0 24 24" className="size-[13px]" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 14 14" /></svg>
        History
      </button>
    </td>
  </tr>)}</>;
}

export function GradeHistorySummary({ student, saved, count, dean = false }: { student: boolean; saved?: Grade | null; count: number; dean?: boolean }) {
  if (!student) return <>
    <h4 className="m-0 text-sm font-bold">Class Audit Trail &amp; Revision History{dean && " (Dean Oversight)"}</h4>
    <p className="m-0 mt-1 text-xs text-[var(--ink-500)]">{count} students enrolled. Review saved grade revisions and restore a previous version.</p>
  </>;
  if (!saved) return <p className="m-0 text-sm text-[var(--ink-500)]">No grade has been saved for this student.</p>;
  return <>
    <h4 className="m-0 mb-2 text-sm font-bold">Saved in Portal</h4>
    <dl className="m-0 grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
      {gradeFields.map(([field, , label]) => <div key={field}>
        <dt className="text-xs text-[var(--ink-500)]">{label}</dt>
        <dd className="m-0 font-semibold">{saved[field] == null ? '—' : Number(saved[field]).toFixed(2)}</dd>
      </div>)}
      <div><dt className="text-xs text-[var(--ink-500)]">Remark</dt><dd className="m-0"><GradeRemark remark={saved.remark || 'Pending'} /></dd></div>
    </dl>
  </>;
}

export function GradeHistoryMessage({ message, student }: { message: string; student: boolean }) {
  return <tr><td colSpan={student ? 10 : 11} className="p-6 text-center" role="status">{message}</td></tr>;
}

export function GradeHistoryRows({ rows, student, readOnly }: { rows: Revision[]; student: boolean; readOnly: boolean }) {
  return <>{rows.map(row => <tr key={row.id}>
    <td className="text-xs whitespace-nowrap">{new Date(row.created_at).toLocaleString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true,
    })}</td>
    {!student && <td><b>{row.student_name || 'N/A'}</b><small className="block text-[var(--ink-500)]">{row.student_no}</small></td>}
    <td>{row.changed_by_name || 'Faculty / Dean'}</td>
    <td>{row.change_type === 'revert' ? 'Reverted' : row.change_type === 'initial_entry' ? 'Initial' : 'Updated'}</td>
    {gradeFields.map(([field]) => <td key={field} className="font-mono">{row[field] == null ? '—' : Number(row[field]).toFixed(2)}</td>)}
    <td>{row.remark ? <GradeRemark remark={row.remark} /> : '—'}</td>
    <td className="text-center">
      <button type="button" data-hist-id={row.id} data-student-id={row.student_id} disabled={readOnly}
        className="btn btn-outline revert-btn px-2 py-1 text-xs disabled:cursor-not-allowed disabled:opacity-60">Revert</button>
    </td>
  </tr>)}</>;
}

export function GradeHistoryDialog() {
  return (
    <dialog id="gradeHistoryModal" aria-labelledby="gradeHistoryModalTitle" aria-describedby="gradeHistoryModalSub"
      className="m-auto box-border max-h-[90dvh] w-[820px] max-w-[calc(100%-2rem)] rounded-xl border border-solid border-[var(--line)] bg-[var(--card)] p-4 text-[var(--ink-900)] shadow-xl backdrop:bg-black/55 sm:p-6">
        <div className="mb-3.5 flex items-start justify-between gap-3">
          <div>
            <h3 id="gradeHistoryModalTitle" className="m-0 mb-1 font-heading">
              {"Grade Revision History"}
            </h3>
            <div id="gradeHistoryModalSub" className="text-[13px] text-[var(--ink-500)]">
              {"Student and course details"}
            </div>
          </div>
          <button type="button" className="btn btn-ghost px-2 py-1 text-xl leading-none" id="gradeHistoryCloseBtn" aria-label="Close" autoFocus>
            {"×"}
          </button>
        </div>
        <div id="gradeHistoryCurrentBox" className="mb-4 rounded-lg border border-solid border-[var(--line)] bg-[var(--bg)] px-4 py-3" />
        <div className="table-responsive max-h-[360px] overflow-auto rounded-lg border border-solid border-[var(--line)]" tabIndex={0} role="region" aria-label="Grade revisions">
          <table className="m-0 text-[12.5px]">
            <thead className="sticky top-0 z-2 bg-[var(--card)]">
              <tr>
                <th>
                  {"Date & Time"}
                </th>
                <th id="gradeHistoryStudentHeader">
                  {"Student"}
                </th>
                <th>
                  {"Changed By"}
                </th>
                <th>
                  {"Type"}
                </th>
                <th>
                  {"Prelim"}
                </th>
                <th>
                  {"Midterm"}
                </th>
                <th>
                  {"Semi"}
                </th>
                <th>
                  {"Final"}
                </th>
                <th>
                  {"Equiv"}
                </th>
                <th>
                  {"Remark"}
                </th>
                <th className="text-center">
                  {"Action"}
                </th>
              </tr>
            </thead>
            <tbody id="gradeHistoryBody" />
          </table>
        </div>
        <div id="noGradeHistoryMsg" className="py-6 text-center text-sm text-[var(--ink-500)]" hidden>
          {"No previous revisions found. When grades are edited or updated, previous entries are archived here automatically."}
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-xs text-[var(--ink-500)]">
            <svg aria-hidden="true" viewBox="0 0 24 24" className="size-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="16" x2="12" y2="12" />
              <line x1="12" y1="8" x2="12.01" y2="8" />
            </svg>
            {"\n          Clicking \"Revert\" restores that exact past version and preserves the current version in audit logs.\n        "}
          </div>
          <button type="button" className="btn btn-primary" id="gradeHistoryDoneBtn">
            {"Done"}
          </button>
        </div>
    </dialog>
  );
}

export function CourseList({ offerings, selectedId, showInstructor = false }: {
  offerings: { id: number | string; code?: string; title?: string; schedule?: string; semester?: string; school_year?: string; instructor_name?: string }[];
  selectedId?: number | string;
  showInstructor?: boolean;
}) {
  return <>{offerings.map(offering => {
    const selected = String(offering.id) === String(selectedId);
    return <button key={offering.id} type="button" data-id={offering.id} aria-pressed={selected}
      className={`nav-item mb-2! border-[var(--line)]! ${selected ? 'active' : ''}`}>
      <div className="text-left">
        <div className="text-[13.5px] font-extrabold">{offering.code || '—'}</div>
        <div className="text-xs font-medium text-[var(--ink-500)]">{offering.title || '—'}</div>
        <div className="mt-1 text-[11px] text-[var(--ink-300)]">{offering.schedule || 'Schedule TBA'} · {offering.semester || ''} {offering.school_year || ''}</div>
        {showInstructor && <div className="mt-1 text-[11px] font-semibold text-[var(--pink-600)]">{offering.instructor_name || 'Unassigned'}</div>}
      </div>
    </button>;
  })}</>;
}
