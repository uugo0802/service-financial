// 勘定科目・消費税区分の自動判定ルール辞書（フリーランス/個人事業主 青色申告決算書、マイクロ法人 決算書ベース）
// 注意: これは MVP 用の簡易ルールであり、正式な税務判断ではありません。
// 最終的な勘定科目・税区分の確定は必ず利用者本人が確認してください。
// ルールは配列の先頭から順に評価され、最初にマッチしたものが採用されます。

export type TaxCategory =
  | "課税売上10%"
  | "課税仕入10%"
  | "課税仕入8%(軽減)"
  | "非課税"
  | "不課税"
  | "対象外"
  | "要確認";

export interface CategoryRule {
  /** 摘要文字列に対するマッチパターン */
  pattern: RegExp;
  account: string;
  taxCategory: TaxCategory;
  /** ルールがなぜその判定をしたかの短い説明（UIでの根拠表示用） */
  note?: string;
  /**
   * true の場合、個人事業主モードでは「事業の必要経費」から除外し、
   * 所得控除（社会保険料控除等）や参考情報として別枠で扱う。
   * マイクロ法人モードでは通常の経費として扱う（会社が負担する場合の福利厚生費等と区別しない簡易対応）。
   */
  personalDeductionOnly?: boolean;
}

export const EXPENSE_RULES: CategoryRule[] = [
  { pattern: /法定福利費|社会保険料.{0,4}(会社|法人)負担/, account: "法定福利費", taxCategory: "不課税" },
  { pattern: /家賃|賃貸|不動産管理/, account: "地代家賃", taxCategory: "課税仕入10%", note: "事業用と仮定。住居兼用の場合は家事按分が必要" },
  { pattern: /NTT|ドコモ|docomo|au(?!.{0,3}損保)|ソフトバンク|softbank|光回線|インターネット|プロバイダ/i, account: "通信費", taxCategory: "課税仕入10%" },
  { pattern: /電気|東京電力|関西電力|中部電力|水道局|ガス(?!ソリン)/, account: "水道光熱費", taxCategory: "課税仕入10%" },
  { pattern: /JR|ANA|JAL|Suica|PASMO|タクシー|新幹線|航空券|高速道路|ETC/i, account: "旅費交通費", taxCategory: "課税仕入10%" },
  { pattern: /Amazon|ヨドバシ|文房具|事務用品|コクヨ/i, account: "消耗品費", taxCategory: "課税仕入10%" },
  { pattern: /AWS|Google\s?Workspace|GCP|Adobe|Slack|Zoom|GitHub|Notion|Dropbox|Microsoft|サブスクリプション/i, account: "支払手数料(ソフトウェア利用料)", taxCategory: "課税仕入10%", note: "国外事業者のリバースチャージ対象の可能性あり、要確認" },
  { pattern: /振込手数料|送金手数料|PayPal|Stripe手数料|銀行手数料|口座維持手数料/i, account: "支払手数料", taxCategory: "課税仕入10%" },
  { pattern: /ヤマト|佐川|日本郵便|ゆうパック|レターパック|宅急便/, account: "荷造運賃", taxCategory: "課税仕入10%" },
  { pattern: /会議費|カフェ|喫茶|スターバックス|ドトール/i, account: "会議費", taxCategory: "課税仕入10%" },
  { pattern: /接待|懇親会|飲食(?!料品)/, account: "接待交際費", taxCategory: "課税仕入10%" },
  { pattern: /新聞/, account: "新聞図書費", taxCategory: "課税仕入8%(軽減)", note: "新聞の定期購読のみ軽減税率対象" },
  { pattern: /書籍|Kindle|本屋|紀伊国屋/i, account: "新聞図書費", taxCategory: "課税仕入10%" },
  {
    pattern: /国民健康保険|国民年金/,
    account: "社会保険料(個人)",
    taxCategory: "非課税",
    note: "個人事業主の場合、事業の必要経費ではなく所得控除（社会保険料控除）の対象です",
    personalDeductionOnly: true,
  },
  {
    pattern: /生命保険/,
    account: "生命保険料(個人)",
    taxCategory: "非課税",
    note: "生命保険料控除の対象となる可能性がありますが、控除額の上限計算は自動化していません（要ご自身で確認）。事業の必要経費には含めません",
    personalDeductionOnly: true,
  },
  { pattern: /損害保険|火災保険|賠償責任保険/, account: "損害保険料", taxCategory: "非課税", note: "事業用の損害保険料（青色申告決算書の経費科目）" },
  { pattern: /社会保険料/, account: "社会保険料(個人)", taxCategory: "非課税", personalDeductionOnly: true, note: "個人事業主の場合、事業の必要経費ではなく所得控除（社会保険料控除）の対象です" },
  { pattern: /所得税|住民税|印紙|租税公課|消費税(?!.{0,4}還付)/, account: "租税公課", taxCategory: "不課税" },
  { pattern: /給与|給料|賞与|外注費(?!.{0,4}消費税)/, account: "給料賃金/外注工賃", taxCategory: "不課税", note: "給与は不課税。外注（事業者への業務委託）は課税仕入となる場合あり、要確認" },
  { pattern: /役員報酬/, account: "役員報酬", taxCategory: "不課税", note: "法人の場合、定期同額給与でないと損金不算入になる可能性があり要確認" },
  { pattern: /広告|リスティング|Meta広告|Google広告|SNS広告/i, account: "広告宣伝費", taxCategory: "課税仕入10%" },
  { pattern: /セミナー|研修|講座受講/, account: "研修費", taxCategory: "課税仕入10%" },
  { pattern: /寄付|寄附/, account: "寄付金", taxCategory: "対象外", note: "寄付金は消費税の対象外（不課税）。法人の場合は損金算入限度額の計算が必要です" },
  { pattern: /諸会費|年会費|組合費|同業者団体/, account: "諸会費", taxCategory: "要確認", note: "対価性の有無により課税仕入/不課税の判定が分かれるため要確認" },
  { pattern: /修繕|リペア|メンテナンス/, account: "修繕費", taxCategory: "課税仕入10%" },
  { pattern: /福利厚生|健康診断|忘年会|懇親旅行/, account: "福利厚生費", taxCategory: "課税仕入10%" },
];

export const INCOME_RULES: CategoryRule[] = [
  { pattern: /返金|キャッシュバック|還付/, account: "雑収入", taxCategory: "対象外" },
  { pattern: /借入|融資|ローン実行/, account: "借入金", taxCategory: "対象外" },
  { pattern: /出資|資本金/, account: "元入金", taxCategory: "対象外" },
  { pattern: /利息|受取利子/, account: "受取利息", taxCategory: "非課税" },
];

export const DEFAULT_EXPENSE: CategoryRule = {
  pattern: /.*/,
  account: "要確認(未分類の経費)",
  taxCategory: "要確認",
};

export const DEFAULT_INCOME: CategoryRule = {
  pattern: /.*/,
  account: "売上高",
  taxCategory: "課税売上10%",
};
