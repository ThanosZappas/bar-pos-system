import { useEffect, useState } from 'preact/hooks';
import { listen } from '../data/live';
import { collection, orderBy, query, type Timestamp } from 'firebase/firestore';
import { callable, firebase } from '../firebase';
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
import { Avatar, iconOf, ProfileIcon } from './Avatar';
import { PROFILE_ICONS } from './profileIconSet';
import { removePhone, removePhoto, resetPin, setIcon, unlockPin, uploadPhoto, usePhones, usePhotos, type Phone } from '../data/profiles';
import { loadImage } from '../lib/photo';
import { PhotoCropper } from './PhotoCropper';
import { dateTime } from '../lib/time';

interface UserRow {
  uid: string;
  username: string;
  displayName: string;
  role: Role;
  active: boolean;
  mustChangePassword: boolean;
  rights?: Rights;
  deleted?: boolean;
  icon?: string;
  photoVersion?: number;
  pinSet?: boolean;
  pinLockedUntil?: Timestamp;
}

const ROLES: Role[] = ['admin', 'barman', 'server'];
const roleKey = (r: Role) => `role.${r}` as Key;

/** All user changes go through the server functions; Firestore rules forbid client writes to users/*. */
function call(name: 'createUser' | 'updateUser' | 'resetPassword' | 'deleteUser', data: Record<string, unknown>) {
  return callable(name)(data);
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
  const photos = usePhotos();
  const phones = usePhones();

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
            <th />
            <th>{t('users.username')}</th>
            <th>{t('users.displayName')}</th>
            <th>{t('users.role')}</th>
            <th>{t('users.status')}</th>
            <th>{t('users.thisShift')}</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.filter((u) => !u.deleted).map((u) => (
            <UserRowView key={u.uid} row={u} me={me} shift={shifts.get(u.uid)} now={now} photoUrl={u.photoVersion ? photos.get(u.uid) : undefined} onNotice={setNotice} />
          ))}
        </tbody>
      </table>
      <CreateUser onNotice={setNotice} />
      <Phones phones={phones} rows={rows} onNotice={setNotice} />
    </section>
  );
}

