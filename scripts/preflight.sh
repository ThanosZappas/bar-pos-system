#!/usr/bin/env bash
# Checks what a task needs before you start it, and says how to fix what is missing.
#   scripts/preflight.sh phone       phone on USB, Android SDK (for the phone scripts)
#   scripts/preflight.sh emulators   emulator ports free (for the emulator scripts)
#   scripts/preflight.sh deploy      Firebase config files, Cloudflare login (for the real project)
# Several modes can be combined. Exit code 1 when something required is missing.
set -uo pipefail
cd "$(dirname "$0")/.."
. scripts/env.sh 2>/dev/null || true

failed=0
ok()   { printf '  \033[32m✓\033[0m %s\n' "$1"; }
bad()  { printf '  \033[31m✗\033[0m %s\n    → %s\n' "$1" "$2"; failed=1; }
warn() { printf '  \033[33m!\033[0m %s\n    → %s\n' "$1" "$2"; }

echo "Tools"
node_major=$(node -v 2>/dev/null | sed -E 's/v([0-9]+).*/\1/')
if [ "${node_major:-0}" -ge 22 ]; then ok "Node $(node -v)"; else bad "Node 22+ not found (have: $(node -v 2>/dev/null || echo none))" "install nvm and Node 22, then: . scripts/env.sh"; fi
java_major=$(java -version 2>&1 | head -1 | sed -E 's/.*version "([0-9]+).*/\1/')
if [ "${java_major:-0}" -ge 21 ]; then ok "Java $java_major (emulators need 21+)"; else bad "Java 21+ not found (have: ${java_major:-none})" "install a JDK 21 into ~/.local/jdks, then: . scripts/env.sh"; fi
missing=""
for d in . web worker firebase tools/seed tools/icon; do [ -d "$d/node_modules" ] || missing="$missing $d"; done
if [ -z "$missing" ]; then ok "npm packages installed"; else bad "npm packages missing in:$missing" "npm run install:all"; fi
if [ -f tools/seed/seed-credentials.json ]; then ok "seed credentials file"; else warn "tools/seed/seed-credentials.json missing" "npm --prefix tools/seed run init-credentials"; fi

for mode in "$@"; do
  case "$mode" in
    phone)
      echo "Phone"
      sdk="${ANDROID_HOME:-$(sed -n 's/^sdk.dir=//p' android/local.properties 2>/dev/null)}"
      sdk="${sdk:-$HOME/Android/Sdk}"
      adb="$sdk/platform-tools/adb"
      if [ -x "$adb" ]; then ok "Android SDK at $sdk"; else bad "adb not found in $sdk" "install the Android SDK platform-tools (Android Studio → SDK Manager)"; continue; fi
      state=$("$adb" get-state 2>&1 | tail -1)
      case "$state" in
        device)
          model=$("$adb" shell getprop ro.product.model 2>/dev/null | tr -d '\r')
          release=$("$adb" shell getprop ro.build.version.release 2>/dev/null | tr -d '\r')
          ok "phone connected: $model, Android $release" ;;
        *unauthorized*) bad "phone connected but not authorized" "unlock the phone and accept \"Allow USB debugging?\"" ;;
        *more\ than\ one*) bad "more than one device connected" "unplug the others (or set ANDROID_SERIAL)" ;;
        *) bad "no phone found" "connect it by USB; enable Developer options → USB debugging and Install via USB" ;;
      esac
      ;;
    emulators)
      echo "Emulator ports"
      busy=""
      for port in 4000 4400 5173 8080 8787 9099; do
        if ss -ltn 2>/dev/null | awk '{print $4}' | grep -qE "[:.]$port\$"; then busy="$busy $port"; fi
      done
      if [ -z "$busy" ]; then ok "ports 4000 4400 5173 8080 8787 9099 free"; else bad "ports in use:$busy" "stop the other emulator or dev server (e.g. an earlier run still open)"; fi
      ;;
    deploy)
      echo "Real Firebase project and Cloudflare"
      if [ -f android/app/google-services.json ]; then ok "android/app/google-services.json"; else bad "android/app/google-services.json missing" "README → First-time setup, step 2.5"; fi
      if [ -f web/.env.local ]; then ok "web/.env.local"; else bad "web/.env.local missing" "copy web/.env.example and fill it in (README step 2.6)"; fi
      if [ -f .firebaserc ]; then ok ".firebaserc ($(sed -n 's/.*"default": *"\([^"]*\)".*/\1/p' .firebaserc))"; else bad ".firebaserc missing" "npx firebase login && npx firebase use --add"; fi
      if npx wrangler whoami 2>/dev/null | grep -qi "logged in"; then ok "Cloudflare login (wrangler)"; else bad "not logged in to Cloudflare" "npx wrangler login (README step 3)"; fi
      if [ -f "$HOME/negroni-service-account.json" ]; then ok "~/negroni-service-account.json"; else warn "no ~/negroni-service-account.json" "Firebase → Project settings → Service accounts → Generate new private key (README step 2.7)"; fi
      grep -q '^negroni.apiUrl=.' android/local.properties 2>/dev/null && ok "negroni.apiUrl in android/local.properties" || warn "no negroni.apiUrl in android/local.properties yet" "add it after npm run deploy:worker (README step 4)"
      grep -q '^VITE_API_URL=.' web/.env.local 2>/dev/null && ok "VITE_API_URL in web/.env.local" || warn "no VITE_API_URL in web/.env.local yet" "add it after npm run deploy:worker (README step 4)"
      ;;
    *) echo "Unknown mode: $mode (use phone, emulators, deploy)"; failed=1 ;;
  esac
done

if [ "$failed" -ne 0 ]; then echo "Fix the ✗ items above, then try again."; exit 1; fi
echo "All set."
