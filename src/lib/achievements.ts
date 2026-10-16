import { addDays, dayKey, muscleLoad, onVacation } from "./game";
import type { MuscleKey, SessionLog, Vacation } from "./types";

export interface AchState {
  sessions: SessionLog[];
  vacations: Vacation[];
}

/** Consecutive calendar days with ≥1 session. Vacation days freeze (skip, don't break). */
export function dayStreak(sessions: SessionLog[], vacations: Vacation[], now = new Date()): number {
  const days = new Set(sessions.map((s) => dayKey(new Date(s.date))));
  let cursor = new Date(now);
  // Streak counts through yesterday if today is not trained (yet) and not vacation.
  if (!days.has(dayKey(cursor)) && !onVacation(cursor, vacations)) cursor = addDays(cursor, -1);
  let n = 0;
  for (let i = 0; i < 3660; i++) {
    if (onVacation(cursor, vacations)) {
      cursor = addDays(cursor, -1);
      continue;
    }
    if (!days.has(dayKey(cursor))) break;
    n++;
    cursor = addDays(cursor, -1);
  }
  return n;
}

const hourOf = (s: SessionLog) => new Date(s.date).getHours();

const LEGS = ["quadriceps", "gluteal", "hamstring", "calves", "adductor", "abductors"];
const legVolume = (s: SessionLog) =>
  s.sets.filter((t) => t.muscles.some((m) => LEGS.includes(m))).reduce((a, t) => a + t.count, 0);
const coreVolume = (sessions: SessionLog[]) =>
  sessions
    .flatMap((s) => s.sets)
    .filter((t) => t.muscles.some((m) => m === "abs" || m === "obliques"))
    .reduce((a, t) => a + t.count, 0);

const MAJOR = [
  "chest",
  "upper-back",
  "front-deltoids",
  "back-deltoids",
  "quadriceps",
  "gluteal",
  "hamstring",
  "abs",
];

export interface BadgeDef {
  id: string;
  group: "Серии" | "Время и дисциплина" | "Баланс и сила" | "Вехи";
  icon: string;
  title: string;
  desc: string;
  total: number;
  done: (st: AchState, now: Date) => number;
}

export const BADGES: BadgeDef[] = [
  {
    id: "spark3",
    group: "Серии",
    icon: "✨",
    title: "Первая искра",
    desc: "3 дня подряд",
    total: 3,
    done: (st, n) => Math.min(dayStreak(st.sessions, st.vacations, n), 3),
  },
  {
    id: "fire7",
    group: "Серии",
    icon: "🔥",
    title: "В огне",
    desc: "7 дней подряд",
    total: 7,
    done: (st, n) => Math.min(dayStreak(st.sessions, st.vacations, n), 7),
  },
  {
    id: "unbeaten14",
    group: "Серии",
    icon: "🛡️",
    title: "Непобедимый",
    desc: "14 дней подряд",
    total: 14,
    done: (st, n) => Math.min(dayStreak(st.sessions, st.vacations, n), 14),
  },
  {
    id: "titan30",
    group: "Серии",
    icon: "🌋",
    title: "Огненный титан",
    desc: "30 дней подряд",
    total: 30,
    done: (st, n) => Math.min(dayStreak(st.sessions, st.vacations, n), 30),
  },
  {
    id: "lark",
    group: "Время и дисциплина",
    icon: "🌅",
    title: "Жаворонок",
    desc: "Тренировка до 9:00",
    total: 1,
    done: (st) => (st.sessions.some((s) => hourOf(s) < 9) ? 1 : 0),
  },
  {
    id: "night",
    group: "Время и дисциплина",
    icon: "🌙",
    title: "Ночной волк",
    desc: "Тренировка после 21:00",
    total: 1,
    done: (st) => (st.sessions.some((s) => hourOf(s) >= 21) ? 1 : 0),
  },
  {
    id: "sprint",
    group: "Время и дисциплина",
    icon: "⚡",
    title: "Спринт",
    desc: "Короткая и мощная: ≤20 мин",
    total: 1,
    done: (st) => (st.sessions.some((s) => s.durationSec <= 20 * 60 && s.xp >= 30) ? 1 : 0),
  },
  {
    id: "core",
    group: "Баланс и сила",
    icon: "🧱",
    title: "Стальной кор",
    desc: "50 подходов на пресс и косые",
    total: 50,
    done: (st) => Math.min(coreVolume(st.sessions), 50),
  },
  {
    id: "legs",
    group: "Баланс и сила",
    icon: "🦵",
    title: "День ног",
    desc: "10+ подходов на ноги за тренировку",
    total: 10,
    done: (st) => Math.min(Math.max(0, ...st.sessions.map(legVolume)), 10),
  },
  {
    id: "atlas",
    group: "Баланс и сила",
    icon: "🌍",
    title: "Атлант",
    desc: "Все 8 групп мышц за 7 дней",
    total: 8,
    done: (st, n) =>
      MAJOR.filter((m) => (muscleLoad(st.sessions, 7, n).load[m as MuscleKey] ?? 0) >= 2).length,
  },
  {
    id: "m1",
    group: "Вехи",
    icon: "🌱",
    title: "Первый шаг",
    desc: "1 тренировка",
    total: 1,
    done: (st) => Math.min(st.sessions.length, 1),
  },
  {
    id: "m5",
    group: "Вехи",
    icon: "⭐",
    title: "5 тренировок",
    desc: "5 тренировок",
    total: 5,
    done: (st) => Math.min(st.sessions.length, 5),
  },
  {
    id: "m10",
    group: "Вехи",
    icon: "🏅",
    title: "10 тренировок",
    desc: "10 тренировок",
    total: 10,
    done: (st) => Math.min(st.sessions.length, 10),
  },
  {
    id: "m25",
    group: "Вехи",
    icon: "🏆",
    title: "25 тренировок",
    desc: "25 тренировок",
    total: 25,
    done: (st) => Math.min(st.sessions.length, 25),
  },
  {
    id: "m50",
    group: "Вехи",
    icon: "💎",
    title: "50 тренировок",
    desc: "50 тренировок",
    total: 50,
    done: (st) => Math.min(st.sessions.length, 50),
  },
  {
    id: "m100",
    group: "Вехи",
    icon: "👑",
    title: "Легенда",
    desc: "100 тренировок",
    total: 100,
    done: (st) => Math.min(st.sessions.length, 100),
  },
];

