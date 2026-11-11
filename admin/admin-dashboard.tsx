import { renderToStaticMarkup } from 'react-dom/server';
import DashboardView from './admin-dashboard-view';
import { mountDashboard } from '../shared/dashboard-workspace';

type RoleControlsProps = {
  userId: string;
  name: string;
  choices: readonly (readonly [string, string])[];
  value: string;
  isSelf: boolean;
  hasDraft: boolean;
  saving: boolean;
  accessBusy: boolean;
};

function RoleSelect({ userId, name, choices, value, disabled }: Pick<RoleControlsProps, 'userId' | 'name' | 'choices' | 'value'> & { disabled: boolean }) {
  return <select
      className="max-w-full cursor-pointer rounded-md border border-[var(--surface-border)] bg-[var(--bg-dark)] px-3 py-2 text-[13px] font-semibold text-[var(--text-main)] focus-visible:outline-2 focus-visible:outline-[var(--primary)] disabled:cursor-default"
      data-role-user-id={userId}
      aria-label={`Role for ${name}`}
      defaultValue={value}
      disabled={disabled}
    >
      {choices.map(([optionValue, label]) => <option key={optionValue} value={optionValue}>{label}</option>)}
    </select>;
}

const roleButtonClass = 'cursor-pointer rounded-md border-0 px-3 py-2 text-xs font-bold text-white enabled:hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary)] disabled:cursor-default disabled:opacity-55';

function RoleControls({ userId, name, choices, value, isSelf, hasDraft, saving, accessBusy }: RoleControlsProps) {
  return <div className="flex flex-wrap items-center gap-2">
    <RoleSelect userId={userId} name={name} choices={choices} value={value} disabled={isSelf || saving || accessBusy} />
    {!isSelf && <button
      type="button"
      className={`${roleButtonClass} bg-[var(--success)]`}
      data-save-role=""
      aria-label={`Save role for ${name}`}
      disabled={!hasDraft || saving || accessBusy}
    >{saving ? 'Saving…' : 'Save'}</button>}
  </div>;
}

type AccountRow = {
  id: string;
  full_name?: string | null;
  email: string;
  student_no?: string | null;
  program?: string | null;
  roleValue: string;
};

function searchHighlight(term: string) {
  const pattern = term && new RegExp('(' + term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'ig');
  return (value: string) => {
    if (!pattern) return value;
    return value.split(pattern).map((part, index) => index % 2 ? <span key={index} className="highlight">{part}</span> : part);
  };
}

function AccountDetails({ user, highlight, isSelf }: { user: AccountRow; highlight: ReturnType<typeof searchHighlight>; isSelf?: boolean }) {
  return <>
    <td><strong>{highlight(user.full_name || 'N/A')}</strong> {isSelf && <small className="text-[var(--primary)]">(You)</small>}</td>
    <td>{highlight(user.email)}</td>
    <td><code>{highlight(user.student_no || 'N/A')}</code></td>
    <td>{highlight(user.program || '—')}</td>
  </>;
}

function PendingRows({ users, choices, term }: { users: (AccountRow & { busy: boolean })[]; choices: RoleControlsProps['choices']; term: string }) {
  const highlight = searchHighlight(term);

  return <>{users.map(user => {
    const name = user.full_name || user.email;
    return <tr key={user.id}>
      <AccountDetails user={user} highlight={highlight} />
      <td><RoleSelect userId={user.id} name={name} choices={choices} value={user.roleValue} disabled={user.busy} /></td>
      <td>
        <div className="flex flex-wrap gap-2">
          <button type="button" data-pending-action="approve" className={`${roleButtonClass} bg-[var(--success)]`} aria-label={`Approve ${name}`} disabled={user.busy}>Approve</button>
          <button type="button" data-pending-action="reject" className={`${roleButtonClass} bg-[var(--danger)]`} aria-label={`Reject ${name}`} disabled={user.busy}>Reject</button>
        </div>
      </td>
    </tr>;
  })}</>;
}

type ApprovedRow = AccountRow & Pick<RoleControlsProps, 'isSelf' | 'hasDraft' | 'saving' | 'accessBusy'> & { suspended: boolean };

function ApprovedRows({ users, choices, term }: { users: ApprovedRow[]; choices: RoleControlsProps['choices']; term: string }) {
  const highlight = searchHighlight(term);
  return <>{users.map(user => {
    const name = user.full_name || user.email;
    const action = user.suspended ? 'Restore access' : 'Revoke access';
    const actionColor = user.suspended ? 'bg-[var(--success)]' : 'bg-[var(--danger)]';
    const statusColor = user.suspended ? 'text-[var(--amber)]' : 'text-[var(--success)]';
    return <tr key={user.id}>
      <AccountDetails user={user} highlight={highlight} isSelf={user.isSelf} />
      <td><RoleControls {...user} userId={user.id} name={name} choices={choices} value={user.roleValue} /></td>
      <td><span className={`rounded-md px-2 py-1 text-xs font-bold ${statusColor}`}>{user.suspended ? 'Suspended' : 'Active'}</span></td>
      <td>{user.isSelf ? <span className="text-xs text-[var(--text-muted)]">Active Session</span> : <button
        type="button"
        className={`${roleButtonClass} ${actionColor}`}
        data-account-access={user.id}
        aria-label={`${action} for ${name}`}
        disabled={user.accessBusy || user.saving}
      >{user.accessBusy ? 'Saving…' : action}</button>}</td>
    </tr>;
  })}</>;
}

// Use the dashboard's static markup boundary while its controller owns the table.
Object.assign(window, {
  renderAdminApprovedRows: (props: Parameters<typeof ApprovedRows>[0]) => renderToStaticMarkup(<ApprovedRows {...props} />),
  renderAdminPendingRows: (props: Parameters<typeof PendingRows>[0]) => renderToStaticMarkup(<PendingRows {...props} />),
});

mountDashboard(<DashboardView />);
