import { render } from 'preact';
import './styles/tokens.css';
import './styles/base.css';
import { firebase } from './firebase';
import { getLang, t } from './i18n';
import { useSession } from './session';
import { ChangePassword } from './ui/ChangePassword';
import { Login } from './ui/Login';
import { Message } from './ui/Message';
import { Shell } from './ui/Shell';
import { useEffect } from 'preact/hooks';
import { signOut } from 'firebase/auth';
import { forgetShift, loginExpired } from './lib/deviceLogin';
import { getSyncState } from './data/sync';

/**
 * Logins last until the next 18:00. Checked every 30 s; the sign-out waits until nothing is
 * waiting to sync, so the shift change never strands a write.
 */
function useShiftChange(signedIn: boolean) {
  useEffect(() => {
    if (!signedIn || !firebase) return;
    const check = () => {
      if (loginExpired() && getSyncState().pending === 0) {
        forgetShift();
        signOut(firebase!.auth);
      }
    };
    check();
    const id = setInterval(check, 30_000);
    return () => clearInterval(id);
  }, [signedIn]);
}

function App() {
  const session = useSession();
  useShiftChange(session.kind === 'active');
  if (!firebase) return <Message title={t('auth.notConfiguredTitle')} body={t('auth.notConfiguredBody')} />;
  switch (session.kind) {
    case 'loading':
      return <Message title={t('app.loading')} />;
    case 'signedOut':
      return <Login />;
    case 'deactivated':
      return <Message title={t('auth.deactivatedTitle')} body={t('error.deactivated')} withSignOut />;
    case 'noProfile':
      return <Message title={t('auth.noProfileTitle')} body={t('auth.noProfileBody')} withSignOut />;
    case 'active':
      if (session.user.mustChangePassword) return <ChangePassword user={session.user} />;
      // Dashboard is admin-only; Firestore rules enforce the same on every read.
      if (session.user.role !== 'admin') return <Message title={t('auth.adminOnlyTitle')} body={t('auth.adminOnlyBody')} withSignOut />;
      return <Shell user={session.user} />;
  }
}

document.documentElement.lang = getLang();
render(<App />, document.getElementById('app')!);
