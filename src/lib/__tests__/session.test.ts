import { describe, expect, it } from "vitest";
import {
  addItem,
  buildSteps,
  itemFromExercise,
  moveItem,
  reposition,
  removeItem,
  updateItem,
} from "../session";
import type { Exercise, WorkoutItem } from "../types";

const ex = (id: string): Exercise => ({
  id,
  name: `Ex ${id}`,
  muscles: [],
  category: "strength",
  mode: "reps",
  reps: 10,
  seconds: 30,
  equipment: "",
  description: "",
  steps: [],
  mistakes: [],
  source: "seed",
});

const item = (id: string, sets = 2, overrides: Partial<WorkoutItem> = {}): WorkoutItem => ({
  exerciseId: id,
  sets,
  reps: 10,
  seconds: 30,
  rest: 60,
  ...overrides,
});

describe("buildSteps", () => {
  it("flattens items into one step per set with 1-based set numbers", () => {
    const steps = buildSteps([item("a", 2), item("b", 1)], [ex("a"), ex("b")]);
    expect(steps.map((s) => `${s.ex.id}:${s.set}`)).toEqual(["a:1", "a:2", "b:1"]);
  });

  it("skips items whose exercise is missing", () => {
    const steps = buildSteps([item("a"), item("gone")], [ex("a")]);
    expect(steps).toHaveLength(2);
    expect(steps.every((s) => s.ex.id === "a")).toBe(true);
  });
});

describe("itemFromExercise", () => {
  it("uses the exercise values as defaults", () => {
    const i = itemFromExercise({ ...ex("a"), reps: 15, seconds: 45 });
    expect(i).toMatchObject({ exerciseId: "a", sets: 1, reps: 15, seconds: 45, rest: 60 });
  });
});

describe("edit reducers", () => {
  const base = [item("a", 1), item("b", 2), item("c", 3)];

  it("addItem appends by default and honors a position", () => {
    expect(addItem(base, item("d")).map((x) => x.exerciseId)).toEqual(["a", "b", "c", "d"]);
    expect(addItem(base, item("d"), 1).map((x) => x.exerciseId)).toEqual(["a", "d", "b", "c"]);
  });

  it("removeItem drops exactly one", () => {
    expect(removeItem(base, 1).map((x) => x.exerciseId)).toEqual(["a", "c"]);
  });

  it("moveItem reorders and clamps out-of-range no-ops", () => {
    expect(moveItem(base, 0, 2).map((x) => x.exerciseId)).toEqual(["b", "c", "a"]);
    expect(moveItem(base, 5, 0)).toBe(base);
  });

  it("updateItem patches one item and clamps numbers", () => {
    const out = updateItem(base, 1, { sets: 0, reps: 5 });
    expect(out[1]).toMatchObject({ sets: 1, reps: 5, exerciseId: "b" });
    expect(out[0]).toBe(base[0]);
  });

  it("updateItem ignores transient NaN from half-typed inputs", () => {
    const out = updateItem(base, 1, { sets: Number.NaN });
    expect(out[1]?.sets).toBe(2);
  });
});

describe("reposition", () => {
  it("clamps the step index after edits", () => {
    const steps = buildSteps([item("a", 2)], [ex("a")]);
    expect(reposition(5, steps)).toEqual({ idx: 1, empty: false });
    expect(reposition(5, [])).toEqual({ idx: 0, empty: true });
  });
});
