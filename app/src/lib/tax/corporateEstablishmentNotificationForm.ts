// ------------------------------------------------------------------
// マイクロ法人（新設法人）が設立直後に提出すべき届出書・申請書一式の下書きデータ生成。
//
// 対象は次の3種類（設立直後に必要となる代表的な書類。開業届に相当する個人事業主向けの
// 手続とは別物であり、個人事業主の青色申告承認申請書は src/lib/tax/individualForms.ts 側の
// 対象）:
//   (1) 法人設立届出書 … 税務署向け・都道府県税事務所向け・市区町村役場向けの3通
//       （国税・地方税で提出先・様式名が異なるため、内容はほぼ共通のまま3つの下書きに分ける）
//   (2) 青色申告の承認申請書（法人用）
//   (3) 給与支払事務所等の開設届出書 …
//       従業員（代表者自身への役員報酬の支払いのみの場合を含む）に給与を支払う場合のみ提出
//
// 設計方針（invoiceRegistrationApplicationForm.ts と同じ考え方）:
// - 提出先税務署・都道府県税事務所・市区町村役場は、利用者が入力したプレースホルダー
//   文字列をそのまま表示するのみで、本店所在地からの自動判定は行わない。
// - 提出期限は、法令上の一般的な期間表現（例:「設立の日以後2か月以内」）をそのまま
//   文言として示すにとどめ、設立年月日等から具体的な期限日を計算・断定することは
//   意図的に行わない。期間計算（初日不算入等の民法上のルール）を誤って適用した場合、
//   実際の法定期限を誤って伝えるリスクがあり、それは個別具体的な税務助言にも近づくため。
//   正式な期限は、利用者自身が所轄の税務署・自治体に確認する前提とする。
// - 資本金の額や事業年度は、市区町村民税・都道府県民税の均等割の税額区分等に影響するが、
//   具体的な税額の算定はこのモジュールの対象外（一般的な制度の存在を notes で案内するのみ）。
// - 法人番号（設立後に国税庁から指定される13桁の番号）は、この下書き作成時点では
//   まだ利用者の手元にないため、入力項目として要求しない（TBD_PLACEHOLDER 相当の
//   「設立後に指定」という扱い）。マイナンバー（個人番号）は一切扱わない。
//
// このモジュールは下書きデータの組み立てのみを行う純粋関数群であり、実際の提出
// （e-Tax・eLTAX又は書面）は利用者本人が行う必要がある。税理士法に定める税務代理・
// 税務書類の作成・個別具体的な税務相談には該当しない（本人申告支援ツール型、
// docs/business-plan.md 2章）。
// ------------------------------------------------------------------

export interface CorporateEstablishmentNotificationInputs {
  /** 法人名 */
  companyName: string;
  /** 法人名のフリガナ */
  companyNameKana: string;
  /** 本店所在地 */
  headOfficeAddress: string;
  /** 代表者氏名 */
  representativeName: string;
  /** 代表者住所 */
  representativeAddress: string;
  /** 設立年月日（自由記述。例:"2026年8月1日"）。このモジュールは日付として解析・検証しない */
  establishmentDate: string;
  /** 事業年度の開始月（1〜12） */
  fiscalYearStartMonth: number;
  /** 事業年度の終了月（1〜12） */
  fiscalYearEndMonth: number;
  /** 資本金の額（円） */
  capital: number;
  /** 事業目的の概要（定款の目的欄の要約等、自由記述） */
  businessPurpose: string;
  /** 支店・出張所等の有無 */
  hasBranches: boolean;
  /** 支店等の所在地等（自由記述、任意。hasBranchesがtrueのときの参考情報） */
  branchDetails?: string;
  /** 従業員を雇用するか（代表者自身への役員報酬の支払いのみの場合も含む） */
  willEmployStaff: boolean;
  /** 給与支払開始予定日（自由記述。willEmployStaffがtrueの場合に使用） */
  salaryPaymentStartDate?: string;
  /** 青色申告の承認を受けようとする事業年度（自由記述。例:"第1期（2026年8月1日〜2027年7月31日）"） */
  blueReturnApplicableFiscalYearLabel: string;
  /** 提出先税務署（プレースホルダー文字列。自動判定はしない） */
  taxOfficeJurisdiction?: string;
  /** 提出先都道府県税事務所（プレースホルダー文字列。自動判定はしない） */
  prefecturalTaxOfficeJurisdiction?: string;
  /** 提出先市区町村役場（プレースホルダー文字列。自動判定はしない） */
  municipalOfficeJurisdiction?: string;
}

