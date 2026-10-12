# Photo Frame

A digital photo frame built from a 2013 Nexus 7 tablet (Android 7.1, rooted, portrait, 1200x1920).
It shows photos and short videos from a shared Google Drive folder, with captions taken from each
file's Drive description. The owner controls it from a phone-friendly admin page.

## Layout
- `backend/` — Next.js app on Vercel. Reads Drive via a service account, resizes images for the
  panel, and serves a manifest plus a small control plane (skip, hide, resync, settings, heartbeat).
- `android/` — Kotlin app on the tablet. Plays a shuffled, no-repeat playlist, caches images on disk,
  polls for commands, and handles the on/off schedule via root.
- `scripts/` — device checks, install, screenshot, fixture video generation.
- `openspec/` — specs and `tasks.md` for the `digital-photo-frame` change; the source of truth for
  what is done and pending.

## Notes
- Auth is a single bearer token (`FRAME_TOKEN`) for the tablet, and a password cookie for admin.
- `FIXTURE_MODE=1` serves generated test media instead of Drive (see `backend/README.md`).
