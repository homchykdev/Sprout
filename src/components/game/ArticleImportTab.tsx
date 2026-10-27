import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { TapButton } from "./TapButton";
import { ExerciseThumb } from "./ExerciseThumb";
import { LinkMedia } from "./LinkMedia";
import {
  aiImportArticle,
  articleExercise,
  buildWorkoutFromExercises,
  mapCategory,
  mapMuscles,
  type ArticleExercise,
} from "@/lib/clients";
import { useApp } from "@/lib/store";
import { CATEGORIES, MUSCLES, type Exercise } from "@/lib/types";
import { cn } from "@/lib/utils";

/** Preview-only exercise (no id/store yet): thumb and media preview resolve the link itself. */
function previewEx(e: ArticleExercise): Exercise {
  return {
    id: "preview",
    name: e.name,
    muscles: mapMuscles(e.muscles),
    category: mapCategory(e.category),
    mode: e.mode,
    reps: e.reps ?? 12,
    seconds: e.seconds ?? 40,
    equipment: "",
    description: e.description,
    steps: e.steps,
    mistakes: e.mistakes,
    ...(e.videoUrl ? { videoUrl: e.videoUrl } : {}),
    ...(e.emoji ? { emoji: e.emoji } : {}),
    source: "ai",
  };
}

/**
 * "Из статьи" tab: pastes a blog article URL, the server fetches the page and
 * the AI splits it into exercises; each exercise keeps its own media as a link
 * (iframe/img — nothing is downloaded). User picks what lands in the library.
 */
