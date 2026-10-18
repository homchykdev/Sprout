import { describe, expect, it } from "vitest";
import type { SessionLog, Vacation, Workout } from "../types";
import {
  DEFAULT_PLAN_SETTINGS,
  dayInfo,
  daysBetween,
  dueToday,
  forecast,
  planFromSchedule,
  planProgress,
  stepForDay,
  type PlanInput,
} from "../plan";

const sess = (iso: string, extra: Partial<SessionLog> = {}): SessionLog => ({
  id: iso,
  date: iso,
  workoutId: "w1",
  workoutName: "W",
  durationSec: 1800,
  xp: 100,
  sets: [{ exerciseId: "e", muscles: ["chest"], category: "strength", count: 3 }],
  ...extra,
});

// Plan-cycle builder: "w" workout day, "r" rest day.
const state = (
  opts: {
    sessions: SessionLog[];
    vacations?: Vacation[];
    steps?: ("w" | "r")[];
    origin?: string;
    bonusMax?: number;
    freezeMax?: number;
    restoreDays?: number;
  },
): PlanInput => ({
  sessions: opts.sessions,
  vacations: opts.vacations ?? [],
  plan: {
    steps: (opts.steps ?? ["w", "r", "w"]).map((s, i) => ({
      id: `s${i}`,
      kind: s === "w" ? ("workout" as const) : ("rest" as const),
      ...(s === "w" ? { workoutId: "w1" } : {}),
    })),
    origin: opts.origin ?? "2026-10-05", // Monday
    settings: {
      ...DEFAULT_PLAN_SETTINGS,
      ...(opts.bonusMax !== undefined ? { bonusMax: opts.bonusMax } : {}),
      ...(opts.freezeMax !== undefined ? { freezeMax: opts.freezeMax } : {}),
      ...(opts.restoreDays !== undefined ? { bonusRestoreDays: opts.restoreDays } : {}),
    },
  },
});

/** Пн-Чт plan, Пт-Вс rest. */
const W_THU = ["w", "w", "w", "w", "r", "r", "r"] as const;

describe("cycle mapping", () => {
  it("maps calendar dates to steps by origin distance", () => {
    const s = state({ sessions: [] });
    expect(stepForDay(s.plan, new Date(2026, 9, 5))!.kind).toBe("workout"); // day 0
    expect(stepForDay(s.plan, new Date(2026, 9, 6))!.kind).toBe("rest"); // day 1
    expect(stepForDay(s.plan, new Date(2026, 9, 7))!.kind).toBe("workout"); // day 2
    expect(stepForDay(s.plan, new Date(2026, 9, 11))!.kind).toBe("workout"); // day 6 wraps to step 0
    expect(stepForDay(s.plan, new Date(2026, 9, 4))).toBeUndefined(); // before origin
  });
  it("daysBetween is midnight-safe", () => {
    expect(daysBetween("2026-10-05", new Date(2026, 9, 5, 23, 30))).toBe(0);
    expect(daysBetween("2026-10-05", new Date(2026, 9, 6, 0, 1))).toBe(1);
  });
});

describe("planProgress: streak", () => {
  it("counts completed days; rest days stay neutral; bonuses protect misses", () => {
    const now = new Date("2026-10-14T18:00:00");
    const s = state({
      sessions: [
        sess("2026-10-05T10:00"),
        sess("2026-10-06T10:00"),
        sess("2026-10-07T10:00"),
        sess("2026-10-08T10:00"),
        sess("2026-10-12T10:00"),
      ],
      steps: [...W_THU],
    });
    const p = planProgress(s, now); // 13 miss protected by bonus; 14 still pending
    expect(p.streak).toBe(5);
    expect(p.bonusLeft).toBe(DEFAULT_PLAN_SETTINGS.bonusMax - 1);
    expect(p.breakAt).toBe(null);
  });
  it("a missed planned day without resources breaks the streak", () => {
    const now = new Date("2026-10-13T18:00:00"); // 13th still pending
    const s = state({
      sessions: [sess("2026-10-08T10:00"), sess("2026-10-12T10:00")],
      steps: [...W_THU],
      bonusMax: 0,
      freezeMax: 0,
    });
    const p = planProgress(s, now);
    expect(p.streak).toBe(2); // rebuilt from 08 and 12
    expect(p.breakAt).toBe("2026-10-07"); // latest break
  });
  it("vacation days keep the streak and never break it", () => {
    const now = new Date("2026-10-12T18:00:00");
    const s = state({
      sessions: [sess("2026-10-05T10:00")],
      vacations: [{ start: "2026-10-06", end: "2026-10-11" }],
    });
    expect(planProgress(s, now)).toMatchObject({ streak: 1, breakAt: null });
  });
});

