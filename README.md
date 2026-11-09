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

The seed is idempotent: existing accounts keep their passwords and flags. It also adds the
menu and tables "1".."20"; documents that already exist are never overwritten, so the
admin's edits survive a re-run.

## Menu import

`tools/seed/menu/source-menu.html` is a saved copy of https://www.barlab.gr/menu.html.
`npm --prefix tools/seed run menu:import` turns it into `menu/menu.json` (seeded) and
`menu/menu-report.md`, which lists what needs a human look: price ranges (the lower price is
stored, the range text stays in the description), brand lists sold at one price, a different
price inside a description, duplicate names, and text clean-ups. Add `-- --fetch` to download
a fresh copy of the page first.

Money is always integer cents. Menu items, categories and sections are never hard-deleted:
"Delete" in the dashboard sets `archived`, which hides them everywhere but keeps them for
reports. "Hide" makes an entry unorderable but keeps it visible to the admin.

Removing a table goes through the `removeTable` function, which refuses while the table's
current session has any round or payment.

## Orders (rounds)

- A server picks a table, adds menu items with quantity and an optional note per item plus an
  order note, and sends it: that is one **round** (`rounds/{id}`), status Preparing → Served
  (or Cancelled). A table can have many rounds. Names and prices are copied into the round, so
  later menu edits never change past orders.
- Each table has a `currentSessionId`; its rounds belong to that session until the table is
  closed (milestone 6). Table status (Free, Preparing, Served, Partially paid, Paid) is never
  stored: it is derived from the current session's rounds and payments.
- While Preparing, anyone can change quantities and notes, cancel single items, or cancel the
  round; anyone can mark it served. Every change is written in one batch with an event in
  `rounds/{id}/events`. The rules refuse a change without its event, and refuse any change once
  the round is Served or Cancelled. Edits and cancellations set `editSeen: false` so the
  barman's board can highlight them.
- **Offline:** round and event ids are generated on the phone and writes never wait for the
  server. Firestore queues them locally and sends them on reconnect; a retry hits the same
  document, so no duplicates. A round not yet confirmed shows "Waiting to sync". If the server
  refuses a queued change (for example an edit to a round that was served meanwhile), the app
  shows a message.

## Order board and dashboard

- **Order board** (dashboard home, and the first tab in the Android app for barman/admin):
  every Preparing round plus unacknowledged cancellations, oldest first, with waiting time.
  A round nobody has opened is highlighted gold ("New"); an edited or cancelled one red
  ("Edited"/"Cancelled"), with the exact change read from its event log. "Got it" clears the
  highlight (only barman/admin may), "Served" moves it off the board.
- **Sound:** browsers block audio until the page gets a click, so the board shows
  "Enable sound" once per page load. New orders play two rising notes; edits and
  cancellations three falling notes.
- **Tables:** live grid with the derived status colours and the amount due; click a table for
  its rounds and totals. "Manage tables" leads to add/rename/reorder/remove.
- Try it without phones: `npm run emulators`, then `npm --prefix tools/seed run seed:emulator`
  and `npm --prefix tools/seed run demo:rounds` (emulator only; refuses a real project).

## Payments and closing a table

- Anyone signed in records payments (amount + cash/card) against a table's current session,
  as many as needed. The apps refuse more than what is still due (no overpayment, no tips);
  two offline phones could still overpay together, which is shown as "Overpaid" so the extra
  payment can be reversed.
- Payments are immutable (`payments/{id}`, create-only). A mistake is corrected by a full
  **reversal** with a reason; its id is `reversal-<original id>`, so each payment can be
  reversed once.
- Table status: Free → Preparing → Served → Partially paid → Paid, derived from rounds and
  payments (Preparing wins while anything is still being made).
- **Close table** (anyone, only when Paid) records `sessions/{sessionId}` with totals and gives
  the table a fresh session id in one batch; the table is Free again. Closed sessions never change.
- **Summary**: a clearly labelled "Not a fiscal receipt" view (printable from the dashboard)
  with the header from Settings (bar name, address, phone, footer).
- **Late orders**: a round sent offline that reaches the server after its table was closed is
  accepted and flagged on the board ("Late: table already closed"); it is not added to the
  closed bill, so settle it separately or cancel it.
- **Dashboard → Payments** lists today's payments with cash and card totals.

## POS (design only)

`PosGateway` (`sendOrder`, `sendReceipt`) exists in the Android app (`pos/PosGateway.kt`) and the
dashboard (`domain/pos.ts`). Both use a no-op implementation today; `JsonExportPosGateway`
(Android) writes one JSON file per order/receipt with integer cents, ISO times and
`"fiscal": false`. No real POS or fiscal device is connected. Every action carries a timestamp
and user id, and payments are immutable, so reports can be built later from Firestore.

## Hosting

The dashboard is a static SPA on Firebase Hosting (`web/dist`, built by the predeploy step).
It uses hash routes (`#/board`, `#/tables`, …), so it works on any domain without server
rewrites. The Firebase web config is baked in at build time from `web/.env.local`.

```bash
npm run deploy:backend    # Firestore rules + indexes, Cloud Functions
```

```bash
npm run deploy:hosting    # builds web/ and publishes it
```

To attach a custom subdomain later (e.g. `bar.example.gr`): Firebase console → Hosting →
Add custom domain, create the DNS records it shows, then add the domain under
Authentication → Settings → Authorized domains.

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

Navigation uses a small back stack held as Compose state (`ui/nav/Navigator.kt`) instead of
Navigation Compose: a handful of screens and no deep links did not justify the dependency.

Planned: AppCompat (per-app language setting below Android 13, milestone 8).

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
