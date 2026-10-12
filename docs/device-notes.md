# Device notes

Facts about the frame tablet that were verified on the device (spec tasks 6.1-6.7).
Anything not yet verified is listed at the bottom rather than guessed.

## Hardware and ROM
- Nexus 7 (2013), codename `flo`, 1200x1920 portrait panel
- CyanogenMod `cm_flo` 7.1.0 build `NDE63X`, Android 7.1 (SDK 25)
- 2GB RAM: a decoded 1200x1920 ARGB_8888 bitmap is about 9MB, so keep one ahead at most
- Adreno 320 with **no HEVC decoder**: H.265 clips fail to start; the app skips a video
  that has not started within 10 seconds (3s was too tight: an MP4 with its index at
  the end needs several range requests and started in ~2.6s)
- Root works (`su -c id` returns `uid=0`); the app needs it for the screen schedule
  and brightness

## TLS
- ISRG Root X1 **is** in the system trust store (found as `6187b673` in
  `/system/etc/security/cacerts/`, SHA-256 fingerprint matches the bundled root)
- So Let's Encrypt and Vercel custom domains work here. The app also bundles the root
  (`network_security_config.xml`), so it keeps working on a ROM that lacks it.
- `scripts/device-check.sh` tests the store directly; do not infer it from the Android version
- `scripts/install-ca.sh` exists for a ROM that genuinely lacks the root

## Debugging quirks
- `adb exec-out screencap` renders the app's faint text near-black on this panel, so a
  screenshot can look empty when it is not. Verify UI text with
  `adb shell uiautomator dump` instead.
- Screen schedule uses `input keyevent 223` (SLEEP) and `224` (WAKEUP); `26` toggles and
  would be wrong when the screen is already off.
- The clock is corrected by NTP once the tablet is on Wi-Fi, which the on/off hours depend on.

## Network
- Wi-Fi toggle needs root: `adb shell svc wifi disable` as the shell user is killed
  (exit 137) and Wi-Fi stays on. Use `adb shell 'su -c "svc wifi disable"'` (and `enable`).
- LAN address seen on 2026-10-12: `192.168.100.13/24` on `wlan0` (DHCP, so it may change)
- Battery on 2026-10-12: level 100, health 2 (good), 24.5C
