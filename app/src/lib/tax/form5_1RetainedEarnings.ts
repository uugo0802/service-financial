import { EquityChangeForm } from "./equityChangeForm";
import { Form5_2Result, TaxTypeRow } from "./form5_2TaxPaymentStatus";

// ------------------------------------------------------------------
// 「利益積立金額及び資本金等の額の計算に関する明細書 別表五（一）」の簡易生成。
//
// equityChangeForm.ts（株主資本等変動計算書）が算出する繰越損益金と、
// form5_2TaxPaymentStatus.ts（別表五（二）：租税公課の納付状況等に関する明細書）が
// 算出する納税充当金・各税目の未納税額を受け取り、税務上の利益積立金額および
// 資本金等の額の期首→期末の増減を計算する。実際に提出された別表五（一）を参照すると、
// 次の対応関係が確認できた:
//   - row25「繰越損益金」＝ equityChangeForm.ts の retainedEarnings.closingBalance（期首は openingBalance）
//   - row26「納税充当金」＝ 別表五（二）の期末納税充当金（期首は期首納税充当金）
//   - row27/29/30「未納法人税等／未納道府県民税／未納市町村民税」＝
//     別表五（二）の各税目の期首・期末現在未納税額（マイナス値として扱う。詳細は下記）
//   - row31「差引合計額」＝ 上記の合計（＝利益積立金額の合計）
//   - Ⅱ「資本金等の額の計算」＝ 資本金（増減なしの前提。equityChangeForm.tsと同じ簡易化）
//
// スコープ外（常に0円・空欄として扱う）:
//   - row1〜24（利益準備金・積立金等の個別の税務調整項目、未収還付税金）。
//     corporateForms.ts で「別表十四〜十六等の付表・調整は行っていない簡易版」と
//     明記の通り、個別の税務調整項目（減価償却超過額の否認等）を追跡していないため
//   - row28「未払通算税効果額」（グループ通算制度非対応のため対象外。form5_2と同じ理由）
//   - Ⅱの資本準備金・その他資本剰余金の増減（増資・減資・自己株式取得等）。
//     equityChangeForm.ts と同じ前提で、当期中の資本取引は発生していないものとして扱う
// ------------------------------------------------------------------

export interface Form5_1Inputs {
  equityChange: EquityChangeForm; // equityChangeForm.tsの結果（繰越損益金の期首・期末を取得）
  form5_2: Form5_2Result; // 別表五（二）の結果（納税充当金・各税目の未納額を取得）
  capitalStock: number; // 資本金（Ⅱ部用。equityChangeFormと同じ値を渡す）
}

export interface RetainedEarningsLine {
  label: string;
  openingBalance: number; // 期首現在利益積立金額（Ⅱ部は期首現在資本金等の額）
  // 当期の増減（増－減）。別表五(一)は「減」「増」を別列で持つが、このアプリでは
  // 正味の増減1列にまとめる。UI表示側で符号に応じて「増」「減」欄に振り分ける。
  change: number;
  closingBalance: number; // 差引翌期首現在利益積立金額（Ⅱ部は差引翌期首現在資本金等の額）
}

export interface Form5_1Result {
  retainedEarningsCarriedForward: RetainedEarningsLine; // row25 繰越損益金
  taxProvision: RetainedEarningsLine; // row26 納税充当金
  unpaidNationalTax: RetainedEarningsLine; // row27 未納法人税等（マイナス値として扱う）
  unpaidPrefectureTax: RetainedEarningsLine; // row29 未納道府県民税（マイナス値として扱う）
  unpaidMunicipalityTax: RetainedEarningsLine; // row30 未納市町村民税（マイナス値として扱う）
  retainedEarningsTotal: RetainedEarningsLine; // row31 差引合計額（利益積立金額の合計）
  capitalStock: RetainedEarningsLine; // row32（Ⅱ部）資本金又は出資金
  capitalTotal: RetainedEarningsLine; // row36（Ⅱ部）差引合計額
}

/**
 * 別表五（二）の税目1件分（TaxTypeRow）から、別表五（一）の未納税額の行を作る。
 * 未納税額は利益積立金額から控除する項目のため、マイナス値として扱う
 * （openingUnpaid・closingUnpaidをそのまま符号反転して使う）。
 */
function buildUnpaidTaxLine(label: string, row: TaxTypeRow): RetainedEarningsLine {
  const openingBalance = -row.openingUnpaid;
  const closingBalance = -row.closingUnpaid;
  return {
    label,
    openingBalance,
    change: closingBalance - openingBalance,
    closingBalance,
  };
}

/** 複数行の期首・当期の増減・期末を単純合計する。 */
function sumLines(
  ...lines: RetainedEarningsLine[]
): Pick<RetainedEarningsLine, "openingBalance" | "change" | "closingBalance"> {
  return {
    openingBalance: lines.reduce((s, l) => s + l.openingBalance, 0),
    change: lines.reduce((s, l) => s + l.change, 0),
    closingBalance: lines.reduce((s, l) => s + l.closingBalance, 0),
  };
}

export function buildForm5_1(inputs: Form5_1Inputs): Form5_1Result {
  const retainedEarningsCarriedForward: RetainedEarningsLine = {
    label: "繰越損益金",
    openingBalance: inputs.equityChange.retainedEarnings.openingBalance,
    change: inputs.equityChange.retainedEarnings.change,
    closingBalance: inputs.equityChange.retainedEarnings.closingBalance,
  };

  const taxProvision: RetainedEarningsLine = {
    label: "納税充当金",
    openingBalance: inputs.form5_2.taxProvision.openingProvision,
    change: inputs.form5_2.taxProvision.closingProvision - inputs.form5_2.taxProvision.openingProvision,
    closingBalance: inputs.form5_2.taxProvision.closingProvision,
  };

  const unpaidNationalTax = buildUnpaidTaxLine("未納法人税及び未納地方法人税", inputs.form5_2.nationalTaxRow);
  const unpaidPrefectureTax = buildUnpaidTaxLine("未納道府県民税", inputs.form5_2.prefectureTaxRow);
  const unpaidMunicipalityTax = buildUnpaidTaxLine("未納市町村民税", inputs.form5_2.municipalityTaxRow);

  // 差引合計額 = 繰越損益金 + 納税充当金 + (未納3種のマイナス値の合計)
  const retainedEarningsTotal: RetainedEarningsLine = {
    label: "差引合計額",
    ...sumLines(retainedEarningsCarriedForward, taxProvision, unpaidNationalTax, unpaidPrefectureTax, unpaidMunicipalityTax),
  };

  // Ⅱ 資本金等の額の計算。equityChangeForm.tsと同じ簡易化（当期中の資本取引なし）により、
  // 期首・期末とも常にcapitalStockと同額・増減0とする。
  const capitalStock: RetainedEarningsLine = {
    label: "資本金又は出資金",
    openingBalance: inputs.capitalStock,
    change: 0,
    closingBalance: inputs.capitalStock,
  };

  const capitalTotal: RetainedEarningsLine = {
    label: "差引合計額",
    openingBalance: inputs.capitalStock,
    change: 0,
    closingBalance: inputs.capitalStock,
  };

  return {
    retainedEarningsCarriedForward,
    taxProvision,
    unpaidNationalTax,
    unpaidPrefectureTax,
    unpaidMunicipalityTax,
    retainedEarningsTotal,
    capitalStock,
    capitalTotal,
  };
}
