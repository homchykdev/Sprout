import { createFileRoute } from "@tanstack/react-router";
import { Badges } from "@/components/game/Badges";
import { evaluateBadges } from "@/lib/achievements";
import { level, streak } from "@/lib/game";
import { useApp } from "@/lib/store";

export const Route = createFileRoute("/profile")({
  head: () => ({
    meta: [
      { title: "Профиль · Пульс" },
      {
        name: "description",
        content: "Твои данные и достижения.",
      },
      { property: "og:title", content: "Профиль · Пульс" },
      {
        property: "og:description",
        content: "Уровень, серия и достижения.",
      },
    ],
  }),
  component: Profile,
});

function Profile() {
  const s = useApp();
  const lv = level(s.xp);
  const st = streak(s);
  const badges = evaluateBadges(s, new Date());
  const initial = (s.name.trim()[0] ?? "💪").toUpperCase();

  return (
    <div className="space-y-5">
      <h1 className="pt-2 text-3xl font-extrabold tracking-tight">Профиль</h1>

      <section className="card-soft flex items-center gap-4 p-5">
        <span
          aria-hidden
          className="flex h-16 w-16 shrink-0 items-center justify-center rounded-3xl bg-primary-soft text-3xl font-extrabold text-primary-shade"
        >
          {initial}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-xl font-extrabold">{s.name || "Без имени"}</p>
          <p className="text-sm text-muted-foreground">
            Уровень {lv.lvl} · {s.xp} XP · 🔥 {st}
          </p>
        </div>
      </section>

      <Badges states={badges} />
    </div>
  );
}
