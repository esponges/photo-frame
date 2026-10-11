export type ItemKind = "photo" | "video";

/** One playable item, as the tablet sees it. */
export interface Item {
  id: string;
  /** Content hash; part of the media URL so cached bytes never go stale. */
  md5: string;
  kind: ItemKind;
  w: number;
  h: number;
  /** From the Drive file's Description field. Empty when uncaptioned. */
  caption: string;
  /** EXIF capture time, ISO 8601, or null when Drive has no metadata for it. */
  takenAt: string | null;
  /** Videos only. */
  durationMs?: number;
}

export interface Settings {
  /** Seconds a photo stays on screen. */
  intervalSec: number;
  /** Crossfade length in milliseconds. */
  transitionMs: number;
  transition: "crossfade" | "kenburns";
  /** Local wall-clock hours, 0-23. Screen sleeps outside this window. */
  onHour: number;
  offHour: number;
  /** 0-255, applied via root on the device. */
  brightness: number;
  showCaption: boolean;
  showDate: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  intervalSec: 60,
  transitionMs: 1500,
  transition: "crossfade",
  onHour: 7,
  offHour: 23,
  brightness: 160,
  showCaption: true,
  showDate: true,
};

export type Command =
  | { type: "skip" }
  | { type: "resync" }
  | { type: "reload" };

export interface Heartbeat {
  itemId: string;
  battery: number;
  appVersion: string;
  at: string;
}
