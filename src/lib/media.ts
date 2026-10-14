import { useEffect, useState } from "react";

/** User photos/videos live in IndexedDB (too large for the main store). */
export type Album = "progress" | "goal" | "exercise";
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
}

const DB = "pulse-media", STORE = "items";
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
  return db().then((d) => new Promise<T>((res, rej) => {
    const q = fn(d.transaction(STORE, mode).objectStore(STORE));
    q.onsuccess = () => res(q.result);
    q.onerror = () => rej(q.error);
  }));
}

const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());

export const listMedia = () => tx<MediaItem[]>("readonly", (s) => s.getAll());
export const putMedia = async (m: MediaItem) => { await tx("readwrite", (s) => s.put(m)); emit(); };
export const getMedia = (id: string) => tx<MediaItem | undefined>("readonly", (s) => s.get(id));
export const removeMedia = async (id: string) => { await tx("readwrite", (s) => s.delete(id)); emit(); };
export const updateMedia = async (id: string, p: Partial<Pick<MediaItem, "title" | "note" | "date" | "album" | "clips">>) => {
  const cur = await tx<MediaItem | undefined>("readonly", (s) => s.get(id));
  if (cur) await putMedia({ ...cur, ...p });
};

export function useMedia(album: Album) {
  const [items, setItems] = useState<MediaItem[] | null>(null);
  useEffect(() => {
    let on = true;
    const load = () => listMedia().then((all) => on && setItems(all.filter((x) => x.album === album).sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt)));
    load(); subs.add(load);
    return () => { on = false; subs.delete(load); };
  }, [album]);
  return items;
}

/** Object URL tied to component lifetime. */
export function useBlobUrl(blob: Blob | undefined) {
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    if (!blob) return;
    const u = URL.createObjectURL(blob); setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [blob]);
  return url;
}

/** Downscale photos to save device space; videos stored as-is. */
async function shrink(file: File): Promise<Blob> {
  if (!file.type.startsWith("image/") || file.type === "image/gif") return file;
  try {
    const bmp = await createImageBitmap(file);
    const k = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
    const c = document.createElement("canvas");
    c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
    c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
    const out = await new Promise<Blob | null>((r) => c.toBlob(r, "image/jpeg", 0.85));
    return out && out.size < file.size ? out : file;
  } catch { return file; }
}

export async function addLink(url: string, album: Album, kind: "image" | "video", clips?: { start: number; end: number }[]) {
  const d = new Date();
  await putMedia({
    id: Math.random().toString(36).slice(2, 10) + Date.now().toString(36), album, kind, mime: "link", title: "", note: "", createdAt: Date.now(),
    date: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`, url, clips,
  });
}

export async function addFiles(files: File[], album: Album): Promise<string[]> {
  const ids: string[] = [];
  navigator.storage?.persist?.().catch(() => {});
  for (const f of files) {
    const kind = f.type.startsWith("video/") ? "video" : f.type.startsWith("image/") ? "image" : null;
    if (!kind) continue;
    const blob = await shrink(f);
    const d = new Date(f.lastModified || Date.now());
    const id = Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
    ids.push(id);
    await putMedia({
      id,
      album, kind, mime: blob.type || f.type, title: "", note: "", createdAt: Date.now(),
      date: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`,
      blob,
    });
  }
  return ids;
}

const toB64 = (b: Blob) => new Promise<string>((r) => { const fr = new FileReader(); fr.onload = () => r(String(fr.result).split(",")[1] ?? ""); fr.readAsDataURL(b); });

export async function exportMedia(album: Album) {
  const items = (await listMedia()).filter((x) => x.album === album);
  const out = [];
  for (const { blob, ...m } of items) out.push({ ...m, data: blob ? await toB64(blob) : null });
  return new Blob([JSON.stringify({ app: "pulse-media", version: 1, items: out })], { type: "application/json" });
}

export async function importMedia(file: File) {
  const j = JSON.parse(await file.text());
  if (j?.app !== "pulse-media" || !Array.isArray(j.items)) throw new Error("bad");
  const have = new Set((await listMedia()).map((x) => x.id));
  let n = 0;
  for (const { data, ...m } of j.items) {
    if (have.has(m.id)) continue;
    const blob = data ? new Blob([Uint8Array.from(atob(data), (c) => c.charCodeAt(0))], { type: m.mime }) : undefined;
    await putMedia({ ...m, blob });
    n++;
  }
  return n;
}
