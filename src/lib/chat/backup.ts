import { z } from "zod";
import {
  DEFAULT_PERMISSIONS,
  type ChatBackup,
  type ChatPermissions,
  type ChatSession,
} from "./types";
import { useChat } from "./store";

const BackupData = z.object({
  sessions: z
    .array(
      z.object({
        id: z.string(),
        title: z.string(),
        createdAt: z.string(),
        messages: z.array(
          z.object({
            id: z.string(),
            role: z.enum(["user", "assistant"]),
            text: z.string(),
            attachments: z
              .array(
                z.object({
                  name: z.string(),
                  mimeType: z.string(),
                  size: z.number(),
                }),
              )
              .optional(),
            actions: z.array(z.unknown()).optional(),
            applied: z.record(z.string().max(4), z.string().nullable()).optional(),
          }),
        ),
      }),
    )
    .optional(),
  memory: z.array(z.string()).optional(),
  permissions: z.record(z.enum(["always", "ask", "off"])).optional(),
});

export const chatFileName = (day = new Date().toISOString().slice(0, 10)) =>
  `pulse-chats-${day}.json`;

/** Builds the chats backup file (app/version/section envelope, like AppState sections). */
export function buildChatFile(): ChatBackup {
  const s = useChat.getState();
  return {
    app: "pulse",
    version: 2,
    section: "chats",
    exportedAt: new Date().toISOString(),
    data: { sessions: s.sessions, memory: s.memory, permissions: s.permissions },
  };
}

/** Strictly parses a chats backup file; clean Russian errors otherwise. */
export function parseChatFile(text: string): ChatBackup {
  let j: Record<string, unknown>;
  try {
    j = JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new Error("Файл не похож на JSON-копию. Данные не тронуты.");
  }
  if (j["app"] !== "pulse") throw new Error("Это копия не из Пульса. Данные не тронуты.");
  if (j["section"] !== "chats")
    throw new Error("Это файл другого раздела — загрузи его в нужную карточку. Чаты не тронуты.");
  const parsed = BackupData.safeParse(j["data"]);
  if (!parsed.success)
    throw new Error("Файл повреждён или не подходит для чатов. Данные не тронуты.");
  const d = parsed.data;
  return {
    app: "pulse",
    version: 2,
    section: "chats",
    exportedAt: typeof j["exportedAt"] === "string" ? j["exportedAt"] : "",
    data: {
      sessions: (d.sessions ?? []) as ChatSession[],
      memory: d.memory ?? [],
      permissions: { ...DEFAULT_PERMISSIONS, ...(d.permissions as ChatPermissions | undefined) },
    },
  };
}

/** Record counts for the import confirm dialog. */
export function countChatRecords(d: ChatBackup): { count: number; label: string } {
  return { count: d.data.sessions.length, label: "чатов" };
}
