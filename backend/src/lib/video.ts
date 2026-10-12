import { spawn } from "node:child_process";
import { constants, createReadStream, createWriteStream } from "node:fs";
import { access, chmod, copyFile, mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import ffmpegStatic from "ffmpeg-static";
import { fetchFile } from "./drive";
import { rawRedisClient } from "./store";

/**
 * Makes videos the tablet can actually play.
 *
 * Phones record HEVC (often 10-bit HDR) by default. The Nexus 7 has no hardware HEVC
 * decoder and its software one cannot keep up with 1080p, so such a clip prepares and
 * then sits on black. Clips that are already plain 8-bit H.264 pass straight through;
 * anything else is converted once to 720p baseline H.264 and cached.
 *
 * Conversion is slow on a serverless CPU (~30s for a 10s clip), and each instance has
 * its own /tmp, so the converted file is also kept in Redis, in chunks (a command is
 * limited to 1MB), and a lock keeps concurrent instances from all converting the same
 * clip. /tmp is the fast first level. The device waits generously for a video to start
 * and warms the next one ahead of time.
 */
const CACHE_DIR = path.join(os.tmpdir(), "frame-video");

/** Largest picture the tablet decodes comfortably. */
const MAX_LONG_SIDE = 1920;
const MAX_SHORT_SIDE = 1080;

export interface PlayableVideo {
  path: string;
  size: number;
}

const inflight = new Map<string, Promise<PlayableVideo>>();

export function playableVideo(id: string, md5: string): Promise<PlayableVideo> {
  let job = inflight.get(md5);
  if (!job) {
    job = prepare(id, md5).finally(() => inflight.delete(md5));
    inflight.set(md5, job);
  }
  return job;
}

async function prepare(id: string, md5: string): Promise<PlayableVideo> {
  const done = path.join(CACHE_DIR, `${md5}.mp4`);
  const hit = await stat(done).catch(() => null);
  if (hit) return { path: done, size: hit.size };

  await mkdir(CACHE_DIR, { recursive: true });

  // Claim the conversion first. If another instance holds it, wait for its result
  // instead of converting the same clip a second time.
  const lock = await takeLock(md5);
  const shared = await fromRedis(md5, done, !lock);
  if (shared) {
    if (lock) await rawRedisClient()?.del(lockKey(md5)).catch(() => {});
    return shared;
  }

  const src = path.join(CACHE_DIR, `${md5}.src`);
  const part = path.join(CACHE_DIR, `${md5}.part.mp4`);
  try {
    const res = await fetchFile(id);
    if (!res.ok || !res.body) throw new Error(`Drive fetch failed: ${res.status}`);
    await pipeline(Readable.fromWeb(res.body as never), createWriteStream(src));

    const bin = await ffmpegBinary();
    const info = await probe(bin, src);
    if (info.tabletSafe) {
      await rename(src, done);
    } else {
      console.log(`[video] ${id} is ${info.summary}; converting for the tablet`);
      const started = Date.now();
      await convert(bin, src, part, info.hdr);
      await rename(part, done);
      console.log(`[video] ${id} converted in ${Date.now() - started}ms`);
    }
    const out = await stat(done);
    await toRedis(md5, done).catch((err) => console.error("[video] could not share the file:", err));
    return { path: done, size: out.size };
  } finally {
    await Promise.all([rm(src, { force: true }), rm(part, { force: true })]);
    if (lock) await rawRedisClient()?.del(lockKey(md5)).catch(() => {});
  }
}

// ------------------------------------------------------------------ shared cache

const CHUNK_BYTES = 600_000; // ~800KB as base64, under Upstash's 1MB request limit
const TTL_SECONDS = 30 * 24 * 3600;
const metaKey = (md5: string) => `frame:video:${md5}:meta`;
const chunkKey = (md5: string, i: number) => `frame:video:${md5}:${i}`;
const lockKey = (md5: string) => `frame:video:${md5}:lock`;

/** Claims the right to convert; false means another instance holds it. */
async function takeLock(md5: string): Promise<boolean> {
  const redis = rawRedisClient();
  if (!redis) return true;
  try {
    return (await redis.set(lockKey(md5), "1", { nx: true, ex: 120 })) === "OK";
  } catch {
    return true; // Redis trouble should not stop playback; just convert.
  }
}

/** Reads a converted file back from Redis; with `wait`, while another instance makes it. */
async function fromRedis(md5: string, dest: string, wait: boolean): Promise<PlayableVideo | null> {
  const redis = rawRedisClient();
  if (!redis) return null;
  try {
    const deadline = Date.now() + 55_000;
    for (;;) {
      const raw = await redis.get<string>(metaKey(md5));
      if (raw) {
        const meta = JSON.parse(raw) as { size: number; chunks: number };
        const keys = Array.from({ length: meta.chunks }, (_, i) => chunkKey(md5, i));
        const parts = (await redis.mget<string[]>(...keys)).map((b64) => Buffer.from(b64 ?? "", "base64"));
        const bytes = Buffer.concat(parts);
        if (bytes.length !== meta.size) throw new Error("shared copy is incomplete");
        const tmp = `${dest}.dl`;
        await writeFile(tmp, bytes);
        await rename(tmp, dest);
        return { path: dest, size: meta.size };
      }
      // No copy yet. Wait only while another instance is converting.
      if (!wait || !(await redis.exists(lockKey(md5))) || Date.now() > deadline) return null;
      await new Promise((r) => setTimeout(r, 1_500));
    }
  } catch (err) {
    console.error("[video] shared cache read failed:", err);
    return null;
  }
}

async function toRedis(md5: string, file: string): Promise<void> {
  const redis = rawRedisClient();
  if (!redis) return;
  const bytes = await readFile(file);
  const chunks = Math.ceil(bytes.length / CHUNK_BYTES);
  for (let i = 0; i < chunks; i++) {
    const slice = bytes.subarray(i * CHUNK_BYTES, (i + 1) * CHUNK_BYTES);
    await redis.set(chunkKey(md5, i), slice.toString("base64"), { ex: TTL_SECONDS });
  }
  // The meta key goes last, so its presence means the copy is complete.
  await redis.set(metaKey(md5), JSON.stringify({ size: bytes.length, chunks }), { ex: TTL_SECONDS });
}

// ------------------------------------------------------------------ ffmpeg

let binary: Promise<string> | null = null;

/** The bundled binary, made executable (a deployed bundle may lose the mode bit). */
function ffmpegBinary(): Promise<string> {
  binary ??= (async () => {
    if (!ffmpegStatic) throw new Error("ffmpeg-static has no binary for this platform");
    try {
      await access(ffmpegStatic, constants.X_OK);
      return ffmpegStatic;
    } catch {
      const copy = path.join(os.tmpdir(), "ffmpeg");
      await copyFile(ffmpegStatic, copy);
      await chmod(copy, 0o755);
      return copy;
    }
  })();
  return binary;
}

function run(bin: string, args: string[]): Promise<{ code: number; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (d: Buffer) => {
      stderr = (stderr + d.toString()).slice(-16_000);
    });
    child.on("error", reject);
    child.on("close", (code) => resolve({ code: code ?? 1, stderr }));
  });
}

