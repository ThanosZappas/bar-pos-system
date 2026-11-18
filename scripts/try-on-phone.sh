#!/usr/bin/env bash
# Try the whole system on the phone without a Firebase project: starts the Auth and Firestore
# emulators and the server functions (the Worker, run in Node) on this laptop with the seed and
# demo orders, installs a debug build on
# the phone (by USB) that talks to them, and serves the dashboard at http://localhost:5173.
# The phone reaches the laptop through the USB cable (adb reverse); nothing is opened on the
# Wi-Fi. Stop everything with Ctrl+C. Emulator data is thrown away when it stops.
set -euo pipefail
cd "$(dirname "$0")/.."
. scripts/env.sh
scripts/preflight.sh phone emulators

sdk="${ANDROID_HOME:-$(sed -n 's/^sdk.dir=//p' android/local.properties 2>/dev/null)}"
ADB="${sdk:-$HOME/Android/Sdk}/platform-tools/adb"
LOG_DIR="$(mktemp -d)"
PORTS="9099 8080 8787"

[ -f tools/seed/seed-credentials.json ] || npm --prefix tools/seed run init-credentials
# PIN hashes need a secret pepper (PIN_PEPPER). Locally: a throwaway one, made once here, in a
# git-ignored file. The real Worker keeps its own as a Cloudflare secret (README).
[ -f worker/.dev.vars ] || node -e "console.log('PIN_PEPPER=' + require('crypto').randomBytes(32).toString('base64'))" > worker/.dev.vars
npm run build:worker >/dev/null

cleanup() {
  echo; echo "Stopping…"
  [ -n "${REVERSE_PID:-}" ] && kill "$REVERSE_PID" 2>/dev/null || true
  [ -n "${WEB_PID:-}" ] && kill "$WEB_PID" 2>/dev/null || true
  [ -n "${API_PID:-}" ] && kill "$API_PID" 2>/dev/null || true
  [ -n "${EMU_PID:-}" ] && kill -INT "$EMU_PID" 2>/dev/null && wait "$EMU_PID" 2>/dev/null || true
  "$ADB" reverse --remove-all 2>/dev/null || true
}
trap cleanup EXIT INT TERM

echo "Starting emulators (log: $LOG_DIR/emulators.log)…"
npx firebase emulators:start --only auth,firestore --project demo-negroni >"$LOG_DIR/emulators.log" 2>&1 &
EMU_PID=$!
until grep -q "All emulators ready" "$LOG_DIR/emulators.log"; do
  kill -0 "$EMU_PID" 2>/dev/null || { cat "$LOG_DIR/emulators.log"; exit 1; }
  sleep 1
done
( set -a; . worker/.dev.vars; set +a; exec node worker/lib/dev-server.js ) >"$LOG_DIR/worker.log" 2>&1 &
API_PID=$!
until grep -q "Worker ready" "$LOG_DIR/worker.log"; do
  kill -0 "$API_PID" 2>/dev/null || { cat "$LOG_DIR/worker.log"; exit 1; }
  sleep 1
done
npm --prefix tools/seed run seed:emulator >/dev/null
npm --prefix tools/seed run demo:rounds >/dev/null
npm --prefix tools/seed run demo:history >/dev/null

# Keep the USB port forwarding in place: --no-rebind leaves a working forward untouched (re-binding
# it would briefly refuse new connections), and only re-creates it after the cable was replugged
# (a simple way to test offline).
( while true; do for p in $PORTS; do "$ADB" reverse --no-rebind "tcp:$p" "tcp:$p" >/dev/null 2>&1 || true; done; sleep 3; done ) &
REVERSE_PID=$!

echo "Building and installing the debug app (emulator mode)…"
(cd android && ./gradlew installDebug -Pfirebase.emulatorHost=127.0.0.1 --console=plain -q && ./gradlew --stop -q)
"$ADB" shell am start -n gr.barlab.negroni/.MainActivity >/dev/null

(cd web && VITE_USE_EMULATORS=true npx vite --port 5173 --strictPort >"$LOG_DIR/web.log" 2>&1) &
WEB_PID=$!

cat <<'INFO'

Ready.
  Phone      the app is open. Sign in with a password the first time: server user1 / user1user1,
             or admin / adminadmin (asks for a new password first). Then choose a PIN (servers
             4-8 digits, admin 6-8); from then on tap your profile and type the PIN. Add more
             people with "Add / other account". Demo orders are on tables 1, 4, 7 and 9, and
             three weeks of closed bills fill the dashboard's Analytics.
  Dashboard  http://localhost:5173 (admin)        Emulator data  http://localhost:4000
  Offline    turn on airplane mode and unplug the cable; take orders and payments; plug back in
             and turn airplane mode off: everything syncs, nothing twice.

This build talks to the laptop's emulators. To go back to the real project later:
  (cd android && ./gradlew installDebug)

Press Ctrl+C to stop.
INFO
wait "$EMU_PID"
