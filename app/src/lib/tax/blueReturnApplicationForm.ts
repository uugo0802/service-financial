// ------------------------------------------------------------------
// 「個人事業の開業・廃業等届出書」ではなく、「所得税の青色申告承認申請書」
// （個人事業主が、青色申告の承認を「これから」受けるために提出する申請書）の
// 下書きデータ生成。
//
// 位置づけの整理: `src/lib/tax/individualForms.ts`（読み取り専用・編集対象外）は、
// 既に青色申告での記帳・提出を行っている前提で、その記帳方法（複式簿記/簡易簿記）・
// 申告方法（e-Tax/書面）に応じた青色申告特別控除額（65万円/55万円/10万円）を
// 計算するモジュールである。これに対し本モジュールは、そもそも青色申告の承認を
// 受けるための「申請書」そのものの下書きを組み立てるものであり、税額・控除額の
// 計算は一切行わない（対象読者・タイミングが異なる別物）。
//
// 実際の様式（国税庁「所得税の青色申告承認申請書」）は、おおむね次の欄で構成される。
// このモジュールはそのうち、記帳・入力データから機械的に組み立てられる範囲を
// 対象とする：
//   - 提出先税務署、提出年月日
//   - 納税地（住所）、氏名、生年月日、職業、屋号
//   - ◯◯年分以後の所得税の申告を青色申告によりたい旨（青色申告の承認を
//     受けようとする年分）
//   - 1 事業所又は所得の基因となる資産の名称及びその所在地
//   - 2 所得の種類（事業所得・不動産所得・山林所得）
//   - 3 いままでに青色申告承認の取消しを受けたこと又は取りやめをしたことの有無
//   - 4 本年1月16日以後新たに業務を開始した場合、その開始した年月日
//   - 5 相続による事業承継の有無（有の場合、相続開始年月日・被相続人の氏名）
//   - 6 その他参考事項（簿記方式、備付帳簿名）
//
// 意図的に含めない事項:
//   - フリガナ欄・電話番号欄（様式上は存在するが、記帳データからは読み取れず、
//     下書きの完成度に関わる本質的な項目でもないため対象外とした）
//   - 提出期限（原則としてその年の3月15日、新規開業の場合は業務開始日から
//     2か月以内）の具体的な期限日の計算・判定。個々の事情（年の途中の開業日等）
//     により結果が変わり、かつ法改正等で変更されうるため、本モジュールは
//     一般的なルールを文言として案内するにとどめ、特定の期限日を断定しない
//     （invoiceRegistrationApplicationForm.ts と同じ設計方針）。
//   - 提出先税務署の自動判定（納税地からの所轄税務署の検索）。利用者が
//     国税庁「税務署の所在地及び管轄区域」等で確認した名称をそのまま入力する前提。
//   - 青色申告特別控除額（65万円/55万円/10万円）の判定・計算。これは
//     individualForms.ts / estimate.ts（resolveBlueReturnDeduction）の責務であり、
//     本モジュールは重複して計算しない。
//
// このモジュールは下書きデータの組み立てのみを行う純粋関数群であり、実際の提出
// （e-Tax又は書面）は利用者本人が行う必要がある。税理士法に定める税務代理・
// 税務書類の作成・個別具体的な税務相談には該当しない（本人申告支援ツール型、
// docs/business-plan.md 2章）。
// ------------------------------------------------------------------

/** 所得の種類（様式2欄。事業所得・不動産所得・山林所得のいずれか） */
export type BlueReturnIncomeType = "business" | "realEstate" | "forestry";

/** 簿記方式（様式6欄「その他参考事項」のうち簿記方式） */
export type BlueReturnBookkeepingMethod = "double" | "simplified" | "other";

/**
 * 様式6欄「備付帳簿名」のチェック欄。国税庁様式の記載順に準拠。
 * 「その他」は自由記述（otherLedgerName）で別途表現するため、この一覧には含めない。
 */
export const BLUE_RETURN_LEDGER_OPTIONS = [
  "現金出納帳",
  "売掛帳",
  "買掛帳",
  "経費帳",
  "固定資産台帳",
  "預金出納帳",
  "手形記入帳",
  "債権債務記入帳",
  "総勘定元帳",
  "仕訳帳",
  "入金伝票",
  "出金伝票",
  "振替伝票",
  "現金式簡易帳簿",
] as const;

export type BlueReturnLedgerOption = (typeof BLUE_RETURN_LEDGER_OPTIONS)[number];

