import { useEffect, useState } from 'preact/hooks';
import { listen } from '../data/live';
import { collection, orderBy, query } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { firebase } from '../firebase';
import { t, type Key } from '../i18n';
import { MIN_PASSWORD_LENGTH } from '../lib/passwords';
import type { Role, StaffUser } from '../session';
import { hasRight, RIGHTS, type Rights } from '../domain/rights';
import { approve, clearBlock, isApproved, revoke, useShifts, type Shift } from '../data/shifts';
import { denialsThisShift, isBlocked, MAX_DENIALS, shiftKey } from '../domain/shift';
import { useNow } from '../lib/useNow';
import { clock } from '../lib/time';
import { fill } from '../i18n/format';
import { errorKey } from './errors';
import { ErrorText, Field } from './Fields';

interface UserRow {
  uid: string;
  username: string;
  displayName: string;
  role: Role;
  active: boolean;
  mustChangePassword: boolean;
  rights?: Rights;
}

const ROLES: Role[] = ['admin', 'barman', 'server'];
const roleKey = (r: Role) => `role.${r}` as Key;

/** All user changes go through Cloud Functions; Firestore rules forbid client writes to users/*. */
function call(name: 'createUser' | 'updateUser' | 'resetPassword', data: Record<string, unknown>) {
  return httpsCallable(firebase!.functions, name)(data);
}

function messageOf(err: unknown): string {
  const key = errorKey(err);
  return key ? t(key) : (err as Error).message;
}

export function Users({ me }: { me: StaffUser }) {
  const [rows, setRows] = useState<UserRow[]>([]);
  const shifts = useShifts();
  const now = useNow(30_000);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(
    () =>
      listen(query(collection(firebase!.db, 'users'), orderBy('username')), (snap) =>
        setRows(snap.docs.map((d) => ({ uid: d.id, ...(d.data() as Omit<UserRow, 'uid'>) }))),
      ),
    [],
  );

  return (
    <section class="page">
      <h1 class="section-label">{t('users.title')}</h1>
      {notice && <p class="notice">{notice}</p>}
      <table class="list">
        <thead>
          <tr>
            <th>{t('users.username')}</th>
            <th>{t('users.displayName')}</th>
            <th>{t('users.role')}</th>
            <th>{t('users.status')}</th>
            <th>{t('users.thisShift')}</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.map((u) => (
            <UserRowView key={u.uid} row={u} me={me} shift={shifts.get(u.uid)} now={now} onNotice={setNotice} />
          ))}
        </tbody>
      </table>
      <CreateUser onNotice={setNotice} />
    </section>
  );
}

