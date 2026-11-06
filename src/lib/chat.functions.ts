import { createServerFn } from "@tanstack/react-start";
import {
  GoogleGenAI,
  type Content,
  type FunctionCall,
  type FunctionDeclaration,
} from "@google/genai";
import { z } from "zod";
import { normalizeAiContent } from "./ai-content";
import { mapHttpError, statusOf } from "./ai.functions";
import { extractGroundedSources } from "./chat/grounding";
import { TOOL_DEFS, TOOL_NAMES } from "./chat/tooldefs";
import type { ChatSource } from "./chat/types";

/** Loop guards (the plan §9): rounds per message and calls per round. */
export const MAX_TOOL_ROUNDS = 6;
export const CALLS_PER_ROUND = 12;

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

/** One previous round of tool calls with their tool results (loop history). */
const ToolRound = z
  .object({
    /** funcionCall parts the model produced in a previous round. */
    calls: z
      .array(z.object({ name: z.string().max(60), args: z.string().max(8_000) }))
      .min(1)
      .max(CALLS_PER_ROUND),
    /** JSON tool responses; `results[i]` answers `calls[i]`. */
    results: z.array(z.string().max(40_000)).max(CALLS_PER_ROUND),
  })
  .refine((r) => r.calls.length === r.results.length, { message: "calls/results mismatch" });

