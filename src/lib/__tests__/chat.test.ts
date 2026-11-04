import { beforeEach, describe, expect, it } from "vitest";
import { UrlRetrievalStatus } from "@google/genai";
import { formatChatKeyFailures } from "../chat.functions";
import { buildChatFile, countChatRecords, parseChatFile } from "../chat/backup";
import { mergeFacts } from "../chat/memory";
import { extractGroundedSources } from "../chat/grounding";
import { buildAppSummary, buildSystemPrompt } from "../chat/prompt";
import { applyAction, parseActions } from "../chat/sanitize";
import { historyWindow, useChat } from "../chat/store";
import { DEFAULT_PERMISSIONS, type ChatMessage, type ChatPermissions } from "../chat/types";
import { useApp } from "../store";
import type { Exercise } from "../types";

const ex = (id: string, name: string): Exercise => ({
  id,
  name,
  muscles: ["chest"],
  category: "strength",
  mode: "reps",
  reps: 10,
  seconds: 30,
  equipment: "",
  description: "",
  steps: [],
  mistakes: [],
  source: "ai",
});

const ctx = () => ({
  exercises: useApp.getState().exercises,
  workouts: useApp.getState().workouts,
});

describe("chat memory", () => {
  it("learns without duplicates, forgets verbatim and caps at 20", () => {
    let facts = mergeFacts([], ["любит тягу", "аллергия на лак"], []);
    facts = mergeFacts(facts, ["любит тягу", "не любит бег"], []);
    expect(facts).toEqual(["любит тягу", "аллергия на лак", "не любит бег"]);
    facts = mergeFacts(facts, [], ["аллергия на лак"]);
    expect(facts).toEqual(["любит тягу", "не любит бег"]);
    const many = Array.from({ length: 30 }, (_, i) => `факт ${i}`);
    expect(mergeFacts(many, [], [])).toHaveLength(20);
    expect(mergeFacts(many, [], [])[0]).toBe("факт 10");
  });
});

describe("chat actions sanitize", () => {
  it("creates a sanitized exercise from the model payload", () => {
    const actions = parseActions(
      [
        {
          kind: "create_exercise",
          data: JSON.stringify({
            name: " Разгибание рук с резинкой ",
            muscles: ["triceps", "шея-фантазия"],
            category: "strength",
            mode: "reps",
            reps: 15,
            seconds: "abc",
            steps: ["Встать", ""],
          }),
        },
      ],
      DEFAULT_PERMISSIONS,
      ctx(),
    );
    expect(actions).toHaveLength(1);
    const payload = actions[0]!.payload as Exercise;
    expect(payload.name).toBe("Разгибание рук с резинкой");
    expect(payload.muscles).toEqual(["triceps"]);
    expect(payload.reps).toBe(15);
    expect(payload.seconds).toBe(40); // fallback
    expect(payload.id).toMatch(/^ai-/);
  });

  it("drops actions forbidden by permissions and invalid payloads", () => {
    const off: ChatPermissions = { ...DEFAULT_PERMISSIONS, exercises: "off" };
    expect(
      parseActions(
        [{ kind: "create_exercise", data: JSON.stringify({ name: "Тест" }) }],
        off,
        ctx(),
      ),
    ).toEqual([]);
    expect(
      parseActions(
        [
          { kind: "delete_everything", data: "{}" },
          { kind: "create_exercise", data: "not json" },
          {
            kind: "add_plan_step",
            data: JSON.stringify({ afterIndex: 0, step: { kind: "workout", workoutId: "nope" } }),
          },
        ],
        DEFAULT_PERMISSIONS,
        ctx(),
      ),
    ).toEqual([]);
  });

  it("update_exercise needs a real id and keeps the base fields", () => {
    const base = ex("ex-test", "Сгибание");
    const actions = parseActions(
      [
        {
          kind: "update_exercise",
          data: JSON.stringify({ id: base.id, name: "Обновлено", description: "новое описание" }),
        },
        // non-existing id is dropped
        { kind: "update_exercise", data: JSON.stringify({ id: "ghost", name: "Призрак" }) },
      ],
      DEFAULT_PERMISSIONS,
      { exercises: [base], workouts: [] },
    );
    expect(actions).toHaveLength(1);
    const payload = actions[0]!.payload as Exercise;
    expect(payload.id).toBe(base.id);
    expect(payload.name).toBe("Обновлено");
    expect(payload.muscles).toEqual(base.muscles);
    expect(payload.reps).toBe(base.reps);
  });

  it("create_workout and add_plan_step round-trip into the store", () => {
    const list = useApp.getState().exercises;
    const target = ex(list[0]!.id, list[0]!.name);
    const actions = parseActions(
      [
        {
          kind: "create_workout",
          data: JSON.stringify({
            name: "Верх тела ИИ",
            emoji: "🔥🙂",
            items: [{ exerciseId: target.id, sets: 4, rest: 60 }],
          }),
        },
      ],
      DEFAULT_PERMISSIONS,
      { exercises: [target], workouts: [] },
    );
    expect(actions).toHaveLength(1);
    expect(applyAction(actions[0]!)).toBe(true);
    const stored = useApp.getState().workouts.find((w) => w.name === "Верх тела ИИ");
    expect(stored?.emoji).toBe("🔥"); // first grapheme only
    expect(stored?.items[0]?.exerciseId).toBe(target.id);

    const steps = parseActions(
      [
        {
          kind: "add_plan_step",
          data: JSON.stringify({ afterIndex: 0, step: { kind: "workout", workoutId: stored!.id } }),
        },
      ],
      DEFAULT_PERMISSIONS,
      ctx(),
    );
    expect(applyAction(steps[0]!)).toBe(true);
    expect(useApp.getState().plan.steps.some((s) => s.workoutId === stored!.id)).toBe(true);
  });
});