/** 様式5欄「相続による事業承継の有無」。有の場合のみ相続開始年月日・被相続人の氏名を記載する */
export type BlueReturnInheritanceInput =
  | { hasInheritance: false }
  | { hasInheritance: true; inheritanceStartDate?: string; decedentName?: string };

export interface BlueReturnApplicationInputs {
  /** 提出先税務署（プレースホルダー文字列。所轄税務署の自動判定は行わない） */
  taxOfficeName: string;
  /** 提出年月日（自由記述、任意。実際に提出する日に利用者が記入する想定） */
  submissionDate?: string;
  /** 納税地（住所又は居所） */
  taxpayerAddress: string;
  /** 氏名 */
  taxpayerName: string;
  /** 生年月日（自由記述、任意） */
  dateOfBirth?: string;
  /** 職業（任意） */
  occupation?: string;
  /** 屋号（任意） */
  tradeName?: string;
  /** 青色申告の承認を受けようとする年分（自由記述、例："令和8年"「2026年（令和8年）分」） */
  applicableYear: string;
  /** 1 事業所又は所得の基因となる資産の名称及びその所在地 */
  businessLocationDescription: string;
  /** 2 所得の種類 */
  incomeType: BlueReturnIncomeType;
  /** 3 いままでに青色申告承認の取消しを受けたこと又は取りやめをしたことの有無 */
  hasPriorRevocationOrWithdrawal: boolean;
  /** 3(1) 取消し又は取りやめの年月日（hasPriorRevocationOrWithdrawal が true の場合に記載） */
  priorRevocationOrWithdrawalDate?: string;
  /** 4 本年1月16日以後新たに業務を開始した場合、その開始した年月日（任意） */
  businessStartDate?: string;
  /** 5 相続による事業承継の有無。省略時は「無」として扱う */
  inheritance?: BlueReturnInheritanceInput;
  /** 6 簿記方式 */
  bookkeepingMethod: BlueReturnBookkeepingMethod;
  /** bookkeepingMethod が "other" の場合の具体的な方式名 */
  bookkeepingMethodOther?: string;
  /** 6 備付帳簿名のうち、備え付ける帳簿として選択されたもの */
  maintainedLedgers: BlueReturnLedgerOption[];
  /** 備付帳簿名のうち「その他」欄への自由記述（任意） */
  otherLedgerName?: string;
}

export interface BlueReturnApplicationField {
  label: string;
  /** 未入力の場合は空文字列ではなく "（未入力）" 等のプレースホルダー文言を入れる */
  value: string;
}

export interface BlueReturnApplicationSection {
  title: string;
  fields: BlueReturnApplicationField[];
}

export interface BlueReturnApplicationDraft {
  sections: BlueReturnApplicationSection[];
  /** 必須項目の未入力等、下書きとして不完全な点。空配列なら（形式上は）問題なし */
  warnings: string[];
  /** 提出期限の一般的な案内など、警告ではないが利用者に留意してほしい事項 */
  notes: string[];
  /** このモジュールが依拠している一般的な前提の一覧 */
  assumptions: string[];
  disclaimer: string;
}

export const BLUE_RETURN_APPLICATION_DISCLAIMER =
  "この画面は「所得税の青色申告承認申請書」の下書きデータを作成するものであり、正式な申請書そのものではありません。実際の提出(e-Tax又は書面)は、内容をご自身で確認のうえ、利用者ご自身の責任で行ってください。当社が代理で提出することはありません。また、この下書きの作成は税理士法に定める税務代理・税務書類の作成・個別具体的な税務相談には該当せず、提出期限や承認の可否についての個別具体的な助言も行いません。最終的な内容の確認・判断は、必要に応じて税理士等の専門家にご相談のうえご自身で行ってください。";

const INCOME_TYPE_LABELS: Record<BlueReturnIncomeType, string> = {
  business: "事業所得",
  realEstate: "不動産所得",
  forestry: "山林所得",
};

const BOOKKEEPING_METHOD_LABELS: Record<BlueReturnBookkeepingMethod, string> = {
  double: "複式簿記",
  simplified: "簡易簿記",
  other: "その他",
};

const UNSPECIFIED = "（未入力）";
const NOT_APPLICABLE = "（該当なし）";

function fieldValue(raw: string | undefined): string {
  const trimmed = raw?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : UNSPECIFIED;
}

function resolveInheritance(inheritance: BlueReturnInheritanceInput | undefined): BlueReturnInheritanceInput {
  return inheritance ?? { hasInheritance: false };
}

/**
 * 基本情報（納税地・氏名等、承認を受けようとする年分、事業所・所得の種類、
 * 過去の取消し・取りやめ歴、開業・事業承継の状況、簿記方式・備付帳簿名）から、
 * 「所得税の青色申告承認申請書」の下書きデータを組み立てる純粋関数。
 * ネットワークアクセス・外部データ参照は一切行わない。
 */
