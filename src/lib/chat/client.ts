import { useApp } from "../store";
import {
  askChat,
  CALLS_PER_ROUND,
  MAX_TOOL_ROUNDS,
  type ChatMessageInput,
  type ChatPayload,
  type ChatRoundResult,
  type ToolCallOut,
} from "../chat.functions";
import { timedLog } from "../logger";
import { buildAppSummary, buildSystemPrompt } from "./prompt";
import { toolHandlerFor } from "./tools";
import { historyWindow, useChat } from "./store";
import type { ChatAction, ChatAppRef, ChatMessage, ChatStep } from "./types";
import { MAX_HISTORY_MESSAGES, MAX_APP_REFS } from "./types";

/** Result of one assistant turn. */
export interface ChatTurn {
  payload: ChatPayload;
  /** Actions cooked by tool handlers (ask-mode cards / always-applied). */
  toolActions: ChatAction[];
  /** Tool actions that were already applied silently (permission «always»). */
  appliedToolActions: number[];
  steps: ChatStep[];
}
/**
 * Sends the visible history plus the user's new message in a tool loop:
 * request → possible tool calls (executed client-side against the real data
 * layer) → functionResults in the next request → …≤ MAX_TOOL_ROUNDS → final
 * JSON answer. Rotates/prefer keys like `clients.ask` does. Attachments are
 * inline base64; throw early for non-Gemini providers so the UI can explain.
 */
export async function sendChat(
  sessionMessages: ChatMessage[],
  userTurn: {
    text: string;
    attachments?: { name: string; mimeType: string; base64: string }[];
    appRefs?: ChatAppRef[];
  },
  /** Called when a quiet tool step happens; the route paints it live. */
  onStep?: (step: ChatStep) => void,
): Promise<ChatTurn> {
  const app = useApp.getState();
  const ai = app.ai;
  if (!ai.keys.length) throw new Error("Добавьте ключ ИИ в настройках");
  if (ai.provider !== "gemini" && userTurn.attachments?.length)
    throw new Error("Вложения поддерживаются только с провайдером Gemini.");
  if (ai.provider !== "gemini" && userTurn.appRefs?.length)
    throw new Error("Вложения поддерживаются только с провайдером Gemini.");

  const chat = useChat.getState();
  const toolsMode = ai.provider === "gemini" && Boolean(ai.youtubeKey);
  const steps: ChatStep[] = [];
  const stepSink = { add: (label: string) => pushStep(steps, onStep, label) };

  // Stored history goes as text only: models read attachments on arrival, and
  // resending old base64 would balloon every later request. `[вложение]` marks
  // media files; app entities are reserialized from their stored ref data.
  const history: ChatMessageInput[] = historyWindow(sessionMessages).map((m) => ({
    role: m.role,
    text:
      m.role === "user" && (m.attachments?.length || m.appRefs?.length)
        ? [
            m.text,
            m.attachments?.length
              ? `[вложение: ${m.attachments.map((a) => a.name).join(", ")}]`
              : "",
            m.appRefs?.length
              ? `[данные приложения: ${m.appRefs.map((a) => `${a.kind} «${a.name}»`).join(", ")}]`
              : "",
          ]
            .filter(Boolean)
            .join("\n")
        : m.text,
  }));

  // The live turn keeps FULL app data (id, fields) inline like an attachment.
  let liveText = userTurn.text;
  const liveRefs = (userTurn.appRefs ?? []).slice(0, MAX_APP_REFS);
  if (liveRefs.length) {
    const parts = liveRefs.map((r) => `[данные приложения — ${r.kind} «${r.name}»]:\n${r.data}`);
    liveText = `${userTurn.text}\n\n${parts.join("\n\n")}`.trim();
  }
  const messages: ChatMessageInput[] = [
    ...history,
    {
      role: "user" as const,
      text: liveText,
      attachments: (userTurn.attachments ?? []).map((a) => ({
        mimeType: a.mimeType,
        base64: a.base64,
      })),
    },
  ];

  const system = buildSystemPrompt(
    buildAppSummary(app),
    chat.memory,
    chat.permissions,
    ai.provider === "gemini" && !toolsMode,
    toolsMode,
  );
  const perms = chat.permissions;
  const ctxData = () => ({ exercises: app.exercises, workouts: useApp.getState().workouts });

  const toolActions: ChatAction[] = [];
  const appliedToolActions: number[] = [];
  /** Tool rounds replayed exactly as received (plan §9). */
  const rounds: { calls: { name: string; args: string }[]; results: string[] }[] = [];
  let roundsCount = 0;
  let callsCount = 0;

  const { round: first, keyIndex } = await timedLog("ai", "Чат: запрос", () =>
    askChat({
      data: {
        provider: ai.provider,
        keys: ai.keys,
        baseUrl: ai.baseUrl,
        model: ai.model,
        system,
        messages,
        tools: toolsMode,
      },
    }),
  );
  if (keyIndex > 0) {
    // Prefer the key that still has quota next time.
    useApp.getState().set({ ai: { ...ai, keys: promoteKeys(ai.keys, keyIndex) } });
  }

  let final: ChatRoundResult = first;
  while (final.kind === "tool_calls" && roundsCount < MAX_TOOL_ROUNDS) {
    const execs: {
      name: string;
      args: string;
      result: string;
      action?: ChatAction | undefined;
    }[] = [];
    for (const call of final.calls.slice(0, CALLS_PER_ROUND)) {
      const args = parseCallArgs(call.argsJson);
      if (callsCount >= 12) {
        execs.push({
          name: call.name,
          args: call.argsJson,
          result: JSON.stringify({
            status: "error",
            message: "Достигнут лимит вызовов инструментов.",
          }),
        });
        continue;
      }
      const handler = toolHandlerFor(call.name);
      if (!handler) {
        execs.push({
          name: call.name,
          args: call.argsJson,
          result: JSON.stringify({ status: "error", message: "Неизвестный инструмент." }),
        });
        continue;
      }
      stepSink.add(stepLabelFor(call));
      const outcome = await handler(args, {
        perms,
        read: ctxData,
        steps: { add: (label) => stepSink.add(normalizeStep(label)) },
      });
      callsCount++;
      if (outcome.action) {
        toolActions.push(outcome.action);
        if (outcome.applied) appliedToolActions.push(toolActions.length - 1);
      }
      execs.push({
        name: call.name,
        args: call.argsJson,
        result: JSON.stringify(outcome.response).slice(0, 40_000),
        ...(outcome.action ? { action: outcome.action } : {}),
      });
    }
    rounds.push({
      calls: execs.map((e) => ({ name: e.name, args: e.args })),
      results: execs.map((e) => e.result),
    });
    roundsCount++;

    const { round: next } = await timedLog(`ai`, `Чат: раунд ${roundsCount + 1}`, () =>
      askChat({
        data: {
          provider: ai.provider,
          keys: ai.keys,
          baseUrl: ai.baseUrl,
          model: ai.model,
          system,
          messages,
          tools: true,
          rounds,
        },
      }),
    );
    final = next;
  }

  if (final.kind === "tool_calls") {
    // Ran out of rounds: convert into an honest final answer instead of a hang.
    final = {
      kind: "final",
      payload: {
        reply:
          "Я не успел закончить цепочку действий — достигнут лимит шагов. Скажите короче, какую часть выполнить, или повторите запрос.",
      },
    };
  }

  return {
    payload: final.payload,
    toolActions,
    appliedToolActions,
    steps,
  };
}

