// 提携税理士へ引き継ぐための「記帳データ・ハンドオフパッケージ」の組み立て。
//
// advisor-referral（提携税理士への紹介）フォームで送客を申し込んだユーザーが、
// 記帳データ一式（仕訳明細・合計残高試算表）とそれらの内容を説明するカバーシートを
// まとめて税理士に渡せるようにするための純粋関数群。
//
// 既存の書き出しロジックをそのまま再利用し、ここでは「束ね方」と
// カバーシートの文面生成のみを担当する（計算ロジックの再実装は行わない）:
//   - 仕訳明細CSV・税額概算サマリー: export/journalExport.ts の buildJournalExportCsv をそのまま利用
//   - 合計残高試算表の集計: tax/trialBalance.ts の buildTrialBalance をそのまま利用
//     （trialBalance.ts自体はCSV出力を持たないため、CSVへの変換だけはここで新規に行う）
//
// 免責: これは記帳データの受け渡し（データハンドオフ）であり、当社が税務代理・
// 個別具体的な税務相談を行うものではない（journalExport.ts の EXPORT_DISCLAIMER と同じ位置づけ）。

import { CategorizedTransaction } from "../categorize/engine";
import { EXPORT_DISCLAIMER, TaxEstimateSummaryInput, buildJournalExportCsv } from "../export/journalExport";
import { BuildTrialBalanceOptions, TrialBalance, buildTrialBalance } from "../tax/trialBalance";

const CRLF = "\r\n";

/**
 * RFC4180準拠のフィールドエスケープ。journalExport.tsのescapeCsvFieldと同じ規則だが、
 * journalExport.tsはこのヘルパーをエクスポートしていないため、合計残高試算表のCSV化用に
 * ここで独立して用意する（試算表の集計ロジック自体はbuildTrialBalanceの再利用に徹し、
 * 重複させていない）。
 */
