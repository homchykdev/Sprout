import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, MoreVertical, Pencil, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { PhotoTile } from "@/components/game/PhotoTile";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { consumeLongPress, markLongPress, useLongPress } from "@/hooks/use-long-press";
import type { MediaItem } from "@/lib/media";
import { cn } from "@/lib/utils";

export interface GoalGridProps {
  items: MediaItem[];
  selectMode: boolean;
  selected: string[];
  onTapItem: (m: MediaItem) => void;
  onHoldItem: (m: MediaItem) => void;
  onEditItem: (m: MediaItem) => void;
  onDeleteItem: (m: MediaItem) => void;
  onReorder: (orderedIds: string[]) => void;
}

/**
 * 2-column sortable grid of goal physique photos.
 * Reorderable via drag handle, opens lightbox on tap, enters multi-select on hold.
 */
export function GoalGrid({
  items,
  selectMode,
  selected,
  onTapItem,
  onHoldItem,
  onEditItem,
  onDeleteItem,
  onReorder,
}: GoalGridProps) {
  const [localItems, setLocalItems] = useState<MediaItem[]>(items);
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    setLocalItems(items);
  }, [items]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 4 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const handleDragStart = (e: DragStartEvent) => {
    setActiveId(String(e.active.id));
  };

  const handleDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    setActiveId(null);
    if (!over || active.id === over.id) return;

    const oldIndex = localItems.findIndex((x) => x.id === active.id);
    const newIndex = localItems.findIndex((x) => x.id === over.id);
    if (oldIndex < 0 || newIndex < 0 || oldIndex === newIndex) return;

    const next = arrayMove(localItems, oldIndex, newIndex);
    setLocalItems(next);
    onReorder(next.map((x) => x.id));
  };

  const activeItem = activeId ? localItems.find((x) => x.id === activeId) : null;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setActiveId(null)}
    >
      <SortableContext items={localItems.map((x) => x.id)} strategy={rectSortingStrategy}>
        <div className="grid grid-cols-2 gap-3" role="list" aria-label="Цели фигуры">
          {localItems.map((m) => (
            <SortableGoalCard
              key={m.id}
              m={m}
              selectMode={selectMode}
              selected={selected.includes(m.id)}
              onTap={() => onTapItem(m)}
              onHold={() => onHoldItem(m)}
              onEdit={() => onEditItem(m)}
              onDelete={() => onDeleteItem(m)}
            />
          ))}
        </div>
      </SortableContext>

      <DragOverlay zIndex={50}>
        {activeItem ? (
          <div className="aspect-[3/4] w-full rotate-1 scale-105 rounded-2xl shadow-2xl ring-2 ring-primary">
            <PhotoTile m={activeItem} big />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

interface SortableGoalCardProps {
  m: MediaItem;
  selectMode: boolean;
  selected: boolean;
  onTap: () => void;
  onHold: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

function SortableGoalCard({
  m,
  selectMode,
  selected,
  onTap,
  onHold,
  onEdit,
  onDelete,
}: SortableGoalCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: m.id,
    disabled: selectMode,
  });

  const press = useLongPress(() => {
    markLongPress();
    onHold();
  });

  const style = {
    transform: CSS.Translate.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...press}
      role="checkbox"
      aria-checked={selectMode ? selected : undefined}
      aria-label={m.title || "Фото цели"}
      tabIndex={0}
      onClick={() => {
        if (consumeLongPress()) return;
        onTap();
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onTap();
        }
      }}
      className={cn(
        "relative cursor-pointer rounded-2xl outline-none [touch-action:pan-y] focus-visible:ring-4 focus-visible:ring-ring/30",
        isDragging && "opacity-35",
      )}
    >
      <PhotoTile m={m} big selectMode={selectMode} selected={selected} />

      {!selectMode && (
        <button
          type="button"
          {...attributes}
          {...listeners}
          aria-label="Перетащить фото"
          onPointerDown={(e) => {
            listeners?.["onPointerDown"]?.(e);
            e.stopPropagation();
          }}
          onClick={(e) => e.stopPropagation()}
          className="absolute left-1.5 top-1.5 flex h-11 w-11 touch-none items-center justify-center rounded-full bg-foreground/60 text-background backdrop-blur-xs transition hover:bg-foreground/80 active:scale-95 focus-visible:outline-2"
        >
          <GripVertical className="h-5 w-5" />
        </button>
      )}

      <span
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
        className="absolute right-1.5 top-1.5"
      >
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              aria-label="Действия с фото"
              onClick={(e) => e.stopPropagation()}
              className="flex h-11 w-11 items-center justify-center rounded-full bg-foreground/60 text-background backdrop-blur-xs hover:bg-foreground/80 focus-visible:outline-2"
            >
              <MoreVertical className="h-5 w-5" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-52 rounded-2xl">
            <DropdownMenuItem className="min-h-[44px] text-[15px]" onSelect={onEdit}>
              <Pencil className="h-4 w-4" /> Изменить
            </DropdownMenuItem>
            <DropdownMenuItem
              className="min-h-[44px] text-[15px] text-destructive focus:text-destructive"
              onSelect={onDelete}
            >
              <Trash2 className="h-4 w-4" /> Удалить
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </span>
    </div>
  );
}