/* ---------------- helpers ---------------- */

function pushStep(
  steps: ChatStep[],
  onStep: ((s: ChatStep) => void) | undefined,
  label: string,
): void {
  const step: ChatStep = { label: label.slice(0, 160), ts: new Date().toISOString() };
  steps.push(step);
  onStep?.(step);
}

/** Handler labels describe results already; the request itself gets a verb. */
function stepLabelFor(call: ToolCallOut): string {
  const nameInfo = parseCallArgs(call.argsJson) as Record<string, unknown>;
  switch (call.name) {
    case "find_exercise_video":
      return `Ищу видео: ${String(nameInfo["exercise_name"] ?? "")}`.slice(0, 160);
    case "add_video_to_exercise":
      return "Проверяю упражнение в каталоге…";
    case "get_exercise_details":
      return "Читаю данные упражнения…";
    default:
      return `Выполняю${call.name ? ` (${call.name})` : ""}…`;
  }
}

/** Parses the JSON-stringified args coming back from the server fn. */
function parseCallArgs(json: string): Record<string, unknown> {
  try {
    const j: unknown = JSON.parse(json);
    if (typeof j === "object" && j !== null && !Array.isArray(j))
      return j as Record<string, unknown>;
  } catch {
    // fall through
  }
  return {};
}

/** Handler labels already render under these → trim them like results-only lines. */
function normalizeStep(label: string): string {
  return label.slice(0, 160);
}

function promoteKeys(keys: string[], i: number): string[] {
  const k = keys[i]!;
  return [k, ...keys.slice(0, i), ...keys.slice(i + 1)];
}

export const CHAT_WINDOW_SIZE = MAX_HISTORY_MESSAGES;
