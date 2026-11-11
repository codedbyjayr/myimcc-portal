import { ClearanceNoteEditor } from '../shared/clearance-note';

type Value = string | number | null | undefined;
type Row = { id?: string | number };
type Term = { semester?: string | null; school_year?: string | null };
type Student = {
  id: string;
  full_name?: string | null;
  student_no?: string | null;
  program?: string | null;
  year_level?: Value;
};
type Grade = Row & Term & {
  code?: Value;
  grade_scale?: 'school' | 'percentage' | null;
  prelim?: Value;
  midterm?: Value;
  semifinal?: Value;
  final?: Value;
  equivalent?: Value;
  remark?: Value;
};
type StudentRecord = {
  profile: Student & { id_number?: Value; section?: Value; email?: Value; phone?: Value; address?: Value };
  enrollments?: (Row & Term & { code?: Value; title?: Value; status?: Value; units?: Value })[];
  grades?: Grade[];
  clearances?: (Row & { department_name?: Value; status?: Value; note?: Value; cleared_at?: string | null })[];
  attendance?: (Row & { code?: Value; date?: string | null; status?: Value; notes?: Value })[];
  transactions?: (Row & { or_number?: Value; txn_date?: string | null; description?: Value; amount?: Value })[];
  billing?: { balance?: Value } | null;
  installments?: (Row & { name?: Value; due_date?: string | null; amount?: Value; status?: Value })[];
};

export function StudentPicker({ students }: { students: Student[] }) {
  if (!students.length) return <p className="px-2 py-3 text-sm text-[var(--ink-500)]">No matching students.</p>;
  return <>{students.map(student => {
    const details = [student.student_no, student.program, student.year_level].filter(Boolean).join(' · ');
    return <button className="nav-item min-w-0 break-words" type="button" key={student.id} data-student={student.id}>
      {student.full_name || 'Student'}
      {details && <small>{details}</small>}
    </button>;
  })}</>;
}

type Clearance = {
  id: string | number;
  department_code: string;
  department_name?: string | null;
  status?: 'cleared' | 'pending' | 'action_required' | null;
  note?: string | null;
  cleared_at?: string | null;
};

export function ClearanceDetails({ rows, pending, readOnly, formatDate }: {
  rows: Clearance[];
  pending: Set<string>;
  readOnly: boolean;
  formatDate: (value?: string | null) => string;
}) {
  if (!rows.length) return <p className="text-sm text-[var(--ink-500)]">No clearance records on file.</p>;
  return <div className="table-responsive overflow-x-auto rounded-lg border border-solid border-[var(--line)]"
    role="region" aria-label="Clearance requirements" tabIndex={0}>
    <table>
      <thead><tr>{['Office / Department', 'Status', 'Approval / Action', 'Note', 'Cleared Date'].map(label =>
        <th key={label} scope="col">{label}</th>
      )}</tr></thead>
      <tbody>{rows.map(row => {
        const id = String(row.id);
        const isDean = row.department_code === 'dean';
        const isCleared = row.status === 'cleared';
        const requiresAction = row.status === 'action_required';
        const saving = pending.has(id);
        return <tr key={id}>
          <td><b>{row.department_name || row.department_code}</b></td>
          <td><span className={`badge ${isCleared ? 'badge-green' : requiresAction ? 'badge-red' : 'badge-amber'}`}>
            {isCleared ? '✓ Cleared' : requiresAction ? 'Action Required' : 'Pending'}
          </span></td>
          <td>{isCleared
            ? <span className="text-xs font-semibold text-[var(--emerald)]">{isDean ? '✓ Cleared requirement' : '✓ Cleared'}</span>
            : isDean
              ? <button type="button" className="mini-btn success disabled:cursor-not-allowed disabled:opacity-60"
                data-clearance-id={id} disabled={readOnly || saving}>
                {saving ? 'Approving…' : '✓ Clear College Dean requirement'}
              </button>
              : <span className="text-xs text-[var(--ink-500)]">{requiresAction ? 'Awaiting student action' : 'Awaiting office approval'}</span>
          }</td>
          <td><div className="whitespace-pre-wrap [overflow-wrap:anywhere]" data-clearance-note-text>{row.note || '—'}</div>
            {isDean && !isCleared && !readOnly && <ClearanceNoteEditor id={id} office="Dean" note={row.note} disabled={saving} />}
          </td>
          <td>{formatDate(row.cleared_at)}</td>
        </tr>;
      })}</tbody>
    </table>
  </div>;
}

