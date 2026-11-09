# Negroni Bar Lab

Private order-taking system for Negroni Bar Lab (Piraeus): an Android app for
servers and the barman, a web dashboard for the barman's laptop, and a Firebase
backend. Not distributed through the Play Store; the debug APK is installed from
Android Studio.

> Work in progress. This README is completed in milestone 8 (APK install steps,
> Firebase setup, operations).

## Layout

| Folder        | What                                                        |
|---------------|-------------------------------------------------------------|
| `android/`    | Kotlin + Jetpack Compose app (`gr.barlab.negroni`), minSdk 29 |
| `web/`        | Dashboard: Vite + TypeScript + Preact, Firebase JS SDK      |
| `functions/`  | Cloud Functions (TypeScript, Node 22, region `europe-west8`) |
| `firebase/`   | Firestore security rules, indexes and emulator rules tests  |
| `tools/seed/` | Menu parser and seed script (milestones 2–3)                 |
| `design/`     | `tokens.md` (colors, fonts, spacing from barlab.gr) and bundled OFL fonts |
| `scripts/`    | `env.sh`: puts Node 22 and JDK 21 on the PATH               |
| `Resources/`  | Source images supplied by the bar (not used yet)            |

## Local setup

Requirements: Android Studio (or the Android SDK), JDK 17+ for Android builds,
Node 22 and JDK 21 for Firebase tooling. On the dev laptop these live in
`~/.config/nvm` and `~/.local/jdks`; load them with:

```bash
. scripts/env.sh
npm run install:all
```

Checks run at the end of every milestone:

```bash
(cd android && ./gradlew assembleDebug testDebugUnitTest && ./gradlew --stop)
npm run test:web && npm run build:web
npm run build:functions && npm run test:functions
npm run test:rules        # starts the Firestore emulator (demo project, no login needed)
```

The Gradle settings keep memory low (1.5 GB heap, 2 workers). The Android
emulator is not used for development on this laptop; on-device checks run on
the Xiaomi Mi 10T Pro.

## Dependencies

Kept deliberately few. Every addition gets a line here.

**Android**

| Dependency | Why |
|------------|-----|
| AndroidX Core KTX | Kotlin extensions used by every modern Android app |
| Activity Compose | Hosts Compose in the single activity, edge-to-edge |
| Lifecycle Runtime Compose | Lifecycle-aware collection of data streams in the UI |
| Compose BOM, UI, Material 3 | The required UI toolkit; the BOM pins compatible versions |
| Compose UI Tooling (debug only) | Previews and layout inspection in Android Studio; debug builds only |
| JUnit 4 (tests only) | Unit tests |

Planned: Firebase BoM (Auth, Firestore, Functions), Navigation Compose,
Lifecycle ViewModel Compose, kotlinx-coroutines-play-services, AppCompat
(per-app language setting below Android 13).

**Web** — `preact` (≈4 kB UI layer, saves hand-written DOM code for admin
forms), `firebase` (official SDK). Dev only: `vite` (bundler/dev server),
`typescript`, `@preact/preset-vite`, `vitest`.

**Functions** — `firebase-functions`, `firebase-admin` (the only way to manage
Auth users and custom claims). Dev only: `typescript`, `vitest`.

**Rules tests** — `@firebase/rules-unit-testing`, `firebase`, `vitest`.
**Root** — `firebase-tools` (CLI, emulators, deploy), pinned per project.

## Fonts

Lato, Playfair Display and Dancing Script, all SIL Open Font License 1.1,
bundled unmodified. Licences: `design/fonts/OFL-*.txt`.
