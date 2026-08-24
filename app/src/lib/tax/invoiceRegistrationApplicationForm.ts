// ------------------------------------------------------------------
// 「適格請求書発行事業者の登録申請書」（インボイス制度・国内事業者用）の下書きデータ生成。
//
// 対象は、まだインボイス登録番号を持っていない事業者（個人事業主・法人）が、これから
// 登録申請を行うための下書き作成。既存の
// `src/lib/categorize/invoiceRegistrationValidator.ts` は「既に取得した登録番号の
// 形式・チェックデジットが正しいか」を検証するものだが、このモジュールはその逆
// ──まだ登録していない事業者が申請書に記載すべき事項を整理する──を担う。
//
// 実際の様式（国税庁「[手続名]適格請求書発行事業者の登録申請書」国内事業者用）には
// 以下のような欄があるが、このモジュールは記帳データからは読み取れない・利用者の
// 自由記載に委ねるべき事項が大半のため、機械的に組み立てられる範囲に限定している：
//   - 提出先税務署、提出年月日
//   - 氏名又は名称、（法人の場合）代表者氏名、納税地
//   - 事業者区分（個人事業者／法人）
//   - 免税事業者が登録を機に課税事業者となることを選択する場合の確認欄
//   - 登録を受けようとする年月日（希望日）
//
// 意図的に含めない事項:
//   - 法人番号との整合チェック（法人の場合、登録番号のうち13桁部分は法人番号と一致する
//     という前提のロジックは invoiceRegistrationValidator.ts 側の責務）
//   - 経過措置の適用可否や、免税事業者が登録により課税事業者となる場合の「いつから」を
//     決める具体的な期限・提出期限の計算。国税庁が定める経過措置の対象期間は法改正等で
//     変更されうるため、本モジュールでは特定の日付を断定せず、「国税庁インボイス制度
//     特設サイトで最新の情報をご確認ください」という一般的な案内にとどめる。
//   - 登録が困難な事情がある場合の記載欄（利用者の個別事情の自由記述が前提のため対象外）
//
// このモジュールは下書きデータの組み立てのみを行う純粋関数群であり、実際の提出
// （e-Tax又は書面）は利用者本人が行う必要がある。税理士法に定める税務代理・
// 税務書類の作成・個別具体的な税務相談には該当しない（本人申告支援ツール型、
// docs/business-plan.md 2章）。
// ------------------------------------------------------------------

export type InvoiceRegistrationEntityType = "individual" | "corporation";

export interface InvoiceRegistrationApplicationInputs {
  /** 個人事業者 or 法人 */
  entityType: InvoiceRegistrationEntityType;
  /** 氏名又は名称 */
  name: string;
  /** 代表者氏名（法人の場合に様式上必要。個人事業者では空欄でよい） */
  representativeName?: string;
  /** 納税地（住所又は居所・主たる事務所の所在地等） */
  address: string;
  /**
   * 提出先税務署のプレースホルダー文字列（例："〇〇税務署"）。
   * このモジュールは納税地から所轄税務署を判定・検索しない。利用者自身が
   * 国税庁「税務署の所在地及び管轄区域」等で確認した名称をそのまま入力する前提。
   */
  taxOfficeJurisdiction: string;
  /**
   * 申請時点で免税事業者であり、この登録をもって課税事業者となることを選択するか。
   * true の場合、様式上の「免税事業者の確認」欄に対応する記載を下書きに含める。
   */
  isTaxExemptElectingTaxableStatus: boolean;
  /**
   * 登録を受けようとする年月日についての希望（自由記述、例："2027年1月1日"
   * "できるだけ早く" 等）。省略可。このモジュールは提出期限や実際の登録日を
   * 計算・保証しない（利用者の希望をそのまま転記するのみ）。
   */
  desiredEffectiveDatePreference?: string;
}

export interface InvoiceRegistrationApplicationField {
  label: string;
  /** 未入力の場合は空文字列ではなく "（未入力）" 等のプレースホルダー文言を入れる */
  value: string;
}

export interface InvoiceRegistrationApplicationSection {
  title: string;
  fields: InvoiceRegistrationApplicationField[];
}

export interface InvoiceRegistrationApplicationDraft {
  entityType: InvoiceRegistrationEntityType;
  entityTypeLabel: string;
  sections: InvoiceRegistrationApplicationSection[];
  /** 必須項目の未入力等、下書きとして不完全な点。空配列なら（形式上は）問題なし */
  warnings: string[];
  /** 経過措置の一般的な案内など、警告ではないが利用者に留意してほしい事項 */
  notes: string[];
  /** このモジュールが依拠している一般的な前提の一覧 */
  assumptions: string[];
  disclaimer: string;
}

export const INVOICE_REGISTRATION_APPLICATION_DISCLAIMER =
  "この画面は「適格請求書発行事業者の登録申請書」の下書きデータを作成するものであり、正式な申請書そのものではありません。実際の申請(e-Tax又は書面提出)は、内容をご自身で確認のうえ、利用者ご自身の責任で行ってください。当社が代理で提出することはありません。また、この下書きの作成は税理士法に定める税務代理・税務書類の作成・個別具体的な税務相談には該当せず、登録の要否や登録日の判断についての個別具体的な助言も行いません。最終的な内容の確認・判断は、必要に応じて税理士等の専門家にご相談のうえご自身で行ってください。";

