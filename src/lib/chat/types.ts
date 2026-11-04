import type { Exercise, PlanStep, Workout } from "../types";

/** k - domains of assistant actions the user can allow himself. */
export type ChatDomain = "exercises" | "workouts" | "plan";

/** always - apply silently; ask - confirm card; off - assistant never proposes these. */
export type PermissionMode = "always" | "ask" | "off";

export type ChatPermissions = Record<ChatDomain, PermissionMode>;

export const DEFAULT_PERMISSIONS: ChatPermissions = {
  exercises: "ask",
  workouts: "ask",
  plan: "ask",
};

export const DOMAIN_LABELS: Record<ChatDomain, string> = {
  exercises: "Упражнения",
  workouts: "Тренировки",
  plan: "План (цикл и шаги)",
};

/** Kinds the assistant may propose; data is sanitized before it reaches the UI. */
export type ActionKind = "create_exercise" | "update_exercise" | "create_workout" | "add_plan_step";

export interface ChatAction {
  id: string;
  kind: ActionKind;
  /** Sanitized payload, ready to pass to a store action. */
  payload: Exercise | Workout | PlanStep | { afterIndex: number; step: PlanStep };
  /** Human-ready summary shown on the confirm card. */
  summary: string;
  permission: PermissionMode;
}

export interface ChatAttachmentRef {
  name: string;
  mimeType: string;
  size: number;
}

export interface ChatSource {
  title: string;
  url: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  attachments?: ChatAttachmentRef[] | undefined;
  actions?: ChatAction[] | undefined;
  sources?: ChatSource[] | undefined;
  /** Per-action index: ISO when applied, null when dismissed, missing = undecided. */
  applied?: Record<number, string | null> | undefined;
}

export interface ChatSession {
  id: string;
  title: string;
  createdAt: string;
  messages: ChatMessage[];
}

/** Section backup payload for chats (same envelope as the AppState sections). */
export interface ChatBackup {
  app: "pulse";
  version: 2;
  section: "chats";
  exportedAt: string;
  data: {
    sessions: ChatSession[];
    memory: string[];
    permissions: ChatPermissions;
  };
}

export const MAX_MEMORY_FACTS = 20;
/** History window sent to the model (cost/control). */
export const MAX_HISTORY_MESSAGES = 20;
