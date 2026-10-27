import { Capacitor } from "@capacitor/core";
import { LocalNotifications, type LocalNotificationSchema } from "@capacitor/local-notifications";
import { addDays, dayKey } from "./game";
import { buildSlots, phraseFor, type DayKind } from "./phrases";
import { dayInfo, planProgress } from "./plan";
import type { AppState } from "./store";
import { reminderMessage, nextPhotoDate } from "./photo-reminders";

type ReminderState = Pick<
  AppState,
  | "plan"
  | "sessions"
  | "vacations"
  | "reminders"
  | "lastNotified"
  | "photoReminder"
  | "lastPhotoNotified"
>;

const SCHEDULE_DAYS = 30;
const PHOTO_SLOT = 9;
let scheduleQueue: Promise<void> = Promise.resolve();

function notificationId(date: Date, slot: number): number {
  return Number(dayKey(date).replaceAll("-", "")) * 10 + slot;
}

function atMinute(date: Date, minute: number): Date {
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    Math.floor(minute / 60),
    minute % 60,
  );
}

function nativeNotification(
  date: Date,
  slot: number,
  title: string,
  body: string,
): LocalNotificationSchema {
  return {
    id: notificationId(date, slot),
    title,
    body,
    schedule: { at: date, allowWhileIdle: true },
    isExactNotification: false,
  };
}

export function isManagedReminderId(id: number): boolean {
  const dateCode = Math.floor(id / 10);
  const slot = id % 10;
  return dateCode >= 20000101 && dateCode <= 21991231 && (slot <= 6 || slot === PHOTO_SLOT);
}

export function dateFromReminderId(id: number): string | null {
  if (!isManagedReminderId(id)) return null;
  const code = String(Math.floor(id / 10));
  return `${code.slice(0, 4)}-${code.slice(4, 6)}-${code.slice(6, 8)}`;
}

export function buildNativeReminders(
  state: ReminderState,
  lastPhotoDate: string | undefined,
  now = new Date(),
): LocalNotificationSchema[] {
  const notifications: LocalNotificationSchema[] = [];
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const streak = planProgress(state, now).streak;

  if (state.reminders.enabled) {
    for (let offset = 0; offset < SCHEDULE_DAYS; offset++) {
      const date = addDays(today, offset);
      const info = dayInfo(state, date, now);
      let kind: DayKind | undefined;
      if (info.status === "rest") kind = "rest";
      else if (
        info.status === "pending" ||
        (info.status === "future" && info.step?.kind === "workout")
      ) {
        kind = "workout";
      }
      if (!kind) continue;

      const slots = buildSlots(state.reminders, dayKey(date), kind);
      slots.forEach((minute, slot) => {
        const scheduledAt = atMinute(date, minute);
        if (scheduledAt <= now) return;
        const phrase = phraseFor(slots, slot, {
          kind,
          streak,
          hour: Math.floor(minute / 60),
        });
        notifications.push(nativeNotification(scheduledAt, slot, phrase.title, phrase.body));
      });
    }
  }

  if (state.photoReminder.enabled) {
    const dueDateKey = nextPhotoDate(lastPhotoDate, state.photoReminder);
    const dueDate = dueDateKey ? new Date(`${dueDateKey}T00:00:00`) : today;
    for (let offset = 0; offset < SCHEDULE_DAYS; offset++) {
      const date = addDays(today, offset);
      const key = dayKey(date);
      if (date < dueDate || state.lastPhotoNotified === key) continue;
      let scheduledAt = atMinute(date, state.photoReminder.hour * 60);
      if (scheduledAt <= now) {
        if (offset > 0) continue;
        scheduledAt = new Date(now.getTime() + 60_000);
      }
      notifications.push(
        nativeNotification(
          scheduledAt,
          PHOTO_SLOT,
          "Пора обновить фото 📸",
          reminderMessage(lastPhotoDate, date),
        ),
      );
    }
  }

  return notifications;
}

async function syncSchedule(state: ReminderState, lastPhotoDate: string | undefined, now: Date) {
  const permission = await LocalNotifications.checkPermissions();
  const pending = await LocalNotifications.getPending();
  const managed = pending.notifications
    .filter(({ id }) => isManagedReminderId(id))
    .map(({ id }) => ({ id }));
  if (managed.length) await LocalNotifications.cancel({ notifications: managed });
  if (permission.display !== "granted") return;

  const notifications = buildNativeReminders(state, lastPhotoDate, now);
  if (notifications.length) await LocalNotifications.schedule({ notifications });
}

export function syncNativeReminderSchedule(
  state: ReminderState,
  lastPhotoDate: string | undefined,
  now = new Date(),
): Promise<void> {
  if (!Capacitor.isNativePlatform()) return Promise.resolve();
  const run = () => syncSchedule(state, lastPhotoDate, now);
  const task = scheduleQueue.then(run, run);
  scheduleQueue = task.then(
    () => undefined,
    () => undefined,
  );
  return task;
}
