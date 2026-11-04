import { useCallback, useEffect, useRef, useState } from "react";
import { App } from "@capacitor/app";
import { Camera, Eye, EyeOff, SkipForward, SwitchCamera, X } from "lucide-react";
import {
  captureJpeg,
  drawCameraFrame,
  getAvailableCameras,
  motionScore,
  sampleGray,
  stopStream,
  cameraConstraints,
  fallbackCameraConstraints,
  preferredCamera,
  shouldRotateCameraFeed,
  type CameraDevice,
  type CameraFacing,
} from "@/lib/capture";
import { useBlobUrl, type MediaItem } from "@/lib/media";
import type { PoseSpec } from "@/lib/pose";
import { createVoiceGuidance, type VoiceGuidance } from "@/lib/voice-guidance";
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
  const previewRef = useRef<HTMLDivElement>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const [model, setModel] = useState<Model>("loading");
  const [status, setStatus] = useState("Включаю камеру…");
  const [tone, setTone] = useState<Tone>("info");
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [ghostOn, setGhostOn] = useState(true);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [facing, setFacing] = useState<CameraFacing>("user");
  const [twoCams, setTwoCams] = useState(false);
  const [cameras, setCameras] = useState<CameraDevice[]>([]);
  const [cameraDeviceId, setCameraDeviceId] = useState<string | undefined>();
  const [activeCameraDeviceId, setActiveCameraDeviceId] = useState<string | undefined>();
  const [rotateFeed, setRotateFeed] = useState(false);
  const cdRef = useRef(false);
  const shotRef = useRef(false);
  const guidanceRef = useRef<VoiceGuidance | null>(null);
  const ghostUrl = useBlobUrl(ghost?.blob);

  const shoot = useCallback(async () => {
    if (shotRef.current) return;
    shotRef.current = true;
    guidanceRef.current?.pause();
    stopSpeech();
    try {
      const blob = await captureJpeg(videoRef.current!, facing === "user", rotateFeed);
      guidanceRef.current?.stop();
      onCaptured(blob);
    } catch {
      shotRef.current = false;
      cdRef.current = false;
      setCountdown(null);
      guidanceRef.current?.resume();
      setError("Не удалось сделать снимок. Попробуй ещё раз.");
    }
  }, [onCaptured, facing, rotateFeed]);

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
    let appPaused = false;
    const isPortrait = window.innerHeight > window.innerWidth;
    let rotatePortraitFeed = false;
    let stream: MediaStream | null = null;
    let raf = 0;
    let landmarker: Awaited<ReturnType<typeof loadPoseLandmarker>> | null = null;
    let modelDone = false;
    const tracker = new StabilityTracker();
    const gray = document.createElement("canvas");
    let prevGray: Uint8ClampedArray | null = null;
    const upright = previewCanvasRef.current ?? document.createElement("canvas");
    let lastDetect = 0;
    let lastDrawnTime = -1;
    let stillSince = 0;
    let lastMotion = 0;
    let lastMsg = "";
    const guidance = createVoiceGuidance((prompt) => speak(prompt, { interrupt: true }), {
      repeatMs: 2_500,
    });
    guidanceRef.current = guidance;
    setModel("loading");
    setError(null);
    setRotateFeed(false);
    // A retry or camera flip must not carry over an armed auto-shutter.
    cdRef.current = false;
    setCountdown(null);

    const say = (msg: string, t: Tone) => {
      if (lastMsg === msg) return;
      lastMsg = msg;
      setStatus(msg);
      setTone(t);
      guidance.update(msg);
    };

    const begin = () => {
      if (cdRef.current || shotRef.current) return;
      cdRef.current = true;
      guidance.pause();
      setCountdown(3);
      speak("Замри. Три, два, один.", { interrupt: true });
    };
    const cancel = () => {
      if (!cdRef.current) return;
      cdRef.current = false;
      setCountdown(null);
      guidance.resume();
    };

    const updateOrientation = () => {
      const bounds = previewRef.current?.getBoundingClientRect();
      const nextRotation = shouldRotateCameraFeed(
        video.videoWidth,
        video.videoHeight,
        bounds?.width ?? window.innerWidth,
        bounds?.height ?? window.innerHeight,
      );
      if (nextRotation !== rotatePortraitFeed) lastDrawnTime = -1;
      rotatePortraitFeed = nextRotation;
      setRotateFeed(rotatePortraitFeed);
    };

    const orientation = screen.orientation;
    const resizeObserver =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(updateOrientation);
    if (previewRef.current) resizeObserver?.observe(previewRef.current);

    const loop = (ts: number) => {
      if (cancelled) return;
      if (video.readyState >= 2) {
        if (video.currentTime !== lastDrawnTime) {
          drawCameraFrame(video, upright, rotatePortraitFeed);
          lastDrawnTime = video.currentTime;
        }
        const source = upright.width && upright.height ? upright : video;
        if (landmarker) {
          if (ts - lastDetect >= 120) {
            lastDetect = ts;
            const points = detectPose(landmarker, source, performance.now());
            const check = analyzePose(points, frame.view, frame.strain);
            const still = points ? tracker.update(points, ts) : 0;
            if (!points) tracker.reset();
            if (check.ok) {
              if (still >= 1200) {
                begin();
                say("Отлично! Не двигайся…", "ok");
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
          const pixels = sampleGray(source, gray);
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
                begin();
                say("Стой неподвижно…", "ok");
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
        const msg = "Браузер не поддерживает камеру. Загрузи фото файлом.";
        say(msg, "warn");
        setError(msg);
        return;
      }
      const modelPromise = loadPoseLandmarker()
        .then((lm) => {
          landmarker = lm;
          if (!cancelled) setModel("ready");
        })
        .catch((error: unknown) => {
          console.error("MediaPipe could not initialize; using motion fallback.", error);
          if (!cancelled) setModel("fallback");
        })
        .finally(() => {
          modelDone = true;
        });
      try {
        try {
          stream = await navigator.mediaDevices.getUserMedia(
            cameraConstraints(facing, cameraDeviceId, isPortrait),
          );
        } catch (error) {
          const name = error instanceof DOMException ? error.name : "";
          if (name !== "OverconstrainedError" && name !== "NotFoundError") throw error;
          console.warn(
            "Preferred camera constraints were unavailable; retrying with basic facing.",
            error,
          );
          stream = await navigator.mediaDevices.getUserMedia(
            fallbackCameraConstraints(facing, isPortrait),
          );
        }
        if (cancelled || appPaused) {
          stopStream(stream);
          return;
        }
        video.addEventListener("loadedmetadata", updateOrientation);
        video.addEventListener("resize", updateOrientation);
        window.addEventListener("resize", updateOrientation);
        window.addEventListener("orientationchange", updateOrientation);
        orientation.addEventListener("change", updateOrientation);
        video.srcObject = stream;
        await video.play();
        updateOrientation();
        const activeId = stream?.getVideoTracks()[0]?.getSettings().deviceId;
        if (activeId) setActiveCameraDeviceId(activeId);
        void getAvailableCameras()
          .then((availableCameras) => {
            if (!cancelled) {
              setCameras(availableCameras);
              setTwoCams(availableCameras.length > 1);
              const selected =
                availableCameras.find((camera) => camera.deviceId === activeId) ??
                preferredCamera(availableCameras, facing);
              if (selected && selected.facing !== "unknown" && selected.facing !== facing)
                setFacing(selected.facing);
            }
          })
          .catch((error: unknown) => console.warn("Could not enumerate cameras.", error));
        if (!cancelled) raf = requestAnimationFrame(loop);
      } catch (e) {
        if (!cancelled) {
          console.error("Could not start camera capture.", e);
          const msg = cameraError(e);
          // Re-prime speech after a camera restart (orientation change, app resume):
          // without a prompt the fresh guidance instance would stay silent forever.
          say(msg, "warn");
          setError(msg);
        }
        return;
      }
      await modelPromise;
    };
    void start();
    let appListener: Awaited<ReturnType<typeof App.addListener>> | undefined;
    void App.addListener("appStateChange", ({ isActive }) => {
      if (!isActive) {
        appPaused = true;
        guidance.pause();
        stopSpeech();
        stopStream(stream);
        stream = null;
        video.srcObject = null;
        cancelAnimationFrame(raf);
      } else if (!cancelled) {
        appPaused = false;
        setAttempt((value) => value + 1);
      }
    })
      .then((listener) => {
        if (cancelled) void listener.remove();
        else appListener = listener;
      })
      .catch((error: unknown) => console.error("Could not observe camera app lifecycle.", error));

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      video.removeEventListener("loadedmetadata", updateOrientation);
      video.removeEventListener("resize", updateOrientation);
      window.removeEventListener("resize", updateOrientation);
      window.removeEventListener("orientationchange", updateOrientation);
      orientation.removeEventListener("change", updateOrientation);
      resizeObserver?.disconnect();
      stopStream(stream);
      void appListener?.remove();
      guidance.stop();
      if (guidanceRef.current === guidance) guidanceRef.current = null;
      stopSpeech();
      if (video) video.srcObject = null;
    };
  }, [frame.view, frame.strain, attempt, facing, cameraDeviceId]);

  return (
    <div className="relative flex h-[100dvh] flex-col bg-black text-white">
      <div ref={previewRef} className="relative min-h-0 flex-1 overflow-hidden">
        <video ref={videoRef} autoPlay playsInline muted className="hidden" />
        <canvas
          ref={previewCanvasRef}
          aria-hidden="true"
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
          aria-label={`Переключить камеру${cameras.length > 0 ? `: ${cameras.find((camera) => camera.deviceId === activeCameraDeviceId)?.label ?? "следующая"}` : " (основная / фронтальная)"}`}
          title={cameras.find((camera) => camera.deviceId === activeCameraDeviceId)?.label}
          disabled={!twoCams}
          onClick={() => {
            if (!cameras.length) {
              setCameraDeviceId(undefined);
              setFacing((current) => (current === "user" ? "environment" : "user"));
              return;
            }
            const currentIndex = cameras.findIndex(
              (camera) => camera.deviceId === activeCameraDeviceId,
            );
            const next = cameras[(currentIndex + 1 + cameras.length) % cameras.length]!;
            setCameraDeviceId(next.deviceId);
            if (next.facing !== "unknown") setFacing(next.facing);
          }}
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
