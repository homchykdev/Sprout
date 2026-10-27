import type { OnboardingDraft } from "./Onboarding";

/** Shared props for a wizard step. */
export type StepProps = {
  draft: OnboardingDraft;
  update: (fn: (d: OnboardingDraft) => OnboardingDraft) => void;
};