export function ArticleImportTab({ onClose }: { onClose: () => void }) {
  const nav = useNavigate();
  const exercises = useApp((s) => s.exercises);
  const upsertExercise = useApp((s) => s.upsertExercise);
  const upsertWorkout = useApp((s) => s.upsertWorkout);
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [res, setRes] = useState<ArticleExercise[] | null>(null);
  const [sel, setSel] = useState<Set<number>>(new Set());
  const [openIdx, setOpenIdx] = useState<number | null>(null);
  const [naming, setNaming] = useState(false);
  const [workoutName, setWorkoutName] = useState("Комплекс из статьи");

  const exists = (name: string) =>
    exercises.some((e) => e.name.trim().toLowerCase() === name.trim().toLowerCase());

  const analyze = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const list = await aiImportArticle(url.trim());
      if (!list.length) {
        setError("В этой статье не найдено упражнений. Попробуйте другой материал.");
        return;
      }
      setRes(list);
      setSel(new Set(list.map((_, i) => i).filter((i) => !exists(list[i]!.name))));
      setOpenIdx(null);
      setNaming(false);
      setWorkoutName("Комплекс из статьи");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const toggle = (i: number) =>
    setSel((p) => {
      const n = new Set(p);
      if (n.has(i)) n.delete(i);
      else n.add(i);
      return n;
    });

  const selected = () => (res ?? []).map((e, i) => ({ e, i })).filter(({ i }) => sel.has(i));

  const addSelected = () => {
    const list = selected().map(({ e }) => articleExercise(e));
    list.forEach(upsertExercise);
    toast.success(list.length === 1 ? "Упражнение добавлено" : `Добавлено: ${list.length}`);
    onClose();
  };

  const saveAsWorkout = () => {
    if (!res) return;
    const list = selected().map(({ e }) => articleExercise(e));
    list.forEach(upsertExercise);
    const w = buildWorkoutFromExercises(list, workoutName);
    upsertWorkout(w);
    onClose();
    toast.success(`Тренировка «${w.name}» сохранена`, {
      action: { label: "Открыть", onClick: () => nav({ to: "/plans" }) },
    });
  };

  const https = /^https?:\/\/\S+\.\S+/.test(url.trim());

  return (
    <div className="space-y-3">
      {!res && (
        <>
          <input
            aria-label="Ссылка на статью"
            className="h-12 w-full rounded-2xl border-2 px-4 outline-none focus:border-primary"
            placeholder="Ссылка на статью, напр. https://fitstars.ru/blog/…"
            value={url}
            onChange={(e) => {
              setUrl(e.target.value);
              setError(null);
            }}
            inputMode="url"
          />
          <p className="text-sm text-muted-foreground">
            Из любой тренировочной статьи достанем упражнения с их родными видео и фото — медиа
            останутся ссылками и не займут место на устройстве.
          </p>
          <TapButton className="w-full" disabled={!https || busy} onClick={analyze}>
            {busy ? "Разбираю статью…" : "Разобрать статью"}
          </TapButton>
          {busy && (
            <div className="space-y-2" aria-live="polite">
              <div className="space-y-2">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="h-16 animate-pulse rounded-2xl bg-muted" />
                ))}
              </div>
              <p className="text-sm text-muted-foreground">
                Читаю страницу и разбираю упражнения — до минуты на длинные статьи.
              </p>
            </div>
          )}
        </>
      )}

      {error && (
        <div className="space-y-2 rounded-2xl border-2 border-destructive/40 p-4">
          <p className="text-sm font-semibold">Не получилось прочитать статью</p>
          <p className="text-sm text-muted-foreground">{error}</p>
          <TapButton
            size="sm"
            variant="soft"
            onClick={() => {
              setError(null);
              setRes(null);
            }}
          >
            Попробовать другую ссылку
          </TapButton>
        </div>
      )}

      {res && res.length > 0 && (
        <>
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold">
              Найдено: {res.length}. Выбрано: {sel.size}
            </p>
            <button
              className="text-sm font-semibold text-primary"
              onClick={() =>
                setSel(sel.size === res.length ? new Set() : new Set(res.map((_, i) => i)))
              }
            >
              {sel.size === res.length ? "Снять все" : "Выбрать все"}
            </button>
          </div>
          <div className="space-y-2">
            {res.map((e, i) => {
              const on = sel.has(i);
              const open = openIdx === i;
              const repeat = exists(e.name);
              const px = previewEx(e);
              return (
                <div
                  key={i}
                  className={cn(
                    "rounded-2xl border-2 p-3",
                    on ? "border-primary/60" : "opacity-70",
                  )}
                >
                  <div
                    className="flex cursor-pointer items-center gap-3"
                    onClick={() => setOpenIdx(open ? null : i)}
                  >
                    <button
                      aria-label={on ? `Снять выбор: ${e.name}` : `Выбрать: ${e.name}`}
                      aria-pressed={on}
                      onClick={(ev) => {
                        ev.stopPropagation();
                        toggle(i);
                      }}
                      className={cn(
                        "flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-2 text-lg",
                        on
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-muted-foreground/30",
                      )}
                    >
                      {on ? "✓" : ""}
                    </button>
                    <ExerciseThumb ex={px} className="h-12 w-12" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold">{e.name}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {CATEGORIES[px.category]}
                        {e.mode === "time" ? ` · ${px.seconds} с` : ` · ×${px.reps}`}
                        {px.muscles.length
                          ? ` · ${px.muscles.map((m) => MUSCLES[m]).join(", ")}`
                          : ""}
                        {repeat ? " · уже в библиотеке" : ""}
                      </p>
                    </div>
                  </div>
                  {open && (
                    <div className="mt-3 space-y-2">
                      {e.videoUrl ? (
                        <div className="aspect-video overflow-hidden rounded-xl bg-muted">
                          <LinkMedia url={e.videoUrl} controls autoplay={false} muted={false} />
                        </div>
                      ) : (
                        <div className="flex aspect-video items-center justify-center rounded-xl bg-muted p-4 text-center text-sm text-muted-foreground">
                          В статье нет видео для этого упражнения
                        </div>
                      )}
                      {!!e.steps.length && (
                        <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
                          {e.steps.map((s, k) => (
                            <li key={k}>{s}</li>
                          ))}
                        </ol>
                      )}
                      {!!e.mistakes.length && (
                        <p className="text-sm text-muted-foreground">
                          Ошибки: {e.mistakes.join("; ")}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          {naming ? (
            <div className="space-y-2 rounded-2xl border-2 border-primary/40 p-3">
              <input
                autoFocus
                aria-label="Название тренировки"
                className="h-12 w-full rounded-2xl border-2 px-4 outline-none focus:border-primary"
                placeholder="Название тренировки"
                value={workoutName}
                onChange={(e) => setWorkoutName(e.target.value)}
              />
              <div className="flex gap-2">
                <TapButton variant="soft" onClick={() => setNaming(false)}>
                  Назад
                </TapButton>
                <TapButton className="flex-1" disabled={!sel.size} onClick={saveAsWorkout}>
                  Сохранить тренировку{sel.size ? ` (${sel.size})` : ""}
                </TapButton>
              </div>
            </div>
          ) : (
            <div className="flex gap-2">
              <TapButton
                variant="soft"
                onClick={() => {
                  setRes(null);
                  setError(null);
                }}
              >
                Заново
              </TapButton>
              <TapButton className="flex-1" disabled={!sel.size} onClick={addSelected}>
                В библиотеку{sel.size ? ` (${sel.size})` : ""}
              </TapButton>
              <TapButton variant="flame" disabled={!sel.size} onClick={() => setNaming(true)}>
                Как тренировку
              </TapButton>
            </div>
          )}
        </>
      )}
    </div>
  );
}
