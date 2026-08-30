"use client";

import { Fragment } from "react";
import Link from "next/link";
import { useDashboardWidgetLayout } from "@/hooks/useDashboardWidgetLayout";
import { useDashboardWidgetSections } from "@/hooks/useDashboardWidgetSections";
import { PartnerReferralBanner } from "@/components/PartnerReferralBanner";
import { PageContainer } from "@/components/ui/PageContainer";
import { PageTitle } from "@/components/ui/PageTitle";

export default function DashboardPage() {
  const { layout: widgetLayout } = useDashboardWidgetLayout();
  const { isEmpty, isSampleData, partnerCategories, widgetSections } = useDashboardWidgetSections();

  if (isEmpty) {
    return (
      <div className="bg-background text-foreground min-h-screen">
        <header className="border-b border-border bg-surface">
          <div className="px-6 py-4 flex items-baseline justify-end">
            <PageTitle />
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

  return (
    <div className="bg-background text-foreground min-h-screen">
      <header className="border-b border-border bg-surface">
        <div className="px-6 py-4 flex items-baseline justify-end">
          <PageTitle />
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