export interface CorporateEstablishmentNotificationField {
  label: string;
  /** 未入力の場合は空文字列ではなく "（未入力）" 等のプレースホルダー文言を入れる */
  value: string;
}

export interface CorporateEstablishmentNotificationSection {
  title: string;
  fields: CorporateEstablishmentNotificationField[];
}

/** 3つの届出書・申請書に共通する下書きデータの形。invoiceRegistrationApplicationForm.ts の Draft 型と同じ考え方 */
export interface CorporateEstablishmentNotificationDocumentDraft {
  /** 正式な様式名（例:「法人設立届出書」） */
  documentTitle: string;
  /** 提出先の種類（例:「税務署」「都道府県税事務所」「市区町村役場」） */
  destinationKindLabel: string;
  sections: CorporateEstablishmentNotificationSection[];
  /** 必須項目の未入力等、下書きとして不完全な点。空配列なら（形式上は）問題なし */
  warnings: string[];
  /** 提出期限の一般的な考え方や均等割等、警告ではないが利用者に留意してほしい事項 */
  notes: string[];
  /** このモジュールが依拠している一般的な前提の一覧 */
  assumptions: string[];
  disclaimer: string;
}

export const CORPORATE_ESTABLISHMENT_NOTIFICATION_DISCLAIMER =
  "この画面は、法人設立時に必要となる各種届出書・申請書の下書きデータを作成するものであり、正式な届出書・申請書そのものではありません。実際の提出（e-Tax・eLTAX又は書面）は、内容をご自身で確認のうえ、利用者ご自身の責任で行ってください。当社が代理で提出することはありません。また、この下書きの作成は税理士法に定める税務代理・税務書類の作成・個別具体的な税務相談には該当せず、提出要否や提出期限についての個別具体的な助言も行いません。最終的な内容の確認・判断は、必要に応じて税理士等の専門家にご相談のうえご自身で行ってください。";

const UNSPECIFIED = "（未入力）";

function fieldValue(raw: string | undefined): string {
  const trimmed = raw?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : UNSPECIFIED;
}

function yen(amount: number): string {
  if (!Number.isFinite(amount)) return UNSPECIFIED;
  return `${Math.round(amount).toLocaleString("ja-JP")}円`;
}

const MONTH_LABELS = [
  "1月",
  "2月",
  "3月",
  "4月",
  "5月",
  "6月",
  "7月",
  "8月",
  "9月",
  "10月",
  "11月",
  "12月",
];

function isValidMonth(month: number): boolean {
  return Number.isInteger(month) && month >= 1 && month <= 12;
}

function monthLabel(month: number): string {
  return isValidMonth(month) ? MONTH_LABELS[month - 1] : UNSPECIFIED;
}

/** 事業年度の開始月・終了月から「◯月から◯月まで（翌年）」形式の表示ラベルを作る */
function fiscalYearRangeLabel(startMonth: number, endMonth: number): string {
  if (!isValidMonth(startMonth) || !isValidMonth(endMonth)) {
    return UNSPECIFIED;
  }
  const wrapsToNextYear = endMonth < startMonth;
  const endLabel = wrapsToNextYear ? `翌年${monthLabel(endMonth)}` : monthLabel(endMonth);
  return `${monthLabel(startMonth)}から${endLabel}まで`;
}

