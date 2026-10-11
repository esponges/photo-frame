import { isFrame, unauthorized } from "@/lib/auth";
import { store } from "@/lib/store";

export const dynamic = "force-dynamic";

/** Polled by the tablet every ~10s. Draining here means each command fires once. */
export async function GET(req: Request) {
  if (!isFrame(req)) return unauthorized();
  const [commands, settings] = await Promise.all([
    store().takeCommands(),
    store().getSettings(),
  ]);
  return Response.json(
    { commands, settings },
    { headers: { "Cache-Control": "no-store" } },
  );
}
