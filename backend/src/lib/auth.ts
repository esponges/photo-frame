import { cookies } from "next/headers";
import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "./env";

const COOKIE = "frame_admin";

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  // timingSafeEqual throws on length mismatch, so compare lengths first.
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/** Constant-time check of a bare token value. */
export function isFrameToken(token: string): boolean {
  return safeEqual(token, env.frameToken);
}

/** True when the request carries the device's bearer token. */
export function isFrame(req: Request): boolean {
  const header = req.headers.get("authorization") ?? "";
  const prefix = "Bearer ";
  if (!header.startsWith(prefix)) return false;
  return safeEqual(header.slice(prefix.length), env.frameToken);
}

export function unauthorized(): Response {
  return new Response("Unauthorized", { status: 401 });
}

/** Signed value, so the cookie cannot be forged without ADMIN_PASSWORD. */
function sessionValue(): string {
  return createHmac("sha256", env.adminPassword).update("admin").digest("hex");
}

export async function isAdmin(): Promise<boolean> {
  const c = (await cookies()).get(COOKIE)?.value;
  return !!c && safeEqual(c, sessionValue());
}

export async function login(password: string): Promise<boolean> {
  if (!safeEqual(password, env.adminPassword)) return false;
  (await cookies()).set(COOKIE, sessionValue(), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  return true;
}

export async function logout(): Promise<void> {
  (await cookies()).delete(COOKIE);
}
