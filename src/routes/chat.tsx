import { createFileRoute } from "@tanstack/react-router";
import { History, ShieldQuestion } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ChatComposer } from "@/components/chat/ChatComposer";
import { ChatMessages } from "@/components/chat/ChatMessages";
import { ChatSessionList } from "@/components/chat/ChatSessionList";
import { PermissionsEditor } from "@/components/chat/PermissionsEditor";
import { sendChat } from "@/lib/chat/client";
import { parseActions, applyAction } from "@/lib/chat/sanitize";
import { useChat } from "@/lib/chat/store";
import type { ChatAction, ChatAppRef, ChatMessage, ChatSnapshot } from "@/lib/chat/types";
import { uid, useApp } from "@/lib/store";

export const Route = createFileRoute("/chat")({
  head: () => ({
    meta: [
      { title: "Чат с ИИ · Пульс" },
      { name: "description", content: "Личный ИИ-тренер: советы, упражнения и планы." },
      { property: "og:title", content: "Чат с ИИ · Пульс" },
      { property: "og:description", content: "Личный ИИ-тренер в приложении Пульс." },
    ],
  }),
  validateSearch: (s: Record<string, unknown>) => ({
    seed: typeof s["seed"] === "string" ? (s["seed"] as string) : undefined,
  }),
  component: ChatScreen,
});

const SEEDS: Record<string, string> = {
  exercise: "Предложи мне новое упражнение под мои цели.",
  plan: "Посмотри мой текущий цикл плана и предложи, что улучшить.",
  advice: "Как мне лучше прогрессировать на этой неделе?",
};