function RecordTable<T extends Row>({ title, rows, columns }: {
  title: string;
  rows?: T[] | null;
  columns: [string, (row: T) => Value][];
}) {
  return <section className="min-w-0 space-y-2">
    <h4 className="m-0 font-semibold">{title}</h4>
    {rows?.length ? <div className="table-responsive overflow-x-auto rounded-lg border border-solid border-[var(--line)]"
      tabIndex={0} role="region" aria-label={title}>
      <table>
        <thead><tr>{columns.map(([label]) => <th key={label} scope="col">{label}</th>)}</tr></thead>
        <tbody>{rows.map((row, index) => <tr key={row.id ?? index}>
          {columns.map(([label, value]) => <td key={label}>{value(row) ?? '—'}</td>)}
        </tr>)}</tbody>
      </table>
    </div> : <p className="m-0 text-sm text-[var(--ink-500)]">No records.</p>}
  </section>;
}

const termLabel = ({ semester, school_year }: Term) => [semester, school_year].filter(Boolean).join(' ') || '—';
const peso = (value: Value) => '₱' + Number(value || 0).toLocaleString('en-US', { maximumFractionDigits: 2 });

export function RecordDetails({ record, formatDate, formatGrade }: {
  record: StudentRecord;
  formatDate: (value?: string | null) => string;
  formatGrade: (value: Value) => string;
}) {
  const mark = (value: Value, grade: Grade) =>
    grade.grade_scale === 'percentage' ? (value == null ? '—' : value + '%') : formatGrade(value);

  return <div className="min-w-0 space-y-5">
    <RecordTable title="Student Information" rows={[record.profile]} columns={[
      ['Student No.', row => row.student_no || row.id_number], ['Program', row => row.program],
      ['Year / Section', row => [row.year_level, row.section].filter(Boolean).join(' / ') || '—'],
      ['Email', row => row.email], ['Phone', row => row.phone], ['Address', row => row.address],
    ]} />
    <RecordTable title="Enrollment & Terms" rows={record.enrollments} columns={[
      ['Subject', row => [row.code, row.title].filter(Boolean).join(' — ') || '—'], ['Term', termLabel],
      ['Status', row => row.status], ['Units', row => row.units],
    ]} />
    <RecordTable title="Grades" rows={record.grades} columns={[
      ['Subject', row => row.code], ['Term', termLabel], ['Prelim', row => mark(row.prelim, row)],
      ['Midterm', row => mark(row.midterm, row)], ['Semifinal', row => mark(row.semifinal, row)],
      ['Final', row => mark(row.final, row)], ['Equivalent', row => formatGrade(row.equivalent)], ['Remark', row => row.remark],
    ]} />
    <RecordTable title="Clearance" rows={record.clearances} columns={[
      ['Office', row => row.department_name], ['Status', row => row.status], ['Note', row => row.note],
      ['Cleared', row => formatDate(row.cleared_at)],
    ]} />
    <RecordTable title="Attendance" rows={record.attendance} columns={[
      ['Subject', row => row.code], ['Date', row => formatDate(row.date)], ['Status', row => row.status], ['Notes', row => row.notes],
    ]} />
    <RecordTable title="Payment Records" rows={record.transactions} columns={[
      ['Receipt', row => row.or_number], ['Date', row => formatDate(row.txn_date)], ['Description', row => row.description],
      ['Amount', row => peso(row.amount)],
    ]} />
    <section className="space-y-2">
      <h4 className="m-0 font-semibold">Balance</h4>
      <p className="m-0">{record.billing?.balance == null ? 'No billing summary on file' : peso(record.billing.balance)}</p>
    </section>
    <RecordTable title="Installments" rows={record.installments} columns={[
      ['Name', row => row.name], ['Due', row => formatDate(row.due_date)], ['Amount', row => peso(row.amount)],
      ['Status', row => row.status],
    ]} />
  </div>;
}
