import { describe, expect, it } from "vitest";
import { initialState, migrateState } from "../store";
import type { Exercise } from "../types";

describe("migrateState · onboarded flag (v10)", () => {
  it("keeps the wizard hidden for upgrades from v9 and back", () => {
    expect(migrateState({ name: "Саша" }, 9).onboarded).toBe(true);
    expect(migrateState({ name: "Саша" }, 3).onboarded).toBe(true);
    expect(migrateState({}, 1).onboarded).toBe(true);
  });

  it("shows the wizard on fresh installs (unknown version)", () => {
    expect(migrateState({ name: "" }, 0).onboarded).toBe(false);
    expect(initialState.onboarded).toBe(false);
  });

  it("respects an already-stored value", () => {
    expect(migrateState({ onboarded: false }, 9).onboarded).toBe(false);
    expect(migrateState({ onboarded: true }, 0).onboarded).toBe(true);
  });
});

describe("migrateState · tapped rhythm pattern (v13)", () => {
  it("is a passthrough — optional rhythm rides along without backfill", () => {
    const exercises = [
      {
        id: "e1",
        name: "Планка",
        muscles: ["abs"],
        category: "strength",
        mode: "time",
        reps: 0,
        seconds: 40,
        equipment: "",
        description: "",
        steps: [],
        mistakes: [],
        bpm: 60,
        rhythm: [200, 200, 1000],
        source: "custom",
      },
    ] as unknown as Exercise[];
    const out = migrateState({ exercises, voice: { ...initialState.voice, metronome: true } }, 12);
    expect(out.exercises?.[0]?.rhythm).toEqual([200, 200, 1000]);
    expect(out.exercises?.[0]?.bpm).toBe(60);
  });

  it("keeps old data intact when nothing rhythm-related was stored", () => {
    const out = migrateState({}, 12);
    expect(out.exercises).toBeUndefined();
    expect(out.voice?.metronome).toBe(false);
  });
});
