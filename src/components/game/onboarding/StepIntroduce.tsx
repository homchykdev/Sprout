import { Mascot } from "@/components/game/Mascot";

/** Step 1: what this app is about, with the Огонёк mascot. */
export function StepIntroduce() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-5 py-6 text-center">
      <Mascot mood="cheer" size={140} />
      <p className="max-w-sm text-[15px] text-muted-foreground">
        Это твой личный тренажёрный дневник: план тренировок, прогресс, стрик и ИИ, который помогает
        придумывать упражнения и составлять тренировки.
      </p>
      <p className="text-sm text-muted-foreground">
        Дальше 3 коротких шага настройки. Любой можно пропустить.
      </p>
    </div>
  );
}
