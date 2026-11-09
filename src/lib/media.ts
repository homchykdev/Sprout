import { useEffect, useState } from "react";
import { convertVideo, probeVideo, VIDEO_MAX_BYTES, VIDEO_MAX_SEC } from "./ffmpeg";
import { convertVideoLocal, webCodecsAvailable, type DeviceOpts } from "./transcode";
import { logWarn } from "./logger";
import type { PoseSpec, PoseStrain, PoseView } from "./pose";
import {
  pickTranscodePath,
  targetVideoBitrate,
  worthTranscoding,
  type BitrateLevel,
  type DeviceCodec,
  type DeviceFps,
  type TranscodeMode,
} from "./video-rules";
import { isHeicFile } from "./video-rules";

/** User photos/videos live in IndexedDB (too large for the main store). */
export type Album = "progress" | "goal" | "exercise" | "avatar";
export interface MediaItem {
  id: string;
  album: Album;
  kind: "image" | "video";
  mime: string;
  date: string; // yyyy-MM-dd
  title: string;
  note: string;
  createdAt: number;
  blob?: Blob | undefined;
  /** Link-based item (YouTube, site, file URL) — loaded from the internet on view. */
  url?: string | undefined;
  clips?: { start: number; end: number }[] | undefined;
  /** Manual group (several angles of one day): items share a groupId. */
  groupId?: string | undefined;
  /** The group's preview photo. */
  cover?: boolean | undefined;
  /** Guided shot metadata: where the body faces and whether muscles are tense. */
  pose?: PoseView | undefined;
  strain?: PoseStrain | undefined;
  /** Manual display order in user-ordered albums (e.g. "goal"). */
  order?: number | undefined;
}

const DB = "pulse-media",
  STORE = "items";
let dbp: Promise<IDBDatabase> | null = null;
function db() {
  return (dbp ??= new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE, { keyPath: "id" });
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  }));
}
function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>) {
  return db().then(
    (d) =>
      new Promise<T>((res, rej) => {
        const q = fn(d.transaction(STORE, mode).objectStore(STORE));
        q.onsuccess = () => res(q.result);
        q.onerror = () => rej(q.error);
      }),
  );
}

const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());

export const listMedia = () => tx<MediaItem[]>("readonly", (s) => s.getAll());
export const putMedia = async (m: MediaItem) => {
  await tx("readwrite", (s) => s.put(m));
  emit();
};
export const getMedia = (id: string) => tx<MediaItem | undefined>("readonly", (s) => s.get(id));
export const removeMedia = async (id: string) => {
  await tx("readwrite", (s) => s.delete(id));
  emit();
};
export const updateMedia = async (
  id: string,
  p: Partial<Pick<MediaItem, "title" | "note" | "date" | "album" | "clips">>,
) => {
  const cur = await tx<MediaItem | undefined>("readonly", (s) => s.get(id));
  if (cur) await putMedia({ ...cur, ...p });
};

/** Groups items (manual selection). The earliest item becomes the cover. */
export async function groupItems(ids: string[]): Promise<string> {
  const gid = Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
  const items = (await listMedia()).filter((x) => ids.includes(x.id));
  const first = [...items].sort((a, b) => a.createdAt - b.createdAt)[0];
  for (const m of items) await putMedia({ ...m, groupId: gid, cover: m.id === first?.id });
  return gid;
}

/** Removes all items from a group (items themselves stay). */
export async function ungroup(groupId: string) {
  const items = (await listMedia()).filter((x) => x.groupId === groupId);
  for (const m of items) {
    const { groupId: _g, cover: _c, ...rest } = m;
    await putMedia(rest);
  }
}

/** Picks the group's preview photo. */
export async function setCover(groupId: string, id: string) {
  const items = (await listMedia()).filter((x) => x.groupId === groupId);
  for (const m of items) await putMedia({ ...m, cover: m.id === id });
}

/** Pure sorting helper: goal album respects manual order, others sort newest first. */
export function sortMediaItems(items: MediaItem[], album: Album): MediaItem[] {
  return [...items].sort((a, b) => {
    if (album === "goal") {
      const hasA = typeof a.order === "number";
      const hasB = typeof b.order === "number";
      if (hasA && hasB) {
        if (a.order !== b.order) return a.order! - b.order!;
      } else if (hasA) {
        return -1;
      } else if (hasB) {
        return 1;
      }
    }
    return b.date.localeCompare(a.date) || b.createdAt - a.createdAt;
  });
}

