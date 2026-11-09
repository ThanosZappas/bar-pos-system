import { useEffect, useState } from 'preact/hooks';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { firebase } from './firebase';

export type Role = 'admin' | 'barman' | 'server';

export interface StaffUser {
  uid: string;
  username: string;
  displayName: string;
  role: Role;
  mustChangePassword: boolean;
}

export type Session =
  | { kind: 'loading' }
  | { kind: 'signedOut' }
  | { kind: 'deactivated' }
  | { kind: 'noProfile' }
  | { kind: 'active'; user: StaffUser };

const ROLES: readonly string[] = ['admin', 'barman', 'server'];

/** Auth state plus the live users/{uid} profile, which holds role, active and mustChangePassword. */
export function useSession(): Session {
  const [authUser, setAuthUser] = useState<User | null | undefined>(undefined);
  const [session, setSession] = useState<Session>({ kind: 'loading' });

  useEffect(() => (firebase ? onAuthStateChanged(firebase.auth, setAuthUser) : undefined), []);

  useEffect(() => {
    if (!firebase || authUser === undefined) return;
    if (authUser === null) {
      setSession({ kind: 'signedOut' });
      return;
    }
    setSession({ kind: 'loading' });
    return onSnapshot(
      doc(firebase.db, 'users', authUser.uid),
      (snap) => {
        const d = snap.data();
        if (!d || !ROLES.includes(d.role)) return setSession({ kind: 'noProfile' });
        if (d.active !== true) return setSession({ kind: 'deactivated' });
        setSession({
          kind: 'active',
          user: {
            uid: authUser.uid,
            username: d.username ?? '',
            displayName: d.displayName ?? '',
            role: d.role,
            mustChangePassword: d.mustChangePassword !== false,
          },
        });
      },
      () => setSession({ kind: 'noProfile' }),
    );
  }, [authUser]);

  return session;
}
