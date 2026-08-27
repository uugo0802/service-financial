import { FixedAssetRow, JournalEntryRow, LoanRow } from "./supabaseClient";
import { listFixedAssets, toDepreciationAsset } from "./fixedAssets";
import { listLoans, toAmortizationLoan } from "./loans";
import { createJournalEntries, listJournalEntries, NewJournalEntryInput } from "./journalEntries";
import { calculateAssetDepreciation, FiscalPeriod } from "../tax/depreciation";
import { installmentsWithinPeriod } from "../tax/loanAmortization";

// ------------------------------------------------------------------
// 「現金を伴わない仕訳の自動生成」バッチ。
// docs/superpowers/specs/2026-08-26-double-entry-ledger-design.md ステージ③
// 「現金を伴わない仕訳の自動生成」節に対応する。
//
// - 減価償却: fixed_assets の各行 × 対象事業年度に対して depreciation.ts の
//   calculateAssetDepreciation() を呼び、結果を journal_entries
//   （借方: depreciation_expense_account_id、貸方: asset_account_id、source: 'generated'）
//   として1件（対象事業年度につき1行）書き込む。日付は対象事業年度の末日とする。
// - 借入金返済: loans の各行 × 対象期間内の返済回（月次）に対して loanAmortization.ts の
//   installmentsWithinPeriod() を呼び、利息部分（借方: interest_expense_account_id、
//   貸方: 現金・預金勘定）と元本部分（借方: liability_account_id、貸方: 現金・預金勘定）を
//   それぞれ journal_entries に書き込む（返済回ごとに2行）。
//
// 二重生成の防止: どちらも、journal_entries に該当する source: 'generated' 行が
// 既に存在するか（勘定科目のペア＋日付が一致するか）で判定する。この判定は
// 呼び出しの都度、直前に listJournalEntries() で取得した最新の一覧に対して行うため、
// 同じ期間に対して本関数を複数回呼び出しても安全（べき等）。
// ------------------------------------------------------------------

/** 現金・預金勘定として、借入金の返済仕訳の貸方に使う勘定科目ID。呼び出し側が解決して渡す。 */
export interface GeneratedEntriesOptions {
  /** 借入金の元利返済の貸方（現金・預金勘定）として使う勘定科目ID */
  cashAccountId: string;
}

export interface GenerationResult {
  createdCount: number;
  skippedCount: number; // 既に生成済みのため何もしなかった対象（資産・返済回）の件数
}

function isGeneratedMatch(entry: JournalEntryRow, debitAccountId: string, creditAccountId: string, date: string): boolean {
  return (
    entry.source === "generated" &&
    entry.debit_account_id === debitAccountId &&
    entry.credit_account_id === creditAccountId &&
    entry.date === date
  );
}

/**
 * 対象事業年度（fiscalPeriod）について、fixed_assets の各行 × 当期の減価償却仕訳を
 * journal_entries に生成する。資産ごとに「借方＝減価償却費勘定、貸方＝資産勘定、
 * 日付＝対象事業年度末日」の組み合わせが既に存在するかで二重生成を判定する
 * （1テナント内で同一の勘定科目ペアを複数の固定資産が共有していないことが前提）。
 * 除却済み（disposed_atが対象期間末以前）の資産、および当期償却額が0円の資産
 * （未取得・既に備忘価額まで償却済み等）は生成の対象外とする。
 */
export async function ensureDepreciationEntriesGenerated(tenantId: string, fiscalPeriod: FiscalPeriod): Promise<GenerationResult> {
  const [fixedAssetRows, existingEntries] = await Promise.all([listFixedAssets(tenantId), listJournalEntries(tenantId)]);

  const toCreate: NewJournalEntryInput[] = [];
  let skippedCount = 0;

  for (const row of fixedAssetRows) {
    if (row.disposed_at && row.disposed_at <= fiscalPeriod.end) continue; // 除却済みは対象外

    const alreadyGenerated = existingEntries.some((e) =>
      isGeneratedMatch(e, row.depreciation_expense_account_id, row.asset_account_id, fiscalPeriod.end)
    );
    if (alreadyGenerated) {
      skippedCount++;
      continue;
    }

    const result = calculateAssetDepreciation(toDepreciationAsset(row), fiscalPeriod);
    if (result.currentYearDepreciation <= 0) continue;

    toCreate.push({
      date: fiscalPeriod.end,
      debit_account_id: row.depreciation_expense_account_id,
      credit_account_id: row.asset_account_id,
      amount: result.currentYearDepreciation,
      description: `${row.name} 減価償却費（${fiscalPeriod.start}〜${fiscalPeriod.end}）`,
      tax_category: "対象外", // 減価償却費は資産の帳簿価額の振替であり課税仕入の対象外
      source: "generated",
    });
  }

  const created = await createJournalEntries(tenantId, toCreate);
  return { createdCount: created.length, skippedCount };
}

