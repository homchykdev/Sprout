import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, Eye, EyeOff, SkipForward, SwitchCamera, X } from "lucide-react";
import {
  captureJpeg,
  motionScore,
  sampleGray,
  stopStream,
  cameraConstraints,
  type CameraFacing,
} from "@/lib/capture";
import { useBlobUrl, type MediaItem } from "@/lib/media";
import type { PoseSpec } from "@/lib/pose";
import {
  analyzePose,
  detectPose,
  loadPoseLandmarker,
  POSE_MESSAGES,
  StabilityTracker,
} from "@/lib/pose-vision";
import { beep, speak, stopSpeech } from "@/lib/voice";
import { cn } from "@/lib/utils";
import { PoseSilhouette } from "./PoseSilhouette";

type Model = "loading" | "ready" | "fallback";
type Tone = "info" | "warn" | "ok";

interface Props {
  frame: PoseSpec;
  step: number;
  total: number;
  ghost?: MediaItem | undefined;
  onCaptured: (blob: Blob) => void;
  onSkip: () => void;
  onExit: () => void;
}

/** Live camera with MediaPipe pose checks, voice guidance and auto shutter (fallback: stillness). */
export function CameraStage({ frame, step, total, ghost, onCaptured, onSkip, onExit }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [model, setModel] = useState<Model>("loading");
  const [status, setStatus] = useState("Включаю камеру…");
  const [tone, setTone] = useState<Tone>("info");
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [ghostOn, setGhostOn] = useState(true);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [facing, setFacing] = useState<CameraFacing>("user");
  const [twoCams, setTwoCams] = useState(false);
  const cdRef = useRef(false);
  const shotRef = useRef(false);
  const ghostUrl = useBlobUrl(ghost?.blob);

  const shoot = useCallback(async () => {
    if (shotRef.current) return;
    shotRef.current = true;
    try {
      const blob = await captureJpeg(videoRef.current!, facing === "user");
      onCaptured(blob);
    } catch {
      shotRef.current = false;
      cdRef.current = false;
      setCountdown(null);
      setError("Не удалось сделать снимок. Попробуй ещё раз.");
    }
  }, [onCaptured, facing]);

  useEffect(() => {
    speak(frame.instruction.join(" "), { interrupt: true });
    return () => stopSpeech();
  }, [frame.id, frame.instruction]);

  // Desktop convenience: Esc closes the shoot without touching the shutter.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onExit();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onExit]);

  useEffect(() => {
    if (countdown == null) return;
    if (countdown === 0) {
      void shoot();
      return;
    }
    beep("tick");
    const t = setTimeout(() => setCountdown((c) => (c == null ? null : c - 1)), 750);
    return () => clearTimeout(t);
  }, [countdown, shoot]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    let cancelled = false;
    let stream: MediaStream | null = null;
    let raf = 0;
    let landmarker: Awaited<ReturnType<typeof loadPoseLandmarker>> | null = null;
    let modelDone = false;
    const tracker = new StabilityTracker();
    const gray = document.createElement("canvas");
    let prevGray: Uint8ClampedArray | null = null;
    let lastDetect = 0;
    let stillSince = 0;
    let lastMotion = 0;
    let lastMsg = "";
    setModel("loading");
    setError(null);
    // A retry or camera flip must not carry over an armed auto-shutter.
    cdRef.current = false;
    setCountdown(null);

    const say = (msg: string, t: Tone) => {
      if (lastMsg === msg) return;
      lastMsg = msg;
      setStatus(msg);
      setTone(t);
    };

    const begin = () => {
      if (cdRef.current || shotRef.current) return;
      cdRef.current = true;
      setCountdown(3);
      speak("Замри. Три, два, один.", { interrupt: true });
    };
    const cancel = () => {
      if (!cdRef.current) return;
      cdRef.current = false;
      setCountdown(null);
    };

    const loop = (ts: number) => {
      if (cancelled) return;
      if (video.readyState >= 2) {
        if (landmarker) {
          if (ts - lastDetect >= 120) {
            lastDetect = ts;
            const points = detectPose(landmarker, video, performance.now());
            const check = analyzePose(points, frame.view, frame.strain);
            const still = points ? tracker.update(points, ts) : 0;
            if (!points) tracker.reset();
            if (check.ok) {
              if (still >= 1200) {
                say("Отлично! Не двигайся…", "ok");
                begin();
              } else {
                say("Стой неподвижно…", "warn");
                cancel();
              }
            } else {
              say(POSE_MESSAGES[check.problems[0]!]!, "warn");
              cancel();
            }
          }
        } else if (modelDone) {
          const pixels = sampleGray(video, gray);
          if (pixels) {
            let light = 0;
            for (let i = 0; i < pixels.length; i += 32) light += pixels[i]!;
            const brightness = light / (pixels.length / 32);
            if (prevGray) {
              const motion = motionScore(prevGray, pixels);
              if (motion > 0.02) lastMotion = ts;
              if (brightness < 35) {
                say("Слишком темно — включи свет", "warn");
                stillSince = ts;
              } else if (motion > 0.01) {
                say("Встань в контур и замри", "warn");
                stillSince = ts;
              } else if (lastMotion && ts - stillSince >= 1200 && ts - lastMotion < 15000) {
                say("Стой неподвижно…", "ok");
                begin();
              }
            }
            prevGray = pixels;
          }
        }
      }
      raf = requestAnimationFrame(loop);
    };

    const start = async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setError("Браузер не поддерживает камеру. Загрузи фото файлом.");
        return;
      }
      const modelPromise = loadPoseLandmarker()
        .then((lm) => {
          landmarker = lm;
          if (!cancelled) setModel("ready");
        })
        .catch(() => {
          if (!cancelled) setModel("fallback");
        })
        .finally(() => {
          modelDone = true;
        });
      try {
        stream = await navigator.mediaDevices.getUserMedia(cameraConstraints("user"));
        if (cancelled) {
          stopStream(stream);
          return;
        }
        video.srcObject = stream;
        await video.play().catch(() => {});
        // More than one video input → the flip button is worth showing.
        navigator.mediaDevices
          .enumerateDevices()
          .then((ds) => {
            if (!cancelled) setTwoCams(ds.filter((d) => d.kind === "videoinput").length > 1);
          })
          .catch(() => {});
        if (!cancelled) raf = requestAnimationFrame(loop);
      } catch (e) {
        if (!cancelled) setError(cameraError(e));
        return;
      }
      await modelPromise;
    };
    void start();

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      stopStream(stream);
      stopSpeech();
      if (video) video.srcObject = null;
    };
  }, [frame.view, frame.strain, attempt, facing]);

  return (
    <div className="relative flex h-[100dvh] flex-col bg-black text-white">
      <div className="relative min-h-0 flex-1 overflow-hidden">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className={cn(
            "absolute inset-0 h-full w-full object-contain",
            facing === "user" && "scale-x-[-1]",
          )}
        />
        {ghostUrl && ghostOn && (
          <img
            src={ghostUrl}
            alt=""
            aria-hidden
            className="pointer-events-none absolute inset-0 h-full w-full object-contain opacity-30"
          />
        )}
        <PoseSilhouette view={frame.view} className="text-white/50" />

        <div className="absolute inset-x-0 top-0 z-10 flex items-start gap-2 bg-gradient-to-b from-black/70 to-transparent px-3 pb-8 pt-[max(0.75rem,env(safe-area-inset-top))]">
          <button
            type="button"
            aria-label="Закрыть съёмку"
            onClick={onExit}
            className="flex h-12 w-12 items-center justify-center rounded-full border border-white/15 bg-black/50 backdrop-blur hover:bg-black/70 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white/40"
          >
            <X className="h-5 w-5" />
          </button>
          <div className="min-w-0 flex-1 text-center">
            <p className="truncate text-sm font-bold">{frame.title}</p>
            <p className="text-xs text-white/70 tabular">
              Кадр {step} из {total}
            </p>
          </div>
          <span className="rounded-full bg-black/40 px-2.5 py-1.5 text-[11px] font-semibold text-white/80 backdrop-blur">
            {model === "ready"
              ? "ИИ-контроль"
              : model === "loading"
                ? "Загрузка ИИ…"
                : "Ручной режим"}
          </span>
        </div>

        {countdown != null && (
          <span
            aria-hidden
            className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center text-[112px] font-extrabold leading-none text-white drop-shadow-[0_4px_24px_rgba(0,0,0,0.55)]"
          >
            {countdown === 0 ? "!" : countdown}
          </span>
        )}

        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-4 pb-4 pt-12">
          <p
            role="status"
            aria-live="polite"
            className={cn(
              "mx-auto max-w-sm rounded-2xl px-3 py-2 text-center text-sm font-semibold backdrop-blur",
              tone === "ok" && "bg-primary/90 text-primary-foreground",
              tone === "warn" && "bg-white/15 text-white",
              tone === "info" && "bg-white/10 text-white/80",
            )}
          >
            {status}
          </p>
        </div>

        {error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-black/90 p-6 pt-24 text-center">
            <p className="max-w-sm text-sm text-white/80">{error}</p>
            <button
              type="button"
              onClick={() => setAttempt((a) => a + 1)}
              className="h-12 rounded-2xl bg-white px-5 font-semibold text-black"
            >
              Попробовать снова
            </button>
            <button
              type="button"
              onClick={onExit}
              className="h-11 rounded-2xl bg-white/10 px-5 text-sm font-semibold text-white underline-offset-4 hover:bg-white/20 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white/40 focus-visible:underline"
            >
              Выйти из съёмки
            </button>
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
        <button
          type="button"
          aria-label="Переключить камеру (основная / фронтальная)"
          disabled={!twoCams}
          onClick={() => setFacing((f) => (f === "user" ? "environment" : "user"))}
          className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10 text-white/80 disabled:opacity-30"
        >
          <SwitchCamera className="h-5 w-5" />
        </button>
        <button
          type="button"
          aria-label={ghostOn ? "Скрыть прошлое фото" : "Показать прошлое фото"}
          aria-pressed={ghostOn}
          disabled={!ghostUrl}
          onClick={() => setGhostOn((v) => !v)}
          className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10 text-white/80 disabled:opacity-30"
        >
          {ghostOn ? <Eye className="h-5 w-5" /> : <EyeOff className="h-5 w-5" />}
        </button>
        <button
          type="button"
          onClick={() => void shoot()}
          className="flex h-14 flex-1 items-center justify-center gap-2 rounded-2xl bg-white text-base font-bold text-black active:scale-[0.99]"
        >
          <Camera className="h-5 w-5" /> Снять
        </button>
        <button
          type="button"
          aria-label="Пропустить кадр"
          onClick={onSkip}
          className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10 text-white/80"
        >
          <SkipForward className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
}

function cameraError(e: unknown): string {
  const name = e instanceof DOMException ? e.name : "";
  if (name === "NotAllowedError" || name === "SecurityError")
    return "Доступ к камере запрещён. Разреши камеру в настройках браузера и попробуй снова.";
  if (name === "NotFoundError" || name === "OverconstrainedError")
    return "Камера не найдена. Можно загрузить фото файлом.";
  if (name === "NotReadableError")
    return "Камера занята другим приложением. Закрой его и попробуй снова.";
  return "Не удалось включить камеру. Проверь разрешение и HTTPS.";
}
