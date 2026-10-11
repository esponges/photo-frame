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

# Check the trust store directly rather than inferring from the version string.
# ISRG Root X1 officially landed in Android 7.1.1, but ROMs vary: CyanogenMod's
# cm_flo 7.1.0 ships it. Only the device can answer this.
# 6187b673 is the subject hash Android uses as the cacert filename.
if adb shell 'ls /system/etc/security/cacerts/ 2>/dev/null' | tr -d '\r' | grep -q '^6187b673'; then
  echo "TLS:      ISRG Root X1 IS trusted -> Let's Encrypt and Vercel custom domains are fine."
else
  echo "TLS:      ISRG Root X1 NOT trusted. Let's Encrypt will fail on this device."
  echo "          Either stay on the default *.vercel.app domain (Google Trust"
  echo "          Services, trusted here), or install the root with:"
  echo "            scripts/install-ca.sh"
  echo "          The app itself bundles the root as a trust anchor, so the frame"
  echo "          works either way; this only affects Chrome and other apps."
fi

echo "root:     $(adb shell 'su -c id' 2>/dev/null | tr -d '\r' || echo 'su FAILED - the screen schedule needs root')"

if [ -n "$BASE_URL" ]; then
  echo
  echo "Opening $BASE_URL/api/health in the tablet's browser."
  echo "You should see {\"ok\":true,...}; a certificate warning means the TLS problem is real."
  adb shell am start -a android.intent.action.VIEW -d "$BASE_URL/api/health" >/dev/null
fi
