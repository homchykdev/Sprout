import { useState } from "react";
import { X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { TapButton } from "@/components/game/TapButton";
import type { AiSettings } from "@/lib/types";
import { useApp } from "@/lib/store";
import { cn } from "@/lib/utils";
import { StepAiKey } from "./StepAiKey";
import { StepAvatar } from "./StepAvatar";
import { StepDone } from "./StepDone";
import { StepIntroduce } from "./StepIntroduce";
import { StepName } from "./StepName";

/** Data the wizard edits locally, committed to the store on finish or exit. */
export interface OnboardingDraft {
  name: string;
  ai: AiSettings;
  /** Key typed but not yet added to `ai.keys`. */
  keyDraft: string;
}

const STEPS = [
  { title: "Привет!", component: StepIntroduce },
  { title: "Как тебя зовут?", component: StepName },
  { title: "Фото профиля", component: StepAvatar },
  { title: "ИИ-помощник", component: StepAiKey },
  { title: "Готово!", component: StepDone },
] as const;

function newDraft(): OnboardingDraft {
  const s = useApp.getState();
  return { name: s.name, ai: { ...s.ai, keys: [...s.ai.keys] }, keyDraft: "" };
}

/** Full-screen welcome wizard, shown once on first launch. */
export function Onboarding() {
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<OnboardingDraft>(newDraft);
  const [confirmExit, setConfirmExit] = useState(false);

  /** Persists the collected data once and never opens the wizard again. */
  const finish = () => {
    const s = useApp.getState();
    const keys = [...s.ai.keys];
    const k = draft.keyDraft.trim();
    if (k.length >= 4 && !keys.includes(k)) keys.push(k);
    s.set({
      name: draft.name.trim(),
      ai: { ...draft.ai, keys },
      onboarded: true,
    });
  };

  const back = () => setStep((v) => Math.max(0, v - 1));
  const next = () => setStep((v) => Math.min(STEPS.length - 1, v + 1));
  const last = step === STEPS.length - 1;
  const Step = STEPS[step]!.component;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      {/* top bar: progress dots + exit */}
      <header className="relative flex items-center justify-center gap-3 px-5 pb-1 pt-5">
        <div className="flex items-center gap-2" aria-label={`Шаг ${step + 1} из ${STEPS.length}`}>
          {STEPS.map((_, i) => (
            <span
              key={i}
              aria-hidden
              className={cn(
                "h-2 rounded-full transition-all duration-300",
                i === step ? "w-6 bg-primary" : "w-2 bg-muted-foreground/30",
              )}
            />
          ))}
        </div>
        <button
          aria-label="Выйти из настройки"
          className="press absolute right-4 top-4 z-10 flex h-10 w-10 items-center justify-center rounded-full text-muted-foreground hover:bg-muted"
          onClick={() => setConfirmExit(true)}
        >
          <X className="h-5 w-5" />
        </button>
      </header>

      {/* step content */}
      <main
        key={step}
        className="animate-rise mx-auto flex w-full max-w-xl flex-1 flex-col overflow-y-auto px-5 pt-2"
      >
        <h1 className="text-center text-2xl font-extrabold tracking-tight">{STEPS[step]!.title}</h1>
        <Step draft={draft} update={setDraft} />
      </main>

      {/* navigation */}
      <footer className="mx-auto w-full max-w-xl px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
        <div className="flex items-center gap-2">
          {step > 0 && (
            <TapButton variant="ghost" size="md" onClick={back}>
              Назад
            </TapButton>
          )}
          {!last && (
            <TapButton variant="ghost" size="md" onClick={next} className={cn("mr-0 ml-auto", step === 0 && "hidden")}>
              Пропустить
            </TapButton>
          )}
          <TapButton
            size="md"
            onClick={last ? finish : next}
            className={cn("whitespace-nowrap", last || step === 0 ? "w-full" : "ml-auto")}
          >
            {step === 0 || last ? "Начать" : "Дальше"}
          </TapButton>
        </div>
      </footer>

      <Dialog open={confirmExit} onOpenChange={setConfirmExit}>
        <DialogContent className="max-h-[85vh] overflow-y-auto rounded-3xl">
          <DialogHeader>
            <DialogTitle>Выйти из настройки?</DialogTitle>
            <DialogDescription>
              Введённые данные будут сохранены, а ты сможешь всё донастроить позже в разделе
              «Настройки».
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <TapButton
              variant="soft"
              size="sm"
              className="min-h-[44px]"
              onClick={() => setConfirmExit(false)}
            >
              Продолжить настройку
            </TapButton>
            <TapButton size="sm" className="min-h-[44px]" onClick={finish}>
              Выйти и сохраниться
            </TapButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
