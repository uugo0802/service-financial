// ------------------------------------------------------------------
// 「個人事業の開業・廃業等届出書」(国税庁様式、所得税法229条)のうち、個人事業主が
// これから事業を開始する場合(開業)の下書きデータ生成。
//
// 対象は、これから事業を開始するフリーランス・個人事業主が、開業届に記載すべき
// 基本的な事項を整理するための下書き作成。実際の様式は「開業・廃業等」の両方の
// 届出を1枚で兼ねており、廃業・事業所の新増設/移転/廃止・廃業に伴う法人設立等の
// 記載欄も持つが、このモジュールは意図的に「個人事業主の開業」のみを対象範囲とする
// (廃業届は別スコープ。ファイル名 businessCommencementNotificationForm が示すとおり)。
//
// 実際の様式には以下のような欄があるが、このモジュールは記帳データからは読み取れ
// ない・利用者の自由記載に委ねるべき事項が大半のため、機械的に組み立てられる範囲
// (提出先・提出日、氏名・生年月日・職業・屋号・納税地、開業日、事業の概要、給与等
// の支払の状況、青色申告承認申請書の同時提出有無)に限定している。
//
// 意図的に含めない事項:
//   - 廃業・事務所等の新増設/移転/廃止に関する記載欄(このモジュールは開業のみ対象)
//   - 廃業の事由が法人の設立に伴うものである場合の新設法人情報(同上)
//   - 所得の種類(不動産所得・山林所得・事業所得)の選択(多くの利用者は事業所得の
//     ため様式上は選べるが、個別の所得区分の判定は利用者の事業内容次第であり、
//     本モジュールが機械的に決め打ちすべきではないため対象外)
//   - 消費税課税事業者選択届出書の同時提出有無(インボイス関連は
//     invoiceRegistrationApplicationForm.ts の対象。開業時点では免税事業者が
//     通常であり、この届出書の要否は利用者の個別事情によるため対象外)
//   - 源泉所得税の納期の特例の承認に関する申請書の同時提出有無(従業員を雇う場合に
//     関連する別の届出書であり、様式・要件が別建てのため対象外。給与等の支払の
//     状況を入力した場合は、留意事項としてその存在のみ案内する)
//   - 個人番号(マイナンバー)。docs/cto-tech-architecture.mdの方針どおり、当社は
//     マイナンバーそのものを取得・保存しない。様式上は記載欄があるため、下書きには
//     「ご自身でご記入ください」という固定のプレースホルダー文言のみを表示し、
//     利用者からの入力は一切受け付けない(BusinessCommencementNotificationInputsに
//     マイナンバーに相当するフィールドは存在しない)。
//   - 提出期限そのものの日付計算(開業日から1か月以内が原則の目安だが、土日祝日の
//     取扱い等、正確な期限は国税庁の最新情報に基づき利用者自身が確認すべき事項の
//     ため、一般的なルールの案内にとどめ、特定の期限日を計算・断定しない)
//
// このモジュールは下書きデータの組み立てのみを行う純粋関数群であり、実際の提出
// (e-Tax又は書面)は利用者本人が行う必要がある。税理士法に定める税務代理・
// 税務書類の作成・個別具体的な税務相談には該当しない(本人申告支援ツール型、
// docs/business-plan.md 2章)。
// ------------------------------------------------------------------

export interface BusinessCommencementNotificationInputs {
  /**
   * 提出先税務署のプレースホルダー文字列(例:"〇〇税務署")。
   * このモジュールは納税地から所轄税務署を判定・検索しない。利用者自身が
   * 国税庁「税務署の所在地及び管轄区域」等で確認した名称をそのまま入力する前提。
   */
  taxOfficeJurisdiction: string;
  /** 提出年月日(自由記述、例:"2026年8月10日")。省略可 */
  submissionDate?: string;
  /** 納税地(住所又は居所) */
  address: string;
  /** 氏名 */
  name: string;
  /** 生年月日(自由記述、例:"1990年4月1日")。このモジュールは日付として解釈・検証しない */
  dateOfBirth: string;
  /** 職業 */
  occupation: string;
  /** 屋号。屋号がない場合は省略可 */
  tradeName?: string;
  /** 開業・廃業等日(自由記述、例:"2026年8月1日")。このモジュールは日付として解釈・検証しない */
  commencementDate: string;
  /** 事業の概要(自由記述) */
  businessDescription: string;
  /** 開業にあたり従業員(専従者を含む使用人)を雇うかどうか */
  hasEmployees: boolean;
  /** 雇う場合の人数。hasEmployeesがfalseの場合は無視される */
  employeeCount?: number;
  /** 給与支払を開始する年月日(自由記述)。hasEmployeesがfalseの場合は無視される */
  salaryPaymentStartDate?: string;
  /** 青色申告承認申請書をこの開業届と同時に提出する予定かどうか */
  fileBlueTaxReturnApplicationSimultaneously: boolean;
}

