#!/usr/bin/env bash
# Install ISRG Root X1 into the SYSTEM trust store, for ROMs that predate it.
# Only needed if device-check.sh reports it missing; the frame app bundles the
# root itself, so this is for Chrome and other apps on the tablet.
set -euo pipefail
export PATH="$PATH:$HOME/Library/Android/sdk/platform-tools"

CERT="$(dirname "$0")/../android/app/src/main/res/raw/isrg_root_x1.pem"
HASH="$(openssl x509 -in "$CERT" -noout -subject_hash_old)"

adb push "$CERT" "/sdcard/${HASH}.0"
adb shell su -c "
  mount -o rw,remount /system &&
  cp /sdcard/${HASH}.0 /system/etc/security/cacerts/${HASH}.0 &&
  chmod 644 /system/etc/security/cacerts/${HASH}.0 &&
  chown root:root /system/etc/security/cacerts/${HASH}.0 &&
  mount -o ro,remount /system &&
  echo installed
"
adb shell rm "/sdcard/${HASH}.0"
echo "Done. Reboot for all apps to pick it up: adb reboot"
