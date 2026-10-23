/** Progress-photo reminder schedule: "every N days since the last photo". */

export interface PhotoReminderSettings {
  enabled: boolean;
  /** 7 / 14 / 30 days. */
  everyDays: number;
  /** Hour of the day (local time) to fire the notification. */
  hour: number;
}

export const PHOTO_INTERVALS = [7, 14, 30] as const;

export const DEFAULT_PHOTO_REMINDER: PhotoReminderSettings = {
  enabled: false,
  everyDays: 14,
  hour: 10,
};

export function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Whole days between two yyyy-MM-dd keys, DST-safe (calendar arithmetic). */
export function daysBetween(from: string, to: string): number {
  const a = from.split("-").map(Number);
  const b = to.split("-").map(Number);
  if (a.length !== 3 || b.length !== 3) return 0;
  const utcA = Date.UTC(a[0]!, a[1]! - 1, a[2]!);
  const utcB = Date.UTC(b[0]!, b[1]! - 1, b[2]!);
  return Math.max(0, Math.round((utcB - utcA) / 86_400_000));
}

export function daysSince(dateKeyValue: string, now = new Date()): number {
  return daysBetween(dateKeyValue, dayKey(now));
}

/** True when enough days have passed (or there are no photos at all). */
export function photoDue(
  lastPhotoDate: string | undefined,
  settings: PhotoReminderSettings,
  now = new Date(),
): boolean {
  if (!settings.enabled) return false;
  if (!lastPhotoDate) return true;
  return daysSince(lastPhotoDate, now) >= Math.max(1, settings.everyDays);
}

/** Notification may fire only at/after the chosen hour. */
export function reminderHourReached(settings: PhotoReminderSettings, now = new Date()): boolean {
  return now.getHours() >= settings.hour;
}

export function reminderMessage(lastPhotoDate: string | undefined, now = new Date()): string {
  if (!lastPhotoDate) return "Ты ещё не сделал фото прогресса. Пора начать!";
  const d = daysSince(lastPhotoDate, now);
  const word =
    d % 10 === 1 && d % 100 !== 11
      ? "день"
      : d % 10 >= 2 && d % 10 <= 4 && (d % 100 < 12 || d % 100 > 14)
        ? "дня"
        : "дней";
  return `Последнее фото ${d} ${word} назад. Пора обновить!`;
}

/** Next planned photo date (yyyy-MM-dd) or null when photos/reminders are off. */
export function nextPhotoDate(
  lastPhotoDate: string | undefined,
  settings: PhotoReminderSettings,
): string | null {
  if (!lastPhotoDate) return null;
  const parts = lastPhotoDate.split("-").map(Number);
  if (parts.length !== 3) return null;
  const d = new Date(Date.UTC(parts[0]!, parts[1]! - 1, parts[2]!));
  d.setUTCDate(d.getUTCDate() + Math.max(1, settings.everyDays));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}