function UserRowView({ row, me, shift, now, onNotice }: { row: UserRow; me: StaffUser; shift?: Shift; now: number; onNotice: (s: string) => void }) {
  const isMe = row.uid === me.uid;
  const [mode, setMode] = useState<'view' | 'edit' | 'reset' | 'rights'>('view');
  const [rights, setRights] = useState<Rights>(row.rights ?? {});
  const [displayName, setDisplayName] = useState(row.displayName);
  const [role, setRole] = useState<Role>(row.role);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(action: () => Promise<unknown>, done: Key) {
    setBusy(true);
    setError(null);
    try {
      await action();
      setMode('view');
      setPassword('');
      onNotice(t(done));
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  }

  const status = [row.active ? t('users.active') : t('users.deactivated'), row.mustChangePassword ? t('users.mustChange') : null]
    .filter(Boolean)
    .join(' · ');

  return (
    <>
      <tr class={row.active ? '' : 'inactive'}>
        <td>{row.username}{isMe && <span class="badge">{t('users.you')}</span>}</td>
        <td>{row.displayName}</td>
        <td>{t(roleKey(row.role))}</td>
        <td>{status}</td>
        <td>{row.role === 'server' && row.active && <ShiftCell row={row} shift={shift} now={now} me={me} />}</td>
        <td class="actions">
          <button class="link" onClick={() => setMode(mode === 'edit' ? 'view' : 'edit')}>{t('users.edit')}</button>
          {row.role === 'server' && <button class="link" onClick={() => { setRights(row.rights ?? {}); setMode(mode === 'rights' ? 'view' : 'rights'); }}>{t('users.rights')}</button>}
          <button class="link" onClick={() => setMode(mode === 'reset' ? 'view' : 'reset')}>{t('users.resetPassword')}</button>
          {!isMe && (
            <button
              class="link"
              disabled={busy}
              onClick={() => {
                if (row.active && !confirm(t('users.confirmDeactivate'))) return;
                run(() => call('updateUser', { uid: row.uid, active: !row.active }), 'users.saved');
              }}
            >
              {row.active ? t('users.deactivate') : t('users.activate')}
            </button>
          )}
        </td>
      </tr>
      {mode !== 'view' && (
        <tr class="editor">
          <td colSpan={6}>
            <form
              class="inline-form"
              onSubmit={(e) => {
                e.preventDefault();
                if (mode === 'edit') run(() => call('updateUser', { uid: row.uid, displayName, role }), 'users.saved');
                else if (mode === 'rights') run(() => call('updateUser', { uid: row.uid, rights: Object.fromEntries(RIGHTS.map((r) => [r, hasRight(rights, r)])) }), 'users.saved');
                else run(() => call('resetPassword', { uid: row.uid, password }), 'users.passwordReset');
              }}
            >
              {mode === 'rights' ? (
                <fieldset class="rights">
                  <legend class="field-label">{t('users.rightsTitle')}</legend>
                  {RIGHTS.map((r) => (
                    <label class="check">
                      <input type="checkbox" checked={hasRight(rights, r)} onChange={(e) => setRights({ ...rights, [r]: (e.target as HTMLInputElement).checked })} />
                      <span>
                        {t(`right.${r}` as Key)}
                        <span class="field-hint"> · {t(`right.${r}.hint` as Key)}</span>
                      </span>
                    </label>
                  ))}
                </fieldset>
              ) : mode === 'edit' ? (
                <>
                  <Field label={t('users.displayName')} value={displayName} onInput={setDisplayName} />
                  <label class="field">
                    <span class="field-label">{t('users.role')}</span>
                    <select value={role} disabled={isMe} onChange={(e) => setRole((e.target as HTMLSelectElement).value as Role)}>
                      {ROLES.map((r) => <option value={r}>{t(roleKey(r))}</option>)}
                    </select>
                  </label>
                </>
              ) : (
                <Field label={t('users.tempPassword')} value={password} onInput={setPassword} type="password" autoComplete="new-password" hint={t('users.tempPasswordHint')} />
              )}
              <ErrorText text={error} />
              <span class="buttons">
                <button class="primary" disabled={busy || (mode === 'reset' && password.length < MIN_PASSWORD_LENGTH)}>{t('users.save')}</button>
                <button type="button" class="link" onClick={() => setMode('view')}>{t('users.cancel')}</button>
              </span>
            </form>
          </td>
        </tr>
      )}
    </>
  );
}

function CreateUser({ onNotice }: { onNotice: (s: string) => void }) {
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [role, setRole] = useState<Role>('server');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: Event) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await call('createUser', { username, displayName, role, password });
      setUsername('');
      setDisplayName('');
      setPassword('');
      onNotice(t('users.created'));
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form class="card form wide" onSubmit={submit}>
      <h2 class="section-label">{t('users.create')}</h2>
      <Field label={t('users.username')} value={username} onInput={setUsername} autoComplete="off" />
      <Field label={t('users.displayName')} value={displayName} onInput={setDisplayName} autoComplete="off" />
      <label class="field">
        <span class="field-label">{t('users.role')}</span>
        <select value={role} onChange={(e) => setRole((e.target as HTMLSelectElement).value as Role)}>
          {ROLES.map((r) => <option value={r}>{t(roleKey(r))}</option>)}
        </select>
      </label>
      <Field label={t('users.tempPassword')} value={password} onInput={setPassword} type="password" autoComplete="new-password" hint={t('users.tempPasswordHint')} />
      <ErrorText text={error} />
      <button class="primary" disabled={busy || !username || !displayName || password.length < MIN_PASSWORD_LENGTH}>{t('users.create')}</button>
    </form>
  );
}

/** This shift's permission for a server, with the action that fits: allow (also unasked), take back, or unblock. */
function ShiftCell({ row, shift, now, me }: { row: UserRow; shift?: Shift; now: number; me: StaffUser }) {
  if (!hasRight(row.rights, 'logIn')) return <span class="field-hint">{t('shift.noLogIn')}</span>;
  if (hasRight(row.rights, 'noApproval')) return <span class="field-hint">{t('shift.trusted')}</span>;
  const current = shift?.shiftDay === shiftKey(now) ? shift : undefined;
  if (isApproved(current, now)) {
    return (
      <span class="shift-cell">
        <span class="ok">{fill(t('shift.until'), { time: clock(current!.approvedUntilMs!) })}</span>
        <button class="link danger" onClick={() => revoke(shift, row.uid, row.displayName, me)}>{t('shift.revoke')}</button>
      </span>
    );
  }
  if (isBlocked(shift, now)) {
    return (
      <span class="shift-cell">
        <span class="error">{fill(t('shift.blocked'), { time: clock(shift!.blockedUntilMs!) })}</span>
        <button class="link" onClick={() => clearBlock(row.uid, row.displayName, me)}>{t('shift.unblock')}</button>
      </span>
    );
  }
  const label = current?.status === 'requested' ? fill(t('shift.asked'), { time: clock(current.requestedAtMs ?? now) })
    : current?.status === 'denied' ? fill(t('shift.deniedCount'), { n: String(denialsThisShift(current, now)), max: String(MAX_DENIALS) })
    : current?.status === 'revoked' ? t('shift.revoked')
    : current?.status === 'cleared' ? t('shift.cleared')
    : t('shift.notStarted');
  return (
    <span class="shift-cell">
      <span class="field-hint">{label}</span>
      <button class="link" onClick={() => approve(row.uid, row.displayName, me)}>{t('permission.allow')}</button>
    </span>
  );
}
