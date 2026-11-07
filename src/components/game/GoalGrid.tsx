import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
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
import { CheckSquare, MoreVertical, Pencil, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { PhotoTile } from "@/components/game/PhotoTile";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
 * Hold photo for ~1-2 seconds to unlock drag and drop reordering.
 * Quick tap opens lightbox, menu provides edit, select, and delete.
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
  const draggedRef = useRef(false);

  useEffect(() => {
    setLocalItems(items);
  }, [items]);

  const sensors = useSensors(
    useSensor(MouseSensor, {
      activationConstraint: {
        delay: 350,
        tolerance: 8,
      },
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 350,
        tolerance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const handleDragStart = (e: DragStartEvent) => {
    draggedRef.current = true;
    setActiveId(String(e.active.id));
    try {
      navigator.vibrate?.(40);
    } catch {
      /* ignore */
    }
  };

  const handleDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    setActiveId(null);
    setTimeout(() => {
      draggedRef.current = false;
    }, 150);

    if (!over || active.id === over.id) return;

    const oldIndex = localItems.findIndex((x) => x.id === active.id);
    const newIndex = localItems.findIndex((x) => x.id === over.id);
    if (oldIndex < 0 || newIndex < 0 || oldIndex === newIndex) return;

    const next = arrayMove(localItems, oldIndex, newIndex);
    setLocalItems(next);
    onReorder(next.map((x) => x.id));
  };

  const handleDragCancel = () => {
    setActiveId(null);
    setTimeout(() => {
      draggedRef.current = false;
    }, 150);
  };

  const activeItem = activeId ? localItems.find((x) => x.id === activeId) : null;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <SortableContext items={localItems.map((x) => x.id)} strategy={rectSortingStrategy}>
        <div className="grid grid-cols-2 gap-3" role="list" aria-label="Цели фигуры">
          {localItems.map((m) => (
            <SortableGoalCard
              key={m.id}
              m={m}
              selectMode={selectMode}
              selected={selected.includes(m.id)}
              draggedRef={draggedRef}
              onTap={() => onTapItem(m)}
              onSelect={() => onHoldItem(m)}
              onEdit={() => onEditItem(m)}
              onDelete={() => onDeleteItem(m)}
            />
          ))}
        </div>
      </SortableContext>

      <DragOverlay zIndex={50}>
        {activeItem ? (
          <div className="aspect-[3/4] w-full rotate-1 scale-105 rounded-2xl shadow-2xl ring-4 ring-primary">
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
  draggedRef: React.RefObject<boolean>;
  onTap: () => void;
  onSelect: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

function SortableGoalCard({
  m,
  selectMode,
  selected,
  draggedRef,
  onTap,
  onSelect,
  onEdit,
  onDelete,
}: SortableGoalCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: m.id,
    disabled: selectMode,
  });

  const style = {
    transform: CSS.Translate.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      role="checkbox"
      aria-checked={selectMode ? selected : undefined}
      aria-label={m.title || "Фото цели"}
      tabIndex={0}
      onClick={() => {
        if (draggedRef.current) return;
        onTap();
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onTap();
        }
      }}
      className={cn(
        "relative cursor-pointer select-none rounded-2xl outline-none [touch-action:pan-y] transition-transform focus-visible:ring-4 focus-visible:ring-ring/30",
        isDragging ? "opacity-35 scale-95" : "active:scale-[0.98]",
      )}
    >
      <PhotoTile m={m} big selectMode={selectMode} selected={selected} />

      <span
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
        className="absolute right-1.5 top-1.5 z-20"
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
            <DropdownMenuItem className="min-h-[44px] text-[15px]" onSelect={onSelect}>
              <CheckSquare className="h-4 w-4" /> Выбрать
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
