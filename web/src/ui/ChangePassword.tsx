import { useState } from 'preact/hooks';
import { EmailAuthProvider, reauthenticateWithCredential, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { callable, firebase } from '../firebase';
import { t } from '../i18n';
import { checkNewPassword } from '../lib/passwords';
import { usernameToEmail } from '../lib/usernames';
import type { StaffUser } from '../session';
import { errorKey, passwordProblemKey } from './errors';
import { ErrorText, Field } from './Fields';

export function ChangePassword({ user }: { user: StaffUser }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: Event) {
    e.preventDefault();
    const fb = firebase;
    const email = usernameToEmail(user.username);
    if (!fb || !email || !fb.auth.currentUser || busy) return;
    const problem = checkNewPassword(user.username, current, next, confirm);
    if (problem) return setError(t(passwordProblemKey[problem]));
    setError(null);
    setBusy(true);
    try {
      await reauthenticateWithCredential(fb.auth.currentUser, EmailAuthProvider.credential(email, current));
      await callable('changeOwnPassword')({ password: next });
      // A password change can revoke the session; sign in again with the new password.
      await signInWithEmailAndPassword(fb.auth, email, next);
    } catch (err) {
      setError(errorKey(err) ? t(errorKey(err)!) : (err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main class="centered">
      <form class="card form" onSubmit={submit}>
        <h2 class="title">{t('auth.changeTitle')}</h2>
        <p class="desc">{t('auth.changeExplainer')}</p>
        <Field label={t('auth.currentPassword')} value={current} onInput={setCurrent} type="password" autoComplete="current-password" autoFocus />
        <Field label={t('auth.newPassword')} value={next} onInput={setNext} type="password" autoComplete="new-password" hint={t('auth.newPasswordHint')} />
        <Field label={t('auth.confirmPassword')} value={confirm} onInput={setConfirm} type="password" autoComplete="new-password" />
        <ErrorText text={error} />
        <button class="primary" disabled={busy || !current || !next || !confirm}>{t('auth.savePassword')}</button>
        <button type="button" class="link" onClick={() => firebase && signOut(firebase.auth)}>{t('auth.signOut')}</button>
      </form>
    </main>
  );
}