export function buildBlueReturnApplicationDraft(inputs: BlueReturnApplicationInputs): BlueReturnApplicationDraft {
  const taxOfficeName = inputs.taxOfficeName?.trim() ?? "";
  const submissionDate = inputs.submissionDate?.trim() ?? "";
  const taxpayerAddress = inputs.taxpayerAddress?.trim() ?? "";
  const taxpayerName = inputs.taxpayerName?.trim() ?? "";
  const dateOfBirth = inputs.dateOfBirth?.trim() ?? "";
  const occupation = inputs.occupation?.trim() ?? "";
  const tradeName = inputs.tradeName?.trim() ?? "";
  const applicableYear = inputs.applicableYear?.trim() ?? "";
  const businessLocationDescription = inputs.businessLocationDescription?.trim() ?? "";
  const priorRevocationOrWithdrawalDate = inputs.priorRevocationOrWithdrawalDate?.trim() ?? "";
  const businessStartDate = inputs.businessStartDate?.trim() ?? "";
  const inheritance = resolveInheritance(inputs.inheritance);
  const bookkeepingMethodOther = inputs.bookkeepingMethodOther?.trim() ?? "";
  const otherLedgerName = inputs.otherLedgerName?.trim() ?? "";
  const maintainedLedgers = inputs.maintainedLedgers ?? [];

  const warnings: string[] = [];
  if (taxOfficeName.length === 0) {
    warnings.push(
      "提出先税務署が入力されていません。国税庁「税務署の所在地及び管轄区域」等で、納税地を所轄する税務署名をご確認のうえ入力してください。"
    );
  }
  if (taxpayerAddress.length === 0) {
    warnings.push("納税地(住所)が入力されていません。");
  }
  if (taxpayerName.length === 0) {
    warnings.push("氏名が入力されていません。");
  }
  if (applicableYear.length === 0) {
    warnings.push("青色申告の承認を受けようとする年分が入力されていません。");
  }
  if (businessLocationDescription.length === 0) {
    warnings.push("事業所又は所得の基因となる資産の名称及びその所在地が入力されていません。");
  }
  if (inputs.hasPriorRevocationOrWithdrawal && priorRevocationOrWithdrawalDate.length === 0) {
    warnings.push(
      "過去に青色申告承認の取消し又は取りやめを受けたことが「有」となっていますが、その年月日が入力されていません。"
    );
  }
  if (inheritance.hasInheritance) {
    if (!inheritance.decedentName || inheritance.decedentName.trim().length === 0) {
      warnings.push("相続による事業承継が「有」となっていますが、被相続人の氏名が入力されていません。");
    }
    if (!inheritance.inheritanceStartDate || inheritance.inheritanceStartDate.trim().length === 0) {
      warnings.push("相続による事業承継が「有」となっていますが、相続開始年月日が入力されていません。");
    }
  }
  if (inputs.bookkeepingMethod === "other" && bookkeepingMethodOther.length === 0) {
    warnings.push("簿記方式が「その他」となっていますが、具体的な方式名が入力されていません。");
  }
  if (maintainedLedgers.length === 0 && otherLedgerName.length === 0) {
    warnings.push("備付帳簿名が1つも選択されていません。");
  }

  const submitterSection: BlueReturnApplicationSection = {
    title: "提出先",
    fields: [
      { label: "提出先税務署", value: fieldValue(taxOfficeName) },
      { label: "提出年月日", value: fieldValue(submissionDate) },
    ],
  };

  const filerSection: BlueReturnApplicationSection = {
    title: "納税地・氏名等",
    fields: [
      { label: "納税地", value: fieldValue(taxpayerAddress) },
      { label: "氏名", value: fieldValue(taxpayerName) },
      { label: "生年月日", value: fieldValue(dateOfBirth) },
      { label: "職業", value: fieldValue(occupation) },
      { label: "屋号", value: fieldValue(tradeName) },
    ],
  };

  const applicableYearSection: BlueReturnApplicationSection = {
    title: "青色申告の承認を受けようとする年分",
    fields: [{ label: "年分", value: fieldValue(applicableYear) }],
  };

  const businessSection: BlueReturnApplicationSection = {
    title: "1・2 事業所又は所得の基因となる資産の名称及びその所在地／所得の種類",
    fields: [
      { label: "事業所又は所得の基因となる資産の名称及びその所在地", value: fieldValue(businessLocationDescription) },
      { label: "所得の種類", value: INCOME_TYPE_LABELS[inputs.incomeType] },
    ],
  };

  const revocationSection: BlueReturnApplicationSection = {
    title: "3 いままでに青色申告承認の取消しを受けたこと又は取りやめをしたことの有無",
    fields: [
      {
        label: "有無",
        value: inputs.hasPriorRevocationOrWithdrawal ? "有" : "無",
      },
      {
        label: "取消し又は取りやめの年月日",
        value: inputs.hasPriorRevocationOrWithdrawal ? fieldValue(priorRevocationOrWithdrawalDate) : NOT_APPLICABLE,
      },
    ],
  };

  const startAndSuccessionSection: BlueReturnApplicationSection = {
    title: "4・5 業務開始年月日／相続による事業承継の有無",
    fields: [
      {
        label: "本年1月16日以後新たに業務を開始した場合の開始年月日",
        value: fieldValue(businessStartDate),
      },
      {
        label: "相続による事業承継の有無",
        value: inheritance.hasInheritance ? "有" : "無",
      },
      {
        label: "相続開始年月日",
        value: inheritance.hasInheritance ? fieldValue(inheritance.inheritanceStartDate) : NOT_APPLICABLE,
      },
      {
        label: "被相続人の氏名",
        value: inheritance.hasInheritance ? fieldValue(inheritance.decedentName) : NOT_APPLICABLE,
      },
    ],
  };

  const ledgerListValue = maintainedLedgers.length > 0 ? maintainedLedgers.join("、") : UNSPECIFIED;

  const otherReferenceSection: BlueReturnApplicationSection = {
    title: "6 その他参考事項",
    fields: [
      {
        label: "簿記方式",
        value:
          inputs.bookkeepingMethod === "other"
            ? fieldValue(bookkeepingMethodOther)
            : BOOKKEEPING_METHOD_LABELS[inputs.bookkeepingMethod],
      },
      {
        label: "備付帳簿名",
        value: ledgerListValue,
      },
      {
        label: "備付帳簿名(その他)",
        value: otherLedgerName.length > 0 ? otherLedgerName : NOT_APPLICABLE,
      },
    ],
  };

  const notes: string[] = [];
  if (submissionDate.length === 0) {
    notes.push("提出年月日が未入力です。実際に提出する日をご自身で記入してください。");
  }
  notes.push(
    "青色申告承認申請書の提出期限は、原則としてその年の3月15日まで（その年の1月16日以後に新たに業務を開始した場合は、業務開始日から2か月以内）とされています。具体的な期限日の計算・判定はこの画面では行いませんので、実際の期限はご自身で国税庁ウェブサイト等でご確認ください。"
  );
  if (inputs.hasPriorRevocationOrWithdrawal) {
    notes.push(
      "青色申告の承認の取消し又は取りやめの後は、一定期間、再度の承認を受けられない場合があるという一般的な制度上の制約があります。具体的な可否は所轄税務署にご確認ください。"
    );
  }
  if (
    inputs.bookkeepingMethod === "double" &&
    (!maintainedLedgers.includes("仕訳帳") || !maintainedLedgers.includes("総勘定元帳"))
  ) {
    notes.push(
      "簿記方式で複式簿記を選択していますが、備付帳簿名に仕訳帳・総勘定元帳が選択されていません。実際の記帳方法をご確認ください(青色申告特別控除額の判定は別画面の機能をご利用ください)。"
    );
  }

  return {
    sections: [
      submitterSection,
      filerSection,
      applicableYearSection,
      businessSection,
      revocationSection,
      startAndSuccessionSection,
      otherReferenceSection,
    ],
    warnings,
    notes,
    assumptions: [
      "この下書きは、国税庁「所得税の青色申告承認申請書」の様式のうち、フリガナ・電話番号を除く基本的な記載事項を対象としています。",
      "提出先税務署は、利用者が入力したプレースホルダー文字列をそのまま表示しているだけであり、納税地からの自動判定は行っていません。",
      "青色申告特別控除額(65万円/55万円/10万円)の判定・計算はこのモジュールの対象外です(別途「青色申告特別控除」機能をご利用ください)。",
      "提出期限(原則3月15日、新規開業の場合は業務開始日から2か月以内)の具体的な期限日は計算していません。",
    ],
    disclaimer: BLUE_RETURN_APPLICATION_DISCLAIMER,
  };
}

/** 下書きが必須項目をすべて満たしているか(warnings が空かどうか)の簡易ヘルパー */
export function isBlueReturnApplicationDraftComplete(draft: BlueReturnApplicationDraft): boolean {
  return draft.warnings.length === 0;
}
