import { cn } from "@/lib/utils";

export type Mood = "happy" | "sad" | "fire" | "sleep" | "cheer";

/** "Огонёк" — the streak flame mascot. `power` (0..1) makes it grow with the streak. */
export function Mascot({
  mood = "happy",
  size = 120,
  power = 0.5,
  className,
}: {
  mood?: Mood;
  size?: number;
  power?: number;
  className?: string;
}) {
  const outer =
    mood === "sad" ? "var(--sky)" : mood === "sleep" ? "var(--muted-foreground)" : "var(--flame)";
  const inner =
    mood === "sad" ? "var(--flame-soft)" : mood === "sleep" ? "var(--flame)" : "var(--gold)";
  const scale =
    mood === "sad"
      ? 0.82
      : mood === "sleep"
        ? 0.7
        : 0.9 + Math.min(1, power) * 0.15 + (mood === "fire" || mood === "cheer" ? 0.05 : 0);
  const anim = mood === "sad" ? "animate-wiggle" : mood === "sleep" ? "" : "animate-float";
  return (
    <svg
      viewBox="0 0 120 130"
      width={size}
      height={size * 1.08}
      className={cn(anim, className)}
      aria-label="Огонёк"
    >
      <ellipse cx="60" cy="124" rx="28" ry="5" fill="var(--foreground)" opacity="0.08" />
      <g
        style={{
          transform: `scale(${scale})`,
          transformOrigin: "60px 122px",
          transition: "transform 0.6s var(--ease-spring)",
        }}
      >
        <g
          className={mood === "sleep" ? "" : "animate-flicker"}
          style={{ transformOrigin: "60px 118px" }}
        >
          {/* outer flame */}
          <path
            d="M60 4 C66 24 88 30 96 56 C104 82 92 118 60 118 C28 118 16 84 24 60 C28 48 36 44 38 34 C46 42 48 50 50 54 C50 34 54 18 60 4Z"
            fill={outer}
          />
          {/* inner flame */}
          <path
            d="M60 46 C66 60 82 66 82 86 C82 104 72 112 60 112 C48 112 38 104 38 88 C38 76 46 72 48 64 C52 70 54 74 56 76 C56 64 58 54 60 46Z"
            fill={inner}
          />
        </g>
        {(mood === "fire" || mood === "cheer") && (
          <g fill="var(--gold)">
            <circle cx="18" cy="40" r="3" className="animate-float" />
            <circle
              cx="102"
              cy="32"
              r="2.5"
              className="animate-float"
              style={{ animationDelay: "0.4s" }}
            />
            <circle
              cx="108"
              cy="70"
              r="2"
              className="animate-float"
              style={{ animationDelay: "0.8s" }}
            />
            <circle
              cx="12"
              cy="78"
              r="2"
              className="animate-float"
              style={{ animationDelay: "1.2s" }}
            />
          </g>
        )}
        {/* eyes */}
        {mood === "sleep" ? (
          <>
            <path
              d="M44 84 q6 5 12 0"
              stroke="var(--foreground)"
              strokeWidth="3.5"
              fill="none"
              strokeLinecap="round"
            />
            <path
              d="M64 84 q6 5 12 0"
              stroke="var(--foreground)"
              strokeWidth="3.5"
              fill="none"
              strokeLinecap="round"
            />
            <text x="90" y="44" fontSize="18" fontWeight="800" fill="var(--muted-foreground)">
              z
            </text>
            <text x="100" y="30" fontSize="12" fontWeight="800" fill="var(--muted-foreground)">
              z
            </text>
          </>
        ) : mood === "cheer" ? (
          <>
            <path
              d="M42 84 q7 -9 14 0"
              stroke="var(--foreground)"
              strokeWidth="4.5"
              fill="none"
              strokeLinecap="round"
            />
            <path
              d="M64 84 q7 -9 14 0"
              stroke="var(--foreground)"
              strokeWidth="4.5"
              fill="none"
              strokeLinecap="round"
            />
          </>
        ) : (
          <>
            <ellipse cx="49" cy="82" rx="7.5" ry={mood === "sad" ? 10 : 9} fill="var(--card)" />
            <ellipse cx="71" cy="82" rx="7.5" ry={mood === "sad" ? 10 : 9} fill="var(--card)" />
            <circle
              cx={mood === "sad" ? 49 : 50.5}
              cy={mood === "sad" ? 86 : 83}
              r="4"
              fill="var(--foreground)"
            />
            <circle
              cx={mood === "sad" ? 71 : 72.5}
              cy={mood === "sad" ? 86 : 83}
              r="4"
              fill="var(--foreground)"
            />
            {mood === "fire" && (
              <>
                <path
                  d="M40 70 l14 4"
                  stroke="var(--foreground)"
                  strokeWidth="3.5"
                  strokeLinecap="round"
                />
                <path
                  d="M80 70 l-14 4"
                  stroke="var(--foreground)"
                  strokeWidth="3.5"
                  strokeLinecap="round"
                />
              </>
            )}
            {mood === "sad" && (
              <>
                <path
                  d="M41 70 l12 -4"
                  stroke="var(--foreground)"
                  strokeWidth="3.5"
                  strokeLinecap="round"
                />
                <path
                  d="M79 70 l-12 -4"
                  stroke="var(--foreground)"
                  strokeWidth="3.5"
                  strokeLinecap="round"
                />
                <ellipse cx="42" cy="96" rx="2.5" ry="4" fill="var(--sky-soft)" />
              </>
            )}
          </>
        )}
        {/* mouth */}
        {mood === "sad" ? (
          <path
            d="M53 104 q7 -6 14 0"
            stroke="var(--foreground)"
            strokeWidth="3.5"
            fill="none"
            strokeLinecap="round"
          />
        ) : mood === "sleep" ? (
          <ellipse cx="60" cy="100" rx="3" ry="2.5" fill="var(--foreground)" />
        ) : (
          <path d="M50 96 q10 12 20 0 z" fill="var(--foreground)" />
        )}
        {(mood === "happy" || mood === "cheer" || mood === "fire") && (
          <>
            <circle cx="40" cy="94" r="4" fill="var(--destructive)" opacity="0.25" />
            <circle cx="80" cy="94" r="4" fill="var(--destructive)" opacity="0.25" />
          </>
        )}
      </g>
    </svg>
  );
}
