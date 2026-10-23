import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Camera, Check, ChevronRight, Palmtree, Play } from "lucide-react";
import { usePhotoDue } from "@/hooks/usePhotoReminder";
import { reminderMessage } from "@/lib/photo-reminders";
import { Mascot, type Mood } from "@/components/game/Mascot";
import { TapButton } from "@/components/game/TapButton";
import { Celebrate } from "@/components/game/Celebrate";
import { useCelebrate } from "@/components/game/useCelebrate";
import { DailyQuests } from "@/components/game/DailyQuests";
import { MonthlyChallenge } from "@/components/game/MonthlyChallenge";
import { dailyQuests, monthlyChallenge } from "@/lib/achievements";
import { activeVacation, level, WEEKDAYS, weekday, addDays, dayKey } from "@/lib/game";
import { dayInfo, forecast, nextWorkout, planProgress, type PlanStatus } from "@/lib/plan";
import { useApp } from "@/lib/store";
import { estimateMinutes } from "@/lib/workout-utils";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Сегодня · Пульс" },
      { name: "description", content: "Твоя тренировка на сегодня, серия и прогресс недели." },
      { property: "og:title", content: "Сегодня · Пульс" },
      {
        property: "og:description",
        content: "Твоя тренировка на сегодня, серия и прогресс недели.",
      },
    ],
  }),
  component: Today,
});

const WEEK_STRIP: Record<PlanStatus, string> = {
  done: "bg-flame text-primary-foreground",
  pending: "border-2 border-dashed border-flame/60 text-flame-shade",
  protected: "bg-primary-soft text-primary-shade",
  missed: "bg-muted text-muted-foreground",
  rest: "bg-muted text-muted-foreground",
  off: "bg-muted text-muted-foreground",
  vacation: "bg-sky-soft text-sky-shade",
  future: "border-2 border-dashed border-primary/40 text-primary-shade",
};

