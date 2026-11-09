package gr.barlab.negroni.sync

import org.junit.Assert.assertEquals
import org.junit.Test

class SyncStatusTest {
    @Test fun offlineWinsAndKeepsTheCount() = assertEquals(SyncStatus.Offline(3), SyncStatus.of(online = false, pending = 3))
    @Test fun offlineWithNothingPending() = assertEquals(SyncStatus.Offline(0), SyncStatus.of(online = false, pending = 0))
    @Test fun onlineWithPendingIsSyncing() = assertEquals(SyncStatus.Syncing(2), SyncStatus.of(online = true, pending = 2))
    @Test fun onlineAndConfirmedIsSynced() = assertEquals(SyncStatus.Synced, SyncStatus.of(online = true, pending = 0))
}
