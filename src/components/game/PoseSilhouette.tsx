import type { PoseView } from "@/lib/pose";
import { cn } from "@/lib/utils";

/** Dashed body outline + safe frame shown over the live camera. */
export function PoseSilhouette({ view, className }: { view: PoseView; className?: string }) {
  const side = view === "side";
  return (
    <svg
      viewBox="0 0 100 160"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.4}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={cn("pointer-events-none absolute inset-0 h-full w-full", className)}
    >
      <rect
        x={6}
        y={4}
        width={88}
        height={152}
        rx={10}
        strokeWidth={1}
        strokeDasharray="2 4"
        opacity={0.35}
      />
      <circle cx={50} cy={17} r={8} strokeDasharray="4 3" />
      <path d="M50 25v4" strokeDasharray="4 3" />
      {side ? (
        <>
          <path d="M50 29c-8 0-11 6-11 14v20c0 7 3 12 7 15l4 3" strokeDasharray="4 3" />
          <path d="M50 29c8 0 10 6 10 14v20c0 7-2 12-6 15l-4 3" strokeDasharray="4 3" />
          <path d="M42 35c-3 8-3 18 0 28" strokeDasharray="4 3" />
          <path d="M46 82v26c0 10-2 20-4 28" strokeDasharray="4 3" />
          <path d="M54 82v26c0 10 2 20 4 28" strokeDasharray="4 3" />
          <path d="M42 136h-8" strokeDasharray="4 3" />
          <path d="M58 136h8" strokeDasharray="4 3" />
        </>
      ) : (
        <>
          <path d="M35 33c-4 10-5 24-5 36" strokeDasharray="4 3" />
          <path d="M65 33c4 10 5 24 5 36" strokeDasharray="4 3" />
          <path d="M30 69l-2 14" strokeDasharray="4 3" />
          <path d="M70 69l2 14" strokeDasharray="4 3" />
          <path d="M50 29v52" strokeDasharray="4 3" />
          <path d="M38 81h24" strokeDasharray="4 3" />
          <path d="M43 81l-4 27-3 28" strokeDasharray="4 3" />
          <path d="M57 81l4 27 3 28" strokeDasharray="4 3" />
          <path d="M36 136H26" strokeDasharray="4 3" />
          <path d="M64 136h10" strokeDasharray="4 3" />
        </>
      )}
      <text
        x={50}
        y={view === "side" ? 114 : 108}
        textAnchor="middle"
        fontSize={5}
        fill="currentColor"
        stroke="none"
        opacity={0.7}
      >
        {view === "front" ? "спереди" : view === "side" ? "сбоку" : "сзади"}
      </text>
    </svg>
  );
}
