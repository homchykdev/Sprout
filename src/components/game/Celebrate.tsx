import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

const COLORS = ["var(--primary)", "var(--flame)", "var(--gold)", "var(--sky)"];

/** Full animation life: max delay (0.79s) + fall (2.8s) + margin. */
const LIFE_MS = 3700;

const reducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/**
 * Confetti overlay above ALL interface (`fixed inset-0 z-[200]`,
 * `pointer-events-none` so taps pass through). Unmounts itself ~3.7s
 * after mount — once the last piece has faded at the bottom — so it
 * never keeps the compositor busy. Renders nothing on reduced motion.
 */
export function ConfettiOverlay({ count = 48 }: { count?: number }) {
  const [done, setDone] = useState(false);
  const [mounted, setMounted] = useState(false);
  const pieces = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        left: (i * 97) % 100,
        delay: ((i * 37) % 80) / 100,
        color: COLORS[i % COLORS.length]!,
        size: 6 + ((i * 13) % 8),
        spin: i % 2 === 0 ? 720 : -720,
      })),
    [count],
  );
  useEffect(() => {
    setMounted(true);
    const t = setTimeout(() => setDone(true), LIFE_MS);
    return () => clearTimeout(t);
  }, []);
  if (done || !mounted || reducedMotion()) return null;
  // Portal out of <main class="animate-rise">: its permanent
  // translateY(0) transform would otherwise trap `fixed` inside the tab.
  return createPortal(
    <div className="pointer-events-none fixed inset-0 z-[200] overflow-hidden" aria-hidden>
      {pieces.map((p, i) => (
        <span
          key={i}
          className="animate-confetti absolute top-0 rounded-sm"
          style={{
            left: `${p.left}%`,
            width: p.size,
            height: p.size * 1.6,
            background: p.color,
            animationDelay: `${p.delay}s`,
            ["--spin" as string]: `${p.spin}deg`,
          }}
        />
      ))}
    </div>,
    document.body,
  );
}

/** Legacy API: shows the overlay once while `show` is true. */
export function Celebrate({ show }: { show: boolean }) {
  if (!show) return null;
  return <ConfettiOverlay />;
}
