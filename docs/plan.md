# Plan: Game economy rework — coins, shop, 4-tier streak protection, progression, illustrated medals

## Goal
Turn workouts into a game loop that pulls the user back daily (Duolingo-style):
a spendable **coin** currency, a **shop**, a reworked **streak protection ladder**
(with sick leave), **variable rewards** (chests), **collectible illustrated medals**
with the mascot "Огонёк", plus **progressive overload** built into plan creation.
No new dependencies. No backend — everything stays on-device.

## Research basis (Duolingo & others, 2025–2026)
- **Streak + loss aversion** is the #1 retention driver; freezes/repairs keep the
  habit positive (streak freeze cut churn ~21% for at-risk users).
- **Two currencies** (XP for progress + gems for the shop) create two motivation
  loops; the shop gives coins real value (freezes, boosts, repairs, chests).
- **Daily quests** (+25% DAU when introduced), **monthly challenge with an exclusive
  illustrated badge** that disappears when the month ends — "I must get THIS one".
- **Variable rewards** (treasure chests after lessons, +15% lesson completion),
  XP boosts for burst motivation, streak repair as a safety net, cosmetics to
  drain excess currency long-term.
- Fitness parallels: Strava challenges, Apple Fitness awards — scarcity + art.

## User decisions
- Medals: **hand-authored SVG** by me, in the app's style with Огоньёк (no AI image gen).
- Protections (4 tiers, checked top→bottom):
  1. **Long vacation** — planned by the user (trip, deload) **or auto** after
     ~6 weeks (setting 4–12) of uninterrupted training; freezes the streak; free.
  2. **Sick leave (больничный)** — NEW, independent of vacation allowance: mark a
     date range **retroactively** ("болел"), streak frozen like vacation,
     reminders off. Rolling cap: **≤7 days in any 30** (≤14 in 90); beyond the cap
     the days are unprotected and the UI says so honestly. Health-first messaging:
     the game never pushes training while sick.
  3. **Day-off (выходной)** — 1 day; bought in the shop or earned as a reward; taken
     manually anytime or auto-applied to a missed workout.
  4. **Freeze (заморозка)** — used only when a day-off isn't available/already spent
     this run (or the user owns no day-offs). After the freeze day, the next missed
     day breaks the streak. Max **2 unplanned protected days in a row**.
  Ladder per missed planned day: vacation/sick → day-off → freeze → streak breaks.
- Currency: **coins separate from XP** (XP = levels only).
- Shop assortment: day-offs, freezes, **streak repair**, **XP-booster**, **chest**,
  **profile cosmetics**.
- Quests must fit the **fixed plan (1 workout/day)** — no "do many workouts" demands.

## Current state (explored)
- `src/lib/game.ts` — level(), vacation helpers, advice; `src/lib/achievements.ts` —
  dayStreak, 16 emoji badges, monthly challenge (goal 12), 3 daily quests.
- `src/lib/plan.ts` — `planProgress()` pure day-walk; auto-spends bonus days
  (max `bonusMax`, returns after `bonusRestoreDays`) then freezes (earned only by
  weekly settlement ≥80%, cap `freezeMax`).
- `src/routes/play.$workoutId.tsx` — XP = (steps×10+30)×1.5 for bonus workouts.
- No coins, no shop; vacations free & unlimited (`VacationButton`).
- Store `pulse-fit-v1` v12; backup v2 per-section JSON; mascot = hand-drawn SVG.
- `SessionLog.sets` records one entry per performed set; plan editor lives in
  `plans.tsx` (settings with x/n/y/threshold at the bottom).

## Target model

### Economy (`src/lib/economy.ts`, new — all numbers in one place, tunable)
Earning (with daily caps against bonus-workout farming):
| Event | Coins |
|---|---|
| Planned workout | +12 |
| Bonus workout (extra effort) | +20, max 2/day |
| Daily quest | +6 each; all 3 → +12 combo |
| Monthly challenge milestones (4/8/12) | +10/+15/+25 |
| Monthly medal earned | +50 |
| Streak milestone 7/14/30/60/100 | +15/+25/+50/+100/+200 |
| Perfect week (all planned done) | chest |
| Morning/evening chest (first workout <12:00 / >20:00, 1/day) | variable 8–25 |
| Progression bump reached (new set/rep level) | +15, once per level |
| Progress photo | +10 |
| Diary mood/note | +2 |
| Badge unlock | +10; level-up +20×level |

Spending:
| Item | Price | Notes |
|---|---|---|
| Day-off | 40 | stock cap 7 |
| Freeze | 65 | stock cap 3 |
| Streak repair | 150 | within 3 days of a break, restores the broken run |
| XP-booster ×2 (next workout) | 35 | stock cap 3, consumed at logSession |
| Chest | 30 | roll: 40% coins 10–50, 25% booster, 15% day-off, 10% freeze, 10% coins 5; 1/day |
| Cosmetics (avatar rings, profile themes) | 120–300 | 2–3 items to start |

