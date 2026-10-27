import { describe, expect, it } from "vitest";
import { cleanFeedback, toParts } from "@/components/game/FeedbackEditor";
import { feedbackSuffix, feedbackSummary } from "../clients";
import { migrateState } from "../store";
import type { Exercise } from "../types";

const ex = (p: Partial<Exercise>): Exercise => ({
  id: "e1",
  name: "Присед",
  muscles: ["quadriceps"],
  category: "strength",
  mode: "reps",
  reps: 15,
  seconds: 40,
  equipment: "",
  description: "",
  steps: [],
  mistakes: [],
  source: "seed",
  ...p,
});

describe("feedbackSuffix / feedbackSummary (II prompt context)", () => {
  it("rated exercise gets a hint, unrated stays plain", () => {
    expect(feedbackSuffix(ex({}))).toBe("");
    expect(feedbackSuffix(ex({ feedback: { difficulty: 8, verdict: "dislike" } }))).toBe(
      " (сложность: 8/10, дизлайк)",
    );
    expect(feedbackSuffix(ex({ feedback: { verdict: "like" } }))).toBe(" (лайк)");
  });

  it("library summary is empty without ratings", () => {
    expect(feedbackSummary([ex({})])).toBe("");
  });

  it("library summary counts likes and averages difficulty", () => {
    const s = feedbackSummary([
      ex({ feedback: { difficulty: 6, verdict: "like" } }),
      ex({ feedback: { difficulty: 8 } }),
      ex({ feedback: { difficulty: 7, verdict: "dislike" } }),
      ex({}),
    ]);
    expect(s).toContain("средняя ощущаемая сложность: 7.0/10");
    expect(s).toContain("лайков: 1");
    expect(s).toContain("дизлайков: 1");
  });
});

describe("migrateState · user feedback fields (v11)", () => {
  it("passes existing feedback through v10 -> v11", () => {
    const out = migrateState(
      { exercises: [ex({ feedback: { difficulty: 7, verdict: "like" } })] } as never,
      10,
    );
    expect(out.exercises?.[0]?.feedback).toEqual({ difficulty: 7, verdict: "like" });
  });
});

describe("cleanFeedback", () => {
  it("keeps untouched base fields", () => {
    expect(cleanFeedback({ difficulty: 5, verdict: "like" }, {})).toEqual({
      difficulty: 5,
      verdict: "like",
    });
  });
  it("clears verdict, keeps difficulty", () => {
    expect(cleanFeedback({ difficulty: 5, verdict: "like" }, { verdict: undefined })).toEqual({
      difficulty: 5,
    });
  });
  it("clears difficulty, keeps verdict (difficulty is optional)", () => {
    expect(cleanFeedback({ difficulty: 5, verdict: "like" }, { difficulty: undefined })).toEqual({
      verdict: "like",
    });
  });
  it("undefined when nothing is set", () => {
    expect(cleanFeedback(undefined, { verdict: undefined })).toBeUndefined();
  });
});

describe("toParts", () => {
  it("splits feedback into slider and toggle state", () => {
    expect(toParts({ difficulty: 4, verdict: "dislike" })).toEqual({ value: 4, isLike: false });
    expect(toParts(undefined)).toEqual({ value: undefined, isLike: undefined });
  });
});
