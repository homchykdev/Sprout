import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Camera, Dumbbell, Layers, Mic } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { CameraStage } from "@/components/game/CameraStage";
import { Mascot } from "@/components/game/Mascot";
import { TapButton } from "@/components/game/TapButton";
import { lastPhotoForPose, saveCaptureSet, type CaptureShot, type MediaItem } from "@/lib/media";
import { CAPTURE_MODES, framesFor, type CaptureMode, type PoseSpec } from "@/lib/pose";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/capture")({
  head: () => ({
    meta: [
      { title: "Съёмка прогресса · Пульс" },
      {
        name: "description",
        content: "Снимай фото прогресса в одинаковых позах: голос подскажет, ИИ проверит кадр.",
      },
    ],
  }),
  component: CapturePage,
});

const MODE_ICONS = { views: Camera, poses: Dumbbell, full: Layers } as const;

const fmtDay = (d: string) =>
  new Date(d + "T00:00").toLocaleDateString("ru", { day: "numeric", month: "long" });

function CapturePage() {
  const nav = useNavigate();
  const [mode, setMode] = useState<CaptureMode>("views");
  const [frames, setFrames] = useState<PoseSpec[] | null>(null);
  const [index, setIndex] = useState(0);
  const [shots, setShots] = useState<CaptureShot[]>([]);
  const [review, setReview] = useState<{ blob: Blob; url: string; spec: PoseSpec } | null>(null);
  const [ghost, setGhost] = useState<MediaItem | undefined>();
  const [saving, setSaving] = useState(false);
  const current = frames?.[index];

  useEffect(() => {
    if (!current) return;
    let on = true;
    setGhost(undefined);
    lastPhotoForPose(current.view, current.strain).then((g) => {
      if (on) setGhost(g);
    });
    return () => {
      on = false;
    };
  }, [current]);

  useEffect(() => {
    if (!review) return;
    return () => URL.revokeObjectURL(review.url);
  }, [review]);

  const exit = () => {
    if (shots.length && !window.confirm("Закрыть съёмку без сохранения кадров?")) return;
    nav({ to: "/gallery" });
  };

  const finish = async (list: CaptureShot[]) => {
    if (!list.length) {
      nav({ to: "/gallery" });
      return;
    }
    setSaving(true);
    try {
      await saveCaptureSet(list);
      toast.success(
        list.length === 1 ? "Кадр сохранён в фото прогресса" : `Сохранено кадров: ${list.length}`,
      );
      nav({ to: "/gallery" });
    } catch {
      toast.error("Не удалось сохранить — возможно, мало места на устройстве");
      setSaving(false);
    }
  };

  const advance = () => {
    if (!review || !frames) return;
    const list = [...shots, { blob: review.blob, spec: review.spec }];
    setReview(null);
    if (index + 1 < frames.length) {
      setShots(list);
      setIndex(index + 1);
    } else {
      setShots(list);
      void finish(list);
    }
  };

  const skip = () => {
    if (!frames) return;
    setReview(null);
    if (index + 1 < frames.length) setIndex(index + 1);
    else void finish(shots);
  };

  if (!frames) {
    return (
      <div className="min-h-[100dvh] bg-background px-5 pb-10 pt-[max(1rem,env(safe-area-inset-top))]">
        <div className="mx-auto max-w-xl space-y-5">
          <div className="flex items-center gap-2">
            <Link
              to="/gallery"
              aria-label="Назад к фото"
              className="press -ml-2 rounded-full p-2 hover:bg-muted"
            >
              <ArrowLeft />
            </Link>
          </div>
          <div className="flex items-center gap-3">
            <Mascot mood="cheer" size={72} />
            <div>
              <h1 className="text-3xl font-extrabold tracking-tight">Съёмка прогресса</h1>
              <p className="text-sm text-muted-foreground">
                Одинаковые позы — честное сравнение через месяц.
              </p>
            </div>
          </div>

          <div className="card-soft space-y-2 p-4">
            <p className="font-bold">Поставь телефон</p>
            <p className="text-sm text-muted-foreground">
              На уровне груди, вертикально, в 2–3 шагах. Свет — спереди, фон — ровный. Дальше я
              подскажу голосом, проверю кадр и сниму сам, когда замрёшь.
            </p>
          </div>

          <div className="space-y-2.5" role="radiogroup" aria-label="Набор кадров">
            {CAPTURE_MODES.map((m) => {
              const Icon = MODE_ICONS[m.id];
              const active = mode === m.id;
              return (
                <button
                  key={m.id}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => setMode(m.id)}
                  className={cn(
                    "press flex w-full items-center gap-3 rounded-2xl border-2 p-4 text-left transition-colors",
                    active ? "border-primary bg-primary-soft" : "bg-card hover:bg-muted",
                  )}
                >
                  <span
                    className={cn(
                      "flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl",
                      active
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground",
                    )}
                  >
                    <Icon className="h-5 w-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-bold">{m.label}</span>
                    <span className="block text-sm text-muted-foreground">{m.hint}</span>
                  </span>
                  <span className="shrink-0 rounded-full bg-card px-2 py-1 text-xs font-bold tabular">
                    {framesFor(m.id).length}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="flex items-start gap-2 rounded-2xl bg-muted p-3 text-sm text-muted-foreground">
            <Mic className="mt-0.5 h-4 w-4 shrink-0" />
            <p>
              Голосовые подсказки берутся из настроек звука. Любой кадр можно пропустить или
              повторить.
            </p>
          </div>

          <TapButton
            className="w-full"
            onClick={() => {
              setShots([]);
              setIndex(0);
              setFrames(framesFor(mode));
            }}
          >
            <Camera className="h-5 w-5" /> Начать съёмку · {framesFor(mode).length} кадр(а)
          </TapButton>
        </div>
      </div>
    );
  }

  if (saving) {
    return (
      <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-3 bg-background px-6 text-center">
        <Mascot mood="cheer" size={90} />
        <p className="font-bold">Сохраняю кадры…</p>
        <p className="text-sm text-muted-foreground">Фото остаются только на этом устройстве.</p>
      </div>
    );
  }

  if (review) {
    const isLast = index + 1 >= frames.length;
    return (
      <div className="flex min-h-[100dvh] flex-col bg-black text-white">
        <header className="flex items-center gap-2 px-4 pt-[max(0.75rem,env(safe-area-inset-top))]">
          <button
            type="button"
            aria-label="Закрыть"
            onClick={exit}
            className="flex h-11 w-11 items-center justify-center rounded-full hover:bg-white/10"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <p className="flex-1 text-center text-sm font-semibold">
            {review.spec.title} · {index + 1} / {frames.length}
          </p>
          <span className="w-11" />
        </header>
        <div className="min-h-0 flex-1 p-3">
          <img
            src={review.url}
            alt={review.spec.title}
            className="mx-auto h-full max-h-full w-auto max-w-full rounded-2xl object-contain"
          />
        </div>
        <div className="flex gap-2 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-2">
          <TapButton
            variant="soft"
            className="flex-1"
            disabled={saving}
            onClick={() => setReview(null)}
          >
            Повторить
          </TapButton>
          <TapButton className="flex-[1.4]" disabled={saving} onClick={advance}>
            {saving ? "Сохраняю…" : isLast ? "Сохранить" : "Далее"}
          </TapButton>
        </div>
        {ghost && (
          <p className="pb-[max(1rem,env(safe-area-inset-bottom))] text-center text-xs text-white/50">
            Для сравнения: {ghost.title || "фото"} от {fmtDay(ghost.date)}
          </p>
        )}
      </div>
    );
  }

  return (
    <CameraStage
      key={current?.id}
      frame={current ?? frames[0]!}
      step={index + 1}
      total={frames.length}
      ghost={ghost}
      onCaptured={(blob) => {
        if (!current) return;
        setReview({ blob, url: URL.createObjectURL(blob), spec: current });
      }}
      onSkip={skip}
      onExit={exit}
    />
  );
}
