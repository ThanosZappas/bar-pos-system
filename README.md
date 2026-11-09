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
npm run build:functions
npm run test:backend      # functions + rules + seed tests in the Auth/Firestore emulators (demo project, no login)
```

## Accounts and login

- Staff log in with a **username**; Firebase Auth sees `<username>@users.negronibarlab.invalid`
  (reserved `.invalid` domain, so no mail can ever be sent). Passwords live only in Firebase Auth (hashed).
- Roles: `admin` (the barman/owner: everything), `barman` (order board in the Android app),
  `server`. The dashboard is admin-only.
- Role, active state and `mustChangePassword` live in `users/{uid}`. Security rules read that
  document on every request, so deactivation and role changes apply at once. Only Cloud
  Functions write it: `createUser`, `updateUser`, `resetPassword`, `changeOwnPassword`.
  Every change is written to `auditLog`.
- Anyone with `mustChangePassword` (the seeded admin, and anyone after a reset) can do nothing
  except change their password.

## Seeding

Seed credentials live in `tools/seed/seed-credentials.json`, which is git-ignored. Create it
with the initial accounts (admin + user1..user5, password = username twice):

```bash
npm --prefix tools/seed run init-credentials
```

Seed the emulators, or the real project once `gcloud auth application-default login` is done:

```bash
npm --prefix tools/seed run seed:emulator
```

```bash
npm --prefix tools/seed run seed -- --project <projectId>
```

The seed is idempotent: existing accounts keep their passwords and flags.

## Firebase configuration files (never committed)

- `android/app/google-services.json`: from the Firebase console (Android app `gr.barlab.negroni`).
  Without it the app builds but shows "Firebase is not configured".
- `web/.env.local`: copy `web/.env.example` and fill in the web app's config.

## Local development with the emulators

```bash
npm run emulators         # Auth, Firestore, Functions, UI on http://localhost:4000
```

Then run the dashboard against them with `VITE_USE_EMULATORS=true npm --prefix web run dev`.
Debug Android builds use the emulators when `firebase.emulatorHost=<laptop LAN IP>` is set in
`android/local.properties`; the emulators must then listen on the LAN (decided per session,
not enabled by default).

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
| Lifecycle ViewModel Compose | Screen state that survives rotation; `viewModel {}` factories without a DI library |
| Firebase BoM: Auth, Firestore, Functions | Login, data with offline cache, and the user-management callables |
| kotlinx-coroutines-play-services | `await()` on Firebase tasks instead of callbacks |
| Google Services Gradle plugin | Reads `google-services.json`; applied only when that file exists |
| JUnit 4 (tests only) | Unit tests |

Planned: Navigation Compose (milestone 4), AppCompat (per-app language
setting below Android 13, milestone 8).

**Web** — `preact` (≈4 kB UI layer, saves hand-written DOM code for admin
forms), `firebase` (official SDK). Dev only: `vite` (bundler/dev server),
`typescript`, `@preact/preset-vite`, `vitest`.

**Functions** — `firebase-functions`, `firebase-admin` (the only way to manage
Auth users and custom claims). Dev only: `typescript`, `vitest`.

**Rules tests** — `@firebase/rules-unit-testing`, `firebase`, `vitest`.
**Seed** — `firebase-admin` (creates Auth users and profile docs); dev only `vitest`.
Runs with Node 22's built-in TypeScript support, so no build step.
**Root** — `firebase-tools` (CLI, emulators, deploy), pinned per project.

## Fonts

Lato, Playfair Display and Dancing Script, all SIL Open Font License 1.1,
bundled unmodified. Licences: `design/fonts/OFL-*.txt`.
