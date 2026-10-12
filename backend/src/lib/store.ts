import { Redis } from "@upstash/redis";
import { DEFAULT_SETTINGS, type Command, type Heartbeat, type Settings } from "./types";

/**
 * State is deliberately tiny: settings, the hidden-photo set, a command queue and
 * the last heartbeat. The *playlist is not here* — the device owns its own shuffle
 * and cursor so playback keeps working with no network at all.
 *
 * Falls back to an in-memory store when Upstash env vars are absent, so
 * `pnpm dev` works before any infrastructure exists. That fallback resets on every
 * server restart and is per-instance, so it is for local dev only.
 */
interface Backend {
  getSettings(): Promise<Settings>;
  setSettings(patch: Partial<Settings>): Promise<Settings>;
  getHidden(): Promise<string[]>;
  hide(id: string): Promise<void>;
  unhide(id: string): Promise<void>;
  pushCommand(c: Command): Promise<void>;
  /** Drains the queue: commands are delivered once. */
  takeCommands(): Promise<Command[]>;
  setHeartbeat(h: Heartbeat): Promise<void>;
  getHeartbeat(): Promise<Heartbeat | null>;
}

const K = {
  settings: "frame:settings",
  hidden: "frame:hidden",
  commands: "frame:commands",
  heartbeat: "frame:heartbeat",
};

function redisBackend(redis: Redis): Backend {
  return {
    async getSettings() {
      const raw = await redis.get<Partial<Settings>>(K.settings);
      return { ...DEFAULT_SETTINGS, ...(raw ?? {}) };
    },
    async setSettings(patch) {
      const next = { ...(await this.getSettings()), ...patch };
      await redis.set(K.settings, next);
      return next;
    },
    async getHidden() {
      return (await redis.smembers(K.hidden)) ?? [];
    },
    async hide(id) {
      await redis.sadd(K.hidden, id);
    },
    async unhide(id) {
      await redis.srem(K.hidden, id);
    },
    async pushCommand(c) {
      await redis.rpush(K.commands, JSON.stringify(c));
    },
    async takeCommands() {
      // Read and clear atomically enough for a single-device frame.
      const raw = await redis.lrange<string>(K.commands, 0, -1);
      if (raw.length) await redis.del(K.commands);
      return raw.map((r) => (typeof r === "string" ? JSON.parse(r) : r) as Command);
    },
    async setHeartbeat(h) {
      await redis.set(K.heartbeat, h, { ex: 3600 });
    },
    async getHeartbeat() {
      return (await redis.get<Heartbeat>(K.heartbeat)) ?? null;
    },
  };
}

function memoryBackend(): Backend {
  // FIXTURE_INTERVAL_SEC shortens the photo dwell so a full cycle fits in a minute
  // when testing on the tablet. It only affects this dev-only store.
  const quick = Number(process.env.FIXTURE_INTERVAL_SEC);
  let settings: Settings = {
    ...DEFAULT_SETTINGS,
    ...(quick > 0 ? { intervalSec: quick, transitionMs: 600 } : {}),
  };
  const hidden = new Set<string>();
  let commands: Command[] = [];
  let heartbeat: Heartbeat | null = null;

  return {
    async getSettings() {
      return settings;
    },
    async setSettings(patch) {
      settings = { ...settings, ...patch };
      return settings;
    },
    async getHidden() {
      return [...hidden];
    },
    async hide(id) {
      hidden.add(id);
    },
    async unhide(id) {
      hidden.delete(id);
    },
    async pushCommand(c) {
      commands.push(c);
    },
    async takeCommands() {
      const out = commands;
      commands = [];
      return out;
    },
    async setHeartbeat(h) {
      heartbeat = h;
    },
    async getHeartbeat() {
      return heartbeat;
    },
  };
}

let backend: Backend | null = null;

export function store(): Backend {
  if (backend) return backend;
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  if (url && token) {
    backend = redisBackend(new Redis({ url, token }));
  } else {
    console.warn("[store] No Upstash env vars; using in-memory store (dev only).");
    backend = memoryBackend();
  }
  return backend;
}

/**
 * A raw Redis client for blob-ish values (converted videos), or null in the in-memory
 * dev setup. Deserialisation is off so a base64 string is never mistaken for JSON.
 */
let rawRedis: Redis | null | undefined;
export function rawRedisClient(): Redis | null {
  if (rawRedis === undefined) {
    const url = process.env.KV_REST_API_URL;
    const token = process.env.KV_REST_API_TOKEN;
    rawRedis = url && token ? new Redis({ url, token, automaticDeserialization: false }) : null;
  }
  return rawRedis;
}
