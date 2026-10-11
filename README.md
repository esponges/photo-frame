# Photo Frame

Digital photo frame: a rooted Nexus 7 (2013, Android 7.1) showing photos from a
shared Google Drive folder.

- `backend/` — Next.js on Vercel. Holds the Google service-account key, lists the
  Drive folder, resizes images, serves the manifest, and hosts the phone admin page.
- `android/` — Kotlin APK (minSdk 25) that runs on the tablet.
- `scripts/` — adb helpers for kiosk setup and screenshots.

See `/Users/fertostado/.claude/plans/` for the full spec.
