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

### Quest rework — "усиленные квесты" (`src/lib/achievements.ts`)
Every quest closes inside the single planned workout (or one small action after it);
no "do another workout" demands — extra effort comes in small doses.
- Slot 1 (always): «Тренировка дня» — planned or bonus workout, +6.
- Slots 2–3: two quests picked **deterministically per day** from an applicability-
  filtered pool (never impossible, never random-per-user):
  - «+2 повторения» — one set with 2+ reps above plan (reps-mode) → verified by
    `sets[].reps` vs the planned item.
  - «+2 подхода сверх плана» — extra sets on any exercise (or bonus exercise) →
    verified by `sets[].extra`.
  - «Растяжка 5+» — 5+ stretch sets today.
  - «Быстро: ≤20 минут» — shown only when the day's estimate fits; duration check.
  - «Дневник» — mood or note on today's session.
  - «Фото прогресса» — only when the photo reminder is due.
  - «Бонусная тренировка» — rest-day slot; a second (bonus) session today.
- All 3 done → +12 coin combo + mascot line. The XP quest is removed (depends on
  workout size, not effort).
- Quest progress is visible **in the player header** («+2 повторения · 0/1» with a
  check) — like Duolingo showing quests inside the lesson.
- Player enablers required: (1) **rep stepper** on set completion (reps mode,
  defaults to plan, optional +/- → logged), (2) **«+ подход»** button on the rest
  screen (appends an extra, flagged step). Optional later: bonus-exercise picker
  in Summary. These same fields unlock future rep PRs.
- Data: `SessionLog.sets[]` gains optional `reps?: number` and `extra?: boolean`;
  session gains optional `metronome?: boolean` — migration-safe (old logs valid).
- Weekly quest card («Идеальная неделя», «3 дня с доп-подходами» → chest) is a
  candidate for a later phase, not in this batch.
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
  `Vacation.kind`. Optional log fields (no migration risk): `sets[].reps`,
  `sets[].extra`, session `metronome`.
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
  `src/lib/achievements.ts` (quest pool + rotation), `src/lib/game.ts` (deload helper),
  `src/lib/backup.ts`, `src/components/game/AppShell.tsx`, `Badges.tsx`,
  `MonthlyChallenge.tsx`, `VacationButton.tsx` (kind-aware),
  `useReminders.ts` (deload/sick notify),
  `routes/play.$workoutId.tsx` (rep stepper, «+ подход», quest progress header,
  progression resolver for steps),
  `routes/{index,plans,profile,achievements}.tsx`.

## Risks
- **Farming** (bonus workouts for coins): daily caps in economy.
- **Sick-leave abuse**: rolling caps; no coins earned on sick days.
- **Walk correctness** with stock events + repairs: dedicated tests for interleavings
  (buy-before-miss, buy-after-miss, run limits, settlement during run).
- **Progression drift**: play route must use the same resolver as previews — tested.
- **Quest honesty**: quests must be verifiable from logged data — the rep stepper
  and «+ подход» ship in the same step as the quests that need them; quests whose
  data can't exist (old logs) degrade gracefully (show as "сделай сегодня").
- **Balance**: all numbers centralized; expect iteration after playtesting.
- **Migration**: users keep current protections (mapped to stock); vacations get
  `kind: "trip"` — no data loss.
- **Asset volume**: medals phased last; silhouette fallback if a design slips.
- Chest RNG must be deterministic in tests (seeded roll per event id).

## Verification
- `pnpm typecheck && pnpm lint && pnpm test && pnpm build`.
- Unit: coin pricing + caps, ladder interleavings, chest EV < price, migration
  v12→v13, progression resolver (bump cadence, caps, time-mode), sick allowance,
  quest rotation (same day → same quests), applicability filters, combo bonus,
  quest detection from logs (reps above plan, extra sets).
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

---

# Android notifications and camera framing

## Goal

Make scheduled workout/photo reminders arrive while the Android app is backgrounded or closed, and show/capture the Samsung Galaxy A53 5G portrait camera feed without cutting off its top or bottom.

## Steps

1. Add `@capacitor/local-notifications` for native Android scheduling and permission requests; retain the existing browser notification behavior for web.
2. Connect the workout/photo reminder schedule and settings updates to Android's local notification scheduler. Replace/cancel pending app-managed reminders when settings or schedule change, and avoid posting duplicate foreground reminders. Document Android's notification permission and battery/force-stop limitations.
3. Request a portrait 3:4 camera aspect ratio where supported. Inspect actual video dimensions at runtime; if the Android WebView reports a landscape frame while the device is held vertically, display the frame upright in a contained portrait viewport and rotate the captured canvas consistently, rather than cropping its top and bottom.
4. Add focused tests for portrait aspect-ratio constraints, orientation normalization, and reminder schedule generation/cancellation. Run typecheck, lint, tests, production build, Capacitor sync, and Android debug build.

## Expected files

- `package.json` and the npm lockfile — add the Capacitor Local Notifications plugin; required to deliver notifications while JavaScript is stopped.
- `src/lib/notify.ts`, `src/components/game/useReminders.ts`, `src/hooks/usePhotoReminder.ts`, and `src/components/game/settings/NotificationsGroup.tsx` — native notification permission, scheduling, and settings integration with a web fallback.
- `src/lib/capture.ts`, `src/components/game/CameraStage.tsx`, and `src/lib/__tests__/capture.test.ts` — portrait stream/capture orientation handling.
- `README.md` — Android notification behavior and permissions.
- `docs/plan.md` — this plan.

