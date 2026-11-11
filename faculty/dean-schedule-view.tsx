type Instructor = { id: string; full_name: string };
type Offering = {
  id: number | string;
  code?: string;
  title?: string;
  program?: string;
  schedule?: string;
  instructor_id?: string | null;
  instructor_name?: string | null;
};

export function WorkloadRows({ rows }: { rows: { id: string; name: string; sections: number; units: number }[] }) {
  return <>{rows.map(({ id, name, sections, units }) => {
    const [label, color] = units >= 24 ? ['Heavy', 'badge-red'] : units >= 12 ? ['Balanced', 'badge-green'] : ['Light', 'badge-amber'];
    return <tr key={id}>
      <td><b>{name}</b></td><td>{sections}</td><td>{units}</td>
      <td><span className={`badge ${color}`}>{label}</span></td>
    </tr>;
  })}</>;
}

export function AssignmentRows({ offerings, instructors, currentUserId, pending }: {
  offerings: Offering[];
  instructors: Instructor[];
  currentUserId: string;
  pending: Map<string, string>;
}) {
  return <>{offerings.map(offering => {
    const id = String(offering.id);
    const savedId = offering.instructor_id || instructors.find(person => person.full_name === offering.instructor_name)?.id || '';
    const selectedId = pending.get(id) ?? savedId;
    return <tr key={id}>
      <td><b>{offering.code || '—'}</b></td>
      <td>{offering.title || '—'}</td>
      <td>{offering.program || '—'}</td>
      <td>{offering.schedule || 'TBA'}</td>
      <td>
        <select className="field-input assign-select w-auto!" aria-label={`Instructor for ${offering.code || offering.title || 'offering'}`}
          data-id={id} defaultValue={selectedId} disabled={pending.has(id)}>
          <option value="">— Unassigned —</option>
          {selectedId && !instructors.some(person => person.id === selectedId) &&
            <option value={selectedId} disabled>{offering.instructor_name || 'Previous instructor'}</option>}
          {instructors.map(person => <option key={person.id} value={person.id}>
            {person.full_name}{person.id === currentUserId ? ' (You)' : ''}
          </option>)}
        </select>
      </td>
      <td><div className="flex items-center gap-1.5">
        <button type="button" className="mini-btn edit-offering-btn bg-[var(--blue,#0284c7)]! text-white!" data-id={id}>Edit</button>
        <button type="button" className="mini-btn danger delete-offering-btn" data-id={id}>Delete</button>
      </div></td>
    </tr>;
  })}</>;
}

type Field = {
  name: 'code' | 'title' | 'program' | 'year' | 'semester' | 'school_year' | 'units' | 'schedule';
  label: string;
  type: 'text' | 'number' | 'select';
  required?: boolean;
  placeholder?: string;
  defaultValue?: string;
  options?: [string, string][];
};

export const offeringFields: Field[] = [
  { name: 'code', label: 'Subject Code', type: 'text', required: true, placeholder: 'e.g. CAP 102 or CC 101' },
  { name: 'title', label: 'Course Title', type: 'text', required: true, placeholder: 'e.g. Capstone Project and Research 2' },
  { name: 'program', label: 'Program', type: 'select', required: true, options: ['BSIT', 'BSCS', 'BSIS'].map(value => [value, value]) },
  { name: 'year', label: 'Year Level', type: 'select', required: true, options: [['1', '1st Year'], ['2', '2nd Year'], ['3', '3rd Year'], ['4', '4th Year']] },
  { name: 'semester', label: 'Semester', type: 'select', required: true, options: ['1st Semester', '2nd Semester', 'Summer'].map(value => [value, value]) },
  { name: 'school_year', label: 'School Year', type: 'text', required: true, placeholder: '2026-2027', defaultValue: '2026-2027' },
  { name: 'units', label: 'Total Units', type: 'number', required: true, placeholder: '3.0', defaultValue: '3.0' },
  { name: 'schedule', label: 'Schedule', type: 'text', placeholder: 'e.g. MWF 08:00–09:30 or TTH 13:00–14:30' },
];

export function OfferingFields({ initial, courses }: {
  initial: Partial<Record<Field['name'], string | number | null>> | null;
  courses: { code: string; title: string }[];
}) {
  return <>
    <div className="form-row">
      <label htmlFor="field_catalog_search">Find a curriculum subject</label>
      <input id="field_catalog_search" className="field-input w-full" type="search" placeholder="Search by code or subject title" />
    </div>
    <div className="form-row">
      <label htmlFor="field_catalog_course">Curriculum subject</label>
      <select id="field_catalog_course" className="field-input w-full">
        <option value="">Choose from curriculum</option>
        {courses.map(course => <option key={course.code} value={course.code}>{course.code} — {course.title}</option>)}
      </select>
    </div>
    {offeringFields.map(field => {
      const id = 'field_' + field.name;
      const value = initial?.[field.name] === undefined ? field.defaultValue ?? '' : initial[field.name] ?? '';
      return <div className="form-row min-w-0" key={id}>
        <label htmlFor={id}>{field.label}</label>
        {field.options ? <select id={id} className="field-input w-full" defaultValue={value} required={field.required}>
          <option value="">Select…</option>
          {field.options.map(([option, label]) => <option key={option} value={option}>{label}</option>)}
        </select> : <input id={id} className="field-input w-full" type={field.type}
          placeholder={field.placeholder} defaultValue={value} required={field.required} />}
      </div>;
    })}
    <div className="form-row min-w-0" id="instructorSelectWrapper" />
  </>;
}

export function InstructorField({ options, selectedId, selectedName, currentUserId, loading, error }: {
  options: Instructor[];
  selectedId: string | null;
  selectedName: string | null;
  currentUserId: string;
  loading: boolean;
  error: boolean;
}) {
  return <>
    <label htmlFor="field_instructor_id">Assigned Instructor (optional)</label>
    <select id="field_instructor_id" className="field-input w-full" defaultValue={selectedId ?? ''}>
      <option value="">Unassigned — pending assignment</option>
      {selectedId && !options.some(person => person.id === selectedId) &&
        <option value={selectedId}>{selectedName || 'Previous instructor'} (choose an active replacement or Unassigned)</option>}
      {options.map(person => <option key={person.id} value={person.id}>
        {person.full_name}{person.id === currentUserId ? ' (You)' : ''}
      </option>)}
    </select>
    {loading && <p role="status" className="mt-2 text-sm">Loading instructors. You can save the subject as unassigned.</p>}
    {error && <p role="status" className="mt-2 text-sm">Instructors could not be loaded. Save as unassigned or <button type="button" id="retryInstructorLoad" className="underline">Retry</button>.</p>}
  </>;
}