function ChatScreen() {
  const { seed } = Route.useSearch();
  const seedParam = seed ?? undefined;
  const sessions = useChat((s) => s.sessions);
  const activeId = useChat((s) => s.activeId);
  const aiProvider = useApp((s) => s.ai.provider);
  const [busy, setBusy] = useState(false);
  const [listOpen, setListOpen] = useState(false);
  const [permsOpen, setPermsOpen] = useState(false);
  const [seedText, setSeedText] = useState<string | undefined>();
  const bottomRef = useRef<HTMLDivElement>(null);
  const seeded = useRef(false);

  const session = sessions.find((c) => c.id === activeId) ?? null;

  // First turn: create the session; `?seed=…` pre-fills a starter prompt once.
  useEffect(() => {
    if (seeded.current) return;
    seeded.current = true;
    useChat.getState().ensureActive("");
    const text = seedParam ? SEEDS[seedParam] : undefined;
    if (text) setSeedText(text);
  }, [seedParam]);

  // Keep newest messages in view.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [session?.messages.length, busy]);

  const send = async (
    text: string,
    attachments: { name: string; mimeType: string; base64: string }[],
    appRefs: ChatAppRef[] = [],
  ) => {
    if (busy) return;
    const chat = useChat.getState();
    const s = chat.sessions.find((c) => c.id === chat.activeId);
    if (!s) return;
    const userMsg: ChatMessage = {
      id: uid(),
      role: "user",
      text,
      attachments: attachments.map((a) => ({ name: a.name, mimeType: a.mimeType, size: 0 })),
      appRefs: appRefs.length ? appRefs : undefined,
    };
    chat.addMessage(s.id, userMsg);
    setBusy(true);
    // Assistant placeholder paints tool progress live; filled at the end.
    const assistantId = uid();
    chat.addMessage(s.id, { id: assistantId, role: "assistant", text: "", steps: [] });
    const readAssistant = () =>
      useChat
        .getState()
        .sessions.find((c) => c.id === s.id)
        ?.messages.find((m) => m.id === assistantId);
    const patch = (p: Partial<ChatMessage>) => {
      if (readAssistant()) useChat.getState().patchMessage(s.id, assistantId, p);
    };
    /** Writes undo snapshot for an action at apply time. */
    const patchSnap = (idx: number, snap: ChatSnapshot) => {
      const cur = readAssistant();
      patch({
        snapshots: { ...(cur?.snapshots ?? {}), [idx]: snap },
      });
    };
    const snapFor = (a: ChatAction): ChatSnapshot =>
      useApp
        .getState()
        .captureSnapshot(
          a.kind === "create_workout"
            ? ["workouts"]
            : a.kind === "add_plan_step"
              ? ["plan"]
              : ["exercises"],
        );
    try {
      const { payload, toolActions, appliedToolActions, steps } = await sendChat(
        [...s.messages, userMsg],
        { text, attachments, appRefs },
        (step) => patch({ steps: [...(readAssistant()?.steps ?? []), step] }),
      );
      // Tool cards first (they may be already applied silently), then the
      // model's own JSON-contract actions, sanitized as before.
      const modelActions: ChatAction[] = parseActions(
        payload.actions,
        useChat.getState().permissions,
        useApp.getState(),
      );
      const actions = [...toolActions, ...modelActions];
      patch({
        text: payload.reply,
        steps,
        actions: actions.length ? actions : undefined,
        sources: payload.sources,
      });
      // Tool actions: mark applied / snapshot (the handler did the write).
      appliedToolActions.forEach((idx) => {
        const a = toolActions[idx];
        if (!a) return;
        useChat.getState().markAction(s.id, assistantId, idx, new Date().toISOString());
        patchSnap(idx, snapFor(a));
      });
      // "always"-mode JSON actions apply silently right away.
      modelActions.forEach((a, i) => {
        if (a.permission !== "always") return;
        const idx = toolActions.length + i;
        const snap = snapFor(a);
        if (applyAction(a)) {
          useChat.getState().markAction(s.id, assistantId, idx, new Date().toISOString());
          patchSnap(idx, snap);
        } else {
          useChat.getState().markAction(s.id, assistantId, idx, null);
        }
      });
      useChat.getState().remember(payload.memory?.learn ?? [], payload.memory?.forget ?? []);
    } catch (e) {
      patch({ text: (e as Error).message || "Ошибка запроса к ИИ." });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <section className="flex items-center gap-2">
        <h1 className="flex-1 text-2xl font-extrabold tracking-tight">Чат с ИИ</h1>
        <button
          type="button"
          aria-label="Разрешения ИИ"
          onClick={() => setPermsOpen(true)}
          className="press flex h-10 w-10 items-center justify-center rounded-full text-muted-foreground hover:bg-muted"
        >
          <ShieldQuestion className="h-5 w-5" />
        </button>
        <button
          type="button"
          aria-label="История чатов"
          onClick={() => setListOpen(true)}
          className="press flex h-10 w-10 items-center justify-center rounded-full text-muted-foreground hover:bg-muted"
        >
          <History className="h-5 w-5" />
        </button>
      </section>

      {aiProvider !== "gemini" && (
        <p className="rounded-2xl bg-gold-soft px-4 py-3 text-xs font-semibold text-gold-shade">
          Вложения и веб-поиск работают только с Gemini — сейчас выбран другой провайдер. Для
          актуальных внешних фактов чат не сможет проверить источники.
        </p>
      )}

      <section aria-label="Сообщения" className="min-h-[60dvh]">
        {session ? <ChatMessages sessionId={session.id} messages={session.messages} /> : null}
        <div ref={bottomRef} />
      </section>

      <ChatComposer
        busy={busy}
        prefill={seedText}
        onPrefillConsumed={() => setSeedText(undefined)}
        onSend={send}
      />

      <ChatSessionList open={listOpen} onClose={() => setListOpen(false)} />
      <Dialog open={permsOpen} onOpenChange={(o) => !o && setPermsOpen(false)}>
        <DialogContent className="max-h-[80dvh] overflow-y-auto rounded-3xl">
          <DialogHeader>
            <DialogTitle>Разрешения ИИ</DialogTitle>
          </DialogHeader>
          <PermissionsEditor />
        </DialogContent>
      </Dialog>
    </div>
  );
}
