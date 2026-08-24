"use client";

import { useMemo, useState } from "react";
import { FilingSubmissionWizard, DraftDownload } from "@/components/FilingSubmissionWizard";
import { SubmissionSystem } from "@/lib/filing/submissionSteps";
import { IndividualEstimate } from "@/lib/tax/estimate";
import { CorporateEstimate } from "@/lib/tax/corporateEstimate";
import { buildEtaxDraftCsv } from "@/lib/filing/etaxFileFormat";
import { buildEltaxDraftCsv } from "@/lib/filing/eltaxFileFormat";

const TABS: { key: SubmissionSystem; label: string }[] = [
  { key: "etax", label: "国税（e-Tax）" },
  { key: "eltax", label: "地方税（eLTAX）" },
];

export interface SubmissionGuideProps {
  mode: "individual" | "corp";
  /** ステップ1のダウンロードボタン用の税額概算（個人）。未指定・nullの場合はボタンを表示しない */
  individualEstimate?: IndividualEstimate | null;
  /** ステップ1のダウンロードボタン用の税額概算（法人）。未指定・nullの場合はボタンを表示しない */
  corpEstimate?: CorporateEstimate | null;
  /** 下書きファイルに記載する氏名・法人名（任意。未指定なら空欄で出力される） */
  entityName?: string;
  /** 対象年分（個人）/事業年度末（法人）。未指定の場合は前年（確定申告シーズンの一般的な対象年）を仮定する */
  taxYear?: number;
}

export function SubmissionGuide({ mode, individualEstimate, corpEstimate, entityName, taxYear }: SubmissionGuideProps) {
  const [system, setSystem] = useState<SubmissionSystem>("etax");

  // ステップ1で提供する下書きCSV。個人/法人の税額概算が揃っていない場合（記帳データ未取込等）は
  // ダウンロードボタン自体を出さず、手順の説明のみを表示する。
  const draftDownload: DraftDownload | undefined = useMemo(() => {
    const resolvedTaxYear = taxYear ?? new Date().getFullYear() - 1;
    const buildDraftCsv = system === "etax" ? buildEtaxDraftCsv : buildEltaxDraftCsv;

    if (mode === "individual" && individualEstimate) {
      const csvContent = buildDraftCsv({
        taxpayerKind: "individual",
        estimate: individualEstimate,
        taxYear: resolvedTaxYear,
        taxpayerName: entityName,
      });
      return { csvContent, fileNamePrefix: `${system}-draft-individual` };
    }

    if (mode === "corp" && corpEstimate) {
      const csvContent = buildDraftCsv({
        taxpayerKind: "corporate",
        estimate: corpEstimate,
        taxYear: resolvedTaxYear,
        taxpayerName: entityName,
      });
      return { csvContent, fileNamePrefix: `${system}-draft-corp` };
    }

    return undefined;
  }, [mode, system, individualEstimate, corpEstimate, entityName, taxYear]);

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

      <FilingSubmissionWizard key={system} system={system} draftDownload={draftDownload} />
    </div>
  );
}
