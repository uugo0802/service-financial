import { PageContainer } from "@/components/ui/PageContainer";
import { CorporateInterimTaxForm } from "@/components/CorporateInterimTaxForm";

export default function CorporateInterimTaxPage() {
  return (
    <div className="bg-background text-foreground min-h-screen">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto max-w-3xl px-6 py-4 flex items-baseline justify-between">
          <div className="font-serif text-lg tracking-wide">
            決算書作成から税務申告までワンクリック <span className="text-red-700">／</span> スグル
          </div>
          <div className="text-xs text-muted-foreground">中間申告（予定申告・仮決算）概算計算</div>
        </div>
      </header>

      <PageContainer as="main" maxWidth="3xl" className="flex flex-col gap-8">
        <section>
          <h1 className="text-2xl font-semibold mb-2">法人の中間申告 概算計算</h1>
          <p className="text-sm text-muted-foreground leading-relaxed max-w-2xl">
            前事業年度の確定法人税額が20万円を超えるマイクロ法人は、事業年度開始から6か月を経過した時点で
            「中間申告・中間納付」が必要になります。中間申告には、前期実績の1/2を納める
            「予定申告方式」と、6か月間の実際の業績で仮決算を組む「仮決算方式」の2つの方式があります。
            それぞれの概算納付額を試算し、当期に有利な方式を確認できます。
          </p>
        </section>

        <section className="border border-border bg-surface rounded-lg p-5">
          <h2 className="text-sm font-semibold mb-3 text-foreground">2つの方式のちがい</h2>
          <ul className="text-sm text-muted-foreground leading-relaxed list-disc list-inside space-y-1">
            <li>
              <span className="font-medium text-foreground">予定申告方式</span>:
              前期確定法人税額・地方法人税額・（該当する場合）消費税額の概ね1/2を機械的に納める、
              最も手間のかからない方法です。前期が黒字で今期も同水準以上の業績なら、通常はこの方式で問題ありません。
            </li>
            <li>
              <span className="font-medium text-foreground">仮決算方式</span>:
              6か月間の実際の帳簿を締めて（仮決算）、その実績に基づき税額を計算する方法です。
              今期上半期の業績が前期より大きく悪化している場合、予定申告方式より納付額を抑えられることがあります。
              ただし、仮決算による税額が前期実績の年換算額より多い場合は選択できないなどの制約があり、
              本ツールはこれらの適用可否までは判定していません。
            </li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-3">概算シミュレーション</h2>
          <CorporateInterimTaxForm />
        </section>

        <section className="border-t border-border pt-6">
          <p className="text-xs text-muted-foreground leading-relaxed max-w-2xl">
            本ページで表示される要否・金額は、一般的な制度上のしきい値・端数処理ルールに基づく参考値であり、
            個別の税務相談・助言ではありません。実際に「申告」を行うものでもありません。
            中間申告の要否・方式の選択・納付額は、必ず税務署からの通知および国税庁・税理士等の専門家にご確認のうえ、
            ご自身の判断と責任で申告・納付を行ってください。
          </p>
        </section>
      </PageContainer>
    </div>
  );
}
