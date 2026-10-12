import { isAdmin, isFrame, isFrameToken, unauthorized } from "@/lib/auth";
import { fetchFile, fileMd5 } from "@/lib/drive";
import { playableVideo, serveFile } from "@/lib/video";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// The first request for a clip that needs converting waits for the conversion.
export const maxDuration = 60;

/**
 * Serves a video the tablet can play, with Range support. Plain H.264 passes through;
 * HEVC / 10-bit / oversized clips are converted once and cached (see lib/video.ts).
 * Never cached by the browser or CDN, and simply skipped when the frame is offline.
 *
 * If conversion is impossible (no ffmpeg, no checksum) it falls back to proxying the
 * original bytes, which the device's progress check will skip if it cannot play them.
 */
export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  // Android's VideoView cannot attach an Authorization header on API 25, so this
  // route (and only this route) also accepts the token as a query parameter.
  const queryToken = new URL(req.url).searchParams.get("token");
  const viaQuery = queryToken !== null && isFrameToken(queryToken);
  if (!isFrame(req) && !viaQuery && !(await isAdmin())) return unauthorized();

  const { id } = await ctx.params;
  const range = req.headers.get("range");

  try {
    const md5 = await fileMd5(id);
    if (md5) return serveFile(await playableVideo(id, md5), range);
  } catch (err) {
    console.error(`[video] ${id} conversion failed, proxying the original:`, err);
  }

  const upstream = await fetchFile(id, range);

  if (!upstream.ok && upstream.status !== 206) {
    return new Response(`Drive fetch failed: ${upstream.status}`, { status: 502 });
  }

  const headers = new Headers({
    "Accept-Ranges": "bytes",
    "Cache-Control": "no-store",
  });
  for (const h of ["content-type", "content-length", "content-range"]) {
    const v = upstream.headers.get(h);
    if (v) headers.set(h, v);
  }

  return new Response(upstream.body, { status: upstream.status, headers });
}
