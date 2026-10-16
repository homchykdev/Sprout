import { createFileRoute } from "@tanstack/react-router";
import { AlertCircle, CheckCircle2, Info } from "lucide-react";
import { useState } from "react";
import { BodyMap } from "@/components/game/BodyMap";
import { Badges } from "@/components/game/Badges";
import { Celebrate } from "@/components/game/Celebrate";
import { useCelebrate } from "@/components/game/useCelebrate";
import { MonthlyChallenge } from "@/components/game/MonthlyChallenge";
import { evaluateBadges, monthlyChallenge } from "@/lib/achievements";
import { advice, muscleLoad, streak } from "@/lib/game";
import { useApp } from "@/lib/store";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/progress")({
  head: () => ({
    meta: [
      { title: "Прогресс и карта нагрузки · Пульс" },
      {
        name: "description",
        content: "Тепловая карта нагрузки на мышцы, советы и история тренировок.",
      },
      { property: "og:title", content: "Прогресс и карта нагрузки · Пульс" },
      {
        property: "og:description",
        content: "Тепловая карта нагрузки на мышцы и персональные советы.",
      },
    ],
  }),
  component: Progress,
});

const MOODS = ["😞", "😐", "🙂", "😄", "🤩"] as const;

function Progress() {
  const s = useApp();
  const [days, setDays] = useState(7);
  const { load, cats } = muscleLoad(s.sessions, days);
  const tips = advice(s.sessions);
  const total = cats.strength + cats.cardio + cats.stretch || 1;
  const totalMin = Math.round(s.sessions.reduce((a, x) => a + x.durationSec, 0) / 60);
  const badges = evaluateBadges(s, new Date());
  const challenge = monthlyChallenge(s.sessions, new Date());
  const party = useCelebrate();

  return (
    <div className="space-y-5">
      <Celebrate show={party} />
      <h1 className="pt-2 text-3xl font-extrabold tracking-tight">Прогресс</h1>
      <div className="grid grid-cols-3 gap-3">
        {[
          { v: s.sessions.length, l: "тренировок" },
          { v: streak(s), l: "серия 🔥" },
          { v: totalMin, l: "минут" },
        ].map((x) => (
          <div key={x.l} className="card-soft p-4 text-center">
            <p className="text-2xl font-extrabold tabular">{x.v}</p>
            <p className="text-xs text-muted-foreground">{x.l}</p>
          </div>
        ))}
      </div>

      <section className="card-soft p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-bold">Карта нагрузки</h2>
          <div className="flex rounded-full bg-muted p-1 text-xs font-semibold">
            {[7, 30].map((d) => (
              <button
                key={d}
                onClick={() => setDays(d)}
                className={cn(
                  "rounded-full px-3 py-1 transition-colors",
                  days === d ? "bg-card shadow-sm" : "text-muted-foreground",
                )}
              >
                {d} дн.
              </button>
            ))}
          </div>
        </div>
        <BodyMap load={load} />
        <div className="mt-5 flex h-3 overflow-hidden rounded-full bg-muted">
          <div className="bg-primary" style={{ width: `${(cats.strength / total) * 100}%` }} />
          <div className="bg-flame" style={{ width: `${(cats.cardio / total) * 100}%` }} />
          <div className="bg-sky" style={{ width: `${(cats.stretch / total) * 100}%` }} />
        </div>
        <div className="mt-2 flex justify-between text-xs text-muted-foreground">
          <span>● Сила {Math.round((cats.strength / total) * 100)}%</span>
          <span>● Кардио {Math.round((cats.cardio / total) * 100)}%</span>
          <span>● Растяжка {Math.round((cats.stretch / total) * 100)}%</span>
        </div>
      </section>

      <section className="space-y-2.5">
        <h2 className="text-lg font-bold">Советы</h2>
        {tips.map((t, i) => {
          const Icon = t.tone === "good" ? CheckCircle2 : t.tone === "warn" ? AlertCircle : Info;
          return (
            <div
              key={i}
              className="card-soft animate-rise flex gap-3 p-4"
              style={{ animationDelay: `${i * 0.08}s` }}
            >
              <Icon
                className={cn(
                  "mt-0.5 h-5 w-5 shrink-0",
                  t.tone === "good"
                    ? "text-primary-shade"
                    : t.tone === "warn"
                      ? "text-flame-shade"
                      : "text-sky-shade",
                )}
              />
              <div>
                <p className="font-semibold">{t.title}</p>
                <p className="text-sm text-muted-foreground">{t.text}</p>
              </div>
            </div>
          );
        })}
      </section>

      <MonthlyChallenge challenge={challenge} />

      <Badges states={badges} />

      <section>
        <h2 className="mb-3 text-lg font-bold">История</h2>
        <div className="space-y-2">
          {[...s.sessions]
            .reverse()
            .slice(0, 20)
            .map((x) => (
              <div key={x.id} className="card-soft p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-semibold">{x.workoutName}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(x.date).toLocaleDateString("ru", {
                        weekday: "short",
                        day: "numeric",
                        month: "long",
                      })}{" "}
                      · {Math.round(x.durationSec / 60)} мин
                    </p>
                  </div>
                  <span className="shrink-0 font-bold text-gold-shade">+{x.xp} XP</span>
                </div>
                {x.mood != null && (
                  <p className="mt-1.5 text-lg" aria-label={`Самочувствие: ${x.mood} из 5`}>
                    {MOODS[x.mood - 1]}
                  </p>
                )}
                {x.note && <p className="mt-1 text-sm text-muted-foreground">«{x.note}»</p>}
              </div>
            ))}
          {!s.sessions.length && (
            <p className="py-6 text-center text-muted-foreground">
              Пока пусто — самое время начать!
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