/**
 * 対象期間（fiscalPeriod。事業年度全体でも特定の1ヶ月でもよい）について、loans の各行 ×
 * 対象期間内の返済回（月次）の元本・利息返済仕訳を journal_entries に生成する。
 * 返済回ごとに「借方＝支払利息 or 借入金勘定、貸方＝現金・預金勘定、日付＝返済日」の
 * 組み合わせが既に存在するかで二重生成を判定する。
 */
export async function ensureLoanRepaymentEntriesGenerated(
  tenantId: string,
  period: FiscalPeriod,
  options: GeneratedEntriesOptions
): Promise<GenerationResult> {
  const [loanRows, existingEntries] = await Promise.all([listLoans(tenantId), listJournalEntries(tenantId)]);

  const toCreate: NewJournalEntryInput[] = [];
  let skippedCount = 0;

  for (const row of loanRows) {
    const installments = installmentsWithinPeriod(toAmortizationLoan(row), period);

    for (const installment of installments) {
      const interestAlreadyGenerated =
        installment.interestPayment > 0 &&
        existingEntries.some((e) => isGeneratedMatch(e, row.interest_expense_account_id, options.cashAccountId, installment.paymentDate));
      const principalAlreadyGenerated =
        installment.principalPayment > 0 &&
        existingEntries.some((e) => isGeneratedMatch(e, row.liability_account_id, options.cashAccountId, installment.paymentDate));

      if ((interestAlreadyGenerated || installment.interestPayment <= 0) && (principalAlreadyGenerated || installment.principalPayment <= 0)) {
        skippedCount++;
        continue;
      }

      if (installment.interestPayment > 0 && !interestAlreadyGenerated) {
        toCreate.push({
          date: installment.paymentDate,
          debit_account_id: row.interest_expense_account_id,
          credit_account_id: options.cashAccountId,
          amount: installment.interestPayment,
          description: `${row.name} 第${installment.installmentNumber}回返済（利息）`,
          tax_category: "非課税", // 支払利息は消費税非課税取引
          source: "generated",
        });
      }
      if (installment.principalPayment > 0 && !principalAlreadyGenerated) {
        toCreate.push({
          date: installment.paymentDate,
          debit_account_id: row.liability_account_id,
          credit_account_id: options.cashAccountId,
          amount: installment.principalPayment,
          description: `${row.name} 第${installment.installmentNumber}回返済（元本）`,
          tax_category: "対象外", // 元本返済は負債の減少であり課税仕入の対象外
          source: "generated",
        });
      }
    }
  }

  const created = await createJournalEntries(tenantId, toCreate);
  return { createdCount: created.length, skippedCount };
}

export interface EnsureGeneratedEntriesResult {
  depreciation: GenerationResult;
  loanRepayment: GenerationResult;
}

/**
 * 減価償却・借入金返済の両方の自動生成をまとめて実行する。
 * trial-balance/financial-statements 等、実データの貸借対照表を表示するページの
 * 読み込み前にこれを呼び出し、対象事業年度の生成済み仕訳が揃っていることを保証してから
 * balanceSheetForm.ts 等で残高を積み上げる想定（現金の期末残高はjournal_entriesから
 * 積み上げるため、生成バッチが未実行だと固定資産・借入金の帳簿価額とキャッシュフローの
 * 整合が取れない。balanceSheetForm.tsファイル冒頭のコメント参照）。
 */
export async function ensureGeneratedEntries(
  tenantId: string,
  fiscalPeriod: FiscalPeriod,
  options: GeneratedEntriesOptions
): Promise<EnsureGeneratedEntriesResult> {
  const [depreciation, loanRepayment] = await Promise.all([
    ensureDepreciationEntriesGenerated(tenantId, fiscalPeriod),
    ensureLoanRepaymentEntriesGenerated(tenantId, fiscalPeriod, options),
  ]);
  return { depreciation, loanRepayment };
}

// テスト・下流モジュールから型を参照しやすいよう re-export しておく
export type { FixedAssetRow, LoanRow };
