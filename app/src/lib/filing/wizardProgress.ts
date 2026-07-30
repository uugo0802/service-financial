// 送信ガイド（e-Tax／eLTAX）ウィザードの進捗状態を管理する純粋なロジック層。
// UIから切り離してテストできるよう、Reactに依存しない状態機械として実装する。
//
// 前提: 各ステップは「本人が実際に操作したことを確認しながら」順番に進める必要があるため、
// まだ解放されていない先のステップへ飛ぶことはできない（完了済み、または解放中のステップにのみ移動可）。
// displayedStep（現在表示中のステップ）と maxUnlockedStep（これまでに到達した最大ステップ）を
// 分けて持つことで、「完了済みステップに戻って見直す」操作をしても解放状態は失われないようにしている。

export interface WizardProgressState {
  displayedStep: number; // 1-indexed。現在画面に表示しているステップ
  completedSteps: number[]; // 完了済みステップ番号（昇順・重複なし）
  maxUnlockedStep: number; // これまでに到達した最大のステップ番号（この番号までは操作・閲覧可能）
}

export function createWizardState(totalSteps: number): WizardProgressState {
  assertValidTotal(totalSteps);
  return { displayedStep: 1, completedSteps: [], maxUnlockedStep: 1 };
}

export function resetWizardState(totalSteps: number): WizardProgressState {
  return createWizardState(totalSteps);
}

/** 指定ステップが解放済み（閲覧・操作可能）かどうか。1未満のステップ番号は常に未解放として扱う */
export function isStepUnlocked(state: WizardProgressState, step: number): boolean {
  return step >= 1 && step <= state.maxUnlockedStep;
}

export function isStepCompleted(state: WizardProgressState, step: number): boolean {
  return state.completedSteps.includes(step);
}

export function isWizardComplete(state: WizardProgressState, totalSteps: number): boolean {
  return state.completedSteps.length >= totalSteps;
}

export function getProgressPercent(state: WizardProgressState, totalSteps: number): number {
  if (totalSteps <= 0) return 0;
  return Math.round((state.completedSteps.length / totalSteps) * 100);
}

/**
 * 解放済みステップを「本人操作で完了した」ものとして記録し、表示を次のステップへ進める。
 * まだ解放されていないステップの完了指定は無視する（状態を変えず返す）。
 */
export function completeStep(state: WizardProgressState, totalSteps: number, step: number): WizardProgressState {
  assertValidTotal(totalSteps);
  if (!isStepUnlocked(state, step)) return state;

  const completedSteps = state.completedSteps.includes(step)
    ? state.completedSteps
    : [...state.completedSteps, step].sort((a, b) => a - b);

  const maxUnlockedStep = Math.min(Math.max(state.maxUnlockedStep, step + 1), totalSteps);
  const displayedStep = Math.min(step + 1, totalSteps);
  return { displayedStep, completedSteps, maxUnlockedStep };
}

/**
 * 完了済み、または解放中のステップへ表示を移動する（後戻り・再確認用）。
 * まだ解放されていない先のステップへは移動できない。
 */
export function goToStep(state: WizardProgressState, step: number): WizardProgressState {
  if (!isStepUnlocked(state, step)) return state;
  return { ...state, displayedStep: step };
}

function assertValidTotal(totalSteps: number) {
  if (!Number.isInteger(totalSteps) || totalSteps < 1) {
    throw new Error(`totalSteps must be a positive integer, got: ${totalSteps}`);
  }
}
