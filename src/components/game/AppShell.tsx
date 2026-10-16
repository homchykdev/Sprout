import { Link, useLocation } from "@tanstack/react-router";
import { Home, LayoutList, TrendingUp, User } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { level, streak } from "@/lib/game";
import { useApp } from "@/lib/store";
import { cn } from "@/lib/utils";
import { Mascot } from "./Mascot";
import { VacationButton } from "./VacationButton";
import { useReminders } from "./useReminders";

const TABS = [
  { to: "/", label: "Сегодня", icon: Home, match: ["/"] },
  { to: "/plans", label: "Тренировки", icon: LayoutList, match: ["/plans", "/library"] },
  { to: "/progress", label: "Прогресс", icon: TrendingUp, match: ["/progress", "/gallery"] },
  { to: "/profile", label: "Профиль", icon: User, match: ["/profile", "/settings"] },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const { pathname } = useLocation();
  const immersive = pathname.startsWith("/play");

  if (!mounted)
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Mascot size={90} />
      </div>
    );
  if (immersive) return <>{children}</>;
  return <Chrome pathname={pathname}>{children}</Chrome>;
}

function Chrome({ children, pathname }: { children: ReactNode; pathname: string }) {
  useReminders();
  useEffect(() => { if (!useApp.getState().since) useApp.getState().set({ since: new Date().toISOString().slice(0, 10) }); }, []);
  const s = useApp();
  const st = streak(s);
  const lv = level(s.xp);
  return (
    <div className="mx-auto min-h-screen max-w-xl">
      <header className="glass sticky top-0 z-30 flex items-center justify-between px-5 py-3">
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1.5 rounded-full bg-flame-soft px-3 py-1.5 text-sm font-bold text-flame-shade tabular">
            <span className={cn(st > 0 && "animate-flicker")}>🔥</span>
            {st}
          </span>
          <span className="flex items-center gap-1.5 rounded-full bg-gold-soft px-3 py-1.5 text-sm font-bold text-gold-shade tabular">
            ⚡ {s.xp}
          </span>
          <span className="rounded-full bg-sky-soft px-3 py-1.5 text-sm font-bold text-sky-shade">Ур. {lv.lvl}</span>
        </div>
        <div className="flex items-center gap-1">
          <VacationButton />
        </div>
      </header>
      <main key={pathname} className="animate-rise px-5 pb-32 pt-2">{children}</main>
      <nav className="glass fixed inset-x-0 bottom-0 z-30 border-t pb-[env(safe-area-inset-bottom)]">
        <div className="mx-auto grid max-w-xl grid-cols-4">
          {TABS.map(({ to, label, icon: Icon, match }) => {
            const active = match.some((m) =>
              m === "/" ? pathname === "/" : pathname.startsWith(m),
            );
            return (
              <Link key={to} to={to} className="press flex flex-col items-center gap-1 py-2.5">
                <span className={cn("flex h-9 w-12 items-center justify-center rounded-2xl transition-colors duration-300", active ? "bg-primary-soft text-primary-shade" : "text-muted-foreground")}>
                  <Icon className="h-[22px] w-[22px]" strokeWidth={active ? 2.5 : 2} />
                </span>
                <span className={cn("text-[11px] font-semibold", active ? "text-foreground" : "text-muted-foreground")}>{label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