const Input = z.object({
  provider: z.enum(["gemini", "openai"]),
  keys: z.array(z.string().min(4)).min(1).max(10),
  baseUrl: z.string().url().optional().or(z.literal("")),
  model: z.string().min(1),
  system: z.string().max(32_000),
  messages: z.array(ChatMessageInput).min(1).max(40),
  /** Enable function-calling for this round (Gemini video tools). */
  tools: z.boolean().optional(),
  /** Tool rounds already executed client-side; sent back inside `contents`. */
  rounds: z.array(ToolRound).max(MAX_TOOL_ROUNDS).optional(),
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

export type ChatPayload = z.infer<typeof AssistantPayload> & { sources?: ChatSource[] };

export function toGeminiContents(messages: ChatMessageInput[]): Content[] {
  return messages.map((message) => ({
    role: message.role === "assistant" ? "model" : "user",
    parts: [
      ...(message.text ? [{ text: message.text }] : []),
      ...(message.attachments ?? []).map((attachment) => ({
        inlineData: { mimeType: attachment.mimeType, data: attachment.base64 },
      })),
    ],
  }));
}

export interface ToolCallOut {
  /** Synthetic id, stable within one askChat request. */
  id: string;
  name: string;
  /** JSON-stringified args (server fn responses must stay serializable). */
  argsJson: string;
}

/** Discriminated result of one askChat round (tool-loop or the final answer). */
export type ChatRoundResult =
  { kind: "tool_calls"; calls: ToolCallOut[] } | { kind: "final"; payload: ChatPayload };

function parseArgsJson(raw: unknown): Record<string, unknown> {
  if (typeof raw === "object" && raw !== null && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }
  return {};
}

/**
 * Builds full `contents` for generateContent: visible history + every executed
 * tool round replayed exactly as received (model functionCall turn, then one
 * user turn with all functionResponse parts), so parallel calls stay intact.
 */
export function roundContents(
  messages: ChatMessageInput[],
  rounds: { calls: { name: string; args: string }[]; results: string[] }[],
): Content[] {
  const content = toGeminiContents(messages);
  for (const round of rounds) {
    content.push({
      role: "model",
      parts: round.calls.map((call) => ({
        functionCall: { name: call.name, args: parseArgsJson(safeJson(call.args)) },
      })),
    });
    content.push({
      role: "user",
      parts: round.results.map((res, i) => ({
        functionResponse: {
          name: round.calls[i]?.name ?? "tool",
          response: parseArgsJson(safeJson(res)),
        },
      })),
    });
  }
  return content;
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

/** Types `functionCall` args from SDK responses into serializable JSON strings. */
function callsFromResponse(calls: FunctionCall[] | undefined): ToolCallOut[] {
  return (calls ?? [])
    .filter((call) => typeof call?.name === "string" && TOOL_NAMES.has(call.name))
    .map((call, i) => ({
      id: `fc-${i}`,
      name: call.name!,
      argsJson: JSON.stringify(call.args ?? {}),
    }));
}

interface ChatKeyFailure {
  keyIndex: number;
  key: string;
  error: unknown;
}

function formatUpstreamError(error: unknown, keys: string[]): string {
  const raw = error instanceof Error ? error.message : "Неизвестная ошибка";
  let detail = raw;

  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed === "object" && parsed !== null && "error" in parsed) {
      const body = (parsed as { error?: unknown }).error;
      if (typeof body === "object" && body !== null) {
        const apiError = body as {
          code?: unknown;
          message?: unknown;
          status?: unknown;
          details?: unknown;
        };
        const parts = [
          typeof apiError.code === "number" ? `HTTP ${apiError.code}` : "",
          typeof apiError.status === "string" ? apiError.status : "",
          typeof apiError.message === "string" ? apiError.message : "",
        ].filter(Boolean);

        if (Array.isArray(apiError.details)) {
          for (const item of apiError.details) {
            if (typeof item !== "object" || item === null) continue;
            const data = item as Record<string, unknown>;
            const violations = Array.isArray(data["violations"]) ? data["violations"] : [];
            for (const violation of violations) {
              if (typeof violation !== "object" || violation === null) continue;
              const v = violation as Record<string, unknown>;
              if (typeof v["quotaMetric"] === "string")
                parts.push(`quotaMetric=${v["quotaMetric"]}`);
              if (typeof v["quotaId"] === "string") parts.push(`quotaId=${v["quotaId"]}`);
              if (typeof v["quotaDimensions"] === "object" && v["quotaDimensions"] !== null) {
                parts.push(`quotaDimensions=${JSON.stringify(v["quotaDimensions"])}`);
              }
            }
            if (typeof data["retryDelay"] === "string")
              parts.push(`retryDelay=${data["retryDelay"]}`);
          }
        }
        if (parts.length) detail = parts.join("; ");
      }
    }
  } catch {
    // Keep the original upstream message if it isn't JSON.
  }

  return keys
    .reduce((text, secret) => text.replaceAll(secret, "[ключ скрыт]"), detail)
    .slice(0, 1200);
}

/** Builds a diagnostic that identifies the provider and attempted keys without exposing them. */
export function formatChatKeyFailures(
  provider: "gemini" | "openai",
  baseUrl: string | undefined,
  keys: string[],
  failures: ChatKeyFailure[],
): Error {
  let source = "Google Gemini";
  if (provider === "openai") {
    try {
      source = `OpenAI-compatible (${new URL(baseUrl || "https://api.openai.com/v1").host})`;
    } catch {
      source = "OpenAI-compatible";
    }
  }

  const details = failures.map(({ keyIndex, key, error }) => {
    const keyLabel = `ключ ${keyIndex + 1}/${keys.length}${key.length > 4 ? ` (••••${key.slice(-4)})` : ""}`;
    return `${keyLabel}: ${formatUpstreamError(error, keys)}`;
  });

  return new Error(`Источник: ${source}. Запрос не выполнен:\n${details.join("\n")}`);
}

export async function withChatKeyFallback<T>(
  provider: "gemini" | "openai",
  baseUrl: string | undefined,
  keys: string[],
  call: (apiKey: string) => Promise<T>,
): Promise<{ result: T; keyIndex: number }> {
  const failures: ChatKeyFailure[] = [];
  for (let i = 0; i < keys.length; i++) {
    try {
      return { result: await call(keys[i]!), keyIndex: i };
    } catch (error) {
      const status = statusOf(error);
      if (status === null || (status !== 429 && status < 500)) {
        // Auth errors (401/403), invalid keys and other non-retryable failures
        // will not get better on the next key: fail fast with the original error.
        throw error;
      }
      // Retryable (429 quota / 5xx): record and try the next key.
      failures.push({ keyIndex: i, key: keys[i]!, error });
    }
  }
  if (failures.length === 1) {
    // A single exhausted key reads better as the unformatted upstream error.
    throw failures[0]!.error;
  }
  throw formatChatKeyFailures(provider, baseUrl, keys, failures);
}

function firstJsonObject(text: string): string | null {
  const start = text.indexOf("{");
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const char = text[i]!;
    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') inString = true;
    else if (char === "{") depth++;
    else if (char === "}" && --depth === 0) return text.slice(start, i + 1);
  }
  return null;
}

/** Parses the model's text into the structured chat payload or raises a clean error. */
export function parseChatPayload(content: unknown): ChatPayload {
  const text = normalizeAiContent(content).trim();
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    const json = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)?.[1] ?? firstJsonObject(text);
    if (!json) throw new Error("ИИ вернул ответ не в формате чата. Повторите запрос.");
    try {
      raw = JSON.parse(json);
    } catch {
      throw new Error("ИИ вернул ответ не в формате чата. Повторите запрос.");
    }
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

