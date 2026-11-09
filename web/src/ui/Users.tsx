import { useEffect, useState } from 'preact/hooks';
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { firebase } from '../firebase';
import { t, type Key } from '../i18n';
import { MIN_PASSWORD_LENGTH } from '../lib/passwords';
import type { Role, StaffUser } from '../session';
import { errorKey } from './errors';
import { ErrorText, Field } from './Fields';

interface UserRow {
  uid: string;
  username: string;
  displayName: string;
  role: Role;
  active: boolean;
  mustChangePassword: boolean;
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
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(
    () =>
      onSnapshot(query(collection(firebase!.db, 'users'), orderBy('username')), (snap) =>
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
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.map((u) => (
            <UserRowView key={u.uid} row={u} isMe={u.uid === me.uid} onNotice={setNotice} />
          ))}
        </tbody>
      </table>
      <CreateUser onNotice={setNotice} />
    </section>
  );
}

function UserRowView({ row, isMe, onNotice }: { row: UserRow; isMe: boolean; onNotice: (s: string) => void }) {
  const [mode, setMode] = useState<'view' | 'edit' | 'reset'>('view');
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
        <td class="actions">
          <button class="link" onClick={() => setMode(mode === 'edit' ? 'view' : 'edit')}>{t('users.edit')}</button>
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
          <td colSpan={5}>
            <form
              class="inline-form"
              onSubmit={(e) => {
                e.preventDefault();
                if (mode === 'edit') run(() => call('updateUser', { uid: row.uid, displayName, role }), 'users.saved');
                else run(() => call('resetPassword', { uid: row.uid, password }), 'users.passwordReset');
              }}
            >
              {mode === 'edit' ? (
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
