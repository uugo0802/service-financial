"use client";

import { useState } from "react";
import {
  TenantProfileDraft,
  TenantProfileFieldErrors,
  hasTenantProfileErrors,
} from "@/lib/db/tenants";
import {
  completeOnboardingStep,
  createOnboardingWizardState,
  getOnboardingProgressPercent,
  getOnboardingStepFieldErrors,
  goToOnboardingStep,
  isOnboardingComplete,
  isOnboardingStepCompleted,
  isOnboardingStepUnlocked,
  ONBOARDING_STEPS,
  ONBOARDING_TOTAL_STEPS,
  OnboardingStepDefinition,
} from "@/lib/onboarding/steps";

interface OnboardingWizardProps {
  /** 入力の初期値。通常は EMPTY_TENANT_PROFILE_DRAFT を渡す */
  initialDraft: TenantProfileDraft;
  /** 最終確認ステップの完了時に、確定したdraftを渡して呼び出される */
  onComplete: (draft: TenantProfileDraft) => void;
}

const inputClass =
  "w-full border border-stone-400 dark:border-stone-600 bg-white dark:bg-stone-900 px-3 py-2 text-sm outline-none focus:border-stone-600 dark:focus:border-stone-300";
const labelClass = "flex flex-col gap-1 text-xs text-stone-500 dark:text-stone-400";
const errorTextClass = "mt-1 text-xs text-red-700 dark:text-red-400";

const FISCAL_MONTH_OPTIONS = Array.from({ length: 12 }, (_, i) => i + 1);

const ENTITY_TYPE_LABEL: Record<TenantProfileDraft["entityType"], string> = {
  individual: "個人事業主",
  corp: "マイクロ法人",
};

/**
 * 初回設定（オンボーディング）ウィザード。
 * 事業形態・屋号／会社名・決算月・青色申告の承認有無を、1画面の巨大フォームではなく
 * ステップごとに区切って案内する。状態管理そのものは lib/onboarding/steps.ts の
 * 純粋関数に委ね、このコンポーネントは薄いラッパーとして振る舞う
 * （src/components/FilingSubmissionWizard.tsx と同じ設計方針）。
 */
