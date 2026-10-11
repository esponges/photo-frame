#!/usr/bin/env bash
# Step 0 of the build: confirm the tablet is reachable, new enough to trust
# Let's Encrypt, and able to complete a TLS handshake with the backend.
#
# Usage: scripts/device-check.sh https://your-project.vercel.app
set -euo pipefail

BASE_URL="${1:-}"
export PATH="$PATH:$HOME/Library/Android/sdk/platform-tools"

if ! adb get-state >/dev/null 2>&1; then
  echo "No device. Enable Developer options -> USB debugging, plug in, and accept"
  echo "the RSA prompt on the tablet. Then: adb devices"
  exit 1
fi

echo "model:    $(adb shell getprop ro.product.model | tr -d '\r')"
echo "android:  $(adb shell getprop ro.build.version.release | tr -d '\r')"
echo "sdk:      $(adb shell getprop ro.build.version.sdk | tr -d '\r')"
echo "rom:      $(adb shell getprop ro.build.display.id | tr -d '\r')"
echo "screen:   $(adb shell wm size | tr -d '\r')"

RELEASE="$(adb shell getprop ro.build.version.release | tr -d '\r')"
case "$RELEASE" in
  7.1.1|7.1.2|8*|9*|1[0-9]*)
    echo "TLS:      ISRG Root X1 present -> Let's Encrypt and custom domains are fine." ;;
  *)
    echo "TLS:      WARNING - Android $RELEASE predates ISRG Root X1 (added in 7.1.1)."
    echo "          Stay on the default *.vercel.app domain (Google Trust Services)." ;;
esac

echo "root:     $(adb shell 'su -c id' 2>/dev/null | tr -d '\r' || echo 'su FAILED - the screen schedule needs root')"

if [ -n "$BASE_URL" ]; then
  echo
  echo "Opening $BASE_URL/api/health in the tablet's browser."
  echo "You should see {\"ok\":true,...}; a certificate warning means the TLS problem is real."
  adb shell am start -a android.intent.action.VIEW -d "$BASE_URL/api/health" >/dev/null
fi
