import { CategorizedTransaction } from "../categorize/engine";

// ------------------------------------------------------------------
// 勘定科目内訳明細書（簡易版）。
//
// 正式な様式は「現金預金」「売掛金」「買掛金」「借入金」等、期末残高（ストック）を
// 前提とする科目も含むが、このアプリは取引明細（フロー情報）しか保持していない。
// そのため、フローだけで作成できる範囲＝損益計算書上の主要科目について、
// 摘要文字列から推定した取引先ごとの金額内訳（「地代家賃の内訳書」「外注費の内訳書」等）
// のみを生成する。取引先名は摘要文字列をそのまま使用しており、正式な内訳書のような
// 名寄せ（同一取引先の表記ゆれの統合）は行っていない。
// ------------------------------------------------------------------

export interface BreakdownLine {
  counterparty: string;
  amount: number;
  transactionCount: number;
}

export interface AccountBreakdown {
  account: string;
  lines: BreakdownLine[];
  total: number;
}

// 内訳書として実務上よく重要視される主要科目のみ対象とする（それ以外は明細対象外）。
const TARGET_ACCOUNTS = [
  "地代家賃",
  "給料賃金/外注工賃",
  "支払手数料(ソフトウェア利用料)",
  "支払手数料",
  "広告宣伝費",
  "接待交際費",
  "役員報酬",
  "雑収入",
];

// 単独の取引先内訳としては開示しない小口科目を除外する下限額。
const MINOR_LINE_THRESHOLD = 0;

function normalizeCounterparty(description: string): string {
  return description.trim() || "（摘要不明）";
}

export function buildAccountBreakdownForms(rows: CategorizedTransaction[]): AccountBreakdown[] {
  const byAccount = new Map<string, CategorizedTransaction[]>();
  for (const r of rows) {
    if (!TARGET_ACCOUNTS.includes(r.account)) continue;
    const list = byAccount.get(r.account) ?? [];
    list.push(r);
    byAccount.set(r.account, list);
  }

  const result: AccountBreakdown[] = [];
  for (const [account, txs] of byAccount.entries()) {
    const byCounterparty = new Map<string, { amount: number; count: number }>();
    for (const tx of txs) {
      const key = normalizeCounterparty(tx.description);
      const cur = byCounterparty.get(key) ?? { amount: 0, count: 0 };
      cur.amount += Math.abs(tx.amount);
      cur.count += 1;
      byCounterparty.set(key, cur);
    }

    const lines = Array.from(byCounterparty.entries())
      .map(([counterparty, v]) => ({ counterparty, amount: v.amount, transactionCount: v.count }))
      .filter((l) => l.amount > MINOR_LINE_THRESHOLD)
      .sort((a, b) => b.amount - a.amount);

    const total = lines.reduce((s, l) => s + l.amount, 0);
    if (total > 0) result.push({ account, lines, total });
  }

  return result.sort((a, b) => b.total - a.total);
}
