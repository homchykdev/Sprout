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
const CHANNEL_ID = "reminders";
const SCHEDULE_CONFIG_KEY = "sprout-native-reminders-config";
const SCHEDULE_CONFIG_VERSION = "1";
const NATIVE_BATCH_SIZE = 20;
let latestRequest:
  { state: ReminderState; lastPhotoDate: string | undefined; now: Date } | undefined;
let scheduleQueue: Promise<void> | undefined;

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
    channelId: CHANNEL_ID,
    schedule: { at: date, allowWhileIdle: true },
    isExactNotification: true,
    isExactMandatory: false,
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
  await LocalNotifications.createChannel({
    id: CHANNEL_ID,
    name: "Напоминания",
    importance: 4,
  });
  if (permission.display !== "granted") return;

  const pending = await LocalNotifications.getPending();
  const existing = new Map(
    pending.notifications
      .filter(({ id }) => isManagedReminderId(id))
      .map((notification) => [notification.id, notification]),
  );
  const desired = buildNativeReminders(state, lastPhotoDate, now);
  let needsMigration = true;
  try {
    needsMigration = window.localStorage.getItem(SCHEDULE_CONFIG_KEY) !== SCHEDULE_CONFIG_VERSION;
  } catch (error) {
    console.warn("Could not read the native reminder configuration version.", error);
  }
  const desiredIds = new Set(desired.map(({ id }) => id));
  const stale = needsMigration
    ? [...existing.keys()]
    : [...existing.keys()].filter((id) => !desiredIds.has(id));
  const additions: LocalNotificationSchema[] = [];
  const updates: LocalNotificationSchema[] = [];
  for (const notification of desired) {
    if (needsMigration) {
      additions.push(notification);
      continue;
    }
    const current = existing.get(notification.id);
    if (!current) {
      additions.push(notification);
      continue;
    }
    const currentAt =
      current.schedule?.at instanceof Date
        ? current.schedule.at.getTime()
        : new Date(current.schedule?.at ?? 0).getTime();
    if (
      current.title !== notification.title ||
      current.body !== notification.body ||
      currentAt !== notification.schedule?.at?.getTime()
    )
      updates.push(notification);
  }
  for (let offset = 0; offset < stale.length; offset += NATIVE_BATCH_SIZE) {
    const batch = stale.slice(offset, offset + NATIVE_BATCH_SIZE);
    await LocalNotifications.cancel({ notifications: batch.map((id) => ({ id })) });
  }
  let warning: string | undefined;
  if (updates.length) {
    const result = await LocalNotifications.update({ notifications: updates });
    warning = result.warning?.message;
  }
  for (let offset = 0; offset < additions.length; offset += NATIVE_BATCH_SIZE) {
    const batch = additions.slice(offset, offset + NATIVE_BATCH_SIZE);
    const result = await LocalNotifications.schedule({ notifications: batch });
    warning ??= result.warning?.message;
  }
  if (needsMigration) {
    try {
      window.localStorage.setItem(SCHEDULE_CONFIG_KEY, SCHEDULE_CONFIG_VERSION);
    } catch (error) {
      console.warn("Could not persist the native reminder configuration version.", error);
    }
  }
}

export function syncNativeReminderSchedule(
  state: ReminderState,
  lastPhotoDate: string | undefined,
  now = new Date(),
): Promise<void> {
  if (!Capacitor.isNativePlatform()) return Promise.resolve();
  latestRequest = { state, lastPhotoDate, now };
  if (scheduleQueue) return scheduleQueue;
  let processedRequest: typeof latestRequest;
  scheduleQueue = (async () => {
    do {
      processedRequest = latestRequest;
      if (processedRequest)
        await syncSchedule(
          processedRequest.state,
          processedRequest.lastPhotoDate,
          processedRequest.now,
        );
    } while (processedRequest !== latestRequest);
  })().finally(() => {
    scheduleQueue = undefined;
    if (latestRequest !== processedRequest && latestRequest)
      void syncNativeReminderSchedule(
        latestRequest.state,
        latestRequest.lastPhotoDate,
        latestRequest.now,
      );
  });
  return scheduleQueue;
}
