import { describe, expect, it } from "vitest";
import { initialState, migrateState } from "../store";

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
