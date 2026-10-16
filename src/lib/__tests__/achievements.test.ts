import { describe, expect, it } from "vitest";
import { dailyQuests, dayStreak, evaluateBadges, monthlyChallenge } from "../achievements";
import type { SessionLog } from "../types";

const sess = (iso: string, extra: Partial<SessionLog> = {}): SessionLog => ({
  id: iso,
  date: iso,
  workoutId: "w",
  workoutName: "W",
  durationSec: 1800,
  xp: 100,
  sets: [{ exerciseId: "e", muscles: ["chest"], category: "strength", count: 3 }],
  ...extra,
});

describe("dayStreak", () => {
  it("counts consecutive days, vacation freezes", () => {
    const now = new Date("2026-10-14T12:00:00");
    const s = [
      sess("2026-10-14T08:00:00"),
      sess("2026-10-13T08:00:00"),
      sess("2026-10-12T08:00:00"),
    ];
    expect(dayStreak(s, [], now)).toBe(3);
    // Vacation day in the middle doesn't break the streak.
    expect(dayStreak(s, [{ start: "2026-10-11", end: "2026-10-11" }], now)).toBe(3);
    // A missed plain day breaks it.
    expect(dayStreak([sess("2026-10-14T08:00:00"), sess("2026-10-12T08:00:00")], [], now)).toBe(1);
  });
});

describe("badges", () => {
  it("unlocks milestones and time badges", () => {
    const st = {
      sessions: [sess("2026-10-14T07:30:00"), sess("2026-10-14T22:30:00")],
      vacations: [],
    };
    const byId = Object.fromEntries(
      evaluateBadges(st, new Date("2026-10-14T12:00:00")).map((b) => [b.def.id, b]),
    );
    expect(byId["m1"]!.unlocked).toBe(true);
    expect(byId["m5"]!.unlocked).toBe(false);
    expect(byId["m5"]!.done).toBe(2);
    expect(byId["lark"]!.unlocked).toBe(true);
    expect(byId["night"]!.unlocked).toBe(true);
  });
  it("sprint needs a short powerful session", () => {
    const st = {
      sessions: [sess("2026-10-14T10:00:00", { durationSec: 900, xp: 60 })],
      vacations: [],
    };
    const byId = Object.fromEntries(
      evaluateBadges(st, new Date("2026-10-14T12:00:00")).map((b) => [b.def.id, b]),
    );
    expect(byId["sprint"]!.unlocked).toBe(true);
  });
});

describe("monthlyChallenge", () => {
  it("counts only the current month, goal 12", () => {
    const now = new Date("2026-10-14T12:00:00");
    const s = [
      sess("2026-10-01T10:00:00"),
      sess("2026-10-05T10:00:00"),
      sess("2026-09-30T10:00:00"),
    ];
    const c = monthlyChallenge(s, now);
    expect(c.done).toBe(2);
    expect(c.goal).toBe(12);
    expect(c.claimed).toBe(false);
    expect(c.name.length).toBeGreaterThan(3);
  });
});

describe("dailyQuests", () => {
  it("tracks workout, xp and stretch focus", () => {
    const now = new Date("2026-10-14T12:00:00");
    expect(dailyQuests([], now).every((q) => !q.done)).toBe(true);
    const s = [
      sess("2026-10-14T10:00:00", {
        xp: 60,
        sets: [
          { exerciseId: "e", muscles: ["chest"], category: "strength", count: 3 },
          ...Array.from({ length: 5 }, () => ({
            exerciseId: "s",
            muscles: ["hamstring" as const],
            category: "stretch" as const,
            count: 1,
          })),
        ],
      }),
    ];
    expect(dailyQuests(s, now).every((q) => q.done)).toBe(true);
  });
});
