import { createServerFn } from "@tanstack/react-start";
import { FunctionCallingConfigMode, GoogleGenAI, Type } from "@google/genai";
import { z } from "zod";
import { normalizeAiContent } from "./ai-content";
import { MUSCLES } from "./types";

const Providers = z.enum(["gemini", "openai"]);
const Keys = z.array(z.string().min(4)).min(1).max(10);

const Input = z.object({
  provider: Providers,
  keys: Keys,
  baseUrl: z.string().url().optional().or(z.literal("")),
  model: z.string().min(1),
  system: z.string().max(8000),
  prompt: z.string().max(20000),
});

/** Numeric HTTP status of a thrown error, if it carries one (fetch Response or SDK ApiError). */
export function statusOf(e: unknown): number | null {
  const s = (e as { status?: unknown } | null)?.status;
  return typeof s === "number" ? s : null;
}

/** Maps an upstream HTTP status to a clean Russian error for the user. */
export function mapHttpError(status: number, body: string): Error {
  if (status === 401 || status === 403 || isBadKeyMessage(body))
    return new Error("ИИ-ключ не принят. Проверьте его в настройках.");
  if (status === 429) return new Error("Лимит запросов ИИ исчерпан. Попробуйте чуть позже.");
  return new Error(`ИИ-сервис вернул ошибку ${status}: ${body.slice(0, 200)}`);
}

/**
 * Gemini reports an invalid key as 400 INVALID_ARGUMENT ("API key not valid"),
 * not 401/403 — detect it via the message so rotation treats it as a dead key.
 */
function isBadKeyMessage(body: string): boolean {
  return /api[^a-z0-9]{0,5}key[^a-z0-9]{0,12}(not valid|invalid|expired|missing)/i.test(body);
}

async function callOnce(
  provider: z.infer<typeof Providers>,
  apiKey: string,
  baseUrl: string | undefined,
  model: string,
  system: string,
  prompt: string,
): Promise<string> {
  let res: Response;
  if (provider === "gemini") {
    res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: "application/json" },
        }),
      },
    );
  } else {
    const base = (baseUrl || "https://api.openai.com/v1").replace(/\/$/, "");
    res = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: system },
          { role: "user", content: prompt },
        ],
        response_format: { type: "json_object" },
      }),
    });
  }
  const text = await res.text();
  if (!res.ok) throw Object.assign(mapHttpError(res.status, text), { status: res.status });
  const j = JSON.parse(text);
  const out =
    provider === "gemini"
      ? (j.candidates?.[0]?.content?.parts ?? [])
          .map((p: { text?: unknown }) => normalizeAiContent(p?.text))
          .join("")
      : normalizeAiContent(j.choices?.[0]?.message?.content);
  if (!out) throw new Error("ИИ не вернул ответ.");
  return out;
}

/**
 * Calls the user's own AI provider, rotating through their keys.
 * A key whose quota is exhausted (429/5xx) is skipped in favour of the next one.
 * Returns the index of the key that worked so the client can prefer it next time.
 */
export async function askWithKeys(
  provider: z.infer<typeof Providers>,
  keys: readonly string[],
  baseUrl: string | undefined,
  model: string,
  system: string,
  prompt: string,
): Promise<{ text: string; keyIndex: number }> {
  let last: unknown = null;
  for (let i = 0; i < keys.length; i++) {
    try {
      const text = await callOnce(provider, keys[i]!, baseUrl || undefined, model, system, prompt);
      return { text, keyIndex: i };
    } catch (e) {
      // Quota/dead-key errors: try the next key. Anything without a status fails fast.
      if (statusOf(e) == null) throw e;
      last = e;
    }
  }
  throw last instanceof Error ? last : new Error("Лимиты исчерпаны на всех ключах.");
}

export const askAi = createServerFn({ method: "POST" })
  .validator((d) => Input.parse(d))
  .handler(async ({ data }) =>
    askWithKeys(
      data.provider,
      data.keys,
      data.baseUrl || undefined,
      data.model,
      data.system,
      data.prompt,
    ),
  );

// ---------- Health check (cheap: lists models, no generation) ----------

const PingInput = z.object({
  provider: Providers,
  keys: Keys,
  baseUrl: z.string().url().optional().or(z.literal("")),
});

