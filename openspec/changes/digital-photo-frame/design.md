## Context

A rooted Nexus 7 2013 becomes a wall-mounted photo frame for photos shared between
two people. The target device is fixed and unusually constrained, and several
decisions below exist only because of it:

- Nexus 7 2013 (`flo`), CyanogenMod `cm_flo` 7.1.0 `NDE63X`, **SDK 25**
- **1200x1920 portrait** panel — portrait is the device's *native* orientation
- **2GB RAM**; a decoded 1200x1920 ARGB_8888 bitmap is ~9MB
- **Adreno 320 with no HEVC decoder**
- Root available (confirmed `uid=0`)
- Library is a few hundred curated photos, both people adding from Android phones

The Google Photos Library API is unusable: since 2025-03-31 `photoslibrary.readonly`
is gone, and media a human adds to a shared album is not app-created, so it stays
invisible to the app. Google Drive is the source instead.

## Goals / Non-Goals

**Goals:**
- Zero-maintenance operation: add photos by dropping them in a Drive folder
- Keep running with no network, indefinitely
- Control from a phone, never by touching the tablet
- No Google credentials on the device
- Captions that live with the photos and are editable from a phone

**Non-Goals:**
- Supporting any device other than this tablet
- Video transcoding
- Multi-user accounts, sharing, or a public deployment
- Showing an existing Google Photos library directly (impossible, see Context)
- Face detection, smart cropping, or auto-curation

## Decisions

### Google Drive over Google Photos
Google Photos cannot serve as a shared drop box: a human adding a photo to a shared
album produces media the app cannot read. Drive gives real folder read access, both
people can add photos from the Drive app, and the per-file `description` field
provides captions that are editable from a phone and backed up with the photos.

*Alternatives:* Google Photos with an app-owned album (rejected — every photo would
have to pass through a custom uploader); self-hosted Immich (rejected — more setup
than this warrants).

### Service account over user OAuth
An OAuth client left in "Testing" has refresh tokens that **expire after 7 days**,
which is fatal for an unattended frame; leaving Testing requires Google verification
for `drive.readonly`. A service account has no consent screen, no verification and
no expiry. The folder is shared with the service account's email.

*Trade-off:* the key must never reach the device, which forces a backend.

### Backend holds all credentials; device is thin
The service-account key, Drive calls and image processing live on Vercel. The device
receives only a list and plain JPEGs. This keeps secrets off a wall-mounted tablet
and allows changing behaviour without reinstalling the app.

### Native Kotlin app over a web page
A native app gives a boot receiver, wake lock, true immersive fullscreen, a real
disk cache and a bundled CA trust anchor — all awkward or impossible in a browser.

*Trade-off:* an Android toolchain and sideloading, versus a page that redeploys
instantly. Accepted because the ops properties matter more for an unattended device.
`minSdk 25` matches the device exactly.

### Content-addressed media URLs instead of a blob store
Each media URL embeds the file's md5 and is served `immutable`. Changed bytes get a
new URL, so the CDN and the device's disk cache provide persistence and
invalidation for free. **No blob store is needed at all.**

### Server-side blurred backdrops
Landscape photos letterbox on a portrait panel. Rather than blurring on-device
(RenderScript on an Adreno 320), the backend emits a **60x96** blurred image that
the device stretches to full screen: bilinear upscaling *is* the blur, it costs a
few hundred bytes, and the GPU does no real work.

### EXIF rotation baked into pixels
Older Android ignores the EXIF orientation flag, so rotation is applied during
resize. The same conversion doubles as the non-JPEG safety net.

### Device owns the playlist; server owns settings
Shuffle order and cursor live on the device and persist across reboots, so playback
is correct with no network. The server keeps only settings, the hidden set, a
command queue and the last heartbeat — small enough that an in-memory fallback
serves local development without any infrastructure.

### Deterministic screen control
Scheduling uses `input keyevent 223` (SLEEP) and `224` (WAKEUP) rather than `26`
(POWER). POWER *toggles*: one missed or doubled event would invert the schedule
permanently.

### Verify TLS trust empirically, not by version
ISRG Root X1 officially arrived in Android 7.1.1 and Let's Encrypt stopped serving
the DST Root CA X3 cross-sign in June 2024, so 7.1.0 "should" fail. This device's
CyanogenMod build **does** ship the root — confirmed by fingerprint comparison. The
version heuristic would have given wrong advice, so tooling checks the trust store
directly. The app bundles the root anyway, so it works on ROMs that lack it.

## Risks / Trade-offs

- **12-year-old battery held at 100% permanently** → Most likely physical failure;
  these cells swell and crack the glass. Check condition before mounting and mount
  so a swollen cell cannot press the screen.
- **No HEVC decoder** → Some clips cannot play. Mitigated by a 10-second
  skip-on-failure guard rather than transcoding.
- **Memory pressure on 2GB** → Prefetch is capped at one photo ahead and the memory
  cache at ~48MB.
- **Single point of failure in the backend** → Mitigated by caching the entire
  library on-device, so an outage is invisible until a photo is added.
- **Vercel custom domains use Let's Encrypt** → Safe on this device (verified), but
  `*.vercel.app` uses Google Trust Services and is the safer default elsewhere.
- **`screencap` renders faint text as near-black on this panel** → Verify the UI
  with `uiautomator dump`, not screenshots alone.
- **Build config can fail silently** → `findProperty()` does not read
  `local.properties`; it is loaded explicitly and the build warns when unset.
- **Ken Burns may jank on an Adreno 320** → Shipped as an option, default off,
  to be judged on the real device.

## Migration Plan

Greenfield; nothing to migrate. Deployment order:

1. Create the GCP project, enable the Drive API, create the service account, and
   **share the Drive folder with its email** — the step most often missed.
2. Deploy the backend and set its environment variables.
3. Build the app with the backend URL and token, and sideload it via adb.
4. Join the tablet to Wi-Fi, grant root, and verify the trust store.

Rollback is per-component: the previous APK can be reinstalled, and the backend
rolled back in Vercel, independently.

## Open Questions

- Does the Ken Burns transition remain smooth on the real device, or stay off?
- Is 60 seconds the right dwell time in daily use?
- Should uncaptioned photos show the capture date instead of nothing?
- Is a 30-minute sync interval frequent enough for new uploads to feel prompt?
