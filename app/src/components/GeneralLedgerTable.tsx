import { GeneralLedgerResult } from "@/lib/journal/generalLedger";

// ------------------------------------------------------------------
// 総勘定元帳（General Ledger）の表示テーブル。
// データ計算（app/src/lib/journal/generalLedger.ts）を取り込まない純粋な表示コンポーネント
// （サーバーコンポーネントとしても利用可能）。カード＋テーブルのスタイルは
// ReceivablesAgingTable.tsx の構成に合わせている。
// ------------------------------------------------------------------

const yen = new Intl.NumberFormat("ja-JP", { style: "currency", currency: "JPY", maximumFractionDigits: 0 });

function Yen({ v }: { v: number }) {
  return <span className="tabular-nums">{yen.format(v)}</span>;
}

export function GeneralLedgerTable({ result }: { result: GeneralLedgerResult }) {
  const hasRows = result.rows.length > 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="border border-border bg-surface rounded-lg p-4">
          <p className="text-xs text-muted-foreground">前期繰越</p>
          <p className="text-xl font-semibold tabular-nums mt-1">
            <Yen v={result.openingBalance} />
          </p>
        </div>
        <div className="border border-border bg-surface rounded-lg p-4">
          <p className="text-xs text-muted-foreground">借方合計</p>
          <p className="text-xl font-semibold tabular-nums mt-1">
            <Yen v={result.totalDebit} />
          </p>
        </div>
        <div className="border border-border bg-surface rounded-lg p-4">
          <p className="text-xs text-muted-foreground">貸方合計</p>
          <p className="text-xl font-semibold tabular-nums mt-1">
            <Yen v={result.totalCredit} />
          </p>
        </div>
        <div className="border border-border bg-surface rounded-lg p-4">
          <p className="text-xs text-muted-foreground">期末残高</p>
          <p className="text-xl font-semibold tabular-nums mt-1">
            <Yen v={result.closingBalance} />
          </p>
          <p className="text-xs text-muted-foreground mt-1">仕訳 {result.rows.length}件</p>
        </div>
      </div>

      <div>
        <h3 className="text-sm font-semibold mb-2">
          「{result.account || "（勘定科目未選択）"}」の総勘定元帳（日付順）
        </h3>
        {!hasRows ? (
          <div className="border border-dashed border-border bg-surface rounded-lg p-6 text-center text-sm text-muted-foreground">
            該当する仕訳がありません。科目や期間の条件を見直してください。
          </div>
        ) : (
          <div className="overflow-x-auto border border-border bg-surface rounded-lg">
            <table className="w-full text-sm border-collapse min-w-[640px]">
              <thead>
                <tr className="border-b border-border bg-surface text-left text-xs text-muted-foreground">
                  <th className="py-2 px-3 font-semibold whitespace-nowrap">日付</th>
                  <th className="py-2 px-3 font-semibold">摘要</th>
                  <th className="py-2 px-3 font-semibold whitespace-nowrap">消費税区分</th>
                  <th className="py-2 px-3 font-semibold text-right whitespace-nowrap">借方</th>
                  <th className="py-2 px-3 font-semibold text-right whitespace-nowrap">貸方</th>
                  <th className="py-2 px-3 font-semibold text-right whitespace-nowrap">残高</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-stone-200 last:border-b-0 bg-stone-50/60">
                  <td className="py-2 px-3 text-xs text-muted-foreground" colSpan={5}>
                    前期繰越
                  </td>
                  <td className="py-2 px-3 text-right tabular-nums text-xs text-muted-foreground">
                    <Yen v={result.openingBalance} />
                  </td>
                </tr>
                {result.rows.map((row) => (
                  <tr key={row.id} className="border-b border-stone-200 last:border-b-0">
                    <td className="py-2.5 px-3 whitespace-nowrap tabular-nums">{row.date}</td>
                    <td className="py-2.5 px-3 max-w-xs truncate" title={row.note ?? row.description}>
                      {row.description}
                      {row.note && <span className="text-muted-foreground"> ／ {row.note}</span>}
                    </td>
                    <td className="py-2.5 px-3 text-xs whitespace-nowrap">{row.taxCategory}</td>
                    <td className="py-2.5 px-3 text-right tabular-nums whitespace-nowrap">
                      {row.debit > 0 ? <Yen v={row.debit} /> : <span className="text-muted-foreground">－</span>}
                    </td>
                    <td className="py-2.5 px-3 text-right tabular-nums whitespace-nowrap">
                      {row.credit > 0 ? <Yen v={row.credit} /> : <span className="text-muted-foreground">－</span>}
                    </td>
                    <td className="py-2.5 px-3 text-right tabular-nums font-medium whitespace-nowrap">
                      <Yen v={row.balance} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p className="text-xs text-muted-foreground leading-relaxed">
        残高は「前期繰越＋借方累計－貸方累計」で機械的に計算した参考値です。この一覧は記帳内容の確認を補助するものであり、
        税理士法に定める税務代理・税務書類の作成・税務相談を提供するものではありません。内容は必ずご自身でご確認ください。
      </p>
    </div>
  );
}