## Risks

- Android 13+ requires notification permission, and Android vendor battery optimizations or force-stopping the app can restrict alarms. The app must report denied permission clearly and avoid claiming delivery in those states.
- The device camera may report sensor dimensions differently across WebView/Android versions. Runtime dimension checks should rotate only a landscape feed displayed in portrait, without stretching or cropping native portrait feeds.
- Physical Galaxy A53 verification is not available in this environment; the updated APK will need a device retest.

## Outcome

Implemented and verified with automated tests, TypeScript, lint, production build, Capacitor sync, and Android debug build. Physical Galaxy A53 verification remains outstanding.

---

# Follow-up: Galaxy A53 camera and pose reliability

## Goal

Make portrait camera preview and saved photos upright and visible, restore MediaPipe pose detection in the installed Android app, and prevent camera initialization from cutting off the spoken setup instructions.

## Findings

- On the connected Galaxy A53, the camera track reports 1280×720 in portrait. The preview canvas is 720×1280, but its sampled pixels are all zero: the current 90-degree canvas transform draws the frame outside the canvas.
- MediaPipe falls back to manual mode because the installed WASM JavaScript throws during initialization. The copied JS and package JS have the same size but different contents; `prepare-mediapipe.mjs` currently skips copying based only on file size.
- Camera enumeration can set `cameraDeviceId` after the initial stream starts. Since that state restarts the camera effect, its cleanup can stop the initial voice prompt and unnecessarily reopen the camera.

## Steps

1. Use explicit canvas transforms for upright rotation and front-camera mirroring. Revert the unsuccessful sensor-native 3:4 / 4:3 constraints to the prior 9:16 / 16:9 settings. Recalculate when the preview or video dimensions change, and avoid reconfiguring the camera track during screen rotation; add regression tests for constraints, transform matrices, and captured-frame sizing.
2. Compare WASM asset contents, not only file sizes, when preparing MediaPipe assets so the app bundles matching JS and WASM files.
3. Keep automatic active-camera discovery from restarting the stream; only a user-selected camera should trigger a camera switch.
4. Build and sync the Android app, install it on the connected Galaxy A53, and verify portrait preview, a correctly oriented saved frame, MediaPipe pose guidance, automatic capture, and uninterrupted spoken instructions.

## Files

- `src/lib/capture.ts`
- `src/lib/__tests__/capture.test.ts`
- `scripts/prepare-mediapipe.mjs`
- `src/components/game/CameraStage.tsx`
- `docs/plan.md`

## Risks

- Incorrect mirror/rotation transform order could fix the rear camera while reversing the front-camera preview or capture; verify both matrices with unit tests.
- MediaPipe still depends on the Android WebView's WASM support and available memory; confirm the actual runtime reaches pose-ready state on the device.
- Android build/sync can update generated assets. Preserve unrelated existing worktree changes and verify only task-related files are altered.

## Verification

Run the repository's typecheck, lint, tests, and production build. Then sync/build/install the Android debug app and inspect the real-device WebView state and logs while testing the capture flow in portrait.

## Current status

The first Android iteration fixed the MediaPipe JS/WASM mismatch; the device reached AI-control mode, but the user still observed a cropped frame. Starting in landscape and rotating back to portrait has allowed a successful capture, suggesting startup orientation timing remains relevant. A 9:16 portrait build retained a square crop, and the sensor-native 3:4 / 4:3 build was reported worse. Revert to the previously installed 9:16 / 16:9 request and validate the next camera candidate on the Galaxy A53 before considering CameraX.

---

# Camera framing and persistent voice guidance

## Goal

Undo the latest 3:4 camera constraint that worsened framing, and keep spoken pose guidance active from camera readiness through the automatic or manual photo capture.

## Steps

1. Return to the previously installed 9:16 portrait / 16:9 landscape ideal constraints and retain the existing orientation normalization. Do not claim framing is fixed until the user verifies the installed build.
2. Speak the latest actionable camera status when it changes and repeat it every 6 seconds while the camera is ready and the shutter countdown is not active. The countdown announcement takes priority; stop guidance when a photo is captured, the camera exits, or the app backgrounds.
3. Add focused tests for the guidance repeat/pause/stop behavior and retain camera constraint tests.
4. Run typecheck, lint, tests, production build, sync/build/install the Android app, and ask the user to verify portrait framing and uninterrupted guidance on the Galaxy A53.

## Files

- `src/lib/capture.ts`
- `src/lib/__tests__/capture.test.ts`
- `src/components/game/CameraStage.tsx`
- `src/lib/voice-guidance.ts` (only if needed to isolate and test repeat timing)
- `src/lib/__tests__/voice-guidance.test.ts` (only if the helper is added)
- `docs/plan.md`

## Risks

- Returning to 9:16 restores the less-bad previous behavior but does not guarantee portrait framing is fixed; device-specific camera selection/cropping may still require CameraX.
- Repeating rapidly changing hints can interrupt speech. Repeat only the latest status, throttle status changes if necessary, suspend repetition during the countdown, and stop on capture/background/unmount.
- The phone's visual result must be verified by the user; do not infer framing from a successful build or orientation metadata alone.

## Current status

The unsuccessful 3:4 / 4:3 camera request has been reverted. The latest Android build adds repeated, latest-only spoken status guidance with countdown pause and capture/background/unmount cleanup. Focused tests and all 140 tests pass; typecheck, lint, production build, and Android debug build pass. The build is installed on the Galaxy A53; portrait framing and real-device voice timing still need user verification.
