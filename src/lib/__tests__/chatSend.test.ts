import { beforeEach, describe, expect, it, vi } from "vitest";

// The server fn is mocked: here we verify the client wiring (what is sent),
// not the Gemini request itself.
vi.mock("../chat.functions", () => ({
  askChat: vi.fn(),
}));

import { askChat } from "../chat.functions";
import { sendChat } from "../chat/client";
import { useChat } from "../chat/store";
import { useApp } from "../store";
import type { ChatMessage } from "../chat/types";

const mockedAsk = vi.mocked(askChat);

/** Shape of the `data` argument mock tests rely on (matches askChat's server input). */
interface AskChatData {
  system: string;
  messages: {
    role: "user" | "assistant";
    text: string;
    attachments?: { mimeType: string; base64: string }[];
  }[];
}

function callData(i: number): AskChatData {
  const args = mockedAsk.mock.calls[i] as unknown as [{ data: AskChatData }] | undefined;
  if (!args) throw new Error(`askChat call #${i} missing`);
  return args[0].data;
}

describe("sendChat sends the dialogue history", () => {
  beforeEach(() => {
    useChat.getState().clearAll();
    useApp.getState().set({
      ai: {
        provider: "gemini",
        keys: ["test-key-1234"],
        baseUrl: "",
        model: "gemini-test",
        hint: "",
        autoAmbient: false,
      } as ReturnType<typeof useApp.getState>["ai"],
    });
    mockedAsk.mockReset();
    mockedAsk.mockResolvedValue({
      round: { kind: "final", payload: { reply: "ок" } },
      keyIndex: 0,
    });
  });

  it("includes previous user and assistant turns before the new message", async () => {
    const session = useChat.getState().create("История");
    const prior: ChatMessage[] = [
      { id: "u1", role: "user", text: "Планирую бег по утрам" },
      { id: "a1", role: "assistant", text: "Хорошая идея, начни с 3 км." },
      { id: "u2", role: "user", text: "А если пойдёт дождь?" },
    ];
    prior.forEach((m) => useChat.getState().addMessage(session.id, m));

    await sendChat(prior, { text: "Составь план на неделю" });

    expect(mockedAsk).toHaveBeenCalledOnce();
    const messages = callData(0).messages;
    expect(messages.map((m) => `${m.role}:${m.text}`)).toEqual([
      "user:Планирую бег по утрам",
      "assistant:Хорошая идея, начни с 3 км.",
      "user:А если пойдёт дождь?",
      "user:Составь план на неделю",
    ]);
    // The system prompt holds the app snapshot + rules, not the history:
    // the conversation itself travels in `messages` (checked above).
    expect(callData(0).system).not.toContain("Планирую");
  });

  it("attachments in history become text markers, not re-sent base64", async () => {
    const session = useChat.getState().create("Вложения");
    const withAttach: ChatMessage = {
      id: "u1",
      role: "user",
      text: "Смотри мою технику",
      attachments: [{ name: "squat.jpg", mimeType: "image/jpeg", size: 0 }],
    };
    useChat.getState().addMessage(session.id, withAttach);

    await sendChat([withAttach], { text: "Что я исправил?" });

    const messages = callData(0).messages;
    expect(messages[0]).toMatchObject({
      role: "user",
      text: expect.stringContaining("[вложение: squat.jpg]"),
    });
    expect(messages[0]?.attachments).toBeUndefined();
  });

  it("caps the window: historyWindow keeps the newest 20 + the live turn", async () => {
    const session = useChat.getState().create("Длинный");
    const many: ChatMessage[] = Array.from({ length: 25 }, (_, i) => ({
      id: `m${i}`,
      role: "user" as const,
      text: `msg-${i}`,
    }));
    many.forEach((m) => useChat.getState().addMessage(session.id, m));

    await sendChat(many, { text: "новое сообщение" });

    const messages = callData(0).messages;
    expect(messages).toHaveLength(21);
    expect(messages[0]?.text).toBe("msg-5");
    expect(messages[messages.length - 1]?.text).toBe("новое сообщение");
  });
});