function requiredCoreFieldWarnings(inputs: CorporateEstablishmentNotificationInputs): string[] {
  const warnings: string[] = [];
  if (!inputs.companyName?.trim()) {
    warnings.push("法人名が入力されていません。");
  }
  if (!inputs.companyNameKana?.trim()) {
    warnings.push("法人名のフリガナが入力されていません。");
  }
  if (!inputs.headOfficeAddress?.trim()) {
    warnings.push("本店所在地が入力されていません。");
  }
  if (!inputs.representativeName?.trim()) {
    warnings.push("代表者氏名が入力されていません。");
  }
  if (!inputs.representativeAddress?.trim()) {
    warnings.push("代表者住所が入力されていません。");
  }
  if (!inputs.establishmentDate?.trim()) {
    warnings.push("設立年月日が入力されていません。");
  }
  if (!isValidMonth(inputs.fiscalYearStartMonth) || !isValidMonth(inputs.fiscalYearEndMonth)) {
    warnings.push("事業年度の開始月・終了月は1〜12の範囲で入力してください。");
  }
  if (!Number.isFinite(inputs.capital) || inputs.capital <= 0) {
    warnings.push("資本金の額は0円より大きい金額を入力してください。");
  }
  if (!inputs.businessPurpose?.trim()) {
    warnings.push("事業目的の概要が入力されていません。");
  }
  return warnings;
}

function coreCompanySection(
  inputs: CorporateEstablishmentNotificationInputs
): CorporateEstablishmentNotificationSection {
  return {
    title: "法人の基本情報",
    fields: [
      { label: "法人名", value: fieldValue(inputs.companyName) },
      { label: "フリガナ", value: fieldValue(inputs.companyNameKana) },
      { label: "本店所在地", value: fieldValue(inputs.headOfficeAddress) },
      { label: "代表者氏名", value: fieldValue(inputs.representativeName) },
      { label: "代表者住所", value: fieldValue(inputs.representativeAddress) },
      { label: "設立年月日", value: fieldValue(inputs.establishmentDate) },
      {
        label: "法人番号",
        value: "（設立登記後に国税庁から指定されます。この時点では未指定のため未入力）",
      },
    ],
  };
}

function fiscalYearAndCapitalSection(
  inputs: CorporateEstablishmentNotificationInputs
): CorporateEstablishmentNotificationSection {
  return {
    title: "事業年度・資本金",
    fields: [
      {
        label: "事業年度",
        value: fiscalYearRangeLabel(inputs.fiscalYearStartMonth, inputs.fiscalYearEndMonth),
      },
      { label: "資本金の額", value: yen(inputs.capital) },
    ],
  };
}

function businessPurposeAndBranchesSection(
  inputs: CorporateEstablishmentNotificationInputs
): CorporateEstablishmentNotificationSection {
  const fields: CorporateEstablishmentNotificationField[] = [
    { label: "事業目的の概要", value: fieldValue(inputs.businessPurpose) },
    { label: "支店・出張所等の有無", value: inputs.hasBranches ? "あり" : "なし" },
  ];
  if (inputs.hasBranches) {
    fields.push({ label: "支店等の所在地等", value: fieldValue(inputs.branchDetails) });
  }
  return {
    title: "事業目的・支店等の状況",
    fields,
  };
}

function branchNotes(inputs: CorporateEstablishmentNotificationInputs): string[] {
  return inputs.hasBranches
    ? [
        "支店・出張所等がある場合、本店所在地を所轄する提出先だけでなく、各支店等の所在地を所轄する税務署・自治体への届出が別途必要になる場合があります。詳細は各支店等の所在地を所轄する税務署・自治体にご確認ください。",
      ]
    : [];
}

// ------------------------------------------------------------------
// (1) 法人設立届出書（税務署向け）
// ------------------------------------------------------------------

