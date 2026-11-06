import { applyAction } from "@/lib/chat/sanitize";
import { useChat } from "@/lib/chat/store";
import type { ChatAction, ChatMessage, ChatSnapshot } from "@/lib/chat/types";
import { useApp } from "@/lib/store";
import { LinkMedia } from "@/components/game/LinkMedia";
import { Check, ChevronRight, Undo2, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

const KIND_VERB = {
  create_exercise: "Добавить упражнение",
  update_exercise: "Изменить упражнение",
  create_workout: "Создать тренировку",
  add_plan_step: "Изменить план",
} as const;

/** Читаемое описание payload для подстрочника карточки. */
function details(a: ChatAction): string {
  if (a.kind === "add_plan_step") {
    const p = a.payload as { afterIndex: number; step: { kind: string } };
    const where = p.afterIndex < 0 ? "в начало цикла" : `после шага ${p.afterIndex}`;
    return `${p.step.kind === "rest" ? "День отдыха" : "День тренировки"} — ${where}`;
  }
  if (a.kind === "create_workout") {
    const w = a.payload as { items: { exerciseId: string }[] };
    const names = w.items
      .map((it) => useApp.getState().exercises.find((e) => e.id === it.exerciseId)?.name)
      .filter(Boolean);
    return (names as string[]).join(" · ");
  }
  const ex = a.payload as { videoUrl?: string };
  const video = ex.videoUrl ? " · видео: сегмент с подтверждённой ссылкой" : "";
  return a.summary.slice(a.summary.indexOf("—") + 1).trim() + video;
}

/**
 * Карточка одного proposed-действия: превью видео для упражнений, применить/
 * отклонить и ОТМЕНИТЬ применённое (undo по снапшоту состояния наapply). «always»
 * подтверждения не требует — применяется маршрутом; здесь — ветки ask и applied.
 */
export function ActionCard({
  sessionId,
  message,
  action,
  index,
  snapshot,
}: {
  sessionId: string;
  message: ChatMessage;
  action: ChatAction;
  index: number;
  snapshot?: ChatSnapshot | undefined;
}) {
  const mark = useChat((s) => s.markAction);
  const [busyI, setBusyI] = useState(false);
  // applied[index]: missing = not decided yet; null = dismissed; ISO string = applied.
  const state = message.applied?.[index];
  const decided = state !== undefined;
  const appliedIso = state ?? null;
  const exVideo =
    action.kind === "create_exercise" || action.kind === "update_exercise"
      ? (action.payload as { videoUrl?: string; clips?: { start: number; end: number }[] })
      : null;

  const patchSnap = (snap: ChatSnapshot) => {
    const st = useChat.getState();
    const cur = st.sessions
      .find((c) => c.id === sessionId)
      ?.messages.find((m) => m.id === message.id);
    st.patchMessage(sessionId, message.id, {
      snapshots: { ...(cur?.snapshots ?? {}), [index]: snap },
    });
  };
  const snapFor = (): ChatSnapshot =>
    useApp
      .getState()
      .captureSnapshot(
        action.kind === "create_workout"
          ? ["workouts"]
          : action.kind === "add_plan_step"
            ? ["plan"]
            : ["exercises"],
      );

  const undo = () => {
    setBusyI(true);
    try {
      if (snapshot && useApp.getState().restoreSnapshot(snapshot)) {
        mark(sessionId, message.id, index, null);
        toast.success("Изменение отменено");
      } else {
        toast.error("Не удалось восстановить состояние");
      }
    } finally {
      setBusyI(false);
    }
  };

  if (appliedIso != null) {
    return (
      <div className="rounded-2xl border-2 border-primary/30 bg-primary-soft p-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-primary-shade">
          <Check className="h-4 w-4 shrink-0" /> Применено
        </div>
        <p className="mt-0.5 text-sm font-semibold">{action.summary}</p>
        {exVideo?.videoUrl ? (
          <div className="mt-2 aspect-video overflow-hidden rounded-xl bg-muted">
            <LinkMedia url={exVideo.videoUrl} clips={exVideo.clips} controls autoplay={false} />
          </div>
        ) : null}
        <button
          type="button"
          disabled={busyI || !snapshot}
          onClick={undo}
          className="press mt-2 flex min-h-[40px] w-full items-center justify-center gap-1.5 rounded-xl border-2 text-sm font-semibold text-muted-foreground hover:bg-muted disabled:opacity-50"
        >
          <Undo2 className="h-4 w-4" /> Отменить изменение
        </button>
      </div>
    );
  }
  if (decided) return <p className="text-xs text-muted-foreground">Отклонено</p>;

  const done = (ok: boolean) => {
    setBusyI(true);
    if (!ok) {
      mark(sessionId, message.id, index, null);
      setBusyI(false);
      return;
    }
    const snap = snapFor();
    if (applyAction(action)) {
      patchSnap(snap);
      mark(sessionId, message.id, index, new Date().toISOString());
      toast.success("Изменение применено — можно отменить в этой карточке");
    } else {
      mark(sessionId, message.id, index, null);
      toast.error("Объект уже не существует — действие отменено");
    }
    setBusyI(false);
  };

  return (
    <div className="rounded-2xl border-2 border-border bg-card p-3">
      <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
        <ChevronRight className="h-3.5 w-3.5 shrink-0" />
        {KIND_VERB[action.kind]}
      </p>
      <p className="mt-1 text-sm font-semibold">{action.summary}</p>
      <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{details(action)}</p>
      {exVideo?.videoUrl ? (
        <div className="mt-2 aspect-video overflow-hidden rounded-xl bg-muted">
          <LinkMedia url={exVideo.videoUrl} clips={exVideo.clips} controls autoplay={false} />
        </div>
      ) : null}
      <div className="mt-2.5 flex gap-2">
        <button
          type="button"
          disabled={busyI}
          onClick={() => done(true)}
          className="press min-h-[40px] flex-1 rounded-xl bg-primary text-sm font-bold text-primary-foreground shadow-[0_3px_0_var(--primary-shade)] active:shadow-none disabled:opacity-50"
        >
          <Check className="mr-1 inline h-4 w-4" /> Применить
        </button>
        <button
          type="button"
          disabled={busyI}
          onClick={() => done(false)}
          aria-label="Отклонить изменение"
          className="press flex h-10 w-10 items-center justify-center rounded-xl border-2 text-muted-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
