import { describe, expect, it } from "vitest";
import { maxGroupDate, toGroups } from "../photo-groups";
import type { MediaItem } from "../media";

const item = (id: string, extra: Partial<MediaItem> = {}): MediaItem => ({
  id,
  album: "progress",
  kind: "image",
  mime: "image/jpeg",
  date: "2026-10-01",
  title: "",
  note: "",
  createdAt: 1,
  ...extra,
});

describe("toGroups", () => {
  it("keeps lone photos and collapses groups at first occurrence", () => {
    const a = item("a", { createdAt: 3 });
    const b1 = item("b1", { groupId: "g", createdAt: 1 });
    const b2 = item("b2", { groupId: "g", createdAt: 2 });
    const out = toGroups([a, b1, b2]);
    expect(out.map((e) => e.key)).toEqual(["a", "g-g"]);
    const g = out[1]!.entry as { id: string; items: MediaItem[]; cover: MediaItem };
    expect(g.items.map((x) => x.id).sort()).toEqual(["b1", "b2"]);
    expect(g.cover.id).toBe("b1"); // earliest by default
  });
  it("flagged photo becomes the cover", () => {
    const out = toGroups([
      item("b1", { groupId: "g", createdAt: 1 }),
      item("b2", { groupId: "g", createdAt: 2, cover: true }),
    ]);
    const g = out[0]!.entry as { cover: MediaItem };
    expect(g.cover.id).toBe("b2");
  });
  it("maxGroupDate picks the latest date", () => {
    expect(
      maxGroupDate([item("a", { date: "2026-10-01" }), item("b", { date: "2026-10-05" })]),
    ).toBe("2026-10-05");
  });
});
