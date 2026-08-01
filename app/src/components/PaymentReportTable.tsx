import { GENERAL_ANNUAL_THRESHOLD, PaymentReportLine } from "@/lib/tax/paymentReportForm";

// ------------------------------------------------------------------
// 「報酬、料金、契約金及び賞金の支払調書」下書きの表示テーブル。
// データ計算（app/src/lib/tax/paymentReportForm.ts）を取り込まない純粋な表示コンポーネント
// （サーバーコンポーネントとしても利用可能）。カード＋テーブルの構成は
// GeneralLedgerTable.tsx・ReceivablesAgingTable.tsxに合わせている。
// ------------------------------------------------------------------

const yen = new Intl.NumberFormat("ja-JP", { style: "currency", currency: "JPY", maximumFractionDigits: 0 });

function Yen({ v }: { v: number }) {
  return <span className="tabular-nums">{yen.format(v)}</span>;
}

export function PaymentReportTable({ lines }: { lines: PaymentReportLine[] }) {
  const requiredLines = lines.filter((l) => l.reportRequired);
  const totalGross = lines.reduce((sum, l) => sum + l.grossAmount, 0);
  const totalWithholding = lines.reduce((sum, l) => sum + l.withholdingTax, 0);

  return (
    <div className="flex flex-col gap-4">
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="border border-stone-300 bg-white rounded-lg p-4">
          <p className="text-xs text-stone-500">支払先×区分の件数</p>
          <p className="text-xl font-semibold tabular-nums mt-1">{lines.length}件</p>
        </div>
        <div className="border border-amber-300 bg-amber-50 rounded-lg p-4">
          <p className="text-xs text-amber-700">提出が必要と考えられる件数</p>
          <p className="text-xl font-semibold tabular-nums mt-1 text-amber-800">{requiredLines.length}件</p>
          <p className="text-xs text-amber-700 mt-1">
            年間支払合計が{GENERAL_ANNUAL_THRESHOLD.toLocaleString("ja-JP")}円を超えるもの
          </p>
        </div>
        <div className="border border-stone-300 bg-white rounded-lg p-4">
          <p className="text-xs text-stone-500">支払金額合計</p>
          <p className="text-xl font-semibold tabular-nums mt-1">
            <Yen v={totalGross} />
          </p>
        </div>
        <div className="border border-stone-300 bg-white rounded-lg p-4">
          <p className="text-xs text-stone-500">源泉徴収税額合計</p>
          <p className="text-xl font-semibold tabular-nums mt-1">
            <Yen v={totalWithholding} />
          </p>
        </div>
      </div>

      <div>
        <h3 className="text-sm font-semibold mb-2">支払先・区分ごとの年間集計（支払金額の多い順）</h3>
        {lines.length === 0 ? (
          <div className="border border-dashed border-stone-300 bg-white rounded-lg p-6 text-center text-sm text-stone-500">
            対象になる支払データがありません。
          </div>
        ) : (
          <div className="overflow-x-auto border border-stone-300 bg-white rounded-lg">
            <table className="w-full text-sm border-collapse min-w-[720px]">
              <thead>
                <tr className="border-b border-stone-300 bg-stone-50 text-left text-xs text-stone-500">
                  <th className="py-2 px-3 font-semibold">支払先</th>
                  <th className="py-2 px-3 font-semibold whitespace-nowrap">区分</th>
                  <th className="py-2 px-3 font-semibold text-right whitespace-nowrap">支払金額合計</th>
                  <th className="py-2 px-3 font-semibold text-right whitespace-nowrap">源泉徴収税額</th>
                  <th className="py-2 px-3 font-semibold text-right whitespace-nowrap">差引支払額</th>
                  <th className="py-2 px-3 font-semibold text-right whitespace-nowrap">支払回数</th>
                  <th className="py-2 px-3 font-semibold whitespace-nowrap">提出要否</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((line) => (
                  <tr
                    key={`${line.payeeName} ${line.category}`}
                    className={`border-b border-stone-200 last:border-b-0 ${line.reportRequired ? "bg-amber-50" : ""}`}
                  >
                    <td className="py-2.5 px-3 max-w-[10rem] truncate" title={line.payeeName}>
                      {line.payeeName}
                    </td>
                    <td className="py-2.5 px-3 text-xs whitespace-nowrap">{line.category}</td>
                    <td className="py-2.5 px-3 text-right tabular-nums whitespace-nowrap">
                      <Yen v={line.grossAmount} />
                    </td>
                    <td className="py-2.5 px-3 text-right tabular-nums whitespace-nowrap">
                      <Yen v={line.withholdingTax} />
                    </td>
                    <td className="py-2.5 px-3 text-right tabular-nums whitespace-nowrap">
                      <Yen v={line.netAmount} />
                    </td>
                    <td className="py-2.5 px-3 text-right tabular-nums whitespace-nowrap">{line.paymentCount}回</td>
                    <td className="py-2.5 px-3 whitespace-nowrap">
                      {line.reportRequired ? (
                        <span className="inline-block rounded-sm bg-amber-100 px-1.5 py-0.5 text-xs text-amber-800">
                          提出が必要
                        </span>
                      ) : (
                        <span className="text-xs text-stone-400">基準額以下</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p className="text-xs text-stone-500 leading-relaxed">
        この一覧は記帳データから機械的に集計した「支払調書」の下書きであり、正式な法定調書ではありません。
        e-Taxソフト等への実際の提出は行っていないため、内容をご自身でご確認のうえ、ご自身で提出手続きを行ってください。
        税理士法に定める税務代理・税務書類の作成・個別具体的な税務相談を提供するものではありません。
      </p>
    </div>
  );
}
