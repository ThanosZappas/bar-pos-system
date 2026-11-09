import { useEffect, useState } from 'preact/hooks';

/**
 * Pending-write tracking for the dashboard. Firestore applies a write locally at once and sends
 * it when it can; `send` counts it until the server confirms. While offline it resolves at once
 * (so buttons do not stay busy) and a refusal arriving later is reported in the banner.
 */
interface SyncState {
  online: boolean;
  pending: number;
  lastError: string | null;
}

let state: SyncState = { online: typeof navigator === 'undefined' ? true : navigator.onLine, pending: 0, lastError: null };
const listeners = new Set<(s: SyncState) => void>();

function set(patch: Partial<SyncState>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l(state));
}

if (typeof window !== 'undefined') {
  addEventListener('online', () => set({ online: true }));
  addEventListener('offline', () => set({ online: false }));
}

export function send<T>(write: Promise<T>): Promise<T | void> {
  set({ pending: state.pending + 1 });
  const settled = write.then(
    (v) => {
      set({ pending: state.pending - 1 });
      return v;
    },
    (e: Error) => {
      set({ pending: state.pending - 1, lastError: e.message });
      throw e;
    },
  );
  if (state.online) return settled;
  settled.catch(() => {}); // reported through lastError
  return Promise.resolve();
}

export function getSyncState(): SyncState {
  return state;
}

export function clearSyncError() {
  set({ lastError: null });
}

export function useSyncState(): SyncState {
  const [s, setS] = useState(state);
  useEffect(() => {
    listeners.add(setS);
    setS(state);
    return () => {
      listeners.delete(setS);
    };
  }, []);
  return s;
}
