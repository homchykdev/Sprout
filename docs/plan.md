# Plan: Workout session control — pause, previews, session editing, voice rest cues, prep countdown

## Context

All workout-execution logic lives in `src/routes/play.$workoutId.tsx` (single 641-line route).
Current behavior: steps are flattened from `workout.items` (one step per set), `Player` holds
`idx / phase("work"|"rest"|"done") / left` in local `useState`, one 1-second `setTimeout` chain
drives the countdown, there is **no pause**, no way to go back, and speech cues run on
`[idx, phase]` / `[left]` effects (TTS + Web Audio via `src/lib/voice.ts`).
`Exercise.mistakes: string[]` already exists (rendered visually in `WorkView`, never spoken).
Session changes are **not persisted to the workout** — the `steps` memo is frozen on
`workoutId` (existing eslint-disable), which blocks mid-session editing until we switch to
session-local state.

## Requirements (from user)

1. Locked-in decisions: the prep countdown appears **once, before the very first exercise**
   (default 5 s, adjustable in Settings via a new store slice `workoutSettings.prepSeconds`);
   there is **no dedicated pause button** — pause lives in the existing exit (✕) button:
   tapping it opens the "really quit?" confirm dialog and the workout is paused while that
   dialog is open (staying = resume, quitting = exit). Full-view/preview/session-sheet dialogs
   pause the same way. Losing app focus/because backgrounded auto-pauses — the only visible
   pause affordance is an overlay shown only when auto-paused (never takes space otherwise).
2. "Preview next exercise" while exercising → workout pauses while preview is open.
3. "View full exercise" button during a workout (read everything, not just the short
   description) → workout pauses while it is open.
4. Auto-pause when the app loses focus / goes to background (`visibilitychange` / `blur`).
5. Tap the progress bar → sheet listing upcoming exercises; the same sheet lets the user edit
   *the session* (add / remove / reorder exercises, change sets/reps/seconds/rest).
6. After workout completion, if the user edited the session → in-app notification asking
   "Save changes to the workout?" (save via `upsertWorkout`) or "keep as is".
7. Go back to the previous step during a workout.
8. During rest, also speak the frequent mistakes (`mistakes`) of the upcoming exercise.
9. Prep countdown 5–10 s before the workout starts, so the user can see/hear the first
   exercise and get ready.

## Architecture decisions

- **Session-local steps.** `Player` initializes `const [items, setItems] = useState(workout.items)`
  once (snapshot at mount) and derives `steps` from `items` (proper deps). The stored `workout`
  is no longer the source of truth for the running session. New pure helpers in a new
  `src/lib/session.ts`: `buildSteps(items, exercises)`, plus reducers `reorderItem`,
  `removeItem`, `updateItem`, `addItem`, `replaceAllFrom(workout)` — unit-testable with Vitest.
- **Pause without a dedicated button (user decision):** pause lives in the existing exit (✕)
  button — tapping it opens the quit-confirm dialog and pauses the workout while that dialog is
  open (staying = resume, quitting = exit). The same hold semantics cover preview / full-view /
  editor dialogs. Implementation: `pauseSources: string[]` state; each open dialog registers an
  id, close removes it; `paused = pauseSources.length > 0 || autoPaused`:
  - timer effect: `if (paused || left <= 0 || …) return;` (existing chain simply stops rescheduling);
  - metronome/rhythm effects also gate on `!paused`;
  - visibility: `visibilitychange → hidden` and window `blur` → `autoPaused = true`,
    resume via overlay tap (explicit control, never auto-resume);
  - UI: overlay with "Продолжить" shown **only when auto-paused** (no dialogs open) — no extra
    header button, screen space saved. `durationSec` compensates for paused time
    (accumulate `pausedMs` ref; used in `finish()`).
- **Prep phase.** `phase` union gains `"prep"`. On mount → `phase = "prep"`, `left = prepSeconds`
  (new store slice `workoutSettings.prepSeconds`, default 5; editable in Settings).
  **Only once, before the very first exercise** — not before every set. Prep view shows the
  first exercise media + name + amount; voice announces "Приготовься: {name}, {amount}. 
  {steps[0]}" · beep ticks at 3/2/1. "Начать" button skips to work early; existing work-phase
  announcement still fires (kept, since it follows the exercise screens).
  If user edited while in prep, steps rebuild normally.
- **Voice on rest.** Extend the existing rest announcement effect: after
  "Отдых. Далее: …", speak up to 2 `next.ex.mistakes` without `interrupt` (they queue after the
  main line; `speak` already queues when not interrupting). Guard: only when `voice.cues`
  enabled and mistakes exist, to avoid long TTS. Also gate all speech on `!paused` so we never
  speak while paused (cancel current speech on pause via `stopSpeech()`, keep beeps silent too).
- **Session editing sheet** (`src/components/game/SessionEditorSheet.tsx`, new file):
  opens from a tap on the progress bar (the bar becomes a `<button>` wrapping it — keep 44px
  touch target; add subtle `hover:`/`active:` affordance and an aria-label "Список упражнений").
  Contents: list of remaining exercises with "текущее"/"готово" markers; per item: set count,
  reps/seconds, rest (number inputs like `WorkoutEditor`), reorder ↑/↓, delete ✕;
  "Добавить упражнение" opens an exercise picker (extract a small shared `ExercisePicker`
  dialog from the pattern used in `plans.tsx` `WorkoutEditor` rather than duplicating markup).
  Setting `items` marks `dirtyRef.current = true` and clamps `idx`/`phase` safely
  (if the current item was removed → jump to the nearest remaining work step; if session
  becomes empty → show "Тренировка пуста" state with finish/exit actions).
