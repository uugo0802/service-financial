import { CategorizedTransaction } from "../categorize/engine";
import { IndividualEstimate } from "./estimate";
import { CorporateEstimate } from "./corporateEstimate";

// ------------------------------------------------------------------
// 免責: 税理士法第2条により、税務相談（個別具体の税務判断・最適化助言）は
// 税理士の独占業務です。この機能は一般的な制度の解説と、試算結果から見て
// 当てはまりそうな項目のハイライトに留め、個別最適化された助言は行いません。
// 必ず「一般的な情報提供」であることをUIに明示し、税理士への相談を促してください。
// ------------------------------------------------------------------

export const TAX_SAVING_DISCLAIMER =
  "これは一般的な制度の情報提供であり、個別具体の税務相談ではありません。ご自身の状況に応じた最適な選択については、税理士にご相談ください。";

export interface TaxSavingChecklistItem {
  id: string;
  title: string;
  /** 制度の一般的な解説（個別の最適化助言ではない） */
  summary: string;
  /** 試算結果からみて当てはまりそうか（あくまで目安） */
  highlight: boolean;
  /** ハイライト理由、または該当しない場合の補足（一般的な解説の範囲に留める） */
  note: string;
}

export interface TaxSavingChecklist {
  items: TaxSavingChecklistItem[];
  disclaimer: string;
}

const IDECO_HIGHLIGHT_MARGINAL_RATE = 20; // 所得税率20%以上は掛金控除の節税メリットが相対的に大きくなりやすい目安
const INCORPORATION_CONSIDERATION_PROFIT = 8_000_000; // 法人成り検討の目安としてよく引用される事業所得水準
const SAFETY_MUTUAL_AID_TAXABLE_INCOME = 8_000_000; // 軽減税率の上限と同水準を「利益が出ている」目安として使用

const INDIVIDUAL_EXPENSE_CHECK_ACCOUNTS = ["地代家賃", "通信費", "新聞図書費", "研修費", "車両費"];
const CORP_EXPENSE_CHECK_ACCOUNTS = ["地代家賃", "会議費", "研修費", "福利厚生費", "広告宣伝費"];

function usedExpenseAccounts(rows: CategorizedTransaction[]): Set<string> {
  return new Set(rows.filter((r) => r.amount < 0).map((r) => r.account));
}

function missingExpenseCategories(rows: CategorizedTransaction[], candidates: string[]): string[] {
  if (rows.length === 0) return [];
  const used = usedExpenseAccounts(rows);
  return candidates.filter((c) => !used.has(c));
}

export function buildIndividualTaxSavingChecklist(
  estimate: IndividualEstimate,
  rows: CategorizedTransaction[] = []
): TaxSavingChecklist {
  const hasProfit = estimate.businessProfit > 0;
  const marginalRate = estimate.incomeTax.marginalRate;
  const missing = missingExpenseCategories(rows, INDIVIDUAL_EXPENSE_CHECK_ACCOUNTS);
  const underusedBlueDeduction = hasProfit && estimate.businessProfit < 650_000;

  const items: TaxSavingChecklistItem[] = [
    {
      id: "blueReturnDeductionUsage",
      title: "青色申告特別控除の活用状況",
      summary:
        "e-Taxでの申告・複式簿記による記帳など要件を満たすと、青色申告特別控除（最大65万円）を事業所得から差し引けます。",
      highlight: underusedBlueDeduction,
      note: underusedBlueDeduction
        ? "事業所得が65万円を下回っているため、控除額の全部を使い切れていない可能性があります。要件（e-Tax提出・複式簿記等）を満たしているかも合わせてご確認ください。"
        : "本試算では65万円の満額適用を仮定しています。e-Tax提出・複式簿記など適用要件を満たしているかご確認ください。",
    },
    {
      id: "smallBusinessMutualAid",
      title: "小規模企業共済",
      summary:
        "個人事業主等が加入できる制度で、掛金（月1,000円〜7万円）の全額が所得控除（小規模企業共済等掛金控除）の対象になります。",
      highlight: hasProfit,
      note: hasProfit
        ? "事業所得がプラスのため、掛金控除による節税余地がある可能性があります。"
        : "事業所得がプラスの年に検討されることが多い制度です。",
    },
    {
      id: "ideco",
      title: "iDeCo（個人型確定拠出年金）",
      summary: "掛金の全額が小規模企業共済等掛金控除の対象となる私的年金制度です。掛金上限は国民年金の加入状況等により異なります。",
      highlight: marginalRate >= IDECO_HIGHLIGHT_MARGINAL_RATE,
      note:
        marginalRate >= IDECO_HIGHLIGHT_MARGINAL_RATE
          ? `所得税の限界税率が${marginalRate}%のため、掛金控除による節税効果が相対的に大きくなりやすい水準です。`
          : "税率が低い場合でも将来の資産形成として検討する価値はありますが、節税効果は相対的に小さくなります。",
    },
    {
      id: "invoiceRegistration",
      title: "消費税の課税事業者選択（インボイス制度）",
      summary:
        "課税売上高が1,000万円以下でも、適格請求書発行事業者として課税事業者を選択することで取引先との関係が変わる場合があります。免税事業者のままとの損得は取引先の状況により異なります。",
      highlight: estimate.consumptionTax.isLikelyExempt,
      note: estimate.consumptionTax.isLikelyExempt
        ? "課税売上高が1,000万円以下のため免税事業者となる可能性があります。取引先が仕入税額控除を必要とするかどうかで、課税事業者選択の要否が変わります。"
        : "課税売上高が1,000万円を超えており、課税事業者に該当する可能性が高い水準です。",
    },
    {
      id: "incorporationThreshold",
      title: "法人成り（法人化）のメリット目安",
      summary:
        "事業所得の水準によっては、法人化により社会保険料の扱いや税率構造が変わり、手取りに影響する場合があります。一般的には年間の事業所得が一定水準（目安800万円前後）を超えると検討されることが多いとされています。",
      highlight: estimate.businessProfit >= INCORPORATION_CONSIDERATION_PROFIT,
      note:
        estimate.businessProfit >= INCORPORATION_CONSIDERATION_PROFIT
          ? "事業所得が法人成り検討の目安とされる水準に達しています。あくまで一般的な目安であり、個別の損得は社会保険料負担や役員報酬設計等により異なります。"
          : "一般的な目安の水準にはまだ達していません。",
    },
    {
      id: "missingExpenseCategories",
      title: "経費計上の見落としチェック",
      summary: "地代家賃（自宅兼事務所の家事按分）、通信費、新聞図書費、研修費、車両費などは見落とされやすい経費科目です。",
      highlight: rows.length > 0 && missing.length > 0,
      note:
        rows.length === 0
          ? "取引データが未取込のため判定できません。"
          : missing.length > 0
            ? `今回の取込データには次の科目の計上が見当たりません（該当する支出があれば計上をご検討ください）: ${missing.join("、")}`
            : "確認した範囲では主要な経費科目は計上されているようです。",
    },
  ];

  return { items, disclaimer: TAX_SAVING_DISCLAIMER };
}

