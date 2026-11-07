# Plan: Drag-and-Drop Reordering for Target Physique Photos («Цели фигуры»)

## User Request
Сделать, чтобы фото целевых фигур можно было менять местами и перетаскивать (Draggable photos).

## 1. Context & Architecture
- Photos and videos for the "Цели фигуры" (album `goal`) are stored in IndexedDB (`pulse-media` store) via `src/lib/media.ts`.
- The gallery route `src/routes/gallery.tsx` currently renders `GoalCell` items in a static 2-column grid (`grid grid-cols-2 gap-3`), sorted by date/time.
- The project already has `@dnd-kit/core`, `@dnd-kit/sortable`, and `@dnd-kit/utilities` installed (used in `PlanEditor.tsx`).
- Existing photo card interactions:
  - Single tap: open in lightbox (or toggle checkbox if multi-selecting).
  - Long-press: enter multi-select mode (`useLongPress`).
  - Top-right «···» menu: edit note/title or delete.
  - Page scroll: vertical scrolling on mobile (`touch-action: pan-y`).

## 2. Steps

### Step 1: Data Model & Persistence (`src/lib/media.ts`)
1. Extend `MediaItem` interface with optional `order?: number`.
2. Update `useMedia` sorting:
   - For `album === "goal"`, sort primarily by `order` (ascending).
   - If `order` is missing/equal, fallback to `b.date.localeCompare(a.date) || b.createdAt - a.createdAt` (preserves existing order for un-reordered items).
3. Update `addFiles` and `addLink` for `album === "goal"`:
   - Compute `minOrder` of existing goal items; newly added goal items get `order: (minOrder ?? 0) - 1` so they appear at the front of the grid.
4. Add `reorderMedia(album: Album, orderedIds: string[]): Promise<void>`:
   - Atomic batch update in a single `readwrite` IndexedDB transaction: assigns `order: index` (0, 1, 2, ...) to the items matching `orderedIds`.
   - Calls `emit()` to notify subscribers.

### Step 2: Goal Grid Component with DnD (`src/components/game/GoalGrid.tsx`)
1. Create `GoalGrid.tsx` using `@dnd-kit/core` (`DndContext`, `DragOverlay`, `closestCenter`, `PointerSensor`, `KeyboardSensor`, `TouchSensor`) and `@dnd-kit/sortable` (`SortableContext`, `rectSortingStrategy`, `useSortable`).
2. Add Sortable Goal Item (`SortableGoalCard`):
   - Touch-friendly drag grip handle button in top-left (`GripVertical` icon, >=44px touch target, `touch-action: none`).
   - Prevents scroll interference on mobile: finger drag on the grip reorders; finger drag elsewhere scrolls the page smoothly.
   - Preserves tap to open, long-press to multi-select, and top-right dropdown menu.
   - When in multi-select mode (`selecting === true`), drag handles are hidden/disabled to avoid conflict with selection checkboxes.
3. Smooth animation:
   - `CSS.Transform.toString(transform)` and transition via `useSortable`.
   - `DragOverlay` showing an elevated preview with subtle scale and shadow when dragging.
   - Immediate optimistic state update on drag end + batch persistence via `reorderMedia`.

### Step 3: Integration in Gallery View (`src/routes/gallery.tsx`)
1. Replace inline static mapping in `src/routes/gallery.tsx` with `<GoalGrid ... />`.
2. Pass through lightbox, edit, select, and delete handlers.

### Step 4: Unit Testing & Verification
1. Add tests in `src/lib/__tests__/goal-reorder.test.ts` for goal ordering logic, new item placement, and sort comparisons.
2. Run `pnpm typecheck && pnpm lint && pnpm test && pnpm build`.
3. Test in browser (desktop + mobile viewport 390px): verify dragging, reordering, persistence after reload, and scroll behavior.

## 3. Files Touched
- `src/lib/media.ts` (order field, sort logic, reorderMedia batch transaction, initial order on add)
- `src/components/game/GoalGrid.tsx` (new component: DnD context, sortable grid, drag handle, drag overlay)
- `src/routes/gallery.tsx` (integrate GoalGrid into goal album view)
- `src/lib/__tests__/goal-reorder.test.ts` (new tests for ordering logic)

## 4. Risks & Mitigations
- **Risk: Mobile scroll locking/lag.**
  - *Mitigation*: Dragging via dedicated drag handle with `touch-action: none`, keeping `touch-action: pan-y` on the card container so native page scroll is never intercepted by accident.
- **Risk: Interaction collisions (drag vs tap vs long-press vs menu).**
  - *Mitigation*: Strict isolation — drag handle captures pointer down/touch for DnD; menu stops propagation; card body handles long-press / tap. DnD disabled during selection mode.
- **Risk: Janky reorder on slow devices.**
  - *Mitigation*: Optimistic local array update during drag, persisting to IndexedDB asynchronously in a single batch transaction.
