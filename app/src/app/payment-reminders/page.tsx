import { PageContainer } from "@/components/ui/PageContainer";
import type { Metadata } from "next";
import Link from "next/link";
import { PaymentReminderDraftPanel } from "@/components/PaymentReminderDraftPanel";
import { ReceivableInvoiceInput, computeReceivablesSummary } from "@/lib/invoice/receivables";
import { PageTitle } from "@/components/ui/PageTitle";

export const metadata: Metadata = {
  title: "支払い督促メール下書き作成｜決算書作成から税務申告までワンクリック（スグル）",
  description: "期日超過の請求書から、取引先への支払い状況確認・督促メールの下書き（件名＋本文）をその場で作成するツール（開発中プロトタイプ）。",
};

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * 期日超過（未収）請求書一覧の表示例データ。
 *
 * src/app/invoices/page.tsx の未収入金セクションと同様、発行済み請求書の永続保存・
 * 支払期日・入金状況を記録する機能はまだ実装されていないため、この一覧は
 * receivables.ts の集計ロジックの動作を確認できるようにした「（表示例）」ラベル付きの
 * サンプル請求書である。実データではない点に注意。
 */
function buildSampleReceivableInvoices(asOfDate: string): ReceivableInvoiceInput[] {
  const asOfMs = Date.parse(`${asOfDate}T00:00:00Z`);
  const dayMs = 24 * 60 * 60 * 1000;
  const isoDaysAgo = (days: number) => new Date(asOfMs - days * dayMs).toISOString().slice(0, 10);

  return [
    {
      invoiceNumber: "（例）INV-SAMPLE-0002",
      clientName: "（表示例）株式会社サンプルB",
      issueDate: isoDaysAgo(45),
      dueDate: isoDaysAgo(15),
      grandTotal: 165_000,
    },
    {
      invoiceNumber: "（例）INV-SAMPLE-0003",
      clientName: "（表示例）合同会社サンプルC",
      issueDate: isoDaysAgo(75),
      dueDate: isoDaysAgo(45),
      grandTotal: 88_000,
    },
    {
      invoiceNumber: "（例）INV-SAMPLE-0004",
      clientName: "（表示例）株式会社サンプルD",
      issueDate: isoDaysAgo(120),
      dueDate: isoDaysAgo(95),
      grandTotal: 330_000,
      paidAt: isoDaysAgo(30),
      paidAmount: 100_000,
    },
    {
      invoiceNumber: "（例）INV-SAMPLE-0005",
      clientName: "（表示例）株式会社サンプルE",
      issueDate: isoDaysAgo(10),
      dueDate: isoDaysAgo(-20),
      grandTotal: 55_000,
    },
  ];
}

export default function PaymentRemindersPage() {
  const asOfDate = todayISO();
  const summary = computeReceivablesSummary(buildSampleReceivableInvoices(asOfDate), asOfDate);

  return (
    <div className="bg-background text-foreground min-h-screen">
      <header className="border-b border-border bg-surface">
        <div className="px-6 py-4 flex items-baseline justify-end">
          <PageTitle />
        </div>
      </header>

      <PageContainer as="main" maxWidth="3xl" className="flex flex-col gap-8">
        <section>
          <h1 className="text-2xl font-semibold mb-2">支払い督促メールの下書きを作成する</h1>
          <p className="text-sm text-muted-foreground leading-relaxed max-w-2xl">
            期日を過ぎても入金が確認できない請求書について、取引先に送る「支払い状況確認・督促」メールの下書き
            （件名＋本文）をその場で作成します。初回は「やわらかい」トーン、再送・長期化した場合は「強め」トーンを
            選べます。実際の送信は行いません。生成された文面をコピーして、ご自身のメールソフトから送信してください。
          </p>
          <p className="text-xs text-warning-foreground max-w-2xl leading-relaxed mt-2">
            現時点では請求書データの永続保存・入金記録の機能は未対応のため、下の「未収一覧から選ぶ」は
            集計ロジック（src/lib/invoice/receivables.ts）の動作を確認するための表示例（サンプルデータ）です。
            実在の取引先ではありません。実際の請求書については「手入力する」から入力してください。
            本機能は督促状の作成・債権回収の助言・税理士法に定める税務代理／税務相談を行うものではありません。
          </p>
        </section>

        <PaymentReminderDraftPanel overdueInvoices={summary.overdueInvoices} />
      </PageContainer>
    </div>
  );
}