export interface BadgeState {
  def: BadgeDef;
  done: number;
  unlocked: boolean;
  pct: number;
}

export function evaluateBadges(st: AchState, now = new Date()): BadgeState[] {
  return BADGES.map((def) => {
    const done = def.done(st, now);
    const unlocked = done >= def.total;
    return { def, done, unlocked, pct: Math.min(1, done / def.total) };
  });
}

/** Ids unlocked now but not in `seen` — celebrate each once. */
export function freshBadges(st: AchState, seen: string[], now = new Date()): string[] {
  return evaluateBadges(st, now)
    .filter((b) => b.unlocked && !seen.includes(b.def.id))
    .map((b) => b.def.id);
}

// ---- Monthly challenge ----

export const MONTH_GOAL = 12;
const MONTH_NAMES = [
  "Морозный январь",
  "Вьюжный февраль",
  "Мартовское пробуждение",
  "Апрельский рывок",
  "Майский марафон",
  "Июньский спринт",
  "Июльская жара",
  "Августовский огонь",
  "Огненный сентябрь",
  "Огненный октябрь",
  "Ноябрьский вызов",
  "Декабрьский финиш",
];

export interface Challenge {
  key: string;
  name: string;
  done: number;
  goal: number;
  pct: number;
  claimed: boolean;
}

export function monthlyChallenge(sessions: SessionLog[], now = new Date()): Challenge {
  const key = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const done = sessions.filter((s) => {
    const d = new Date(s.date);
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
  }).length;
  return {
    key,
    name: MONTH_NAMES[now.getMonth()] ?? "Вызов месяца",
    done,
    goal: MONTH_GOAL,
    pct: Math.min(1, done / MONTH_GOAL),
    claimed: done >= MONTH_GOAL,
  };
}

// ---- Daily quests ----

export const XP_QUEST_GOAL = 50;
export const FOCUS_QUEST_GOAL = 5;

export interface Quest {
  id: "workout" | "xp" | "focus";
  title: string;
  desc: string;
  done: boolean;
  progress: number;
  total: number;
}

export function dailyQuests(sessions: SessionLog[], now = new Date()): Quest[] {
  const today = sessions.filter((s) => dayKey(new Date(s.date)) === dayKey(now));
  const xp = today.reduce((a, s) => a + s.xp, 0);
  const stretch = today
    .flatMap((s) => s.sets)
    .filter((t) => t.category === "stretch")
    .reduce((a, t) => a + t.count, 0);
  return [
    {
      id: "workout",
      title: "Тренировка дня",
      desc: "Выполни запланированную или бонусную",
      done: today.length > 0,
      progress: Math.min(today.length, 1),
      total: 1,
    },
    {
      id: "xp",
      title: "Охотник за опытом",
      desc: `Набери ${XP_QUEST_GOAL}+ XP за день`,
      done: xp >= XP_QUEST_GOAL,
      progress: Math.min(xp, XP_QUEST_GOAL),
      total: XP_QUEST_GOAL,
    },
    {
      id: "focus",
      title: "Фокус на теле",
      desc: `Растяжка: ${FOCUS_QUEST_GOAL}+ подходов за день`,
      done: stretch >= FOCUS_QUEST_GOAL,
      progress: Math.min(stretch, FOCUS_QUEST_GOAL),
      total: FOCUS_QUEST_GOAL,
    },
  ];
}

export const QUEST_PRAISE = [
  "Огонёк гордится! Так держать!",
  "Квест закрыт! Ты в ударе!",
  "Вот это темп! Огонёк светит ярче!",
];
