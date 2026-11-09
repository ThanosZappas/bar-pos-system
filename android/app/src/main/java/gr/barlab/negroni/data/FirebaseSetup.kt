package gr.barlab.negroni.data

import android.content.Context
import com.google.firebase.FirebaseApp
import com.google.firebase.FirebaseOptions
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.firestoreSettings
import com.google.firebase.firestore.persistentCacheSettings
import com.google.firebase.functions.FirebaseFunctions
import gr.barlab.negroni.BuildConfig

class FirebaseServices(val auth: FirebaseAuth, val firestore: FirebaseFirestore, val functions: FirebaseFunctions)

object FirebaseSetup {
    const val REGION = "europe-west8"

    // The emulators run with --project demo-negroni; "demo-" projects need no real credentials.
    private const val EMULATOR_PROJECT = "demo-negroni"

    /**
     * Debug builds with `firebase.emulatorHost` in local.properties talk to the laptop's emulators.
     * Otherwise the app uses the real project from google-services.json. Returns null when neither
     * is available, so the UI can explain what is missing instead of crashing.
     */
    fun init(context: Context): FirebaseServices? {
        val host = BuildConfig.FIREBASE_EMULATOR_HOST
        if (host.isNotEmpty()) {
            val options = FirebaseOptions.Builder()
                .setProjectId(EMULATOR_PROJECT)
                .setApplicationId("1:000000000000:android:0000000000000000") // placeholder, emulator only
                .setApiKey("emulator-only")
                .build()
            val app = FirebaseApp.getApps(context).firstOrNull { it.name == "emulator" }
                ?: FirebaseApp.initializeApp(context, options, "emulator")
            return services(app).also {
                it.auth.useEmulator(host, 9099)
                it.firestore.useEmulator(host, 8080)
                it.functions.useEmulator(host, 5001)
            }
        }
        val app = FirebaseApp.getApps(context).firstOrNull() ?: FirebaseApp.initializeApp(context) ?: return null
        return services(app)
    }

    private fun services(app: FirebaseApp) = FirebaseServices(
        auth = FirebaseAuth.getInstance(app),
        firestore = FirebaseFirestore.getInstance(app).apply { firestoreSettings = OFFLINE_SETTINGS },
        functions = FirebaseFunctions.getInstance(app, REGION),
    )

    /**
     * On-disk cache: data stays readable offline, and queued writes survive the app being killed
     * (they are sent when the app next runs with a connection). This is Android's default; it is
     * set explicitly because offline ordering depends on it.
     */
    val OFFLINE_SETTINGS = firestoreSettings { setLocalCacheSettings(persistentCacheSettings { }) }
}
