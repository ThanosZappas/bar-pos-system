# Negroni Bar Lab

Private order-taking system for Negroni Bar Lab (Κολοκοτρώνη 74–76, Piraeus):

- an **Android app** for servers and the barman: tables, menu, orders, payments, order board;
- a **web dashboard** for the barman's laptop: live order board with sound, tables,
  payments, and all admin work (users, menu, tables, settings);
- a **Firebase backend**: Auth, Firestore (region `europe-west8`, Milan) with role-based
  security rules, and a few Cloud Functions.

Not distributed through the Play Store: the debug APK is installed from this laptop.
The look (colours, fonts, spacing) comes from https://www.barlab.gr/menu.html, see
[design/tokens.md](design/tokens.md).

**Contents:** [Try it without a Firebase project](#try-it-without-a-firebase-project) ·
[First-time setup](#first-time-setup) ·
[Install the app on a phone](#install-the-app-on-a-phone) · [Daily use](#daily-use) ·
[Admin tasks](#admin-tasks) · [How it works](#how-it-works) ·
[Development](#development) · [Dependencies](#dependencies) ·
[Known limits](#known-limits) · [Troubleshooting](#troubleshooting)

---

## Try it without a Firebase project

Everything can be tried on the phone before the real project exists, against Firebase
emulators running on this laptop. Connect the phone by USB (USB debugging on, see
[Install the app on a phone](#install-the-app-on-a-phone) steps 1–3), then:

```bash
scripts/try-on-phone.sh
```

It checks what it needs first, starts the emulators with the seeded accounts, the menu and a
few demo orders, installs a debug build that talks to them, opens the app, and serves the
dashboard at http://localhost:5173. The phone reaches the laptop through the USB cable
(`adb reverse`); nothing is opened on the Wi-Fi. Sign in on the phone as `user1` /
`user1user1` (server) or `admin` / `adminadmin` (asks for a new password, then shows the order
board). To test offline: airplane mode on and cable out, take orders and payments, then plug
back in and turn airplane mode off. Ctrl+C stops everything; emulator data is discarded.

That build stays in emulator mode until you install a normal one with
`(cd android && ./gradlew installDebug)`.

**Before any task**, `scripts/preflight.sh` tells you what is missing and how to fix it:
`phone` (USB connection, SDK), `emulators` (ports free), `deploy` (config files, logins).

```bash
scripts/preflight.sh phone emulators deploy
```

---

## First-time setup

### 1. Tools on the laptop

Android Studio (or the Android SDK) with JDK 17+, Node 22 and JDK 21 (for the Firebase
emulators). On the dev laptop Node lives in `~/.config/nvm` and JDK 21 in `~/.local/jdks`;
every terminal session first runs:

```bash
. scripts/env.sh
```

```bash
npm run install:all
```

### 2. Firebase project (Firebase console, once)

1. Go to https://console.firebase.google.com, create a project named **Negroni Bar Lab**.
   Turn Google Analytics and Gemini off. Note the **Project ID** under the name.
2. Bottom left → **Upgrade** → **Blaze** (Cloud Functions need it) → link or create a
   billing account.
3. Budget alert: https://console.cloud.google.com/billing → **Budgets & alerts** →
   **Create budget**: this project, €5, alerts at 50/90/100 %. (An alert does not stop
   spending; at this size the expected cost is about €0.)
4. **Build → Firestore Database → Create database**: Standard edition, ID `(default)`,
   location **europe-west8 (Milan)**, **production mode**. The location cannot change later.
5. **Build → Authentication → Get started → Sign-in method → Email/Password**: enable the
   first switch only (not "Email link"), save.
6. **Authentication → Settings → User actions**: untick **Enable create (sign-up)** and
   **Enable deletion**, save. Only our Cloud Functions create accounts.
7. ⚙ **Project settings → Your apps → Android**: package `gr.barlab.negroni`, no SHA-1 →
   **Register** → download `google-services.json` into `android/app/`. Skip the remaining
   SDK steps (already done).
8. Same page → **Add app → Web (`</>`)**, nickname "Dashboard", Hosting unticked →
   **Register**. Copy `web/.env.example` to `web/.env.local` and fill in `apiKey`,
   `authDomain`, `projectId`, `appId`.

Both files are git-ignored and never committed.

### 3. Command-line logins (once per laptop)

Install the gcloud CLI (https://cloud.google.com/sdk/docs/install#linux), then:

```bash
gcloud auth application-default login
```

```bash
gcloud auth application-default set-quota-project <projectId>
```

```bash
npx firebase login && npx firebase use --add
```

Pick the project and give it the alias `default` (this writes `.firebaserc`, which may be
committed).

### 4. Deploy and seed

```bash
scripts/preflight.sh deploy
```

```bash
npm run deploy:backend
```

Deploys the security rules, indexes and Cloud Functions. The first deploy enables a few
Google Cloud APIs and may ask how long to keep build images: accept the default.

```bash
npm --prefix tools/seed run init-credentials
```

```bash
npm --prefix tools/seed run seed -- --project <projectId>
```

Creates `admin` and `user1`..`user5` (display names "Admin", "Server 1".."Server 5"; initial
password = username twice, e.g. `user1user1`), the menu imported from barlab.gr, tables
"1".."20" and the summary header. The seed never overwrites anything that already exists.
The credentials file is git-ignored; keep it off shared drives.

```bash
npm run deploy:hosting
```

Builds the dashboard with `web/.env.local` and publishes it at `https://<projectId>.web.app`.

### 5. First sign-in

1. Open the dashboard, sign in as `admin` / `adminadmin`, choose a new password (required).
2. **Users**: the seeded servers can sign in with their initial passwords, which are easy to
   guess. Use **Reset password** for each to give them a temporary one; they choose their own
   at first sign-in.
3. Check the menu against [tools/seed/menu/menu-report.md](tools/seed/menu/menu-report.md)
   (price ranges stored at the lower price, brand lists, duplicate "Gin" names).

---

## Install the app on a phone

Tested target: Xiaomi Mi 10T Pro (MIUI / HyperOS). Other Android 10+ phones work the same way.

**On the phone (once):**

1. Settings → About phone → tap **MIUI version** (HyperOS: **OS version**) 7 times until
   "You are now a developer".
2. Settings → Additional settings → **Developer options**: turn on **USB debugging** and
   **Install via USB** (MIUI asks you to be signed in to a Mi account for the second one).
   For the on-phone tests (`verify-offline-on-phone.sh`) also turn on **USB debugging
   (Security settings)**; without it MIUI refuses to install test packages.
3. Connect the phone by USB, choose "File transfer" if asked, and accept the "Allow USB
   debugging?" prompt (tick "Always allow from this computer").

**On the laptop:**

4. `google-services.json` must be in `android/app/` (step 2.7 above).
5. Android Studio → **Open** the `android/` folder, wait for Gradle sync, pick the phone in
   the device list, press **Run ▶**. Or from a terminal:

   ```bash
   (cd android && ./gradlew installDebug && ./gradlew --stop)
   ```

6. MIUI shows an "Install via USB" confirmation on the phone: tap **Install** (it times out
   after a few seconds).

**On the phone again (important for offline orders):**

7. Settings → Apps → Manage apps → **Negroni Bar Lab** → **Battery saver → No restrictions**,
   and turn **Autostart** on. MIUI otherwise stops the app in the background, and orders taken
   offline are only sent while the app runs.

**Updates:** run step 5 again; data and sign-in are kept. Install every phone from **this
laptop**: debug builds are signed with `~/.android/debug.keystore`, and a build from another
computer cannot update the app without uninstalling it, which deletes orders still waiting to
sync. Back up that keystore file. Before ever uninstalling, check the app shows no
"Offline"/"Syncing" banner.

An APK file can also be copied to a phone instead (allow "Install unknown apps" for the file
manager): `android/app/build/outputs/apk/debug/app-debug.apk`, built by
`./gradlew assembleDebug`.

---

## Daily use

**Shifts change at 18:00.** A login on a phone or the dashboard lasts until the next 18:00; then
it asks for the password again (the username is remembered). If orders or payments are still
waiting to sync at 18:00, the phone first sends them, then signs out.

**Permission to work.** After the day's login a server sees one button, **Request permission**.
The barman (Android board) and the admin (dashboard, on any page) get a popup with a sound:
**Allow** / **Not now**. Permission lasts until 18:00. The barman can also allow servers before
they ask, or take permission back: Android → **Staff**, dashboard → **Users** ("This shift").
Barman and admin never need permission. Servers with the right "Works without asking" don't
either. A server can't re-send a request that is still waiting, and after one "Not now" can ask
only once more: a second "Not now" in a row blocks them until 18:00 (the popup warns before
it). Barman or admin lift a block with **Unblock** (Android → Staff, dashboard → Users).

**Servers (Android):** sign in → **Tables** → tap a table → **New order** → tap items (set
quantity and an optional note) → **Review** (order note) → **Send to bar**. While a round is
Preparing it can be edited, items cancelled, or marked served (tapped "Served" by mistake?
**Undo** appears for 30 seconds). **Record payment** (cash or card, several per table),
**Summary** shows the "Not a fiscal receipt" bill, **Move to another table** takes the open bill
to a free table when guests move, and **Close table** appears once everything is served and paid.

**Barman:** the dashboard opens on the **Order board**: oldest first, waiting time, gold =
new, red = edited/cancelled with the exact change. Click **Enable sound** once per page load.
**Got it** clears a highlight, **Served** removes the round (with **Undo** for a minute),
**Cancel** is for a drink that cannot be made. The screen stays on while the board is open. An
order sent offline that arrives after its table's bill was closed is marked "Late" with a button
to add it to that table's current bill. The Android app shows the same board as its first tab
for barman and admin accounts, with a beep and vibration for new or changed orders (switch on
the board).

**Offline:** the app keeps working without Wi-Fi. A rust banner says "Offline · N changes
waiting to sync"; each unsynced order/payment says "Waiting to sync". Everything is sent
when the connection returns.

## Admin tasks

In the dashboard, and for the admin also in the Android app (**Users** in the top bar,
**Payments** tab). User changes go through Cloud Functions, so they need a connection.

- **Users**: create (username, display name, role, temporary password), rename, change role,
  deactivate/activate, reset password, **delete** (removes the login so the username can be
  reused; the name stays on past orders and payments; you cannot delete yourself or the last
  admin). Roles: `admin` (everything, the barman/owner),
  `barman` (order board and staff permissions in the Android app, no admin work), `server`.
  **Rights** per server: can sign in (on by default; off means the server cannot use the app at
  all, a quick switch unlike deactivating the account), works without asking (off by default),
  take payments, reverse payments, close tables, cancel orders, move tables (on by default). The phone hides
  what a server may not do, and the security rules refuse it anyway.
- **Menu**: sections (tabs) → categories → items. Add, edit, hide (not orderable), reorder,
  delete (archived: gone everywhere, kept for reports), change prices ("8,50" or "8.50").
  Changes appear live on every phone.
- **Tables → Manage tables**: add, rename, reorder, remove (refused while the table has an
  open order).
- **Payments**: tonight's payments (since 06:00, so 01:00 still counts as tonight) with cash and
  card totals, and tonight's closed bills (open one to see its lines and payments).
- **Analytics**: per day, week, month or year (a business day runs 06:00–06:00): income with
  cash/card split, tables closed, average bill, items sold, median time to serve, income over
  time, most popular items, sales by category, busiest hours, staff, cancellations and changes.
  A running period is compared with the same point of the previous one. Figures are read on
  demand (not live); a year reads every order of that year, which is fine at this size.
  Try it with `npm --prefix tools/seed run demo:history` on the emulators.
- **Settings**: dashboard language, and the header of the non-fiscal summary (bar name,
  address, phone, footer).

**Language:** English is the default; Greek is complete. Android: Settings → Language
(English / Ελληνικά), kept across restarts (on Android 13+ also under the system's app language
setting). Dashboard: Settings → Language, stored in that browser. Menu items, categories and
sections are data and stay as written in the menu. Translations live in
`android/app/src/main/res/values-el/strings.xml` and `web/src/i18n/el.json`; a test fails if a
dashboard key is missing in Greek.

**Board alerts (Android):** barman and admin turn sound and vibration for new or changed orders
on or off in Settings → Order board.

---

## How it works

### Accounts

- Staff log in with a **username**; Firebase Auth sees `<username>@users.negronibarlab.invalid`
  (reserved `.invalid` domain, so no mail can ever be sent). Passwords live only in Firebase
  Auth (hashed); the seed reads initial ones from the git-ignored credentials file.
- Role, active state and `mustChangePassword` live in `users/{uid}`. Security rules read that
  document on every request, so deactivation and role changes apply at once. Only Cloud
  Functions write it: `createUser`, `updateUser`, `resetPassword`, `changeOwnPassword`. Every
  change goes to `auditLog`.
- Anyone with `mustChangePassword` (the seeded admin, anyone after a reset) can do nothing
  but change their password, and not back to the initial username-twice password.

### Menu and tables

- `tools/seed/menu/source-menu.html` is a saved copy of the barlab.gr menu page.
  `npm --prefix tools/seed run menu:import` turns it into `menu.json` (seeded) and
  `menu-report.md` (what needs a human look). Add `-- --fetch` to refresh the copy first.
- Money is always integer cents. "8 – 12€" ranges store the lower price and keep the text in
  the description.
- Removing a table goes through the `removeTable` function, which refuses while the table's
  current session (its open bill) has any round or payment.

### Shifts, permission and rights

- `ShiftClock` (Android) / `domain/shift.ts` (dashboard): the shift key is the date whose 18:00
  started the current shift. A login stores it on the device (before signing in, so the check
  never races the sign-in); a different key means the login has expired.
- `shifts/{uid}`: the server writes only `status: requested` (merged, so it can never touch the
  denial count or a block), not while a request is waiting and not before `blockedUntil`.
  Barman/admin write `approved` (with `approvedUntil` = next 18:00, at most 25 h ahead),
  `denied` (with `denials` and the server-stamped `lastDeniedAt`; the second denial in the same
  shift sets `blockedUntil` = next 18:00), `revoked`, or `cleared` (unblocked). Nobody deletes.
- The "can sign in" right is part of the rules' `isStaff()`: a server with it off can read
  nothing but their own profile, which is how the apps explain the refusal.
- The rules' `canWork()` (orders, payments, closing, every round change) needs barman/admin, the
  `noApproval` right, or an approval that runs out less than 2 hours ago: the grace lets orders
  taken offline just before 18:00 still sync. `may(right)` checks the rights; a missing right
  means its default. `moveTable` checks the same in the function.
- Live listeners on both apps re-attach themselves after an error (e.g. a "permission denied"
  right after sign-in), so the request popup and the board never go silently stale.

### Orders (rounds)

- Each submission is a **round** (`rounds/{id}`): Preparing → Served (or Cancelled). Names and
  prices are copied in, so menu edits never change past orders.
- Each table has a `currentSessionId`; its rounds and payments belong to that session until the
  table is closed. Table status (Free, Preparing, Served, Partially paid, Paid) is never stored;
  it is derived from the current session (Preparing wins while anything is still being made).
- Every change is one batch: the round plus an event in `rounds/{id}/events`. The rules refuse a
  change without its event and any change once Served or Cancelled. Edits and cancellations set
  `editSeen: false`, which the board highlights until the barman clicks **Got it**.

### Payments and closing

- Payments are create-only. A mistake is corrected by one full **reversal** with a reason
  (id `reversal-<original>`, so a payment can be reversed once). The apps refuse paying more
  than is due (no tips).
- **Close table** (anyone, only when Paid) writes `sessions/{sessionId}` with the totals and
  gives the table a new session id in the same batch; the rules check both halves.
- **Moving guests:** the `moveTable` function gives the target table the source's session id
  (and the source a fresh one), so the open bill moves without touching its rounds or payments.
  It refuses unless the target is free. The board shows a round at the table that holds its
  session now.
- **Late orders:** a round whose session no table holds any more (its bill was closed, or its
  table removed) is accepted and flagged "Late" on the board. One tap adds it to its table's
  current bill (logged as a `moved` event; the rules check that its old bill is really closed).
- **Undo "Served":** allowed for 2 minutes after serving (server clock), logged as `unserved`.
  The apps offer it for 30 s (phone) and 60 s (dashboard).

### Offline sync

Firestore keeps an on-disk cache on the phones and in the dashboard's browser. Order and
payment ids are generated on the device and writes never wait for the server, so they work
offline, survive the app being killed and are sent on reconnect; a retry targets the same
document, so it cannot create a copy. If the server refuses a queued change (for example an
edit to a round served meanwhile), the app says so.

Verified by:
1. `firebase/test/offline.sync.test.ts` (part of `npm run test:rules`), against the emulator
   with the real rules: offline writes arrive exactly once; a double-sent round and a retried
   payment are stored once; an offline edit to a served round is refused; a late round keeps
   its session; two offline closes cannot both win; a user deactivated meanwhile cannot sync.
2. On the phone, with the real app code, including killing Firestore while writes are queued:
   connect the phone by USB, then run the command below. It uses the emulators on this
   laptop via `adb reverse` over the cable (nothing is opened on the Wi-Fi).

   ```bash
   scripts/verify-offline-on-phone.sh
   ```

### POS (design only)

`PosGateway` (`sendOrder`, `sendReceipt`) exists in the Android app (`pos/PosGateway.kt`) and
the dashboard (`domain/pos.ts`) with a no-op implementation; `JsonExportPosGateway` (Android)
writes one JSON file per order/receipt (integer cents, ISO times, `"fiscal": false`). No POS
or fiscal device is connected. Every action carries a timestamp and user id and payments are
immutable, so reports can be built later from Firestore.

### Hosting and a custom subdomain

The dashboard is a static SPA on Firebase Hosting with hash routes (`#/board`, `#/tables`, …),
so it works on any domain. To attach e.g. `bar.example.gr` later: Firebase console → Hosting →
Add custom domain → create the DNS records it shows → add the domain under Authentication →
Settings → Authorized domains.

### Launcher icon

Adaptive icon: "Negroni" in Playfair Display Bold (gold `#c9a84c`) over "BAR LAB" in Lato Bold
(cream `#e8dfc8`) on `#111008`, drawn from the font outlines so it stays sharp, kept inside the
circular safe zone, with a monochrome layer for Android 13 themed icons. The dashboard favicon
is the same design. Regenerate with `npm --prefix tools/icon run generate`. A second icon from
the bar's Instagram picture (`Resources/`) is planned and not included.

---

## Development

| Folder        | What |
|---------------|------|
| `android/`    | Kotlin + Jetpack Compose app (`gr.barlab.negroni`), minSdk 29, targetSdk 36 |
| `web/`        | Dashboard: Vite + TypeScript + Preact, Firebase JS SDK |
| `functions/`  | Cloud Functions (TypeScript, Node 22, `europe-west8`) |
| `firebase/`   | Firestore rules, indexes, rules and offline tests |
| `tools/seed/` | Menu import, seed script, emulator-only demo orders |
| `tools/icon/` | Launcher icon / favicon generator |
| `design/`     | `tokens.md`, bundled OFL fonts, icon SVG |
| `scripts/`    | `env.sh` (Node 22 + JDK 21), `preflight.sh`, `try-on-phone.sh`, `verify-offline-on-phone.sh` |
| `Resources/`  | Images supplied by the bar (not used yet) |

Checks run at the end of every milestone:

```bash
(cd android && ./gradlew assembleDebug testDebugUnitTest lintDebug && ./gradlew --stop)
```

```bash
npm run test:web && npm run build:web && npm run build:functions
```

```bash
npm run test:backend
```

`test:backend` runs the functions, rules, offline and seed tests in the Auth/Firestore
emulators under the `demo-negroni` project (no login, nothing touches the real project).

**Emulators:** `npm run emulators` (UI on http://localhost:4000), then
`npm --prefix tools/seed run seed:emulator`, `npm --prefix tools/seed run demo:rounds`
(emulator only) and `VITE_USE_EMULATORS=true npm --prefix web run dev`. A debug Android build
uses the emulators when built with `-Pfirebase.emulatorHost=<host>` (or with that line in
`android/local.properties`); `scripts/try-on-phone.sh` does all of this for you.

The Gradle settings keep memory low (1.5 GB heap, 2 workers). The Android emulator is not used
on this laptop; on-device checks run on the phone.

## Dependencies

Kept deliberately few; every addition gets a line here.

**Android**

| Dependency | Why |
|------------|-----|
| AndroidX Core KTX | Kotlin extensions used by every modern Android app |
| Activity Compose | Hosts Compose in the single activity, edge-to-edge |
| AppCompat | Per-app language below Android 13 (`AppCompatDelegate.setApplicationLocales`) |
| Lifecycle Runtime / ViewModel Compose | Lifecycle-aware state; `viewModel {}` factories without a DI library |
| Compose BOM, UI, Material 3 | The UI toolkit; the BOM pins compatible versions |
| Compose UI Tooling (debug only) | Previews and layout inspection in Android Studio |
| Firebase BoM: Auth, Firestore, Functions | Login, data with offline cache, user-management callables |
| kotlinx-coroutines-play-services | `await()` on Firebase tasks instead of callbacks |
| Google Services Gradle plugin | Reads `google-services.json`; applied only when that file exists |
| JUnit 4 (tests only) | Unit tests |
| AndroidX Test runner + ext-junit (instrumented tests only) | Runs `OfflineSyncTest` on the phone |

Navigation is a small back stack held as Compose state (`ui/nav/Navigator.kt`) instead of
Navigation Compose: a handful of screens and no deep links did not justify the dependency.
JSON for the POS export is written by hand (two small documents) instead of adding a library.

**Web**: `preact` (≈4 kB UI layer, saves hand-written DOM code for the admin forms),
`firebase` (official SDK). Dev only: `vite`, `typescript`, `@preact/preset-vite`, `vitest`.

**Functions**: `firebase-functions`, `firebase-admin` (the only way to manage Auth users and
claims). Dev only: `typescript`, `vitest`.

**Rules tests**: `@firebase/rules-unit-testing`, `firebase`, `vitest`.
**Seed**: `firebase-admin`; dev only `vitest`. Runs with Node 22's built-in TypeScript support.
**Icon**: `opentype.js` (dev only, reads the font outlines).
**Root**: `firebase-tools` (CLI, emulators, deploy), pinned per project.

**Fonts**: Lato, Playfair Display and Dancing Script (the site's), plus Greek-only subsets of
Commissioner and Noto Serif Display for Greek letters; all SIL Open Font License 1.1, licences in
`design/fonts/`. How they are combined: `design/tokens.md`.

## Known limits

- No reports yet, no real POS or fiscal integration (design seam only).
- Two phones paying the same table while both offline can overpay; it is shown as "Overpaid"
  and corrected with a reversal.
- A user deactivated while their phone is offline loses that phone's queued writes (by design).
- Firebase App Check is not set up; worth adding before the dashboard URL is shared widely.
- `npm audit` reports advisories in `@grpc/grpc-js` pulled in by the Firebase Node SDKs
  (server/tooling side, not in the dashboard bundle).

## Troubleshooting

- **"Firebase is not configured"** on the phone: `android/app/google-services.json` is missing;
  add it and reinstall. On the dashboard: `web/.env.local` is missing; add it and redeploy.
- **"Wrong username or password"** right after setup: the seed has not run against this project.
- **"Account not set up"**: the Auth user exists but has no `users/{uid}` profile; create users
  from the dashboard, not the Firebase console.
- **Orders stuck on "Waiting to sync"**: the phone is offline, or MIUI stopped the app; open it
  with a connection (and see step 7 of the install).
- **Install fails with "signatures do not match"**: the installed app was built on another
  computer. Sync everything first, then uninstall and install from this laptop.
- **No sound on the dashboard**: click **Enable sound** after each page load.
