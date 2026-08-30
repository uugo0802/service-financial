import { PageContainer } from "@/components/ui/PageContainer";
import type { Metadata } from "next";
import { QualifiedInvoiceApplicationForm } from "@/components/QualifiedInvoiceApplicationForm";
import { PageTitle } from "@/components/ui/PageTitle";

export const metadata: Metadata = {
  title: "適格請求書発行事業者の登録申請書（下書き作成）｜決算書作成から税務申告までワンクリック（スグル）",
  description:
    "まだインボイス登録番号を取得していない事業者向けに、適格請求書発行事業者の登録申請書の下書きデータを作成するツール（開発中プロトタイプ）。",
};

export default function InvoiceRegistrationApplicationPage() {
  return (
    <div className="bg-background text-foreground min-h-screen">
      <header className="border-b border-border bg-surface">
        <div className="px-6 py-4 flex items-baseline justify-end">
          <PageTitle />
        </div>
      </header>

      <PageContainer as="main" maxWidth="5xl" className="flex flex-col gap-8">
        <section>
          <h1 className="text-2xl font-semibold mb-2">適格請求書発行事業者の登録申請書（下書き作成）</h1>
          <p className="text-sm text-muted-foreground mb-2 max-w-2xl leading-relaxed">
            まだインボイス登録番号（適格請求書発行事業者の登録番号）を取得していない方が、事業者区分・氏名又は名称・
            納税地・提出先税務署・免税事業者からの選択の有無・登録希望日を入力すると、登録申請書の下書きデータの
            プレビューを表示します。既に取得済みの登録番号の形式チェックは、別ツール（インボイス登録番号バリデーター）
            をご利用ください。
          </p>
          <p className="text-xs text-amber-700 max-w-2xl leading-relaxed">
            この画面で作成できるのは下書きデータのみです。実際の申請（e-Tax又は書面提出）は、内容をご自身で確認のうえ
            利用者ご自身の責任で行ってください。当社が代理で提出することはありません。個別具体的な税務相談には
            該当しませんので、最終的な判断は必要に応じて税理士等の専門家にご相談ください。
          </p>
        </section>

        <QualifiedInvoiceApplicationForm />
      </PageContainer>
    </div>
  );
}