interface Probe {
  tabletSafe: boolean;
  hdr: boolean;
  summary: string;
}

/** `ffmpeg -i` with no output exits non-zero but prints the stream description. */
async function probe(bin: string, file: string): Promise<Probe> {
  const { stderr } = await run(bin, ["-hide_banner", "-i", file]);
  const line = stderr.split("\n").find((l) => l.includes("Video:")) ?? "";
  const codec = /Video: (\w+)/.exec(line)?.[1] ?? "unknown";
  const pixFmt = /\b(yuv[0-9a-z]+|nv12|gray[0-9a-z]*|p010[a-z]*)\b/.exec(line)?.[1] ?? "unknown";
  const dims = /\b(\d{2,5})x(\d{2,5})\b/.exec(line);
  const w = dims ? Number(dims[1]) : 0;
  const h = dims ? Number(dims[2]) : 0;
  const hdr = /arib-std-b67|smpte2084/.test(line);
  const tabletSafe =
    codec === "h264" &&
    pixFmt === "yuv420p" &&
    w > 0 &&
    Math.max(w, h) <= MAX_LONG_SIDE &&
    Math.min(w, h) <= MAX_SHORT_SIDE;
  return { tabletSafe, hdr, summary: `${codec} ${pixFmt} ${w}x${h}${hdr ? " HDR" : ""}` };
}

const FIT = "scale=720:1280:force_original_aspect_ratio=decrease:force_divisible_by=2";
// HDR (HLG/PQ) tone-mapped to SDR; plain conversion would look washed out.
const TONEMAP =
  "zscale=t=linear:npl=100,format=gbrpf32le,zscale=p=bt709,tonemap=tonemap=hable:desat=0," +
  `zscale=t=bt709:m=bt709:r=tv,format=yuv420p,${FIT}`;
const PLAIN = `${FIT},format=yuv420p`;

async function convert(bin: string, src: string, dst: string, hdr: boolean): Promise<void> {
  const attempt = (vf: string) =>
    run(bin, [
      "-y", "-hide_banner", "-loglevel", "error", "-i", src,
      // Frames are muted on the device, so the audio track is dead weight. ffmpeg also
      // applies the phone's rotation flag, so a portrait clip comes out upright.
      "-an", "-vf", vf,
      "-c:v", "libx264", "-profile:v", "baseline", "-level", "3.1",
      "-preset", "veryfast", "-crf", "27", "-movflags", "+faststart",
      dst,
    ]);

  let result = await attempt(hdr ? TONEMAP : PLAIN);
  if (result.code !== 0 && hdr) {
    // A build without libzimg has no zscale; fall back rather than fail the clip.
    console.warn("[video] tone-mapped conversion failed, retrying plain:", result.stderr.slice(-300));
    result = await attempt(PLAIN);
  }
  if (result.code !== 0) throw new Error(`ffmpeg failed: ${result.stderr.slice(-300)}`);
}

// ------------------------------------------------------------------ serving

/** Serves a file with HTTP Range support, which the device's player relies on. */
export function serveFile(file: PlayableVideo, range: string | null): Response {
  const base = { "Content-Type": "video/mp4", "Accept-Ranges": "bytes", "Cache-Control": "no-store" };
  const m = range ? /^bytes=(\d*)-(\d*)$/.exec(range) : null;
  if (!m || (m[1] === "" && m[2] === "")) {
    return new Response(stream(file.path), {
      headers: { ...base, "Content-Length": String(file.size) },
    });
  }
  const start = m[1] === "" ? Math.max(0, file.size - Number(m[2])) : Number(m[1]);
  const end = m[1] !== "" && m[2] !== "" ? Math.min(Number(m[2]), file.size - 1) : file.size - 1;
  if (start > end || start >= file.size) {
    return new Response(null, { status: 416, headers: { ...base, "Content-Range": `bytes */${file.size}` } });
  }
  return new Response(stream(file.path, start, end), {
    status: 206,
    headers: {
      ...base,
      "Content-Length": String(end - start + 1),
      "Content-Range": `bytes ${start}-${end}/${file.size}`,
    },
  });
}

function stream(file: string, start?: number, end?: number): ReadableStream {
  return Readable.toWeb(createReadStream(file, { start, end })) as unknown as ReadableStream;
}