function escapeCsvField(value: string | number): string {
  const str = String(value);
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function toCsvRow(fields: (string | number)[]): string {
  return fields.map(escapeCsvField).join(",");
}

function buildCsvBlock(rows: (string | number)[][]): string {
  return rows.map(toCsvRow).join(CRLF);
}

export const TRIAL_BALANCE_CSV_HEADERS = ["勘定科目", "前期繰越高", "当期借方合計", "当期貸方合計", "残高"] as const;

/**
 * buildTrialBalance()の出力をCSV文字列に変換する（ヘッダー行・合計行を含む）。
 * openingBalance/closingBalanceはTrialBalanceLineの規約通り、借方残高をプラス・
 * 貸方残高をマイナスで表す単一列とする（journalExport.tsの金額列と同じ「符号付き1列」方式）。
 */
export function trialBalanceToCsv(tb: TrialBalance): string {
  const rows: (string | number)[][] = [
    [...TRIAL_BALANCE_CSV_HEADERS],
    ...tb.lines.map((line) => [line.account, line.openingBalance, line.periodDebit, line.periodCredit, line.closingBalance]),
    [
      "合計",
      tb.openingDebitTotal - tb.openingCreditTotal,
      tb.periodDebitTotal,
      tb.periodCreditTotal,
      tb.closingDebitTotal - tb.closingCreditTotal,
    ],
  ];
  return buildCsvBlock(rows);
}

/** entriesのdate（YYYY-MM-DD）から年を取り出し、重複を除いた昇順の配列にする */
function fiscalYearsCovered(entries: CategorizedTransaction[]): number[] {
  const years = new Set<number>();
  for (const entry of entries) {
    const year = Number(entry.date.slice(0, 4));
    if (Number.isFinite(year) && entry.date.length >= 4) {
      years.add(year);
    }
  }
  return Array.from(years).sort((a, b) => a - b);
}

/** entriesのdateの最小・最大（文字列としての昇順ソートで求まる。YYYY-MM-DD形式なら日付順と一致する） */
function journalPeriod(entries: CategorizedTransaction[]): { periodStart: string; periodEnd: string } {
  if (entries.length === 0) {
    return { periodStart: "-", periodEnd: "-" };
  }
  const dates = entries.map((e) => e.date).sort();
  return { periodStart: dates[0], periodEnd: dates[dates.length - 1] };
}

export interface DataHandoffOptions {
  /** 引き渡し対象の仕訳データ */
  entries: CategorizedTransaction[];
  /** あれば税額概算サマリーも束ねる（journalExport.tsと同じ入力形式） */
  taxEstimate?: TaxEstimateSummaryInput;
  /** 合計残高試算表の集計オプション（現金科目名・前期繰越高・対象期間）。省略時は全期間・既定の現金科目で集計する */
  trialBalanceOptions?: BuildTrialBalanceOptions;
  /** カバーシートに記載する、お渡し先（提携税理士事務所名等）のラベル（任意） */
  recipientLabel?: string;
  /** テスト・スナップショットの再現性のため注入可能。未指定時は現在時刻を使用する */
  generatedAt?: Date;
}

export interface DataHandoffPackage {
  /** 出力日時（ISO 8601） */
  generatedAt: string;
  /** 引き渡す仕訳明細の件数 */
  entryCount: number;
  /** 仕訳明細に含まれる最も古い取引日（YYYY-MM-DD）。取引がない場合は"-" */
  periodStart: string;
  /** 仕訳明細に含まれる最も新しい取引日（YYYY-MM-DD）。取引がない場合は"-" */
  periodEnd: string;
  /** 仕訳明細に含まれる会計年度（西暦）の一覧、昇順・重複なし */
  fiscalYears: number[];
  /** fiscalYearsが2件以上ある場合true（複数年度分のデータが1パッケージに混在していることを示す） */
  spansMultipleFiscalYears: boolean;
  /** 合計残高試算表（構造化データ、tax/trialBalance.tsのbuildTrialBalanceの出力そのもの） */
  trialBalance: TrialBalance;
  /** 対象期間内に取引が1件もなく、試算表に計上された科目がない場合false */
  hasTrialBalanceActivity: boolean;
  /** 仕訳明細CSV（あれば税額概算サマリーを含む）。journalExport.tsのbuildJournalExportCsvの出力そのもの */
  journalExportCsv: string;
  /** 合計残高試算表のCSV */
  trialBalanceCsv: string;
  /** カバーシート（Markdown形式のプレーンテキスト） */
  coverSheetMarkdown: string;
}

function buildCoverSheetMarkdown(pkg: {
  generatedAt: string;
  entryCount: number;
  periodStart: string;
  periodEnd: string;
  fiscalYears: number[];
  spansMultipleFiscalYears: boolean;
  trialBalance: TrialBalance;
  hasTrialBalanceActivity: boolean;
  hasTaxEstimate: boolean;
  recipientLabel?: string;
}): string {
  const lines: string[] = [];

  lines.push("# 税理士への記帳データ引き継ぎパッケージ");
  lines.push("");
  lines.push(`作成日時: ${pkg.generatedAt}`);
  if (pkg.recipientLabel) {
    lines.push(`お渡し先: ${pkg.recipientLabel}`);
  }
  lines.push("");

  lines.push("## 対象期間");
  if (pkg.entryCount === 0) {
    lines.push("対象期間のデータがありません（記帳された取引がありません）。");
  } else {
    lines.push(`${pkg.periodStart} 〜 ${pkg.periodEnd}（仕訳明細 ${pkg.entryCount}件）`);
    if (pkg.spansMultipleFiscalYears) {
      lines.push(
        `※ このパッケージには複数の会計年度（${pkg.fiscalYears.join("年、")}年）のデータが含まれています。年度ごとの区切りが必要な場合は、仕訳明細CSVの日付列でご確認ください。`
      );
    }
  }
  lines.push("");

  lines.push("## 含まれるデータ");
  lines.push(`- 仕訳明細CSV: ${pkg.entryCount}件`);
  if (pkg.hasTrialBalanceActivity) {
    lines.push(
      `- 合計残高試算表CSV: ${pkg.trialBalance.lines.length}科目（対象期間 ${pkg.trialBalance.periodStart} 〜 ${pkg.trialBalance.periodEnd}、貸借${
        pkg.trialBalance.balanced ? "一致" : "不一致（前期繰越高等の入力値をご確認ください）"
      }）`
    );
  } else {
    lines.push("- 合計残高試算表CSV: 対象期間に計上された科目がないため、ヘッダー行のみの空データです。");
  }
  lines.push(`- 税額概算サマリー: ${pkg.hasTaxEstimate ? "仕訳明細CSVの末尾に含まれています" : "含まれていません"}`);
  lines.push("");

  lines.push("## ご利用にあたって");
  lines.push(EXPORT_DISCLAIMER);
  lines.push(
    "本パッケージは記帳データの受け渡し（データハンドオフ）を目的としたものであり、当社が税理士法上の税務代理・税務書類の作成・個別具体的な税務相談を行うものではありません。内容のご確認・最終的な申告書の作成は、お客様ご自身または提携税理士等の専門家にご依頼ください。"
  );

  return lines.join("\n") + "\n";
}

/**
 * 仕訳明細・合計残高試算表・カバーシートを1つのパッケージにまとめる。
 * journalExport.ts / trialBalance.tsの計算・CSV生成ロジックをそのまま再利用し、
 * ここでは束ね方とカバーシートの文面生成のみを行う（純粋関数、副作用なし）。
 */
export function buildDataHandoffPackage(options: DataHandoffOptions): DataHandoffPackage {
  const generatedAt = options.generatedAt ?? new Date();
  const { entries, taxEstimate, trialBalanceOptions, recipientLabel } = options;

  const { periodStart, periodEnd } = journalPeriod(entries);
  const fiscalYears = fiscalYearsCovered(entries);

  const trialBalance = buildTrialBalance(entries, trialBalanceOptions);
  const hasTrialBalanceActivity = trialBalance.lines.length > 0;

  const journalExportCsv = buildJournalExportCsv({ entries, taxEstimate, generatedAt });
  const trialBalanceCsv = trialBalanceToCsv(trialBalance);

  const generatedAtIso = generatedAt.toISOString();

  const coverSheetMarkdown = buildCoverSheetMarkdown({
    generatedAt: generatedAtIso,
    entryCount: entries.length,
    periodStart,
    periodEnd,
    fiscalYears,
    spansMultipleFiscalYears: fiscalYears.length > 1,
    trialBalance,
    hasTrialBalanceActivity,
    hasTaxEstimate: !!taxEstimate,
    recipientLabel,
  });

  return {
    generatedAt: generatedAtIso,
    entryCount: entries.length,
    periodStart,
    periodEnd,
    fiscalYears,
    spansMultipleFiscalYears: fiscalYears.length > 1,
    trialBalance,
    hasTrialBalanceActivity,
    journalExportCsv,
    trialBalanceCsv,
    coverSheetMarkdown,
  };
}
