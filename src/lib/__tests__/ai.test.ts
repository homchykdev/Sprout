import { afterEach, describe, expect, it, vi } from "vitest";
import { maskKey, promoteKey } from "../ai-keys";
import { askWithKeys, mapHttpError, statusOf } from "../ai.functions";
import {
  articleExercise,
  buildWorkoutFromExercises,
  buildWorkoutFromSplit,
  clampSets,
  clampTempoBpm,
  mapMuscles,
  type ArticleExercise,
} from "../clients";
import { migrateState } from "../store";
import type { Exercise } from "../types";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ai key helpers", () => {
  it("masks keys keeping the last 4 chars", () => {
    expect(maskKey("AIzaSyD-1234")).toBe("••••••1234");
    expect(maskKey("short")).toBe("•••••");
  });
  it("promotes the working key to the front", () => {
    expect(promoteKey(["a", "b", "c"], 2)).toEqual(["c", "a", "b"]);
    expect(promoteKey(["a", "b"], 0)).toEqual(["a", "b"]);
    expect(promoteKey(["a"], 5)).toEqual(["a"]);
  });

  it("preserves upstream status on mapped errors so key rotation can continue", () => {
    expect(statusOf(mapHttpError(429, "quota"))).toBe(429);
    expect(statusOf(mapHttpError(401, "unauthorized"))).toBe(401);
    expect(statusOf(mapHttpError(503, "unavailable"))).toBe(503);
  });

  it("tries the next key after an upstream quota response", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(new Response("quota", { status: 429 }))
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ choices: [{ message: { content: "ok" } }] }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        ),
    );

    const result = await askWithKeys(
      "openai",
      ["key-one", "key-two"],
      "",
      "model",
      "system",
      "prompt",
    );

    expect(result).toEqual({ text: "ok", keyIndex: 1 });
    const requests = vi.mocked(fetch).mock.calls;
    expect(requests).toHaveLength(2);
    expect(new Headers(requests[0]?.[1]?.headers).get("Authorization")).toBe("Bearer key-one");
    expect(new Headers(requests[1]?.[1]?.headers).get("Authorization")).toBe("Bearer key-two");
  });
});

describe("canonical muscle passthrough", () => {
  it("accepts our own muscle keys (Gemini returns these)", () => {
    expect(mapMuscles(["biceps", "front-deltoids"])).toEqual(["biceps", "front-deltoids"]);
  });
  it("still maps English muscle names", () => {
    expect(mapMuscles(["Biceps", "Chest"])).toEqual(["biceps", "chest"]);
  });
});

describe("article import client helpers", () => {
  const art: ArticleExercise = {
    name: "Округление спины",
    muscles: ["upper-back"],
    category: "strength",
    mode: "reps",
    reps: 10,
    seconds: 40,
    equipment: "",
    description: "Тренирует ромбовидные мышцы",
    steps: ["Сядь", "Округли спину"],
    mistakes: ["Резкие движения"],
    videoUrl: "https://kinescope.io/embed/AAA",
  };
  it("builds an exercise keeping the media link and ai source", () => {
    const ex = articleExercise(art);
    expect(ex.id).toMatch(/^ai-/);
    expect(ex.source).toBe("ai");
    expect(ex.videoUrl).toBe("https://kinescope.io/embed/AAA");
    expect(ex.muscles).toEqual(["upper-back"]);
    expect(ex.category).toBe("strength");
    expect(ex.mode).toBe("reps");
    expect(ex.reps).toBe(10);
    expect(ex.steps).toEqual(["Сядь", "Округли спину"]);
  });
  it("builds a workout with one set per article exercise", () => {
    const ex = articleExercise(art);
    const w = buildWorkoutFromExercises([ex], "Комплекс из статьи");
    expect(w.name).toBe("Комплекс из статьи");
    expect(w.items).toHaveLength(1);
    expect(w.items[0]).toMatchObject({ exerciseId: ex.id, sets: 1, reps: 10, rest: 60 });
  });
});

describe("ai.keys migration v3 -> v4", () => {
  const old = { provider: "gemini", apiKey: "k1", baseUrl: "", model: "m" };
  it("wraps the legacy single key into keys[]", () => {
    const out = migrateState({ ai: old } as never, 3);
    expect(out.ai).toMatchObject({ provider: "gemini", keys: ["k1"], model: "m" });
  });
  it("keeps existing keys[] untouched", () => {
    const out = migrateState({ ai: { ...old, keys: ["a", "b"] } } as never, 4);
    expect(out.ai).toMatchObject({ keys: ["a", "b"] });
  });
  it("empty legacy key becomes empty list", () => {
    const out = migrateState({ ai: { ...old, apiKey: "" } } as never, 3);
    expect(out.ai).toMatchObject({ keys: [] });
  });
});

describe("split value clamps", () => {
  it("clampSets: video value or 1 by default, capped at 10", () => {
    expect(clampSets(3)).toBe(3);
    expect(clampSets(2.6)).toBe(3);
    expect(clampSets(0)).toBe(1);
    expect(clampSets(99)).toBe(10);
    expect(clampSets(undefined)).toBe(1);
    expect(clampSets("3")).toBe(1);
  });
  it("clampTempoBpm: only plausible tempos survive", () => {
    expect(clampTempoBpm(120)).toBe(120);
    expect(clampTempoBpm(62.4)).toBe(62);
    expect(clampTempoBpm(30)).toBeUndefined();
    expect(clampTempoBpm(300)).toBeUndefined();
    expect(clampTempoBpm(undefined)).toBeUndefined();
  });
});

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
  source: "ai",
  ...p,
});

describe("buildWorkoutFromSplit", () => {
  const split = {
    exercises: [
      ex({ id: "e1", bpm: 90 }),
      ex({
        id: "e2",
        name: "Планка",
        category: "stretch",
        mode: "time",
        seconds: 60,
        bpm: undefined,
      }),
    ],
    sets: { e1: 3, e2: 1 },
  };
  it("builds items with sets, rest by category and copied tempo", () => {
    const w = buildWorkoutFromSplit(split, ["e1", "e2"], "Утро");
    expect(w.name).toBe("Утро");
    expect(w.emoji).toBe("🎬");
    expect(w.items).toMatchObject([
      { exerciseId: "e1", sets: 3, reps: 15, rest: 60, bpm: 90 },
      { exerciseId: "e2", sets: 1, seconds: 60, rest: 30 },
    ]);
    expect(w.items[1]).not.toHaveProperty("bpm");
  });
  it("keeps only selected ids and defaults the name", () => {
    const w = buildWorkoutFromSplit(split, ["e2"], "  ");
    expect(w.name).toBe("Комплекс с YouTube");
    expect(w.items.map((i) => i.exerciseId)).toEqual(["e2"]);
  });
});
