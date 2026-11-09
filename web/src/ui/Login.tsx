import { useState } from 'preact/hooks';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { firebase } from '../firebase';
import { t } from '../i18n';
import { usernameToEmail } from '../lib/usernames';
import { errorKey } from './errors';
import { ErrorText, Field } from './Fields';

export function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: Event) {
    e.preventDefault();
    if (!firebase || busy) return;
    setError(null);
    const email = usernameToEmail(username);
    if (!email) return setError(t('error.wrongCredentials'));
    setBusy(true);
    try {
      await signInWithEmailAndPassword(firebase.auth, email, password);
    } catch (err) {
      setError(t(errorKey(err) ?? 'error.unknown'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main class="centered">
      <div class="hero-logo">Negroni</div>
      <div class="hero-sub">{t('app.subtitle')}</div>
      <form class="card form" onSubmit={submit}>
        <Field label={t('auth.username')} value={username} onInput={setUsername} autoComplete="username" autoFocus />
        <Field label={t('auth.password')} value={password} onInput={setPassword} type="password" autoComplete="current-password" />
        <ErrorText text={error} />
        <button class="primary" disabled={busy || !username || !password}>{t('auth.signIn')}</button>
      </form>
    </main>
  );
}
