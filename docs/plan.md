# Plan: Tap-Tempo Rhythm Pattern per Exercise («Настучать ритм»)

## User Request
Добавить к метроному второй режим темпа: пользователь настукивает ритм пальцем (интервалы, напр. 0.2 / 0.2 / 1 с), паттерн записывается и затем зацикленно проигрывается во время выполнения упражнения (каждое повторение / всё время сета), пока не закончится время или не перейдёт к следующему упражнению.

## User Decisions
- Ритм **вместо** bpm: в редакторе выбирается один из двух режимов темпа (метроном или ритм).
- Запись только в редакторе упражнения (библиотека).
- Записываем **сырые интервалы мс, без квантования**.
- **Правка №2:** пользователь настучит **несколько повторов цикла** подряд — алгоритм
  распознаёт периодичность (детектор периода по последовательности межтаповых
  интервалов) и усредняет интервалы по циклам, снижая шум пальца. Если распозналось
  неверно — **каждый интервал правится вручную в мс** (список number-inputs + add/remove).
- Предотвращение ошибок: дребезг (<45 мс) склеивается; лимиты 60–5000 мс и ≤32
  интервалов; при низкой уверенности детектора — жёлтый варнинг «проверь / простучи
  ещё цикл»; звук-превью до сохранения; валидация на границах ввода.
- **Первый удар цикла — акцентный** (громче/иначе по звуку).

## Context (current state)
- `Exercise.bpm?` в `src/lib/types.ts` (L51), per-item override `WorkoutItem.bpm?` (L67).
- Воспроизведение: `play.$workoutId.tsx` (L106–113) — `setInterval(() => beep("metro"), 60000/bpm)`, гейтится `phase === "work"`, `v.metronome`, `muted`. `setInterval` дрейфует — ок для ровного тика, плохо для ритма → нужен lookahead-планировщик на Web Audio.
- Редактирование bpm: `ExerciseEditor.tsx` (L134–162); в `plans.tsx` — поля «Темп» на пункт тренировки.
- Beep/`tone()`/AudioContext-синглтон в `src/lib/voice.ts`; `primeAudio()` вызывается в плеере.
- Миграции: `store.ts` `version: 12`, `migrateState` со списком изменений в комментарии; тесты в `src/lib/__tests__/store.test.ts`.
- Прецедент массива пар на Exercise: `clips: {start,end}[]`.

## Data Model
```ts
// src/lib/types.ts
exercise.rhythm?: number[] | undefined;   // ms between taps; beats play at 0, i0, i0+i1, ...; loop length = sum
workoutItem.rhythm?: number[] | undefined; // per-plan override, same unit
```
- Первый удар каждого цикла — акцентный по умолчанию (не хранится отдельно, чисто playback).
- Ограничения: 1–32 интервала, каждый 60–5000 мс (`sanitizeRhythm`).
- `item.rhythm ?? ex.rhythm` — если задан ритм, он **вытесняет** `bpm` и у пункта, и у упражнения (ритм > bpm в приоритете разрешения).

## Steps

### Step 1: Data model + migration (`commit feat:`)
1. `types.ts`: добавить оба поля с комментариями.
2. `store.ts`: `version: 12 → 13`, строка в changelog-комментарии `migrateState`. Поле optional и добавляется только в редакторе → данные не трогаем, миграция — passthrough (проверить, что exercises не фильтруются в `migrateState`).
3. `__tests__/store.test.ts`: кейс v12→v13 — данные сохраняются, нет потерь привычных полей.
4. Проверить `backup.ts`: экспорт раздела exercisesDump if wholesale — rhythm едет бесплатно; только убедиться, что импорт v2/v1 не отбрасывает неизвестные поля.

### Step 2: Pure rhythm logic (`commit feat:`)
1. Новый `src/lib/rhythm.ts` (чистые функции, без React):
   - `sanitizeTaps(tapsMs: number[]): number[]` — склейка дребезга (<45 мс между тапами).
   - `analyzeTaps(tapsMs: number[]): TapAnalysis | null` — детектор цикла: ищет
     наименьший период k по последовательности гэпов (сравнение `gaps[i]` vs
     `gaps[i+k]`, tol = clamp(0.15·медиана, 25–90 мс)), усредняет интервалы слота по
     всем циклам → `{ intervals, cycleMs, cycles, unstable }`. Против алиасинга
     (все тапы лежат на сетке меньшего периода) — именно гэп-периодичность, а не
     сетка кратности. Fallback: нельзя распознать ≥1 повтор → весь ввод = один цикл,
     `unstable`, последний интервал правится вручную.
   - `sanitizeRhythm(intervals)` / `RHYTHM_LIMITS` — клэмп 60–5000 мс, ≤32 при
     сохранении/проигрывании; `cycleMs`, `impliedBpm` (подсказка «~N уд/мин»).
2. `createRhythmPlayer({ intervals, onBeat? }): { start, stop }`:
   - Lookahead-планировщик: `setInterval(50ms)` → планирует осцилляторы через `tone(...)` **на AudioContext-ном времени** до текущий + 250 мс. Нет дрейфа, пауза таба браузера не рвёт ритм сильнее bpm-варианта.
   - Внешний колбэк `onBeat(i)` — для визуального пульса (см. Step 4), вызывается ровно при `o.start()`.
3. `voice.ts`: экспортировать приватные `audio()`/`tone()` (переименовать в `getAudioContext` / `playTone`) — единственные правки в существующем аудио-слое.
4. `__tests__/rhythm.test.ts`: sanitize (дребезг, лимиты, пустой ввод, 33 удара), cycle/impliedBpm, задёрганные интервалы.

