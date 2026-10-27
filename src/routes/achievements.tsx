import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { Badges } from "@/components/game/Badges";
import { MonthlyChallenge } from "@/components/game/MonthlyChallenge";
import { evaluateBadges, monthlyChallenge } from "@/lib/achievements";
import { useApp } from "@/lib/store";

export const Route = createFileRoute("/achievements")({
  head: () => ({
    meta: [
      { title: "Достижения · Пульс" },
      { name: "description", content: "Все награды и вызов месяца." },
      { property: "og:title", content: "Достижения · Пульс" },
      { property: "og:description", content: "Полный список наград и челлендж." },
    ],
  }),
  component: Achievements,
});

function Achievements() {
  const s = useApp();
  const badges = evaluateBadges(s, new Date());
  const challenge = monthlyChallenge(s.sessions, new Date());

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2 pt-2">
        <Link
          to="/profile"
          className="press -ml-2 rounded-full p-2 hover:bg-muted"
          aria-label="Назад"
        >
          <ArrowLeft />
        </Link>
        <h1 className="text-3xl font-extrabold tracking-tight">Достижения</h1>
      </div>
      <Badges states={badges} />
      <MonthlyChallenge challenge={challenge} />
    </div>
  );
}
