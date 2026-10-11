import { isFrame, unauthorized } from "@/lib/auth";
import { store } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!isFrame(req)) return unauthorized();
  const body = (await req.json()) as {
    itemId?: string;
    battery?: number;
    appVersion?: string;
  };
  await store().setHeartbeat({
    itemId: body.itemId ?? "",
    battery: body.battery ?? -1,
    appVersion: body.appVersion ?? "?",
    at: new Date().toISOString(),
  });
  return Response.json({ ok: true });
}
