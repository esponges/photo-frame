# Photo Frame — backend

Next.js app on Vercel. Holds the Google service-account key, lists the Drive
folder, resizes images for the tablet, and hosts the phone admin page.

## One-time Google setup

1. Create a project at <https://console.cloud.google.com>.
2. **APIs & Services → Library → Google Drive API → Enable.**
3. **IAM & Admin → Service Accounts → Create.** Name it e.g. `frame-reader`.
   No roles are needed — access comes from Drive sharing, not IAM.
4. On that service account: **Keys → Add key → JSON.** Download it.
5. In Google Drive, create the shared photo folder and **share it with the
   service account's email address** (`...@....iam.gserviceaccount.com`) as
   **Viewer**. This is the step people forget; without it every call 404s.
6. Copy the folder id out of its URL:
   `drive.google.com/drive/folders/`**`<THIS PART>`**

No OAuth consent screen, no app verification, and no token expiry — which is why
a service account is used instead of user OAuth, whose refresh tokens expire
after 7 days while an app is in "Testing".

## Env

Copy `.env.example` to `.env.local` and fill it in. `GOOGLE_PRIVATE_KEY` is the
`private_key` field from the JSON key, quoted, with its `\n` sequences intact.

`FRAME_TOKEN` is a shared secret you invent; the tablet sends it as a bearer
token so the photos are not world-readable. Generate one with:

    openssl rand -hex 32

Upstash Redis is optional for local dev — without it an in-memory store is used
and settings reset on restart. For production:

    vercel integration add upstash

## Run

    pnpm install
    pnpm dev

- <http://localhost:3000/admin> — the phone admin page
- `curl -H "Authorization: Bearer $FRAME_TOKEN" localhost:3000/api/manifest | jq`

### Fixture mode: test the frame without Google

`FIXTURE_MODE=1` replaces Drive with generated test media: a portrait stored
sideways with EXIF orientation 6, a landscape, a square with no caption, a panorama,
and (if present) H.264 and HEVC clips. Only `FRAME_TOKEN` and `ADMIN_PASSWORD` are needed.

    scripts/make-fixture-videos.sh            # once; writes backend/.fixtures/
    FIXTURE_MODE=1 pnpm dev
    adb reverse tcp:3000 tcp:3000             # tablet's localhost:3000 -> this Mac
    cd ../android && ./gradlew :app:assembleDebug \
        -PframeBaseUrl=http://127.0.0.1:3000 -PframeToken=$FRAME_TOKEN

The debug build (only) allows cleartext to `127.0.0.1`/`localhost`; release stays
HTTPS-only. Fixture mode never touches Drive, so it cannot prove the service-account
sharing, TLS to the deployed backend, or real-world EXIF.

## Deploy (Vercel)

The project is linked from `backend/` (`.vercel/` is gitignored), so deploy from this
directory. Leave the project's Root Directory unset while deploying with the CLI.

    vercel integration add upstash/upstash-kv     # injects KV_REST_API_URL / KV_REST_API_TOKEN
    for k in GOOGLE_SERVICE_ACCOUNT_EMAIL GOOGLE_PRIVATE_KEY DRIVE_FOLDER_ID FRAME_TOKEN ADMIN_PASSWORD; do
      printf '%s' "$(printenv $k)" | vercel env add $k production   # after `set -a; . ./.env.local`
    done
    vercel env ls                                  # all five + KV_*; FIXTURE_MODE must be absent
    vercel --prod

Set every variable and the Redis integration *before* deploying: variables added later
do not apply to an existing deployment. Without Redis the in-memory fallback is used,
which on Vercel resets on cold starts and silently drops Skip/Hide commands.
`GOOGLE_PRIVATE_KEY` keeps its literal `\n` sequences, as in `.env.local`.

Verify against the production URL (`$URL`):

    curl $URL/api/health                                                   # 200, no auth
    curl -o /dev/null -w '%{http_code}\n' $URL/api/manifest                # 401
    curl -H "Authorization: Bearer $FRAME_TOKEN" $URL/api/manifest | jq '.items | length'

## Endpoints

| Route | Auth | Purpose |
|---|---|---|
| `GET /api/health` | none | TLS reachability probe from the tablet |
| `GET /api/manifest` | bearer | Item list + settings, with an `ETag` |
| `GET /api/media/{id}/{md5}.jpg` | bearer or admin | Full-screen JPEG, 1200×1920 fit-inside |
| `GET /api/media/{id}/{md5}/backdrop.jpg` | bearer or admin | 60×96 blurred backdrop |
| `GET /api/video/{id}` | bearer or admin | Range-proxied stream, never cached |
| `GET /api/commands` | bearer | Drains the command queue, returns settings |
| `POST /api/heartbeat` | bearer | Reports what is on screen |
| `/admin` | password | Now-showing, skip, hide, settings |

## Notes

- Media URLs are **content-addressed** (the md5 is in the path), so they are
  served `immutable` and need no blob store: the CDN and the device's disk cache
  do the work, and changed bytes simply get a new URL.
- `sharp().rotate()` bakes EXIF orientation into the pixels because older Android
  ignores the orientation flag. The JPEG conversion doubles as a safety net so one
  stray PNG or WebP cannot blank the frame.
- **Deploy on the default `*.vercel.app` domain unless the tablet is confirmed to
  be on Android 7.1.1+.** `*.vercel.app` uses Google Trust Services, which old
  Android trusts; Vercel custom domains use Let's Encrypt, whose `ISRG Root X1`
  only entered the Android trust store in 7.1.1.