async function pingOnce(
  provider: z.infer<typeof Providers>,
  apiKey: string,
  baseUrl: string | undefined,
): Promise<number> {
  const t = Date.now();
  let res: Response;
  if (provider === "gemini") {
    res = await fetch("https://generativelanguage.googleapis.com/v1beta/models?pageSize=5", {
      headers: { "x-goog-api-key": apiKey },
    });
  } else {
    const base = (baseUrl || "https://api.openai.com/v1").replace(/\/$/, "");
    res = await fetch(`${base}/models`, { headers: { Authorization: `Bearer ${apiKey}` } });
  }
  const text = await res.text();
  if (!res.ok) throw Object.assign(mapHttpError(res.status, text), { status: res.status });
  const j = JSON.parse(text);
  const count = Array.isArray(j.models)
    ? j.models.length
    : Array.isArray(j.data)
      ? j.data.length
      : 0;
  if (!count) throw new Error("Сервис ответил, но список моделей пуст.");
  return Date.now() - t;
}

/** Checks which key works without spending generation quota. Returns ms of the working key. */
export const pingAi = createServerFn({ method: "POST" })
  .validator((d) => PingInput.parse(d))
  .handler(async ({ data }) => {
    let last: unknown = null;
    for (let i = 0; i < data.keys.length; i++) {
      try {
        const ms = await pingOnce(data.provider, data.keys[i]!, data.baseUrl || undefined);
        return { keyIndex: i, ms };
      } catch (e) {
        if (statusOf(e) == null) throw e;
        last = e;
      }
    }
    throw last instanceof Error ? last : new Error("Лимиты исчерпаны на всех ключах.");
  });

// ---------- YouTube workout split (Gemini only) ----------

const SplitInput = z.object({
  keys: Keys,
  model: z.string().min(1),
  youtubeUrl: z.string().url().max(500),
});

const ClipArg = z.object({ start: z.number().nonnegative(), end: z.number().positive() });
const ExerciseArg = z.object({
  name: z.string().min(1).max(200),
  muscles: z.array(z.string()).default([]),
  category: z.string().default(""),
  mode: z.enum(["reps", "time"]).optional(),
  reps: z.number().optional(),
  seconds: z.number().optional(),
  sets: z.number().optional(),
  tempoBpm: z.number().optional(),
  equipment: z.string().default(""),
  description: z.string().default(""),
  steps: z.array(z.string()).default([]),
  mistakes: z.array(z.string()).default([]),
  clips: z.array(ClipArg).default([]),
});
const SplitArgs = z.object({ exercises: z.array(ExerciseArg).min(1).max(50) });
export type SplitExercise = z.infer<typeof ExerciseArg>;

const MUSCLE_LIST = Object.keys(MUSCLES).join(", ");

const importWorkoutDecl = {
  name: "import_workout",
  description:
    "Save the exercises recognized in the workout video. Call exactly once with the full list. If the video contains no workout exercises, do not call it and explain in plain text instead.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      exercises: {
        type: Type.ARRAY,
        description: "Exercises in the order they appear in the video (max 30).",
        items: {
          type: Type.OBJECT,
          properties: {
            name: { type: Type.STRING, description: "Exercise name in Russian." },
            muscles: {
              type: Type.ARRAY,
              description: `Target muscles, ONLY from this list (first = main): ${MUSCLE_LIST}.`,
              items: { type: Type.STRING },
            },
            category: { type: Type.STRING, description: "One of: strength, cardio, stretch." },
            mode: {
              type: Type.STRING,
              description: "reps for counted exercises, time for holds/planks/cardio.",
            },
            reps: { type: Type.NUMBER, description: "Suggested reps per set (if mode=reps)." },
            seconds: {
              type: Type.NUMBER,
              description: "Suggested duration in seconds (if mode=time).",
            },
            sets: {
              type: Type.NUMBER,
              description:
                "Number of sets or rounds spoken in the video (e.g. 'делаем 3 круга'). If not mentioned — 1.",
            },
            tempoBpm: {
              type: Type.NUMBER,
              description:
                "Recommended tempo in beats per minute, if mentioned or can be estimated (40-200). Omit if unclear.",
            },
            equipment: {
              type: Type.STRING,
              description: "Equipment in Russian, e.g. гантели, коврик, без инвентаря.",
            },
            description: {
              type: Type.STRING,
              description: "One short sentence in Russian: what it trains.",
            },
            steps: {
              type: Type.ARRAY,
              description: "3-8 technique steps in Russian, imperative mood.",
              items: { type: Type.STRING },
            },
            mistakes: {
              type: Type.ARRAY,
              description: "2-4 common mistakes in Russian.",
              items: { type: Type.STRING },
            },
            clips: {
              type: Type.ARRAY,
              description:
                "Video segments for this exercise in SECONDS from the video start. Usually one clip covering its main demonstration.",
              items: {
                type: Type.OBJECT,
                properties: {
                  start: { type: Type.NUMBER, description: "Segment start in seconds." },
                  end: {
                    type: Type.NUMBER,
                    description: "Segment end in seconds, must be greater than start.",
                  },
                },
                required: ["start", "end"],
              },
            },
          },
          required: ["name", "muscles", "category", "steps", "clips"],
        },
      },
    },
    required: ["exercises"],
  },
};

