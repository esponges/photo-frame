<!--
Checked items are complete and verified. Unchecked items are outstanding.
Where an item was verified on the real device, the evidence is noted.
-->

## 1. Project setup

- [x] 1.1 Create `photo-frame/` with `backend/`, `android/`, `scripts/`
- [x] 1.2 Add `.gitignore` covering `.env*`, `local.properties`, `service-account*.json`, build output
- [x] 1.3 Initialise the git repository and make the initial commit

## 2. Backend — Drive access

- [x] 2.1 Service-account JWT auth against the Drive API (`src/lib/drive.ts`)
- [x] 2.2 List media in the folder, recursing one level into subfolders
- [x] 2.3 Read captions from each file's `description` field
- [x] 2.4 Normalise Drive's `2019:03:04 18:12:33` EXIF time into ISO 8601
- [x] 2.5 Swap reported width/height for odd quarter-turn rotations (Drive reports
      `rotation` as 0-3, not degrees; fixed after real files showed `rotation: 1`)
- [x] 2.6 Return a clear HTTP 502 with the upstream message when Drive fails
- [x] 2.7 Add a short server-side cache so `/api/manifest` does not hit Drive on
      every request (60s TTL in `drive.ts`, in-flight requests shared, failures not
      cached, dropped on admin Resync; per warm instance on Vercel, not global)

## 3. Backend — media delivery

- [x] 3.1 Resize to fit 1200x1920 without enlarging, JPEG q82 progressive
- [x] 3.2 Bake EXIF orientation into pixels with `sharp().rotate()`
- [x] 3.3 Generate the 60x96 blurred backdrop
- [x] 3.4 Serve content-addressed URLs as `immutable`
- [x] 3.5 Convert non-JPEG input; return HTTP 415 when undecodable
- [x] 3.6 Range-proxy video with `no-store` (clips the tablet cannot decode are now
      converted to H.264, see 9.6)
- [x] 3.7 Accept the token as a query parameter on the video route only
- [x] 3.8 Verify the pipeline: 4000x3000 + EXIF orientation 6 produced a 1200x1600
      portrait JPEG, backdrop 60x96 at 0.3KB

## 4. Backend — control plane

- [x] 4.1 Bearer-token auth for the device, constant-time compared
- [x] 4.2 Signed-cookie admin session from `ADMIN_PASSWORD`
- [x] 4.3 State store on Upstash Redis with an in-memory fallback for local dev
- [x] 4.4 `/api/manifest` with a content-derived version and ETag/304
- [x] 4.5 `/api/commands` draining the queue and returning settings
- [x] 4.6 `/api/heartbeat` recording the current item, battery and version
- [x] 4.7 `/api/health`, unauthenticated, for the TLS probe
- [x] 4.8 Admin page: now-showing, skip, hide, un-hide, resync, settings form
- [x] 4.9 Smoke-test auth: health open, 401 without a token, settings served, admin gated

## 5. Android app

- [x] 5.1 Gradle setup, `minSdk 25` / `targetSdk 35`, wrapper and `gradlew`
- [x] 5.2 `network_security_config.xml` with the system store plus bundled ISRG Root X1
- [x] 5.3 OkHttp client injecting the bearer header; Coil with a 200MB disk cache
- [x] 5.4 API client for manifest, commands and heartbeat
- [x] 5.5 Shuffle-with-no-repeat playlist, persisted, splicing new photos into the cycle
- [x] 5.6 Frame layout: backdrop, two cross-fading ImageViews, VideoView, caption scrim
- [x] 5.7 Playback loop, cross-fade, caption and current-date overlay
- [x] 5.8 One-photo-ahead prefetch
- [x] 5.9 Command polling every 10s
- [x] 5.10 `SyncWorker` warming the disk cache every 30 minutes
- [x] 5.11 Boot receiver, immersive-sticky fullscreen, keep-screen-on
- [x] 5.12 Root helpers and the on/off schedule using SLEEP/WAKEUP, handling midnight wrap
- [x] 5.13 Video playback muted with a 10-second skip-on-failure guard
      (was 3s; measured start time was ~2.6s for an MP4 with its index at the end,
      so good clips were being skipped)
- [x] 5.14 Load `frameBaseUrl`/`frameToken` from `local.properties` explicitly, with a
      build warning when unset (`findProperty()` does not read that file)
- [x] 5.15 Build a debug APK (5MB; CA and network config confirmed inside the archive)

## 6. Device bring-up

- [x] 6.1 Confirm the device over adb (`flo`, `cm_flo 7.1.0 NDE63X`, SDK 25, 1200x1920)
- [x] 6.2 Verify the trust store directly — ISRG Root X1 present, SHA-256 fingerprint
      matches the bundled root, so Let's Encrypt and custom domains are safe here
- [x] 6.3 Replace the Android-version TLS guess in `device-check.sh` with the real check
- [x] 6.4 Add `install-ca.sh` for ROMs that genuinely lack the root
- [x] 6.5 Install and launch on the device; grant root
- [x] 6.6 Confirm immersive portrait rendering and the empty-state message via
      `uiautomator dump` (`screencap` renders faint text near-black on this panel)
- [x] 6.7 Join the tablet to Wi-Fi and confirm NTP corrected the clock

## 7. Google and deployment setup — requires the account owner

- [x] 7.1 Create the GCP project and enable the Drive API
- [x] 7.2 Create the service account and download its JSON key
- [x] 7.3 Create the shared Drive folder and **share it with the service account's
      email** as Viewer — the step most often missed
- [ ] 7.4 Add some photos, and set a few Drive descriptions to test captions
      (3 items in Drive, but none has a description yet, so captions are untested)
