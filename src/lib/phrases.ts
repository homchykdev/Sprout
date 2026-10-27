/**
 * Duolingo-style phrase engine for workout reminders.
 *
 * The library is embedded in the app (offline, no backend): varied pools per
 * tone level that escalate during the user's workout window
 * (friendly -> light nudge -> passive-aggressive -> streak at risk).
 * Phrase choice is deterministic per (day, slot) so the same day never shows
 * the same message twice, and the daily slot ladder varies its length and
 * exact times, seeded by the day key.
 */

export type Tone = "motive" | "nudge" | "guilt";

export interface ReminderSettings {
  enabled: boolean;
  /** Window start in minutes from midnight. */
  windowStart: number;
  /** Window end in minutes from midnight. */
  windowEnd: number;
  /** Preferred workout time in minutes from midnight (inside the window). */
  preferred: number;
}

/** Absolute cap: no notifications after 22:00. */
export const REMINDER_CAP = 22 * 60;
/** Steps used by the settings selects (06:00 - 22:00). */
export const WINDOW_MIN = 6 * 60;
export const WINDOW_MAX_STEP = 30;

export const DEFAULT_REMINDERS: ReminderSettings = {
  enabled: true,
  windowStart: 15 * 60,
  windowEnd: 21 * 60,
  preferred: 18 * 60,
};

/** v11 -> v12: converts the old single hour into window + preferred time. */
export function migrateReminders(
  legacy: { enabled: boolean; hour: number } | undefined,
): ReminderSettings {
  const hour = legacy?.hour ?? DEFAULT_REMINDERS.preferred / 60;
  const preferred = Math.round(hour * 60);
  return {
    enabled: legacy?.enabled ?? DEFAULT_REMINDERS.enabled,
    windowStart: clampMinute(preferred - 180, WINDOW_MIN, REMINDER_CAP),
    windowEnd: clampMinute(preferred + 180, WINDOW_MIN, REMINDER_CAP),
    preferred: clampMinute(preferred, WINDOW_MIN, REMINDER_CAP),
  };
}

export function clampMinute(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(v)));
}

// ── Phrase pools ────────────────────────────────────────────────────────────

/** Friendly / motivational (early window). */
export const MOTIVE_PHRASES: string[] = [
  "Ты сильнее, чем вчера. Буквально.",
  "Тренировка — лучший способ переспорить собственную лень.",
  "Пара минут дисциплины сейчас — хорошее настроение вечером.",
  "Каждая тренировка — голос за человека, которым ты становишься.",
  "Дисциплина победила настроение. Снова.",
  "Большинство сегодня не встало с дивана. Ты — можешь.",
  "Тело ещё помнит прошлую тренировку. Встреть его.",
  "Ещё один кирпич в фундамент новой версии тебя.",
  "Начни — дальше тело само подхватит.",
  "Мышцы запомнят этот день. Хорошим.",
];

/** Light push (middle of the window). */
export const NUDGE_PHRASES: string[] = [
  "Эти упражнения сами себя не сделают 💪",
  "Огонёк ждёт своего часа 🔥",
  "5 минут разминки уже считаются. Начни с них.",
  "Через час ты будешь гордиться собой или жалеть. Выбор один.",
  "План уже составлен. Осталось нажать «Начать».",
  "Серия любит тех, кто приходит, а не тех, кто собирается.",
  "Отличный момент: ещё не темно, не голодно, не занят. Совпадение?",
  "Между «потом» и «сегодня» разница ровно одна тренировка.",
  "Сделай разминку — дальше тело само подхватит.",
  "Тренировка короче, чем лента новостей. Проверено.",
];

/** Passive-aggressive turn (late in the window / near the end). */
export const GUILT_PHRASES: string[] = [
  "Я не злюсь. Я просто разочарован. Тренировка?",
  "Огонёк гаснет 😢 Твоя тренировка ждёт.",
  "Диван уже выиграл день? Есть шанс отыграться.",
  "Я подожду. Но вместе со мной ждать будет усталость.",
  "Твоя будущая форма звонила. Ты не взял.",
  "Часы идут. И не в твою пользу.",
  "Кое-кто сегодня встал с дивана победителем. Это не ты.",
  "Это последнее напоминание сегодня. Дальше — только последствия.",
  "Пропуск нынче дорог: таким можно сломать то, что строилось неделями.",
  "Дышать воздухом, конечно, полезно. Но сегодня я рассчитывал на большее.",
];

/** Streak at risk - the "last call" (interpolates current streak). */
export const STREAK_PHRASES: string[] = [
  "Серия {n} под угрозой! 🔥 Сохрани её сегодня.",
  "{n} дней подряд — и всё это может сгореть сегодня.",
  "{n} 🔥 — неужели сегодня день, когда это закончится?",
  "Цена пропуска высока: серия {n} на кону.",
  "Твои {n} дней смотрят на тебя с лёгким упрёком.",
  "Серия {n} гаснет этой ночью. Тренировка решит всё.",
];