### Protection rework (`src/lib/plan.ts`)
- `planProgress()` walks history as today, but pools become **stock**:
  `stock.dayOff`, `stock.freeze` (persisted; weekly settlement keeps granting
  +1 freeze to stock, capped).
- Ladder per missed planned day (per run): day-off → freeze → break; at most
  1 day-off + 1 freeze can protect one consecutive-miss run (max 2 days),
  third day breaks the streak.
- **Sick leave**: `Vacation.kind?: "trip" | "deload" | "sick"`; sick behaves like
  vacation in the walk (skip day, no consumption); allowance enforced at marking
  time via `sickAllowance(sick, now)` (rolling 30d ≤ 7). Missed-day flow suggests
  marking sick instead of shaming the user.
- **Streak repair**: a ledger event dated ≤3 days after `breakAt` revives the run
  in the pure walk (no streak loss), shown as repaired in UI.
- **Auto deload (tier 1)**: when the current run reaches `deloadEveryWeeks`
  (default 6, slider 4–12) and no vacation is active — home card proposes +
  notification; setting `autoDeload` (default on) inserts a 7-day vacation
  (`kind: "deload"`) automatically.
- Old `bonusMax/bonusRestoreDays/freezeMax` semantics retire; caps move to economy.

### Quest rework for the fixed plan (`src/lib/achievements.ts`)
- Quest 1 (always): «Тренировка дня» — planned or bonus workout.
- Quests 2–3: 2 rotating from a pool (deterministic pick per day):
  «Растяжка 5+ подходов», «Объём 20+ подходов», «+3 подхода сверх плана»,
  «Дневник: настроение/заметка», «Быстро: ≤20 минут», «Новая высота» (progression bump).
- Remove the XP quest (depends on workout size, not effort). All-3 combo → +12 coins.
- Monthly challenge (goal 12) and weekly settlement stay as-is (plan-compatible).

### Progression (plan creation, `src/lib/plan.ts` + `plans.tsx`)
- `Plan.progression?: { addSetEveryLoops?: number; addRepEveryLoops?: number;
  setCap: number; repCap: number; timeCapSec: number }`.
- Pure resolver `applyProgression(plan, items, loopIndex)` — `loopIndex` = full
  cycle loops since `plan.origin`; per-item: sets = min(base + bumps, setCap),
  reps/seconds likewise (time-mode exercises gain seconds up to `timeCapSec`).
- Shared by Home card, plans forecast, and the play route (single source, no drift).
- UI block «Прогрессия» in plan settings: toggles + sliders (every N loops: +1 set;
  every M loops: +1 rep / +5 сек), caps (sets ≤6, reps ≤15 / 90 сек).
- Surfaces: «+1 подход» badge on today's card and in the player; first bump per
  level = coin reward + «Новая высота» quest. Deload/vacation naturally pauses it.

### Store (v13) & backup
- New state: `coins`, `ledger: {date, item, qty, source, delta}[]`,
  `stock: {dayOff, freeze}`, `boosts`, `ownedCosmetics: string[]`, `activeCosmetic`,
  `autoDeload: boolean`, `deloadEveryWeeks: number`, `plan.progression`,
  `Vacation.kind`.
- Migration v12→v13: `bonusLeft → stock.dayOff`, `freezeLeft → stock.freeze`,
  existing vacations → `kind: "trip"`, progression defaults off, coins start at 0.
- `backup.ts`: coins/ledger/stock/cosmetics go into the game section (v2 keeps import).

### Reward moments (the "pull")
- Post-workout Summary: coins counter ticks up, **chest pop** (chance-based),
  booster banner if active, quest-completion toasts.
- Home: quest cards show coin rewards; monthly challenge gets milestone markers;
  streak-milestone progress line; sick-leave card when missed days are detected.
- Header: coin chip (click → `/shop`) with a dot when a free daily chest is claimable.
- Achievements screen: badges show coins earned on unlock.

### Illustrated medals (`src/components/game/medals.tsx`, new)
- Hand-authored SVG components, token colors only, same character as `Mascot`:
  16 badge redesigns (streak flame tiers, lark/night owl, steel core, legs, atlas,
  milestones) + **12 monthly medals** (seasonal Огоньёк: hat, glasses, wreath…).
- Locked state = monochrome silhouette; medal collection grid on profile
  ("Витрина") with "эта медаль больше никогда не будет доступна" copy for monthly.