- [x] 7.5 Generate `FRAME_TOKEN` (`openssl rand -hex 32`) and choose `ADMIN_PASSWORD` (64-char token; `ADMIN_PASSWORD` kept, 9 chars)
- [x] 7.6 Deploy the backend to Vercel and set its environment variables (https://photo-frame-sandy.vercel.app)
- [x] 7.7 Provision Upstash Redis (`vercel integration add upstash`) so settings and (provisioned; an /admin settings change persists and is served by the production
      manifest; no error-level function logs after real use)
      hidden photos survive restarts
- [ ] 7.8 Rebuild the APK with the real `frameBaseUrl`/`frameToken` and reinstall
      (built with the production values; not yet installed on the tablet)

## 8. End-to-end verification on the device

- [x] 8.1 Optional, unblocks testing before any GCP work: add a backend fixture mode
      serving generated images, reach it with `adb reverse tcp:3000 tcp:3000`, and
      allow cleartext to localhost in the network security config
      (`FIXTURE_MODE=1`; debug-only `src/debug` network config; server side verified
      by curl, EXIF-6 output confirmed upright. Not yet run on the tablet)
- [x] 8.2 Confirm a real photo displays full-screen, correctly oriented
      (portrait photos from the real Drive folder, full-screen and upright, 2026-10-12)
- [ ] 8.3 Confirm a landscape photo letterboxes with the blurred backdrop behind it
      (not verifiable yet: both Drive photos are portrait; needs a landscape photo)
- [ ] 8.4 Confirm the caption comes from the Drive description and the date is correct
      (not verified: no Drive descriptions yet; the date overlay shows the current date)
- [ ] 8.5 Judge the cross-fade, then decide whether Ken Burns is smooth enough to keep
- [ ] 8.6 Confirm Skip and Hide from the admin page take effect within ~10 seconds
- [x] 8.7 Confirm a settings change reaches the frame without a reinstall
      (offHour changed in /admin reached the tablet and moved the alarm, no reinstall)
- [x] 8.8 Disable Wi-Fi and confirm playback continues from cache; re-enable and resync
      (Wi-Fi cut via root: the loop kept cycling cached photos for 2+ min; the video was
      skipped after 3s; polling resumed after Wi-Fi returned)
- [x] 8.9 Reboot and confirm the frame relaunches and resumes its position
      (rebooted: 22 min later the frame was in the foreground with no lockscreen over it,
      cycling every ~60s, and the saved playlist (queue and cursor) had persisted)
- [x] 8.10 Set the off hour a few minutes out and confirm the screen sleeps, then wakes
      (SCREEN_OFF/SCREEN_ON receiver path verified by broadcast; found and fixed the
      keyguard covering the frame. The real alarm has not been observed firing yet)
- [ ] 8.11 Add a photo to Drive and confirm it appears within one sync interval
- [x] 8.12 Add an H.264 clip and confirm it plays muted and advances
      (verified with the 1280x720 H.264 fixture clip: the player position advanced and
      the item moved on; muted via setVolume(0). The clip in Drive turned out to be
      HEVC, not H.264, so it does not count here)
- [x] 8.13 Add an HEVC clip and confirm it is skipped rather than showing black
      (the Drive clip is 1920x1080 HEVC Main 10: this ROM's software decoder accepts it
      but it sits at position 0, so the app now requires the position to advance within
      4s and otherwise skips it, keeping the previous photo on screen; 55 screenshots
      across a cycle showed no black frame. An 8-bit 720p HEVC fixture does play.)
- [ ] 8.14 Confirm the heartbeat and battery level appear in the admin page

## 9. Hardening and follow-ups

- [x] 9.1 Unit-test `Playlist` (no-repeat window, splice, removal, persistence) — it
      holds the only non-trivial logic and currently needs an interface extraction
      or Robolectric to be testable
      (extracted `PlaylistStore`, 12 JVM tests; two deliberate breaks were caught)
- [x] 9.2 Record verified device facts in `docs/device-notes.md` (ROM, trust store
      result, `screencap` caveat, root-required Wi-Fi toggle, LAN address)
      (`docs/device-notes.md`, including the root-required Wi-Fi toggle and LAN address)
- [ ] 9.3 Decide whether uncaptioned photos should show the capture date instead
- [ ] 9.4 Tune the dwell time and sync interval after living with it for a week
- [x] 9.7 Swipe left or right anywhere on the screen to skip to the next item
      (verified on the tablet: fast horizontal swipes skip at once, vertical swipes and
      slow short drags are ignored)
- [x] 9.6 Phone videos the tablet cannot play (10-bit / 1080p HEVC, which phones record by
      default): the backend converts them to 720p baseline H.264 (HDR tone-mapped, audio
      dropped) with ffmpeg-static, caches the result in Redis in 600KB chunks (30 day TTL,
      ~4MB per clip) behind a lock, and passes plain H.264 through. A cold conversion takes
      ~30s on Vercel, once per clip; the app warms the next video ahead and waits up to 45s
      with the previous photo still on screen. Verified: the real Drive clip plays on the
      tablet. Limits: no audio, and a clip's first-ever play waits for the conversion.
- [ ] 9.5 Consider a watchdog that restarts the activity if it dies while unattended

## 10. Physical installation

- [ ] 10.1 Check the 12-year-old battery for swelling before mounting — the most
      likely physical failure, and it can crack the glass
- [ ] 10.2 Mount so a swollen cell cannot press against the screen, with cable access
- [ ] 10.3 Confirm Wi-Fi signal at the final mounting position
- [ ] 10.4 Set the final brightness and on/off hours for the room
