# Plan: user feedback (difficulty 1–10 + like/dislike) feeding into AI plan generation

## Goal
- User can rate **difficulty 1–10** and set **like/dislike** for every exercise and every workout.
- AI plan/workout generation (`aiCreateWorkout`, `aiCreateExercise`) receives this feedback and adapts.

## Data model
`src/lib/types.ts`:
```ts
export type Rating = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;
export type Feedback = { difficulty?: Rating | undefined; verdict?: "like" | "dislike" | undefined };
```
- `Exercise` gets `feedback?: Feedback | undefined`.
- `Workout` gets `feedback?: Feedback | undefined` (evaluated as a whole, after full completion; per-session logs stay untouched).
- Optional fields follow the existing `x?: T | undefined` exactOptional pattern.

## Store
`src/lib/store.ts`:
- Bump persist `version: 10 → 11`; add migration doc-line + `if (from < 11) {}` — nothing to fill (fields optional), so the block only guarantees future-proof defaults. `migrateState` untouched fields pass through; `importAll` path still works.
- New actions:
  - `rateExercise(exerciseId, feedback: Feedback)` — sets/updates `feedback` on the exercise (allows clearing via empty object).
  - `rateWorkout(workoutId, feedback: Feedback)` — same for a workout.
  Both write through `upsertExercise`/`upsertWorkout` internals (targeted `set` on the matching id).
- Backup/export (`src/lib/backup.ts`): fields ride on `exercises` / `workouts` sections automatically; verify v2 export & merge import include them (no schema change expected).

## AI integration (`src/lib/clients.ts`)
- In `aiCreateWorkout(goal, library)`: extend the per-exercise library lines passed into the prompt:
  `id|name|category|mode|muscles|difficulty:1-10|verdict` — e.g. `ex_12|Приседания|strength|reps|quads|8|like`.
  Only rated exercises get the suffix; unrated stay as-is.
- Extend `SYS`/prompt text: "Учитывай оценку сложности (1–10) и вердикт (лайк/дизлайк): упражнения с дизлайком исключай; disliked muscle groups/activity types снижай; сложность новой тренировки таргетируй в диапазон 5–7, опираясь на оценки пользователя (если всё было «слишком легко» — повышай)."
- `aiCreateExercise`: pass compact feedback context (count of likes/dislikes + avg difficulty of user's library) so a new exercise matches the user's taste.
- `sanitizeExercise` / response filter unchanged (feedback is input-only).

## UI

### Exercises (`src/components/game/ExerciseEditor.tsx` + `src/routes/library.tsx`)
- New shared component `src/components/game/FeedbackEditor.tsx` (props: `value: Feedback, onChange, title`):
  - Slider (shadcn `Slider`, `min=1 max=10 step=1`) for difficulty with live value label ("Сложность: 7/10 — тяжело" mapping via labels array).
  - Like/Dislike pair: two `TapButton`s with lucide `ThumbsUp`/`ThumbsDown`, toggle behavior (tap again = clear), semantic `aria-pressed`, ≥44px targets.
- `ExerciseEditor` gets a "Моя оценка" section embedding `FeedbackEditor`, wired to store on save (or immediately, matching the editor's inline-update pattern used there).
- Library list rows (`library.tsx`): small passive badges — 👍/👎 icon + difficulty dot (e.g. `7/10` chip) — visible at a glance, tappable to jump into rating.

### Workouts
- `src/routes/plans.tsx` workout cards: same badges + entry to a `FeedbackEditor` in a small `Dialog` (reuse exercise editor pattern).
- `src/routes/play.$workoutId.tsx`: at session end, `DiaryForm`/finish screen gains "Оцените тренировку" (`FeedbackEditor`) → `rateWorkout` on finish. This is the natural moment the user can judge difficulty.

## Tests (`*.test.tsx`, Vitest + RTL)
- Store: `rateExercise`/`rateWorkout` set and clear feedback; migrate from v10 fixture keeps data.
- `clients.ts`: prompt for `aiCreateWorkout` contains `difficulty`/`verdict` suffixes for rated exercises and not for unrated; disliked included in prompt (model decides), sanitize untouched.
- UI: `FeedbackEditor` toggles like→dislike→clear; slider emits 1–10; exercise editor saves feedback.
- Existing feedback-free prompts unaffected.

## Definition of done
`pnpm typecheck && pnpm lint && pnpm test && pnpm build`, then dev-server walk via browser tools: rate exercise → badges update → AI workout prompt preview shows feedback; rate workout after session; screenshots 390/1440; zero console errors.

## Steps (each committed)
1. types + store actions + migration (v11) + tests.
2. `FeedbackEditor` component + tests.
3. Wire into `ExerciseEditor` + library badges.
4. Wire into plans route + post-session workout rating.
5. AI prompt extension in `clients.ts` + prompt tests.
6. Backup verification, full DoD pass, report.

## Risks
- Prompt bloat if library is large → only rated exercises get suffix, cap line length.
- Like/dislike could over-prune AI choices → prompt explicitly says dislike = "avoid, but suggest a milder alternative", not hard ban in phrasing.
- Store migration: fields optional, so risk is minimal; test v10→v11 path.
