// 初回設定（オンボーディング）ウィザードのステップ定義と進捗管理を行う純粋なロジック層。
// UIから切り離してテストできるよう、Reactに依存しない状態機械として実装する
// （lib/filing/wizardProgress.ts の e-Tax送信ガイドウィザードと同じ設計方針を踏襲）。
//
// バリデーション自体は lib/db/tenants.ts の validateTenantProfileDraft を単一の情報源とし、
// ここではその結果をステップごとに絞り込むだけで、ロジックを重複させない。
//
// 前提: wizardProgress.ts と同様、「本人が実際に入力したことを確認しながら」順番に進める必要があるため、
// まだ解放されていない先のステップへ飛ぶことはできない（完了済み、または解放中のステップにのみ移動可）。
// 現在ステップ（displayedStep）と到達済み最大ステップ（maxUnlockedStep）を分けて持つことで、
// 「完了済みステップに戻って見直す」操作をしても解放状態は失われないようにしている。

import {
  hasTenantProfileErrors,
  TenantProfileDraft,
  TenantProfileFieldErrors,
  validateTenantProfileDraft,
} from "../db/tenants";

export type OnboardingStepId = "displayName" | "fiscalYear" | "blueReturn" | "review";

export interface OnboardingStepDefinition {
  id: OnboardingStepId;
  titleJa: string;
  descriptionJa: string;
  /** このステップで入力・確定させる TenantProfileDraft のフィールド */
  fields: readonly (keyof TenantProfileDraft)[];
}

/**
 * オンボーディングウィザードのステップ順序（1-indexedで扱う。配列添字は0-indexed）。
 * ステップ1: 屋号・会社名
 * ステップ2: 決算月
 * ステップ3: 青色申告の承認有無
 * ステップ4: 内容確認・確定
 *
 * 事業形態（entityType）の選択ステップは撤去した。本サービスは現状マイクロ法人向けに
 * 一本化しており、entityTypeは常に"corp"固定（docs/superpowers/specs/
 * 2026-08-30-nav-slimdown-and-entity-simplify-design.md ⑤参照）。
 */
export const ONBOARDING_STEPS: readonly OnboardingStepDefinition[] = [
  {
    id: "displayName",
    titleJa: "屋号・会社名",
    descriptionJa: "屋号・会社名を入力してください。",
    fields: ["displayName"],
  },
  {
    id: "fiscalYear",
    titleJa: "決算月",
    descriptionJa: "決算月を入力してください。",
    fields: ["fiscalYearEndMonth"],
  },
  {
    id: "blueReturn",
    titleJa: "青色申告",
    descriptionJa: "青色申告の承認を受けているかどうかを選択してください。",
    fields: ["blueReturn"],
  },
  {
    id: "review",
    titleJa: "内容確認",
    descriptionJa: "入力内容を確認し、事業者設定として確定してください。",
    fields: [],
  },
] as const;

export const ONBOARDING_TOTAL_STEPS = ONBOARDING_STEPS.length;

/** 1-indexedのステップ番号からステップ定義を取得する。範囲外はundefined */
export function getOnboardingStepDefinition(step: number): OnboardingStepDefinition | undefined {
  return ONBOARDING_STEPS[step - 1];
}

// validateTenantProfileDraft が返しうるフィールドエラーのキー一覧。
// ステップごとの絞り込みに使うだけで、バリデーション判定そのものはここでは行わない。
const FIELD_ERROR_KEYS = ["displayName", "fiscalYearEndMonth"] as const satisfies readonly (keyof TenantProfileFieldErrors)[];

/**
 * 指定ステップに関連するフィールドエラーのみを返す。
 * 最終確認ステップ（review）は個別フィールドを持たないため、draft全体のエラーをそのまま返す
 * （＝ここで全ステップの入力内容が有効であることを最終ゲートとして確認する）。
 */
