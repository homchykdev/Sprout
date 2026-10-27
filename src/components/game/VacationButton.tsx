import { Palmtree } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { activeVacation, dayKey } from "@/lib/game";
import { useApp } from "@/lib/store";
import { cn } from "@/lib/utils";
import { Mascot } from "./Mascot";
import { TapButton } from "./TapButton";

const field =
  "w-full rounded-2xl border-2 bg-card px-4 py-3 text-[15px] outline-none focus:border-primary";
const fmt = (d: string) =>
  new Date(d + "T00:00").toLocaleDateString("ru", { day: "numeric", month: "long" });

/** Header button + sheet for vacation mode. */
export function VacationButton() {
  const s = useApp();
  const [open, setOpen] = useState(false);
  const today = dayKey(new Date());
  const [vs, setVs] = useState(today);
  const [ve, setVe] = useState(dayKey(new Date(Date.now() + 7 * 864e5)));
  const vac = activeVacation(s.vacations);
  const upcoming = s.vacations
    .filter((v) => v.start > today)
    .sort((a, b) => a.start.localeCompare(b.start));

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label="Отпуск"
        className={cn(
          "press flex h-10 items-center gap-1.5 rounded-full px-3 text-sm font-bold",
          vac ? "bg-sky-soft text-sky-shade" : "text-muted-foreground hover:bg-muted",
        )}
      >
        <Palmtree className="h-5 w-5" />
        {vac && <span>до {fmt(vac.end)}</span>}
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="space-y-1 rounded-3xl">
          <div className="flex justify-center">
            <Mascot mood={vac ? "sleep" : "happy"} size={80} />
          </div>
          <DialogTitle className="text-center text-xl">Отпуск</DialogTitle>
          {vac ? (
            <>
              <p className="text-center text-sm">
                Отдыхаешь до <b>{fmt(vac.end)}</b>. Серия заморожена, напоминания выключены.
              </p>
              <TapButton
                variant="soft"
                onClick={() => {
                  s.set({
                    vacations: s.vacations.map((v) =>
                      v === vac ? { ...v, end: dayKey(new Date(Date.now() - 864e5)) } : v,
                    ),
                  });
                  toast.success("С возвращением! 💪");
                }}
              >
                Завершить отпуск
              </TapButton>
            </>
          ) : (
            <>
              <p className="text-center text-sm text-muted-foreground">
                Долго тренируешься без перерыва или уезжаешь? Возьми отпуск — серия не сгорит.
              </p>
              <div className="grid grid-cols-2 gap-2">
                <label className="text-xs font-semibold text-muted-foreground">
                  С
                  <input
                    type="date"
                    className={field}
                    value={vs}
                    min={today}
                    onChange={(e) => setVs(e.target.value)}
                  />
                </label>
                <label className="text-xs font-semibold text-muted-foreground">
                  По
                  <input
                    type="date"
                    className={field}
                    value={ve}
                    min={vs}
                    onChange={(e) => setVe(e.target.value)}
                  />
                </label>
              </div>
              <TapButton
                variant="sky"
                disabled={ve < vs}
                onClick={() => {
                  s.set({ vacations: [...s.vacations, { start: vs, end: ve }] });
                  toast.success(
                    vs === today ? "Хорошего отдыха! 🌴" : `Отпуск запланирован с ${fmt(vs)}`,
                  );
                  setOpen(false);
                }}
              >
                <Palmtree className="h-4 w-4" /> {vs === today ? "Начать отпуск" : "Запланировать"}
              </TapButton>
            </>
          )}
          {upcoming.length > 0 && (
            <div className="space-y-1.5 pt-2">
              <p className="text-xs font-bold uppercase text-muted-foreground">Запланировано</p>
              {upcoming.map((v) => (
                <div
                  key={v.start + v.end}
                  className="flex items-center justify-between rounded-2xl bg-muted px-4 py-2 text-sm"
                >
                  <span>
                    {fmt(v.start)} — {fmt(v.end)}
                  </span>
                  <button
                    className="font-semibold text-destructive"
                    onClick={() => s.set({ vacations: s.vacations.filter((x) => x !== v) })}
                  >
                    Отменить
                  </button>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
