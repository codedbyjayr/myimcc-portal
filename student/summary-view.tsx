type Summary = {
  gwa: string;
  units: string | number;
  subjects: string;
  balance: string;
  due: string;
  clearance: string;
};

export function StudentSummary({ summary }: { summary?: Summary }) {
  return <div className="mb-4 grid grid-cols-2 gap-2.5 lg:mb-[22px] lg:grid-cols-4 lg:gap-4">
    {[
      { id: 'gwa', label: 'GWA', value: summary?.gwa, detail: 'Current semester', icon: <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="3" /></> },
      { id: 'units', label: 'Units Enrolled', value: summary?.units, detail: summary?.subjects, detailId: 'stat-subjects', accent: 'c2',
        icon: <path d="M17 3a2.8 2.8 0 114 4L7.5 20.5 2 22l1.5-5.5L17 3z" /> },
      { id: 'balance', label: 'Balance Due', value: summary?.balance, detail: summary?.due, detailId: 'stat-due', accent: 'c3',
        icon: <><rect x="2" y="6" width="20" height="14" rx="2" /><path d="M2 10h20" /><path d="M16 14h.01" /></> },
      { id: 'clearance', label: 'Clearance', value: summary?.clearance, detail: 'Cleared departments', accent: 'c4',
        icon: <><circle cx="12" cy="12" r="9" /><path d="M8 12l3 3 5-6" /></> },
    ].map(({ id, label, value, detail, detailId, accent, icon }) =>
      <div className={`stat min-w-0 ${accent || ''}`} key={id}>
        <div className="stat-top">
          <span className="stat-label uppercase">{label}</span>
          <div className="stat-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">{icon}</svg>
          </div>
        </div>
        <div className="stat-value" id={`stat-${id}`}>
          {value ?? <span className="imcc-skel imcc-skel-stat-val" />}
        </div>
        <div className="stat-sub" id={detailId}>
          {detail ?? <span className="imcc-skel imcc-skel-inline h-3 w-[75px]" />}
        </div>
      </div>
    )}
  </div>;
}

export function StudentAnnouncement({ content, deadline }: { content: string; deadline?: string }) {
  return <>
    <span className="banner-text">🔔 {content}{deadline && <> Deadline: <b>{deadline}</b>.</>}</span>
    <button className="banner-close" id="bannerCloseBtn" aria-label="Dismiss announcement" type="button">×</button>
  </>;
}

export function StudentDeadlines({ rows, date }: {
  rows?: { id?: string | number; title: string; type: string; due_date: string }[] | null;
  date: (value: string) => string;
}) {
  return <>
    <div className="card-head"><h3>Upcoming Deadlines</h3></div>
    {rows?.length ? rows.map((row, index) => {
      const urgent = row.type === 'urgent';
      return <div key={row.id ?? index} className={`deadline border-b-[var(--line)]! px-0! py-2.5! ${urgent ? 'urgent' : ''}`}>
        <div className="deadline-top flex items-center justify-between gap-2">
          <span className="wrap-anywhere text-[13px] font-semibold">{row.title}</span>
          <span className={`pill shrink-0 ${urgent ? 'pill-urgent' : 'pill-soft'}`}>
            {urgent ? 'URGENT' : row.type === 'schedule' ? 'SCHEDULE' : 'OPTIONAL'}
          </span>
        </div>
        <div className={`mt-0.5 text-xs ${urgent ? 'font-bold text-[var(--pink-600)]' : 'text-[var(--ink-500)]'}`}>
          {date(row.due_date)}
        </div>
      </div>;
    }) : <p className="m-0 py-2.5 text-[13px] text-[var(--ink-500)]">No upcoming deadlines.</p>}
  </>;
}

export function StudentNotifications({ rows, date }: {
  rows: { id: string | number; description: string; created_at: string }[] | null;
  date: (value: string) => string;
}) {
  if (!rows?.length) return <div className="notif-item">
    <div className="t">{rows ? 'No new notifications' : 'Notifications unavailable'}</div>
  </div>;

  return <>{rows.map(row => <div key={row.id} className="notif-item border-b border-[var(--line)] px-3.5 py-2.5">
    <div className="wrap-anywhere text-xs font-semibold">{row.description}</div>
    <div className="text-[10px] text-[var(--ink-500)]">{date(row.created_at)}</div>
  </div>)}</>;
}

export function StudentActivity({ rows, date }: {
  rows?: { id: string; description: string; created_at: string; color?: string }[] | null;
  date?: (value: string) => string;
}) {
  if (rows === undefined) return <><div className="imcc-skel-row imcc-skel" /><div className="imcc-skel-row imcc-skel" /><div className="imcc-skel-row imcc-skel" /></>;
  if (!rows?.length) return <p className="my-2 text-sm text-[var(--ink-500)]">
    {rows ? 'No recent activity yet.' : 'Recent activity is unavailable.'}
  </p>;

  return <ul className="m-0 list-none divide-y divide-[var(--line)] p-0">
    {rows.map((row, index) => <li key={row.id ?? index} className="flex items-start gap-3 py-2.5">
      <span aria-hidden="true" className="mt-1.5 size-2 shrink-0 rounded-full bg-[var(--pink-600)]"
        style={row.color && /^#[\da-f]{3}(?:[\da-f]{3})?$/i.test(row.color) ? { backgroundColor: row.color } : undefined} />
      <div className="min-w-0 wrap-anywhere">
        <div className="text-sm font-semibold">{row.description}</div>
        <div className="text-xs text-[var(--ink-500)]">{date?.(row.created_at)}</div>
      </div>
    </li>)}
  </ul>;
}
