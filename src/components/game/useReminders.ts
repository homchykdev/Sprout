import { useEffect } from "react";
import { dayKey, NAGS, weekStatus } from "@/lib/game";
import { useApp } from "@/lib/store";

export async function notify(title: string, body: string) {
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return false;
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg) await reg.showNotification(title, { body, icon: "/icon-512.png", badge: "/icon-512.png", tag: "pulse-nag" });
    else new Notification(title, { body, icon: "/icon-512.png" });
    return true;
  } catch {
    return false;
  }
}

/** Escalating reminders: at the chosen hour, +2h and +4h while today's workout is due. */
export function useReminders() {
  useEffect(() => {
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
    const tick = () => {
      const s = useApp.getState();
      const now = new Date();
      const st = weekStatus(s, now);
      document.title = st.dueToday ? "🔥 Тренировка ждёт · Пульс" : "Пульс — тренировки";
      if (!s.reminders.enabled || !st.dueToday) return;
      const [d, n] = s.lastNotified.split("#");
      const count = d === dayKey(now) ? Number(n) || 0 : 0;
      const slot = s.reminders.hour + count * 2;
      if (count >= 3 || now.getHours() < slot) return;
      notify(st.atRisk ? "Серия под угрозой! 🔥" : "Огонёк ждёт тебя", NAGS[Math.min(count + (st.atRisk ? 2 : 0), NAGS.length - 1)] ?? "").then((ok) => {
        if (ok) useApp.getState().set({ lastNotified: `${dayKey(now)}#${count + 1}` });
      });
    };
    tick();
    const t = setInterval(tick, 60_000);
    return () => clearInterval(t);
  }, []);
}
