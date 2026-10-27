import { dailyQuests } from "./achievements";
import { addDays, dayKey, onVacation, weekday } from "./game";
import type { AppState } from "./store";
import type { Plan, PlanSettings, PlanStep, Workout } from "./types";

/** Tunable plan guards (x / n / y / threshold) — lives in plan settings for now. */
export type { PlanSettings } from "./types";

export const DEFAULT_PLAN_SETTINGS: PlanSettings = {
  bonusMax: 5,
  bonusRestoreDays: 5,
  freezeMax: 3,
  freezeThresholdPct: 80,
};

/** Fresh plan built from a legacy weekly schedule (or a clean one-routine cycle). */
export function defaultPlan(workouts: Workout[] = []): Plan {
  const origin = new Date().toISOString().slice(0, 10);
  const steps = planFromSchedule(
    { days: [0, 2, 4], rotation: workouts.map((w) => w.id), rotationIndex: 0 },
    workouts,
    origin,
    (i) => `step-${i}`,
  );
  return { steps, origin, settings: { ...DEFAULT_PLAN_SETTINGS } };
}

export type PlanInput = Pick<AppState, "sessions" | "plan" | "vacations"> & {
  workouts?: Workout[];
};

export type PlanStatus =
  | "done" // planned day closed by a session
  | "protected" // missed, bonus or freeze spent
  | "missed" // missed and unprotected
  | "pending" // today's planned day, day not over yet
  | "rest" // planned rest step
  | "vacation" // vacation covers the day
  | "future" // upcoming
  | "off"; // before plan start

/** Noon date from a yyyy-MM-dd key — avoids DST off-by-one. */
export const dayDate = (k: string) => {
  const [y, m, d] = k.split("-").map(Number);
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1, 12);
};

export const daysBetween = (fromKey: string, toDate: Date) =>
  Math.round(
    (new Date(toDate.getFullYear(), toDate.getMonth(), toDate.getDate(), 12).getTime() -
      dayDate(fromKey).getTime()) /
      864e5,
  );

/** The plan step that falls on a calendar date (cycle starts at plan.origin). */
export function stepForDay(plan: Plan, date: Date): PlanStep | undefined {
  const n = plan.steps.length;
  if (!n) return undefined;
  const idx = daysBetween(plan.origin, date);
  if (idx < 0) return undefined;
  return plan.steps[idx % n]!;
}

export interface PlanProgress {
  /** Consecutive planned days closed by a workout; bonus/freeze keep it but don't add. */
  streak: number;
  bonusLeft: number;
  freezeLeft: number;
  /** Latest day the streak was broken, if any (yyyy-MM-dd). */
  breakAt: string | null;
}

/**
 * Deterministic day-walk over plan history from plan.origin to now.
 * Missed planned days spend bonus rest days first (one per day, each returns
 * after bonusRestoreDays), then streak freezes; with no resources left the
 * streak breaks that day. Protected days keep the streak but add nothing.
 * Weekly settlement may grant one freeze when the best of quest/workout
 * completion reaches the threshold.
 */
export function planProgress(state: PlanInput, now = new Date()): PlanProgress {
  const steps = state.plan.steps;
  const { bonusMax, bonusRestoreDays, freezeMax, freezeThresholdPct } = state.plan.settings;
  if (!steps.length)
    return { streak: 0, bonusLeft: Math.max(0, bonusMax), freezeLeft: 0, breakAt: null };
  const doneDays = new Set(state.sessions.map((s) => dayKey(new Date(s.date))));
  const bonusRefs: string[] = [];
  let freeze = 0;
  let streak = 0;
  let breakAt: string | null = null;
  let wPlanned = 0,
    wDone = 0,
    wQuestSum = 0,
    wQuestDays = 0;
  const totalDays = Math.max(0, daysBetween(state.plan.origin, now));
  const bonusBusy = (d: Date) =>
    bonusRefs.filter((r) => daysBetween(r, d) < bonusRestoreDays).length;
  const c = Math.max(0, Math.min(99, bonusMax));
  for (let i = 0; i <= totalDays; i++) {
    const d = addDays(dayDate(state.plan.origin), i);
    const k = dayKey(d);
    // Weekly settlement runs on Mondays for the finished week.
    if (weekday(d) === 0 && i >= 7) {
      const workoutRate = wPlanned > 0 ? wDone / wPlanned : 0;
      const questRate = wQuestDays > 0 ? wQuestSum / wQuestDays : 0;
      if (Math.max(workoutRate, questRate) >= freezeThresholdPct / 100)
        freeze = Math.min(freezeMax, freeze + 1);
      wPlanned = wDone = wQuestSum = wQuestDays = 0;
    }
    if (onVacation(d, state.vacations)) continue;
    const step = steps[i % steps.length]!;
    // Quest-rate aggregation counts every non-vacation day.
    const qs = dailyQuests(state.sessions, d);
    if (qs.length) {
      wQuestSum += qs.filter((q) => q.done).length / qs.length;
      wQuestDays++;
    }
    if (step.kind === "rest") continue;
    wPlanned++;
    if (doneDays.has(k)) {
      wDone++;
      streak++;
      continue;
    }
    if (k === dayKey(now)) continue; // today still pending: never counted, never breaks
    if (bonusBusy(d) < c)
      bonusRefs.push(k); // bonus keeps the streak, adds nothing
    else if (freeze >= 1) freeze--;
    else {
      streak = 0;
      breakAt = k;
    }
  }
  return {
    streak,
    bonusLeft: c - bonusBusy(now),
    freezeLeft: freeze,
    breakAt,
  };
}