/** Batch-reorders items in an album in a single IndexedDB transaction. */
export async function reorderMedia(album: Album, orderedIds: string[]): Promise<void> {
  const all = await listMedia();
  const map = new Map(all.map((m) => [m.id, m]));
  await db().then(
    (d) =>
      new Promise<void>((res, rej) => {
        const t = d.transaction(STORE, "readwrite");
        const s = t.objectStore(STORE);
        for (let i = 0; i < orderedIds.length; i++) {
          const item = map.get(orderedIds[i]!);
          if (item && item.album === album) {
            s.put({ ...item, order: i });
          }
        }
        t.oncomplete = () => res();
        t.onerror = () => rej(t.error);
        t.onabort = () => rej(t.error);
      }),
  );
  emit();
}

export function useMedia(album: Album) {
  const [items, setItems] = useState<MediaItem[] | null>(null);
  useEffect(() => {
    let on = true;
    const load = () =>
      listMedia().then((all) => {
        if (!on) return;
        setItems(
          sortMediaItems(
            all.filter((x) => x.album === album),
            album,
          ),
        );
      });
    load();
    subs.add(load);
    return () => {
      on = false;
      subs.delete(load);
    };
  }, [album]);
  return items;
}

/** Object URL tied to component lifetime. */
export function useBlobUrl(blob: Blob | undefined) {
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    if (!blob) return;
    const u = URL.createObjectURL(blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [blob]);
  return url;
}

// ---- Profile avatar (single record, not shown in the gallery) ----

const AVATAR_ID = "avatar";

/** Squares an image to 512x512 JPEG so the avatar never bloats IndexedDB. */
async function squareImage(file: Blob): Promise<Blob> {
  const bmp = await createImageBitmap(file);
  const s = Math.min(bmp.width, bmp.height);
  const c = document.createElement("canvas");
  c.width = c.height = 512;
  const ctx = c.getContext("2d");
  if (!ctx) return file;
  ctx.drawImage(bmp, (bmp.width - s) / 2, (bmp.height - s) / 2, s, s, 0, 0, 512, 512);
  bmp.close();
  return new Promise((res) => c.toBlob((b) => res(b ?? file), "image/jpeg", 0.85));
}

export async function setAvatarPhoto(file: Blob) {
  const blob = await squareImage(file);
  await putMedia({
    id: AVATAR_ID,
    album: "avatar",
    kind: "image",
    mime: "image/jpeg",
    date: dayOf(Date.now()),
    title: "Аватар",
    note: "",
    createdAt: Date.now(),
    blob,
  });
}

export const clearAvatarPhoto = () => removeMedia(AVATAR_ID);

/** The profile photo or undefined; re-renders on library changes. */
export function useAvatarPhoto() {
  const [blob, setBlob] = useState<Blob | undefined>();
  useEffect(() => {
    let on = true;
    const load = () => {
      tx<MediaItem | undefined>("readonly", (s) => s.get(AVATAR_ID))
        .then((m) => on && setBlob(m?.blob))
        .catch(() => {});
    };
    load();
    subs.add(load);
    return () => {
      on = false;
      subs.delete(load);
    };
  }, []);
  return blob;
}

async function nextGoalOrder(count = 1): Promise<number | undefined> {
  const all = await listMedia();
  const goals = all.filter((x) => x.album === "goal");
  if (!goals.length) return 0;
  let min = 0;
  for (const g of goals) {
    if (typeof g.order === "number" && g.order < min) min = g.order;
  }
  return min - count;
}

