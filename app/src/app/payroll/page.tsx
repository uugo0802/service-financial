import { PageContainer } from "@/components/ui/PageContainer";
import type { Metadata } from "next";
import Link from "next/link";
import { WithholdingCalculator } from "@/components/WithholdingCalculator";
import { BonusWithholdingCalculator } from "@/components/BonusWithholdingCalculator";
import { YearEndAdjustmentCalculator } from "@/components/YearEndAdjustmentCalculator";
import { PageTitle } from "@/components/ui/PageTitle";

export const metadata: Metadata = {
  title: "源泉徴収・年末調整（給与・賞与）の概算計算｜決算書作成から税務申告までワンクリック（スグル）",
  description:
    "マイクロ法人の一人代表が自身に支払う月々の役員報酬・賞与について、源泉徴収税額の目安と、年末調整による過不足額の概算を計算する参考ツール（開発中プロトタイプ）。",
};

export default function PayrollPage() {
  return (
    <div className="bg-background text-foreground min-h-screen">
      <header className="border-b border-border bg-surface">
        <div className="px-6 py-4 flex items-baseline justify-end">
          <PageTitle />
        </div>
      </header>

      <PageContainer as="main" maxWidth="5xl" className="flex flex-col gap-12">
        <section>
          <h1 className="text-2xl font-semibold mb-2">源泉徴収・年末調整（給与・賞与）の概算計算</h1>
          <p className="text-sm text-muted-foreground mb-2 max-w-2xl leading-relaxed">
            マイクロ法人（一人社長など）が唯一の役員である自分自身に役員報酬・賞与を支払う場合、
            会社側には所得税の源泉徴収・納付義務、および年末調整による年間の過不足税額の精算義務が
            生じます。このページでは、（1）月々の源泉徴収額の下書き計算、（2）賞与（ボーナス）の
            源泉徴収額の下書き計算、（3）年末調整による過不足額の概算シミュレーション、という3つの
            単機能ツールを提供します。いずれも国税庁公表の税額表・算出率表・速算式をブラケット近似式で
            再現した「下書き・概算」であり、住民税の特別徴収や法定調書（源泉徴収票等）の作成には
            対応していません。
          </p>
          <p className="text-xs text-muted-foreground max-w-2xl leading-relaxed">
            対象は「扶養控除等申告書を提出している（甲欄）」場合の給与・賞与のみです。生命保険料控除・
            住宅ローン控除・ふるさと納税等を含む本格的な年末調整の自動処理、および給与計算全般の
            自動化（法定調書の作成・提出を含む）は、本サービスのロードマップ上の将来フェーズで
            さらに拡充を検討する範囲です。現時点で提供する3ツールは、それぞれ限定的な前提の下での
            「下書き・概算」を示すものであり、正式な年末調整処理・税務書類の作成を代行するものでは
            ありません。
          </p>
          <p className="mt-2 text-xs text-amber-700 max-w-2xl leading-relaxed">
            このページの各ツールが表示する金額は、国税庁公表の税額表・算出率表・速算式を、実際の
            細かい行区分ではなく区分ごとの速算式・税率で近似した概算値であり、正式な源泉徴収額・
            年末調整額を保証するものではありません。実際の源泉徴収・納付・年末調整にあたっては、
            必ず国税庁公表の最新の資料をご確認ください。本ツールは税務代理・税務書類の作成・
            個別具体的な税務相談には該当せず、機械的な計算結果を示すのみです。最終的な判断・
            実際の納付額・還付額は必ずご自身または税理士等の専門家にご確認ください。
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-2">1. 月々の役員報酬・給与の源泉徴収税額（月額表の概算）</h2>
          <p className="text-sm text-muted-foreground mb-4 max-w-2xl leading-relaxed">
            月額の役員報酬・給与、扶養親族等の数、その月の社会保険料（健康保険・厚生年金等）を
            入力すると、国税庁公表の「給与所得の源泉徴収税額表（月額表）」甲欄をブラケット近似式で
            再現した源泉徴収税額の目安と、差引支給額の概算を表示します。
          </p>
          <WithholdingCalculator />
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-2">2. 賞与（ボーナス）の源泉徴収税額の概算</h2>
          <p className="text-sm text-muted-foreground mb-4 max-w-2xl leading-relaxed">
            賞与の総支給額、その賞与にかかる社会保険料、前月の給与等の金額（社会保険料等控除後）、
            扶養親族等の数を入力すると、国税庁公表の「賞与に対する源泉徴収税額の算出率の表」甲欄を
            ブラケット近似式で再現した源泉徴収税額の目安を表示します。「前月の給与がない場合」や
            「賞与が前月の給与の10倍を超える場合」など、国税庁が定める特別な計算方法には対応して
            いません（該当する場合はツール内の注意文を必ずご確認ください）。
          </p>
          <BonusWithholdingCalculator />
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-2">3. 年末調整による過不足額の概算シミュレーション</h2>
          <p className="text-sm text-muted-foreground mb-4 max-w-2xl leading-relaxed">
            年間の給与等の総支給額（月々の役員報酬・給与＋賞与の合計）、年間の社会保険料、扶養親族等
            の数、その年にすでに源泉徴収した所得税額の合計を入力すると、給与所得控除・社会保険料控除・
            基礎控除・扶養控除（一律近似）のみを反映した年間の所得税額の概算と、源泉徴収済みの税額との
            差額（徴収不足額または過納還付額）を計算します。生命保険料控除・地震保険料控除・住宅ローン
            控除・ふるさと納税・医療費控除・小規模企業共済等掛金控除は対象外です。これらを利用している
            場合、実際の年末調整・確定申告の結果とは大きく異なりますので、必ずツール内の注意文をご確認
            ください。
          </p>
          <YearEndAdjustmentCalculator />
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-2">4. 給与所得の源泉徴収票（下書き）の作成</h2>
          <p className="text-sm text-muted-foreground max-w-2xl leading-relaxed">
            上記の年末調整の結果をもとに、会社が役員・従業員へ交付しなければならない「給与所得の源泉徴収票」の
            下書きを作成し、印刷／PDF保存できる画面を別途用意しています。
            <Link href="/withholding-slip" className="ml-1 underline hover:text-foreground">
              源泉徴収票（下書き）の作成へ →
            </Link>
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-2">5. 青色事業専従者給与のチェック</h2>
          <p className="text-sm text-muted-foreground max-w-2xl leading-relaxed">
            青色申告を行う個人事業主が、生計を一にする家族従業員（配偶者等の事業専従者）に支払う給与
            （青色事業専従者給与）について、届出書に記載した上限額との比較・必要経費算入額の目安・
            専従者要件のチェックリストを確認できる画面を別途用意しています。
            <Link href="/family-employee" className="ml-1 underline hover:text-foreground">
              青色事業専従者給与のチェックへ →
            </Link>
          </p>
        </section>
      </PageContainer>
    </div>
  );
}
