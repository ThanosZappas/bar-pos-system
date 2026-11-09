import { beforeEach, describe, expect, it, vi } from 'vitest';

async function load(online: boolean) {
  vi.resetModules();
  Object.defineProperty(globalThis, 'navigator', { value: { onLine: online }, configurable: true });
  return import('./sync');
}

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: Error) => void;
  const promise = new Promise<T>((res, rej) => ((resolve = res), (reject = rej)));
  return { promise, resolve, reject };
}

describe('send', () => {
  beforeEach(() => vi.resetModules());

  it('waits for the server while online and counts the write as pending meanwhile', async () => {
    const sync = await load(true);
    const d = deferred<string>();
    const p = sync.send(d.promise);
    expect(sync.getSyncState().pending).toBe(1);
    d.resolve('ok');
    await expect(p).resolves.toBe('ok');
    expect(sync.getSyncState().pending).toBe(0);
  });

  it('does not block while offline, and keeps a later refusal for the banner', async () => {
    const sync = await load(false);
    const d = deferred<void>();
    await expect(sync.send(d.promise)).resolves.toBeUndefined();
    expect(sync.getSyncState()).toMatchObject({ online: false, pending: 1 });
    d.reject(new Error('Missing or insufficient permissions.'));
    await new Promise((r) => setTimeout(r, 0));
    expect(sync.getSyncState()).toMatchObject({ pending: 0, lastError: 'Missing or insufficient permissions.' });
    sync.clearSyncError();
    expect(sync.getSyncState().lastError).toBeNull();
  });
});