describe("chat prompts", () => {
  it("summary stays compact but tells the truth about the plan", () => {
    const summary = buildAppSummary(useApp.getState());
    expect(summary).toContain("Уровень");
    expect(summary).toContain("Цикл плана");
    expect(summary.length).toBeLessThan(6000);
  });

  it("system prompt carries the JSON contract and reflects permissions", () => {
    const p = buildSystemPrompt("SUMMARY", ["любит тягу"], {
      exercises: "ask",
      workouts: "off",
      plan: "always",
    });
    expect(p).toContain("JSON");
    expect(p).toContain("SUMMARY");
    expect(p).toContain("любит тягу");
    expect(p).toContain("create_exercise");
    // workouts are "off" → the kind disappears from the allowed list
    expect(p).toMatch(
      /Сейчас действуют только эти: create_exercise, update_exercise, add_plan_step/,
    );
  });

  it("system prompt forbids all actions when everything is off", () => {
    const p = buildSystemPrompt("S", [], { exercises: "off", workouts: "off", plan: "off" });
    expect(p).toContain("НИКАКИЕ — предложения изменений запрещены");
  });

  it("explains web tools and anti-hallucination rules for either provider mode", () => {
    const permissions = { exercises: "ask", workouts: "ask", plan: "ask" } as const;
    const withGrounding = buildSystemPrompt("S", [], permissions, true);
    const withoutGrounding = buildSystemPrompt("S", [], permissions);
    expect(withGrounding).toContain("Google Search и URL context");
    expect(withGrounding).toContain("Не добавляй URL в поле reply");
    expect(withoutGrounding).toContain("веб-поиск и URL context недоступны");
    expect(withGrounding).toContain("Не отказывай автоматически");
  });
});

describe("chat grounding sources", () => {
  it("returns only HTTPS Google Search sources and excludes URL Context-only links", () => {
    const sources = extractGroundedSources({
      groundingMetadata: {
        groundingChunks: [
          { web: { uri: "https://example.com/article", title: "Article" } },
          { web: { uri: "javascript:alert(1)", title: "Unsafe" } },
        ],
      },
      urlContextMetadata: {
        urlMetadata: [
          {
            retrievedUrl: "https://example.com/from-url-context",
            urlRetrievalStatus: UrlRetrievalStatus.URL_RETRIEVAL_STATUS_SUCCESS,
          },
        ],
      },
    });
    expect(sources).toEqual([{ title: "Article", url: "https://example.com/article" }]);
  });
});

