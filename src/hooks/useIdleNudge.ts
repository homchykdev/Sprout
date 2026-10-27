import { useEffect } from "react";
import { toast } from "sonner";
import { dayKey } from "@/lib/game";
import { pickPhrase } from "@/lib/phrases";
import { dueToday, planProgress } from "@/lib/plan";
import { useApp } from "@/lib/store";

/**
 * In-app nagging while the app is open and today's planned workout is still
 * undone: an escalating sonner toast, frequency-capped (max 1 per 15 minutes,
 * tracked in sessionStorage). Never fires on /play/* routes - it must not
 * interrupt an ongoing workout.
 */
const TOAST_KEY = "pulse-last-nag";
const CAP_MS = 15 * 60_000;

const IDLE_NAGS = [
  "Всё ещё в приложении, а тренировка так и не началась…",
  "Так. Ты просто листаешь страницы, чтобы я не надоедал. Я всё вижу.",
  "Я подожду ещё немного. Но серия — нет.",
  "Последний пинок за сегодня: тренировка. Сейчас?",
];

export function useIdleNudge() {
  useEffect(() => {
    const t = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      if (location.pathname.startsWith("/play")) return;
      const s = useApp.getState();
      const now = new Date();
      if (!s.reminders.enabled || !dueToday(s, now)) return;
      const last = Number(sessionStorage.getItem(TOAST_KEY) ?? 0);
      if (Date.now() - last < CAP_MS) return;
      sessionStorage.setItem(TOAST_KEY, String(Date.now()));
      const st = planProgress(s, now);
      if (st.streak <= 0) return; // no streak at stake - stay friendly, skip the toast
      const n = Math.floor(Date.now() / CAP_MS) % IDLE_NAGS.length;
      toast(`Серия ${st.streak} в опасности 🔥`, {
        description: pickPhrase(IDLE_NAGS, dayKey(now), n, undefined),
      });
    }, 60_000);
    return () => clearInterval(t);
  }, []);
}
