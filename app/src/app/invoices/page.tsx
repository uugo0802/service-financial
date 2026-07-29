import type { Metadata } from "next";
import { ClientInvoiceForm } from "@/components/ClientInvoiceForm";

export const metadata: Metadata = {
  title: "請求書（適格請求書）発行｜税務申告AI（ジャービス）",
  description: "フリーランス・マイクロ法人が取引先に発行する請求書（インボイス制度対応）の下書きを作成するツール（開発中プロトタイプ）。",
};

export default function InvoicesPage() {
  return (
    <div className="bg-stone-50 text-stone-900 min-h-screen">
      <header className="border-b border-stone-300 bg-white">
        <div className="mx-auto max-w-5xl px-6 py-4 flex items-baseline justify-between">
          <div className="font-serif text-lg tracking-wide">
            税務申告AI <span className="text-red-700">／</span> ジャービス
          </div>
          <div className="text-xs text-stone-500">MVP — 請求書（適格請求書/インボイス）発行</div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-10 flex flex-col gap-8">
        <section>
          <h1 className="text-2xl font-semibold mb-2">取引先への請求書を作成する</h1>
          <p className="text-sm text-stone-600 mb-2 max-w-2xl leading-relaxed">
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
      </main>
    </div>
  );
}
