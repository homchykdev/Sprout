import type { BadgeState } from "@/lib/achievements";
import { cn } from "@/lib/utils";

const GROUPS = ["Серии", "Время и дисциплина", "Баланс и сила", "Вехи"] as const;

/** Achievements grouped with real progress bars and unlock status. */
export function Badges({ states }: { states: BadgeState[] }) {
  const unlocked = states.filter((b) => b.unlocked).length;
  return (
    <section aria-label="Достижения">
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="text-lg font-bold">Награды</h2>
        <span className="text-sm font-semibold text-muted-foreground tabular">
          {unlocked} / {states.length}
        </span>
      </div>
      <div className="space-y-5">
        {GROUPS.map((g) => {
          const items = states.filter((b) => b.def.group === g);
          if (!items.length) return null;
          return (
            <div key={g}>
              <h3 className="mb-2 text-sm font-bold uppercase tracking-wider text-muted-foreground">
                {g}
              </h3>
              <div className="grid grid-cols-1 gap-2">
                {items.map(({ def, done, unlocked: got, pct }) => (
                  <div
                    key={def.id}
                    className={cn("card-soft flex items-center gap-3 p-3.5", !got && "opacity-70")}
                  >
                    <span
                      className={cn(
                        "flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-2xl",
                        got ? "bg-gold-soft" : "bg-muted grayscale",
                      )}
                    >
                      {def.icon}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold">{def.title}</p>
                      <p className="text-xs text-muted-foreground">{def.desc}</p>
                      <div
                        className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted"
                        role="progressbar"
                        aria-valuenow={done}
                        aria-valuemax={def.total}
                        aria-label={def.title}
                      >
                        <div
                          className={cn(
                            "h-full rounded-full transition-[width] duration-700",
                            got ? "bg-gold" : "bg-primary",
                          )}
                          style={{ width: `${Math.max(3, pct * 100)}%` }}
                        />
                      </div>
                    </div>
                    <span className="shrink-0 text-xs font-bold text-muted-foreground tabular">
                      {got ? "✓" : `${done}/${def.total}`}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