export async function addLink(
  url: string,
  album: Album,
  kind: "image" | "video",
  clips?: { start: number; end: number }[],
) {
  const d = new Date();
  const order = album === "goal" ? await nextGoalOrder(1) : undefined;
  await putMedia({
    id: Math.random().toString(36).slice(2, 10) + Date.now().toString(36),
    album,
    kind,
    mime: "link",
    title: "",
    note: "",
    createdAt: Date.now(),
    date: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`,
    url,
    clips,
    ...(order !== undefined ? { order } : {}),
  });
}

export interface AddResult {
  added: string[];
  /** Short videos cloud-transcoded with the user's ffmpeg options (subset of added). */
  converted: string[];
  /** Files skipped: not an image/video the browser can show (e.g. HEIC). */
  skipped: string[];
  /** Videos over the short-clip limits (30s / 50MB). */
  tooHeavy: string[];
}

export interface TranscodeOpts {
  /** Where conversion runs: device (default), cloud, or off. */
  transcodeMode?: TranscodeMode | undefined;
  deviceCodec?: DeviceCodec | undefined;
  deviceBitrate?: BitrateLevel | undefined;
  deviceFps?: DeviceFps | undefined;
  /** Cloud fallback: ffmpeg-api.com key (own key, on-device). */
  ffmpegKey?: string | undefined;
  ffmpegOptions?: string[] | undefined;
  ffmpegOut?: string | undefined;
}

/** HEIC/HEIF from iPhones: browsers can't decode them — converted to JPEG on import. */
const isHeic = (f: File) => isHeicFile(f);

const dayOf = (t: number) => {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export async function addFiles(
  files: File[],
  album: Album,
  opts?: TranscodeOpts,
): Promise<AddResult> {
  const added: string[] = [];
  const converted: string[] = [];
  const skipped: string[] = [];
  const tooHeavy: string[] = [];
  navigator.storage?.persist?.().catch(() => {});
  let goalOrder = album === "goal" ? await nextGoalOrder(files.length) : undefined;
  for (const f of files) {
    if (isHeic(f)) {
      // iPhone HEIC → one fixed format: JPEG (heic2any outputs it natively,
      // no canvas involved; decodes everywhere).
      try {
        const { default: heic2any } = await import("heic2any");
        const out = await heic2any({ blob: f, toType: "image/jpeg", quality: 0.85 });
        const pics = (Array.isArray(out) ? out : [out]).filter((b) => b.size > 0);
        if (!pics.length) throw new Error("empty");
        for (const [i, pic] of pics.entries()) {
          const id = Math.random().toString(36).slice(2, 10) + Date.now().toString(36) + i;
          const order = goalOrder !== undefined ? goalOrder++ : undefined;
          await putMedia({
            id,
            album,
            kind: "image",
            mime: "image/jpeg",
            title: "",
            note: "",
            createdAt: Date.now(),
            date: dayOf(f.lastModified || Date.now()),
            blob: pic,
            ...(order !== undefined ? { order } : {}),
          });
          added.push(id);
        }
      } catch (e) {
        logWarn("media", `Файл пропущен — не читается: ${f.name}`, e);
        skipped.push(f.name);
      }
      continue;
    }
    const kind = f.type.startsWith("video/")
      ? "video"
      : f.type.startsWith("image/")
        ? "image"
        : null;
    if (!kind) {
      skipped.push(f.name);
      continue;
    }
    const id = Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
    const order = goalOrder !== undefined ? goalOrder++ : undefined;
    const base = {
      id,
      album,
      title: "",
      note: "",
      createdAt: Date.now(),
      date: dayOf(f.lastModified || Date.now()),
      ...(order !== undefined ? { order } : {}),
    };
    if (kind === "image") {
      // Already a supported format — store byte-for-byte, no processing.
      await putMedia({ ...base, kind, mime: f.type, blob: f });
      added.push(id);
      continue;
    }
    if (kind === "video") {
      if (f.size > VIDEO_MAX_BYTES) {
        tooHeavy.push(f.name);
        continue;
      }
      // Duration check is best-effort: unreadable metadata must not hang the upload.
      const probe = await probeVideo(f).catch(() => null);
      if (probe && probe.duration > VIDEO_MAX_SEC) {
        tooHeavy.push(f.name);
        continue;
      }
      const cloudKey = opts?.ffmpegKey;
      const cloudOptions = opts?.ffmpegOptions;
      const cloudOut = opts?.ffmpegOut;
      const cloudOk = !!cloudKey && !!cloudOptions?.length;
      const path = pickTranscodePath(opts?.transcodeMode ?? "device", {
        media3: false,
        webcodecs: webCodecsAvailable(),
        cloud: cloudOk,
      });
      const device: DeviceOpts = {
        codec: opts?.deviceCodec ?? "auto",
        bitrate: opts?.deviceBitrate ?? "standard",
        fps: opts?.deviceFps ?? "asis",
      };
      // Already-efficient sources only lose quality from re-encoding — skip.
      const srcBps = probe?.duration ? Math.round((f.size * 8) / probe.duration) : 0;
      const worthIt =
        srcBps > 0 &&
        worthTranscoding(
          srcBps,
          targetVideoBitrate(srcBps, probe?.width || 1080, probe?.height || 1920, 30, device.bitrate),
        );
      if (path === "webcodecs") {
        if (!worthIt) {
          await putMedia({ ...base, kind, mime: f.type, blob: f });
          added.push(id);
          continue;
        }
        try {
          const out = await convertVideoLocal(f, device);
          if (!out) {
            // mediabunny's exact stats say there is no meaningful win either.
            await putMedia({ ...base, kind, mime: f.type, blob: f });
            added.push(id);
            continue;
          }
          await putMedia({ ...base, kind: out.kind, mime: out.mime, blob: out.blob });
          added.push(id);
          converted.push(id);
          continue;
        } catch (e) {
          // On-device conversion failed — cloud or original below.
          logWarn("media", "Локальная конвертация видео не удалась", e);
        }
      }
      if (cloudKey && cloudOptions && cloudOptions.length && path !== "original") {
        try {
          const out = await convertVideo(f, cloudKey, cloudOptions, cloudOut ?? "webm");
          await putMedia({ ...base, kind: out.kind, mime: out.mime, blob: out.blob });
          added.push(id);
          converted.push(id);
          continue;
        } catch (e) {
          // Cloud failed (incl. CPU fallback) — store the original below.
          logWarn("media", "Облачная конвертация видео не удалась", e);
        }
      }
      await putMedia({ ...base, kind, mime: f.type, blob: f });
      added.push(id);
      continue;
    }
  }
  return { added, converted, skipped, tooHeavy };
}

const newId = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

export interface CaptureShot {
  blob: Blob;
  spec: PoseSpec;
}

/** Saves a guided capture set as one group (one cover, pose tags per shot). */
export async function saveCaptureSet(shots: CaptureShot[]): Promise<string[]> {
  if (!shots.length) return [];
  const groupId = newId();
  const base = Date.now();
  const ids: string[] = [];
  for (const [i, shot] of shots.entries()) {
    const id = newId();
    await putMedia({
      id,
      album: "progress",
      kind: "image",
      mime: "image/jpeg",
      title: shot.spec.title,
      note: "",
      createdAt: base + i,
      date: dayOf(base),
      blob: shot.blob,
      groupId,
      cover: i === 0,
      pose: shot.spec.view,
      strain: shot.spec.strain,
    });
    ids.push(id);
  }
  return ids;
}

/** Newest progress photo in the same pose — the «призрак» overlay. */
export async function lastPhotoForPose(
  view: PoseView,
  strain: PoseStrain,
): Promise<MediaItem | undefined> {
  const all = await listMedia();
  return all
    .filter(
      (x) =>
        x.album === "progress" &&
        x.kind === "image" &&
        !!x.blob &&
        x.pose === view &&
        x.strain === strain,
    )
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt)[0];
}

/** Latest progress-photo date (any kind of image) for reminders. */
export async function latestProgressDate(): Promise<string | undefined> {
  const all = await listMedia();
  return all
    .filter((x) => x.album === "progress" && x.kind === "image")
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt)[0]?.date;
}

const toB64 = (b: Blob) =>
  new Promise<string>((r) => {
    const fr = new FileReader();
    fr.onload = () => r(String(fr.result).split(",")[1] ?? "");
    fr.readAsDataURL(b);
  });

export async function exportMedia(album: Album) {
  const items = (await listMedia()).filter((x) => x.album === album);
  const out = [];
  for (const { blob, ...m } of items) out.push({ ...m, data: blob ? await toB64(blob) : null });
  return new Blob([JSON.stringify({ app: "pulse-media", version: 1, items: out })], {
    type: "application/json",
  });
}

export async function importMedia(file: File) {
  const j = JSON.parse(await file.text());
  if (j?.app !== "pulse-media" || !Array.isArray(j.items)) throw new Error("bad");
  const have = new Set((await listMedia()).map((x) => x.id));
  let n = 0;
  for (const { data, ...m } of j.items) {
    if (have.has(m.id)) continue;
    const blob = data
      ? new Blob([Uint8Array.from(atob(data), (c) => c.charCodeAt(0))], { type: m.mime })
      : undefined;
    await putMedia({ ...m, blob });
    n++;
  }
  return n;
}