export interface BusinessCommencementNotificationField {
  label: string;
  /** 未入力の場合は空文字列ではなく "（未入力）" 等のプレースホルダー文言を入れる */
  value: string;
}

export interface BusinessCommencementNotificationSection {
  title: string;
  fields: BusinessCommencementNotificationField[];
}

export interface BusinessCommencementNotificationDraft {
  sections: BusinessCommencementNotificationSection[];
  /** 必須項目の未入力等、下書きとして不完全な点。空配列なら(形式上は)問題なし */
  warnings: string[];
  /** 提出期限の一般的な案内など、警告ではないが利用者に留意してほしい事項 */
  notes: string[];
  /** このモジュールが依拠している一般的な前提・対象範囲の一覧 */
  assumptions: string[];
  disclaimer: string;
}

export const BUSINESS_COMMENCEMENT_NOTIFICATION_DISCLAIMER =
  "この画面は「個人事業の開業・廃業等届出書」(開業の場合)の下書きデータを作成するものであり、正式な届出書そのものではありません。実際の提出(e-Tax又は書面提出)は、内容をご自身で確認のうえ、利用者ご自身の責任で行ってください。当社が代理で提出することはありません。また、この下書きの作成は税理士法に定める税務代理・税務書類の作成・個別具体的な税務相談には該当せず、提出の要否や記載内容についての個別具体的な助言も行いません。最終的な内容の確認・判断は、必要に応じて税理士等の専門家にご相談のうえご自身で行ってください。";

const UNSPECIFIED = "（未入力）";
const NO_TRADE_NAME = "（屋号なし）";
/** マイナンバーは当社では一切取得・保存しない(docs/cto-tech-architecture.md参照)。常にこの固定文言のみを表示する。 */
const MY_NUMBER_PLACEHOLDER = "ご自身でご記入ください（当システムでは個人番号を入力・保存しません）";

function fieldValue(raw: string | undefined): string {
  const trimmed = raw?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : UNSPECIFIED;
}

function formatEmployeeCount(count: number | undefined): string {
  if (count == null || !Number.isFinite(count) || !Number.isInteger(count) || count <= 0) {
    return UNSPECIFIED;
  }
  return `${count}人`;
}

/**
 * 基本情報(提出者情報・開業日・事業の概要・給与等の支払の状況・青色申告承認申請書の
 * 同時提出有無)から、「個人事業の開業・廃業等届出書」(開業の場合)の下書きデータを
 * 組み立てる純粋関数。ネットワークアクセス・外部データ参照は一切行わない。
 */
