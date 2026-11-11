import type { SupabaseClient } from '@supabase/supabase-js';

export type Clearance = {
  id: string | number;
  student_id: string;
  department_code: string;
  department_name: string;
  status: string;
  note: string | null;
  profiles: { full_name: string | null; student_no: string | null; program: string | null; year_level?: string | null } | null;
};

export async function loadClearances(client: SupabaseClient): Promise<Clearance[]> {
  const { data, error } = await window.IMCC.fetchAll<Clearance>(() => client.rpc('get_clearance_workspace'));
  if (error) throw new Error(error.message);
  return data || [];
}

export async function clearStudent(client: SupabaseClient, row: Clearance) {
  const { data, error } = await client.from('clearances')
    .update({ status: 'cleared', cleared_at: new Date().toISOString() })
    .eq('id', row.id)
    .eq('student_id', row.student_id)
    .eq('department_code', row.department_code)
    .eq('status', row.status)
    .select('id').single();
  if (error) throw new Error(error.message);
  if (!data?.id) throw new Error('No clearance was changed. Refresh and retry.');
}