export function OnboardingWizard({ initialDraft, onComplete }: OnboardingWizardProps) {
  const [draft, setDraft] = useState<TenantProfileDraft>(initialDraft);
  const [wizardState, setWizardState] = useState(() => createOnboardingWizardState());
  const [showErrors, setShowErrors] = useState(false);

  const progressPercent = getOnboardingProgressPercent(wizardState);
  const complete = isOnboardingComplete(wizardState);
  const currentStep = wizardState.displayedStep;
  const currentDefinition = ONBOARDING_STEPS[currentStep - 1];
  const currentErrors = getOnboardingStepFieldErrors(draft, currentStep);

  function set<K extends keyof TenantProfileDraft>(key: K, value: TenantProfileDraft[K]) {
    setDraft((prev) => ({ ...prev, [key]: value }));
    setShowErrors(false);
  }

  function handleNext() {
    if (hasTenantProfileErrors(currentErrors)) {
      setShowErrors(true);
      return;
    }
    setShowErrors(false);
    const next = completeOnboardingStep(wizardState, draft, currentStep);
    setWizardState(next);
    if (isOnboardingComplete(next)) {
      onComplete(draft);
    }
  }

  function handleBack() {
    setShowErrors(false);
    setWizardState((s) => goToOnboardingStep(s, currentStep - 1));
  }

  function handleGoToStep(step: number) {
    setShowErrors(false);
    setWizardState((s) => goToOnboardingStep(s, step));
  }

  return (
    <div className="border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-900 p-5">
      <div className="flex items-center justify-between gap-4 mb-1">
        <h3 className="text-sm font-semibold">初回設定ウィザード</h3>
        <span className="text-xs text-stone-500 dark:text-stone-400 tabular-nums">{progressPercent}%</span>
      </div>
      <div className="h-1.5 bg-stone-100 dark:bg-stone-800 rounded-full overflow-hidden mb-4">
        <div
          className="h-full bg-stone-900 dark:bg-stone-100 transition-all"
          style={{ width: `${progressPercent}%` }}
          role="progressbar"
          aria-valuenow={progressPercent}
          aria-valuemin={0}
          aria-valuemax={100}
        />
      </div>

      <ol className="flex flex-wrap items-center gap-2 mb-5">
        {ONBOARDING_STEPS.map((step, index) => {
          const stepNumber = index + 1;
          const stepCompleted = isOnboardingStepCompleted(wizardState, stepNumber);
          const unlocked = isOnboardingStepUnlocked(wizardState, stepNumber);
          const active = currentStep === stepNumber;
          return (
            <li key={step.id}>
              <button
                type="button"
                disabled={!unlocked}
                onClick={() => handleGoToStep(stepNumber)}
                aria-current={active ? "step" : undefined}
                className={`flex items-center gap-2 text-xs px-3 py-1.5 border rounded-full transition-colors ${
                  active
                    ? "border-stone-900 bg-stone-900 text-white dark:border-stone-100 dark:bg-stone-100 dark:text-stone-900"
                    : stepCompleted
                      ? "border-emerald-600 text-emerald-700 bg-emerald-50 hover:bg-emerald-100 dark:border-emerald-500 dark:text-emerald-400 dark:bg-emerald-950"
                      : unlocked
                        ? "border-stone-400 text-stone-600 hover:border-stone-600 dark:border-stone-600 dark:text-stone-300"
                        : "border-stone-200 text-stone-300 cursor-not-allowed dark:border-stone-800 dark:text-stone-700"
                }`}
              >
                <span
                  className={`w-4 h-4 shrink-0 rounded-full flex items-center justify-center text-[0.65rem] ${
                    active
                      ? "bg-white text-stone-900 dark:bg-stone-900 dark:text-stone-100"
                      : stepCompleted
                        ? "bg-emerald-600 text-white"
                        : "bg-stone-200 text-stone-500 dark:bg-stone-700 dark:text-stone-300"
                  }`}
                >
                  {stepCompleted ? "✓" : stepNumber}
                </span>
                {step.titleJa}
              </button>
            </li>
          );
        })}
      </ol>

      {complete ? (
        <div className="border border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-950 p-4">
          <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-300 mb-1">初回設定が完了しました</p>
          <p className="text-xs text-emerald-700 dark:text-emerald-400 leading-relaxed">
            入力いただいた内容は、記帳や税額の概算シミュレーション・申告書の下書き作成の前提条件として利用されます。
            内容はいつでも事業者設定画面から変更できます。
          </p>
        </div>
      ) : (
        <StepPanel
          definition={currentDefinition}
          stepNumber={currentStep}
          draft={draft}
          errors={showErrors ? currentErrors : {}}
          onChange={set}
          onBack={handleBack}
          onNext={handleNext}
        />
      )}
    </div>
  );
}

