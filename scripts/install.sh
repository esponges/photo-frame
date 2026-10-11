#!/usr/bin/env bash
# Build, install, launch, and screenshot. The screenshot is the point: it is the
# feedback loop for the frame UI without walking over to the tablet.
set -euo pipefail
export PATH="$PATH:$HOME/Library/Android/sdk/platform-tools"
export JAVA_HOME="${JAVA_HOME:-/opt/homebrew/opt/openjdk@17}"

cd "$(dirname "$0")/../android"

./gradlew :app:assembleDebug

if ! adb get-state >/dev/null 2>&1; then
  echo "Built, but no device attached. APK:"
  echo "  android/app/build/outputs/apk/debug/app-debug.apk"
  exit 0
fi

adb install -r app/build/outputs/apk/debug/app-debug.apk
adb shell am start -n com.fer.photoframe/.FrameActivity >/dev/null
echo "Waiting for the first photo..."
sleep 8
adb exec-out screencap -p > /tmp/frame.png
echo "Screenshot: /tmp/frame.png"
echo "Logs:       adb logcat -s PhotoFrame:V"
