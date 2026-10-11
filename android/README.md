# Photo Frame — Android app

Kotlin app for the Nexus 7 2013 on Android 7.1 (LineageOS 14.1). It shows photos
full-screen in portrait, cross-fading on an interval, and takes everything —
photo list, resized JPEGs, captions, settings — from the backend. It holds no
Google credentials.

`minSdk = 25` on purpose: `ISRG Root X1` only entered the Android trust store in
7.1.1, and anything older cannot speak TLS to a Let's Encrypt host at all.

## Configure

Add to `local.properties` (gitignored):

    sdk.dir=/Users/<you>/Library/Android/sdk
    frameBaseUrl=https://your-project.vercel.app
    frameToken=<the same FRAME_TOKEN as the backend>

Both are baked into `BuildConfig` at compile time, so changing either means a
rebuild. That is deliberate: the tablet then needs no setup UI at all.

## Build and install

    export JAVA_HOME=/opt/homebrew/opt/openjdk@17
    ./gradlew :app:assembleDebug
    adb install -r app/build/outputs/apk/debug/app-debug.apk
    adb shell am start -n com.fer.photoframe/.FrameActivity

Or `../scripts/install.sh`, which does all of that plus a screenshot.

## How it behaves

- **Playlist.** Shuffle with a no-repeat window — the queue is a full permutation
  walked end to end before reshuffling. New photos are spliced into the
  *remainder* of the current pass, so an upload appears within minutes. The queue
  and cursor persist, so a reboot resumes rather than restarting.
- **Offline-first.** `SyncWorker` runs every 30 minutes and warms Coil's 200MB
  disk cache with every photo. A few hundred photos fit entirely, so the frame
  keeps running through a dead router or a backend outage.
- **Backdrop.** Landscape photos letterbox on a portrait screen, so the backend's
  60×96 blurred image is stretched behind them. Bilinear upscaling *is* the blur,
  so there is no on-device RenderScript and the Adreno 320 does no real work.
- **Memory.** Exactly one photo is prefetched ahead. A decoded 1200×1920
  `ARGB_8888` bitmap is ~9MB and the device has 2GB total.
- **Commands.** `/api/commands` is polled every 10s, so a skip or settings change
  from the admin page lands within ten seconds.
- **Schedule.** `AlarmManager` fires at the configured hours and shells out to
  root with `input keyevent 223` (SLEEP) and `224` (WAKEUP). `KEYCODE_POWER` (26)
  is avoided because it *toggles*, and one missed event would invert the schedule
  permanently.
- **Videos.** Streamed, never cached, muted, and skipped when offline. The
  Adreno 320 has no HEVC decoder, so H.265 clips will not start; the player gives
  up after 3 seconds and moves on rather than showing black.

## Known limitations

- H.265/HEVC video cannot play on this hardware. Server-side transcoding would
  fix it and is out of scope.
- The video route authenticates by query parameter, because `VideoView` on API 25
  has no public way to attach an `Authorization` header.
- The screen schedule needs working `su`. Without root the app still runs; the
  screen just never sleeps.