export function buildCorporateEstablishmentTaxOfficeNotificationDraft(
  inputs: CorporateEstablishmentNotificationInputs
): CorporateEstablishmentNotificationDocumentDraft {
  const warnings = requiredCoreFieldWarnings(inputs);
  const taxOfficeJurisdiction = inputs.taxOfficeJurisdiction?.trim() ?? "";
  if (taxOfficeJurisdiction.length === 0) {
    warnings.push(
      "提出先税務署が入力されていません。国税庁「税務署の所在地及び管轄区域」等で、本店所在地を所轄する税務署名をご確認のうえ入力してください。"
    );
  }

  const sections: CorporateEstablishmentNotificationSection[] = [
    { title: "提出先", fields: [{ label: "提出先税務署", value: fieldValue(taxOfficeJurisdiction) }] },
    coreCompanySection(inputs),
    fiscalYearAndCapitalSection(inputs),
    businessPurposeAndBranchesSection(inputs),
  ];

  const notes: string[] = [
    "提出期限の一般的な考え方は「設立の日以後2か月以内」です（法人税法148条）。正式な期限・実際の到達日基準の扱いは所轄税務署にご確認ください。",
    ...branchNotes(inputs),
  ];

  return {
    documentTitle: "法人設立届出書",
    destinationKindLabel: "税務署",
    sections,
    warnings,
    notes,
    assumptions: [
      "この下書きは、国税庁「法人設立届出書」の様式のうち、法人名・本店所在地・代表者・設立年月日・事業年度・資本金の額・事業目的・支店等の有無という基本的な記載事項のみを対象としています。定款の写し・登記事項証明書等の添付書類の要否はこの画面では判定しません。",
      "提出先税務署は、利用者が入力したプレースホルダー文字列をそのまま表示しているだけであり、本店所在地からの自動判定は行っていません。",
      "設立年月日は自由記述としてそのまま転記しており、日付として解析・検証はしていません。",
    ],
    disclaimer: CORPORATE_ESTABLISHMENT_NOTIFICATION_DISCLAIMER,
  };
}

// ------------------------------------------------------------------
// (1) 法人設立届出書（都道府県税事務所向け）
// ------------------------------------------------------------------

export function buildCorporateEstablishmentPrefecturalNotificationDraft(
  inputs: CorporateEstablishmentNotificationInputs
): CorporateEstablishmentNotificationDocumentDraft {
  const warnings = requiredCoreFieldWarnings(inputs);
  const prefecturalTaxOfficeJurisdiction = inputs.prefecturalTaxOfficeJurisdiction?.trim() ?? "";
  if (prefecturalTaxOfficeJurisdiction.length === 0) {
    warnings.push(
      "提出先の都道府県税事務所が入力されていません。本店所在地を管轄する都道府県税事務所名をご自身でご確認のうえ入力してください。"
    );
  }

  const sections: CorporateEstablishmentNotificationSection[] = [
    {
      title: "提出先",
      fields: [{ label: "提出先都道府県税事務所", value: fieldValue(prefecturalTaxOfficeJurisdiction) }],
    },
    coreCompanySection(inputs),
    fiscalYearAndCapitalSection(inputs),
    businessPurposeAndBranchesSection(inputs),
  ];

  const notes: string[] = [
    "提出期限は都道府県ごとに定められており、この画面では期限日を計算していません（多くの自治体で設立後1か月程度が目安ですが、必ず提出先の都道府県税事務所にご確認ください）。",
    "資本金の額や事業所の数・従業者数に応じて、都道府県民税の均等割の税額区分が変わります。具体的な税額は本店所在地の都道府県が公表している均等割税率表でご確認ください。",
    ...branchNotes(inputs),
  ];

  return {
    documentTitle: "法人設立・設置届出書（都道府県）",
    destinationKindLabel: "都道府県税事務所",
    sections,
    warnings,
    notes,
    assumptions: [
      "様式名・記載項目は都道府県により多少異なりますが、この下書きは国税向けの法人設立届出書とほぼ共通する基本項目（法人名・本店所在地・代表者・設立年月日・事業年度・資本金の額・事業目的）のみを対象としています。",
      "提出先都道府県税事務所は、利用者が入力したプレースホルダー文字列をそのまま表示しているだけであり、本店所在地からの自動判定は行っていません。",
      "eLTAX（地方税ポータルシステム）経由での電子提出にも対応している自治体がありますが、この画面はその操作自体は行いません。",
    ],
    disclaimer: CORPORATE_ESTABLISHMENT_NOTIFICATION_DISCLAIMER,
  };
}

// ------------------------------------------------------------------
// (1) 法人設立届出書（市区町村役場向け）
// ------------------------------------------------------------------

