import { createServerFn } from "@tanstack/react-start";
import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import { normalizeAiContent } from "./ai-content";
import { mapHttpError, statusOf } from "./ai.functions";

const Attachment = z.object({
  mimeType: z
    .string()
    .regex(/^[\w./-]+$/)
    .max(120),
  // Inline base64; ~12 MB decoded maps to a 16 M-char base64 string.
  base64: z.string().max(16_000_000),
});

export const ChatMessageInput = z.object({
  role: z.enum(["user", "assistant"]),
  text: z.string().max(16_000),
  /** Inline image/audio/pdf/video parts; Gemini only — other providers reject them. */
  attachments: z.array(Attachment).max(4).optional(),
});

export type ChatMessageInput = z.infer<typeof ChatMessageInput>;

const Input = z.object({
  provider: z.enum(["gemini", "openai"]),
  keys: z.array(z.string().min(4)).min(1).max(10),
  baseUrl: z.string().url().optional().or(z.literal("")),
  model: z.string().min(1),
  system: z.string().max(32_000),
  messages: z.array(ChatMessageInput).min(1).max(40),
});

/** One action the assistant proposes; `data` carries a JSON-serialized payload. */
const RawAction = z.object({
  kind: z.string().max(60),
  data: z.string().max(200_000),
});

const AssistantPayload = z.object({
  reply: z.string().max(12_000),
  actions: z.array(RawAction).max(10).optional(),
  memory: z
    .object({
      learn: z.array(z.string().max(90)).max(10).optional(),
      forget: z.array(z.string().max(90)).max(10).optional(),
    })
    .optional(),
});

export type ChatPayload = z.infer<typeof AssistantPayload>;

/** Parses the model's text into the structured chat payload or raises a clean error. */
function toPayload(content: unknown): ChatPayload {
  const text = normalizeAiContent(content).trim();
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error("ИИ вернул ответ не в формате чата. Повторите запрос.");
  }
  // Models occasionally nest the payload as a JSON string under a wrapper key.
  if (typeof raw === "object" && raw !== null) {
    const outer = raw as Record<string, unknown>;
    for (const key of ["chat", "payload", "response"]) {
      if (typeof outer[key] === "string") {
        try {
          raw = JSON.parse(outer[key]);
        } catch {
          /* keep the outer object */
        }
        break;
      }
    }
  }
  const parsed = AssistantPayload.safeParse(raw);
  if (parsed.success) return parsed.data;
  const reply = (raw as { reply?: unknown } | null)?.reply;
  if (typeof reply === "string" && reply.trim()) return { reply: reply.trim() };
  // A bare quoted string still counts as the assistant's reply.
  if (typeof raw === "string" && raw.trim()) return { reply: raw.trim() };
  throw new Error("ИИ вернул ответ в неожиданном формате. Попробуйте ещё раз.");
}

async function callChatOnce(
  provider: "gemini" | "openai",
  apiKey: string,
  baseUrl: string | undefined,
  model: string,
  system: string,
  messages: ChatMessageInput[],
): Promise<ChatPayload> {
  if (provider === "gemini") {
    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: { timeout: 120_000, retryOptions: { attempts: 1 } },
    });
    const contents = messages.map((m) => ({
      role: m.role,
      parts: [
        ...(m.text ? [{ text: m.text }] : []),
        ...(m.attachments ?? []).map((a) => ({
          inlineData: { mimeType: a.mimeType, data: a.base64 },
        })),
      ],
    }));
    const response = await ai.models.generateContent({
      model,
      contents,
      config: {
        systemInstruction: system,
        responseMimeType: "application/json",
      },
    });
    return toPayload(response.text ?? "");
  }
  if (messages.some((m) => m.attachments?.length))
    throw new Error("Вложения поддерживаются только с провайдером Gemini.");
  const base = (baseUrl || "https://api.openai.com/v1").replace(/\/$/, "");
  const res = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: system },
        ...messages.map((m) => ({ role: m.role, content: m.text })),
      ],
      response_format: { type: "json_object" },
    }),
  });
  const body = await res.text();
  if (!res.ok) throw mapHttpError(res.status, body);
  const j = JSON.parse(body) as { choices?: { message?: { content?: unknown } }[] };
  return toPayload(j.choices?.[0]?.message?.content);
}

/**
 * Multi-turn assistant chat with the user's own AI provider.
 * Gemini supports multi-turn + inline attachments (images/audio/pdf/video);
 * OpenAI-compatible providers accept text only. Rotates through the keys on
 * quota errors and returns the index of the key that worked.
 */
export const askChat = createServerFn({ method: "POST" })
  .validator((d) => Input.parse(d))
  .handler(async ({ data }) => {
    let last: unknown = null;
    for (let i = 0; i < data.keys.length; i++) {
      try {
        const payload = await callChatOnce(
          data.provider,
          data.keys[i]!,
          data.baseUrl || undefined,
          data.model,
          data.system,
          data.messages,
        );
        return { payload, keyIndex: i };
      } catch (e) {
        if (statusOf(e) == null) throw e;
        last = e;
      }
    }
    throw last instanceof Error ? last : new Error("Лимиты исчерпаны на всех ключах.");
  });
