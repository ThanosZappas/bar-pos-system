package gr.barlab.negroni

import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.google.android.gms.tasks.Tasks
import com.google.firebase.FirebaseApp
import com.google.firebase.FirebaseOptions
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.functions.FirebaseFunctions
import gr.barlab.negroni.auth.SessionRepository
import gr.barlab.negroni.data.FirebaseSetup
import java.util.concurrent.TimeUnit
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith

/**
 * The real SessionRepository.changePassword on the phone against the laptop's emulators
 * (adb reverse). Needs the seeded user3 / user3user3.
 */
@RunWith(AndroidJUnit4::class)
class ChangePasswordTest {
    @Test
    fun changesPasswordThroughTheFunction() = runBlocking {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val app = FirebaseApp.getApps(context).firstOrNull { it.name == "pw-test" } ?: FirebaseApp.initializeApp(
            context,
            FirebaseOptions.Builder().setProjectId("demo-negroni").setApplicationId("1:000000000000:android:0000000000000000").setApiKey("emulator-only").build(),
            "pw-test",
        )
        val auth = FirebaseAuth.getInstance(app).apply { useEmulator("127.0.0.1", 9099) }
        val db = FirebaseFirestore.getInstance(app).apply { useEmulator("127.0.0.1", 8080) }
        val functions = FirebaseFunctions.getInstance(app, FirebaseSetup.REGION).apply { useEmulator("127.0.0.1", 5001) }
        Tasks.await(auth.signInWithEmailAndPassword("user3@users.negronibarlab.invalid", "user3user3"), 30, TimeUnit.SECONDS)

        val result = SessionRepository(auth, db, functions).changePassword("user3", "user3user3", "phone-test-74", "phone-test-74")
        val error = result.exceptionOrNull()
        assertTrue("changePassword failed: ${error?.javaClass?.name}: ${error?.message} / cause ${error?.cause}", result.isSuccess)
    }
}