export function buildCorporateEstablishmentMunicipalNotificationDraft(
  inputs: CorporateEstablishmentNotificationInputs
): CorporateEstablishmentNotificationDocumentDraft {
  const warnings = requiredCoreFieldWarnings(inputs);
  const municipalOfficeJurisdiction = inputs.municipalOfficeJurisdiction?.trim() ?? "";
  if (municipalOfficeJurisdiction.length === 0) {
    warnings.push(
      "提出先の市区町村役場が入力されていません。本店所在地を管轄する市区町村役場（東京都特別区の場合は都税事務所）名をご自身でご確認のうえ入力してください。"
    );
  }

  const sections: CorporateEstablishmentNotificationSection[] = [
    {
      title: "提出先",
      fields: [{ label: "提出先市区町村役場", value: fieldValue(municipalOfficeJurisdiction) }],
    },
    coreCompanySection(inputs),
    fiscalYearAndCapitalSection(inputs),
    businessPurposeAndBranchesSection(inputs),
  ];

  const notes: string[] = [
    "本店所在地が東京都特別区（23区）内の場合、原則として市区町村民税に相当する部分は都民税に含まれるため、区独自の法人設立届出書は不要で、都税事務所への提出（都道府県向け届出と同一の窓口）に一本化されるのが一般的です。政令指定都市の一部区役所提出など、自治体ごとの窓口の違いもあるため、必ず本店所在地の自治体にご確認ください。",
    "提出期限は市区町村ごとに定められており、この画面では期限日を計算していません（多くの自治体で設立後1か月程度が目安ですが、必ず提出先の市区町村役場にご確認ください）。",
    "資本金の額や事業所の数・従業者数に応じて、市区町村民税の均等割の税額区分が変わります。具体的な税額は本店所在地の市区町村が公表している均等割税率表でご確認ください。",
    ...branchNotes(inputs),
  ];

  return {
    documentTitle: "法人設立・設置届出書（市区町村）",
    destinationKindLabel: "市区町村役場",
    sections,
    warnings,
    notes,
    assumptions: [
      "様式名・記載項目は市区町村により多少異なりますが、この下書きは国税向けの法人設立届出書とほぼ共通する基本項目（法人名・本店所在地・代表者・設立年月日・事業年度・資本金の額・事業目的）のみを対象としています。",
      "提出先市区町村役場は、利用者が入力したプレースホルダー文字列をそのまま表示しているだけであり、本店所在地からの自動判定は行っていません。",
      "東京都特別区（23区）に本店を置く場合は不要となることが多い点を notes に記載していますが、この画面はそれを自動判定せず、常に下書きを表示します（該当しない場合は提出不要と判断してご自身で除外してください）。",
    ],
    disclaimer: CORPORATE_ESTABLISHMENT_NOTIFICATION_DISCLAIMER,
  };
}

// ------------------------------------------------------------------
// (2) 青色申告の承認申請書（法人用）
// ------------------------------------------------------------------

