import { useEffect } from "react";
import { Capacitor } from "@capacitor/core";
import { LocalNotifications } from "@capacitor/local-notifications";
import { toast } from "sonner";
import { usePhotoDue } from "@/hooks/usePhotoReminder";
import { dayKey } from "@/lib/game";
import { CELEBRATE_PHRASES, buildSlots, pickPhrase, phraseFor, type DayKind } from "@/lib/phrases";
import { dayInfo, dueToday, planProgress } from "@/lib/plan";
import { useApp } from "@/lib/store";
import { notify } from "@/lib/notify";
import {
  dateFromReminderId,
  isManagedReminderId,
  syncNativeReminderSchedule,
} from "@/lib/native-reminders";

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
    void notify("Серия спасена! 🔥", body).catch((error: unknown) => {
      console.error("Could not send workout completion notification.", error);
    });
    useApp.getState().set({ lastNotified: `${day}#0` });
    return;
  }

  if (Capacitor.isNativePlatform()) return;

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

function recordDeliveredReminder(id: number, now = new Date()) {
  const date = dateFromReminderId(id);
  if (!date || date !== dayKey(now)) return;
  const slot = id % 10;
  const state = useApp.getState();
  if (slot === 9) {
    if (state.lastPhotoNotified !== date) state.set({ lastPhotoNotified: date });
    return;
  }
  if (dayInfo(state, now, now).status === "done") return;
  const count = firedCount(state.lastNotified, date);
  if (slot + 1 > count) state.set({ lastNotified: `${date}#${slot + 1}` });
}

async function reconcileDeliveredReminders() {
  const result = await LocalNotifications.getAll({ state: "TRIGGERED" });
  const now = new Date();
  const today = dayKey(now);
  const state = useApp.getState();
  let workoutCount = firedCount(state.lastNotified, today);
  let photoSent = state.lastPhotoNotified === today;
  for (const notification of result.notifications) {
    if (!isManagedReminderId(notification.id) || dateFromReminderId(notification.id) !== today)
      continue;
    const slot = notification.id % 10;
    if (slot === 9) photoSent = true;
    else if (dayInfo(state, now, now).status !== "done")
      workoutCount = Math.max(workoutCount, slot + 1);
  }
  const patch: { lastNotified?: string; lastPhotoNotified?: string } = {};
  if (workoutCount > 0 && state.lastNotified !== `${today}#${workoutCount}`)
    patch.lastNotified = `${today}#${workoutCount}`;
  if (photoSent && state.lastPhotoNotified !== today) patch.lastPhotoNotified = today;
  if (Object.keys(patch).length) state.set(patch);
}

function syncNativeSchedule(lastPhotoDate: string | undefined) {
  return syncNativeReminderSchedule(useApp.getState(), lastPhotoDate).catch((error: unknown) => {
    console.error("Could not synchronize Android reminders.", error);
    toast.error("Не удалось обновить расписание уведомлений.");
  });
}

/** Uses Android's alarm-backed local notifications; the web fallback polls while open. */
export function useReminders() {
  const photo = usePhotoDue();

  useEffect(() => {
    if (Capacitor.isNativePlatform()) {
      let active = true;
      const synchronize = async () => {
        await reconcileDeliveredReminders();
        if (!active) return;
        reminderTick();
        await syncNativeSchedule(photo.lastDate);
      };
      void synchronize().catch((error: unknown) => {
        console.error("Could not initialize Android reminders.", error);
        toast.error("Не удалось настроить уведомления на этом устройстве.");
      });

      const unsubscribe = useApp.subscribe((state, previous) => {
        if (
          state.reminders !== previous.reminders ||
          state.plan !== previous.plan ||
          state.vacations !== previous.vacations ||
          state.sessions !== previous.sessions ||
          state.photoReminder !== previous.photoReminder ||
          state.lastNotified !== previous.lastNotified ||
          state.lastPhotoNotified !== previous.lastPhotoNotified
        ) {
          reminderTick();
          void syncNativeSchedule(photo.lastDate);
        }
      });
      const onVisible = () => {
        if (document.visibilityState === "visible") void synchronize();
      };
      document.addEventListener("visibilitychange", onVisible);
      const listener = LocalNotifications.addListener("localNotificationReceived", (notification) =>
        recordDeliveredReminder(notification.id),
      );
      void listener.catch((error: unknown) => {
        console.error("Could not listen for Android notifications.", error);
      });

      return () => {
        active = false;
        unsubscribe();
        document.removeEventListener("visibilitychange", onVisible);
        void listener
          .then((handle) => handle.remove())
          .catch((error: unknown) => {
            console.error("Could not remove Android notification listener.", error);
          });
      };
    }

    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
    reminderTick();
    const t = setInterval(reminderTick, 60_000);
    return () => clearInterval(t);
  }, [photo.lastDate]);
}