### Step 3: Recorder UI (`commit feat:`)
1. Новый `src/components/game/TapRhythmRecorder.tsx`:
   - Большая пэд-кнопка (≥44px, `pointerdown` + `performance.now()`): первый тап стартует запись, далее накапливаем интервалы; live-счётчик «ударов: N».
   - Push-чтобы завершить: отдельная кнопка «Стоп / записать», плюс авто-стоп по паузе > 5 c? — Нет: явная кнопка «Готово» (не полагаемся на тайминг пальца).
   - Прямоугольный «ленточный» preview: точки по интервалам, ширина пропорциональна длительности; подпись «цикл 3.2 с ~19 уд/мин».
   - Кнопки: «Прослушать» (createRhythmPlayer, в цикле до повторного нажатия), «Перезаписать», «Очистить» (= сброс в bpm-режим).
   - Тонкие состояния: 1 тап (нельзя «Готово»), дребезг, слишком длинный цикл.
2. `ExerciseEditor.tsx`: блок «Темп» → сегмент-переключатель «Метроном | Ритм»:
   - Метроном → старый UI (input + пресеты 40/60/90).
   - Ритм → `<TapRhythmRecorder>`; выбор сбрасывает противоположное поле (`up({ rhythm: undefined })` / `up({ bpm: undefined })`).
3. Бэдж в списке библиотеки: рядом с `♩60` — добавленный значок ритма (lucide `AudioWaveform` или `Drum`, например `♫3.2s`).
4. Мобильная эргономика: тап-пэд на всю ширину, тапы ловятся на `touchstart`/`pointerdown` (без ghost-click двойного срабатывания).

### Step 4: Playback в плеере (`commit feat:`)
1. `play.$workoutId.tsx`: метроном-эффект разветвляем:
   - `rhythm = item.rhythm ?? ex.rhythm` — если есть → `createRhythmPlayer` (start на `phase === "work"`, cleanup = `stop()` на `idx/phase/muted`/снятии).
   - Иначе старый `setInterval`-bpm путь без изменений.
   - Гейты те же: `v.metronome`, `muted`; `primeAudio()` уже вызывается в эффекте плеера.
2. Визуальный пульс в `WorkView`: на `onBeat` дёргаем DOM-элемент через `ref`/`classList` (без setState на каждом ударе): акцентная дуга вокруг таймера/счёта повторов пульсирует 150 мс. `prefers-reduced-motion` → только лёгкая opacity-подсветка.
3. Переходы сета/упражнения: cleanup-эффект убивает цикл автоматически (как сейчас с bpm).

### Step 5: Per-plan override в plans.tsx (`commit feat:`)
1. В блоке «Темп» пункта тренировки: если у упражнения есть ритм — чип «Ритм из упражнения (3.2c)», кнопка «Настучать свой» (тот же `TapRhythmRecorder` в компакт-режиме) и «Сбросить». Сохраняется в `item.rhythm`.
2. Плейсхолдер показывает «♪ ритм упражнения».

## Files Touched
- `src/lib/types.ts` — `Exercise.rhythm?`, `WorkoutItem.rhythm?`
- `src/lib/store.ts` — version 13, changelog
- `src/lib/rhythm.ts` — NEW: sanitize/limits/cycle/player
- `src/lib/voice.ts` — экспорт audio()/tone() (без логики)
- `src/components/game/TapRhythmRecorder.tsx` — NEW
- `src/components/game/ExerciseEditor.tsx` — режим метроном|ритм
- `src/routes/play.$workoutId.tsx` — playback ритма + пульс
- `src/routes/plans.tsx` — per-item override
- `src/lib/backup.ts` — проверка, что rhythm проходит экспорт/импорт
- tests: `__tests__/rhythm.test.ts` (NEW), `__tests__/store.test.ts` (v13)
- `src/routes/library.tsx` — бэджик ритма в списке

## Risks & Mitigations
- **Дребезг быстрых тапов** → интервал < 60 мс склеивается в `sanitizeRhythm`, а не верифицируется пользователем.
- **Дрейф ритма на `setInterval`** → планируем на AudioContext-времени (до 250 мс вперёд), а не по тикам JS.
- **Visual перерисовки на каждом ударе** → `onBeat` прячет DOM к `ref`, рендер React не задействован.
- **Слепая зона when user только 1 интервал** → всё равно ок (ритм из 2 ударов, напр. 0/1.0) — поддерживается.
- **Пауза аудио-контекста на мобилках** → `primeAudio()` уже вызывается в плеере; `TapRhythmRecorder` тоже вызывает при «Прослушать» (user gesture).
- **Migration risk**: поле optional, только добавляем; миграция passthrough, тест v12→13.
- **Перезапись ритма после уже действующего bpm** → переключатель сбрасывает противоположное поле, в сохранённом упражнении всегда ровно один из `bpm | rhythm`.
- **Слишком длинный цикл на упражнении с малым числом повторений** → ограничение 32 ударов / 5 с на интервал + подсказка в UI, чистить вручную не нужно.

## Definition of Done
- `pnpm typecheck && pnpm lint && pnpm test && pnpm build` — зелёные.
- Playwright-прогон плеера на реальном приложении: пустой/записанный ритм, смена сета, выключенный metronome в настройках, мьют — ритм/метроном молчат.
- Скриншоты 390 и 1440: редактор (обе вкладки), плеер с пульсом.
- Состояния: без ритма (старый bpm), ритм-заглушка «Прослушать» пока AudioContext suspended, disabled «Готово» при 1 тапе.