export interface DayInfo {
  date: Date;
  step: PlanStep | undefined;
  status: PlanStatus;
  done: boolean;
}

/** Status of a single calendar day against the plan cycle. */
export function dayInfo(state: PlanInput, date: Date, now = new Date()): DayInfo {
  const step = stepForDay(state.plan, date);
  if (!step) return { date, step, status: "off", done: false };
  if (onVacation(date, state.vacations)) return { date, step, status: "vacation", done: false };
  if (step.kind === "rest") return { date, step, status: "rest", done: false };
  const k = dayKey(date);
  if (state.sessions.some((s) => dayKey(new Date(s.date)) === k))
    return { date, step, status: "done", done: true };
  if (daysBetween(k, now) < 0) return { date, step, status: "future", done: false };
  if (k === dayKey(now)) return { date, step, status: "pending", done: false };
  return { date, step, status: "missed", done: false };
}

/** True when today's plan calls for a workout that hasn't been done yet. */
export function dueToday(state: PlanInput, now = new Date()): boolean {
  return dayInfo(state, now, now).status === "pending";
}

/** Forecast of up to `days` calendar dates starting at today. */
export function forecast(state: PlanInput, days = 30, now = new Date()): DayInfo[] {
  const out: DayInfo[] = [];
  if (!state.plan.steps.length) return out;
  for (let i = 0; i < days; i++) {
    const d = addDays(dayDate(dayKey(now)), i);
    if (daysBetween(state.plan.origin, d) < 0) {
      out.push({ date: d, step: undefined, status: "off", done: false });
      continue;
    }
    if (i === 0) out.push(dayInfo(state, d, now));
    else {
      const step = stepForDay(state.plan, d);
      out.push({
        date: d,
        step,
        status: step
          ? onVacation(d, state.vacations)
            ? "vacation"
            : step.kind === "rest"
              ? "rest"
              : "future"
          : "off",
        done: false,
      });
    }
  }
  return out;
}

/** The workout the plan calls for next: today's pending step or the nearest one ahead. */
export function nextWorkout(
  state: Pick<AppState, "workouts" | "sessions" | "plan" | "vacations">,
  now = new Date(),
): { step: PlanStep; date: Date; workout: Workout | undefined } | undefined {
  const today = dayInfo(state, now, now);
  if (today.step && today.status === "pending") {
    const w = state.workouts.find((x) => x.id === today.step!.workoutId);
    return { step: today.step, date: dayDate(dayKey(now)), workout: w };
  }
  for (let i = 1; i <= 63; i++) {
    const d = addDays(dayDate(dayKey(now)), i);
    const step = stepForDay(state.plan, d);
    if (!step) return undefined;
    if (onVacation(d, state.vacations) || step.kind === "rest") continue;
    const w = state.workouts.find((x) => x.id === step.workoutId);
    return { step, date: d, workout: w };
  }
  return undefined;
}

/** Rebuilds plan steps from the legacy weekly schedule. */
export function planFromSchedule(
  schedule: { days: number[]; rotation: string[]; rotationIndex: number },
  workouts: Workout[],
  origin: string,
  makeId: (i: number) => string,
): PlanStep[] {
  const rot = schedule.rotation.filter((id) => workouts.some((w) => w.id === id));
  if (!schedule.days.length || !rot.length) return []; // no real plan yet → empty plan
  const steps: PlanStep[] = [];
  let ri = Math.max(0, schedule.rotationIndex) % rot.length;
  for (let d = 0; d < 7; d++) {
    if (schedule.days.includes(d)) {
      steps.push({ id: makeId(d), kind: "workout", workoutId: rot[ri % rot.length] });
      ri++;
    } else if (d > 0 && steps.length) {
      steps.push({ id: makeId(d), kind: "rest" });
    }
  }
  // Trailing rest adds nothing to the cycle; drop it.
  while (steps.length && steps[steps.length - 1]!.kind === "rest") steps.pop();
  return steps;
}
