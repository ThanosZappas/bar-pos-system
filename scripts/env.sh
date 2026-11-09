# Source this before running Node/Firebase commands:  . scripts/env.sh
# Uses the user-local Node 22 (nvm) and JDK 21 (needed by the Firestore emulator).
export NVM_DIR="$HOME/.config/nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh" && nvm use 22 >/dev/null
JDK21="$(ls -d "$HOME"/.local/jdks/jdk-21* 2>/dev/null | head -1)"
if [ -n "$JDK21" ]; then export JAVA_HOME="$JDK21"; export PATH="$JAVA_HOME/bin:$PATH"; fi
