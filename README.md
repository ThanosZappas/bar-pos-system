# Negroni Bar Lab

Private order-taking system for Negroni Bar Lab (Κολοκοτρώνη 74–76, Piraeus):

- an **Android app** for servers and the barman: tables, menu, orders, payments, order board;
- a **web dashboard** for the barman's laptop: live order board with sound, tables,
  payments, and all admin work (users, menu, tables, settings);
- a **Firebase backend** on the free Spark plan: Auth and Firestore (region `europe-west8`,
  Milan) with role-based security rules;
- a **Cloudflare Worker** (free plan) with the server functions: user management, PIN
  sign-in, phones, pictures, moving tables. The dashboard is hosted on Cloudflare Pages.

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

Everything runs on free plans with **no card**: Firebase **Spark** (sign-in and the database)
and Cloudflare (the server functions as a **Worker**, the dashboard on **Pages**). Expected
cost: €0. How it fits together: [Hosting](#hosting-firebase--cloudflare).

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

### 2. Firebase project (Firebase console, once, free)

1. Go to https://console.firebase.google.com, create a project named **Negroni Bar Lab**.
   Turn Google Analytics and Gemini off. Note the **Project ID** under the name. Stay on the
   free **Spark** plan: never click **Upgrade**.
2. **Build → Firestore Database → Create database**: Standard edition, ID `(default)`,
   location **europe-west8 (Milan)**, **production mode**. The location cannot change later.
3. **Build → Authentication → Get started → Sign-in method → Email/Password**: enable the
   first switch only (not "Email link"), save.
4. **Authentication → Settings → User actions**: untick **Enable create (sign-up)** and
   **Enable deletion**, save. Only the server functions create accounts.
5. ⚙ **Project settings → Your apps → Android**: package `gr.barlab.negroni`, no SHA-1 →
   **Register** → download `google-services.json` into `android/app/`. Skip the remaining
   SDK steps (already done).
6. Same page → **Add app → Web (`</>`)**, nickname "Dashboard", Hosting unticked →
   **Register**. Copy `web/.env.example` to `web/.env.local` and fill in `apiKey`,
   `authDomain`, `projectId`, `appId` (`VITE_API_URL` comes in step 4).
7. ⚙ **Project settings → Service accounts → Generate new private key → Generate key**. Save
   the downloaded file **outside the project**, as `~/negroni-service-account.json`. It is the
   master key to the database and the accounts: the Worker and the seed use it; never commit,
   e-mail or share it.

`google-services.json` and `web/.env.local` are git-ignored and never committed.

### 3. Command-line logins (once per laptop)

**Firebase** (for the security rules):

```bash
npx firebase login && npx firebase use --add
```

Pick the project and give it the alias `default` (this writes `.firebaserc`, which may be
committed).

**Cloudflare** (for the Worker and the dashboard). Having a Cloudflare account is not enough:
the `wrangler` tool on this laptop needs your permission to act for that account.

```bash
npx wrangler login
```

It prints a link and opens it in your browser. Sign in to Cloudflare there and press **Allow**;
the terminal then says "Successfully logged in" and keeps that permission in
`~/.config/.wrangler` (only on this laptop, nothing in the project). If no browser opens, copy
the printed link into one. `npx wrangler whoami` shows which account it is using.

### 4. Deploy and seed

```bash
scripts/preflight.sh deploy
```

```bash
npm run deploy:backend
```

Deploys the Firestore security rules and indexes.

```bash
npm run deploy:worker
```

Publishes the server functions. The first time, Cloudflare asks you to choose a
`workers.dev` subdomain (any free name, e.g. your own). The output ends with the Worker's
address, `https://negroni-bar-lab-api.<subdomain>.workers.dev`: put it in
`web/.env.local` as `VITE_API_URL=…` and in `android/local.properties` as
`negroni.apiUrl=…` (same address in both).

```bash
node scripts/set-worker-secrets.mjs ~/negroni-service-account.json
```

Gives the Worker its secrets: the service account from the key file, and a random **PIN
pepper** made here once and kept only at Cloudflare (running the script again keeps it: a new
pepper would make every PIN stop working).

```bash
npm --prefix tools/seed run init-credentials
```

```bash
GOOGLE_APPLICATION_CREDENTIALS=~/negroni-service-account.json npm --prefix tools/seed run seed -- --project <projectId>
```

Creates `admin` and `user1`..`user5` (display names "Admin", "Server 1".."Server 5"; initial
password = username twice, e.g. `user1user1`), the menu imported from barlab.gr, tables
"1".."20" and the summary header. The seed never overwrites anything that already exists.
The credentials file is git-ignored; keep it off shared drives.

```bash
npm run deploy:dashboard
```

Builds the dashboard with `web/.env.local` and publishes it at
`https://negroni-bar-lab.pages.dev` (works on the laptop and on any phone's browser). Then in
Firebase → **Authentication → Settings → Authorized domains → Add domain**:
`negroni-bar-lab.pages.dev`.

Finally install the phone app built for this project ([Install the app on a phone](#install-the-app-on-a-phone)).

### 5. First sign-in

1. Open the dashboard, sign in as `admin` / `adminadmin`, choose a new password (required).
   On a phone, the admin also chooses a PIN of 6–8 digits after the password.
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

4. `google-services.json` must be in `android/app/` (setup step 2.5) and the Worker's address
   in `android/local.properties` as `negroni.apiUrl=…` (setup step 4).
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

**Signing in on a phone.** The first time on a phone, each person signs in with username and
password (**Add / other account**) and chooses a **PIN** (servers 4–8 digits, admin and barman
6–8). From then on the phone shows a grid of its profiles (name and icon or picture): tap yours,
type the PIN. Wrong PINs: 5 tries, then the profile locks for 1 minute, doubling with each
further wrong PIN up to 1 hour (on every phone; the admin can unlock it). **Use password
instead** always works. On a phone with only one profile, the app offers fingerprint unlock
after the PIN (Settings → Fingerprint unlock). Long-press a profile to remove it from the phone.

**Switch user.** Tap your picture or icon at the top right (or Settings → **Switch user**) to
hand a shared phone to someone else; it goes back to the grid once everything you entered has
reached the server. Settings → **Remove me from this phone** takes your profile off the grid.

**Shifts change at 18:00.** A login on a phone or the dashboard lasts until the next 18:00; then
the phone goes back to the grid and asks for the PIN again (the dashboard asks for the
password). If orders or payments are still waiting to sync at 18:00, the phone first sends
them, then signs out.

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
**Payments** tab). User changes go through the server functions, so they need a connection.

- **Users**: create (username, display name, role, temporary password), rename, change role,
  **icon or picture** (16 gold line icons, defaults by role: person, barman with bow tie,
  admin with key; or upload a picture, cropped to a square and shrunk to 256×256; everyone can
  also change their own in Settings), **Reset PIN** (they sign in with the password and choose a
  new one), **Unlock** a profile locked by wrong PINs, deactivate/activate, reset password, **delete** (removes the login so the username can be
  reused; the name stays on past orders and payments; you cannot delete yourself or the last
  admin). Roles: `admin` (everything, the barman/owner),
  `barman` (order board and staff permissions in the Android app, no admin work), `server`.
  **Rights** per server: can sign in (on by default; off means the server cannot use the app at
  all, a quick switch unlike deactivating the account), works without asking (off by default),
  take payments, reverse payments, close tables, cancel orders, move tables (on by default). The phone hides
  what a server may not do, and the security rules refuse it anyway.
- **Phones** (under Users): every phone where staff sign in with a PIN, who is on it and when
  it was last used. **Remove** a lost phone: no one can sign in on it with a PIN until someone
  signs in there with a password again.
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
  document on every request, so deactivation and role changes apply at once. Only the
  server functions write it: `createUser`, `updateUser`, `resetPassword`, `changeOwnPassword`. Every
  change goes to `auditLog`.
- Anyone with `mustChangePassword` (the seeded admin, anyone after a reset) can do nothing
  but change their password, and not back to the initial username-twice password.

### Profile sign-in (PIN)

The PIN is a quick unlock for a phone that is already registered, not a password replacement:

- **A phone is registered** by the first password sign-in on it (`registerDevice`). The server
  gives it an id and a random 256-bit key; the phone keeps the key encrypted with an AES-GCM key
  in the Android Keystore. `devices/{id}` (admin can read: name, profiles, last used) and
  `deviceSecrets/{id}` (server only: SHA-256 of the key). Everyone who signs in there with a
  password is added to that phone's grid.
- **PIN sign-in** (`profileSignIn`) sends phone id + key + profile + PIN to the server, which
  checks the phone, the profile is on it, the account is active and allowed to sign in, the
  lock, then the PIN, and returns a Firebase custom token. A PIN alone is useless on any other
  phone.
- **PINs are never stored in plain text.** `pinSecrets/{uid}` (no app can read it, not even the
  admin) holds PBKDF2-SHA256 (10,000 iterations, 16-byte salt) over HMAC-SHA256(pepper, PIN). A 4-digit
  PIN has only 10,000 values, so the defence is the combination: the hashes are unreadable to
  apps, the pepper lives only in a Cloudflare secret, the lockout is counted on the server in a
  transaction (parallel guesses cannot slip past it), and a registered phone is needed.
- **Lockout:** 5 free tries, then 1 minute, doubling per further wrong PIN up to 1 hour; tries
  during a lock are refused unchecked. A correct PIN, a password sign-in on a phone, or the
  admin (`unlockPin`) clears it. `users/{uid}.pinLockedUntil` mirrors the lock for the screens.
- **Length only:** servers 4–8 digits, admin and barman 6–8 (a promotion clears a shorter PIN).
  Any digits are allowed. The first PIN (and the first after `resetPin`) needs a password
  sign-in; changing it needs the current PIN.
- **Fingerprint unlock** (optional, only on a phone with one profile, because a fingerprint opens
  the whole phone): `setBiometric` gives the phone a second random secret, sealed with a Keystore
  key that works only right after a strong biometric check and is destroyed when fingerprints
  change. Adding a second profile to the phone turns it off.
- **What the phone stores:** for the grid only uid, name, icon and picture version (no username,
  token or PIN); the phone key and fingerprint secret Keystore-encrypted. Firebase Auth keeps its
  own session in the app's private storage until 18:00; nothing is backed up or transferred.
- **Switching user** waits for the sync: Firestore keeps each person's unsent writes in their own
  queue, so switching with writes pending would leave them stuck until that person returned.
- **Icons and pictures:** `users/{uid}.icon` (missing = role default) and, for an uploaded picture,
  `avatars/{uid}` (≤ 100 KB JPEG/PNG/WebP bytes, checked by type and size) with
  `users/{uid}.photoVersion`, so phones download a picture only when it changes. Written by
  `setIcon`; the drawings are in `design/icons/profile-icons.json`
  (`npm --prefix tools/icon run profile-icons` regenerates Android and dashboard copies).

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

### Hosting (Firebase + Cloudflare)

- **Phones and dashboard → Firebase** (Google, Milan) for sign-in and the database, directly
  over Wi-Fi or 4G: live updates, offline queue, security rules. Free Spark plan (50,000
  reads and 20,000 writes a day, 1 GB stored; a bar uses a small part of that).
- **Phones and dashboard → the Worker** (Cloudflare) for the server functions, with the
  signed-in person's Firebase token. The Worker checks the token, then works on Firebase as an
  admin with the service account (a Cloudflare secret). Free plan: 100,000 calls a day, 10 ms
  of processing per call (a PIN check takes about 2 ms).
- **Dashboard files → Cloudflare Pages** (free), at `negroni-bar-lab.pages.dev`. Hash routes
  (`#/board`, `#/tables`, …) work on any domain. A custom subdomain later: Pages project →
  Custom domains, then add it under Firebase → Authentication → Settings → Authorized domains.
- The laptop is only needed to build and install the phone app and to deploy changes.

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
| `worker/`     | Server functions: a Cloudflare Worker (TypeScript) with a small Firebase REST client |
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
npm run test:web && npm run build:web && npm run build:worker
```

```bash
npm run test:backend
```

`test:backend` runs the Worker, rules, offline and seed tests in the Auth/Firestore
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
| AndroidX Biometric | The system fingerprint prompt and a Keystore key bound to it (optional fingerprint unlock) |
| Google Services Gradle plugin | Reads `google-services.json`; applied only when that file exists |
| JUnit 4 (tests only) | Unit tests |
| AndroidX Test runner + ext-junit (instrumented tests only) | Runs `OfflineSyncTest` on the phone |

Navigation is a small back stack held as Compose state (`ui/nav/Navigator.kt`) instead of
Navigation Compose: a handful of screens and no deep links did not justify the dependency.
JSON for the POS export is written by hand (two small documents) instead of adding a library.

**Web**: `preact` (≈4 kB UI layer, saves hand-written DOM code for the admin forms),
`firebase` (official SDK). Dev only: `vite`, `typescript`, `@preact/preset-vite`, `vitest`.

**Worker**: no runtime dependencies. Firebase is reached through its REST APIs with WebCrypto
(the Admin SDK does not run on Cloudflare); `worker/src/google/` keeps the Admin SDK's shapes so
the handlers read the same. PIN hashing is WebCrypto PBKDF2. Dev only: `typescript`, `vitest`,
`@types/node`.

**Rules tests**: `@firebase/rules-unit-testing`, `firebase`, `vitest`.
**Seed**: `firebase-admin`; dev only `vitest`. Runs with Node 22's built-in TypeScript support.
**Icon**: `opentype.js` (dev only, reads the font outlines). The profile icons are generated by a
plain script from `design/icons/profile-icons.json`.
**Root**: `firebase-tools` (CLI, emulators, rules deploy) and `wrangler` (Cloudflare deploys),
pinned per project.

**Fonts**: Lato, Playfair Display and Dancing Script (the site's), plus Greek-only subsets of
Commissioner and Noto Serif Display for Greek letters; all SIL Open Font License 1.1, licences in
`design/fonts/`. How they are combined: `design/tokens.md`.

## Known limits

- No reports yet, no real POS or fiscal integration (design seam only).
- Two phones paying the same table while both offline can overpay; it is shown as "Overpaid"
  and corrected with a reversal.
- A user deactivated while their phone is offline loses that phone's queued writes (by design).
- Firebase App Check is not set up; worth adding before the dashboard URL is shared widely
  (it would also tie `profileSignIn` and `deviceProfiles` to the genuine app).
- The Worker holds the service-account key: anyone who controls the Cloudflare account controls
  the data. Protect that account with two-step sign-in.
- PIN sign-in needs a connection, like the password sign-in before it (the server checks the
  PIN). Once signed in, the app works offline as before.
- Switching user while orders are still waiting to sync is refused until they reach the server.
- Fingerprint unlock only on a phone with one profile; the dashboard keeps password sign-in.
- `npm audit` reports advisories in `@grpc/grpc-js` pulled in by the Firebase Node SDKs
  (server/tooling side, not in the dashboard bundle).

## Troubleshooting

- **"Firebase is not configured"** on the phone: `android/app/google-services.json` or
  `negroni.apiUrl` in `android/local.properties` is missing; add it and reinstall. On the
  dashboard: `web/.env.local` (with `VITE_API_URL`) is missing; add it and redeploy.
- **"Internal error"** on every sign-in or user change: the Worker has no secrets yet, or the
  key was revoked. Run `node scripts/set-worker-secrets.mjs ~/negroni-service-account.json`;
  `npx wrangler tail --config worker/wrangler.jsonc` shows the Worker's live log.
- **"Wrong username or password"** right after setup: the seed has not run against this project.
- **"Account not set up"**: the Auth user exists but has no `users/{uid}` profile; create users
  from the dashboard, not the Firebase console.
- **Orders stuck on "Waiting to sync"**: the phone is offline, or MIUI stopped the app; open it
  with a connection (and see step 7 of the install).
- **Install fails with "signatures do not match"**: the installed app was built on another
  computer. Sync everything first, then uninstall and install from this laptop.
- **No sound on the dashboard**: click **Enable sound** after each page load.
