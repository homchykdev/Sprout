import { Medal } from "lucide-react";
import type { Challenge } from "@/lib/achievements";
import { cn } from "@/lib/utils";

/** Monthly challenge with progress bar and collectible gold medal. */
export function MonthlyChallenge({
  challenge,
  compact,
}: {
  challenge: Challenge;
  compact?: boolean;
}) {
  return (
    <section
      className={cn("card-soft p-5", challenge.claimed && "ring-2 ring-gold")}
      aria-label="Вызов месяца"
    >
      <div className="flex items-center gap-3">
        <span
          className={cn(
            "flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl",
            challenge.claimed ? "bg-gold text-primary-foreground" : "bg-gold-soft text-gold-shade",
          )}
        >
          <Medal className={cn("h-6 w-6", challenge.claimed && "animate-pop")} />
        </span>
        <div className="flex-1">
          <h2 className="font-bold">{challenge.name}</h2>
          <p className="text-sm text-muted-foreground">
            {challenge.claimed
              ? "Медаль месяца — твоя! 🏅"
              : `${challenge.done} из ${challenge.goal} тренировок`}
          </p>
        </div>
        <span className="text-sm font-bold text-gold-shade tabular">
          {Math.round(challenge.pct * 100)}%
        </span>
      </div>
      {!compact || !challenge.claimed ? (
        <div
          className="mt-3 h-4 overflow-hidden rounded-full bg-muted"
          role="progressbar"
          aria-valuenow={challenge.done}
          aria-valuemax={challenge.goal}
        >
          <div
            className="h-full rounded-full bg-gold transition-[width] duration-1000"
            style={{ width: `${Math.max(4, challenge.pct * 100)}%` }}
          />
        </div>
      ) : null}
    </section>
  );
}