function UserRowView({ row, me, shift, now, photoUrl, onNotice }: { row: UserRow; me: StaffUser; shift?: Shift; now: number; photoUrl?: string; onNotice: (s: string) => void }) {
  const isMe = row.uid === me.uid;
  const [mode, setMode] = useState<'view' | 'edit' | 'reset' | 'rights' | 'look'>('view');
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

  const lockedUntil = row.pinLockedUntil?.toMillis();
  const locked = lockedUntil !== undefined && lockedUntil > now;
  const pinStatus = locked ? fill(t('users.pinLocked'), { time: clock(lockedUntil!) }) : row.pinSet ? t('users.pinSet') : t('users.pinNone');
  const status = [row.active ? t('users.active') : t('users.deactivated'), row.mustChangePassword ? t('users.mustChange') : null, pinStatus]
    .filter(Boolean)
    .join(' · ');

  return (
    <>
      <tr class={row.active ? '' : 'inactive'}>
        <td><Avatar icon={iconOf(row.icon, row.role)} photoUrl={photoUrl} size={36} /></td>
        <td>{row.username}{isMe && <span class="badge">{t('users.you')}</span>}</td>
        <td>{row.displayName}</td>
        <td>{t(roleKey(row.role))}</td>
        <td>{status}</td>
        <td>{row.role === 'server' && row.active && <ShiftCell row={row} shift={shift} now={now} me={me} />}</td>
        <td class="actions">
          <button class="link" onClick={() => setMode(mode === 'edit' ? 'view' : 'edit')}>{t('users.edit')}</button>
          <button class="link" onClick={() => setMode(mode === 'look' ? 'view' : 'look')}>{t('users.look')}</button>
          {row.role === 'server' && <button class="link" onClick={() => { setRights(row.rights ?? {}); setMode(mode === 'rights' ? 'view' : 'rights'); }}>{t('users.rights')}</button>}
          <button class="link" onClick={() => setMode(mode === 'reset' ? 'view' : 'reset')}>{t('users.resetPassword')}</button>
          {locked && (
            <button class="link" disabled={busy} onClick={() => run(() => unlockPin(row.uid), 'users.pinUnlocked')}>
              {t('users.unlockPin')}
            </button>
          )}
          {row.pinSet && (
            <button
              class="link"
              disabled={busy}
              onClick={() => confirm(fill(t('users.confirmResetPin'), { name: row.displayName })) && run(() => resetPin(row.uid), 'users.pinReset')}
            >
              {t('users.resetPin')}
            </button>
          )}
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
          {!isMe && (
            <button
              class="link danger"
              disabled={busy}
              onClick={() => confirm(fill(t('users.confirmDelete'), { name: row.displayName })) && run(() => call('deleteUser', { uid: row.uid }), 'users.deleted')}
            >
              {t('users.delete')}
            </button>
          )}
        </td>
      </tr>
      {mode === 'look' && (
        <tr class="editor">
          <td colSpan={7}>
            <LookEditor row={row} photoUrl={photoUrl} onDone={(key) => { setMode('view'); onNotice(t(key)); }} onClose={() => setMode('view')} />
          </td>
        </tr>
      )}
      {mode !== 'view' && mode !== 'look' && (
        <tr class="editor">
          <td colSpan={7}>
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

/** Pick one of the gold line icons or upload a picture (cropped to its centre and shrunk here first). */
function LookEditor({ row, photoUrl, onDone, onClose }: { row: UserRow; photoUrl?: string; onDone: (key: Key) => void; onClose: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const current = iconOf(row.icon, row.role);

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      onDone('users.saved');
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  }

  const [cropping, setCropping] = useState<ImageBitmap | null>(null);

  async function pick(file: File | undefined) {
    if (!file) return;
    try {
      setCropping(await loadImage(file)); // the cropper decides the frame
    } catch {
      setError(t('users.photoFailed'));
    }
  }

  return (
    <div class="look-editor">
      <div class="icon-grid" role="group" aria-label={t('users.look')}>
        {Object.keys(PROFILE_ICONS).map((id) => (
          <button
            type="button"
            class={!photoUrl && id === current ? 'icon-choice selected' : 'icon-choice'}
            title={id}
            aria-label={id}
            aria-pressed={!photoUrl && id === current}
            disabled={busy}
            onClick={() => run(() => setIcon(row.uid, id))}
          >
            <ProfileIcon icon={id} size={28} />
          </button>
        ))}
      </div>
      <span class="buttons">
        <label class={busy ? 'file-button disabled' : 'file-button'}>
          {t('users.uploadPicture')}
          <input
            type="file"
            accept="image/*"
            hidden
            disabled={busy}
            onChange={(e) => {
              const input = e.target as HTMLInputElement;
              pick(input.files?.[0]);
              input.value = ''; // choosing the same file again still opens the cropper
            }}
          />
        </label>
        {photoUrl && <button type="button" class="link" disabled={busy} onClick={() => run(() => removePhoto(row.uid))}>{t('users.removePicture')}</button>}
        <button type="button" class="link" onClick={onClose}>{t('users.cancel')}</button>
      </span>
      <ErrorText text={error} />
      {cropping && (
        <PhotoCropper
          image={cropping}
          onCancel={() => setCropping(null)}
          onDone={(base64) => {
            setCropping(null);
            run(() => uploadPhoto(row.uid, base64));
          }}
        />
      )}
    </div>
  );
}

/** Phones where staff sign in with a PIN; a lost one is removed here. */
function Phones({ phones, rows, onNotice }: { phones: Phone[]; rows: UserRow[]; onNotice: (s: string) => void }) {
  const [error, setError] = useState<string | null>(null);
  const nameOf = (uid: string) => rows.find((r) => r.uid === uid && !r.deleted)?.displayName;

  async function remove(phone: Phone) {
    if (!confirm(fill(t('phones.confirmRemove'), { name: phone.name }))) return;
    setError(null);
    try {
      await removePhone(phone.id);
      onNotice(t('phones.removed'));
    } catch (err) {
      setError(messageOf(err));
    }
  }

  return (
    <section class="phones">
      <h2 class="section-label spaced">{t('phones.title')}</h2>
      <p class="field-hint">{t('phones.hint')}</p>
      <ErrorText text={error} />
      {phones.length === 0 ? (
        <p class="desc">{t('phones.none')}</p>
      ) : (
        <table class="list">
          <thead>
            <tr>
              <th>{t('phones.name')}</th>
              <th>{t('phones.profiles')}</th>
              <th>{t('phones.lastUsed')}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {phones.map((p) => (
              <tr key={p.id}>
                <td>{p.name}</td>
                <td>{p.profiles.map(nameOf).filter(Boolean).join(', ')}</td>
                <td>{p.lastUsedMs ? dateTime(p.lastUsedMs) : '—'}</td>
                <td class="actions">
                  <button class="link danger" onClick={() => remove(p)}>{t('phones.remove')}</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
