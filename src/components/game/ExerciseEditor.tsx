import { useState } from "react";
import { toast } from "sonner";
import { ImagePlus, Sparkles, Trash2 } from "lucide-react";
import { addFiles, removeMedia } from "@/lib/media";
import { FeedbackEditor, cleanFeedback, toParts } from "./FeedbackEditor";
import { ExerciseThumb } from "./ExerciseThumb";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { aiImproveExercise } from "@/lib/clients";
import { clipsToText, parseClips, parseLink } from "@/lib/embed";
import { LinkMedia } from "./LinkMedia";
import { TapRhythmRecorder } from "./TapRhythmRecorder";
import { useApp, uid } from "@/lib/store";
import { CATEGORIES, MUSCLES, type Category, type Exercise, type MuscleKey } from "@/lib/types";
import { cn } from "@/lib/utils";
import { TapButton } from "./TapButton";

const field =
  "w-full rounded-2xl border-2 bg-card px-4 py-3 text-[15px] outline-none focus:border-primary";

export const blankExercise = (): Exercise => ({
  id: `c-${uid()}`,
  name: "",
  muscles: [],
  category: "strength",
  mode: "reps",
  reps: 12,
  seconds: 40,
  equipment: "",
  description: "",
  steps: [],
  mistakes: [],
  source: "custom",
  emoji: "💪",
});

