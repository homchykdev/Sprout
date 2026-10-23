import { useEffect } from "react";
import { dayKey, NAGS } from "@/lib/game";
import { notify } from "@/lib/notify";
import { dueToday, planProgress } from "@/lib/plan";
import { useApp } from "@/lib/store";

export { notify } from "@/lib/notify";

/** Escalating reminders: at the chosen hour, +2h and +4h while today's workout is due. */
export function useReminders() {
  useEffect(() => {
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
    const tick = () => {
      const s = useApp.getState();
      const now = new Date();
      const st = planProgress(s, now);
      const atRisk = !!st.breakAt || !!dueToday(s, now);
      document.title = dueToday(s, now) ? "🔥 Тренировка ждёт · Пульс" : "Пульс — тренировки";
      if (!s.reminders.enabled || !dueToday(s, now)) return;
      const [d, n] = s.lastNotified.split("#");
      const count = d === dayKey(now) ? Number(n) || 0 : 0;
      const slot = s.reminders.hour + count * 2;
      if (count >= 3 || now.getHours() < slot) return;
      notify(
        atRisk ? "Серия под угрозой! 🔥" : "Огонёк ждёт тебя",
        NAGS[Math.min(count + (atRisk ? 2 : 0), NAGS.length - 1)] ?? "",
      ).then((ok) => {
        if (ok) useApp.getState().set({ lastNotified: `${dayKey(now)}#${count + 1}` });
      });
    };
    tick();
    const t = setInterval(tick, 60_000);
    return () => clearInterval(t);
  }, []);
}
