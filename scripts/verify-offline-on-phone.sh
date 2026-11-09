#!/usr/bin/env bash
# On-phone offline verification (milestone 7). Needs: the phone connected by USB with USB
# debugging on. Starts the Auth + Firestore emulators on this laptop (localhost only), seeds
# them, forwards the phone's localhost ports to the laptop over USB (adb reverse, nothing is
# exposed on the Wi-Fi), and runs OfflineSyncTest on the phone. Installs the debug app and its
# test APK on the phone.
set -euo pipefail
cd "$(dirname "$0")/.."
. scripts/env.sh
ADB="${ANDROID_HOME:-$HOME/Android/Sdk}/platform-tools/adb"

scripts/preflight.sh phone emulators
[ -f tools/seed/seed-credentials.json ] || npm --prefix tools/seed run init-credentials
for port in 9099 8080; do "$ADB" reverse "tcp:$port" "tcp:$port"; done
trap '"$ADB" reverse --remove-all' EXIT

npx firebase emulators:exec --only auth,firestore --project demo-negroni \
  "npm --prefix tools/seed run seed:emulator && cd android && ./gradlew connectedDebugAndroidTest -Pandroid.testInstrumentationRunnerArguments.class=gr.barlab.negroni.OfflineSyncTest && ./gradlew --stop"
echo "OfflineSyncTest passed on the phone."
