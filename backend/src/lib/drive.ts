import { JWT } from "google-auth-library";
import { env } from "./env";
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
 * Lists photos and videos in the configured folder, recursing one level into
 * subfolders so the library can be organised by trip or year.
 */
export async function listMedia(): Promise<Item[]> {
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
  // Drive reports pre-rotation pixel dimensions; a 90/270 rotation swaps them.
  const rotation = f.imageMediaMetadata?.rotation ?? 0;
  if (rotation === 90 || rotation === 270) [w, h] = [h, w];

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
  const url = new URL(`${DRIVE}/files/${id}`);
  url.searchParams.set("alt", "media");
  const headers: Record<string, string> = { Authorization: await authHeader() };
  if (range) headers.Range = range;
  return fetch(url, { headers });
}
