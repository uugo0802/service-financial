import { CashFlowSection, CashFlowStatement as CashFlowStatementForm } from "@/lib/tax/cashFlowStatement";

// ------------------------------------------------------------------
// キャッシュ・フロー計算書（簡易・間接法）の表示コンポーネント。
// データを取り込まない純粋な表示コンポーネント（サーバーコンポーネントとして利用可能）。
//
// 【重要】このコンポーネントは financial-statements ページの DocumentPreviewFrame 配下で
// 使われる（EquityChangeStatement.tsx等、既存の決算書類コンポーネントと同じ位置づけ）。
// DocumentPreviewFrame.tsx のコメントにある通り、書類プレビュー画面は常にライト固定
// （ダークモード非対応）と決まっているため、bg-background・text-foreground等の
// デザイントークンクラスは使わず、bg-white/stone系のハードコードされたライト固定色のみを
// 使用する（dark:プレフィックスも付けない）。
// ------------------------------------------------------------------

const yen = new Intl.NumberFormat("ja-JP", { style: "currency", currency: "JPY", maximumFractionDigits: 0 });

function CashFlowSectionTable({ section }: { section: CashFlowSection }) {
  return (
    <div className="overflow-x-auto border border-stone-300 bg-white">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-stone-300 text-left text-stone-500 text-xs">
            <th className="px-3 py-2 font-normal" colSpan={2}>
              {section.title}
            </th>
          </tr>
        </thead>
        <tbody>
          {section.lines.map((line) => (
            <tr key={line.label} className="border-b border-stone-100 last:border-0 print:break-inside-avoid">
              <td className="px-3 py-2">{line.label}</td>
              <td className="px-3 py-2 text-right tabular-nums">{yen.format(line.amount)}</td>
            </tr>
          ))}
          <tr className="print:break-inside-avoid">
            <td className="px-3 py-2 font-semibold">{section.title}合計</td>
            <td className="px-3 py-2 text-right tabular-nums font-semibold">{yen.format(section.subtotal)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

export function CashFlowStatement({ form }: { form: CashFlowStatementForm }) {
  return (
    <section>
      <h2 className="text-lg font-semibold mb-3">キャッシュ・フロー計算書（簡易）</h2>
      <p className="text-xs text-stone-500 mb-3 leading-relaxed max-w-2xl">
        間接法による簡易試算です。当期純利益に減価償却費・未払法人税等及び未払消費税等の増減額を加減して営業活動によるキャッシュ・フローを算出し、投資活動は当期中に取得した固定資産の取得価額、財務活動は借入金の当期増減のみを対象としています。売掛金・買掛金の増減等、これら以外の項目はこのアプリでは反映されません。
      </p>
      <div className="flex flex-col gap-4">
        <CashFlowSectionTable section={form.operating} />
        <CashFlowSectionTable section={form.investing} />
        <CashFlowSectionTable section={form.financing} />

        <div className="overflow-x-auto border border-stone-300 bg-white">
          <table className="w-full text-sm">
            <tbody>
              <tr className="border-b border-stone-100 print:break-inside-avoid">
                <td className="px-3 py-2 font-semibold">現金及び現金同等物の増減額</td>
                <td className="px-3 py-2 text-right tabular-nums font-semibold">{yen.format(form.netChangeInCash)}</td>
              </tr>
              <tr className="border-b border-stone-100 print:break-inside-avoid">
                <td className="px-3 py-2">現金及び現金同等物の期首残高</td>
                <td className="px-3 py-2 text-right tabular-nums">{yen.format(form.openingCash)}</td>
              </tr>
              <tr className="print:break-inside-avoid">
                <td className="px-3 py-2 font-semibold">現金及び現金同等物の期末残高</td>
                <td className="px-3 py-2 text-right tabular-nums font-semibold">{yen.format(form.calculatedEndingCash)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
      <p className={`text-xs mt-3 ${form.balanced ? "text-stone-400" : "text-red-700"}`}>
        {form.balanced
          ? "検算: 期首残高＋当期増減額＝貸借対照表の現金及び預金（一致）"
          : form.notes[0] ??
            "検算エラー: 期首残高＋当期増減額と貸借対照表の現金及び預金が一致していません。入力値をご確認ください。"}
      </p>
    </section>
  );
}
