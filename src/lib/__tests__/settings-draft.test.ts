import { describe, expect, it } from "vitest";
import { initialState } from "../store";
import { draftToState, isDraftDirty, pickDraft, type SettingsDraft } from "../settings-draft";

// The settings draft shape derived from the default store state.
const baseDraft = (): SettingsDraft => pickDraft({ ...initialState, since: "2026-01-01" });

describe("pickDraft", () => {
  it("copies all editable settings from the store", () => {
    const s = {
      ...initialState,
      name: "Таня",
      voice: { ...initialState.voice, rate: 1.2 },
      plan: { ...initialState.plan, settings: { ...initialState.plan.settings, bonusMax: 2 } },
    };
    const d = pickDraft(s);
    expect(d.name).toBe("Таня");
    expect(d.voice.rate).toBe(1.2);
    expect(d.planSettings.bonusMax).toBe(2);
  });

  it("copies arrays so later edits do not leak into the store", () => {
    const s = initialState;
    const d = pickDraft(s);
    d.ffmpegOptions.push("--extra");
    d.ai.keys.push("secret-key");
    expect(s.ffmpegOptions.length).toBe(initialState.ffmpegOptions.length);
    expect(s.ai.keys).toEqual(initialState.ai.keys);
  });
});

describe("isDraftDirty", () => {
  it("is clean for equal drafts", () => {
    expect(isDraftDirty(baseDraft(), baseDraft())).toBe(false);
  });

  it("detects nested voice changes", () => {
    const d = baseDraft();
    expect(isDraftDirty({ ...d, voice: { ...d.voice, beeps: false } }, d)).toBe(true);
  });

  it("detects plan settings changes", () => {
    const d = baseDraft();
    expect(isDraftDirty({ ...d, planSettings: { ...d.planSettings, freezeMax: 9 } }, d)).toBe(true);
  });

  it("detects array changes (keys, ffmpeg options)", () => {
    const d = baseDraft();
    expect(isDraftDirty({ ...d, ffmpegOptions: [...d.ffmpegOptions, "-x"] }, d)).toBe(true);
    expect(isDraftDirty({ ...d, ai: { ...d.ai, keys: ["k"] } }, d)).toBe(true);
  });

  it("order of ffmpeg options matters", () => {
    const d = baseDraft();
    const rev = { ...d, ffmpegOptions: [...d.ffmpegOptions].reverse() };
    expect(isDraftDirty(rev, d)).toBe(true);
  });

  it("change and revert equals clean", () => {
    const d = baseDraft();
    const dirtied = { ...d, reminders: { ...d.reminders, hour: 9 } };
    const reverted = { ...dirtied, reminders: { ...d.reminders } };
    expect(isDraftDirty(dirtied, d)).toBe(true);
    expect(isDraftDirty(reverted, d)).toBe(false);
  });
});

describe("draftToState", () => {
  it("keeps the plan cycle steps and only swaps settings", () => {
    const s = { ...initialState, since: "2026-01-01" };
    const d = pickDraft(s);
    const planKeys = Object.keys(s.plan).sort();
    const out = draftToState(d, s.plan);
    expect(Object.keys(out.plan!).sort()).toEqual(planKeys);
    expect(out.plan!.steps).toBe(s.plan.steps);
    expect(out.plan!.settings).toEqual(d.planSettings);
  });

  it("returns a full patch for replaceAll/importAll-style commits", () => {
    const d = baseDraft();
    const out = draftToState(d, initialState.plan);
    for (const key of [
      "name",
      "reminders",
      "photoReminder",
      "voice",
      "ai",
      "plan",
      "ffmpegKey",
      "ffmpegOptions",
      "ffmpegOut",
    ] as const) {
      expect(out).toHaveProperty(key);
    }
  });
});
