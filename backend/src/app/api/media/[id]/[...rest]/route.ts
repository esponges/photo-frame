import sharp from "sharp";
import { isAdmin, isFrame, unauthorized } from "@/lib/auth";
import { fetchFile } from "@/lib/drive";

// sharp needs the Node runtime; it cannot run on the edge.
export const runtime = "nodejs";

/** The tablet's panel, in its mounted (portrait) orientation. */
const SCREEN_W = 1200;
const SCREEN_H = 1920;

/**
 * Tiny, heavily downscaled backdrop. The device stretches this to full screen
 * behind letterboxed landscape photos — bilinear upscaling *is* the blur, so the
 * 2013 GPU does no work and we avoid on-device RenderScript entirely.
 */
const BACKDROP_W = 60;
const BACKDROP_H = 96;

const IMMUTABLE = "public, max-age=31536000, immutable";

/**
 * GET /api/media/{id}/{md5}.jpg           → full-screen JPEG
 * GET /api/media/{id}/{md5}/backdrop.jpg  → blurred backdrop
 *
 * The md5 in the path makes these URLs content-addressed, so they can be cached
 * forever and no blob store is needed: the CDN plus the device's disk cache do
 * all the work, and new bytes get a new URL.
 */
export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string; rest: string[] }> },
) {
  if (!isFrame(req) && !(await isAdmin())) return unauthorized();

  const { id, rest } = await ctx.params;
  const wantsBackdrop = rest.length === 2 && rest[1] === "backdrop.jpg";
  if (!wantsBackdrop && !(rest.length === 1 && rest[0].endsWith(".jpg"))) {
    return new Response("Not found", { status: 404 });
  }

  const upstream = await fetchFile(id);
  if (!upstream.ok || !upstream.body) {
    return new Response(`Drive fetch failed: ${upstream.status}`, { status: 502 });
  }
  const input = Buffer.from(await upstream.arrayBuffer());

  try {
    // .rotate() with no argument bakes the EXIF orientation into the pixels, which
    // matters because older Android ignores the orientation flag entirely.
    // Converting to JPEG also doubles as the non-JPEG safety net, so one stray
    // PNG or WebP can never put a black screen on the wall.
    const pipeline = sharp(input, { failOn: "none" }).rotate();

    const out = wantsBackdrop
      ? await pipeline
          .resize(BACKDROP_W, BACKDROP_H, { fit: "cover" })
          .blur(2)
          .jpeg({ quality: 70 })
          .toBuffer()
      : await pipeline
          .resize(SCREEN_W, SCREEN_H, { fit: "inside", withoutEnlargement: true })
          .jpeg({ quality: 82, progressive: true, mozjpeg: true })
          .toBuffer();

    return new Response(new Uint8Array(out), {
      headers: {
        "Content-Type": "image/jpeg",
        "Content-Length": String(out.length),
        "Cache-Control": IMMUTABLE,
      },
    });
  } catch (err) {
    // HEIC lands here unless the build's libvips has libheif. Samsung phones save
    // JPEG, so this is a guard rather than a supported path.
    console.error(`[media] ${id} decode failed:`, err);
    return new Response("Unsupported image", { status: 415 });
  }
}
