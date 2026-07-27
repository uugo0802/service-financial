"use client";

import { useMemo, useState } from "react";
import {
  completeStep,
  createWizardState,
  getProgressPercent,
  goToStep,
  isStepCompleted,
  isStepUnlocked,
  isWizardComplete,
  resetWizardState,
  WizardProgressState,
} from "@/lib/filing/wizardProgress";
import { getSubmissionSteps, SubmissionSystem } from "@/lib/filing/submissionSteps";

// 進捗の状態機械そのもの（src/lib/filing/wizardProgress.ts）はReactに依存しない純粋関数として
// 実装・テスト済み。このhookはそれをコンポーネントから使いやすい形にラップするだけの薄い層。
export function useSubmissionWizard(system: SubmissionSystem) {
  const steps = useMemo(() => getSubmissionSteps(system), [system]);
  const totalSteps = steps.length;
  const [state, setState] = useState<WizardProgressState>(() => createWizardState(totalSteps));

  return {
    steps,
    totalSteps,
    displayedStep: state.displayedStep,
    progressPercent: getProgressPercent(state, totalSteps),
    isComplete: isWizardComplete(state, totalSteps),
    isStepCompleted: (step: number) => isStepCompleted(state, step),
    isStepUnlocked: (step: number) => isStepUnlocked(state, step),
    completeCurrentStep: () => setState((s) => completeStep(s, totalSteps, s.displayedStep)),
    goToStep: (step: number) => setState((s) => goToStep(s, step)),
    reset: () => setState(resetWizardState(totalSteps)),
  };
}
