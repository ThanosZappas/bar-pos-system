package gr.barlab.negroni.sync

import android.content.Context
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import com.google.android.gms.tasks.Task
import com.google.firebase.firestore.FirebaseFirestore
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.update

/** What the offline banner shows. */
sealed interface SyncStatus {
    data object Synced : SyncStatus
    data class Syncing(val pending: Int) : SyncStatus
    data class Offline(val pending: Int) : SyncStatus

    companion object {
        fun of(online: Boolean, pending: Int): SyncStatus = when {
            !online -> Offline(pending)
            pending > 0 -> Syncing(pending)
            else -> Synced
        }
    }
}

/**
 * Network state from ConnectivityManager plus a count of writes the server has not confirmed.
 * Every repository write goes through [track]; at start-up, writes left in Firestore's on-disk
 * queue by a previous run (app killed while offline) are counted until they are confirmed.
 */
class SyncMonitor(context: Context, firestore: FirebaseFirestore) {
    private val online = MutableStateFlow(false)
    private val pending = MutableStateFlow(0)

    val status: Flow<SyncStatus> = combine(online, pending) { o, p -> SyncStatus.of(o, p) }

    init {
        val cm = context.getSystemService(ConnectivityManager::class.java)
        online.value = cm.getNetworkCapabilities(cm.activeNetwork)?.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED) == true
        cm.registerDefaultNetworkCallback(object : ConnectivityManager.NetworkCallback() {
            override fun onCapabilitiesChanged(network: Network, caps: NetworkCapabilities) {
                online.value = caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED)
            }
            override fun onLost(network: Network) {
                online.value = false
            }
        })
        track(firestore.waitForPendingWrites())
    }

    /** Counts [task] as pending until the server confirms (or refuses) it. */
    fun track(task: Task<*>) {
        pending.update { it + 1 }
        task.addOnCompleteListener { pending.update { n -> (n - 1).coerceAtLeast(0) } }
    }
}
