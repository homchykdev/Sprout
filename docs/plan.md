# Plan: Workout builder preview/drag + plan cycle step preview

## Что делаем (по 4 пунктам запроса)

1. **Предпросмотр упражнений в конструкторе тренировки** (`WorkoutEditor`, `src/routes/plans.tsx`)
   - Каждому пункту списка добавляем `ExerciseThumb` (фото/видео → постер YouTube → emoji),
     как в библиотеке (`library.tsx:111`) и `SessionEditorSheet.tsx:90`. Размер `h-10 w-10`.
   - Тап по имени упражнения → `ExerciseFullView` (диалог с медиа, описанием, шагами) — как в
     `SessionEditorSheet`. Это и есть «предпросмотр того, что выполнять».

2. **Drag-to-reorder вместо стрелочек** (в `WorkoutEditor`)
   - Убираем кнопки ArrowUp/ArrowDown у пунктов, добавляем sortable через dnd-kit
     (`SortableContext` + `useSortable` + grip-ручка), тот же паттерн, что в `PlanStepRow`.
     dnd-kit уже в зависимостях (используется в `PlanEditor`), новых deps нет.
   - Сенсоры: PointerSensor (distance 6) + KeyboardSensor — сохраняем доступность: ручка
     получает aria-инструкции и работает со стрелками.
   - Кнопка удаления (X) у пункта остаётся.
   - `SessionEditorSheet` (стрелочки во время сессии) НЕ трогаем — там пункты «выполнено/сейчас»
     и тап занимает другое место; запрос касался именно создания тренировки.

3. **Фото-превью при выборе упражнения в пикере** (`WorkoutEditor`, inline-поиск)
   - Строки списка «Добавить упражнение» рендерим как в библиотеке: `ExerciseThumb h-10 w-10`
     + имя + категория/мышцы (компактно, одна строка-подпись `CATEGORIES[category]`).
   - `CATEGORIES` уже экспортируется из `library.tsx` — переиспользуем (или переносим хелпер).

4. **Цикл плана: тап по шагу**
   - `PlanStepRow`: добавляем проп `onOpen`, тап по контенту строки (не по ручке и не по X)
     вызывает его. Тап-зона — кнопка-обёртка вокруг контента (a11y, >= 44px).
   - **Шаг с тренировкой (exists)** → открываем новый `WorkoutPreviewDialog`
     (`src/components/plans/WorkoutPreview.tsx`): название + emoji, длительность
     (`estimateMinutes`), список упражнений с `ExerciseThumb h-12 w-12`, sets/reps/seconds,
     отдых, ритм/темп, тап по упражнению → `ExerciseFullView`. Кнопка «Начать» →
     navigate `/play/$workoutId` (как остальная навигация в plans, через TanStack Router).
   - **Шаг с удалённой/недоступной тренировкой** (`missing`) → открываем тот же
     `StepInsertSheet` на месте этого шага: в `PlanEditor` добавляем состояние
     `replaceStepId`; `addStep` при `replaceStepId` сначала `removePlanStep(id)`,
     потом `addPlanStep` на его индекс. Позиционный лейбл «вместо №N».
   - Новые строки-пикеры в `StepInsertSheet` тоже показывают превью первых упражнений?
     Нет — оставляем emoji+имя (вне запроса, не раздуваем дифф). Только workout preview
     получает фото.

## Файлы
- `src/routes/plans.tsx` — WorkoutEditor: thumbs, dnd-kit reorder, пикер с thumbs;
  открыть preview из списка тренировок не требуется (только из цикла).
- `src/components/plans/WorkoutPreview.tsx` — NEW: диалог предпросмотра тренировки.
- `src/components/plans/PlanStepRow.tsx` — проп `onOpen`, тап по контенту.
- `src/components/plans/PlanEditor.tsx` — `onOpen` (preview vs replace-sheet),
  `WorkoutPreviewDialog` + `ExerciseFullView` навигация.
- `docs/plan.md` — этот файл.

## Риски
- Вложенные интерактивы в пунктах конструктора (inputs) + dnd: ручка перетаскивания —
  отдельный элемент с `touch-none`, inputs не рушат drag (проверено в PlanStepRow).
- `key={i}` у пунктов конструктора: при драге React может пересортировать DOM неверно —
  поменяем key на `exerciseId + индекс-стабильный` (не меняя поведение данных).
- Persist store v13 не меняется — новая логика только UI.

## Проверка
- `pnpm typecheck && pnpm lint && pnpm test && pnpm build`.
- Dev server + Playwright: создать тренировку (drag, превью, пикер), цикл: тап по
  тренировке → preview; тап по удалённой → sheet вставки. Скриншоты 390/1440, консоль.
