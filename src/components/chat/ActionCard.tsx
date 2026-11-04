import { applyAction } from "@/lib/chat/sanitize";
import { useChat } from "@/lib/chat/store";
import type { ChatAction, ChatMessage } from "@/lib/chat/types";
import { useApp } from "@/lib/store";
import { Check, ChevronRight, X } from "lucide-react";
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
  return a.summary.slice(a.summary.indexOf("—") + 1).trim();
}

/**
 * Карточка одного proposed-действия. «always» подтверждения не требует —
 * применяется сразу отрисовщиком; здесь — ветки ask и уже применённые.
 */
export function ActionCard({
  sessionId,
  message,
  action,
  index,
}: {
  sessionId: string;
  message: ChatMessage;
  action: ChatAction;
  index: number;
}) {
  const mark = useChat((s) => s.markAction);
  // applied[index]: missing = not decided yet; null = dismissed; ISO string = applied.
  const state = message.applied?.[index];
  const decided = state !== undefined;
  const appliedIso = state ?? null;
  const [busyI, setBusyI] = useState(false);

  if (appliedIso != null) {
    return (
      <div className="flex items-center gap-2 rounded-xl bg-primary-soft px-3 py-2 text-sm font-semibold text-primary-shade">
        <Check className="h-4 w-4 shrink-0" /> Применено
        <span className="truncate">{KIND_VERB[action.kind]}</span>
      </div>
    );
  }
  if (decided) return <p className="text-xs text-muted-foreground">Отклонено</p>;

  const done = (ok: boolean) => {
    setBusyI(true);
    if (!ok) {
      mark(sessionId, message.id, index, null);
      return;
    }
    if (applyAction(action)) {
      mark(sessionId, message.id, index, new Date().toISOString());
      toast.success(KIND_VERB[action.kind]);
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