export function ExerciseEditor({
  value,
  onClose,
}: {
  value: Exercise | null;
  onClose: () => void;
}) {
  const [ex, setEx] = useState<Exercise | null>(value);
  const [busy, setBusy] = useState(false);
  const upsert = useApp((s) => s.upsertExercise);
  const hasAi = useApp((s) => s.ai.keys.length > 0);
  if (value && ex?.id !== value.id) setEx(value);
  if (!ex) return null;
  const up = (p: Partial<Exercise>) => setEx({ ...ex, ...p });
  /** Rhythm mode stays selected even before the first take (rhythm: [] marker). */
  const tempoMode: "bpm" | "rhythm" = ex.rhythm ? "rhythm" : "bpm";
  const toggleM = (m: MuscleKey) =>
    up({
      muscles: ex.muscles.includes(m) ? ex.muscles.filter((x) => x !== m) : [...ex.muscles, m],
    });

  return (
    <Dialog open={!!value} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92dvh] w-full gap-0 overflow-y-auto rounded-3xl p-0 sm:max-w-lg">
        <DialogHeader className="glass sticky top-0 z-10 border-b px-6 pb-3 pt-5">
          <DialogTitle className="truncate">{ex.name || "Новое упражнение"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 px-6 pb-4 pt-4">
          <div className="flex gap-2">
            <input
              className={cn(field, "w-14 shrink-0 text-center")}
              aria-label="Эмодзи упражнения"
              value={ex.emoji ?? ""}
              onChange={(e) => up({ emoji: e.target.value })}
            />
            <input
              className={cn(field, "min-w-0 flex-1")}
              placeholder="Название"
              value={ex.name}
              onChange={(e) => up({ name: e.target.value })}
            />
          </div>
          <div className="flex gap-2">
            {(Object.keys(CATEGORIES) as Category[]).map((c) => (
              <button
                key={c}
                onClick={() => up({ category: c })}
                className={cn(
                  "press flex-1 rounded-2xl border-2 py-2 text-sm font-semibold",
                  ex.category === c && "border-primary bg-primary-soft text-primary-shade",
                )}
              >
                {CATEGORIES[c]}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <select
              className={field}
              value={ex.mode}
              onChange={(e) => up({ mode: e.target.value as "reps" | "time" })}
            >
              <option value="reps">Повторы</option>
              <option value="time">Таймер</option>
            </select>
            {ex.mode === "reps" ? (
              <input
                type="number"
                className={field}
                value={ex.reps}
                onChange={(e) => up({ reps: +e.target.value })}
              />
            ) : (
              <input
                type="number"
                className={field}
                value={ex.seconds}
                onChange={(e) => up({ seconds: +e.target.value })}
              />
            )}
          </div>
          <div>
            <p className="mb-2 text-sm font-semibold text-muted-foreground">
              Мышцы (первая — основная)
            </p>
            <div className="flex flex-wrap gap-1.5">
              {(Object.keys(MUSCLES) as MuscleKey[]).map((m) => (
                <button
                  key={m}
                  onClick={() => toggleM(m)}
                  className={cn(
                    "press rounded-full border-2 px-3 py-1 text-sm",
                    ex.muscles.includes(m) &&
                      "border-primary bg-primary-soft font-semibold text-primary-shade",
                  )}
                >
                  {MUSCLES[m]}
                </button>
              ))}
            </div>
          </div>
          <input
            className={field}
            placeholder="Инвентарь"
            value={ex.equipment}
            onChange={(e) => up({ equipment: e.target.value })}
          />
          <textarea
            className={field}
            rows={2}
            placeholder="Краткое описание"
            value={ex.description}
            onChange={(e) => up({ description: e.target.value })}
          />
          <textarea
            className={field}
            rows={4}
            placeholder="Шаги — каждый с новой строки"
            value={ex.steps.join("\n")}
            onChange={(e) => up({ steps: e.target.value.split("\n") })}
          />
          <textarea
            className={field}
            rows={3}
            placeholder="Частые ошибки — каждая с новой строки"
            value={ex.mistakes.join("\n")}
            onChange={(e) => up({ mistakes: e.target.value.split("\n") })}
          />
          <div className="flex items-center gap-3 rounded-2xl border-2 p-3">
            <ExerciseThumb key={ex.mediaId ?? "none"} ex={ex} className="h-16 w-16" />
            <div className="flex-1 text-sm">
              <p className="font-semibold">Своё фото или видео</p>
              <p className="text-xs text-muted-foreground">
                Показывается в библиотеке и на тренировке
              </p>
            </div>
            <label
              className="press cursor-pointer rounded-full bg-muted p-2.5"
              aria-label="Загрузить фото или видео"
            >
              <ImagePlus className="h-5 w-5" />
              <input
                type="file"
                accept="image/*,video/*"
                hidden
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (!f) return;
                  const { added, skipped } = await addFiles([f], "exercise");
                  const [id] = added;
                  if (id) {
                    if (ex.mediaId) void removeMedia(ex.mediaId);
                    up({ mediaId: id });
                  } else if (skipped.length) {
                    toast.error(
                      "Файл не принят — нужны JPG, PNG, GIF или MP4 (HEIC не поддерживается)",
                    );
                  }
                }}
              />
            </label>
            {ex.mediaId && (
              <button
                aria-label="Убрать фото"
                className="press rounded-full p-2.5 text-muted-foreground"
                onClick={() => {
                  void removeMedia(ex.mediaId!);
                  up({ mediaId: undefined });
                }}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </div>
          <input
            className={field}
            placeholder="Ссылка на видео: YouTube, Vimeo, mp4, gif или любой сайт"
            value={ex.videoUrl ?? ""}
            onChange={(e) => up({ videoUrl: e.target.value.trim() || undefined })}
          />
          {ex.videoUrl && parseLink(ex.videoUrl) && (
            <ClipsField
              key={ex.id}
              url={ex.videoUrl}
              value={ex.clips}
              onChange={(clips) => up({ clips: clips.length ? clips : undefined })}
            />
          )}
          <div>
            <p className="mb-2 text-sm font-semibold text-muted-foreground">
              Темп — что звучит во время выполнения
            </p>
            <div className="mb-2 flex gap-2">
              {(["bpm", "rhythm"] as const).map((m) => (
                <button
                  key={m}
                  onClick={() =>
                    up(
                      m === "bpm"
                        ? { rhythm: undefined }
                        // An empty pattern marks "rhythm mode" even before the first take.
                        : { bpm: undefined, rhythm: ex.rhythm ?? [] },
                    )
                  }
                  aria-pressed={tempoMode === m}
                  className={cn(
                    "press flex-1 rounded-2xl border-2 py-2 text-sm font-semibold",
                    tempoMode === m && "border-primary bg-primary-soft text-primary-shade",
                  )}
                >
                  {m === "bpm" ? "Метроном, уд/мин" : "Ритм (настручать)"}
                </button>
              ))}
            </div>
            {tempoMode === "bpm" ? (
              <div className="flex gap-2">
                <input
                  type="number"
                  min={0}
                  max={200}
                  className={cn(field, "min-w-0 flex-1")}
                  placeholder="Пусто или 0 = без метронома"
                  aria-label="Темп метронома, уд/мин"
                  value={ex.bpm ?? ""}
                  onChange={(e) =>
                    up({ bpm: +e.target.value > 0 ? Math.min(200, +e.target.value) : undefined })
                  }
                />
                {[40, 60, 90].map((b) => (
                  <button
                    key={b}
                    onClick={() => up({ bpm: b, rhythm: undefined })}
                    aria-label={`Темп ${b} уд/мин`}
                    className={cn(
                      "press shrink-0 rounded-2xl border-2 px-3 text-sm font-semibold",
                      ex.bpm === b && "border-primary bg-primary-soft text-primary-shade",
                    )}
                  >
                    {b}
                  </button>
                ))}
              </div>
            ) : (
              <TapRhythmRecorder value={ex.rhythm} onChange={(r) => up({ rhythm: r })} />
            )}
          </div>
          <div>
            <p className="mb-2 text-sm font-semibold text-muted-foreground">
              Моя оценка — учитывается при составлении тренировок от ИИ
            </p>
            <FeedbackEditor
              {...toParts(ex.feedback)}
              onChange={(d) => up({ feedback: cleanFeedback(ex.feedback, { difficulty: d }) })}
              onVerdict={(v) => up({ feedback: cleanFeedback(ex.feedback, { verdict: v }) })}
            />
          </div>
          <div className="sticky bottom-0 z-10 -mx-6 flex gap-2 border-t bg-background px-6 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-3 [background:color-mix(in_oklab,var(--background)_92%,transparent)] backdrop-blur">
            {hasAi && (
              <TapButton
                variant="soft"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    setEx(await aiImproveExercise(ex, ""));
                    toast.success("ИИ улучшил описание");
                  } catch (e) {
                    toast.error((e as Error).message);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                <Sparkles className="h-4 w-4 shrink-0" /> {busy ? "Думаю…" : "Улучшить ИИ"}
              </TapButton>
            )}
            <TapButton
              className="min-w-0 flex-1 whitespace-nowrap"
              disabled={!ex.name || !ex.muscles.length}
              onClick={() => {
                upsert({
                  ...ex,
                  steps: ex.steps.filter(Boolean),
                  mistakes: ex.mistakes.filter(Boolean),
                });
                toast.success("Сохранено");
                onClose();
              }}
            >
              Сохранить
            </TapButton>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ClipsField({
  url,
  value,
  onChange,
}: {
  url: string;
  value?: { start: number; end: number }[] | undefined;
  onChange: (c: { start: number; end: number }[]) => void;
}) {
  const [text, setText] = useState(clipsToText(value));
  const k = parseLink(url);
  const clips = parseClips(text);
  const canClip = k?.type === "youtube" || k?.type === "video";
  return (
    <div className="space-y-2 rounded-2xl bg-muted p-3">
      <div className="aspect-video overflow-hidden rounded-xl bg-card">
        <LinkMedia url={url} clips={clips} controls />
      </div>
      {canClip && (
        <>
          <textarea
            className={field}
            rows={2}
            placeholder={"Таймкоды, каждый с новой строки:\n1:20-1:45"}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              onChange(parseClips(e.target.value));
            }}
          />
          <p className="text-xs text-muted-foreground">
            {clips.length
              ? `Будет повторяться только ${clips.length === 1 ? "этот отрезок" : `${clips.length} отрезка по очереди`}.`
              : "Без таймкодов играет всё видео. Для ролика с несколькими упражнениями вставь ту же ссылку в каждое упражнение со своими таймкодами."}
          </p>
        </>
      )}
    </div>
  );
}
