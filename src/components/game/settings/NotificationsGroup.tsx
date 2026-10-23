import { Bell } from "lucide-react";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { TapButton } from "@/components/game/TapButton";
import { notify } from "@/components/game/useReminders";
import { usePhotoDue } from "@/hooks/usePhotoReminder";
import { PHOTO_INTERVALS, nextPhotoDate, reminderMessage } from "@/lib/photo-reminders";
import { sliceChanged } from "@/lib/settings-draft";
import { SectionCard, selectField } from "./SectionCard";
import { useSettingsDraft } from "./draft-context";

const hourOptions = Array.from({ length: 17 }, (_, i) => i + 6);

async function askNotificationPermission(): Promise<boolean> {
  if (typeof Notification === "undefined") {
    toast.error("Браузер не поддерживает уведомления");
    return false;
  }
  const p = await Notification.requestPermission();
  if (p !== "granted") {
    toast.error("Уведомления запрещены в браузере");
    return false;
  }
  return true;
}

/** Workout and progress-photo reminders in one card; changes wait for the save button. */
export function NotificationsGroup() {
  const { draft, entry, update } = useSettingsDraft();
  const photo = usePhotoDue();
  const nextPhoto = nextPhotoDate(photo.lastDate, draft.photoReminder);
  const pr = draft.photoReminder;
  const changed = sliceChanged(
    { reminders: draft.reminders, photoReminder: draft.photoReminder },
    { reminders: entry.reminders, photoReminder: entry.photoReminder },
  );

  return (
    <SectionCard title="Уведомления" changed={changed}>
      <div className="flex items-center justify-between">
        <span>Напоминать о тренировках</span>
        <Switch
          checked={draft.reminders.enabled}
          onCheckedChange={(v) => update({ reminders: { ...draft.reminders, enabled: v } })}
        />
      </div>
      <label className="flex items-center justify-between">
        <span>Первое напоминание в</span>
        <select
          className={selectField}
          value={draft.reminders.hour}
          onChange={(e) => update({ reminders: { ...draft.reminders, hour: +e.target.value } })}
        >
          {hourOptions.map((h) => (
            <option key={h} value={h}>
              {h}:00
            </option>
          ))}
        </select>
      </label>

      <div className="flex items-center justify-between border-t border-border pt-3">
        <span>Напоминать делать фото</span>
        <Switch
          checked={pr.enabled}
          onCheckedChange={(v) => update({ photoReminder: { ...pr, enabled: v } })}
        />
      </div>
      {pr.enabled && (
        <>
          <label className="flex items-center justify-between">
            <span>Интервал</span>
            <select
              className={selectField}
              value={pr.everyDays}
              onChange={(e) => update({ photoReminder: { ...pr, everyDays: +e.target.value } })}
            >
              {PHOTO_INTERVALS.map((n) => (
                <option key={n} value={n}>
                  каждые {n} дней
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center justify-between">
            <span>Напоминание в</span>
            <select
              className={selectField}
              value={pr.hour}
              onChange={(e) => update({ photoReminder: { ...pr, hour: +e.target.value } })}
            >
              {hourOptions.map((h) => (
                <option key={h} value={h}>
                  {h}:00
                </option>
              ))}
            </select>
          </label>
          <p className="text-sm text-muted-foreground">
            {photo.lastDate
              ? `${reminderMessage(photo.lastDate)}${nextPhoto ? ` Следующее фото — ${new Date(nextPhoto + "T00:00").toLocaleDateString("ru", { day: "numeric", month: "long" })}.` : ""}`
              : "Фото ещё не было — начни с первого кадра в одинаковой позе."}
          </p>
        </>
      )}

      <TapButton
        variant="soft"
        size="sm"
        onClick={async () => {
          if (await askNotificationPermission()) {
            await notify("Огонёк на связи 💪", "Теперь я буду напоминать о тренировках!");
          }
        }}
      >
        <Bell className="h-4 w-4" /> Разрешить уведомления
      </TapButton>
      <p className="text-sm text-muted-foreground">
        Если не потренируешься — Пульс напомнит ещё через 2 и 4 часа. Уведомления приходят, пока
        приложение открыто или установлено на главный экран.
      </p>
      {pr.enabled && (
        <p className="text-xs text-muted-foreground">
          Баннер «Пора обновить фото» виден всегда, когда срок подошёл.
        </p>
      )}
    </SectionCard>
  );
}
