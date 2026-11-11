export function CorLoadMessage({ failed = false }: { failed?: boolean }) {
  return <div className="rounded-[var(--radius)] border border-solid border-[var(--line)] bg-[var(--card)] px-5 py-[60px] text-center text-sm text-[var(--ink-500)]"
    role={failed ? 'alert' : 'status'}>
    {failed ? <>Could not verify your Certificate of Registration. <button type="button" id="corRetryBtn" className="btn btn-outline">Retry</button></>
      : 'Loading your Certificate of Registration…'}
  </div>;
}

export function CorDocument({ student, schoolYear, semester, courses, assessment, standing, status, signatures }: {
  student: [string, string][];
  schoolYear: string;
  semester: string;
  courses: { code: string; title: string; units: string; schedule: string; instructor: string }[];
  assessment: [string, string][];
  standing: [string, string][];
  status: 'enrolled' | 'partial' | 'unenrolled';
  signatures: [string, string][];
}) {
  const statusStyle = {
    enrolled: ['Officially Enrolled', 'border-[var(--green)] text-[var(--green)]'],
    partial: ['Partial Payment', 'border-[var(--amber)] text-[var(--amber)]'],
    unenrolled: ['Not Enrolled', 'border-[var(--red)] text-[var(--red)]'],
  }[status];
  return <article className="cor-doc rounded-xl border-2 border-solid border-[var(--pink-700)] bg-[var(--card)] p-[18px] min-[641px]:p-7">
    <header className="cor-doc-head mb-[22px] flex flex-col items-start justify-between gap-3 border-0 border-b-[3px] border-solid border-[var(--pink-700)] pb-[18px] min-[641px]:flex-row min-[641px]:flex-wrap min-[641px]:items-center print:flex-row print:items-center">
      <div className="flex items-center gap-3.5">
        <img src="../logo.png" alt="Iligan Medical Center College logo" className="cor-logo-img size-14 shrink-0 rounded-lg object-contain" />
        <div className="cor-school-info">
          <h1 className="m-0 text-[15px] font-extrabold tracking-[.02em] text-[var(--pink-700)] uppercase">Iligan Medical Center College</h1>
          <p className="mt-0.5 mb-0 text-xs text-[var(--ink-500)]">San Miguel, Iligan City, Lanao del Norte, Philippines</p>
          <div className="cor-registrar-label mt-[3px] text-[11px] font-bold tracking-[.04em] text-[var(--pink-500)] uppercase">Office of the College Registrar</div>
        </div>
      </div>
      <div className="cor-doc-title min-[641px]:text-right print:text-right">
        <h2 className="m-0 text-sm leading-[1.3] font-extrabold tracking-[.06em] text-[var(--pink-700)] uppercase">Certificate of<br />Registration</h2>
        <span className="mt-0.5 block text-xs text-[var(--ink-500)]">AY {schoolYear} · {semester}</span>
      </div>
    </header>

    <div className="cor-info-grid mb-[22px] grid grid-cols-1 gap-3.5 rounded-lg border border-solid border-[var(--line)] bg-[var(--bg)] px-5 py-4 min-[641px]:grid-cols-2 print:grid-cols-2">
      {student.map(([label, value]) => <div key={label} className="cor-info-item flex min-w-0 justify-between gap-2.5 text-[13px] min-[641px]:justify-start print:justify-start">
        <span className="shrink-0 font-medium text-[var(--ink-500)] min-[641px]:w-[110px]">{label}</span>
        <strong className="min-w-0 text-right font-bold text-[var(--ink-900)] [overflow-wrap:anywhere] min-[641px]:text-left print:text-left">{value}</strong>
      </div>)}
    </div>

    <h3 className="cor-section-heading mt-[22px] mb-3 border-0 border-b border-solid border-[var(--line)] pb-2 text-[13px] font-bold tracking-[.04em] text-[var(--pink-700)] uppercase">Enrolled Subjects &amp; Schedule</h3>
    <div className="mb-[18px] overflow-x-auto print:overflow-visible" role="region" aria-label="Enrolled subjects and schedule" tabIndex={0}>
      <table className="w-full min-w-[480px] border-collapse text-[13px] print:min-w-0 [&_td]:px-3 [&_td]:py-[11px] [&_td]:text-[var(--ink-900)] [&_tr:nth-child(even)_td]:bg-[var(--bg)]">
        <thead><tr>{['Course Code', 'Course Title', 'Units', 'Schedule', 'Instructor'].map(label =>
          <th key={label} scope="col" className={`border-b-2 border-solid border-[var(--pink-600)] bg-[#9D1F3A] px-3 py-2.5 text-[11px] font-bold tracking-[.05em] text-white uppercase ${label === 'Units' ? 'text-right' : 'text-left'}`}>{label}</th>)}</tr></thead>
        <tbody>{courses.length ? courses.map((course, index) => <tr key={index}>
          <td className="font-mono font-semibold">{course.code}</td>
          <td>{course.title}</td>
          <td className="text-right">{course.units}</td>
          <td>{course.schedule}</td>
          <td>{course.instructor}</td>
        </tr>) : <tr><td colSpan={5}>No enrolled subjects found for this term.</td></tr>}</tbody>
      </table>
    </div>

    <h3 className="cor-section-heading mt-[22px] mb-3 border-0 border-b border-solid border-[var(--line)] pb-2 text-[13px] font-bold tracking-[.04em] text-[var(--pink-700)] uppercase">Assessment &amp; Payment Summary</h3>
    <div className="cor-financial-grid mt-[18px] grid grid-cols-1 gap-[18px] min-[641px]:grid-cols-2 print:grid-cols-2">
      <section className="cor-summary-card rounded-lg border border-solid border-[var(--line)] bg-[var(--bg)] p-4">
        <h4 className="cor-summary-card-header mt-0 mb-2.5 text-[11px] font-bold tracking-[.03em] text-[var(--pink-700)] uppercase">Tuition &amp; Fees Breakdown</h4>
        {assessment.map(([label, value], index) => <div key={label} className={`cor-summary-row flex justify-between gap-2 py-1.5 text-[13px] ${index === assessment.length - 1
          ? 'cor-total mt-1.5 border-0 border-t-2 border-solid border-[var(--pink-700)] pt-2.5 text-[15px] font-extrabold text-[var(--pink-600)]' : ''}`}>
          <span>{label}</span><span className="text-right font-semibold">{value}</span>
        </div>)}
      </section>
      <section className="cor-summary-card rounded-lg border border-solid border-[var(--line)] bg-[var(--bg)] p-4">
        <h4 className="cor-summary-card-header mt-0 mb-2.5 text-[11px] font-bold tracking-[.03em] text-[var(--pink-700)] uppercase">Account Standing</h4>
        {standing.map(([label, value], index) => <div key={label} className="cor-summary-row flex justify-between gap-2 py-1.5 text-[13px]">
          <span>{label}</span><span className={`text-right font-bold ${index === 0 ? 'text-[var(--green)]' : 'text-[var(--red)]'}`}>{value}</span>
        </div>)}
        <div className="cor-summary-row flex justify-between gap-2 py-1.5 text-[13px]">
          <span>Status:</span><span className={`mt-2 rounded border-2 border-solid px-3 py-1 text-right text-[11px] font-extrabold tracking-[.1em] uppercase ${statusStyle[1]}`}>{statusStyle[0]}</span>
        </div>
      </section>
    </div>

    <div className="cor-signatures mt-11 grid grid-cols-1 gap-[26px] pt-[18px] text-center text-xs min-[641px]:grid-cols-3 min-[641px]:gap-[18px] print:grid-cols-3">
      {signatures.map(([label, value]) => <div key={label} className="min-w-0">
        <div className="cor-sig-line mt-[38px] border-0 border-t border-solid border-[var(--ink-900)] pt-1.5 font-bold text-[var(--ink-900)] [overflow-wrap:anywhere]">{value}</div>
        <div className="cor-sig-title text-[11px] text-[var(--ink-500)]">{label}</div>
      </div>)}
    </div>

    <footer className="cor-doc-footer mt-7 border-0 border-t-2 border-solid border-[var(--pink-700)] pt-3.5 text-center text-[11px] leading-[1.6] text-[var(--ink-500)]">
      <strong className="text-[var(--pink-700)]">Iligan Medical Center College</strong> · San Miguel, Iligan City, Lanao del Norte 9200<br />
      Tel: (063) 221-4050 · Email: registrar@imcc.edu.ph · This document is electronically generated.
    </footer>
  </article>;
}
