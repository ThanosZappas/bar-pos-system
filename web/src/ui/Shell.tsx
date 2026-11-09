import { useEffect, useState } from 'preact/hooks';
import { signOut } from 'firebase/auth';
import { firebase } from '../firebase';
import { t, type Key } from '../i18n';
import type { StaffUser } from '../session';
import { Menu } from './Menu';
import { Tables } from './Tables';
import { Users } from './Users';

type Route = 'board' | 'tables' | 'menu' | 'users';
const ROUTES: { route: Route; label: Key }[] = [
  { route: 'board', label: 'nav.board' },
  { route: 'tables', label: 'nav.tables' },
  { route: 'menu', label: 'nav.menu' },
  { route: 'users', label: 'nav.users' },
];

function currentRoute(): Route {
  const r = location.hash.replace(/^#\/?/, '');
  return ROUTES.some((x) => x.route === r) ? (r as Route) : 'board';
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
        <span class="logo">{t('app.name')}</span>
        <ul class="nav-links">
          {ROUTES.map((r) => (
            <li><a href={`#/${r.route}`} class={route === r.route ? 'active' : ''}>{t(r.label)}</a></li>
          ))}
          <li><span class="who">{user.displayName}</span></li>
          <li><button class="link" onClick={() => signOut(firebase!.auth)}>{t('auth.signOut')}</button></li>
        </ul>
      </nav>
      {route === 'users' && <Users me={user} />}
      {route === 'menu' && <Menu />}
      {route === 'tables' && <Tables />}
      {route === 'board' && <section class="page"><p class="desc">{t('board.placeholder')}</p></section>}
    </>
  );
}
