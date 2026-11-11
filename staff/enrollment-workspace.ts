import type { SupabaseClient } from '@supabase/supabase-js';

export type EnrollmentTerm = { school_year: string; semester: string; is_open: boolean };
export type StudentTerm = {
  student_id: string;
  student_name: string;
  student_no?: string;
  school_year: string;
  semester: string;
  year_level?: string;
};
export type EnrollmentRequest = StudentTerm & {
  id: string;
  status: string;
  code: string;
  title: string;
  units: number | string | null;
  schedule?: string;
  program?: string;
  section?: string;
  review_note?: string;
  enrolled_units?: number | string;
  enrolled_courses?: { code: string; title: string; units: number | string; schedule?: string }[];
};
export type Finalization = StudentTerm & { units: number | string; locked_at?: string | null };
export type EnrollmentSnapshot = { status: string; requests: EnrollmentRequest[]; groups: Finalization[]; terms: EnrollmentTerm[] };
export type EnrollmentAction =
  | { kind: 'review'; request: EnrollmentRequest; decision: 'approved' | 'rejected' }
  | { kind: 'finalize'; group: Finalization }
  | { kind: 'term'; term: EnrollmentTerm; open: boolean };

export async function loadEnrollmentWorkspace(client: SupabaseClient, status: string, readOnly = false): Promise<EnrollmentSnapshot> {
  const history = await client.rpc('list_enrollment_request_history', { p_status: status });
  if (history.error) throw new Error(history.error.message);
  const requests = history.data || [];
  const workspace = readOnly ? { data: { groups: [], terms: [] }, error: null } : await client.rpc('get_enrollment_workspace');
  if (workspace.error) throw new Error(workspace.error.message);
  const groups = workspace.data?.groups || [];
  const terms = workspace.data?.terms || [];
  if (!workspace.data || typeof workspace.data !== 'object' || Array.isArray(workspace.data) || !Array.isArray(requests) || !Array.isArray(groups) || !Array.isArray(terms)) {
    throw new Error('Invalid enrollment workspace response. Refresh to retry.');
  }
  return { status, requests, groups, terms };
}

export function groupEnrollmentRequests(requests: EnrollmentRequest[]) {
  const groups = new Map<string, EnrollmentRequest[]>();
  for (const request of requests) {
    const key = JSON.stringify([request.student_id, request.school_year, request.semester]);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(request);
  }
  return [...groups.values()];
}

export async function executeEnrollmentAction(client: SupabaseClient, action: EnrollmentAction, reason = '') {
  let result;
  switch (action.kind) {
    case 'review': {
      const note = action.decision === 'rejected' ? reason.trim() : null;
      if (note !== null && !note) throw new Error('A rejection reason is required.');
      if (note && note.length > 1000) throw new Error('Keep the rejection reason to 1,000 characters or fewer.');
      result = await client.rpc('review_enrollment_request', {
        p_request_id: action.request.id, p_decision: action.decision, p_review_note: note,
      });
      break;
    }
    case 'finalize':
      result = await client.rpc('finalize_enrollment', {
        p_student_id: action.group.student_id, p_school_year: action.group.school_year, p_semester: action.group.semester,
      });
      break;
    case 'term':
      result = await client.rpc('set_enrollment_term', {
        p_school_year: action.term.school_year, p_semester: action.term.semester, p_open: action.open,
      });
      break;
  }
  if (result.error) throw new Error(result.error.message);
}
