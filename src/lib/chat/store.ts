import { create } from "zustand";
import { persist } from "zustand/middleware";
import { uid } from "../store";
import { mergeFacts } from "./memory";
import {
  DEFAULT_PERMISSIONS,
  MAX_HISTORY_MESSAGES,
  type ChatBackup,
  type ChatMessage,
  type ChatPermissions,
  type ChatSession,
} from "./types";

interface ChatState {
  sessions: ChatSession[];
  /** Id of the session open in the chat screen. */
  activeId: string | null;
  memory: string[];
  permissions: ChatPermissions;
}

interface ChatActions {
  create: (title: string) => ChatSession;
  /** Creates the session when none is active and returns the one to append to. */
  ensureActive: (title: string) => ChatSession;
  select: (id: string) => void;
  addMessage: (sessionId: string, m: ChatMessage) => void;
  /** Marks one action card applied (ISO) or ignored (null). */
  markAction: (sessionId: string, messageId: string, index: number, applied: string | null) => void;
  patchMessage: (sessionId: string, messageId: string, patch: Partial<ChatMessage>) => void;
  rename: (id: string, title: string) => void;
  remove: (id: string) => void;
  setPermissions: (p: ChatPermissions) => void;
  remember: (learn: string[], forget: string[]) => void;
  setMemory: (facts: string[]) => void;
  /** Deletes every session but keeps memory and permissions. */
  clearAll: () => void;
  importBackup: (b: ChatBackup) => void;
}

const initialState: ChatState = {
  sessions: [],
  activeId: null,
  memory: [],
  permissions: { ...DEFAULT_PERMISSIONS },
};

/** History window sent to the model: newest N messages. */
export const historyWindow = (messages: ChatMessage[]): ChatMessage[] =>
  messages.slice(-MAX_HISTORY_MESSAGES);

export const useChat = create<ChatState & ChatActions>()(
  persist(
    (set, get) => ({
      ...initialState,

      create: (title) => {
        const session: ChatSession = {
          id: `cs-${uid()}`,
          title: title.trim().slice(0, 60) || "Новый чат",
          createdAt: new Date().toISOString(),
          messages: [],
        };
        set((s) => ({ sessions: [session, ...s.sessions], activeId: session.id }));
        return session;
      },

      ensureActive: (title) => {
        const s = get();
        const active = s.sessions.find((x) => x.id === s.activeId);
        return active ?? s.create(title);
      },

      select: (id) => set({ activeId: id }),

      addMessage: (sessionId, m) =>
        set((s) => ({
          sessions: s.sessions.map((c) =>
            c.id === sessionId
              ? {
                  ...c,
                  // Auto-title only replaces the placeholder, never a real name.
                  title:
                    c.messages.length === 0 &&
                    m.role === "user" &&
                    (c.title === "Новый чат" || !c.title.trim())
                      ? m.text.trim().slice(0, 60) || c.title
                      : c.title,
                  messages: [...c.messages, m],
                }
              : c,
          ),
        })),

      markAction: (sessionId, messageId, index, applied) =>
        set((s) => ({
          sessions: s.sessions.map((c) =>
            c.id === sessionId
              ? {
                  ...c,
                  messages: c.messages.map((m) =>
                    m.id === messageId
                      ? {
                          ...m,
                          applied: (m.applied ?? m.actions?.map(() => null) ?? []).map((v, i) =>
                            i === index ? applied : v,
                          ),
                        }
                      : m,
                  ),
                }
              : c,
          ),
        })),

      patchMessage: (sessionId, messageId, patch) =>
        set((s) => ({
          sessions: s.sessions.map((c) =>
            c.id === sessionId
              ? {
                  ...c,
                  messages: c.messages.map((m) => (m.id === messageId ? { ...m, ...patch } : m)),
                }
              : c,
          ),
        })),

      rename: (id, title) =>
        set((s) => ({
          sessions: s.sessions.map((c) =>
            c.id === id ? { ...c, title: title.trim().slice(0, 60) || c.title } : c,
          ),
        })),

      remove: (id) =>
        set((s) => {
          const sessions = s.sessions.filter((c) => c.id !== id);
          return {
            sessions,
            activeId: s.activeId === id ? (sessions[0]?.id ?? null) : s.activeId,
          };
        }),

      setPermissions: (p) => set({ permissions: p }),

      remember: (learn, forget) => set((s) => ({ memory: mergeFacts(s.memory, learn, forget) })),

      setMemory: (facts) => set({ memory: mergeFacts([], facts, []) }),

      clearAll: () => set({ ...initialState, permissions: get().permissions }),

      importBackup: (b) =>
        set(() => ({
          sessions: b.data.sessions ?? [],
          memory: b.data.memory ?? [],
          permissions: { ...DEFAULT_PERMISSIONS, ...(b.data.permissions ?? {}) },
          activeId: null,
        })),
    }),
    {
      name: "sprout-chat-v1",
      version: 1,
      partialize: (s) => ({
        sessions: s.sessions,
        activeId: s.activeId,
        memory: s.memory,
        permissions: s.permissions,
      }),
    },
  ),
);
