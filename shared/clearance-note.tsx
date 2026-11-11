import type { FormEventHandler } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';

const maxLength = 1000;

export function ClearanceNoteEditor({ id, office, note, disabled, open, onSubmit }: {
  id: string | number;
  office: string;
  note?: string | null;
  disabled?: boolean;
  open?: boolean;
  onSubmit?: FormEventHandler<HTMLFormElement>;
}) {
  return <details open={open} className="mt-2 min-w-44">
    <summary className="cursor-pointer text-xs font-semibold text-[var(--pink-600)]">Edit note</summary>
    <form key={note} data-clearance-note={id} onSubmit={onSubmit}>
      <fieldset disabled={disabled} className="m-0 min-w-0 border-0 p-0">
        <label className="block text-xs">
          Requirements visible to the student
          <textarea name="note" aria-label={`${office} clearance note`} rows={3} maxLength={maxLength}
            defaultValue={note ?? ''} placeholder="List what the student still needs to submit or resolve."
            className="my-1 block w-full rounded-lg border border-solid border-[var(--line)] bg-[var(--card)] p-2 text-sm text-[var(--ink-900)]" />
        </label>
        <button type="submit" className="cursor-pointer rounded-lg border-0 bg-[var(--pink-700)] px-3 py-2 text-xs font-semibold text-white disabled:opacity-60">Save note</button>
      </fieldset>
    </form>
  </details>;
}

export async function saveClearanceNote(client: SupabaseClient, row: {
  id: string | number; student_id: string; department_code: string; status?: string | null; note?: string | null;
}, draft: string) {
  const note = draft.trim() || null;
  if (note && note.length > maxLength) throw new Error(`Use at most ${maxLength} characters.`);
  if (row.status === 'cleared') throw new Error('This requirement is already cleared.');
  let update = client.from('clearances').update({ note })
    .eq('id', row.id).eq('student_id', row.student_id).eq('department_code', row.department_code);
  update = row.status == null ? update.is('status', null) : update.eq('status', row.status);
  update = row.note == null ? update.is('note', null) : update.eq('note', row.note);
  const { data, error } = await update.select('note').maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error('The clearance could not be updated. Refresh the record and try again.');
  return data.note as string | null;
}
