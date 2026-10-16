import { Check } from "lucide-react";
import type { Quest } from "@/lib/achievements";
import { cn } from "@/lib/utils";

const ICONS = ["🏋️", "⚡", "🧘"] as const;

/** Three daily quests with animated checkboxes. */
export function DailyQuests({ quests }: { quests: Quest[] }) {
  return (
    <section className="card-soft space-y-1 p-5" aria-label="Квесты дня">
      <div className="flex items-baseline justify-between">
        <h2 className="font-bold">Квесты дня 🎯</h2>
        <span className="text-sm font-semibold text-muted-foreground tabular">
          {quests.filter((q) => q.done).length} / {quests.length}
        </span>
      </div>
      {quests.map((q, i) => (
        <div key={q.id} className="flex items-center gap-3 py-2">
          <span
            className={cn(
              "flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-xl transition-colors",
              q.done ? "bg-primary text-primary-foreground" : "bg-muted",
            )}
          >
            {q.done ? (
              <Check className="animate-pop h-6 w-6" strokeWidth={3} />
            ) : (
              <span aria-hidden>{ICONS[i % ICONS.length]}</span>
            )}
          </span>
          <div className="min-w-0 flex-1">
            <p className={cn("font-semibold", q.done && "text-muted-foreground line-through")}>
              {q.title}
            </p>
            <p className="truncate text-xs text-muted-foreground">{q.desc}</p>
          </div>
          <span className="text-xs font-bold text-muted-foreground tabular">
            {q.done ? "✓" : `${q.progress}/${q.total}`}
          </span>
        </div>
      ))}
      {quests.length > 0 && quests.every((q) => q.done) && (
        <p className="animate-pop pt-1 text-center text-sm font-semibold text-primary-shade">
          Все квесты закрыты! Огонёк гордится! 🔥
        </p>
      )}
    </section>
  );
}
