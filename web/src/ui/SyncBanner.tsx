import { t } from '../i18n';
import { fill } from '../i18n/format';
import { clearSyncError, useSyncState } from '../data/sync';

/** Visible while offline, while changes wait for the server, or when one was refused. */
export function SyncBanner() {
  const s = useSyncState();
  if (s.lastError) {
    return (
      <div class="sync-banner sync-error" role="alert">
        {fill(t('sync.refused'), { error: s.lastError })}
        <button class="link" onClick={clearSyncError}>{t('tables.close')}</button>
      </div>
    );
  }
  if (!s.online) return <div class="sync-banner sync-offline" role="status">{fill(t(s.pending ? 'sync.offlinePending' : 'sync.offline'), { count: String(s.pending) })}</div>;
  if (s.pending > 0) return <div class="sync-banner sync-pending" role="status">{fill(t('sync.syncing'), { count: String(s.pending) })}</div>;
  return null;
}
