package gr.barlab.negroni.data

import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.retryWhen

/**
 * Keeps a Firestore listener alive: after an error (a "permission denied" right after sign-in or
 * while the rules change, a dropped stream) it re-attaches after [retryMs] instead of ending, so a
 * screen never goes silently stale for the rest of the evening. The last value stays on screen.
 */
fun <T> Flow<T>.keepAlive(retryMs: Long = 3_000): Flow<T> = retryWhen { _, _ ->
    delay(retryMs)
    true
}