export function buildBusinessCommencementNotificationDraft(
  inputs: BusinessCommencementNotificationInputs
): BusinessCommencementNotificationDraft {
  const taxOfficeJurisdiction = inputs.taxOfficeJurisdiction?.trim() ?? "";
  const submissionDate = inputs.submissionDate?.trim() ?? "";
  const address = inputs.address?.trim() ?? "";
  const name = inputs.name?.trim() ?? "";
  const dateOfBirth = inputs.dateOfBirth?.trim() ?? "";
  const occupation = inputs.occupation?.trim() ?? "";
  const tradeName = inputs.tradeName?.trim() ?? "";
  const commencementDate = inputs.commencementDate?.trim() ?? "";
  const businessDescription = inputs.businessDescription?.trim() ?? "";
  const hasEmployees = inputs.hasEmployees;
  const employeeCount = inputs.employeeCount;
  const salaryPaymentStartDate = inputs.salaryPaymentStartDate?.trim() ?? "";
  const fileBlueTaxReturnApplicationSimultaneously = inputs.fileBlueTaxReturnApplicationSimultaneously;

  const warnings: string[] = [];
  if (taxOfficeJurisdiction.length === 0) {
    warnings.push(
      "提出先税務署が入力されていません。国税庁「税務署の所在地及び管轄区域」等で、納税地を所轄する税務署名をご確認のうえ入力してください。"
    );
  }
  if (address.length === 0) {
    warnings.push("納税地(住所又は居所)が入力されていません。");
  }
  if (name.length === 0) {
    warnings.push("氏名が入力されていません。");
  }
  if (dateOfBirth.length === 0) {
    warnings.push("生年月日が入力されていません。");
  }
  if (occupation.length === 0) {
    warnings.push("職業が入力されていません。");
  }
  if (commencementDate.length === 0) {
    warnings.push("開業・廃業等日が入力されていません。");
  }
  if (businessDescription.length === 0) {
    warnings.push("事業の概要が入力されていません。");
  }
  if (hasEmployees) {
    if (
      employeeCount == null ||
      !Number.isFinite(employeeCount) ||
      !Number.isInteger(employeeCount) ||
      employeeCount <= 0
    ) {
      warnings.push("従業員を雇う場合、従業員数(1人以上の整数)を入力してください。");
    }
    if (salaryPaymentStartDate.length === 0) {
      warnings.push("従業員を雇う場合、給与支払を開始する年月日を入力してください。");
    }
  }

  const submitterSection: BusinessCommencementNotificationSection = {
    title: "提出先",
    fields: [
      { label: "提出先税務署", value: fieldValue(taxOfficeJurisdiction) },
      { label: "提出日", value: fieldValue(submissionDate) },
    ],
  };

  const filerSection: BusinessCommencementNotificationSection = {
    title: "提出者情報",
    fields: [
      { label: "納税地", value: fieldValue(address) },
      { label: "氏名", value: fieldValue(name) },
      { label: "生年月日", value: fieldValue(dateOfBirth) },
      { label: "個人番号（マイナンバー）", value: MY_NUMBER_PLACEHOLDER },
      { label: "職業", value: fieldValue(occupation) },
      { label: "屋号", value: tradeName.length > 0 ? tradeName : NO_TRADE_NAME },
    ],
  };

  const noticeSection: BusinessCommencementNotificationSection = {
    title: "届出の区分",
    fields: [
      { label: "届出の区分", value: "開業" },
      { label: "開業・廃業等日", value: fieldValue(commencementDate) },
    ],
  };

  const businessDescriptionSection: BusinessCommencementNotificationSection = {
    title: "事業の概要",
    fields: [{ label: "事業の概要", value: fieldValue(businessDescription) }],
  };

  const salaryFields: BusinessCommencementNotificationField[] = [
    { label: "従業員を雇うか", value: hasEmployees ? "はい" : "いいえ" },
  ];
  if (hasEmployees) {
    salaryFields.push({ label: "従業員数", value: formatEmployeeCount(employeeCount) });
    salaryFields.push({ label: "給与支払を開始する年月日", value: fieldValue(salaryPaymentStartDate) });
  }
  const salarySection: BusinessCommencementNotificationSection = {
    title: "給与等の支払の状況",
    fields: salaryFields,
  };

  const attachmentSection: BusinessCommencementNotificationSection = {
    title: "添付書類",
    fields: [
      {
        label: "青色申告承認申請書を同時に提出するか",
        value: fileBlueTaxReturnApplicationSimultaneously ? "はい(同時に提出する)" : "いいえ",
      },
    ],
  };

  const notes: string[] = [
    "この届出書(開業)の提出期限は、原則として事業開始等の日から1か月以内が目安です(所得税法229条)。提出期限が土日祝日にあたる場合の取扱い等、正確な期限はご自身で国税庁の最新情報をご確認ください。この画面では、入力された開業・廃業等日から具体的な期限日を計算することはしません。",
  ];
  if (submissionDate.length === 0) {
    notes.push("提出日が未入力です。実際に税務署へ提出する(またはe-Taxで送信する)日付をご自身で記入してください。");
  }
  if (fileBlueTaxReturnApplicationSimultaneously) {
    notes.push(
      "青色申告承認申請書の提出期限は、原則としてその年の3月15日まで、事業を1月16日以後に開始した場合は事業開始等の日から2か月以内が目安です。この画面では青色申告承認申請書自体の下書きは作成しません。様式・記載内容は別途ご準備のうえ、この開業届とあわせて提出してください。"
    );
  }
  if (hasEmployees) {
    notes.push(
      "従業員(専従者を含む使用人)を雇う場合、別途「給与支払事務所等の開設・移転・廃止届出書」の提出や、源泉徴収した所得税の納付(源泉所得税の納期の特例の承認に関する申請書を提出すれば年2回にまとめて納付可能)が必要になることがあります。これらの届出書の下書き作成は、この画面の対象外です。"
    );
  }

  return {
    sections: [
      submitterSection,
      filerSection,
      noticeSection,
      businessDescriptionSection,
      salarySection,
      attachmentSection,
    ],
    warnings,
    notes,
    assumptions: [
      "この下書きは、国税庁「個人事業の開業・廃業等届出書」の様式のうち、個人事業主の「開業」に関する基本的な記載事項(提出先・提出日、氏名・生年月日・職業・屋号・納税地、開業・廃業等日、事業の概要、給与等の支払の状況、青色申告承認申請書の同時提出有無)のみを対象としています。",
      "廃業、事務所等の新増設・移転・廃止、廃業に伴う法人設立、所得の種類の選択、消費税課税事業者選択届出書・源泉所得税の納期の特例の承認に関する申請書の同時提出有無は、この画面の対象外です。",
      "提出先税務署は、利用者が入力したプレースホルダー文字列をそのまま表示しているだけであり、納税地からの自動判定は行っていません。",
      "個人番号(マイナンバー)は当社では取得・保存せず、この下書きにも入力欄を設けていません。様式上の記載欄には固定の案内文言のみを表示します。",
    ],
    disclaimer: BUSINESS_COMMENCEMENT_NOTIFICATION_DISCLAIMER,
  };
}

/** 下書きが必須項目をすべて満たしているか(warnings が空かどうか)の簡易ヘルパー */
export function isBusinessCommencementNotificationDraftComplete(
  draft: BusinessCommencementNotificationDraft
): boolean {
  return draft.warnings.length === 0;
}
