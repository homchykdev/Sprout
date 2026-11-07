import { describe, expect, it } from "vitest";
import {
  RHYTHM,
  analyzeTaps,
  cycleTime,
  impliedBpm,
  sanitizeRhythm,
  sanitizeTaps,
} from "../rhythm";

/** Builds timestamps from interval-like gap list. */
const taps = (...gaps: number[]) => {
  const out = [0];
  for (const g of gaps) out.push(out[out.length - 1]! + g);
  return out;
};

describe("sanitizeTaps", () => {
  it("merges ghost double-taps below the debounce threshold", () => {
    // Ghost taps at +12, +221, +645 are finger bounces and disappear.
    expect(sanitizeTaps([0, 12, 212, 221, 621, 645])).toEqual([0, 212, 621]);
  });

  it("keeps at most real taps", () => {
    expect(sanitizeTaps([5])).toEqual([5]);
    expect(sanitizeTaps([])).toEqual([]);
  });
});

describe("analyzeTaps · repeating patterns", () => {
  it("finds 0.2 / 0.2 / 1 from three full repeats — the request's own example", () => {
    const a = analyzeTaps(taps(200, 200, 1000, 200, 200, 1000, 200, 200, 1000))!;
    expect(a.intervals).toEqual([200, 200, 1000]);
    expect(a.cycleMs).toBe(1400);
    expect(a.cycles).toBe(3);
    expect(a.unstable).toBe(false);
  });

  it("is immune to the 200ms grid aliasing trap", () => {
    // Every tap of 0.2/0.2/1 sits on a 200ms grid; a bad detector sees "200 bpm".
    const a = analyzeTaps(taps(200, 200, 1000, 200, 200, 1000, 200, 200))!;
    expect(a.intervals).toEqual([200, 200, 1000]);
  });

  it("smooths finger jitter via multi-cycle averaging", () => {
    const a = analyzeTaps(
      taps(210, 190, 1020, 195, 205, 990, 200, 210, 1005, 205, 195, 995),
    )!;
    expect(a.intervals.every((v) => v >= 150 && v <= 1100)).toBe(true);
    expect(a.intervals.length).toBe(3);
    expect(a.unstable).toBe(false);
  });

  it("detects the steady single-beat loop (k=1)", () => {
    const a = analyzeTaps(taps(500, 505, 495, 500, 500, 500))!;
    expect(a.intervals).toEqual([500]);
    expect(a.unstable).toBe(false);
  });

  it("accepts a 2-beat in-out pattern", () => {
    const a = analyzeTaps(taps(150, 850, 150, 850, 150, 850, 150))!;
    expect(a.intervals).toEqual([150, 850]);
    expect(a.unstable).toBe(false);
  });
});

describe("analyzeTaps · thin evidence stays editable, not wrong", () => {
  it("flags a single tapped cycle as unstable and keeps raw gaps", () => {
    const a = analyzeTaps(taps(200, 200, 3000))!;
    expect(a.cycles).toBe(1);
    expect(a.unstable).toBe(true);
    expect(a.intervals).toEqual([200, 200, 3000]);
  });

  it("returns null for under two taps", () => {
    expect(analyzeTaps([123])).toBeNull();
    expect(analyzeTaps([123, 128])).toBeNull(); // debounced to one tap
  });

  it("averages over two complete repeats even if recording stops at the pattern edge", () => {
    // 2 full cycles tapped, then the user stops right after the pattern's last tap:
    // every slot still has one observation — averaging works, cycles=2.
    const a = analyzeTaps(taps(200, 200, 1000, 200, 200, 1000))!;
    expect(a.intervals).toEqual([200, 200, 1000]);
    expect(a.cycles).toBe(2);
    expect(a.unstable).toBe(false);
  });
});

describe("explicit rhythm values", () => {
  it("sanitizeRhythm clamps and snaps", () => {
    expect(sanitizeRhythm([0, 60, 5000, 3000.4])).toEqual([60, 60, 5000, 3000]);
    expect(sanitizeRhythm([1])).toEqual([60]); // clamped, never dropped — beat count is data
  });

  it("caps length and drops empties", () => {
    expect(sanitizeRhythm(Array.from({ length: 40 }, () => 100))?.length).toBe(
      RHYTHM.maxIntervals,
    );
    expect(sanitizeRhythm([NaN])).toBeUndefined();
  });

  it("cycleTime and impliedBpm describe the pattern for the UI", () => {
    expect(cycleTime([200, 200, 1000])).toBe(1400);
    expect(impliedBpm([200, 200, 1000])).toBe(129); // mean beat 467ms → 129 taps/min
    expect(impliedBpm([])).toBeNull();
  });
});