describe("planProgress: protection order", () => {
  it("after a bonus is exhausted a freeze protects the miss", () => {
    const now = new Date("2026-10-14T18:00:00");
    const s = state({
      sessions: [
        sess("2026-10-05T10:00"),
        sess("2026-10-06T10:00"),
        sess("2026-10-07T10:00"),
        sess("2026-10-08T10:00"),
        sess("2026-10-12T10:00"),
      ],
      steps: [...W_THU],
      bonusMax: 0,
      freezeMax: 3,
    });
    const p = planProgress(s, now); // week1 100% → +1 freeze on Mon; 13 spends it
    expect(p.streak).toBe(5);
    expect(p.freezeLeft).toBe(0);
    expect(p.breakAt).toBe(null);
  });
  it("with no resources the 3rd missed day in a row breaks the streak", () => {
    const now = new Date("2026-10-15T18:00:00"); // 15th still pending
    const s = state({
      sessions: [
        sess("2026-10-05T10:00"),
        sess("2026-10-06T10:00"),
        sess("2026-10-07T10:00"),
        sess("2026-10-08T10:00"),
      ],
      steps: [...W_THU],
      bonusMax: 2,
      freezeMax: 0,
    });
    const p = planProgress(s, now); // 12 & 13 protected, 14 breaks
    expect(p.streak).toBe(0);
    expect(p.breakAt).toBe("2026-10-14");
  });
  it("a spent bonus returns to the pool after bonusRestoreDays", () => {
    const now = new Date("2026-10-19T18:00:00");
    const s = state(
      {
        sessions: [
          sess("2026-10-05T10:00"),
          sess("2026-10-06T10:00"),
          sess("2026-10-07T10:00"),
          sess("2026-10-08T10:00"),
          sess("2026-10-12T10:00"),
          sess("2026-10-13T10:00"),
          sess("2026-10-14T10:00"),
        ],
        steps: [...W_THU],
        bonusMax: 1,
        freezeMax: 0,
        restoreDays: 2,
      },
    );
    const p = planProgress(s, now); // 15 spent the bonus; by 17 it returned → pool free
    expect(p.streak).toBe(7);
    expect(p.breakAt).toBe(null);
    expect(p.bonusLeft).toBe(1); // 19th is still pending, bonus available again
  });
});

describe("planProgress: weekly settlement", () => {
  it("full weeks grant +1 freeze each, capped at y", () => {
    const now = new Date("2026-10-19T18:00:00");
    const s = state({
      sessions: [
        sess("2026-10-05T10:00"),
        sess("2026-10-06T10:00"),
        sess("2026-10-07T10:00"),
        sess("2026-10-08T10:00"),
        sess("2026-10-12T10:00"),
        sess("2026-10-13T10:00"),
        sess("2026-10-14T10:00"),
        sess("2026-10-15T10:00"),
      ],
      steps: [...W_THU],
      freezeMax: 2,
      bonusMax: 0,
    });
    expect(planProgress(s, now).freezeLeft).toBe(2);
  });
  it("a weak week grants nothing", () => {
    const now = new Date("2026-10-19T18:00:00");
    const s = state({
      sessions: [
        sess("2026-10-05T10:00"),
        sess("2026-10-12T10:00"),
        sess("2026-10-13T10:00"),
        sess("2026-10-14T10:00"),
      ],
      steps: [...W_THU],
      bonusMax: 9,
      freezeMax: 3,
    });
    expect(planProgress(s, now)).toMatchObject({ freezeLeft: 0, streak: 4, breakAt: null });
  });
});

describe("dayInfo / dueToday / forecast", () => {
  it("today is pending until trained, done after a session", () => {
    const now = new Date("2026-10-07T18:00:00"); // Wednesday planned
    const s = state({ sessions: [] });
    expect(dayInfo(s, new Date(2026, 9, 7), now).status).toBe("pending");
    expect(dueToday(s, now)).toBe(true);
    const s2 = state({ sessions: [sess("2026-10-07T10:00")] });
    expect(dayInfo(s2, new Date(2026, 9, 7), now).status).toBe("done");
    expect(dueToday(s2, now)).toBe(false);
  });
  it("forecast lays steps over upcoming days", () => {
    const now = new Date("2026-10-07T10:00:00");
    const s = state({ sessions: [] }); // w,r,w cycle
    const f = forecast(s, 4, now);
    expect(f.map((x) => x.status).join()).toBe("pending,future,rest,future");
    expect(f.map((x) => x.step?.kind).join()).toBe("workout,workout,rest,workout");
  });
  it("today's done day shows done in forecast", () => {
    const now = new Date("2026-10-07T18:00:00");
    const s = state({ sessions: [sess("2026-10-07T10:00")] });
    expect(forecast(s, 1, now)[0]!.status).toBe("done");
  });
  it("empty plan is inert", () => {
    const now = new Date("2026-10-07T10:00:00");
    const s = state({ sessions: [], steps: [] });
    expect(dueToday(s, now)).toBe(false);
    expect(forecast(s, 7, now)).toEqual([]);
    expect(planProgress(s, now).streak).toBe(0);
  });
});

describe("planFromSchedule", () => {
  it("converts legacy weekly days into workout/rest steps", () => {
    const workouts: Workout[] = [
      { id: "a", name: "A", emoji: "💪", items: [] },
      { id: "b", name: "B", emoji: "🔥", items: [] },
    ];
    const steps = planFromSchedule(
      { days: [0, 2, 4], rotation: ["a", "b"], rotationIndex: 0 },
      workouts,
      "2026-10-05",
      (i) => `id${i}`,
    );
    expect(steps.map((s) => s.kind).join()).toBe("workout,rest,workout,rest,workout");
    expect(steps[0]!.workoutId).toBe("a");
    expect(steps[2]!.workoutId).toBe("b");
  });
});