- Re-skin: `Badges.tsx`, `MonthlyChallenge.tsx`, profile `BadgeStrip`.

## Steps
1. **Economy core** — `economy.ts` + tests; store v13 migration; `plan.ts` ladder
   (day-off → freeze → break) + sick leave + repair + deload; quest rework in
   `achievements.ts`; update `plans.tsx` counters & settings text.
2. **Progression** — resolver + tests; plan settings UI; play/Home surfaces;
   bump rewards.
3. **Shop** — `/shop` route (tabs: Защита / Улучшения / Косметика), buy flows,
   insufficient-coins state, free daily chest, header coin chip.
4. **Reward moments** — play Summary coins/chest, home quest rewards + sick/deload
   cards, milestone toasts/notifications.
5. **Medals** — SVG pack + collection screen + re-skin of badge surfaces.
6. **Polish** — backup integration, full test pass, browser walkthrough
   (390px/1440px), balance notes.

## Files
- New: `src/lib/economy.ts`, `src/lib/__tests__/economy.test.ts`,
  `src/routes/shop.tsx`, `src/components/game/shop/*`,
  `src/components/game/medals.tsx`, `src/lib/__tests__/plan.economy.test.ts`,
  `src/components/game/SickDialog.tsx`.
- Changed: `src/lib/store.ts` (v13), `src/lib/plan.ts` (ladder, sick, progression),
  `src/lib/achievements.ts` (quest pool), `src/lib/game.ts` (deload helper),
  `src/lib/backup.ts`, `src/components/game/AppShell.tsx`, `Badges.tsx`,
  `MonthlyChallenge.tsx`, `VacationButton.tsx` (kind-aware),
  `useReminders.ts` (deload/sick notify), `routes/{index,plans,profile,achievements,play.$workoutId}.tsx`.

## Risks
- **Farming** (bonus workouts for coins): daily caps in economy.
- **Sick-leave abuse**: rolling caps; no coins earned on sick days.
- **Walk correctness** with stock events + repairs: dedicated tests for interleavings
  (buy-before-miss, buy-after-miss, run limits, settlement during run).
- **Progression drift**: play route must use the same resolver as previews — tested.
- **Balance**: all numbers centralized; expect iteration after playtesting.
- **Migration**: users keep current protections (mapped to stock); vacations get
  `kind: "trip"` — no data loss.
- **Asset volume**: medals phased last; silhouette fallback if a design slips.
- Chest RNG must be deterministic in tests (seeded roll per event id).

## Verification
- `pnpm typecheck && pnpm lint && pnpm test && pnpm build`.
- Unit: coin pricing + caps, ladder interleavings, chest EV < price, migration
  v12→v13, progression resolver (bump cadence, caps, time-mode), sick allowance.
- Browser: buy day-off → skip a planned day → walk shows protection consumed;
  sick marking flow; repair flow; chest animation; progression bump visible in
  player; shop at 390/1440; zero console errors.

---

# Android build fix

## Goal

Make the current web app build usable as bundled Capacitor assets for the existing Android Studio project, so an Android APK includes the latest app instead of stale assets.

## Steps

1. Restore the Vite/TanStack Start configuration from the last committed version, then configure a production output that contains a valid `index.html` and client assets in Capacitor's configured `webDir` (`.output/public`). Preserve the existing web development flow.
2. Add package scripts for the Android workflow: build the web app, synchronize the generated assets with Android, and open the project in Android Studio.
3. Keep the existing Capacitor app ID, name, Android project, and local-only SDK configuration unchanged. Document the commands and required JDK/Android SDK environment.
4. Verify the web build output, run Capacitor sync, and build the Android debug APK using the installed Android Studio JDK. Run the relevant typecheck/lint/tests if configuration changes affect them.

## Expected files

- `vite.config.ts` — undo the uncommitted static/SSR override and configure the supported production output.
- `package.json` — add Android build/sync scripts without changing package manager or dependencies.
- `README.md` — document the Android Studio workflow and environment requirements.
- `docs/plan.md` — this plan.

## Risks

- TanStack Start's current server-rendered output may not be directly bundleable as a standalone Capacitor app. The chosen configuration must produce a valid client entry point without breaking the existing web app.
- The standalone APK bundles the web UI, not the TanStack server runtime. AI, article import, and FFmpeg server functions require a deployed server endpoint.
- The current `android/app/src/main/assets/public` is stale; synchronization must replace it with the freshly built assets before APK creation.
- Android build requires a JDK and Android SDK configured on the local machine. This repository's `android/local.properties` is machine-specific and must not be committed.

## Outcome

Approved and implemented: the SPA shell is emitted as `.output/public/index.html`, and the Android sync/build path was verified. Typecheck and tests passed; lint completed with existing warnings.
