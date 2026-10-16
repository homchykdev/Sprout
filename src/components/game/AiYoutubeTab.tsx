import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { TapButton } from "./TapButton";
import { ExerciseThumb } from "./ExerciseThumb";
import { LinkMedia } from "./LinkMedia";
import { aiSplitYoutube, buildWorkoutFromSplit, type SplitWorkout } from "@/lib/clients";
import { fmtTime, parseLink } from "@/lib/embed";
import { useApp } from "@/lib/store";
import { CATEGORIES, MUSCLES } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * "Разобрать YouTube-видео" tab: pastes a workout video link, Gemini splits it
 * into exercises with clips on the same video, user picks what to import —
 * either as separate exercises or as one ready workout.
 */
export function AiYoutubeTab({ onClose }: { onClose: () => void }) {
  const nav = useNavigate();
  const isGemini = useApp((s) => s.ai.provider === "gemini");
  const hasKeys = useApp((s) => s.ai.keys.length > 0);
  const upsertExercise = useApp((s) => s.upsertExercise);
  const upsertWorkout = useApp((s) => s.upsertWorkout);
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [res, setRes] = useState<SplitWorkout | null>(null);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [openId, setOpenId] = useState<string | null>(null);
  const [naming, setNaming] = useState(false);
  const [workoutName, setWorkoutName] = useState("Комплекс с YouTube");

  const link = parseLink(url);
  const yt = link?.type === "youtube" ? link : null;

  if (!isGemini) {
    return (
      <p className="rounded-2xl bg-muted p-4 text-sm text-muted-foreground">
        Разбор видео работает только с провайдером Gemini — переключите его в настройках. У
        OpenAI-совместимых API нет анализа видео по ссылке.
      </p>
    );
  }

  const analyze = async () => {
    if (!yt || busy) return;
    setBusy(true);
    setError(null);
    try {
      const split = await aiSplitYoutube(url.trim());
      setRes(split);
      setSel(new Set(split.exercises.map((e) => e.id)));
      setOpenId(null);
      setNaming(false);
      if (!split.exercises.length) setError("В видео не найдено упражнений.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const toggle = (id: string) =>
    setSel((p) => {
      const n = new Set(p);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const selected = () => (res?.exercises ?? []).filter((e) => sel.has(e.id));

  const addSelected = () => {
    const list = selected();
    list.forEach(upsertExercise);
    toast.success(list.length === 1 ? "Упражнение добавлено" : `Добавлено: ${list.length}`);
    onClose();
  };

  const saveAsWorkout = () => {
    if (!res) return;
    const list = selected();
    list.forEach(upsertExercise);
    const w = buildWorkoutFromSplit(
      res,
      list.map((e) => e.id),
      workoutName,
    );
    upsertWorkout(w);
    onClose();
    toast.success(`Тренировка «${w.name}» сохранена`, {
      action: { label: "Открыть", onClick: () => nav({ to: "/plans" }) },
    });
  };

  return (
    <div className="space-y-3">
      {!res && (
        <>
          <input
            className="h-12 w-full rounded-2xl border-2 px-4 outline-none focus:border-primary"
            placeholder="Ссылка на YouTube, напр. https://www.youtube.com/watch?v=…"
            value={url}
            onChange={(e) => {
              setUrl(e.target.value);
              setError(null);
            }}
            inputMode="url"
          />
          {yt && (
            <div className="aspect-video overflow-hidden rounded-2xl bg-muted">
              <LinkMedia url={url.trim()} controls autoplay={false} />
            </div>
          )}
          {url.trim() && !yt && (
            <p className="text-sm text-destructive">Это не похоже на ссылку YouTube.</p>
          )}
          <TapButton className="w-full" disabled={!yt || busy || !hasKeys} onClick={analyze}>
            {busy ? "Смотрю видео…" : "Разобрать на упражнения"}
          </TapButton>
          {busy && (
            <div className="space-y-2" aria-live="polite">
              <div className="space-y-2">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="h-16 animate-pulse rounded-2xl bg-muted" />
                ))}
              </div>
              <p className="text-sm text-muted-foreground">
                Модель смотрит ролик целиком — это занимает до минуты. Экспериментальная функция
                Google, таймкоды приблизительные.
              </p>
            </div>
          )}
          {!hasKeys && (
            <p className="text-sm text-muted-foreground">Сначала добавьте ИИ-ключ в настройках.</p>
          )}
        </>
      )}

      {error && (
        <div className="space-y-2 rounded-2xl border-2 border-destructive/40 p-4">
          <p className="text-sm font-semibold">Не получилось разобрать видео</p>
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

      {res && res.exercises.length > 0 && (
        <>
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold">
              Найдено: {res.exercises.length}. Выбрано: {sel.size}
            </p>
            <button
              className="text-sm font-semibold text-primary"
              onClick={() =>
                setSel(
                  sel.size === res.exercises.length
                    ? new Set()
                    : new Set(res.exercises.map((e) => e.id)),
                )
              }
            >
              {sel.size === res.exercises.length ? "Снять все" : "Выбрать все"}
            </button>
          </div>
          <div className="space-y-2">
            {res.exercises.map((e) => {
              const on = sel.has(e.id);
              const open = openId === e.id;
              return (
                <div
                  key={e.id}
                  className={cn(
                    "rounded-2xl border-2 p-3",
                    on ? "border-primary/60" : "opacity-70",
                  )}
                >
                  <div
                    className="flex cursor-pointer items-center gap-3"
                    onClick={() => setOpenId(open ? null : e.id)}
                  >
                    <button
                      aria-label={on ? `Снять выбор: ${e.name}` : `Выбрать: ${e.name}`}
                      aria-pressed={on}
                      onClick={(ev) => {
                        ev.stopPropagation();
                        toggle(e.id);
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
                    <ExerciseThumb ex={e} className="h-12 w-12" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold">{e.name}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {e.clips?.length
                          ? `${e.clips.map((c) => `${fmtTime(c.start)}–${fmtTime(c.end)}`).join(", ")} · `
                          : ""}
                        {CATEGORIES[e.category]} · {e.muscles.map((m) => MUSCLES[m]).join(", ")}
                        {(res.sets[e.id] ?? 1) > 1 ? ` · ×${res.sets[e.id]}` : ""}
                        {e.bpm ? ` · ♩${e.bpm}` : ""}
                      </p>
                    </div>
                  </div>
                  {open && (
                    <div className="mt-3 space-y-2">
                      <div className="aspect-video overflow-hidden rounded-xl bg-muted">
                        <LinkMedia
                          url={e.videoUrl!}
                          clips={e.clips}
                          controls
                          autoplay={false}
                          muted={false}
                        />
                      </div>
                      {!!e.steps.length && (
                        <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
                          {e.steps.map((s, i) => (
                            <li key={i}>{s}</li>
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
