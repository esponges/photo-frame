import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import type { Item } from "./types";

/**
 * Fixture mode (FIXTURE_MODE=1) stands in for Drive so the frame can be verified
 * on the device before any Google setup. Photos are generated on demand; videos
 * come from `.fixtures/*.mp4` (see scripts/make-fixture-videos.sh) and are listed
 * only if present.
 */
export const fixtureMode = () => process.env.FIXTURE_MODE === "1";

const VIDEO_DIR = path.join(process.cwd(), ".fixtures");

interface PhotoSpec {
  id: string;
  /** Pixel size once upright; what the device should end up showing. */
  w: number;
  h: number;
  label: string;
  hue: number;
  caption: string;
  takenAt: string | null;
  /** Store the pixels rotated and tag EXIF orientation 6, like a phone held upright. */
  exifRotated?: boolean;
}

const PHOTOS: PhotoSpec[] = [
  {
    id: "fx-portrait-exif",
    w: 3000,
    h: 4000,
    label: "PORTRAIT (EXIF 6)",
    hue: 210,
    caption: "Portrait stored sideways with EXIF orientation 6",
    takenAt: "2019-03-04T18:12:33.000Z",
    exifRotated: true,
  },
  {
    id: "fx-landscape",
    w: 4000,
    h: 3000,
    label: "LANDSCAPE",
    hue: 20,
    caption: "Landscape, letterboxed over the blurred backdrop",
    takenAt: "2021-07-19T09:30:00.000Z",
  },
  {
    id: "fx-square-nocaption",
    w: 2000,
    h: 2000,
    label: "SQUARE, NO CAPTION",
    hue: 130,
    caption: "",
    takenAt: "2023-12-24T20:05:00.000Z",
  },
  {
    id: "fx-panorama",
    w: 6000,
    h: 1500,
    label: "PANORAMA",
    hue: 290,
    caption: "Very wide, to stress the letterbox",
    takenAt: null,
  },
];

/** Upright artwork with an arrow and corner marks, so wrong rotation is obvious. */
function svg(spec: PhotoSpec): string {
  const { w, h, label, hue } = spec;
  const m = Math.min(w, h);
  const font = Math.round(m / 12);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="hsl(${hue},70%,55%)"/>
    <stop offset="1" stop-color="hsl(${(hue + 60) % 360},70%,25%)"/>
  </linearGradient></defs>
  <rect width="100%" height="100%" fill="url(#g)"/>
  <polygon points="${w / 2},${h * 0.12} ${w / 2 - m * 0.18},${h * 0.12 + m * 0.3} ${w / 2 + m * 0.18},${h * 0.12 + m * 0.3}" fill="white"/>
  <text x="50%" y="55%" font-size="${font}" font-family="Helvetica, Arial, sans-serif" font-weight="bold" fill="white" text-anchor="middle">${label}</text>
  <text x="50%" y="${55 + 8}%" font-size="${Math.round(font / 2)}" font-family="Helvetica, Arial, sans-serif" fill="white" text-anchor="middle">${w}x${h}</text>
  <rect x="0" y="0" width="${m * 0.1}" height="${m * 0.1}" fill="red"/>
  <rect x="${w - m * 0.1}" y="${h - m * 0.1}" width="${m * 0.1}" height="${m * 0.1}" fill="blue"/>
</svg>`;
}

const photoCache = new Map<string, Buffer>();

async function photoBytes(spec: PhotoSpec): Promise<Buffer> {
  const hit = photoCache.get(spec.id);
  if (hit) return hit;
  let img = sharp(Buffer.from(svg(spec)));
  if (spec.exifRotated) {
    // Rotate the pixels 90deg counter-clockwise, then tag orientation 6 ("rotate 90
    // clockwise to display"), so a correct pipeline restores the upright image.
    const sideways = await img.rotate(270).png().toBuffer();
    img = sharp(sideways).withMetadata({ orientation: 6 });
  }
  const out = await img.jpeg({ quality: 88 }).toBuffer();
  photoCache.set(spec.id, out);
  return out;
}

async function videoFiles(): Promise<string[]> {
  try {
    return (await readdir(VIDEO_DIR)).filter((f) => f.endsWith(".mp4")).sort();
  } catch {
    return [];
  }
}

const videoId = (file: string) => `fx-video-${file.replace(/\.mp4$/, "")}`;

export async function fixtureItems(): Promise<Item[]> {
  const photos: Item[] = PHOTOS.map((p) => ({
    id: p.id,
    md5: `fixture-${p.id}`,
    kind: "photo",
    w: p.w,
    h: p.h,
    caption: p.caption,
    takenAt: p.takenAt,
  }));
  const videos: Item[] = (await videoFiles()).map((f) => ({
    id: videoId(f),
    md5: `fixture-${videoId(f)}`,
    kind: "video",
    w: 1280,
    h: 720,
    caption: `Fixture clip ${f}`,
    takenAt: null,
    durationMs: 5000,
  }));
  return [...photos, ...videos];
}

/** Mirrors `fetchFile`: full body, or a 206 slice when `range` is given. */
export async function fixtureFile(id: string, range?: string | null): Promise<Response> {
  const photo = PHOTOS.find((p) => p.id === id);
  if (photo) {
    return new Response(new Uint8Array(await photoBytes(photo)), {
      headers: { "content-type": "image/jpeg" },
    });
  }

  const file = (await videoFiles()).find((f) => videoId(f) === id);
  if (!file) return new Response("Not found", { status: 404 });

  const full = path.join(VIDEO_DIR, file);
  const size = (await stat(full)).size;
  const bytes = await readFile(full);
  const m = range ? /^bytes=(\d*)-(\d*)$/.exec(range) : null;
  if (!m || (m[1] === "" && m[2] === "")) {
    return new Response(new Uint8Array(bytes), {
      headers: { "content-type": "video/mp4", "content-length": String(size) },
    });
  }
  const start = m[1] === "" ? size - Number(m[2]) : Number(m[1]);
  const end = m[1] !== "" && m[2] !== "" ? Math.min(Number(m[2]), size - 1) : size - 1;
  if (start > end || start >= size) {
    return new Response(null, { status: 416, headers: { "content-range": `bytes */${size}` } });
  }
  return new Response(new Uint8Array(bytes.subarray(start, end + 1)), {
    status: 206,
    headers: {
      "content-type": "video/mp4",
      "content-length": String(end - start + 1),
      "content-range": `bytes ${start}-${end}/${size}`,
    },
  });
}
