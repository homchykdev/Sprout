import type { Exercise, Workout } from "./types";

export function estimateMinutes(w: Workout, lib: Exercise[]) {
  let sec = 0;
  for (const it of w.items) {
    const ex = lib.find((e) => e.id === it.exerciseId);
    const work = ex?.mode === "time" ? it.seconds : it.reps * 3;
    sec += it.sets * (work + it.rest);
  }
  return Math.max(1, Math.round(sec / 60));
}
