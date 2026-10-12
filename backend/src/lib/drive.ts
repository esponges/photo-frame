import { JWT } from "google-auth-library";
import { env } from "./env";
import { fixtureFile, fixtureItems, fixtureMode } from "./fixtures";
import type { Item, ItemKind } from "./types";

const DRIVE = "https://www.googleapis.com/drive/v3";
const SCOPES = ["https://www.googleapis.com/auth/drive.readonly"];

const FIELDS = [
  "nextPageToken",
  "files(id,name,description,mimeType,modifiedTime,md5Checksum,size",
  "imageMediaMetadata(width,height,rotation,time),videoMediaMetadata(width,height,durationMillis))",
].join(",");

interface DriveFile {
  id: string;
  name: string;
  description?: string;
  mimeType: string;
  modifiedTime: string;
  md5Checksum?: string;
  size?: string;
  imageMediaMetadata?: {
    width?: number;
    height?: number;
    rotation?: number;
    time?: string;
  };
  videoMediaMetadata?: { width?: number; height?: number; durationMillis?: string };
}

let cachedJwt: JWT | null = null;

function client(): JWT {
  if (!cachedJwt) {
    cachedJwt = new JWT({
      email: env.serviceAccountEmail,
      key: env.privateKey,
      scopes: SCOPES,
    });
  }
  return cachedJwt;
}

async function authHeader(): Promise<string> {
  // The JWT client caches and refreshes the token itself.
  const token = await client().getAccessToken();
  if (!token.token) throw new Error("Drive auth failed: no access token returned");
  return `Bearer ${token.token}`;
}

async function driveGet(path: string, params: Record<string, string>) {
  const url = new URL(`${DRIVE}${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url, { headers: { Authorization: await authHeader() } });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Drive ${path} failed: ${res.status} ${body.slice(0, 300)}`);
  }
  return res;
}

async function listAll(q: string): Promise<DriveFile[]> {
  const out: DriveFile[] = [];
  let pageToken: string | undefined;
  do {
    const res = await driveGet("/files", {
      q,
      fields: FIELDS,
      pageSize: "1000",
      ...(pageToken ? { pageToken } : {}),
    });
    const json = (await res.json()) as { files?: DriveFile[]; nextPageToken?: string };
    out.push(...(json.files ?? []));
    pageToken = json.nextPageToken;
  } while (pageToken);
  return out;
}

const parentClause = (ids: string[]) =>
  ids.map((id) => `'${id}' in parents`).join(" or ");

/**
 * The Drive listing is the expensive call (two or more round-trips), and the
 * manifest route runs it on every poll even when answering 304. A short cache
 * keeps extra pollers (a second frame, an uptime monitor) from multiplying it.
 *
 * Module scope only lives as long as one warm serverless instance, so this is
 * best-effort on Vercel: it bounds Drive calls per instance, not globally.
 */
const LIST_TTL_MS = 60_000;
let listCache: { at: number; items: Item[] } | null = null;
let listInflight: Promise<Item[]> | null = null;

/** Drop the cached listing, e.g. when the owner asks for a resync. */
export function invalidateMediaCache(): void {
  listCache = null;
}

/**
 * Lists photos and videos in the configured folder, recursing one level into
 * subfolders so the library can be organised by trip or year.
 */
export async function listMedia(): Promise<Item[]> {
  if (fixtureMode()) return fixtureItems();
  if (listCache && Date.now() - listCache.at < LIST_TTL_MS) return listCache.items;

  // Share one in-flight request between concurrent callers. Failures are never
  // cached, so a transient Drive error does not stick for a minute.
  listInflight ??= fetchMediaList()
    .then((items) => {
      listCache = { at: Date.now(), items };
      return items;
    })
    .finally(() => {
      listInflight = null;
    });
  return listInflight;
}

async function fetchMediaList(): Promise<Item[]> {
  const root = env.folderId;

  const folders = await listAll(
    `'${root}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
  );
  const parents = [root, ...folders.map((f) => f.id)];

  const files = await listAll(
    `(${parentClause(parents)}) and trashed = false and (mimeType contains 'image/' or mimeType contains 'video/')`,
  );

  return files.map(toItem).filter((i): i is Item => i !== null);
}

function toItem(f: DriveFile): Item | null {
  // md5Checksum is the cache key for the resized output. Google-native files
  // (Docs, Sheets) have none, but they also aren't images, so this is just a guard.
  if (!f.md5Checksum) return null;

  const kind: ItemKind = f.mimeType.startsWith("video/") ? "video" : "photo";
  const meta = kind === "video" ? f.videoMediaMetadata : f.imageMediaMetadata;

  let w = meta?.width ?? 0;
  let h = meta?.height ?? 0;
  // Drive reports pre-rotation pixel dimensions. Its `rotation` field counts
  // clockwise quarter-turns (0-3), not degrees, and an odd count swaps them.
  const rotation = f.imageMediaMetadata?.rotation ?? 0;
  if (rotation % 2 === 1) [w, h] = [h, w];

  return {
    id: f.id,
    md5: f.md5Checksum,
    kind,
    w,
    h,
    caption: (f.description ?? "").trim(),
    takenAt: normalizeExifTime(f.imageMediaMetadata?.time) ?? f.modifiedTime ?? null,
    ...(kind === "video" && f.videoMediaMetadata?.durationMillis
      ? { durationMs: Number(f.videoMediaMetadata.durationMillis) }
      : {}),
  };
}

/** Drive returns EXIF time as "2019:03:04 18:12:33", which Date cannot parse. */
function normalizeExifTime(t?: string): string | null {
  if (!t) return null;
  const m = /^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}:\d{2}:\d{2})/.exec(t);
  if (!m) return null;
  const iso = `${m[1]}-${m[2]}-${m[3]}T${m[4]}`;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** Raw bytes of a Drive file. `range` is forwarded for video seeking. */
export async function fetchFile(id: string, range?: string | null): Promise<Response> {
  if (fixtureMode()) return fixtureFile(id, range);
  const url = new URL(`${DRIVE}/files/${id}`);
  url.searchParams.set("alt", "media");
  const headers: Record<string, string> = { Authorization: await authHeader() };
  if (range) headers.Range = range;
  return fetch(url, { headers });
}

const md5Cache = new Map<string, { md5: string | null; at: number }>();

/** Content hash of one file, or null when Drive has none (Google-native files). */
export async function fileMd5(id: string): Promise<string | null> {
  if (fixtureMode()) return `fixture-${id}`;
  const hit = md5Cache.get(id);
  if (hit && Date.now() - hit.at < 10 * 60_000) return hit.md5;
  const res = await driveGet(`/files/${id}`, { fields: "md5Checksum" });
  const md5 = ((await res.json()) as { md5Checksum?: string }).md5Checksum ?? null;
  md5Cache.set(id, { md5, at: Date.now() });
  return md5;
}
