import type { Metadata } from "next";
import { PageContainer } from "@/components/ui/PageContainer";
import { ClientInvoiceForm } from "@/components/ClientInvoiceForm";
import { ReceivablesAgingTable } from "@/components/ReceivablesAgingTable";
import { RecurringInvoiceManager } from "@/components/RecurringInvoiceManager";
import { ReceivableInvoiceInput, computeReceivablesSummary } from "@/lib/invoice/receivables";
import { PageTitle } from "@/components/ui/PageTitle";

export const metadata: Metadata = {
  title: "請求書（適格請求書）発行｜決算書作成から税務申告までワンクリック（スグル）",
  description: "フリーランス・マイクロ法人が取引先に発行する請求書（インボイス制度対応）の下書きを作成するツール（開発中プロトタイプ）。",
};

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * 未収入金セクションの表示例データ。
 *
 * 現時点では請求書フォーム（ClientInvoiceForm）はブラウザ表示中のみ有効な一時データを扱っており、
 * 発行済み請求書の永続保存・支払期日・入金状況の記録機能はまだ実装されていない。そのため、
 * このセクションでは集計ロジック（src/lib/invoice/receivables.ts）の動作を確認できるよう、
 * 実際のユーザーデータではないことが明確な「（表示例）」ラベル付きのサンプル請求書を用いている。
 * 請求書データの永続化・支払記録が実装された段階で、実データに置き換える想定。
 */
function buildSampleReceivableInvoices(asOfDate: string): ReceivableInvoiceInput[] {
  const asOfMs = Date.parse(`${asOfDate}T00:00:00Z`);
  const dayMs = 24 * 60 * 60 * 1000;
  const isoDaysAgo = (days: number) => new Date(asOfMs - days * dayMs).toISOString().slice(0, 10);

  return [
    {
      invoiceNumber: "（例）INV-SAMPLE-0001",
      clientName: "（表示例）株式会社サンプルA",
      issueDate: isoDaysAgo(50),
      dueDate: isoDaysAgo(20),
      grandTotal: 220_000,
      paidAt: isoDaysAgo(18),
      paidAmount: 220_000,
    },
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

export default function InvoicesPage() {
  const asOfDate = todayISO();
  const receivablesSummary = computeReceivablesSummary(buildSampleReceivableInvoices(asOfDate), asOfDate);

  return (
    <div className="bg-background text-foreground min-h-screen">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto max-w-5xl px-6 py-4 flex items-baseline justify-between">
          <PageTitle />
          <div className="text-xs text-muted-foreground">MVP — 請求書（適格請求書/インボイス）発行</div>
        </div>
      </header>

      <PageContainer as="main" maxWidth="5xl" className="flex flex-col gap-8">
        <section>
          <h1 className="text-2xl font-semibold mb-2">取引先への請求書を作成する</h1>
          <p className="text-sm text-muted-foreground mb-2 max-w-2xl leading-relaxed">
            明細（品目・数量・単価・税率）を入力すると、税率（8%/10%混在可）ごとに区分した合計額・消費税額と、
            請求金額合計を自動計算します。適格請求書発行事業者の登録番号を入力すると、記載事項の充足状況もあわせて表示します。
          </p>
          <p className="text-xs text-amber-700 max-w-2xl leading-relaxed">
            これは請求書データの下書き作成を補助する概算ツールです。登録番号が未入力の場合でも請求書の作成自体は行えます
            （その場合は「適格請求書」ではなく区分記載請求書としての発行になります）。
            登録番号の実在確認（国税庁「適格請求書発行事業者公表サイト」）や、インボイス制度・電子帳簿保存法上の保存要件の充足については、
            必ずご自身（または税理士等の専門家）でご確認ください。税務代理・個別具体的な税務相談は行っておりません。
          </p>
        </section>

        <ClientInvoiceForm />

        <section>
          <h2 className="text-2xl font-semibold mb-2">定期請求書（サブスクリプション/顧問料クライアント向け）</h2>
          <p className="text-sm text-muted-foreground mb-2 max-w-2xl leading-relaxed">
            毎月/四半期ごとに同じ内容で発行する顧問料・サブスクリプション請求をテンプレートとして登録すると、
            対象期間に発生する発行日を確認しながら、その場で請求書を作成できます。
          </p>
          <p className="text-xs text-amber-700 max-w-2xl leading-relaxed mb-4">
            これは請求書データの下書き作成を補助する概算ツールです。税務代理・個別具体的な税務相談は行っておりません。
          </p>
          <RecurringInvoiceManager />
        </section>

        <section>
          <h2 className="text-2xl font-semibold mb-2">未収入金（発行済み請求書の入金状況）</h2>
          <p className="text-sm text-muted-foreground mb-2 max-w-2xl leading-relaxed">
            発行済みの請求書のうち、まだ入金が確認できていない金額（未収入金）を支払期日からの経過日数別に集計します。
            期日を超過している請求書は超過日数が長い順に一覧表示されます。
          </p>
          <p className="text-xs text-amber-700 max-w-2xl leading-relaxed mb-4">
            現時点では請求書フォーム（上部）はブラウザ表示中のみの一時データを扱っており、発行済み請求書の永続保存・
            支払期日・入金記録の機能は未対応です。そのため、以下は集計機能の動作を確認するための表示例（サンプルデータ、
            実際の取引先・金額ではありません）です。入金確認や督促は税務代理・税務相談に該当しないよう、
            必ずご自身の実際の入金記録（銀行口座等）に基づいて行ってください。
          </p>
          <ReceivablesAgingTable summary={receivablesSummary} />
        </section>
      </PageContainer>
    </div>
  );
}
