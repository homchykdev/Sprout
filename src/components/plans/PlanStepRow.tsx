import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { BedDouble, GripVertical, TriangleAlert, X } from "lucide-react";
import { TapButton } from "@/components/game/TapButton";
import type { PlanStep } from "@/lib/types";
import { cn } from "@/lib/utils";

export interface PlanStepRowProps {
  step: PlanStep;
  /** Tile emoji for workout steps. */
  emoji: string;
  title: string;
  detail: string;
  /** True when the linked workout no longer exists. */
  missing?: boolean;
  position: number;
  onDelete: () => void;
}

/** One draggable card of the plan cycle: grip handle · content · delete. */
export function PlanStepRow({
  step,
  emoji,
  title,
  detail,
  missing = false,
  position,
  onDelete,
}: PlanStepRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: step.id,
  });
  const rest = step.kind === "rest";
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn(
        "flex items-center gap-1.5 rounded-2xl border-2 p-1.5",
        rest ? "bg-muted/60 border-transparent" : "border-primary/30 bg-card",
        isDragging && "relative z-10 shadow-lg",
      )}
    >
      <button
        {...attributes}
        {...listeners}
        className="-ml-2 flex h-11 w-9 shrink-0 touch-none items-center justify-center text-muted-foreground/70 hover:text-foreground focus-visible:text-foreground focus-visible:outline-2"
        aria-label={`Перетащить шаг ${position}`}
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <span
        className={cn(
          "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-lg",
          rest ? "bg-muted text-muted-foreground" : "bg-primary-soft",
        )}
      >
        {rest ? (
          <BedDouble className="h-5 w-5" />
        ) : missing ? (
          <TriangleAlert className="h-5 w-5 text-destructive" />
        ) : (
          emoji
        )}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold">{title}</p>
        <p className="text-xs text-muted-foreground">{detail}</p>
      </div>
      <TapButton size="icon" variant="ghost" aria-label="Удалить шаг" onClick={onDelete}>
        <X className="h-4 w-4" />
      </TapButton>
      <span
        aria-hidden
        className="press flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-muted text-xs font-bold"
      >
        {position}
      </span>
    </div>
  );
}
