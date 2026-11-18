import { useEffect, useState } from 'preact/hooks';
import { signOut } from 'firebase/auth';
import { firebase } from '../firebase';
import { t, type Key } from '../i18n';
import type { StaffUser } from '../session';
import { Analytics } from './Analytics';
import { Board } from './Board';
import { SyncBanner } from './SyncBanner';
import { RequestPopup } from './RequestPopup';
import { Menu } from './Menu';
import { PaymentsPage } from './PaymentsPage';
import { SettingsPage } from './SettingsPage';
import { Tables } from './Tables';
import { TablesOverview } from './TablesOverview';
import { Users } from './Users';

type Route = 'board' | 'tables' | 'tables-admin' | 'payments' | 'analytics' | 'menu' | 'users' | 'settings';
const ROUTES: { route: Route; label: Key }[] = [
  { route: 'board', label: 'nav.board' },
  { route: 'tables', label: 'nav.tables' },
  { route: 'payments', label: 'nav.payments' },
  { route: 'analytics', label: 'nav.analytics' },
  { route: 'menu', label: 'nav.menu' },
  { route: 'users', label: 'nav.users' },
  { route: 'settings', label: 'nav.settings' },
];

function currentRoute(): Route {
  const r = location.hash.replace(/^#\/?/, '');
  return r === 'tables-admin' || ROUTES.some((x) => x.route === r) ? (r as Route) : 'board';
}

/** Signed-in admin layout with hash routing (works on Firebase Hosting and any custom domain). */
export function Shell({ user }: { user: StaffUser }) {
  const [route, setRoute] = useState<Route>(currentRoute());
  useEffect(() => {
    const onHash = () => setRoute(currentRoute());
    addEventListener('hashchange', onHash);
    return () => removeEventListener('hashchange', onHash);
  }, []);

  return (
    <>
      <nav class="nav">
        <a class="logo" href="#/board" title={t('nav.home')}>{t('app.name')}</a>
        <ul class="nav-links">
          {ROUTES.map((r) => (
            <li><a href={`#/${r.route}`} class={route === r.route || (r.route === 'tables' && route === 'tables-admin') ? 'active' : ''}>{t(r.label)}</a></li>
          ))}
          <li><span class="who">{user.displayName}</span></li>
          <li><button class="link" onClick={() => signOut(firebase!.auth)}>{t('auth.signOut')}</button></li>
        </ul>
      </nav>
      <SyncBanner />
      <RequestPopup user={user} />
      {route === 'users' && <Users me={user} />}
      {route === 'menu' && <Menu />}
      {route === 'tables' && <TablesOverview user={user} />}
      {route === 'tables-admin' && <Tables />}
      {route === 'board' && <Board user={user} />}
      {route === 'payments' && <PaymentsPage />}
      {route === 'analytics' && <Analytics />}
      {route === 'settings' && <SettingsPage />}
    </>
  );
}
