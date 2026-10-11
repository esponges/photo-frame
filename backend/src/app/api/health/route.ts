// Unauthenticated on purpose: this is the endpoint used to verify that the
// tablet's 2015-era CA trust store can complete a TLS handshake with Vercel.
export const dynamic = "force-dynamic";

export function GET() {
  return Response.json({ ok: true, at: new Date().toISOString() });
}