const ENTITY_TYPE_LABELS: Record<InvoiceRegistrationEntityType, string> = {
  individual: "個人事業者",
  corporation: "法人",
};

const UNSPECIFIED = "（未入力）";

function fieldValue(raw: string | undefined): string {
  const trimmed = raw?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : UNSPECIFIED;
}

/**
 * 基本情報（事業者情報・提出先・免税事業者の選択・登録希望日）から、
 * 「適格請求書発行事業者の登録申請書」の下書きデータを組み立てる純粋関数。
 * ネットワークアクセス・外部データ参照は一切行わない。
 */
export function buildInvoiceRegistrationApplicationDraft(
  inputs: InvoiceRegistrationApplicationInputs
): InvoiceRegistrationApplicationDraft {
  const { entityType } = inputs;
  const name = inputs.name?.trim() ?? "";
  const address = inputs.address?.trim() ?? "";
  const taxOfficeJurisdiction = inputs.taxOfficeJurisdiction?.trim() ?? "";
  const representativeName = inputs.representativeName?.trim() ?? "";
  const desiredEffectiveDatePreference = inputs.desiredEffectiveDatePreference?.trim() ?? "";

  const warnings: string[] = [];
  if (name.length === 0) {
    warnings.push("氏名又は名称が入力されていません。");
  }
  if (address.length === 0) {
    warnings.push("納税地(住所又は所在地)が入力されていません。");
  }
  if (taxOfficeJurisdiction.length === 0) {
    warnings.push(
      "提出先税務署が入力されていません。国税庁「税務署の所在地及び管轄区域」等で、納税地を所轄する税務署名をご確認のうえ入力してください。"
    );
  }
  if (entityType === "corporation" && representativeName.length === 0) {
    warnings.push("法人の場合、様式上は代表者氏名の記載欄があります。代表者氏名の入力をおすすめします。");
  }

  const submitterSection: InvoiceRegistrationApplicationSection = {
    title: "提出先",
    fields: [{ label: "提出先税務署", value: fieldValue(taxOfficeJurisdiction) }],
  };

  const filerFields: InvoiceRegistrationApplicationField[] = [
    { label: "事業者区分", value: ENTITY_TYPE_LABELS[entityType] },
    { label: "氏名又は名称", value: fieldValue(name) },
  ];
  if (entityType === "corporation") {
    filerFields.push({ label: "代表者氏名", value: fieldValue(representativeName) });
  }
  filerFields.push({ label: "納税地", value: fieldValue(address) });

  const filerSection: InvoiceRegistrationApplicationSection = {
    title: "事業者情報",
    fields: filerFields,
  };

  const exemptStatusSection: InvoiceRegistrationApplicationSection = {
    title: "免税事業者に関する確認",
    fields: [
      {
        label: "申請時点で免税事業者であり、この登録を機に課税事業者となることを選択するか",
        value: inputs.isTaxExemptElectingTaxableStatus ? "はい(選択する)" : "いいえ(該当しない、又は既に課税事業者)",
      },
    ],
  };

  const effectiveDateSection: InvoiceRegistrationApplicationSection = {
    title: "登録を受けようとする年月日(希望)",
    fields: [
      {
        label: "希望日",
        value: fieldValue(desiredEffectiveDatePreference),
      },
    ],
  };

  const notes: string[] = [];
  if (desiredEffectiveDatePreference.length === 0) {
    notes.push(
      "登録希望日が未入力です。実際にいつから登録されるかは、税務署での処理状況等によって希望どおりにならない場合があります。"
    );
  }
  if (inputs.isTaxExemptElectingTaxableStatus) {
    notes.push(
      "免税事業者が登録を受けることで課税事業者となることを選択する場合、経過措置の適用有無・適用期間によって別途「消費税課税事業者選択届出書」の提出要否が変わることがあります。適用期間・要件は法改正等により変更されることがあるため、具体的な日付はこの画面では示していません。国税庁「インボイス制度特設サイト」で最新の情報をご確認ください。"
    );
  }

  return {
    entityType,
    entityTypeLabel: ENTITY_TYPE_LABELS[entityType],
    sections: [submitterSection, filerSection, exemptStatusSection, effectiveDateSection],
    warnings,
    notes,
    assumptions: [
      "この下書きは、国税庁「[手続名]適格請求書発行事業者の登録申請書」(国内事業者用)の様式のうち、氏名又は名称・納税地・事業者区分・免税事業者の確認・登録希望日という基本的な記載事項のみを対象としています。",
      "提出先税務署は、利用者が入力したプレースホルダー文字列をそのまま表示しているだけであり、納税地からの自動判定は行っていません。",
      "登録番号そのものはこの申請の結果として税務署から通知されるものであり、この下書きの時点では発行されていません。",
    ],
    disclaimer: INVOICE_REGISTRATION_APPLICATION_DISCLAIMER,
  };
}

/** 下書きが必須項目をすべて満たしているか(warnings が空かどうか)の簡易ヘルパー */
export function isInvoiceRegistrationApplicationDraftComplete(
  draft: InvoiceRegistrationApplicationDraft
): boolean {
  return draft.warnings.length === 0;
}
