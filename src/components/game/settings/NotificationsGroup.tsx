import { Bell } from "lucide-react";
import { toast } from "sonner";
import { Capacitor } from "@capacitor/core";
import { Switch } from "@/components/ui/switch";
import { TapButton } from "@/components/game/TapButton";
import { notify } from "@/components/game/useReminders";
import { requestNotificationPermission } from "@/lib/notify";
import { syncNativeReminderSchedule } from "@/lib/native-reminders";
import { usePhotoDue } from "@/hooks/usePhotoReminder";
import { PHOTO_INTERVALS, nextPhotoDate, reminderMessage } from "@/lib/photo-reminders";
import { dayKey } from "@/lib/game";
import { buildSlots, clampMinute, REMINDER_CAP, WINDOW_MIN } from "@/lib/phrases";
import { dayInfo } from "@/lib/plan";
import { useApp } from "@/lib/store";
import { sliceChanged } from "@/lib/settings-draft";
import { SectionCard, selectField } from "./SectionCard";
import { useSettingsDraft } from "./draft-context";

/** 30-minute steps from 06:00 to 22:00 (the reminder window range). */
const windowOptions: number[] = Array.from({ length: 33 }, (_, i) => WINDOW_MIN + i * 30);

const formatHM = (m: number) =>
  `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

const hourOptions = Array.from({ length: 17 }, (_, i) => i + 6);

async function askNotificationPermission(): Promise<boolean> {
  if (Capacitor.isNativePlatform()) {
    const granted = await requestNotificationPermission();
    if (!granted) toast.error("Разреши уведомления для Sprout в настройках Android.");
    return granted;
  }
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

  // Today's schedule preview from the current draft: kind comes from the saved plan.
  const now = new Date();
  const kind = dayInfo(useApp.getState(), now, now).status === "rest" ? "rest" : "workout";
  const slots = draft.reminders.enabled ? buildSlots(draft.reminders, dayKey(now), kind) : [];

  return (
    <SectionCard title="Уведомления" changed={changed}>
      <div className="flex items-center justify-between">
        <span>Напоминать о тренировках</span>
        <Switch
          checked={draft.reminders.enabled}
          onCheckedChange={(v) => update({ reminders: { ...draft.reminders, enabled: v } })}
        />
      </div>
      {draft.reminders.enabled && (
        <>
          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="mb-1 block text-sm text-muted-foreground">Окно с</span>
              <select
                className={selectField}
                value={draft.reminders.windowStart}
                onChange={(e) => {
                  const windowStart = +e.target.value;
                  update({
                    reminders: {
                      ...draft.reminders,
                      windowStart,
                      windowEnd: Math.max(draft.reminders.windowEnd, windowStart + 60),
                      preferred: clampMinute(
                        draft.reminders.preferred,
                        windowStart,
                        Math.max(draft.reminders.windowEnd, windowStart + 60),
                      ),
                    },
                  });
                }}
              >
                {windowOptions
                  .filter((m) => m <= draft.reminders.windowEnd - 60)
                  .map((m) => (
                    <option key={m} value={m}>
                      {formatHM(m)}
                    </option>
                  ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-sm text-muted-foreground">Окно до</span>
              <select
                className={selectField}
                value={draft.reminders.windowEnd}
                onChange={(e) => {
                  const windowEnd = +e.target.value;
                  update({
                    reminders: {
                      ...draft.reminders,
                      windowEnd,
                      preferred: clampMinute(
                        draft.reminders.preferred,
                        draft.reminders.windowStart,
                        windowEnd,
                      ),
                    },
                  });
                }}
              >
                {windowOptions
                  .filter((m) => m >= draft.reminders.windowStart + 60 && m <= REMINDER_CAP - 30)
                  .map((m) => (
                    <option key={m} value={m}>
                      {formatHM(m)}
                    </option>
                  ))}
              </select>
            </label>
          </div>
          <label className="flex items-center justify-between">
            <span>Обычное время тренировки</span>
            <select
              className={selectField}
              value={draft.reminders.preferred}
              onChange={(e) =>
                update({ reminders: { ...draft.reminders, preferred: +e.target.value } })
              }
            >
              {windowOptions
                .filter((m) => m >= draft.reminders.windowStart && m <= draft.reminders.windowEnd)
                .map((m) => (
                  <option key={m} value={m}>
                    {formatHM(m)}
                  </option>
                ))}
            </select>
          </label>
          <p className="text-sm text-muted-foreground">
            {slots.length
              ? `Сегодня ${slots.length} нап${slots.length === 1 ? "оминание" : slots.length < 5 ? "оминания" : "оминаний"}: ${slots.map(formatHM).join(", ")}. ${kind === "rest" ? "День отдыха — только один дружелюбный пинг." : "К концу окна напоминания становятся настойчивее."}`
              : "Напоминания выключены."}
          </p>
        </>
      )}

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
          try {
            if (await askNotificationPermission()) {
              await syncNativeReminderSchedule(useApp.getState(), photo.lastDate);
              const sent = await notify(
                "Огонёк на связи 💪",
                "Теперь я буду напоминать о тренировках!",
              );
              if (!sent) toast.error("Не удалось отправить тестовое уведомление.");
            }
          } catch (error) {
            console.error("Could not request or schedule notifications.", error);
            toast.error("Не удалось включить уведомления. Проверь системные разрешения.");
          }
        }}
      >
        <Bell className="h-4 w-4" /> Разрешить уведомления
      </TapButton>
      <p className="text-sm text-muted-foreground">
        На Android напоминания планируются системой и могут приходить при закрытом приложении.
        Энергосбережение телефона иногда задерживает их. В браузере проверка работает, пока вкладка
        открыта. Не позже 22:00.
      </p>
      {pr.enabled && (
        <p className="text-xs text-muted-foreground">
          Баннер «Пора обновить фото» виден всегда, когда срок подошёл.
        </p>
      )}
    </SectionCard>
  );
}
