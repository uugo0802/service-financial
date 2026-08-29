import { WithholdingReconciliationResult } from "@/lib/tax/withholdingTaxCreditReconciliation";

// ------------------------------------------------------------------
// 源泉徴収税額の控除照合結果の表示パネル。
// データ計算（app/src/lib/tax/withholdingTaxCreditReconciliation.ts）を取り込まない
// 純粋な表示コンポーネント（サーバーコンポーネントとしても利用可能）。
// カード＋テーブルの構成はPaymentReportTable.tsxに合わせている。
// ------------------------------------------------------------------

const yen = new Intl.NumberFormat("ja-JP", { style: "currency", currency: "JPY", maximumFractionDigits: 0 });

function Yen({ v }: { v: number }) {
  return <span className="tabular-nums">{yen.format(v)}</span>;
}

export function WithholdingCreditReconciliationPanel({ result }: { result: WithholdingReconciliationResult }) {
  const { records, discrepancyCount, totalRecordedWithholdingTax, totalExpectedWithholdingTax } = result;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="border border-border bg-surface rounded-lg p-4">
          <p className="text-xs text-muted-foreground">支払の件数</p>
          <p className="text-xl font-semibold tabular-nums mt-1">{records.length}件</p>
        </div>
        <div
          className={`border rounded-lg p-4 ${
            discrepancyCount > 0 ? "border-amber-300 bg-amber-50" : "border-border bg-surface"
          }`}
        >
          <p className={`text-xs ${discrepancyCount > 0 ? "text-amber-700" : "text-muted-foreground"}`}>差異ありの件数</p>
          <p
            className={`text-xl font-semibold tabular-nums mt-1 ${
              discrepancyCount > 0 ? "text-amber-800" : ""
            }`}
          >
            {discrepancyCount}件
          </p>
          <p className={`text-xs mt-1 ${discrepancyCount > 0 ? "text-amber-700" : "text-muted-foreground"}`}>
            標準税率（10.21%／20.42%）から算出した期待値との差異
          </p>
        </div>
        <div className="border border-border bg-surface rounded-lg p-4">
          <p className="text-xs text-muted-foreground">期待値の合計（参考値）</p>
          <p className="text-xl font-semibold tabular-nums mt-1">
            <Yen v={totalExpectedWithholdingTax} />
          </p>
        </div>
        <div className="border border-border bg-surface rounded-lg p-4">
          <p className="text-xs text-muted-foreground">源泉徴収税額の控除合計（申告に使用）</p>
          <p className="text-xl font-semibold tabular-nums mt-1">
            <Yen v={totalRecordedWithholdingTax} />
          </p>
        </div>
      </div>

      <div>
        <h3 className="text-sm font-semibold mb-2">クライアント・支払ごとの照合結果</h3>
        {records.length === 0 ? (
          <div className="border border-dashed border-border bg-surface rounded-lg p-6 text-center text-sm text-muted-foreground">
            対象になる支払データがありません。
          </div>
        ) : (
          <div className="overflow-x-auto border border-border bg-surface rounded-lg">
            <table className="w-full text-sm border-collapse min-w-[760px]">
              <thead>
                <tr className="border-b border-border bg-surface text-left text-xs text-muted-foreground">
                  <th className="py-2 px-3 font-semibold">クライアント</th>
                  <th className="py-2 px-3 font-semibold whitespace-nowrap">支払日</th>
                  <th className="py-2 px-3 font-semibold text-right whitespace-nowrap">支払金額</th>
                  <th className="py-2 px-3 font-semibold text-right whitespace-nowrap">期待値（参考）</th>
                  <th className="py-2 px-3 font-semibold text-right whitespace-nowrap">記録された源泉徴収税額</th>
                  <th className="py-2 px-3 font-semibold text-right whitespace-nowrap">差額</th>
                  <th className="py-2 px-3 font-semibold whitespace-nowrap">照合結果</th>
                </tr>
              </thead>
              <tbody>
                {records.map((r, i) => (
                  <tr
                    key={r.id ?? `${r.clientName}-${r.date ?? ""}-${i}`}
                    className={`border-b border-stone-200 last:border-b-0 ${
                      r.status === "discrepancy" ? "bg-amber-50" : ""
                    }`}
                  >
                    <td className="py-2.5 px-3 max-w-[10rem] truncate" title={r.clientName}>
                      {r.clientName}
                    </td>
                    <td className="py-2.5 px-3 text-xs whitespace-nowrap">{r.date ?? "—"}</td>
                    <td className="py-2.5 px-3 text-right tabular-nums whitespace-nowrap">
                      <Yen v={r.grossAmount} />
                    </td>
                    <td className="py-2.5 px-3 text-right tabular-nums whitespace-nowrap text-muted-foreground">
                      <Yen v={r.expectedWithholdingTax} />
                    </td>
                    <td className="py-2.5 px-3 text-right tabular-nums whitespace-nowrap">
                      <Yen v={r.recordedWithholdingTax} />
                    </td>
                    <td className="py-2.5 px-3 text-right tabular-nums whitespace-nowrap">
                      <Yen v={r.differenceYen} />
                    </td>
                    <td className="py-2.5 px-3 whitespace-nowrap">
                      {r.status === "discrepancy" ? (
                        <span className="inline-block rounded-sm bg-amber-100 px-1.5 py-0.5 text-xs text-amber-800">
                          要確認
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">一致</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p className="text-xs text-muted-foreground leading-relaxed">
        「期待値」は報酬・料金等に共通する標準税率（支払1回につき100万円以下の部分10.21%・超える部分20.42%）から
        機械的に算出した参考値であり、確定申告の税額控除にはクライアントが実際に源泉徴収した金額（記録された源泉徴収税額）を使用します。
        差異が大きい場合は、支払調書の記載内容をクライアントにご確認ください。
        このパネルはあくまで下書き・照合支援であり、税理士法に定める税務代理・税務書類の作成・個別具体的な税務相談には該当しません。
      </p>
    </div>
  );
}
