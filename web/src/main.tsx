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

function App() {
  const session = useSession();
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
