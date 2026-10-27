import { ThumbsDown, ThumbsUp } from "lucide-react";
import { Slider } from "@/components/ui/slider";
import type { Difficulty, Feedback } from "@/lib/types";
import { cn } from "@/lib/utils";

const HINTS: Record<number, string> = {
  1: "очень легко",
  2: "легко",
  3: "несложно",
  4: "чуть сложнее среднего",
  5: "средне",
  6: "рабочая",
  7: "тяжеловато",
  8: "тяжело",
  9: "очень тяжело",
  10: "на пределе",
};

interface Props {
  value?: Difficulty | undefined;
  onChange: (d: Difficulty | undefined) => void;
  isLike?: boolean | undefined;
  onVerdict: (v: "like" | "dislike" | undefined) => void;
}

/** Difficulty 1–10 slider + like/dislike toggle pair. Empty object = no feedback. */
export function FeedbackEditor({ value, onChange, isLike, onVerdict }: Props) {
  return (
    <div className="space-y-3 rounded-2xl border-2 bg-card p-3">
      <div>
        <div className="flex items-baseline justify-between gap-2">
          <p className="text-sm font-semibold text-muted-foreground">
            Сложность:{" "}
            <span className="tabular" aria-live="polite">
              {value ? `${value}/10 — ${HINTS[value]}` : "не оценено"}
            </span>
          </p>
          {value !== undefined && (
            <button
              className="press shrink-0 rounded-full px-2 py-1 text-xs font-semibold text-muted-foreground hover:bg-muted"
              onClick={() => onChange(undefined)}
              aria-label="Убрать оценку сложности"
            >
              Убрать
            </button>
          )}
        </div>
        <Slider
          className="mt-3"
          thumbClassName="h-6 w-6 border-2"
          min={1}
          max={10}
          step={1}
          value={[value ?? 5]}
          aria-label="Оценка сложности от 1 до 10"
          onValueChange={([v]) => onChange(v as Difficulty)}
        />
      </div>
      <div className="flex gap-2" role="group" aria-label="Нравится или нет">
        <button
          className={cn(
            "press flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-2xl border-2 text-sm font-semibold",
            isLike === true
              ? "border-primary bg-primary-soft text-primary-shade"
              : "border-border bg-muted text-muted-foreground",
          )}
          aria-pressed={isLike === true}
          onClick={() => onVerdict(isLike === true ? undefined : "like")}
        >
          <ThumbsUp className="h-4 w-4" /> Нравится
        </button>
        <button
          className={cn(
            "press flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-2xl border-2 text-sm font-semibold",
            isLike === false
              ? "border-destructive bg-destructive/10 text-destructive"
              : "border-border bg-muted text-muted-foreground",
          )}
          aria-pressed={isLike === false}
          onClick={() => onVerdict(isLike === false ? undefined : "dislike")}
        >
          <ThumbsDown className="h-4 w-4" /> Не нравится
        </button>
      </div>
    </div>
  );
}

/** Convert a Feedback object into the two controls' state. */
export const toParts = (f: Feedback | undefined) => ({
  value: f?.difficulty,
  isLike: f?.verdict === "like" ? true : f?.verdict === "dislike" ? false : undefined,
});

/** Merges a patch for optional-feedback editing; a patch key set to undefined clears it. Returns undefined when nothing is set. */
export function cleanFeedback(
  base: Feedback | undefined,
  patch: { difficulty?: Difficulty | undefined; verdict?: "like" | "dislike" | undefined },
): Feedback | undefined {
  const difficulty = "difficulty" in patch ? patch.difficulty : base?.difficulty;
  const verdict = "verdict" in patch ? patch.verdict : base?.verdict;
  return difficulty === undefined && verdict === undefined ? undefined : { difficulty, verdict };
}