export function buildCorporateTaxSavingChecklist(
  estimate: CorporateEstimate,
  rows: CategorizedTransaction[] = []
): TaxSavingChecklist {
  const isProfitable = estimate.taxableIncome > 0;
  const isLoss = estimate.expenses > estimate.revenue;
  const missing = missingExpenseCategories(rows, CORP_EXPENSE_CHECK_ACCOUNTS);

  const items: TaxSavingChecklistItem[] = [
    {
      id: "corpSmallBusinessMutualAid",
      title: "小規模企業共済（役員個人の加入）",
      summary:
        "常時使用する従業員数が一定数以下の会社の役員が個人として加入できる制度です。掛金（月1,000円〜7万円）は役員個人の所得控除（小規模企業共済等掛金控除）の対象で、法人の損金にはなりません。",
      highlight: isProfitable,
      note: isProfitable
        ? "課税所得がプラスのため、役員個人の所得控除としての活用余地がある可能性があります。"
        : "課税所得がプラスの年に検討されることが多い制度です。",
    },
    {
      id: "safetyMutualAid",
      title: "経営セーフティ共済（中小企業倒産防止共済）",
      summary:
        "取引先の倒産等に備える共済制度で、掛金（年間最大240万円、累計800万円まで）を法人の損金に算入できます。40か月以上納付すると解約時に全額戻る仕組みです。",
      highlight: estimate.taxableIncome >= SAFETY_MUTUAL_AID_TAXABLE_INCOME,
      note:
        estimate.taxableIncome >= SAFETY_MUTUAL_AID_TAXABLE_INCOME
          ? "課税所得が軽減税率の上限相当を超えており、利益水準として損金算入の効果が相対的に大きくなりやすい状況です。"
          : "利益が出てきた段階で検討されることが多い制度です。",
    },
    {
      id: "corpBlueReturnLossCarryforward",
      title: "法人の青色申告と欠損金の繰越控除",
      summary:
        "青色申告の承認を受けた法人は、赤字（欠損金）を最大10年間繰り越し、将来の黒字と相殺できます。承認申請には設立日等に応じた提出期限があります。",
      highlight: isLoss,
      note: isLoss
        ? "今期は経費が収入を上回っているようです。青色申告の承認を受けていれば、この欠損金を将来の黒字と相殺できる可能性があります（承認済みか要確認）。"
        : "今期は黒字水準のため直接の対象ではありませんが、将来の赤字に備えて青色申告の承認状況を確認しておくと安心です。",
    },
    {
      id: "corpInvoiceRegistration",
      title: "消費税の課税事業者選択（インボイス制度）",
      summary:
        "設立直後や資本金の状況によっては免税事業者に該当する場合がありますが、適格請求書発行事業者として課税事業者を選択するかどうかは取引先との関係により判断が分かれます。",
      highlight: estimate.consumptionTax.isLikelyExempt,
      note: estimate.consumptionTax.isLikelyExempt
        ? "課税売上高が1,000万円以下のため免税事業者となる可能性があります。取引先が仕入税額控除を必要とするかどうかで、課税事業者選択の要否が変わります。"
        : "課税売上高が1,000万円を超えており、課税事業者に該当する可能性が高い水準です。",
    },
    {
      id: "corpMissingExpenseCategories",
      title: "経費計上の見落としチェック",
      summary: "地代家賃、会議費、研修費、福利厚生費、広告宣伝費などは法人でも見落とされやすい経費科目です。",
      highlight: rows.length > 0 && missing.length > 0,
      note:
        rows.length === 0
          ? "取引データが未取込のため判定できません。"
          : missing.length > 0
            ? `今回の取込データには次の科目の計上が見当たりません（該当する支出があれば計上をご検討ください）: ${missing.join("、")}`
            : "確認した範囲では主要な経費科目は計上されているようです。",
    },
  ];

  return { items, disclaimer: TAX_SAVING_DISCLAIMER };
}