- **Full exercise view** (`src/components/game/ExerciseFullView.tsx`, new file): full-screen
  Dialog (scrollable) with `ExerciseMedia`, description, numbered `steps`, `mistakes` — the
  same content blocks as `WorkView`'s accordion + rest preview, extracted so all three places
  read from one component. Opens from a "Подробнее" button in `WorkView` and from the sheet list.
- **Next-exercise preview**: small card/button in `WorkView` ("Следующее: …") opening
  `ExerciseFullView` for the *next* step (if any). Both preview paths pause via the shared
  modal mechanism.
- **Back navigation**: ChevronLeft ("Назад") button next to the Done/Dальше area or header.
  Rules: from work with `idx > 0` → `idx - 1`, `phase = "work"`, reset `left` for that step;
  disabled on very first step. Hidden during rest (rest already has its own controls);
  after starting rest we can return to the previous *work* step via the back button
  (×) — keep it available in rest too: "вернуться к упражнению" (idx stays, phase → work).
- **Save-changes prompt**: on `finish()`, if `dirty` → render a Dialog over/near the Summary
  flow: "Ты изменил состав тренировки. Сохранить изменения в тренировке «{name}»?" with
  two TapButtons: "Сохранить" (`upsertWorkout({ ...workout, items })` + toast "Сохранено")
  and "Оставить как есть". Decided via in-app dialog (not just a toast with actions, since
  toasts are transient during the confetti/summary phase — but a sonner toast with
  `toast.custom` pointing to the dialog would duplicate) — **one dialog, no toast**.

## Implementation steps (each = one commit)

1. **`refactor: session-local steps + pure session helpers`**
   - New `src/lib/session.ts` with pure functions + Vitest tests (`session.test.ts`).
   - `Player` switches to `items` snapshot; fix the `steps` memo deps; `dueToday`/XP logic untouched.
   - Green: build + tests; behavior unchanged.
2. **`feat: pause/resume with visibility auto-pause`**
   - `paused` state, timer/metronome/rhythm gating, hidden-on-blur/visibilitychange,
     pause overlay + header Play/Pause button, `pausedMs` compensation in `finish()`,
     stop speech on pause. Respect `prefers-reduced-motion` for the overlay animation
     (CSS classes already do this repo-wide — verify).
3. **`feat: prep countdown phase`** — new `"prep"` phase, voice + beeps, skip button,
   prep view reusing `ExerciseThumb`/`ExerciseMedia`.
4. **`feat: full exercise view + next-exercise preview`**
   - New `ExerciseFullView` (extract content from `WorkView` accordion), "Подробнее" in
     `WorkView`, "Следующее" preview in `WorkView` (pause via shared modal mechanism).
5. **`feat: back to previous step`** — back button in header/work view + rest, clamped,
   with existing set-fanfare NOT fired (skipping back should not award fanfare twice —
   `advance()` remains the only fanfare path).
6. **`feat: session editor sheet via progress bar tap`**
   - Progress bar becomes a button; `SessionEditorSheet` + `ExercisePicker` extraction;
     safe `idx/phase` clamping, empty-session state.
7. **`feat: save-changes prompt after workout`** — dirty tracking, dialog on Summary,
   `upsertWorkout` on save.
8. **`feat: mistake cues during rest`** — queued TTS of up to 2 upcoming-exercise mistakes,
   gated by `voice.cues`.

Steps 2–3 could be merged if they touch the same effect block; keep commits honest either way.

## Files

| File | Change |
|---|---|
| `src/routes/play.$workoutId.tsx` | pause, prep phase, back, progress-bar button, modal wiring, dirty tracking, save prompt |
| `src/lib/session.ts` (new) | pure steps/items helpers + types |
| `src/lib/session.test.ts` (new) | Vitest for helpers |
| `src/components/game/ExerciseFullView.tsx` (new) | full-exercise dialog (reused by WorkView, preview, sheet) |
| `src/components/game/SessionEditorSheet.tsx` (new) | session edit sheet |
| `src/components/game/ExercisePicker.tsx` (new) | exercise picker dialog extracted from `plans.tsx` pattern (plans.tsx refactor optional, separate commit if touched) |
| `src/lib/types.ts` | none expected (WorkoutItem is enough) — only if session helpers need a `SessionStep` type alias |

No new dependencies. No changes to `store.ts` persistence (session state stays in React state;
reload loses an unfinished session — same as today, noted as known gap).

## Risks / edge cases

- Removing the currently active exercise / emptying the session → handled by clamping + empty state.
- Timer chain correctness with pause (off-by-one at `left === 1` advance) — regression-test the
  effect manually; existing logic stays untouched apart from the `paused` gate.
- TTS queue on web (`speechSynthesis`) can be killed by `cancel()` — mistake cues must not use
  `interrupt`, and pause must `stopSpeech()`; verify on Android Chrome (mobile-first).
- `visibilitychange` fires when opening dev tools — acceptable.
- Long exercise names in the sheet — truncate + full name in `ExerciseFullView`.
- Fanfare/X must not double-award when going back and re-completing a set — verify `advance()`
  is the single `logSession` path (it is).

## Definition of done

`pnpm typecheck && pnpm lint && pnpm test && pnpm build` pass; Playwright walkthrough of the
session (prep → work → preview pause → back → sheet edit → rest cues → finish → save prompt),
screenshots at 390px and 1440px, zero console errors/warnings; loading/empty/error and
long-text states checked; final report with what was and wasn't verified.