function StepPanel({
  definition,
  stepNumber,
  draft,
  errors,
  onChange,
  onBack,
  onNext,
}: {
  definition: OnboardingStepDefinition;
  stepNumber: number;
  draft: TenantProfileDraft;
  errors: TenantProfileFieldErrors;
  onChange: <K extends keyof TenantProfileDraft>(key: K, value: TenantProfileDraft[K]) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const isLastStep = stepNumber === ONBOARDING_TOTAL_STEPS;

  return (
    <div className="border border-stone-200 dark:border-stone-700 p-4">
      <div className="flex items-baseline gap-2 mb-2">
        <span className="text-xs text-stone-400 dark:text-stone-500">
          ステップ {stepNumber} / {ONBOARDING_TOTAL_STEPS}
        </span>
        <h4 className="text-sm font-semibold">{definition.titleJa}</h4>
      </div>
      <p className="text-sm text-stone-600 dark:text-stone-300 leading-relaxed mb-4">{definition.descriptionJa}</p>

      <div className="mb-4">
        {definition.id === "entityType" && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <label className={labelClass}>
              事業形態
              <select
                value={draft.entityType}
                onChange={(e) => onChange("entityType", e.target.value as TenantProfileDraft["entityType"])}
                className={inputClass}
              >
                {Object.entries(ENTITY_TYPE_LABEL).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>

            <label className={labelClass}>
              屋号・会社名
              <input
                type="text"
                placeholder="例: 今ごえん合同会社"
                value={draft.displayName}
                onChange={(e) => onChange("displayName", e.target.value)}
                className={inputClass}
              />
              {errors.displayName && <span className={errorTextClass}>{errors.displayName}</span>}
            </label>
          </div>
        )}

        {definition.id === "fiscalYear" &&
          (draft.entityType === "corp" ? (
            <label className={labelClass}>
              決算月
              <select
                value={draft.fiscalYearEndMonth}
                onChange={(e) => onChange("fiscalYearEndMonth", e.target.value)}
                className={`${inputClass} max-w-xs`}
              >
                <option value="">選択してください</option>
                {FISCAL_MONTH_OPTIONS.map((month) => (
                  <option key={month} value={month}>
                    {month}月
                  </option>
                ))}
              </select>
              {errors.fiscalYearEndMonth && <span className={errorTextClass}>{errors.fiscalYearEndMonth}</span>}
            </label>
          ) : (
            <p className="text-xs text-stone-500 dark:text-stone-400 bg-stone-50 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 px-3 py-2">
              個人事業主は暦年（1月〜12月）で確定するため、決算月の設定は不要です。
            </p>
          ))}

        {definition.id === "blueReturn" && (
          <label className="flex items-start gap-2 text-sm text-stone-700 dark:text-stone-200">
            <input
              type="checkbox"
              checked={draft.blueReturn}
              onChange={(e) => onChange("blueReturn", e.target.checked)}
              className="mt-0.5"
            />
            <span>
              青色申告の承認を受けている
              <span className="block text-xs text-stone-400 dark:text-stone-500 mt-0.5">
                税額の概算シミュレーションにおける青色申告特別控除の適用有無に反映されます。
                実際の税務署への届出・承認状況と異なる場合は、必ずご自身でご確認のうえ変更してください。
              </span>
            </span>
          </label>
        )}

        {definition.id === "review" && (
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
            <ReviewItem label="事業形態" value={ENTITY_TYPE_LABEL[draft.entityType]} />
            <ReviewItem label="屋号・会社名" value={draft.displayName || "（未入力）"} />
            <ReviewItem
              label="決算月"
              value={draft.entityType === "corp" ? (draft.fiscalYearEndMonth ? `${draft.fiscalYearEndMonth}月` : "（未入力）") : "暦年（設定不要）"}
            />
            <ReviewItem label="青色申告" value={draft.blueReturn ? "承認あり" : "承認なし（白色申告）"} />
          </dl>
        )}
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          disabled={stepNumber === 1}
          onClick={onBack}
          className="text-sm px-4 py-2 border border-stone-300 dark:border-stone-600 text-stone-500 dark:text-stone-400 disabled:opacity-40 disabled:cursor-not-allowed hover:border-stone-500 dark:hover:border-stone-400 transition-colors"
        >
          戻る
        </button>
        <button
          type="button"
          onClick={onNext}
          className="text-sm px-4 py-2 border border-stone-900 bg-stone-900 text-white dark:border-stone-100 dark:bg-stone-100 dark:text-stone-900 hover:bg-stone-700 dark:hover:bg-stone-300 transition-colors"
        >
          {isLastStep ? "設定を確定する" : "次へ"}
        </button>
      </div>
    </div>
  );
}

function ReviewItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-stone-400 dark:text-stone-500">{label}</dt>
      <dd className="text-stone-800 dark:text-stone-100">{value}</dd>
    </div>
  );
}
