import { createHash } from "node:crypto";
import { isFrame, unauthorized } from "@/lib/auth";
import { listMedia } from "@/lib/drive";
import { store } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (!isFrame(req)) return unauthorized();

  let items, hidden, settings;
  try {
    [items, hidden, settings] = await Promise.all([
      listMedia(),
      store().getHidden(),
      store().getSettings(),
    ]);
  } catch (err) {
    // Surface the cause plainly: the device logs this verbatim, and a bad
    // service-account key or an unshared folder are the usual culprits.
    const message = err instanceof Error ? err.message : String(err);
    console.error("[manifest] upstream failure:", err);
    return Response.json({ error: message }, { status: 502 });
  }

  const hiddenSet = new Set(hidden);
  const visible = items
    .filter((i) => !hiddenSet.has(i.id))
    .sort((a, b) => a.id.localeCompare(b.id));

  const body = {
    // Changes whenever the set or any caption changes, so the device knows to resync.
    version: createHash("sha1")
      .update(visible.map((i) => `${i.id}:${i.md5}:${i.caption}`).join("|"))
      .digest("hex")
      .slice(0, 16),
    settings,
    items: visible,
  };

  const etag = `"${body.version}"`;
  if (req.headers.get("if-none-match") === etag) {
    return new Response(null, { status: 304, headers: { ETag: etag } });
  }

  return Response.json(body, {
    headers: { ETag: etag, "Cache-Control": "private, max-age=0, must-revalidate" },
  });
}
