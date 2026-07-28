import { CategorizedTransaction } from "../categorize/engine";

// ------------------------------------------------------------------
// 事業概況説明書（簡易版）。
//
// 正式様式には「従業者数」「主な事業内容」「経理の方法」等、取引明細からは
// 読み取れない情報が多く含まれる。そのため、それらは利用者にテキスト入力
// してもらい、このモジュールは「売上高の月別推移」など取引明細から機械的に
// 算出できる部分のみを補完する。
// ------------------------------------------------------------------

export interface BusinessProfileInputs {
  industry: string; // 業種
  businessDescription: string; // 事業内容の概要
  employeeCount: string; // 従業者数（役員含む、任意記載なので文字列で保持）
  mainClients: string; // 主要な取引先（改行区切り等、自由記述）
}

export interface MonthlySales {
  month: string; // "YYYY-MM"。日付が解釈できなかった行は "不明" にまとめる
  amount: number;
  transactionCount: number;
}

function extractMonth(date: string): string {
  const m = date.match(/^(\d{4})[-/](\d{1,2})/);
  if (!m) return "不明";
  return `${m[1]}-${m[2].padStart(2, "0")}`;
}

export function buildMonthlySalesTrend(rows: CategorizedTransaction[]): MonthlySales[] {
  // 借入金の実行・出資の払込等（nonRevenue）は入金でも売上ではないため除外する
  const income = rows.filter((r) => r.amount > 0 && !r.nonRevenue);
  const byMonth = new Map<string, { amount: number; count: number }>();

  for (const r of income) {
    const key = extractMonth(r.date);
    const cur = byMonth.get(key) ?? { amount: 0, count: 0 };
    cur.amount += r.amount;
    cur.count += 1;
    byMonth.set(key, cur);
  }

  return Array.from(byMonth.entries())
    .map(([month, v]) => ({ month, amount: v.amount, transactionCount: v.count }))
    .sort((a, b) => (a.month < b.month ? -1 : a.month > b.month ? 1 : 0));
}
