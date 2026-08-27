import type { Metadata } from "next";
import { PageContainer } from "@/components/ui/PageContainer";
import { QuoteForm } from "@/components/QuoteForm";

export const metadata: Metadata = {
  title: "見積書発行｜決算書作成から税務申告までワンクリック（スグル）",
  description: "フリーランス・マイクロ法人が取引先に発行する見積書（御見積書）の下書きを作成するツール（開発中プロトタイプ）。",
};

export default function QuotesPage() {
  return (
    <div className="bg-stone-50 text-stone-900 min-h-screen">
      <header className="border-b border-stone-300 bg-white">
        <div className="mx-auto max-w-5xl px-6 py-4 flex items-baseline justify-between">
          <div className="font-serif text-lg tracking-wide">
            決算書作成から税務申告までワンクリック <span className="text-red-700">／</span> スグル
          </div>
          <div className="text-xs text-stone-500">MVP — 見積書（御見積書）発行</div>
        </div>
      </header>

      <PageContainer as="main" maxWidth="5xl" className="flex flex-col gap-8">
        <section>
          <h1 className="text-2xl font-semibold mb-2">取引先への見積書を作成する</h1>
          <p className="text-sm text-stone-600 mb-2 max-w-2xl leading-relaxed">
            明細（品目・数量・単価・税率）を入力すると、税率（8%/10%混在可）ごとに区分した合計額・消費税額と、
            御見積金額合計を自動計算します。発行日からの有効期限（日数）を指定すると、有効期限日も自動計算されます。
          </p>
          <p className="text-xs text-amber-700 max-w-2xl leading-relaxed">
            これは見積書データの下書き作成を補助する概算ツールです。見積書はあくまで価格提示の書類であり、
            正式な契約成立や請求を意味しません。先方の承認（ステータスを「承認済み」に更新）後、
            「この見積書から請求書を作成」で明細をそのまま引き継いだ請求書の下書きを作成できます。
            税務代理・個別具体的な税務相談は行っておりません。
          </p>
        </section>

        <QuoteForm />
      </PageContainer>
    </div>
  );
}
