import { useEffect } from "react";
import { dayKey } from "@/lib/game";
import { CELEBRATE_PHRASES, buildSlots, pickPhrase, phraseFor, type DayKind } from "@/lib/phrases";
import { dayInfo, dueToday, planProgress } from "@/lib/plan";
import { useApp } from "@/lib/store";
import { notify } from "@/lib/notify";

export { notify } from "@/lib/notify";

/** Sent notifications are gated by `lastNotified: "yyyy-MM-dd#count"` (count = slots fired). */
function firedCount(lastNotified: string, day: string): number {
  const [d, n] = lastNotified.split("#");
  return d === day ? Number(n) || 0 : 0;
}

export function reminderTick() {
  const s = useApp.getState();
  const now = new Date();
  const day = dayKey(now);
  const st = planProgress(s, now);
  const due = dueToday(s, now);
  const today = dayInfo(s, now, now);
  const rest = today.status === "rest";
  document.title = due ? "🔥 Тренировка ждёт · Пульс" : "Пульс — тренировки";

  // Absolute cap: nothing after 22:00.
  const nowMin = now.getHours() * 60 + now.getMinutes();
  if (nowMin >= 22 * 60) return;

  const r = s.reminders;
  const kind: DayKind | "off" = due ? "workout" : rest ? "rest" : "off";

  // Sent slots for today; celebration guard also uses it.
  const sent = firedCount(s.lastNotified, day);
  // Celebration: a planned workout day closed by a session after >=1 nag was sent.
  const status = today.status;
  if (sent > 0 && status === "done") {
    const body = pickPhrase(CELEBRATE_PHRASES, "celebrate", now.getDate(), undefined);
    void notify("Серия спасена! 🔥", body);
    useApp.getState().set({ lastNotified: `${day}#0` });
    return;
  }

  if (!r.enabled || kind === "off") return;
  const slots = buildSlots(r, day, kind);
  const count = sent;
  // Number of slots that should already have fired by now.
  const due_slots = slots.filter((m) => m <= nowMin).length;
  if (count >= due_slots || count >= slots.length) return;
  const i = count;
  const { title, body } = phraseFor(slots, i, {
    kind,
    streak: st.streak,
    hour: now.getHours(),
  });
  void notify(title, body).then((ok) => {
    if (ok) useApp.getState().set({ lastNotified: `${day}#${i + 1}` });
  });
}

/** Registers the service worker and runs the reminder tick every minute. */
export function useReminders() {
  useEffect(() => {
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
    reminderTick();
    const t = setInterval(reminderTick, 60_000);
    return () => clearInterval(t);
  }, []);
}
