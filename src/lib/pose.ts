/** Guided progress-photo poses: three views × relaxed/flexed. */

export type PoseView = "front" | "side" | "back";
export type PoseStrain = "relaxed" | "flexed";

/**
 * views — с разных сторон (3 relaxed shots),
 * poses — в специальных позах (3 flexed shots),
 * full  — и то и то (6 shots).
 */
export type CaptureMode = "views" | "poses" | "full";

export interface PoseFrame {
  view: PoseView;
  strain: PoseStrain;
}

export interface PoseSpec extends PoseFrame {
  id: string;
  label: string;
  title: string;
  /** Spoken step by step before the shot. */
  instruction: string[];
}

export const VIEW_LABEL: Record<PoseView, string> = {
  front: "Спереди",
  side: "Сбоку",
  back: "Сзади",
};

export const STRAIN_LABEL: Record<PoseStrain, string> = {
  relaxed: "Расслабленно",
  flexed: "С напряжением",
};

export const CAPTURE_MODES: {
  id: CaptureMode;
  label: string;
  hint: string;
}[] = [
  { id: "views", label: "С разных сторон", hint: "3 кадра: спереди, сбоку, сзади" },
  { id: "poses", label: "В специальных позах", hint: "3 кадра с напряжением мышц" },
  { id: "full", label: "Полная", hint: "6 кадров: три стороны расслабленно и с напряжением" },
];

const VIEW_STEPS: Record<PoseView, string[]> = {
  front: [
    "Встань напротив камеры.",
    "Ноги на ширине плеч, стопы параллельно.",
    "Руки чуть в стороны, ладони к телу.",
    "Смотри прямо.",
  ],
  side: [
    "Повернись к камере правым боком.",
    "Руки свободно вдоль тела.",
    "Взгляд вперёд, подбородок параллельно полу.",
  ],
  back: [
    "Повернись спиной к камере.",
    "Ноги на ширине плеч, пятки на одной линии.",
    "Руки чуть в стороны.",
  ],
};

const FLEX_STEPS: Record<PoseView, string[]> = {
  front: ["Напряги руки, плечи и пресс.", "Локти чуть в стороны, кулаки сжаты."],
  side: ["Напряги руку и пресс.", "Плечо не поднимай, корпус ровно."],
  back: ["Сведи лопатки, напряги спину и руки.", "Локти чуть в стороны."],
};

const frameId = (view: PoseView, strain: PoseStrain) => `${view}-${strain}`;

export function poseSpec(view: PoseView, strain: PoseStrain): PoseSpec {
  const base = VIEW_STEPS[view];
  return {
    id: frameId(view, strain),
    view,
    strain,
    label: VIEW_LABEL[view],
    title: strain === "flexed" ? `${VIEW_LABEL[view]} · напряжение` : VIEW_LABEL[view],
    instruction: strain === "flexed" ? [...base, ...FLEX_STEPS[view]] : base,
  };
}

export function framesFor(mode: CaptureMode): PoseSpec[] {
  const views: PoseView[] = ["front", "side", "back"];
  if (mode === "views") return views.map((v) => poseSpec(v, "relaxed"));
  if (mode === "poses") return views.map((v) => poseSpec(v, "flexed"));
  return [
    ...views.map((v) => poseSpec(v, "relaxed")),
    ...views.map((v) => poseSpec(v, "flexed")),
  ];
}

/** Keeps the last frame on screen for the «призрак» overlay. */
export function samePose(a: PoseFrame, b: PoseFrame): boolean {
  return a.view === b.view && a.strain === b.strain;
}

export const isPoseView = (v: unknown): v is PoseView =>
  v === "front" || v === "side" || v === "back";

export const isPoseStrain = (v: unknown): v is PoseStrain =>
  v === "relaxed" || v === "flexed";