/** Streak saved after the workout was completed on the same day. */
export const CELEBRATE_PHRASES: string[] = [
  "Серия спасена! 🔥 Ты — машина.",
  "Успел, спас, потренировался. Герой дня!",
  "Ещё один день в копилку серии. Отличная работа!",
  "Вот это камбэк! Серия растёт, а не гаснет 💪",
  "День закрыт тренировкой. Так держать!",
  "Серия жива, огонь горит 🔥 Горжусь тобой!",
];

export const GREETINGS: { h: number; text: string }[] = [
  { h: 6, text: "Доброе утро" },
  { h: 12, text: "Добрый день" },
  { h: 17, text: "Добрый вечер" },
  { h: 21, text: "Ночь коротка" },
];

export function timeGreeting(hour: number): string {
  let g = GREETINGS[0]!.text;
  for (const it of GREETINGS) if (hour >= it.h) g = it.text;
  return g;
}

/** Fills {n} placeholders (streak length). */
export function fillPhrase(text: string, vars: Record<string, string | number>): string {
  return Object.entries(vars).reduce((acc, [k, v]) => acc.replaceAll(`{${k}}`, String(v)), text);
}

// ── Deterministic selection ─────────────────────────────────────────────────

/** Cheap 32-bit string hash (FNV-ish) for seeded pseudo-randomness. */
function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Stable pseudo-random integer for a (space, day, salt) triple. */
export function seeded(spice: string, day: string, salt: number): number {
  return hash(`${spice}|${day}|${salt}`);
}

/**
 * Picks a pool entry deterministically; `avoid` (previous text) is skipped
 * once so consecutive reminders never repeat the same message.
 */
export function pickPhrase(pool: string[], day: string, slot: number, avoid?: string): string {
  if (!pool.length) return "";
  let idx = seeded("phrase", day, slot) % pool.length;
  if (pool.length > 1 && avoid && pool[idx] === avoid)
    idx = (idx + 1 + (seeded("shift", day, slot) % (pool.length - 1))) % pool.length;
  return pool[idx]!;
}

// ── Daily slot ladder ───────────────────────────────────────────────────────

export type DayKind = "workout" | "rest";

/**
 * Builds today's reminder times (minutes) for a given day key.
 * - workout days: preferred time + a seeded number (1-3) of extra slots in
 *   the window + a fixed "passive-aggressive" slot at windowEnd-60 + a
 *   "last call" 30 min past the window end (respecting the 22:00 cap).
 * - rest days: a single friendly ping at the preferred time - no nagging.
 * Deterministic per day, times are sorted and unique.
 */
export function buildSlots(r: ReminderSettings, day: string, kind: DayKind): number[] {
  const preferred = clampMinute(
    r.preferred,
    Math.max(WINDOW_MIN, r.windowStart),
    Math.min(r.windowEnd, REMINDER_CAP),
  );
  if (kind === "rest") return [preferred <= REMINDER_CAP ? preferred : REMINDER_CAP];

  const slots = new Set<number>([preferred]);
  const latest = Math.min(r.windowEnd - 60, REMINDER_CAP);
  // A possible range for the extra slots: after preferred, before the guilt anchor.
  const from = preferred + 45;
  const range = Math.max(0, latest - from);
  if (range >= 30) {
    // 1-3 extra slots seeded per day, spaced at least 45 minutes apart.
    const count = 1 + (seeded("count", day, 0) % 3);
    let t = from + (seeded("t", day, 1) % Math.max(1, Math.min(range, 60)));
    for (let i = 0; i < count && t <= latest; i++) {
      slots.add(Math.round(t / WINDOW_MAX_STEP) * WINDOW_MAX_STEP);
      t += Math.max(45, seeded("gap", day, i + 2) % 90);
    }
  }
  if (latest > preferred) slots.add(latest);
  // Last call: 30 min past the window end, only if within the absolute cap.
  const lastCall = clampMinute(r.windowEnd + 30, WINDOW_MIN, REMINDER_CAP);
  if (lastCall > latest && lastCall > preferred) slots.add(lastCall);
  return [...slots].sort((a, b) => a - b);
}

export interface SlotPhrases {
  title: string;
  body: string;
}

/**
 * Chooses the notification text for slot `i` of today's ladder.
 * Escalates tone by position: early = motive, middle = nudge, late = guilt;
 * the final slot is the streak-risk "last call" when the streak is alive.
 */
export function phraseFor(
  slots: number[],
  i: number,
  opts: { kind: DayKind; streak: number; hour: number },
): SlotPhrases {
  const { kind, streak, hour } = opts;
  const last = slots.length - 1;
  const progress = slots.length > 1 ? i / last : 1;
  const lastCall = kind === "workout" && i === last && last > 0;
  if (lastCall && streak > 0) {
    return {
      title: `Серия ${streak} под угрозой! 🔥`,
      body: fillPhrase(pickPhrase(STREAK_PHRASES, "streak", (i + 7) % 32, undefined), {
        n: streak,
      }),
    };
  }
  const pool =
    kind === "rest" || progress <= 1 / 3
      ? MOTIVE_PHRASES
      : progress <= 2 / 3
        ? NUDGE_PHRASES
        : GUILT_PHRASES;
  return {
    title: `Пульс 💪 ${timeGreeting(hour).toLowerCase()}`,
    body: pickPhrase(pool, "nag", i, undefined),
  };
}
