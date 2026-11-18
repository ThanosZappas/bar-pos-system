import java.util.Properties

plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.compose)
}

// google-services.json comes from the Firebase console (git-ignored). Without it the app
// still builds and can run against the local emulators (see firebase.emulatorHost below).
if (file("google-services.json").exists()) {
    apply(plugin = libs.plugins.google.services.get().pluginId)
}

// Optional: debug builds talk to the laptop's Firebase emulators instead of the real project.
// Per build: ./gradlew installDebug -Pfirebase.emulatorHost=127.0.0.1 (scripts/try-on-phone.sh),
// or per machine in android/local.properties (git-ignored): firebase.emulatorHost=127.0.0.1
val localProps = Properties().apply {
    rootProject.file("local.properties").takeIf { it.exists() }?.inputStream()?.use { load(it) }
}
val emulatorHost: String = providers.gradleProperty("firebase.emulatorHost").orNull
    ?: localProps.getProperty("firebase.emulatorHost", "")

// The server functions (a Cloudflare Worker, see worker/). Per build -Pnegroni.apiUrl=… or per
// machine in android/local.properties: negroni.apiUrl=https://negroni-bar-lab-api.<you>.workers.dev
// With the emulators it defaults to the Worker running on the laptop (port 8787).
val apiUrl: String = providers.gradleProperty("negroni.apiUrl").orNull
    ?: localProps.getProperty("negroni.apiUrl", "")

android {
    namespace = "gr.barlab.negroni"
    compileSdk = 37

    defaultConfig {
        applicationId = "gr.barlab.negroni"
        minSdk = 29
        targetSdk = 36
        versionCode = 1
        versionName = "1.0.0"
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
    }

    buildTypes {
        debug {
            buildConfigField("String", "FIREBASE_EMULATOR_HOST", "\"$emulatorHost\"")
            val debugApi = apiUrl.ifEmpty { if (emulatorHost.isNotEmpty()) "http://$emulatorHost:8787" else "" }
            buildConfigField("String", "API_URL", "\"$debugApi\"")
        }
        release {
            isMinifyEnabled = false
            buildConfigField("String", "FIREBASE_EMULATOR_HOST", "\"\"")
            buildConfigField("String", "API_URL", "\"$apiUrl\"")
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    buildFeatures {
        compose = true
        buildConfig = true
    }
    androidResources {
        // English is the default; Greek is scaffolded (falls back to English until translated).
        localeFilters += listOf("en", "el")
    }
    lint {
        // values-el is intentionally incomplete until the Greek translation is written.
        disable += "MissingTranslation"
    }
}

dependencies {
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.activity.compose)
    implementation(libs.androidx.appcompat)
    implementation(libs.androidx.biometric)
    implementation(libs.androidx.lifecycle.runtime.compose)
    implementation(libs.androidx.lifecycle.viewmodel.compose)
    implementation(platform(libs.androidx.compose.bom))
    implementation(libs.androidx.compose.ui)
    implementation(libs.androidx.compose.ui.tooling.preview)
    implementation(libs.androidx.compose.material3)
    debugImplementation(libs.androidx.compose.ui.tooling)

    implementation(platform(libs.firebase.bom))
    implementation(libs.firebase.auth)
    implementation(libs.firebase.firestore)
    implementation(libs.firebase.functions)
    implementation(libs.kotlinx.coroutines.play.services)

    testImplementation(libs.junit)
    androidTestImplementation(libs.androidx.test.runner)
    androidTestImplementation(libs.androidx.test.ext.junit)
}
