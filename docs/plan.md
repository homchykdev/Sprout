# Plan: Game economy rework — coins, shop, 3-tier streak protection, illustrated medals

## Goal
Turn workouts into a game loop that pulls the user back daily (Duolingo-style):
a spendable **coin** currency, a **shop**, a reworked **streak protection ladder**,
**variable rewards** (chests) and **collectible illustrated medals** with the mascot
"Огонёк". No new dependencies. No backend — everything stays on-device.

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
- Protections (3 tiers, priority top→bottom):
  1. **Long vacation** — planned by the user (trip, deload) **or auto** after 1.5–2
     months of uninterrupted training; freezes the streak; stays free.
  2. **Day-off (выходной)** — 1 day; bought in the shop or earned as a reward; can be
     taken manually anytime or auto-applied to a missed workout.
  3. **Freeze (заморозка)** — used only when a day-off isn't available/already spent
     this run (or the user owns no day-offs). After the freeze day, the next missed
     day breaks the streak. Max **2 unplanned protected days in a row**.
  Ladder per missed planned day: vacation → day-off → freeze → streak breaks.
- Currency: **coins separate from XP** (XP = levels only).
- Shop assortment: day-offs, freezes, **streak repair**, **XP-booster**, **chest**,
  **profile cosmetics**.

## Current state (explored)
- `src/lib/game.ts` — level(), vacation helpers, advice; `src/lib/achievements.ts` —
  dayStreak, 16 emoji badges, monthly challenge (goal 12), 3 daily quests.
- `src/lib/plan.ts` — `planProgress()` pure day-walk; auto-spends bonus days
  (max `bonusMax`, returns after `bonusRestoreDays`) then freezes (earned only by
  weekly settlement ≥80%, cap `freezeMax`).
- `src/routes/play.$workoutId.tsx` — XP = (steps×10+30)×1.5 for bonus workouts.
- No coins, no shop; vacations free & unlimited (`VacationButton`).
- Store `pulse-fit-v1` v12; backup v2 per-section JSON; mascot = hand-drawn SVG.

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
  `stock.dayOff`, `stock.freeze` (persisted; grants = weekly settlement keeps
  granting +1 freeze to stock, capped).
- Ladder per missed planned day (per run): day-off → freeze → break; at most
  1 day-off + 1 freeze can protect one consecutive-miss run (max 2 days),
  third day breaks the streak.
- **Streak repair**: a ledger event dated ≤3 days after `breakAt` revives the run
  in the pure walk (no streak loss), shown as repaired in UI.
- **Auto deload (tier 1)**: when the current run reaches `deloadWeeks` (default 8)
  and no vacation is active — home card proposes + notification; setting
  `autoDeload` (default on) inserts a 7-day vacation automatically
  (optional `auto: true` flag in `Vacation`).
- Old `bonusMax/bonusRestoreDays/freezeMax` semantics retire; caps move to economy.

### Store (v13) & backup
- New state: `coins`, `ledger: {date, item, qty, source, delta}[]`,
  `stock: {dayOff, freeze}`, `boosts`, `ownedCosmetics: string[]`, `activeCosmetic`,
  `autoDeload: boolean`, `deloadWeeks: number`.
- Migration v12→v13: `bonusLeft → stock.dayOff`, `freezeLeft → stock.freeze`
  (settled at current values), coins start at 0.
- `backup.ts`: coins/ledger/stock/cosmetics go into the game section (v2 keeps import).

### Reward moments (the "pull")
- Post-workout Summary: coins counter ticks up, **chest pop** (chance-based),
  booster banner if active, quest-completion toasts.
- Home: quest cards show coin rewards; monthly challenge gets milestone markers;
  streak-milestone progress line.
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
   rework + repair + deload; update `plans.tsx` counters & settings text.
2. **Shop** — `/shop` route (tabs: Защита / Улучшения / Косметика), buy flows,
   insufficient-coins state, free daily chest, header coin chip.
3. **Reward moments** — play Summary coins/chest, home quest rewards + deload card,
   milestone toasts/notifications.
4. **Medals** — SVG pack + collection screen + re-skin of badge surfaces.
5. **Polish** — backup integration, full test pass, browser walkthrough
   (390px/1440px), balance notes.

## Files
- New: `src/lib/economy.ts`, `src/lib/__tests__/economy.test.ts`,
  `src/routes/shop.tsx`, `src/components/game/shop/*`,
  `src/components/game/medals.tsx`, `src/lib/__tests__/plan.economy.test.ts`.
- Changed: `src/lib/store.ts` (v13), `src/lib/plan.ts`, `src/lib/achievements.ts`
  (coin hooks on milestone defs), `src/lib/game.ts` (deload helper),
  `src/lib/backup.ts`, `src/components/game/AppShell.tsx`, `Badges.tsx`,
  `MonthlyChallenge.tsx`, `VacationButton.tsx` (auto-deload status),
  `useReminders.ts` (deload notify), `routes/{index,plans,profile,achievements,play.$workoutId}.tsx`.

## Risks
- **Farming** (bonus workouts for coins): daily caps in economy.
- **Walk correctness** with stock events + repairs: dedicated tests for interleavings
  (buy-before-miss, buy-after-miss, run limits, settlement during run).
- **Balance**: all numbers centralized; expect iteration after playtesting.
- **Migration**: users keep current protections (mapped to stock); vacations untouched.
- **Asset volume**: medals phased last; silhouette fallback if a design slips.
- Chest RNG must be deterministic in tests (seeded roll per event id).

## Verification
- `pnpm typecheck && pnpm lint && pnpm test && pnpm build`.
- Unit: coin pricing + caps, ladder interleavings, chest EV < price, migration v12→v13.
- Browser: buy day-off → skip a planned day → walk shows protection consumed;
  repair flow; chest animation; shop at 390/1440; zero console errors.
