import type { AppState } from "./store";
import { MUSCLES, type MuscleKey, type SessionLog, type Vacation, type Workout } from "./types";

export const dayKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
export const weekday = (d: Date) => (d.getDay() + 6) % 7; // 0 = Monday
export const addDays = (d: Date, n: number) => {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
};
export const WEEKDAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

export const onVacation = (d: Date, vacations: Vacation[]) => {
  const k = dayKey(d);
  return vacations.some((v) => k >= v.start && k <= v.end);
};
export const activeVacation = (vacations: Vacation[], now = new Date()) => {
  const k = dayKey(now);
  return vacations.find((v) => k >= v.start && k <= v.end);
};

export function level(xp: number) {
  const lvl = Math.floor(Math.sqrt(xp / 60)) + 1;
  const cur = 60 * (lvl - 1) ** 2, next = 60 * lvl ** 2;
  return { lvl, into: xp - cur, need: next - cur, pct: (xp - cur) / (next - cur) };
}

export function muscleLoad(sessions: SessionLog[], days = 7, now = new Date()) {
  const from = addDays(now, -days).getTime();
  const load = Object.fromEntries(Object.keys(MUSCLES).map((k) => [k, 0])) as Record<MuscleKey, number>;
  const cats = { strength: 0, cardio: 0, stretch: 0 };
  for (const s of sessions) {
    if (new Date(s.date).getTime() < from) continue;
    for (const set of s.sets) {
      cats[set.category] += set.count;
      set.muscles.forEach((m, i) => (load[m] += set.count * (i === 0 ? 1 : 0.6)));
    }
  }
  return { load, cats };
}

export const heatLevel = (v: number) => (v <= 0 ? 0 : v < 4 ? 1 : v < 9 ? 2 : v < 16 ? 3 : 4);

export function advice(sessions: SessionLog[]) {
  const { load, cats } = muscleLoad(sessions);
  const tips: { tone: "good" | "warn" | "info"; title: string; text: string }[] = [];
  const total = cats.strength + cats.cardio + cats.stretch;
  if (total === 0) {
    tips.push({ tone: "info", title: "Начни неделю", text: "Проведи первую тренировку — и карта нагрузки оживёт." });
    return tips;
  }
  const major: MuscleKey[] = ["chest", "upper-back", "front-deltoids", "back-deltoids", "quadriceps", "gluteal", "hamstring", "abs"];
  const weak = major.filter((m) => load[m] < 2);
  if (weak.length)
    tips.push({ tone: "warn", title: "Недогружено", text: `За неделю почти не работали: ${weak.map((m) => MUSCLES[m].toLowerCase()).join(", ")}. Добавь их в ближайшую тренировку.` });
  const over = (Object.keys(load) as MuscleKey[]).filter((m) => load[m] > 22);
  if (over.length)
    tips.push({ tone: "warn", title: "Дай отдохнуть", text: `${over.map((m) => MUSCLES[m]).join(", ")} — высокая нагрузка. Сделай им день восстановления.` });
  if (cats.stretch / total < 0.12)
    tips.push({ tone: "info", title: "Больше растяжки", text: "Растяжка меньше 12% объёма. Добавь 5 минут в конце тренировки — это ускорит восстановление." });
  if (cats.cardio === 0)
    tips.push({ tone: "info", title: "Добавь кардио", text: "На этой неделе не было кардио. Даже 10 минут улучшат выносливость и сердце." });
  const push = load.chest + load["front-deltoids"] + load.triceps, pull = load["upper-back"] + load.trapezius + load.biceps + load["back-deltoids"];
  if (push > pull * 1.6 && push > 6)
    tips.push({ tone: "warn", title: "Баланс тяги и жима", text: "Жимовых упражнений заметно больше, чем тяговых. Добавь тяги — это бережёт осанку и плечи." });
  const legs = load.quadriceps + load.gluteal + load.hamstring + load.calves;
  if (push + pull > legs * 2 && push + pull > 8)
    tips.push({ tone: "warn", title: "Не пропускай ноги", text: "Верх тела работает вдвое больше ног. Добавь приседания или выпады." });
  if (!tips.length) tips.push({ tone: "good", title: "Отличный баланс", text: "Нагрузка распределена ровно. Так держать!" });
  return tips;
}

export const MOTIVATION = [
  "Ты сильнее, чем вчера. Буквально.",
  "Каждая тренировка — это голос за человека, которым ты становишься.",
  "Дисциплина победила настроение. Снова.",
  "Мышцы запомнят этот день.",
  "Ещё один кирпич в фундамент новой версии тебя.",
  "Большинство сегодня не встало с дивана. Ты — встал.",
];

export const NAGS = [
  "Огонёк гаснет 😢 Твоя тренировка ждёт.",
  "Эти упражнения сами себя не сделают 💪",
  "Серия под угрозой! 🔥 Всего несколько минут.",
  "Я не злюсь. Я просто разочарован. Тренировка?",
  "Последнее предупреждение: огонь гаснет 🔥",
];