function Today() {
  const s = useApp();
  const nav = useNavigate();
  const now = new Date();
  const prog = planProgress(s, now);
  const vac = activeVacation(s.vacations, now);
  const today = dayInfo(s, now, now);
  const nx = nextWorkout(s, now);
  const lv = level(s.xp);
  const hoursLeft = 24 - now.getHours();
  const unprotected = prog.bonusLeft <= 0 && prog.freezeLeft <= 0;

  let mood: Mood = "happy";
  let line = "Готов стать сильнее?";
  if (vac) {
    mood = "sleep";
    line = `Отпуск до ${new Date(vac.end).toLocaleDateString("ru", { day: "numeric", month: "long" })}. Отдыхай — серия заморожена.`;
  } else if (today.status === "done") {
    mood = "cheer";
    line = "Сегодня ты уже победил. Горжусь!";
  } else if (today.status === "pending" && prog.streak === 0) {
    mood = "sad";
    line = "Серия была сломана… Новый день — новый шанс. Начни сегодня.";
  } else if (today.status === "missed" && !unprotected) {
    mood = "sad";
    line = "Вчера потеряли день, но серия цела. Сегодня точно тренируемся?";
  } else if (today.status === "pending") {
    mood = "fire";
    line = `Сегодня день тренировки! Осталось ~${hoursLeft} ч.`;
  } else {
    mood = "cheer";
    line = "Сегодня день отдыха. Но бонусная тренировка даст +50% XP!";
  }

  const week = forecast(s, 7, now);
  const doneWeek = week.filter((x) => x.status === "done").length;
  const planWeek = week.filter((x) => x.step?.kind === "workout").length;
  const quests = dailyQuests(s.sessions, now);
  const challenge = monthlyChallenge(s.sessions, now);
  const party = useCelebrate();
  const photo = usePhotoDue();
  const w = nx?.workout;

  return (
    <div className="space-y-5">
      <Celebrate show={party} />
      <section className="flex items-end gap-3 pt-2">
        <Mascot mood={mood} size={96} power={Math.min(1, prog.streak / 30)} />
        <div className="animate-pop relative mb-6 flex-1 rounded-3xl border-2 bg-card px-4 py-3 text-[15px] font-medium leading-snug">
          {s.name ? <span className="font-bold">{s.name}, </span> : null}
          {line}
          <span className="absolute -left-2 bottom-4 h-4 w-4 rotate-45 border-b-2 border-l-2 bg-card" />
        </div>
      </section>

      {vac ? (
        <div className="card-soft flex items-center gap-4 p-5">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-sky-soft text-sky-shade">
            <Palmtree />
          </span>
          <div className="flex-1">
            <p className="font-bold">Режим отпуска</p>
            <p className="text-sm text-muted-foreground">Напоминания выключены, серия не сгорит.</p>
          </div>
          <Link to="/profile" className="text-sm font-semibold text-sky-shade">
            Изменить
          </Link>
        </div>
      ) : null}

      {photo.due && (
        <Link
          to="/capture"
          className="press card-soft flex items-center gap-3 p-4 transition-colors hover:bg-muted/50"
        >
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary-soft text-primary-shade">
            <Camera className="h-5 w-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-bold">Пора обновить фото прогресса</span>
            <span className="block text-sm text-muted-foreground">
              {reminderMessage(photo.lastDate)}
            </span>
          </span>
          <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
        </Link>
      )}

      {w ? (
        <section
          className={cn(
            "card-soft overflow-hidden",
            today.status === "pending" && unprotected && "ring-2 ring-flame",
          )}
        >
          <div className="p-5">
            <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              {today.status === "done"
                ? "Следующая тренировка"
                : today.status === "pending"
                  ? "Тренировка на сегодня"
                  : "Бонусная тренировка"}
            </p>
            <div className="mt-2 flex items-center gap-4">
              <span className="flex h-16 w-16 items-center justify-center rounded-3xl bg-primary-soft text-3xl">
                {w.emoji}
              </span>
              <div className="flex-1">
                <h1 className="text-2xl font-extrabold tracking-tight">{w.name}</h1>
                <p className="text-sm text-muted-foreground">
                  {w.items.length} упражнений · ~{estimateMinutes(w, s.exercises)} мин
                </p>
              </div>
            </div>
            <TapButton
              variant={today.status === "pending" && unprotected ? "flame" : "primary"}
              size="lg"
              className={cn("mt-5 w-full", today.status === "pending" && "animate-pulse-ring")}
              onClick={() => nav({ to: "/play/$workoutId", params: { workoutId: w.id } })}
            >
              <Play className="h-5 w-5 fill-current" /> Начать
            </TapButton>
          </div>
        </section>
      ) : (
        <div className="card-soft p-5 text-center">
          <p className="font-semibold">Нет тренировок</p>
          <Link to="/plans" className="text-sm font-semibold text-primary-shade">
            Создать тренировку
          </Link>
        </div>
      )}

      <section className="card-soft p-5">
        <div className="flex items-baseline justify-between">
          <h2 className="font-bold">Эта неделя</h2>
          <span className="text-sm font-semibold text-muted-foreground tabular">
            {doneWeek} / {Math.max(planWeek, doneWeek)}
          </span>
        </div>
        <div className="mt-4 grid grid-cols-7 gap-1.5">
          {week.map((info, i) => {
            const d = info.date;
            const todayFlag = i === weekday(now) && dayKey(d) === dayKey(now);
            return (
              <div key={d.getTime()} className="flex flex-col items-center gap-1.5">
                <span
                  className={cn(
                    "text-[11px] font-semibold",
                    todayFlag ? "text-foreground" : "text-muted-foreground",
                  )}
                >
                  {WEEKDAYS[i]}
                </span>
                <span
                  title={
                    info.step?.kind === "workout"
                      ? (s.workouts.find((x) => x.id === info.step?.workoutId)?.name ?? "")
                      : "День отдыха"
                  }
                  className={cn(
                    "flex h-10 w-10 items-center justify-center rounded-full text-sm font-bold transition-all",
                    WEEK_STRIP[info.status],
                    todayFlag && "ring-2 ring-foreground ring-offset-2 ring-offset-card",
                  )}
                >
                  {info.status === "done" ? (
                    <Check className="h-5 w-5" strokeWidth={3} />
                  ) : info.status === "vacation" ? (
                    <Palmtree className="h-4 w-4" />
                  ) : (
                    (d.getDate() ?? "")
                  )}
                </span>
              </div>
            );
          })}
        </div>
        <p className="mt-4 text-xs text-muted-foreground">
          Пропущенный день тратит доп-выходной, затем — заморозки серии. Остаток видно во вкладке
          «План».
        </p>
      </section>

      <section className="card-soft p-5">
        <div className="flex items-center justify-between">
          <h2 className="font-bold">Уровень {lv.lvl}</h2>
          <span className="text-sm font-semibold text-muted-foreground tabular">
            {lv.into} / {lv.need} XP
          </span>
        </div>
        <div className="mt-3 h-4 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-gold transition-[width] duration-1000"
            style={{ width: `${Math.max(4, lv.pct * 100)}%` }}
          />
        </div>
      </section>

      <DailyQuests quests={quests} />
      <MonthlyChallenge challenge={challenge} compact />

      <Link to="/progress" className="card-soft press flex items-center gap-4 p-5">
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-soft text-2xl">
          🗺️
        </span>
        <div className="flex-1">
          <p className="font-bold">Карта нагрузки</p>
          <p className="text-sm text-muted-foreground">Что догрузить и где нужен отдых</p>
        </div>
        <ChevronRight className="text-muted-foreground" />
      </Link>
    </div>
  );
}