export function buildCorporateBlueReturnApplicationDraft(
  inputs: CorporateEstablishmentNotificationInputs
): CorporateEstablishmentNotificationDocumentDraft {
  const warnings: string[] = [];
  if (!inputs.companyName?.trim()) {
    warnings.push("法人名が入力されていません。");
  }
  if (!inputs.headOfficeAddress?.trim()) {
    warnings.push("本店所在地が入力されていません。");
  }
  if (!inputs.representativeName?.trim()) {
    warnings.push("代表者氏名が入力されていません。");
  }
  if (!inputs.establishmentDate?.trim()) {
    warnings.push("設立年月日が入力されていません。");
  }
  if (!inputs.blueReturnApplicableFiscalYearLabel?.trim()) {
    warnings.push("青色申告の承認を受けようとする事業年度が入力されていません。");
  }
  const taxOfficeJurisdiction = inputs.taxOfficeJurisdiction?.trim() ?? "";
  if (taxOfficeJurisdiction.length === 0) {
    warnings.push(
      "提出先税務署が入力されていません。国税庁「税務署の所在地及び管轄区域」等で、本店所在地を所轄する税務署名をご確認のうえ入力してください。"
    );
  }

  const sections: CorporateEstablishmentNotificationSection[] = [
    { title: "提出先", fields: [{ label: "提出先税務署", value: fieldValue(taxOfficeJurisdiction) }] },
    {
      title: "法人の基本情報",
      fields: [
        { label: "法人名", value: fieldValue(inputs.companyName) },
        { label: "本店所在地", value: fieldValue(inputs.headOfficeAddress) },
        { label: "代表者氏名", value: fieldValue(inputs.representativeName) },
        { label: "設立年月日", value: fieldValue(inputs.establishmentDate) },
      ],
    },
    {
      title: "青色申告の承認を受けようとする事業年度",
      fields: [
        {
          label: "対象事業年度",
          value: fieldValue(inputs.blueReturnApplicableFiscalYearLabel),
        },
      ],
    },
  ];

  return {
    documentTitle: "青色申告の承認申請書（法人用）",
    destinationKindLabel: "税務署",
    sections,
    warnings,
    notes: [
      "新設法人が設立第1期から青色申告の承認を受けようとする場合の提出期限の一般的な考え方は、「設立の日以後3か月を経過した日」と「その事業年度終了の日」とのいずれか早い日の前日です（法人税法122条2項1号）。この画面では具体的な期限日を計算していないため、早めの提出をおすすめします。",
      "青色申告の承認を受けるには、法人税法が定める帳簿書類を備え付け、取引を複式簿記の原則に従って整然かつ明瞭に記録し、その記録に基づいて決算を行う必要があります。",
      "提出後、その事業年度終了の日までに税務署から却下の通知がない場合は、原則として承認があったものとみなされます（みなし承認）。",
      "青色申告の承認により適用可能となる制度（欠損金の繰越控除の拡充、各種特別償却・税額控除等）は税制改正により変更されることがあるため、最新の情報は国税庁ウェブサイト等でご確認ください。",
    ],
    assumptions: [
      "この下書きは、国税庁「青色申告の承認申請書」（法人用）の様式のうち、法人名・本店所在地・代表者氏名・設立年月日・対象事業年度という基本的な記載事項のみを対象としています。",
      "対象事業年度は、利用者が入力した自由記述の文字列をそのまま表示しているだけであり、設立年月日や事業年度の月数からの自動算定は行っていません。",
      "個人事業主向けの青色申告承認申請書とは様式・提出期限のルールが異なります（このモジュールは法人用のみを対象とします）。",
    ],
    disclaimer: CORPORATE_ESTABLISHMENT_NOTIFICATION_DISCLAIMER,
  };
}

// ------------------------------------------------------------------
// (3) 給与支払事務所等の開設届出書
// ------------------------------------------------------------------

