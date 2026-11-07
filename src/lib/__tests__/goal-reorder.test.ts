import { describe, expect, it } from "vitest";
import { sortMediaItems, type MediaItem } from "../media";

const makeItem = (id: string, extra: Partial<MediaItem> = {}): MediaItem => ({
  id,
  album: "goal",
  kind: "image",
  mime: "image/jpeg",
  date: "2026-11-01",
  title: "",
  note: "",
  createdAt: 1000,
  ...extra,
});

describe("sortMediaItems", () => {
  it("sorts goal items by explicit order ascending", () => {
    const a = makeItem("a", { order: 2 });
    const b = makeItem("b", { order: 0 });
    const c = makeItem("c", { order: 1 });

    const sorted = sortMediaItems([a, b, c], "goal");
    expect(sorted.map((x) => x.id)).toEqual(["b", "c", "a"]);
  });

  it("places explicitly ordered items before un-ordered items in goal album", () => {
    const a = makeItem("a", { order: 0, createdAt: 100 });
    const b = makeItem("b", { order: undefined, createdAt: 500 });
    const c = makeItem("c", { order: 1, createdAt: 200 });

    const sorted = sortMediaItems([b, c, a], "goal");
    expect(sorted.map((x) => x.id)).toEqual(["a", "c", "b"]);
  });

  it("falls back to date and createdAt descending when order is missing", () => {
    const oldItem = makeItem("old", { date: "2026-10-01", createdAt: 100 });
    const newItem = makeItem("new", { date: "2026-11-01", createdAt: 200 });
    const newestItem = makeItem("newest", { date: "2026-11-01", createdAt: 300 });

    const sorted = sortMediaItems([oldItem, newestItem, newItem], "goal");
    expect(sorted.map((x) => x.id)).toEqual(["newest", "new", "old"]);
  });

  it("does not use order field for non-goal albums (e.g. progress)", () => {
    const a = makeItem("a", { album: "progress", order: 10, date: "2026-11-02", createdAt: 10 });
    const b = makeItem("b", { album: "progress", order: 0, date: "2026-11-01", createdAt: 20 });

    const sorted = sortMediaItems([b, a], "progress");
    // Progress sorts by date desc, so 'a' (Nov 2) comes before 'b' (Nov 1)
    expect(sorted.map((x) => x.id)).toEqual(["a", "b"]);
  });
});
