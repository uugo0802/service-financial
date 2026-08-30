import { PageContainer } from "@/components/ui/PageContainer";
import type { Metadata } from "next";
import { buildYearArchive, YearlyFilingRecord } from "@/lib/tax/yearArchive";
import { YearArchiveTable } from "@/components/YearArchiveTable";
import { YearCloseControl } from "@/components/YearCloseControl";
import { PageTitle } from "@/components/ui/PageTitle";

export const metadata: Metadata = {
  title: "過去の記帳・申告アーカイブ｜決算書作成から税務申告までワンクリック（スグル）",
  description: "年度ごとの記帳・申告実績を一覧で振り返るアーカイブ画面（開発中プロトタイプ）。",
};

// このページ専用のサンプルデータ。ダッシュボード側（app/src/app/dashboard/sampleData.ts）とは
// あえて切り離し、このアーカイブ機能単体で完結させている。
// 「今ごえん合同会社」を想定した、資産管理・コンサルティングフィー中心の小規模法人の
// 複数年分の記帳・概算申告データ（金額はいずれもサンプル）。2022年分はあえて欠落させ、
// アーカイブ側の「記録の途切れ」表示を確認できるようにしている。
const SAMPLE_FILING_HISTORY: YearlyFilingRecord[] = [
  {
    fiscalYear: 2020,
    revenue: 2_400_000,
    expenses: 1_100_000,
    estimatedTax: 180_000,
    filedAt: "2021-05-20",
  },
  {
    fiscalYear: 2021,
    revenue: 2_650_000,
    expenses: 1_250_000,
    estimatedTax: 210_000,
    filedAt: "2022-05-18",
  },
  // 2022年分は記録なし（例: 他の会計ソフトを使っていた年度、という想定）
  {
    fiscalYear: 2023,
    revenue: 3_050_000,
    expenses: 1_400_000,
    estimatedTax: 260_000,
    filedAt: "2024-05-24",
  },
  {
    fiscalYear: 2024,
    revenue: 3_300_000,
    expenses: 1_500_000,
    estimatedTax: 290_000,
    filedAt: "2025-05-22",
  },
  {
    fiscalYear: 2025,
    revenue: 3_180_000,
    expenses: 1_620_000,
    estimatedTax: 250_000,
    filedAt: "2026-05-25",
  },
];

export default function HistoryPage() {
  const archive = buildYearArchive(SAMPLE_FILING_HISTORY);

  return (
    <div className="bg-background text-foreground min-h-screen">
      <header className="border-b border-border bg-surface">
        <div className="px-6 py-4 flex justify-end">
          <PageTitle />
        </div>
      </header>

      <PageContainer as="main" maxWidth="4xl" className="flex flex-col gap-8">
        <div className="flex flex-col gap-2">
          <h1 className="font-serif text-2xl sm:text-3xl">過去の記帳・申告アーカイブ</h1>
          <p className="text-muted-foreground text-sm leading-relaxed max-w-2xl">
            これまでに記録された年度ごとの記帳・概算申告データを一覧で振り返ることができます。
            年を重ねるほど、ここに積み上がる記録があなた自身の経営の「履歴書」になります。
          </p>
        </div>

        <YearArchiveTable archive={archive} />

        <div className="flex flex-col gap-3">
          <h2 className="font-serif text-lg">年度の確定・ロック</h2>
          <p className="text-muted-foreground text-xs leading-relaxed max-w-2xl">
            申告が完了した年度は「確定（ロック）」することで、その年度に属する仕訳の編集・削除を防止できます
            （電子帳簿保存法が求める「訂正・削除ができないシステムでの保存」への対応）。ロック解除には理由の入力が必要です。
          </p>
          <div className="flex flex-col gap-2">
            {archive.entries.map((e) => (
              <YearCloseControl key={e.fiscalYear} fiscalYear={e.fiscalYear} />
            ))}
          </div>
        </div>
      </PageContainer>

      <footer className="border-t border-border bg-surface mt-4">
        <div className="mx-auto max-w-4xl px-6 py-8 text-xs text-muted-foreground leading-relaxed">
          本ページは開発中のプロトタイプであり、税理士法に定める税務代理・税務書類の作成・税務相談を提供するものではありません。
          表示される金額は記帳データに基づく概算シミュレーションです。個別具体的な税務相談が必要な場合は、税理士等の専門家にご相談ください。
        </div>
      </footer>
    </div>
  );
}