export function buildSalaryPayerOfficeNotificationDraft(
  inputs: CorporateEstablishmentNotificationInputs
): CorporateEstablishmentNotificationDocumentDraft {
  const warnings: string[] = [];
  if (!inputs.companyName?.trim()) {
    warnings.push("法人名が入力されていません。");
  }
  if (!inputs.headOfficeAddress?.trim()) {
    warnings.push("本店所在地が入力されていません。");
  }
  if (!inputs.representativeName?.trim()) {
    warnings.push("代表者氏名が入力されていません。");
  }
  if (!inputs.establishmentDate?.trim()) {
    warnings.push("設立年月日が入力されていません。");
  }
  const salaryPaymentStartDate = inputs.salaryPaymentStartDate?.trim() ?? "";
  if (salaryPaymentStartDate.length === 0) {
    warnings.push("給与支払開始予定日が入力されていません。");
  }
  const taxOfficeJurisdiction = inputs.taxOfficeJurisdiction?.trim() ?? "";
  if (taxOfficeJurisdiction.length === 0) {
    warnings.push(
      "提出先税務署が入力されていません。国税庁「税務署の所在地及び管轄区域」等で、本店所在地を所轄する税務署名をご確認のうえ入力してください。"
    );
  }

  const sections: CorporateEstablishmentNotificationSection[] = [
    { title: "提出先", fields: [{ label: "提出先税務署", value: fieldValue(taxOfficeJurisdiction) }] },
    {
      title: "給与支払事務所等の情報",
      fields: [
        { label: "法人名（給与支払事務所等の名称）", value: fieldValue(inputs.companyName) },
        { label: "給与支払事務所等の所在地", value: fieldValue(inputs.headOfficeAddress) },
        { label: "代表者氏名", value: fieldValue(inputs.representativeName) },
        { label: "開設年月日", value: fieldValue(inputs.establishmentDate) },
      ],
    },
    {
      title: "給与支払の開始予定",
      fields: [
        { label: "給与支払開始予定日", value: fieldValue(salaryPaymentStartDate) },
        {
          label: "対象",
          value: "代表者（役員）本人への役員報酬の支払いのみの場合を含む、給与等の支払い全般",
        },
      ],
    },
  ];

  return {
    documentTitle: "給与支払事務所等の開設届出書",
    destinationKindLabel: "税務署",
    sections,
    warnings,
    notes: [
      "代表者（役員）本人への役員報酬の支払いのみで、他に従業員がいない場合であっても、給与の支払事務を行う事務所を開設したことになるため、この届出書の提出が必要です。",
      "提出期限の一般的な考え方は「給与支払事務所等の開設の事実があった日から1か月以内」です（所得税法230条）。この画面では具体的な期限日を計算していません。正式な期限は所轄税務署にご確認ください。",
      "この届出の提出後、給与の支払いを行う際は、原則として支払月の給与から所得税等を源泉徴収し、翌月10日までに納付する義務が生じます。常時の給与支払人員が9人以下の場合、税務署の承認を受けることで年2回にまとめて納付できる「源泉所得税の納期の特例」の適用を受けられる場合があります。",
      "開設年月日は、便宜上、設立年月日をそのまま表示しています。実際に給与支払事務所を開設した日が別にある場合は、その日付に置き換えてご確認ください。",
    ],
    assumptions: [
      "この下書きは、国税庁「給与支払事務所等の開設・移転・廃止届出書」のうち、開設の場合に必要な基本的な記載事項（名称・所在地・代表者氏名・開設年月日・給与支払開始予定日）のみを対象としています。",
      "給与支払開始予定日は、利用者が入力した自由記述の文字列をそのまま表示しているだけであり、日付として解析・検証はしていません。",
      "従業員数・支払われる給与の見込額等、様式上のその他の欄はこの画面の対象外です。",
    ],
    disclaimer: CORPORATE_ESTABLISHMENT_NOTIFICATION_DISCLAIMER,
  };
}

// ------------------------------------------------------------------
// まとめて組み立てる場合のバンドル
// ------------------------------------------------------------------

export interface CorporateEstablishmentNotificationBundle {
  taxOfficeNotification: CorporateEstablishmentNotificationDocumentDraft;
  prefecturalNotification: CorporateEstablishmentNotificationDocumentDraft;
  municipalNotification: CorporateEstablishmentNotificationDocumentDraft;
  blueReturnApplication: CorporateEstablishmentNotificationDocumentDraft;
  /** willEmployStaffがfalseの場合はnull（給与支払事務所等の開設届出書は不要） */
  salaryPayerOfficeNotification: CorporateEstablishmentNotificationDocumentDraft | null;
}

/**
 * 設立時の基本情報から、3種類（給与支払事務所等の開設届出書を含める場合は4種類・
 * 法人設立届出書は3提出先分あるため実質最大5通）の届出書・申請書の下書きをまとめて組み立てる。
 * ネットワークアクセス・外部データ参照は一切行わない純粋関数。
 */
export function buildCorporateEstablishmentNotificationBundle(
  inputs: CorporateEstablishmentNotificationInputs
): CorporateEstablishmentNotificationBundle {
  return {
    taxOfficeNotification: buildCorporateEstablishmentTaxOfficeNotificationDraft(inputs),
    prefecturalNotification: buildCorporateEstablishmentPrefecturalNotificationDraft(inputs),
    municipalNotification: buildCorporateEstablishmentMunicipalNotificationDraft(inputs),
    blueReturnApplication: buildCorporateBlueReturnApplicationDraft(inputs),
    salaryPayerOfficeNotification: inputs.willEmployStaff
      ? buildSalaryPayerOfficeNotificationDraft(inputs)
      : null,
  };
}

/** 下書きが必須項目をすべて満たしているか（warnings が空かどうか）の簡易ヘルパー */
export function isCorporateEstablishmentNotificationDraftComplete(
  draft: CorporateEstablishmentNotificationDocumentDraft
): boolean {
  return draft.warnings.length === 0;
}
