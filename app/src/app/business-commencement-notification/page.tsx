import { PageContainer } from "@/components/ui/PageContainer";
import type { Metadata } from "next";
import { BusinessCommencementNotificationForm } from "./BusinessCommencementNotificationForm";
import { PageTitle } from "@/components/ui/PageTitle";

export const metadata: Metadata = {
  title: "個人事業の開業届（下書き作成）｜決算書作成から税務申告までワンクリック（スグル）",
  description:
    "これから事業を開始するフリーランス・個人事業主向けに、「個人事業の開業・廃業等届出書」（開業の場合）の下書きデータを作成するツール（開発中プロトタイプ）。",
};

export default function BusinessCommencementNotificationPage() {
  return (
    <div className="bg-background text-foreground min-h-screen print:bg-white">
      <header className="border-b border-border bg-surface print:hidden">
        <div className="mx-auto max-w-5xl px-6 py-4 flex items-baseline justify-between">
          <PageTitle />
          <div className="text-xs text-muted-foreground">MVP — 個人事業の開業届（下書き作成）</div>
        </div>
      </header>

      <PageContainer as="main" maxWidth="5xl" className="flex flex-col gap-8 print:px-0 print:py-0">
        <section className="print:hidden">
          <h1 className="text-2xl font-semibold mb-2">個人事業の開業届（下書き作成）</h1>
          <p className="text-sm text-muted-foreground mb-2 max-w-2xl leading-relaxed">
            これから事業を開始するフリーランス・個人事業主が、提出先税務署・提出者情報・開業日・事業の概要・
            給与等の支払の状況（従業員を雇うかどうか）・青色申告承認申請書の同時提出有無を入力すると、
            「個人事業の開業・廃業等届出書」（開業の場合）の下書きデータのプレビューを表示します。廃業届や、
            事務所の新増設・移転・廃止の届出には対応していません。
          </p>
          <p className="text-xs text-amber-700 max-w-2xl leading-relaxed">
            この画面で作成できるのは下書きデータのみです。実際の提出（e-Tax又は書面提出）は、内容をご自身で確認の
            うえ利用者ご自身の責任で行ってください。当社が代理で提出することはありません。個別具体的な税務相談には
            該当しませんので、最終的な判断は必要に応じて税理士等の専門家にご相談ください。個人番号（マイナンバー）
            は当社では取得・保存しないため、入力欄は設けていません。
          </p>
        </section>

        <BusinessCommencementNotificationForm />
      </PageContainer>
    </div>
  );
}
