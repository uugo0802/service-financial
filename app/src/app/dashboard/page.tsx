"use client";

import { Fragment, ReactNode, useMemo } from "react";
import Link from "next/link";
import { buildMonthlyTrend, buildYearlyTrend, TrendPoint } from "@/lib/tax/salesTrend";
import { buildExpenseBreakdown } from "@/lib/tax/expenseBreakdown";
import { buildKpiTrend } from "@/lib/tax/kpiTrend";
import { TrendLineChart } from "@/components/dashboard/TrendLineChart";
import { TrendBarChart } from "@/components/dashboard/TrendBarChart";
import { ExpenseBreakdownChart } from "@/components/dashboard/ExpenseBreakdownChart";
import { KpiTrendPanel } from "@/components/dashboard/KpiTrendPanel";
import { BenchmarkPanel } from "@/components/dashboard/BenchmarkPanel";
import { StatTile } from "@/components/dashboard/StatTile";
import { TaggingWidget } from "@/components/dashboard/TaggingWidget";
import { BudgetSummaryWidget } from "@/components/dashboard/BudgetSummaryWidget";
import { useDashboardWidgetLayout } from "@/hooks/useDashboardWidgetLayout";
import { DashboardWidgetId } from "@/lib/dashboard/widgetLayout";
import { PartnerReferralBanner } from "@/components/PartnerReferralBanner";
import { recommendPartnerCategories } from "@/lib/partnerReferral/partnerReferral";
import { CategorizedTransaction } from "@/lib/categorize/engine";
import { Card } from "@/components/ui/Card";
import { PageContainer } from "@/components/ui/PageContainer";
import { useLedgerTransactions } from "@/hooks/useLedgerTransactions";
import { buildSampleTransactions } from "./sampleData";

// buildSampleTransactions() は売上・損益推移グラフ用に「経費合計」1科目へ
// まとめた経費しか持たないため、経費内訳（カテゴリ別）チャートのサンプル表示用に
// 直近1年分を想定した科目別のダミー経費行をここに追加する（sampleData.tsは
// 他チャートと共有のため変更しない）。
const SAMPLE_EXPENSE_CATEGORY_ROWS: CategorizedTransaction[] = [
  { id: "cat-rent", date: "2026-06-05", description: "サンプル: 事務所家賃", amount: -180000, account: "地代家賃", taxCategory: "課税仕入10%", confidence: 1, source: "rule" },
  { id: "cat-outsourcing", date: "2026-06-10", description: "サンプル: 外注デザイン費", amount: -260000, account: "外注費", taxCategory: "課税仕入10%", confidence: 1, source: "rule" },
  { id: "cat-travel", date: "2026-06-12", description: "サンプル: 客先訪問交通費", amount: -45000, account: "旅費交通費", taxCategory: "課税仕入10%", confidence: 1, source: "rule" },
  { id: "cat-comm", date: "2026-06-15", description: "サンプル: 通信費（回線・電話）", amount: -32000, account: "通信費", taxCategory: "課税仕入10%", confidence: 1, source: "rule" },
  { id: "cat-supplies", date: "2026-06-18", description: "サンプル: 消耗品購入", amount: -21000, account: "消耗品費", taxCategory: "課税仕入10%", confidence: 1, source: "rule" },
  { id: "cat-entertain", date: "2026-06-20", description: "サンプル: 取引先との会食", amount: -38000, account: "接待交際費", taxCategory: "課税仕入10%", confidence: 1, source: "rule" },
  { id: "cat-utilities", date: "2026-06-22", description: "サンプル: 水道光熱費", amount: -14000, account: "水道光熱費", taxCategory: "課税仕入10%", confidence: 1, source: "rule" },
  { id: "cat-books", date: "2026-06-25", description: "サンプル: 専門書籍購入", amount: -9000, account: "新聞図書費", taxCategory: "課税仕入10%", confidence: 1, source: "rule" },
  { id: "cat-misc-1", date: "2026-06-27", description: "サンプル: 振込手数料", amount: -2200, account: "支払手数料", taxCategory: "課税仕入10%", confidence: 1, source: "rule" },
  { id: "cat-misc-2", date: "2026-06-28", description: "サンプル: 会費", amount: -3000, account: "諸会費", taxCategory: "課税仕入10%", confidence: 1, source: "rule" },
];

