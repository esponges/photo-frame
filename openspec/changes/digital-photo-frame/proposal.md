## Why

A rooted Nexus 7 2013 is sitting unused and would make a good wall-mounted photo
frame for photos shared between two people. The obvious route — the Google Photos
Library API — is not viable: since 2025-03-31 Google removed the `photoslibrary.readonly`
scope, leaving third-party apps able to read only media they uploaded themselves.
Photos a human adds to a shared album through the Google Photos app are not
app-created and stay invisible, so a shared album cannot work as a drop box.

Google Drive is the workable source: real folder read access, both people can add
photos from the Drive app on their phones, and each file carries an editable
description usable as an on-screen caption.

## What Changes

- **New Vercel backend** holding a Google service-account key, listing a shared
  Drive folder, resizing images for the tablet, and hosting a phone admin page.
  The tablet holds no Google credentials.
- **New native Kotlin app** (minSdk 25) running full-screen in portrait on the
  tablet, cross-fading photos on an interval, fully offline-capable.
- **Service-account auth instead of user OAuth.** User OAuth refresh tokens expire
  after 7 days while an app is in "Testing", which is fatal for an unattended frame.
- **Content-addressed media URLs** (file md5 in the path, served `immutable`), so
  the CDN plus the device's disk cache replace a blob store entirely.
- **Server-side blurred backdrops** at 60x96, stretched on-device behind
  letterboxed landscape photos. Bilinear upscaling is the blur, so the 2013 GPU
  does no work and no RenderScript is needed.
- **Root-based screen scheduling** using `input keyevent 223`/`224` (SLEEP/WAKEUP)
  rather than `26` (POWER), which toggles and would invert after one missed event.
- **Videos stream, never cached**, and are skipped when offline or undecodable.

## Capabilities

### New Capabilities
- `drive-media-source`: Reading a shared Google Drive folder via a service account,
  extracting captions and EXIF capture dates, and exposing an item manifest.
- `media-delivery`: Resizing and orientation-correcting images for the tablet's
  panel, generating blurred backdrops, and range-proxying video.
- `frame-playback`: On-device playlist ordering, transitions, caption/date overlay,
  offline caching, and video skip-on-failure behaviour.
- `frame-control`: The password-protected admin page, command queue, settings, and
  heartbeat reporting.
- `device-operations`: Kiosk behaviour on the tablet — immersive fullscreen, boot
  relaunch, screen on/off scheduling, and TLS trust on an old Android build.

### Modified Capabilities
<!-- None. This is a greenfield project with no existing specs. -->

## Impact

- **New code**: `backend/` (Next.js 15, React 19, `sharp`, `google-auth-library`,
  Upstash Redis) and `android/` (Kotlin, AGP 8.7, Coil 2.7, OkHttp, WorkManager).
- **New external dependencies**: a GCP project with the Drive API enabled and a
  service account; a Vercel project; optionally Upstash Redis for mutable state.
- **Hardware constraints**: Nexus 7 2013 (`flo`), CyanogenMod `cm_flo` 7.1.0
  (SDK 25), 1200x1920 portrait panel, 2GB RAM, Adreno 320 with **no HEVC decoder**.
- **Manual setup required**: sharing the Drive folder with the service account's
  email, and joining the tablet to Wi-Fi.
- **No impact on existing systems** — greenfield project, no existing specs.
