import { beforeEach, describe, expect, it } from "vitest";
import { buildChatFile, countChatRecords, parseChatFile } from "../chat/backup";
import { mergeFacts } from "../chat/memory";
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
    useChat.getState().addMessage(a.id, { id: "u1", role: "user", text: "Привет" });
    const file = buildChatFile();
    useChat.getState().clearAll();

    const parsed = parseChatFile(JSON.stringify(file));
    useChat.getState().importBackup(parsed);
    expect(useChat.getState().sessions.map((x) => x.title)).toContain("Экспорт");
    expect(countChatRecords(parsed).count).toBe(1);
  });

  it("rejects foreign backup files", () => {
    expect(() => parseChatFile(`{"app":"pulse","section":"library","data":{}}`)).toThrow(
      "другого раздела",
    );
    expect(() => parseChatFile("nope")).toThrow();
  });
});