/** Checks if an error indicates grounding tools are unavailable or quota-exhausted for them. */
function isGroundingQuotaError(error: unknown): boolean {
  const status = statusOf(error);
  if (status === 429) return true;
  // Some models return 400 for unsupported tools/config
  if (status === 400) {
    const msg = error instanceof Error ? error.message : "";
    return /grounding|tool|search|url.?context|not supported|invalid.?config/i.test(msg);
  }
  return false;
}

/**
 * One round in function-calling mode: no response mimeType, no grounding tools
 * (combined search+custom tools is a Preview feature per the plan) — the model
 * must either call our verified functions or produce the final JSON contract.
 */
async function callToolRoundOnce(
  apiKey: string,
  model: string,
  system: string,
  contents: Content[],
): Promise<ChatRoundResult> {
  const ai = new GoogleGenAI({
    apiKey,
    httpOptions: { timeout: 120_000, retryOptions: { attempts: 1 } },
  });
  const response = await ai.models.generateContent({
    model,
    contents,
    // Cast keeps the shared tooldefs (plain JSON) decoupled from @google/genai
    // typings, which churn between versions; the shape is identical.
    // Disable thinking to avoid missing thought_signature requirement for function calls.
    config: {
      systemInstruction: system,
      tools: [{ functionDeclarations: TOOL_DEFS as unknown as FunctionDeclaration[] }],
      thinkingConfig: { thinkingBudget: 0 },
    },
  });
  const calls = callsFromResponse(response.functionCalls);
  // A text answer that arrives together with calls is dropped: the next round
  // repeats it in the final turn, and sending both would break the contract.
  if (calls.length) return { kind: "tool_calls", calls };
  const payload = parseChatPayload(response.text ?? "");
  return { kind: "final", payload };
}

/** Tries with grounding tools first; on quota/compatibility error, falls back to basic JSON mode. */
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

    // Attempt 1: with grounding tools (Google Search + URL Context)
    try {
      const response = await ai.models.generateContent({
        model,
        contents: toGeminiContents(messages),
        config: {
          systemInstruction: system,
          tools: [{ googleSearch: {} }, { urlContext: {} }],
        },
      });
      const payload = parseChatPayload(response.text ?? "");
      const sources = extractGroundedSources(response.candidates?.[0]);
      return sources.length ? { ...payload, sources } : payload;
    } catch (groundingError) {
      // Attempt 2: fallback to basic JSON mode (no tools) if grounding failed due to quota/compatibility
      if (isGroundingQuotaError(groundingError)) {
        const response = await ai.models.generateContent({
          model,
          contents: toGeminiContents(messages),
          config: {
            systemInstruction: system,
            responseMimeType: "application/json",
          },
        });
        return parseChatPayload(response.text ?? "");
      }
      throw groundingError;
    }
  }
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
  return parseChatPayload(j.choices?.[0]?.message?.content);
}

/**
 * Multi-turn assistant chat with the user's own AI provider.
 * Two modes: a plain chat round (grounding + JSON contract) and a tool-loop
 * round (`tools: true`, Gemini only) that may return tool calls instead.
 * Rotates through the keys on quota errors and returns the index of the key
 * that worked. Attachments are inline base64; OpenAI-compatible providers
 * accept text only.
 */
export const askChat = createServerFn({ method: "POST" })
  .validator((d) => Input.parse(d))
  .handler(async ({ data }) => {
    if (data.provider !== "gemini" && data.messages.some((m) => m.attachments?.length))
      throw new Error("Вложения поддерживаются только с провайдером Gemini.");

    const contents =
      data.tools && data.provider === "gemini"
        ? roundContents(data.messages, data.rounds ?? [])
        : undefined;

    const { result: round, keyIndex } = await withChatKeyFallback(
      data.provider,
      data.baseUrl,
      data.keys,
      (key) =>
        data.tools && data.provider === "gemini" && contents
          ? callToolRoundOnce(key, data.model, data.system, contents)
          : callChatOnce(
              data.provider,
              key,
              data.baseUrl || undefined,
              data.model,
              data.system,
              data.messages,
            ).then((payload): ChatRoundResult => ({ kind: "final", payload })),
    );
    return { round, keyIndex };
  });