describe("chat key error diagnostics", () => {
  it("reports the provider and attempted key numbers without revealing secrets", () => {
    const error = formatChatKeyFailures(
      "openai",
      "https://api.example.test/v1",
      ["secret-key-one", "secret-key-two"],
      [
        {
          keyIndex: 0,
          key: "secret-key-one",
          error: Object.assign(new Error("quota"), { status: 429 }),
        },
        { keyIndex: 1, key: "secret-key-two", error: new Error("authentication failed") },
      ],
    );

    expect(error.message).toContain("Источник: OpenAI-compatible (api.example.test)");
    expect(error.message).toContain("ключ 1/2 (••••-one): quota");
    expect(error.message).toContain("ключ 2/2 (••••-two): authentication failed");
    expect(error.message).not.toContain("secret-key");
  });

  it("identifies Gemini as the source for non-HTTP errors", () => {
    const error = formatChatKeyFailures(
      "gemini",
      undefined,
      ["gemini-secret"],
      [{ keyIndex: 0, key: "gemini-secret", error: new Error("request failed") }],
    );

    expect(error.message).toContain("Источник: Google Gemini");
    expect(error.message).toContain("ключ 1/1");
    expect(error.message).not.toContain("gemini-secret");
  });
});

describe("chat store", () => {
  beforeEach(() => {
    useChat.getState().clearAll();
  });

  it("history window caps the newest messages", () => {
    const messages: ChatMessage[] = Array.from({ length: 25 }, (_, i) => ({
      id: `m${i}`,
      role: "user",
      text: String(i),
    }));
    const window = historyWindow(messages);
    expect(window).toHaveLength(20);
    expect(window[0]?.text).toBe("5");
  });

  it("creates, auto-titles and deletes sessions keeping memory", () => {
    const a = useChat.getState().create("Первый чат");
    useChat.getState().addMessage(a.id, { id: "u1", role: "user", text: "Привет" });

    const withMsg = useChat.getState();
    expect(withMsg.sessions[0]?.title).toBe("Первый чат"); // manual title survives
    withMsg.remember(["любит тягу"], []);
    withMsg.remove(withMsg.activeId!);

    const after = useChat.getState();
    expect(after.activeId).toBeNull();
    expect(after.memory).toEqual(["любит тягу"]);
  });

  it("auto-titles only when the session still has the placeholder name", () => {
    const s = useChat.getState();
    s.create(""); // placeholder "Новый чат"
    useChat.getState().addMessage(useChat.getState().activeId!, {
      id: "u1",
      role: "user",
      text: "Составь план на неделю",
    });
    expect(useChat.getState().sessions[0]?.title).toBe("Составь план на неделю");
  });

  it("backup round-trips", () => {
    const a = useChat.getState().create("Экспорт");
    useChat.getState().addMessage(a.id, {
      id: "u1",
      role: "assistant",
      text: "Привет",
      sources: [{ title: "Источник", url: "https://example.com" }],
    });
    const file = buildChatFile();
    useChat.getState().clearAll();

    const parsed = parseChatFile(JSON.stringify(file));
    useChat.getState().importBackup(parsed);
    expect(useChat.getState().sessions.map((x) => x.title)).toContain("Экспорт");
    expect(useChat.getState().sessions[0]?.messages[0]?.sources).toEqual([
      { title: "Источник", url: "https://example.com" },
    ]);
    expect(countChatRecords(parsed).count).toBe(1);
  });

  it("rejects foreign backup files", () => {
    expect(() => parseChatFile(`{"app":"pulse","section":"library","data":{}}`)).toThrow(
      "другого раздела",
    );
    expect(() => parseChatFile("nope")).toThrow();
  });
});