function sumOf(points: TrendPoint[], field: keyof Omit<TrendPoint, "key">): number {
  return points.reduce((s, p) => s + p[field], 0);
}

function percentDelta(current: number, previous: number): number | undefined {
  if (previous === 0) return undefined;
  return ((current - previous) / Math.abs(previous)) * 100;
}

export default function DashboardPage() {
  const sampleTransactions = useMemo(() => buildSampleTransactions(), []);
  const { transactions, isSampleData } = useLedgerTransactions(sampleTransactions);
  const monthlyTrend = useMemo(() => buildMonthlyTrend(transactions), [transactions]);
  const yearlyTrend = useMemo(() => buildYearlyTrend(transactions), [transactions]);
  const partnerCategories = useMemo(() => recommendPartnerCategories(yearlyTrend), [yearlyTrend]);
  // SAMPLE_EXPENSE_CATEGORY_ROWSはbuildSampleTransactions()専用の補完データ（上記コメント参照）。
  // 実データ（isSampleData === false）はjournal_entries由来の科目別行をすでに持っているため、
  // ダミー行を混ぜると経費内訳チャートが不正確になる。サンプル表示中のみ補完する。
  const transactionsWithExpenseCategories = useMemo(
    () => (isSampleData ? [...transactions, ...SAMPLE_EXPENSE_CATEGORY_ROWS] : transactions),
    [transactions, isSampleData]
  );
  const expenseBreakdown = useMemo(
    () => buildExpenseBreakdown(transactionsWithExpenseCategories),
    [transactionsWithExpenseCategories]
  );
  const kpiTrend = useMemo(() => buildKpiTrend(yearlyTrend), [yearlyTrend]);
  const { layout: widgetLayout } = useDashboardWidgetLayout();

  if (yearlyTrend.length === 0) {
    return (
      <div className="bg-background text-foreground min-h-screen">
        <header className="border-b border-border bg-surface">
          <div className="mx-auto max-w-5xl px-6 py-4 flex items-baseline justify-between">
            <div className="font-sans text-lg tracking-wide">
              決算書作成から税務申告までワンクリック <span className="text-danger">／</span> スグル
            </div>
            <div className="text-xs text-muted-foreground">売上・損益ダッシュボード</div>
          </div>
        </header>
        <PageContainer as="main">
          <p className="text-sm text-muted-foreground">
            表示できる記帳データがありません。記帳データが登録されると、ここに売上・損益の推移が表示されます。
          </p>
        </PageContainer>
      </div>
    );
  }

  const currentYear = yearlyTrend[yearlyTrend.length - 1];
  const priorFullYear = yearlyTrend.length >= 2 ? yearlyTrend[yearlyTrend.length - 2] : null;
  const twoYearsAgo = yearlyTrend.length >= 3 ? yearlyTrend[yearlyTrend.length - 3] : null;

  // 今期(直近年)はデータが年途中までしかないため、前年の「同じ月数分」だけを切り出して比較する
  const monthsInCurrentYear = monthlyTrend.filter((p) => p.key.startsWith(currentYear.key)).length;
  const samePeriodPriorYear = priorFullYear
    ? monthlyTrend.filter((p) => p.key.startsWith(priorFullYear.key)).slice(0, monthsInCurrentYear)
    : [];
  const samePeriodIncome = sumOf(samePeriodPriorYear, "income");
  const samePeriodProfit = sumOf(samePeriodPriorYear, "profit");

  // 各ウィジェットIDに対応する実際の描画内容。並び順・表示/非表示は
  // widgetLayout（useDashboardWidgetLayout、localStorageに永続化）が決める。
  const widgetSections: Record<DashboardWidgetId, ReactNode> = {
    statTiles: (
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatTile
          label={`今期の売上（${currentYear.key}年 1〜${monthsInCurrentYear}月）`}
          value={sumOf(monthlyTrend.filter((p) => p.key.startsWith(currentYear.key)), "income")}
          deltaPercent={percentDelta(currentYear.income, samePeriodIncome)}
        />
        <StatTile
          label={`今期の損益（${currentYear.key}年 1〜${monthsInCurrentYear}月）`}
          value={currentYear.profit}
          deltaPercent={percentDelta(currentYear.profit, samePeriodProfit)}
        />
        {priorFullYear && (
          <StatTile
            label={`${priorFullYear.key}年 年間売上`}
            value={priorFullYear.income}
            deltaPercent={twoYearsAgo ? percentDelta(priorFullYear.income, twoYearsAgo.income) : undefined}
          />
        )}
        {priorFullYear && (
          <StatTile
            label={`${priorFullYear.key}年 年間損益`}
            value={priorFullYear.profit}
            deltaPercent={twoYearsAgo ? percentDelta(priorFullYear.profit, twoYearsAgo.profit) : undefined}
          />
        )}
      </section>
    ),
    trendLine: (
      <Card className="p-5">
        <TrendLineChart points={monthlyTrend} title="月次 売上・経費・損益の推移" />
      </Card>
    ),
    trendBar: (
      <Card className="p-5">
        <TrendBarChart points={yearlyTrend} title="年度別 売上・経費・損益" />
      </Card>
    ),
    kpiTrend: (
      <Card className="p-5">
        <KpiTrendPanel points={kpiTrend} title="年度別 経営指標（売上・経費率・前年比成長率）" />
      </Card>
    ),
    expenseBreakdown: (
      <Card className="p-5">
        <ExpenseBreakdownChart breakdown={expenseBreakdown} title="経費内訳（勘定科目別）" />
      </Card>
    ),
    benchmark: (
      <Card className="p-5">
        <BenchmarkPanel rows={transactionsWithExpenseCategories} title="経費構成の参考比較（対売上比）" />
      </Card>
    ),
    tagging: (
      <Card className="p-5">
        <TaggingWidget transactions={transactions} />
      </Card>
    ),
    budgetSummary: (
      <Card className="p-5">
        <BudgetSummaryWidget transactions={transactions} />
      </Card>
    ),
  };

  return (
    <div className="bg-background text-foreground min-h-screen">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto max-w-5xl px-6 py-4 flex items-baseline justify-between">
          <div className="font-sans text-lg tracking-wide">
            決算書作成から税務申告までワンクリック <span className="text-danger">／</span> スグル
          </div>
          <div className="text-xs text-muted-foreground">売上・損益ダッシュボード</div>
        </div>
      </header>

      <PageContainer as="main" className="flex flex-col gap-10">
        <section>
          <h1 className="text-2xl font-semibold mb-2">過去の売上・損益の推移</h1>
          <p className="text-sm text-muted-foreground max-w-2xl leading-relaxed">
            年度別・月次の売上と損益の推移をグラフで確認できます。
            {isSampleData ? (
              <>
                <b className="font-medium"> 現時点ではサンプルデータを表示しています。</b>
                記帳データが登録されると、自動的に実際のデータへ切り替わります。
              </>
            ) : (
              " 記帳された実データ（当期・過去の取引）に基づいて表示しています。"
            )}
            {" "}
            ウィジェットの表示・並び替えは
            <Link href="/settings/appearance" className="text-accent underline underline-offset-2 hover:opacity-80">
              表示設定
            </Link>
            で変更できます。
          </p>
        </section>

        {widgetLayout
          .filter((entry) => entry.visible)
          .map((entry) => (
            <Fragment key={entry.id}>{widgetSections[entry.id]}</Fragment>
          ))}

        <PartnerReferralBanner categories={partnerCategories} />

        <p className="text-xs text-muted-foreground leading-relaxed">
          {isSampleData
            ? "表示している金額はサンプルデータに基づく概算であり、実際の申告内容を示すものではありません。"
            : "表示している金額は記帳データに基づく概算であり、実際の申告内容を示すものではありません。"}
        </p>
      </PageContainer>
    </div>
  );
}
