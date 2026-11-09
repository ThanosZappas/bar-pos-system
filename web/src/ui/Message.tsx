import { signOut } from 'firebase/auth';
import { firebase } from '../firebase';
import { t } from '../i18n';

export function Message({ title, body, withSignOut = false }: { title: string; body?: string; withSignOut?: boolean }) {
  return (
    <main class="centered">
      <div class="hero-logo">Negroni</div>
      <div class="hero-sub">{t('app.subtitle')}</div>
      <h2 class="title spaced">{title}</h2>
      {body && <p class="desc">{body}</p>}
      {withSignOut && firebase && (
        <button class="link" onClick={() => signOut(firebase!.auth)}>{t('auth.signOut')}</button>
      )}
    </main>
  );
}
