import type { Exercise, WorkoutItem } from "./types";

/** One executable step of a running session: a single set of a single exercise. */
export interface Step {
  ex: Exercise;
  item: WorkoutItem;
  set: number;
}

/** Flattens workout items into one step per set; items with unknown/missing exercises are skipped. */
export function buildSteps(items: WorkoutItem[], exercises: Exercise[]): Step[] {
  const byId = new Map(exercises.map((e) => [e.id, e]));
  return items.flatMap((item) => {
    const ex = byId.get(item.exerciseId);
    return ex
      ? Array.from({ length: Math.max(1, item.sets) }, (_, i) => ({ ex, item, set: i + 1 }))
      : [];
  });
}

/** Creates a session item from an exercise with the exercise's own values as defaults. */
export function itemFromExercise(ex: Exercise): WorkoutItem {
  return {
    exerciseId: ex.id,
    sets: 1,
    reps: ex.reps || 10,
    seconds: ex.seconds || 30,
    rest: 60,
  };
}

/** Appends a new item (optionally at a position) and returns a new array. */
export function addItem(items: WorkoutItem[], item: WorkoutItem, at?: number): WorkoutItem[] {
  const i = at === undefined || at < 0 || at > items.length ? items.length : at;
  return [...items.slice(0, i), item, ...items.slice(i)];
}

/** Removes the item at `index` and returns a new array. */
export function removeItem(items: WorkoutItem[], index: number): WorkoutItem[] {
  return items.filter((_, i) => i !== index);
}

/** Moves an item from `from` to `to` (swap-adjacent move, clamped to bounds). */
export function moveItem(items: WorkoutItem[], from: number, to: number): WorkoutItem[] {
  if (from === to || from < 0 || to < 0 || from >= items.length || to >= items.length) return items;
  const out = [...items];
  const [x] = out.splice(from, 1);
  out.splice(to, 0, x!);
  return out;
}

/** Patch-updates one item and returns a new array (numbers are clamped to sane ≥1 values). */
export function updateItem(
  items: WorkoutItem[],
  index: number,
  patch: Partial<WorkoutItem>,
): WorkoutItem[] {
  return items.map((it, i) => {
    if (i !== index) return it;
    const next = { ...it };
    for (const [k, v] of Object.entries(patch)) {
      const key = k as keyof WorkoutItem;
      if (key === "exerciseId" || key === "rhythm" || typeof v !== "number") {
        (next as Record<string, unknown>)[k] = v;
        continue;
      }
      if (!Number.isFinite(v)) continue;
      (next as unknown as Record<string, number>)[k] = Math.max(1, Math.min(999, Math.round(v)));
    }
    return next;
  });
}

/**
 * Keeps the session position consistent after items were edited.
 * Returns the new step index (clamped) and whether the session became empty.
 */
export function reposition(stepIndex: number, steps: Step[]): { idx: number; empty: boolean } {
  if (!steps.length) return { idx: 0, empty: true };
  return { idx: Math.min(Math.max(0, stepIndex), steps.length - 1), empty: false };
}

/** Index of the workout item the given step belongs to (identity match). */
export function itemIndexAtStep(items: WorkoutItem[], steps: Step[], stepIndex: number): number {
  const item = steps[stepIndex]?.item;
  if (!item) return -1;
  const i = items.lastIndexOf(item);
  return i;
}
