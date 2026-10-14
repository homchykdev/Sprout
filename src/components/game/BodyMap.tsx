import Model, { type IExerciseData, type Muscle } from "react-body-highlighter";
import { useState } from "react";
import { heatLevel } from "@/lib/game";
import { MUSCLES, type MuscleKey } from "@/lib/types";

const COLORS = ["var(--heat-1)", "var(--heat-2)", "var(--heat-3)", "var(--heat-4)"];

export function BodyMap({ load }: { load: Record<MuscleKey, number> }) {
  const [picked, setPicked] = useState<MuscleKey | null>(null);
  // One entry per muscle; library frequency = heat level (1..4) -> color index.
  const data: IExerciseData[] = (Object.keys(load) as MuscleKey[])
    .filter((m) => heatLevel(load[m]) > 0)
    .map((m) => ({ name: m, muscles: [m as Muscle], frequency: heatLevel(load[m]) }));
  const onClick = ({ muscle }: { muscle: Muscle }) => setPicked(muscle in MUSCLES ? (muscle as MuscleKey) : null);
  const svgStyle = { cursor: "pointer" };
  return (
    <div>
      <div className="grid grid-cols-2 gap-4">
        {(["anterior", "posterior"] as const).map((t) => (
          <div key={t} className="flex flex-col items-center gap-2">
            <Model type={t} data={data} bodyColor="var(--heat-0)" highlightedColors={COLORS} onClick={onClick} style={{ width: "100%", maxWidth: 170 }} svgStyle={svgStyle} />
            <span className="text-xs font-medium text-muted-foreground">{t === "anterior" ? "Спереди" : "Сзади"}</span>
          </div>
        ))}
      </div>
      <div className="mt-3 min-h-6 text-center text-sm">
        {picked ? (
          <span className="animate-pop inline-block rounded-full bg-muted px-3 py-1 font-semibold">
            {MUSCLES[picked]} · {Math.round(load[picked])} подх.
          </span>
        ) : (
          <span className="text-muted-foreground">Нажми на мышцу, чтобы увидеть нагрузку</span>
        )}
      </div>
      <div className="mt-3 flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground">
        <span>Отдых</span>
        {[0, 1, 2, 3, 4].map((l) => (
          <span key={l} className="h-2.5 w-6 rounded-full" style={{ background: `var(--heat-${l})` }} />
        ))}
        <span>Макс.</span>
      </div>
    </div>
  );
}
