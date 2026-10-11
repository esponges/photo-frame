import { isAdmin, isFrame, isFrameToken, unauthorized } from "@/lib/auth";
import { fetchFile } from "@/lib/drive";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Range-proxies a video straight from Drive. Deliberately never cached: videos are
 * streamed on demand and simply skipped when the frame is offline.
 *
 * No transcoding — the Nexus 7's Adreno 320 has no HEVC decoder, so H.265 clips
 * will fail to start and the device skips them after a short timeout.
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