export function getOnboardingStepFieldErrors(draft: TenantProfileDraft, step: number): TenantProfileFieldErrors {
  const definition = getOnboardingStepDefinition(step);
  if (!definition) return {};

  const allErrors = validateTenantProfileDraft(draft);

  if (definition.id === "review") {
    return allErrors;
  }

  const errors: TenantProfileFieldErrors = {};
  for (const key of FIELD_ERROR_KEYS) {
    if (definition.fields.includes(key) && allErrors[key]) {
      errors[key] = allErrors[key];
    }
  }
  return errors;
}

/** 指定ステップの必須項目が現時点で有効か（エラーがないか）を返す */
export function isOnboardingStepValid(draft: TenantProfileDraft, step: number): boolean {
  return !hasTenantProfileErrors(getOnboardingStepFieldErrors(draft, step));
}

export interface OnboardingWizardState {
  displayedStep: number; // 1-indexed。現在画面に表示しているステップ
  completedSteps: number[]; // 完了済みステップ番号（昇順・重複なし）
  maxUnlockedStep: number; // これまでに到達した最大のステップ番号（この番号までは操作・閲覧可能）
}

export function createOnboardingWizardState(): OnboardingWizardState {
  return { displayedStep: 1, completedSteps: [], maxUnlockedStep: 1 };
}

export function resetOnboardingWizardState(): OnboardingWizardState {
  return createOnboardingWizardState();
}

/** 指定ステップが解放済み（閲覧・操作可能）かどうか。1未満のステップ番号は常に未解放として扱う */
export function isOnboardingStepUnlocked(state: OnboardingWizardState, step: number): boolean {
  return step >= 1 && step <= state.maxUnlockedStep;
}

export function isOnboardingStepCompleted(state: OnboardingWizardState, step: number): boolean {
  return state.completedSteps.includes(step);
}

export function isOnboardingComplete(state: OnboardingWizardState): boolean {
  return state.completedSteps.length >= ONBOARDING_TOTAL_STEPS;
}

export function getOnboardingProgressPercent(state: OnboardingWizardState): number {
  if (ONBOARDING_TOTAL_STEPS <= 0) return 0;
  return Math.round((state.completedSteps.length / ONBOARDING_TOTAL_STEPS) * 100);
}

/**
 * 解放済み・かつ現時点の入力内容が有効なステップを「完了した」ものとして記録し、
 * 表示を次のステップへ進める。
 * まだ解放されていないステップ、または当該ステップの必須項目が未入力・不正な場合は
 * 何もせず状態をそのまま返す（＝次のステップへは進ませない）。
 */
export function completeOnboardingStep(
  state: OnboardingWizardState,
  draft: TenantProfileDraft,
  step: number,
): OnboardingWizardState {
  if (!isOnboardingStepUnlocked(state, step)) return state;
  if (!isOnboardingStepValid(draft, step)) return state;

  const completedSteps = state.completedSteps.includes(step)
    ? state.completedSteps
    : [...state.completedSteps, step].sort((a, b) => a - b);

  const maxUnlockedStep = Math.min(Math.max(state.maxUnlockedStep, step + 1), ONBOARDING_TOTAL_STEPS);
  const displayedStep = Math.min(step + 1, ONBOARDING_TOTAL_STEPS);
  return { displayedStep, completedSteps, maxUnlockedStep };
}

/** 現在表示中のステップを完了させ、次のステップへ進める（completeOnboardingStepの薄いラッパー） */
export function completeCurrentOnboardingStep(
  state: OnboardingWizardState,
  draft: TenantProfileDraft,
): OnboardingWizardState {
  return completeOnboardingStep(state, draft, state.displayedStep);
}

/**
 * 完了済み、または解放中のステップへ表示を移動する（後戻り・再確認用）。
 * まだ解放されていない先のステップへは移動できない。
 */
export function goToOnboardingStep(state: OnboardingWizardState, step: number): OnboardingWizardState {
  if (!isOnboardingStepUnlocked(state, step)) return state;
  return { ...state, displayedStep: step };
}
