import { EquityChangeForm, EquityChangeLine } from "@/lib/tax/equityChangeForm";

// ------------------------------------------------------------------
// 株主資本等変動計算書の表示コンポーネント。
// データを取り込まない純粋な表示コンポーネント（サーバーコンポーネントとして利用可能）。
// ------------------------------------------------------------------

const yen = new Intl.NumberFormat("ja-JP", { style: "currency", currency: "JPY", maximumFractionDigits: 0 });

function EquityChangeRow({ line }: { line: EquityChangeLine }) {
  return (
    <tr className="border-b border-stone-100 last:border-0">
      <td className="px-3 py-2 font-medium">{line.label}</td>
      <td className="px-3 py-2 text-right tabular-nums">{yen.format(line.openingBalance)}</td>
      <td className="px-3 py-2 text-right tabular-nums">{yen.format(line.change)}</td>
      <td className="px-3 py-2 text-right tabular-nums font-semibold">{yen.format(line.closingBalance)}</td>
    </tr>
  );
}

export function EquityChangeStatement({ form }: { form: EquityChangeForm }) {
  return (
    <section>
      <h2 className="text-lg font-semibold mb-3">株主資本等変動計算書</h2>
      <p className="text-xs text-stone-500 mb-3 leading-relaxed max-w-2xl">
        当期中に増資・減資・自己株式の取得等の資本取引は発生していないものとして扱っています。該当する資本取引がある場合は、ご自身で反映してください。
      </p>
      <div className="overflow-x-auto border border-stone-300 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-stone-300 text-left text-stone-500 text-xs">
              <th className="px-3 py-2 font-normal">科目</th>
              <th className="px-3 py-2 font-normal text-right">当期首残高</th>
              <th className="px-3 py-2 font-normal text-right">当期変動額</th>
              <th className="px-3 py-2 font-normal text-right">当期末残高</th>
            </tr>
          </thead>
          <tbody>
            <EquityChangeRow line={form.capitalStock} />
            <EquityChangeRow line={form.retainedEarnings} />
            <EquityChangeRow line={form.netAssetsTotal} />
          </tbody>
        </table>
      </div>
    </section>
  );
}
