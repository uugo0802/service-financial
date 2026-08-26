import type { Metadata } from "next";
import Link from "next/link";
import { WithholdingSlipForm } from "@/components/WithholdingSlipForm";

export const metadata: Metadata = {
  title: "給与所得の源泉徴収票（下書き）｜決算書作成から税務申告までワンクリック（スグル）",
  description:
    "年末調整の計算結果から、会社が役員・従業員へ交付する源泉徴収票の下書きを作成し、印刷／PDF保存できる画面（開発中プロトタイプ）。",
};

export default function WithholdingSlipPage() {
  return (
    <div className="bg-stone-50 text-stone-900 min-h-screen">
      <header className="border-b border-stone-300 bg-white">
        <div className="mx-auto max-w-4xl px-6 py-4 flex items-baseline justify-between">
          <Link href="/" className="font-serif text-lg tracking-wide">
            決算書作成から税務申告までワンクリック <span className="text-red-700">／</span> スグル
          </Link>
          <div className="text-xs text-stone-500">給与所得の源泉徴収票（下書き）</div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-6 py-10 flex flex-col gap-8 print:max-w-none print:px-0 print:py-0">
        <section className="print:hidden">
          <h1 className="text-2xl font-semibold mb-2">給与所得の源泉徴収票（下書き）</h1>
          <p className="text-sm text-stone-600 mb-2 max-w-2xl leading-relaxed">
            年末調整（<Link href="/payroll" className="underline hover:text-stone-900">源泉徴収・年末調整の概算計算</Link>
            ）の結果から、会社が年末調整後に役員・従業員へ交付しなければならない「給与所得の源泉徴収票」の
            <b className="font-medium">下書き</b>を作成し、印刷／PDF保存できる画面です。
          </p>
          <p className="text-xs text-stone-500 max-w-2xl leading-relaxed">
            本サービスはマイナンバー非保持の原則に従い、個人番号（マイナンバー）の入力・保存機能を提供しません。
            実務上も、本人交付用の源泉徴収票には個人番号の記載は不要です。生命保険料控除・住宅ローン控除・
            ふるさと納税等、年末調整の対象外としている控除は本ツールでも反映されません。正式な発行・提出前に、
            必ず内容をご自身または税理士等の専門家がご確認ください。
          </p>
          <p className="text-xs text-stone-500 max-w-2xl leading-relaxed">
            雇用関係にない外部の専門家・フリーランス（弁護士・税理士・デザイナー等）への報酬・料金の支払については、
            こちらではなく「
            <Link href="/payment-report" className="underline hover:text-stone-900">
              支払調書（下書き）
            </Link>
            」をご利用ください。
          </p>
        </section>

        <WithholdingSlipForm />
      </main>
    </div>
  );
}
