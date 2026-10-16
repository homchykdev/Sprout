import { useState } from "react";
import { toast } from "sonner";
import { TapButton } from "./TapButton";
import { useApp } from "@/lib/store";
import { cn } from "@/lib/utils";

const FACES = ["😞", "😐", "🙂", "😄", "🤩"] as const;
const HINTS = ["Тяжело", "Так себе", "Нормально", "Хорошо", "Отлично!"] as const;

/** Diary: 1–5 wellbeing stars + personal note, saved to the session. */
export function DiaryForm({ sessionId }: { sessionId: string }) {
  const session = useApp((s) => s.sessions.find((x) => x.id === sessionId));
  const [mood, setMood] = useState<1 | 2 | 3 | 4 | 5 | 0>(session?.mood ?? 0);
  const [note, setNote] = useState(session?.note ?? "");
  const [saved, setSaved] = useState(session?.mood != null || !!session?.note);

  if (!session) return null;
  const save = () => {
    useApp.getState().updateSession(sessionId, {
      ...(mood ? { mood } : {}),
      ...(note.trim() ? { note: note.trim().slice(0, 280) } : {}),
    });
    setSaved(true);
    toast.success("Записано в дневник 📝");
  };

  return (
    <div className="card-soft w-full p-5 text-left">
      <p className="font-bold">Дневник тренировки 📝</p>
      <p className="text-sm text-muted-foreground">Как самочувствие после тренировки?</p>
      <div
        className="mt-3 flex justify-between gap-1"
        role="radiogroup"
        aria-label="Самочувствие от 1 до 5"
      >
        {FACES.map((f, i) => (
          <button
            key={f}
            role="radio"
            aria-checked={mood === i + 1}
            aria-label={`${i + 1}: ${HINTS[i]}`}
            onClick={() => {
              setMood((i + 1) as 1 | 2 | 3 | 4 | 5);
              setSaved(false);
            }}
            className={cn(
              "press flex h-12 w-12 items-center justify-center rounded-2xl text-2xl transition-all",
              mood === i + 1
                ? "scale-110 bg-gold-soft ring-2 ring-gold"
                : "bg-muted hover:bg-gold-soft/50",
            )}
          >
            {f}
          </button>
        ))}
      </div>
      <textarea
        value={note}
        onChange={(e) => {
          setNote(e.target.value);
          setSaved(false);
        }}
        placeholder="Заметка: что получилось, что было тяжело…"
        rows={2}
        maxLength={280}
        aria-label="Личная заметка о тренировке"
        className="mt-3 w-full resize-none rounded-2xl border-2 bg-card px-4 py-3 text-[15px] outline-none focus:border-primary"
      />
      <TapButton
        variant="soft"
        size="sm"
        className="mt-2 min-h-[44px] w-full"
        onClick={save}
        disabled={saved && mood === (session.mood ?? 0)}
      >
        {saved ? "Сохранено ✓" : "Сохранить в дневник"}
      </TapButton>
    </div>
  );
}
