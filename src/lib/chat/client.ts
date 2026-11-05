import { useApp } from "../store";
import { askChat, type ChatMessageInput, type ChatPayload } from "../chat.functions";
import { timedLog } from "../logger";
import { buildAppSummary, buildSystemPrompt } from "./prompt";
import { historyWindow, useChat } from "./store";
import type { ChatMessage } from "./types";

/** Result of one assistant turn. */
export interface ChatTurn {
  payload: ChatPayload;
}

/**
 * Sends the visible history plus the user's new message to the server chat fn.
 * Rotates/prefer keys like `clients.ask` does. Attachments are inline base64;
 * throw early for non-Gemini providers so the UI can explain before wasting a turn.
 */
export async function sendChat(
  sessionMessages: ChatMessage[],
  userTurn: { text: string; attachments?: { name: string; mimeType: string; base64: string }[] },
): Promise<ChatTurn> {
  const ai = useApp.getState().ai;
  if (!ai.keys.length) throw new Error("Добавьте ключ ИИ в настройках");
  if (ai.provider !== "gemini" && userTurn.attachments?.length)
    throw new Error("Вложения поддерживаются только с провайдером Gemini.");

  const chat = useChat.getState();
  // Stored history goes as text only: models read attachments on arrival, and
  // resending old base64 would balloon every later request. A `[вложение]` marker
  // keeps the context of what the user showed earlier.
  const messages: ChatMessageInput[] = [
    ...historyWindow(sessionMessages).map((m) => ({
      role: m.role,
      text:
        m.attachments?.length && m.role === "user"
          ? `${m.text}\n[вложение: ${m.attachments.map((a) => a.name).join(", ")}]`
          : m.text,
    })),
    {
      role: "user" as const,
      text: userTurn.text,
      attachments: (userTurn.attachments ?? []).map((a) => ({
        mimeType: a.mimeType,
        base64: a.base64,
      })),
    },
  ];

  const system = buildSystemPrompt(
    buildAppSummary(useApp.getState()),
    chat.memory,
    chat.permissions,
    ai.provider === "gemini",
  );

  const { payload, keyIndex } = await timedLog("ai", "Чат: запрос", () =>
    askChat({
      data: {
        provider: ai.provider,
        keys: ai.keys,
        baseUrl: ai.baseUrl,
        model: ai.model,
        system,
        messages,
      },
    }),
  );
  if (keyIndex > 0) {
    // Prefer the key that still has quota next time.
    useApp.getState().set({ ai: { ...ai, keys: promote(ai.keys, keyIndex) } });
  }
  return { payload };
}

function promote(keys: string[], i: number): string[] {
  const k = keys[i]!;
  return [k, ...keys.slice(0, i), ...keys.slice(i + 1)];
}
