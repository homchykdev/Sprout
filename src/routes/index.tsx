import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Check, ChevronRight, Palmtree, Play } from "lucide-react";
import { Mascot, type Mood } from "@/components/game/Mascot";
import { TapButton } from "@/components/game/TapButton";
import { activeVacation, addDays, dayKey, level, nextWorkout, startOfWeek, streak, weekday, WEEKDAYS, weekStatus } from "@/lib/game";
import { useApp } from "@/lib/store";
import { estimateMinutes } from "@/lib/workout-utils";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Сегодня · Пульс" },
      { name: "description", content: "Твоя тренировка на сегодня, серия и прогресс недели." },
      { property: "og:title", content: "Сегодня · Пульс" },
      { property: "og:description", content: "Твоя тренировка на сегодня, серия и прогресс недели." },
    ],
  }),
  component: Today,
});

function Today() {
  const s = useApp();
  const nav = useNavigate();
  const now = new Date();
  const st = weekStatus(s, now);
  const vac = activeVacation(s.vacations, now);
  const w = nextWorkout(s);
  const lv = level(s.xp);
  const hoursLeft = 24 - now.getHours();

  let mood: Mood = "happy";
  let line = "Готов стать сильнее?";
  if (vac) { mood = "sleep"; line = `Отпуск до ${new Date(vac.end).toLocaleDateString("ru", { day: "numeric", month: "long" })}. Отдыхай — серия заморожена.`; }
  else if (st.doneToday) { mood = "cheer"; line = "Сегодня ты уже победил. Горжусь!"; }
  else if (st.atRisk) { mood = "sad"; line = `Серия под угрозой! Осталось ${st.left} трен. и ${st.remainingDays} дн. на неделе.`; }
  else if (st.dueToday && st.carried) { mood = "sad"; line = "Ты пропустил тренировку. Я перенёс её на сегодня — не подведи 🥺"; }
  else if (st.dueToday) { mood = "fire"; line = `Сегодня день тренировки! Осталось ~${hoursLeft} ч.`; }
  else if (st.left === 0) { mood = "cheer"; line = "План недели выполнен! Можно отдохнуть или сделать бонус."; }
  else line = "Сегодня день отдыха. Но бонусная тренировка даст +50% XP!";

  const ws = startOfWeek(now);
  const doneDays = new Set(st.weekSessions.map((x) => dayKey(new Date(x.date))));

  return (
    <div className="space-y-5">
      <section className="flex items-end gap-3 pt-2">
        <Mascot mood={mood} size={96} power={Math.min(1, streak(s) / 30)} />
        <div className="animate-pop relative mb-6 flex-1 rounded-3xl border-2 bg-card px-4 py-3 text-[15px] font-medium leading-snug">
          {s.name ? <span className="font-bold">{s.name}, </span> : null}
          {line}
          <span className="absolute -left-2 bottom-4 h-4 w-4 rotate-45 border-b-2 border-l-2 bg-card" />
        </div>
      </section>

      {vac ? (
        <div className="card-soft flex items-center gap-4 p-5">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-sky-soft text-sky-shade"><Palmtree /></span>
          <div className="flex-1">
            <p className="font-bold">Режим отпуска</p>
            <p className="text-sm text-muted-foreground">Напоминания выключены, серия не сгорит.</p>
          </div>
          <Link to="/settings" className="text-sm font-semibold text-sky-shade">Изменить</Link>
        </div>
      ) : null}

      {w ? (
        <section className={cn("card-soft overflow-hidden", st.atRisk && !st.doneToday && "ring-2 ring-flame")}>
          <div className="p-5">
            <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              {st.doneToday ? "Следующая тренировка" : st.dueToday ? "Тренировка на сегодня" : "Бонусная тренировка"}
            </p>
            <div className="mt-2 flex items-center gap-4">
              <span className="flex h-16 w-16 items-center justify-center rounded-3xl bg-primary-soft text-3xl">{w.emoji}</span>
              <div className="flex-1">
                <h1 className="text-2xl font-extrabold tracking-tight">{w.name}</h1>
                <p className="text-sm text-muted-foreground">{w.items.length} упражнений · ~{estimateMinutes(w, s.exercises)} мин</p>
              </div>
            </div>
            <TapButton
              variant={st.atRisk || st.carried ? "flame" : "primary"}
              size="lg"
              className={cn("mt-5 w-full", st.dueToday && "animate-pulse-ring")}
              onClick={() => nav({ to: "/play/$workoutId", params: { workoutId: w.id } })}
            >
              <Play className="h-5 w-5 fill-current" /> Начать
            </TapButton>
          </div>
        </section>
      ) : (
        <div className="card-soft p-5 text-center">
          <p className="font-semibold">Нет тренировок</p>
          <Link to="/plans" className="text-sm font-semibold text-primary-shade">Создать тренировку</Link>
        </div>
      )}

      <section className="card-soft p-5">
        <div className="flex items-baseline justify-between">
          <h2 className="font-bold">Эта неделя</h2>
          <span className="text-sm font-semibold text-muted-foreground tabular">{st.done} / {Math.max(st.target, st.done)}</span>
        </div>
        <div className="mt-4 grid grid-cols-7 gap-1.5">
          {WEEKDAYS.map((d, i) => {
            const date = addDays(ws, i);
            const done = doneDays.has(dayKey(date));
            const planned = s.schedule.days.includes(i);
            const today = i === weekday(now);
            return (
              <div key={d} className="flex flex-col items-center gap-1.5">
                <span className={cn("text-[11px] font-semibold", today ? "text-foreground" : "text-muted-foreground")}>{d}</span>
                <span
                  className={cn(
                    "flex h-10 w-10 items-center justify-center rounded-full text-sm font-bold transition-all",
                    done ? "bg-flame text-primary-foreground" : planned ? "border-2 border-dashed border-flame/60 text-flame-shade" : "bg-muted text-muted-foreground",
                    today && !done && "ring-2 ring-foreground ring-offset-2 ring-offset-card",
                  )}
                >
                  {done ? <Check className="h-5 w-5" strokeWidth={3} /> : date.getDate()}
                </span>
              </div>
            );
          })}
        </div>
        <p className="mt-4 text-xs text-muted-foreground">Пропустил день — тренировка сама перенесётся на следующий день этой недели.</p>
      </section>

      <section className="card-soft p-5">
        <div className="flex items-center justify-between">
          <h2 className="font-bold">Уровень {lv.lvl}</h2>
          <span className="text-sm font-semibold text-muted-foreground tabular">{lv.into} / {lv.need} XP</span>
        </div>
        <div className="mt-3 h-4 overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full bg-gold transition-[width] duration-1000" style={{ width: `${Math.max(4, lv.pct * 100)}%` }} />
        </div>
      </section>

      <Link to="/progress" className="card-soft press flex items-center gap-4 p-5">
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-soft text-2xl">🗺️</span>
        <div className="flex-1">
          <p className="font-bold">Карта нагрузки</p>
          <p className="text-sm text-muted-foreground">Что догрузить и где нужен отдых</p>
        </div>
        <ChevronRight className="text-muted-foreground" />
      </Link>
    </div>
  );
}
