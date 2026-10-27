import { describe, expect, expectTypeOf, it } from "vitest";
import {
  buildSlots,
  DEFAULT_REMINDERS,
  fillPhrase,
  GUILT_PHRASES,
  MOTIVE_PHRASES,
  NUDGE_PHRASES,
  phraseFor,
  pickPhrase,
  REMINDER_CAP,
  seeded,
  STREAK_PHRASES,
  timeGreeting,
} from "../phrases";

const r = { ...DEFAULT_REMINDERS }; // 15:00-21:00, preferred 18:00

describe("seeded / pickPhrase", () => {
  it("is deterministic for the same inputs", () => {
    expect(seeded("x", "2026-01-01", 1)).toBe(seeded("x", "2026-01-01", 1));
  });

  it("stays inside the pool and never repeats the avoided phrase", () => {
    for (let i = 0; i < 40; i++) {
      const a = pickPhrase(MOTIVE_PHRASES, "2026-01-01", i);
      const b = pickPhrase(MOTIVE_PHRASES, "2026-01-01", i, a);
      expect(MOTIVE_PHRASES).toContain(a);
      expect(b).not.toBe(a);
    }
  });

  it("varies between days at the same slot", () => {
    const set = new Set(
      Array.from({ length: 20 }, (_, i) =>
        pickPhrase(NUDGE_PHRASES, `2026-02-${String(i + 1).padStart(2, "0")}`, 1),
      ),
    );
    expect(set.size).toBeGreaterThan(3);
  });
});

describe("buildSlots", () => {
  it("gives one slot for a rest day", () => {
    const slots = buildSlots(r, "2026-01-05", "rest");
    expect(slots).toHaveLength(1);
    expect(slots[0]).toBe(r.preferred);
  });

  it("is deterministic per day but varies its length across days", () => {
    const lens = new Set<number>();
    for (let i = 1; i <= 30; i++) {
      const day = `2026-03-${String(i).padStart(2, "0")}`;
      const slots = buildSlots(r, day, "workout");
      expect(slots).toEqual([...slots].sort((a, b) => a - b));
      expect(new Set(slots).size).toBe(slots.length);
      expect(slots[0]!).toBe(r.preferred);
      expect(slots.at(-1)!).toBeLessThanOrEqual(REMINDER_CAP);
      lens.add(slots.length);
    }
    expect(lens.size).toBeGreaterThan(1); // разное количество в день
  });

  it("includes the windowEnd-60 passive-aggressive anchor", () => {
    for (let i = 1; i <= 15; i++) {
      const slots = buildSlots(r, `2026-04-${String(i).padStart(2, "0")}`, "workout");
      expect(slots).toContain(r.windowEnd - 60); // 1200
      expect(slots).toContain(r.windowEnd + 30 <= REMINDER_CAP ? r.windowEnd + 30 : REMINDER_CAP);
    }
  });

  it("respects the 22:00 absolute cap for a late window", () => {
    const late = {
      enabled: true,
      windowStart: 20 * 60,
      windowEnd: 23 * 60 + 30,
      preferred: 21 * 60,
    };
    const slots = buildSlots(late, "2026-01-01", "workout");
    for (const m of slots) expect(m).toBeLessThanOrEqual(REMINDER_CAP);
  });

  it("clamps the preferred time into the window", () => {
    const slots = buildSlots({ ...r, preferred: 23 * 60 }, "2026-01-01", "workout");
    expect(slots[0]!).toBeLessThanOrEqual(r.windowEnd);
  });
});

describe("phraseFor", () => {
  it("escalates tone: early motive -> late guilt", () => {
    const slots = [900, 1000, 1080, 1140, 1200];
    const early = phraseFor(slots, 0, { kind: "workout", streak: 5, hour: 15 });
    const late = phraseFor(slots, 3, { kind: "workout", streak: 5, hour: 19 });
    expect(MOTIVE_PHRASES).toContain(early.body);
    expect(GUILT_PHRASES).toContain(late.body);
  });

  it("uses the streak template on the last (last-call) slot", () => {
    const slots = [900, 1140, 1290];
    const p = phraseFor(slots, 2, { kind: "workout", streak: 12, hour: 21 });
    expect(p.title).toContain("12");
    expect(STREAK_PHRASES.some((t) => fillPhrase(t, { n: 12 }) === p.body)).toBe(true);
  });

  it("never escalates on a rest day", () => {
    const p = phraseFor([1080], 0, { kind: "rest", streak: 7, hour: 18 });
    expect(MOTIVE_PHRASES).toContain(p.body);
  });

  it("interpolates streak risk phrases", () => {
    expect(fillPhrase("Серия {n} под угрозой! 🔥", { n: 8 })).toContain("8");
  });
});

describe("timeGreeting", () => {
  it("picks the greeting by hour", () => {
    expectTypeOf(timeGreeting).toEqualTypeOf<(h: number) => string>();
    expect(timeGreeting(7)).toBe("Доброе утро");
    expect(timeGreeting(23)).toBe("Ночь коротка");
  });
});
