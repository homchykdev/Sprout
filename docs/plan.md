# Plan: Duolingo-style workout reminders & nagging

## Goal
Make reminders feel alive and persistent like Duolingo: context-aware phrase pools,
an **escalating tone during the user's workout window** (light → passive-aggressive),
in-app mascot nagging, and a celebration when the streak is saved. No new dependencies.

## Decisions from the user
- Tone: balanced overall, but gets more passive-aggressive toward the end of the day.
- User configures a **workout window** (e.g. 10:00–16:00) and a **preferred workout time**
  (e.g. 11:30 or 15:30) instead of the current single hour.
- No motivational pushes on rest days. Nags only when a workout is due.
- Mascot with a speech bubble is the in-app "face" of nags.

## Current state
- `src/components/game/useReminders.ts` - hourly tick, slots = hour, +2h, +4h, max 3/day.
- `src/lib/game.ts` - static `NAGS` (5 lines) and `MOTIVATION` (6 lines).
- `src/lib/notify.ts` - system notification helper; `photo-reminders.ts` - photo nags.
- Store: `reminders {enabled, hour}`, `lastNotified "yyyy-MM-dd#count"`.

## Design

### 1. Phrase engine - `src/lib/phrases.ts` (pure functions, testable)
Categories (8-12 phrases each, Russian, existing tone):
- `motive` - friendly motivational ("Ты сильнее, чем вчера. Буквально.")
- `nudge` - light guilt ("Эти упражнения сами себя не сделают 💪")
- `guilt` - passive-aggressive (end-of-window tone)
- `streakRisk(n)` - "Серия {n} в опасности 🔥" (interpolated)
- `celebrate` - "Серия спасена! 🔥 …"
- `timeGreeting(h)` - утро/день/вечер prefix.
- `pickPhrase(pool, seed, excludePrefix)` - deterministic pseudo-random by day+slot,
  never repeats the immediately previous message.
- Tone level maps to window progress: 0-40% → motive, 40-75% → nudge, 75-100% → guilt,
  past window end → guilt + streakRisk.

### 2. Reminder scheduling - `useReminders.ts` rewrite
- New settings: `reminders.windowStart`, `windowEnd`, `preferred` (workout time, minutes).
- Slot ladder inside the window (defaults, derived from window):
  1. at `preferred` (or windowStart) - friendly `motive`
  2. midway between preferred and windowEnd - `nudge`
  3. at windowEnd - 30 min: `guilt` (passive-aggressive turn)
  4. 30 min past windowEnd **only if today is a scheduled workout day** with a live
     streak: `streakRisk` "last call".
- If the preferred time already passed when the app opens, the ladder collapses to the
  slots still in the future (max: remaining count, same logic as today).
- Cap: no notifications after 22:00 (absolute).
- **Celebration**: if >=1 nag was sent and today's workout completes the same day, one
  positive push "Серия спасена!" and reset `lastNotified`.
- Rest days (no planned workout): a single friendly ping max at the preferred time,
  no escalation. Duolingo-style: Sunday is protected.
- Escalating in-app tone uses the same progression.
- `lastNotified` keeps the `#count` format; store v12 adds `windowStart/windowEnd/preferred`
  (migrate old `hour` → preferred=hour*60, window = preferred ± 3h clamped to waking hours).
- Notification clock skew: compare minutes-since-midnight, DST-safe enough for local time.

### 3. In-app mascot nudge - new `src/components/game/StreakNudge.tsx`
- Home screen bubble next to the existing `Mascot`: shows today's phrase from the current
  tone level; the bubble copy re-picks when the tone level or day changes.
- If the user idles >15 min with the app open and an undone workout: one sonner toast
  per 15-min cap (session-capped), phrases get guiltier each time.
- Never shows nags/toasts on `play.*` routes. Hidden when the workout is done.
- After completing the workout, the bubble switches to `celebrate`.

### 4. Settings UI - `NotificationsGroup.tsx`
- Replace the single "первое напоминание в {h}:00" select with:
  window start+end selects (minutes in 30-min steps, 06:00-22:00) + "обычное время
  тренировки" select (30-min steps inside the window).
- Inline preview: "Сегодня: {first phrase}" + tone-ladder explainer line.
- Same draft-context pattern as today (changes wait for Save).

## Files
- `src/lib/phrases.ts` (new)
- `src/lib/__tests__/phrases.test.ts` (new)
- `src/components/game/useReminders.ts` - rewrite
- `src/components/game/StreakNudge.tsx` (new)
- `src/routes/index.tsx` - mount `<StreakNudge />`
- `src/components/game/settings/NotificationsGroup.tsx` - new time controls
- `src/lib/game.ts` - NAGS/MOTIVATION move into phrases.ts (keep re-exports for old imports)
- `src/lib/store.ts` - v12 migration: reminders window + preferred
- `src/lib/backup.ts` / `settings-draft.ts` - new reminder fields into settings

## Risks
- Notifications only fire while the PWA/tab is alive (browser reality, already true today).
- Could use server push for true closed-app reminders - that needs a backend; would ASK
  before adding (out of scope for now).
- Phrase tone is opinionated; wording iterated after feedback.
- The in-app toast caps must not fight the workout timer - playback route excluded.

## Verification
- `pnpm typecheck && pnpm lint && pnpm test && pnpm build`
- Unit: phrase pools cover every tone level, no immediate repeats, interpolation works.
- Playwright/browser: mock Notification, set preferred time in the past, window covers now,
  verify notification is sent and tone escalates; complete the workout -> celebrate push;
  check Home nudge states at 390px and 1440px; zero console errors.
