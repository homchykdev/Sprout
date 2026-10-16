import type { MediaItem } from "./media";

export interface PhotoGroup {
  id: string;
  items: MediaItem[];
  cover: MediaItem;
}

/** Latest date inside a group (yyyy-MM-dd). */
export function maxGroupDate(items: MediaItem[]): string {
  return items.reduce((a, b) => (a > b.date ? a : b.date), items[0]!.date);
}

/**
 * Collapses flat items into timeline entries: lone photos stay as-is,
 * items sharing a groupId become one PhotoGroup at the first occurrence.
 * Cover = flagged photo, else the earliest one.
 */
export function toGroups(items: MediaItem[]): { entry: MediaItem | PhotoGroup; key: string }[] {
  const seen = new Set<string>();
  const out: { entry: MediaItem | PhotoGroup; key: string }[] = [];
  for (const m of items) {
    if (!m.groupId) {
      out.push({ entry: m, key: m.id });
      continue;
    }
    if (seen.has(m.groupId)) continue;
    seen.add(m.groupId);
    const list = items.filter((x) => x.groupId === m.groupId);
    const cover =
      list.find((x) => x.cover) ?? [...list].sort((a, b) => a.createdAt - b.createdAt)[0]!;
    out.push({ entry: { id: m.groupId, items: list, cover }, key: `g-${m.groupId}` });
  }
  return out;
}