const SPLIT_INSTRUCTION = [
  "Ты — опытный тренер. Посмотри это видео с комплексом упражнений и разбери его на отдельные упражнения.",
  "Ответь ТОЛЬКО вызовом функции import_workout со всем списком сразу.",
  "Все названия, шаги, ошибки и описания — на русском языке.",
  "Таймкоды clips — в секундах от начала видео, конец строго больше начала.",
  "Если в видео нет тренировочных упражнений, функцию не вызывай и объясни обычным текстом.",
].join(" ");

/**
 * Splits a public YouTube workout video into exercises via Gemini
 * (YouTube URL as FileData part + function calling, official @google/genai SDK).
 * Rotates through the user's keys on quota errors like askAi does.
 */
export const aiSplitWorkout = createServerFn({ method: "POST" })
  .validator((d) => SplitInput.parse(d))
  .handler(async ({ data }) => {
    if (
      !/(^|\.)(youtube\.com|youtu\.be)$/i.test(
        new URL(data.youtubeUrl).hostname.replace(/^(www|m|music)\./, ""),
      )
    ) {
      throw new Error("Это не ссылка на YouTube.");
    }
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
    const callSplit = async (apiKey: string) => {
      // Bounded request: no silent SDK retries (attempts: 1) and a hard timeout —
      // otherwise 503 storms made the client spinner "hang" for many minutes.
      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: { timeout: 180_000, retryOptions: { attempts: 1 } },
      });
      const response = await ai.models.generateContent({
        model: data.model,
        contents: [{ fileData: { fileUri: data.youtubeUrl } }, { text: SPLIT_INSTRUCTION }],
        config: {
          tools: [{ functionDeclarations: [importWorkoutDecl] }],
          toolConfig: {
            functionCallingConfig: {
              mode: FunctionCallingConfigMode.ANY,
              allowedFunctionNames: ["import_workout"],
            },
          },
        },
      });
      const call = (response.functionCalls ?? []).find((c) => c.name === "import_workout");
      if (!call) {
        throw new Error(
          `В видео не найдено упражнений.${response.text ? ` Ответ модели: ${response.text.slice(0, 300)}` : " Возможно, ролик приватный или это не тренировка."}`,
        );
      }
      const parsed = SplitArgs.safeParse(call.args);
      if (!parsed.success)
        throw new Error("Модель вернула упражнения в неверном формате. Попробуйте ещё раз.");
      const exercises = parsed.data.exercises.map((e) => ({
        ...e,
        clips: e.clips.filter((c) => c.end > c.start).sort((a, b) => a.start - b.start),
      }));
      if (!exercises.length) throw new Error("В видео не найдено упражнений.");
      return exercises;
    };

    let last: unknown = null;
    let quotaHit = false;
    let overloaded = false;
    for (let i = 0; i < data.keys.length; i++) {
      // Up to 2 attempts per key: a controlled retry for 5xx (overloaded model)
      // after a fixed pause. 429 means this key's quota is gone — rotate instead.
      for (let attempt = 1; ; attempt++) {
        try {
          const exercises = await callSplit(data.keys[i]!);
          return { exercises, keyIndex: i };
        } catch (e) {
          const status = statusOf(e);
          if (status == null) throw e;
          const msg = e instanceof Error ? e.message : "";
          if (status === 400 && !isBadKeyMessage(msg))
            throw new Error(
              "Не удалось прочитать видео. Проверьте, что ролик публичный, и модель поддерживает видео.",
            );
          if (status >= 500) {
            overloaded = true;
            last = e;
            if (attempt === 1) {
              await sleep(8_000);
              continue;
            }
            break;
          }
          if (status === 429) {
            quotaHit = true;
            last = e;
            break;
          }
          last = new Error("ИИ-ключ не принят. Проверьте его в настройках.");
          break;
        }
      }
    }
    if (overloaded)
      throw new Error(
        "Модель Gemini сейчас перегружена (высокая нагрузка). Попробуйте через несколько минут или выберите другую модель в настройках.",
      );
    if (quotaHit)
      throw new Error(
        data.keys.length > 1
          ? `Лимиты исчерпаны на всех ключах (${data.keys.length}). Попробуйте позже.`
          : "Лимит запросов ИИ исчерпан. Попробуйте чуть позже.",
      );
    if (last instanceof Error) throw last;
    throw new Error("Лимиты исчерпаны на всех ключах. Попробуйте позже.");
  });
