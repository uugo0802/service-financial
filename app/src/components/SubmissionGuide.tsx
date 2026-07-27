"use client";

import { useState } from "react";
import { FilingSubmissionWizard } from "@/components/FilingSubmissionWizard";
import { SubmissionSystem } from "@/lib/filing/submissionSteps";

const TABS: { key: SubmissionSystem; label: string }[] = [
  { key: "etax", label: "国税（e-Tax）" },
  { key: "eltax", label: "地方税（eLTAX）" },
];

export function SubmissionGuide({ mode }: { mode: "individual" | "corp" }) {
  const [system, setSystem] = useState<SubmissionSystem>("etax");

  return (
    <div>
      <p className="text-sm text-stone-600 leading-relaxed max-w-2xl mb-4">
        e-Tax・eLTAXへの最終送信は、常にご本人の認証・操作で行っていただきます（当社が代理送信することはありません）。
        下記は、当社が作成した下書きデータを実際に送信するまでの手順ガイドです。
      </p>

      <div className="flex gap-2 mb-4 flex-wrap">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setSystem(t.key)}
            className={`text-sm px-4 py-2 border transition-colors ${
              system === t.key
                ? "bg-stone-900 border-stone-900 text-white"
                : "bg-white border-stone-400 text-stone-600 hover:border-stone-600"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {mode === "individual" && system === "eltax" && (
        <p className="text-xs text-amber-700 mb-4 leading-relaxed max-w-2xl">
          個人の住民税・事業税は、通常は確定申告書のデータが税務署から自治体へ送付されるため、別途eLTAXでの申告は不要な場合がほとんどです。
          給与所得との合算や事業税の申告が別途必要なケース等、ご自身の状況で必要と判断した場合にのみ以下の手順をご利用ください。
        </p>
      )}

      <FilingSubmissionWizard key={system} system={system} />
    </div>
  );
}
