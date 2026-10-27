import { describe, expect, it } from "vitest";
import { parseClips, parseLink, posterFromUrl } from "../embed";
describe("embed", () => {
  it("parses youtube links", () => {
    expect(parseLink("https://youtu.be/abc123?t=90")).toEqual({
      type: "youtube",
      id: "abc123",
      t: 90,
    });
    expect(parseLink("https://www.youtube.com/shorts/xyz")).toMatchObject({
      type: "youtube",
      id: "xyz",
    });
  });
  it("parses timecodes into clips, skipping invalid", () => {
    expect(parseClips("1:20-1:45\n2:00 – 2:10\nbad\n5-3")).toEqual([
      { start: 80, end: 105 },
      { start: 120, end: 130 },
    ]);
  });
  it("builds free poster urls for youtube and kinescope", () => {
    expect(posterFromUrl("https://kinescope.io/embed/scUFPHj8pKdZcUkk6etQbx")).toBe(
      "https://kinescope.io/scUFPHj8pKdZcUkk6etQbx/poster.svg",
    );
    expect(posterFromUrl("https://youtu.be/abc123?t=90")).toBe(
      "https://i.ytimg.com/vi/abc123/hqdefault.jpg",
    );
    expect(posterFromUrl("https://some.site/embed/abc")).toBeNull();
    expect(posterFromUrl("not a url")).toBeNull();
  });
});
