package gr.barlab.negroni.data

import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.take
import kotlinx.coroutines.flow.toList
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Test

class FlowsTest {
    @Test fun aFailingListenerIsAttachedAgain() = runBlocking {
        var attempts = 0
        val listener = flow {
            attempts++
            if (attempts == 1) throw IllegalStateException("PERMISSION_DENIED right after sign-in")
            emit("data")
        }
        assertEquals(listOf("data"), listener.keepAlive(retryMs = 1).take(1).toList())
        assertEquals(2, attempts)
    }
}
