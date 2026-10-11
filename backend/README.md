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
