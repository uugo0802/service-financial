"use client";

import { useState } from "react";
import { useSubmissionWizard } from "@/hooks/useSubmissionWizard";
import { SubmissionSystem, SubmissionStep } from "@/lib/filing/submissionSteps";

const SYSTEM_LABEL: Record<SubmissionSystem, string> = {
  etax: "e-Tax（国税）",
  eltax: "eLTAX（地方税）",
};

export function FilingSubmissionWizard({ system, note }: { system: SubmissionSystem; note?: string }) {
  const wizard = useSubmissionWizard(system);
  const current = wizard.steps.find((s) => s.id === wizard.displayedStep) ?? wizard.steps[0];

  return (
    <div className="border border-stone-300 bg-white p-5">
      <div className="flex items-center justify-between gap-4 mb-1">
        <h3 className="text-sm font-semibold">{SYSTEM_LABEL[system]} 送信ガイド</h3>
        <span className="text-xs text-stone-500 tabular-nums">{wizard.progressPercent}%</span>
      </div>
      <div className="h-1.5 bg-stone-100 rounded-full overflow-hidden mb-4">
        <div
          className="h-full bg-stone-900 transition-all"
          style={{ width: `${wizard.progressPercent}%` }}
          role="progressbar"
          aria-valuenow={wizard.progressPercent}
          aria-valuemin={0}
          aria-valuemax={100}
        />
      </div>

      {note && <p className="text-xs text-amber-700 mb-4 leading-relaxed">{note}</p>}

      <ol className="flex flex-wrap items-center gap-2 mb-5">
        {wizard.steps.map((step) => {
          const completed = wizard.isStepCompleted(step.id);
          const unlocked = wizard.isStepUnlocked(step.id);
          const active = wizard.displayedStep === step.id;
          return (
            <li key={step.id}>
              <button
                type="button"
                disabled={!unlocked}
                onClick={() => wizard.goToStep(step.id)}
                aria-current={active ? "step" : undefined}
                className={`flex items-center gap-2 text-xs px-3 py-1.5 border rounded-full transition-colors ${
                  active
                    ? "border-stone-900 bg-stone-900 text-white"
                    : completed
                      ? "border-emerald-600 text-emerald-700 bg-emerald-50 hover:bg-emerald-100"
                      : unlocked
                        ? "border-stone-400 text-stone-600 hover:border-stone-600"
                        : "border-stone-200 text-stone-300 cursor-not-allowed"
                }`}
              >
                <span
                  className={`w-4 h-4 shrink-0 rounded-full flex items-center justify-center text-[0.65rem] ${
                    active ? "bg-white text-stone-900" : completed ? "bg-emerald-600 text-white" : "bg-stone-200 text-stone-500"
                  }`}
                >
                  {completed ? "✓" : step.id}
                </span>
                {step.title}
              </button>
            </li>
          );
        })}
      </ol>

      {wizard.isComplete ? (
        <div className="border border-emerald-300 bg-emerald-50 p-4">
          <p className="text-sm font-semibold text-emerald-800 mb-1">送信ガイドは以上です</p>
          <p className="text-xs text-emerald-700 leading-relaxed">
            実際の送信操作・受付結果の確認は、{SYSTEM_LABEL[system]}の公式クライアント上でご本人が行った内容が正となります。
            本ガイドはあくまで手順の案内であり、当社が送信を代行するものではありません。
          </p>
          <button
            type="button"
            onClick={wizard.reset}
            className="mt-3 text-xs px-3 py-1.5 border border-emerald-600 text-emerald-700 hover:bg-emerald-100 transition-colors"
          >
            もう一度手順を確認する
          </button>
        </div>
      ) : (
        <StepPanel
          key={current.id}
          step={current}
          totalSteps={wizard.totalSteps}
          onBack={() => wizard.goToStep(current.id - 1)}
          onComplete={wizard.completeCurrentStep}
        />
      )}
    </div>
  );
}

// ステップ番号ごとにkeyでマウントし直すことで、「本人操作を確認しました」チェックが
// ステップ移動のたびに未チェック状態から始まるようにする（前のステップの確認を次のステップへ
// 引き継がせないため）。useEffectでの手動リセットより単純で安全。
function StepPanel({
  step,
  totalSteps,
  onBack,
  onComplete,
}: {
  step: SubmissionStep;
  totalSteps: number;
  onBack: () => void;
  onComplete: () => void;
}) {
  const [acknowledged, setAcknowledged] = useState(false);

  return (
    <div className="border border-stone-200 p-4">
      <div className="flex items-baseline gap-2 mb-2">
        <span className="text-xs text-stone-400">ステップ {step.id} / {totalSteps}</span>
        <h4 className="text-sm font-semibold">{step.title}</h4>
      </div>
      <p className="text-sm text-stone-600 leading-relaxed mb-3">{step.description}</p>
      <div className="bg-amber-50 border border-amber-200 px-3 py-2 mb-4">
        <p className="text-xs text-amber-800 leading-relaxed">
          <span className="font-semibold">本人操作について: </span>
          {step.selfOperationNotice}
        </p>
      </div>

      <label className="flex items-start gap-2 text-xs text-stone-600 mb-4 cursor-pointer">
        <input type="checkbox" className="mt-0.5" checked={acknowledged} onChange={(e) => setAcknowledged(e.target.checked)} />
        上記の内容を理解し、この操作はご本人（またはご本人の権限）で行うことを確認しました。
      </label>

      <div className="flex items-center gap-3">
        <button
          type="button"
          disabled={step.id === 1}
          onClick={onBack}
          className="text-sm px-4 py-2 border border-stone-300 text-stone-500 disabled:opacity-40 disabled:cursor-not-allowed hover:border-stone-500 transition-colors"
        >
          戻る
        </button>
        <button
          type="button"
          disabled={!acknowledged}
          onClick={onComplete}
          className="text-sm px-4 py-2 border border-stone-900 bg-stone-900 text-white disabled:opacity-40 disabled:cursor-not-allowed hover:bg-stone-700 transition-colors"
        >
          確認して次へ進む
        </button>
      </div>
    </div>
  );
}
