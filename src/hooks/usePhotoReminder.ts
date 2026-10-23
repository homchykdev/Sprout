import { useEffect, useMemo } from "react";
import { notify } from "@/lib/notify";
import { useMedia } from "@/lib/media";
import {
  dayKey,
  daysSince,
  photoDue,
  reminderHourReached,
  reminderMessage,
} from "@/lib/photo-reminders";
import { useApp } from "@/lib/store";

export interface PhotoDue {
  /** True when the next progress photo is due (reminders on). */
  due: boolean;
  lastDate: string | undefined;
  days: number | null;
}

/** Media + settings subscription for the «пора сделать фото» banner. */
export function usePhotoDue(): PhotoDue {
  const items = useMedia("progress");
  const settings = useApp((s) => s.photoReminder);
  const lastDate = useMemo(() => {
    if (!items) return undefined;
    return items
      .filter((m) => m.kind === "image")
      .map((m) => m.date)
      .sort((a, b) => b.localeCompare(a))[0];
  }, [items]);

  const due = items !== null && photoDue(lastDate, settings);
  const days = lastDate ? daysSince(lastDate) : null;
  return { due, lastDate, days };
}

/** Fires at most one system notification per day after the chosen hour. */
export function usePhotoReminders() {
  const photo = usePhotoDue();
  const settings = useApp((s) => s.photoReminder);
  const sentDay = useApp((s) => s.lastPhotoNotified);
  const set = useApp((s) => s.set);

  useEffect(() => {
    if (!photo.due || !reminderHourReached(settings)) return;
    const today = dayKey(new Date());
    if (sentDay === today) return;
    let alive = true;
    void notify("Пора обновить фото 📸", reminderMessage(photo.lastDate)).then((ok) => {
      if (ok && alive) set({ lastPhotoNotified: today });
    });
    return () => {
      alive = false;
    };
  }, [photo.due, photo.lastDate, settings, sentDay, set]);
}
