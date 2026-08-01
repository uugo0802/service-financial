// ------------------------------------------------------------------
// 免責: このモジュールは、青色申告を行う個人事業主が、生計を一にする家族従業員
// （事業専従者）に支払う給与について、「青色事業専従者給与」の必要経費算入の
// 可否・上限額を確認するための簡易チェックツールです（所得税法57条1項）。
//
// 【制度の概要】
// 白色申告の場合、家族従業員への給与は原則として必要経費に算入できず、代わりに
// 一定額の「事業専従者控除」（配偶者86万円・その他50万円等、定額）が認められる
// だけです。これに対し、青色申告を行っている事業主が、
//   (1) 事前に「青色事業専従者給与に関する届出書」を所轄税務署に提出し、
//       家族従業員の氏名・仕事の内容・支払う給与の「上限額」をあらかじめ
//       届け出ておき、
//   (2) 実際に支払う給与の額が、その届出書に記載した上限額の範囲内であり、
//   (3) 支払われた給与の額が、その家族従業員の労務の対価として相当な額
//       （労務の対価として相当であること。本モジュールでは金額の妥当性の
//       個別判定は行わない）
// という条件を満たす場合、実際に支払った給与の全額を事業の必要経費に算入
// できます（事業専従者控除のような定額制限ではなく、届出額を上限とする実額
// 控除）。
//
// 【専従者としての要件（所得税法57条1項・所得税法施行令165条）】
// 家族従業員が「事業専従者」として認められるには、その年12月31日（本モジュール
// では届出書提出時に定めた「その年12月15日」時点として簡略化して判定します。
// 正式な判定基準日は必ず国税庁の最新資料でご確認ください）現在で次のいずれも
// 満たす必要があります。
//   (a) 事業主と生計を一にする配偶者その他の親族であること（生計を一にする）
//   (b) その年12月15日現在で年齢が15歳以上であること
//   (c) その年を通じて6か月を超える期間、その事業に専ら従事していること
//       （専ら従事）
// これらは「計算」ではなく「該当するかどうか」を利用者自身が判断すべき
// 適格性チェック項目であるため、本モジュールでは生年月日から機械的に算出できる
// 年齢要件のみ日付計算を行い、生計を一にするか・専ら従事しているかは利用者が
// 入力するチェック項目（真偽値）として扱い、それ以上の自動判定は行いません。
//
// 【本モジュールが確認しない前提条件】
// 本モジュールは、以下の前提が満たされていることを利用者が別途確認済みで
// あることを前提としており、これらの確認・検証は一切行いません。
//   - 事業主が青色申告（青色申告承認申請書の提出・承認）を行っていること
//   - 「青色事業専従者給与に関する届出書」を所轄税務署へ提出済みであること
//     （原則その年3月15日まで。1月16日以後に開業した場合等は開業等の日から
//     2か月以内）
//   - 実際に支払った給与額が、労務の対価として相当な金額であること
//
// 【扶養控除・配偶者控除等との関係】
// 青色事業専従者給与の支払を受けた家族従業員は、その年について事業主の
// 「控除対象扶養親族」や「控除対象配偶者（配偶者控除・配偶者特別控除）」
// には該当しません（所得税法2条1項33号・33号の2等）。本モジュールはこの点を
// 自動判定せず、常に注意喚起（warnings）として表示します。
//
// 【家族従業員側の課税】
// 支払われた青色事業専従者給与は、受け取った家族従業員本人にとっての給与所得
// （給与収入）となり、家族従業員自身が年末調整または確定申告により所得税を
// 計算・納付する必要があります。本モジュールは家族従業員本人の税額計算は
// 一切行いません（対象外）。
//
// このツールは青色事業専従者給与の必要経費算入可否・上限額の目安を示す
// だけであり、税理士法上の税務代理・税務書類の作成・個別具体的な税務相談には
// 該当しません。「青色事業専従者給与に関する届出書」自体の作成・提出を代行
// するものでもありません。正式な適用にあたっては、必ず国税庁公表の最新の
// 資料を確認し、必要に応じて税理士等の専門家にご相談ください。
// ------------------------------------------------------------------

const MIN_TAX_YEAR = 2000;
const MAX_TAX_YEAR = 2100;

/** 専従者要件の年齢判定基準日（月・日）。本モジュールでは簡略化して「その年12月15日」を用いる */
const AGE_CHECK_MONTH = 12; // 1-12
const AGE_CHECK_DAY = 15;

/** 専従者として認められるための最低年齢（歳） */
const MIN_ELIGIBLE_AGE = 15;

function assertFiniteNonNegative(value: number, label: string): void {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${label}は数値で入力してください。`);
  }
  if (value < 0) {
    throw new Error(`${label}は0以上の数値で入力してください。`);
  }
}

function assertBoolean(value: boolean, label: string): void {
  if (typeof value !== "boolean") {
    throw new Error(`${label}はtrue/falseで入力してください。`);
  }
}

/** "YYYY-MM-DD" 等のISO形式の日付文字列を Date に変換し、不正な場合はエラーとする */
function parseBirthdate(value: string): Date {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error("専従者（家族従業員）の生年月日を入力してください。");
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error("専従者（家族従業員）の生年月日の形式が正しくありません（例: 2000-04-01）。");
  }
  return date;
}

/** 指定した年の年齢判定基準日（その年12月15日）時点での満年齢を計算する */
function calcAgeAsOfCheckDate(birthdate: Date, taxYear: number): number {
  const checkDate = new Date(Date.UTC(taxYear, AGE_CHECK_MONTH - 1, AGE_CHECK_DAY));
  const birthUTC = Date.UTC(birthdate.getUTCFullYear(), birthdate.getUTCMonth(), birthdate.getUTCDate());
  let age = checkDate.getUTCFullYear() - birthdate.getUTCFullYear();
  const monthDiff = checkDate.getUTCMonth() - birthdate.getUTCMonth();
  if (monthDiff < 0 || (monthDiff === 0 && checkDate.getUTCDate() < birthdate.getUTCDate())) {
    age -= 1;
  }
  if (birthUTC > checkDate.getTime()) {
    throw new Error("専従者（家族従業員）の生年月日が、対象年の年齢判定基準日より後になっています。");
  }
  return age;
}

export interface FamilyEmployeeSalaryInput {
  /** 「青色事業専従者給与に関する届出書」に記載した、その年に支払う給与の上限額（円） */
  declaredMaxAmount: number;
  /** その年に実際に支払った（支払う予定の）給与の額（円） */
  actualPaidAmount: number;
  /** 専従者（家族従業員）の生年月日（ISO形式の文字列、例: "2000-04-01"） */
  familyMemberBirthdate: string;
  /** 対象の年（西暦、例: 2026） */
  taxYear: number;
  /** 事業主と生計を一にしているか（同居の有無だけでなく、仕送り等による生計同一も含む） */
  cohabiting: boolean;
  /** その年を通じて6か月を超える期間、専らこの事業に従事しているか（専ら従事） */
  primarilyEngaged: boolean;
}

/** 適格性チェック項目のキー */
export type FamilyEmployeeEligibilityCriterionKey = "cohabiting" | "age" | "primarilyEngaged";

export interface FamilyEmployeeEligibilityCriterion {
  key: FamilyEmployeeEligibilityCriterionKey;
  /** チェック項目の表示ラベル */
  label: string;
  /** この項目を満たしているか */
  met: boolean;
  /** 制度上の根拠・補足説明（プレーンな言葉での説明） */
  description: string;
}

export interface FamilyEmployeeSalaryResult {
  /**
   * 専従者要件（生計を一にする・年齢15歳以上・専ら従事）をすべて満たしているか。
   * これはあくまで本モジュールが確認できる範囲での判定であり、青色申告の有無や
   * 届出書の提出有無は含まれない（ファイル冒頭のコメント参照）。
   */
  eligible: boolean;
  /** 実際に支払った給与額が、届出書に記載した上限額を超えているか */
  exceedsDeclaredCap: boolean;
  /**
   * 必要経費に算入できる金額（円）。
   * eligibleがtrueの場合は min(実際の支払額, 届出上限額)、falseの場合は0。
   */
  deductibleAmount: number;
  /** 各ルールに関する注意喚起メッセージ（プレーンな言葉での説明） */
  warnings: string[];
  /** その他の参考情報・補足事項 */
  notes: string[];
  /** 専従者要件（適格性）のチェックリスト */
  eligibilityChecklist: FamilyEmployeeEligibilityCriterion[];
  /** 年齢判定基準日（その年12月15日）時点での専従者の満年齢 */
  ageAsOfCheckDate: number;
}

/**
 * 「青色事業専従者給与に関する届出書」の上限額・実際の支払額・専従者の生年月日・
 * 対象年・適格性に関する入力（生計を一にするか、専ら従事しているか）から、
 * 青色事業専従者給与として必要経費に算入できる金額と、関連する注意事項を返す。
 *
 * 実際の計算は「min(実際の支払額, 届出上限額)」という単純な比較のみであり、
 * 青色申告の承認状況や届出書の提出有無、支払額が労務の対価として相当かどうかは
 * 確認しない（常にwarnings/notesとして注意喚起する）。
 *
 * @throws 入力が数値でない・0未満、対象年が範囲外、生年月日が不正、
 *   生計を一にするか・専ら従事しているかがboolean以外の場合
 */
export function calculateFamilyEmployeeSalary(input: FamilyEmployeeSalaryInput): FamilyEmployeeSalaryResult {
  const { declaredMaxAmount, actualPaidAmount, familyMemberBirthdate, taxYear, cohabiting, primarilyEngaged } = input;

  assertFiniteNonNegative(declaredMaxAmount, "届出書に記載した給与の上限額");
  assertFiniteNonNegative(actualPaidAmount, "実際に支払った給与の額");
  assertBoolean(cohabiting, "生計を一にするかどうか");
  assertBoolean(primarilyEngaged, "専ら従事しているかどうか");

  if (!Number.isInteger(taxYear) || taxYear < MIN_TAX_YEAR || taxYear > MAX_TAX_YEAR) {
    throw new Error(`対象の年は${MIN_TAX_YEAR}〜${MAX_TAX_YEAR}の範囲の西暦（整数）で入力してください。`);
  }

  const birthdate = parseBirthdate(familyMemberBirthdate);
  const ageAsOfCheckDate = calcAgeAsOfCheckDate(birthdate, taxYear);
  const meetsAgeRequirement = ageAsOfCheckDate >= MIN_ELIGIBLE_AGE;

  const eligibilityChecklist: FamilyEmployeeEligibilityCriterion[] = [
    {
      key: "cohabiting",
      label: "生計を一にする配偶者その他の親族であること",
      met: cohabiting,
      description:
        "必ずしも同居している必要はありませんが、生活費・学資金・療養費等を通じて日常の生計を一にしていることが必要です。",
    },
    {
      key: "age",
      label: `その年12月15日現在で年齢が${MIN_ELIGIBLE_AGE}歳以上であること`,
      met: meetsAgeRequirement,
      description: `生年月日から計算すると、${taxYear}年12月15日時点の満年齢は${ageAsOfCheckDate}歳です。`,
    },
    {
      key: "primarilyEngaged",
      label: "その年を通じて6か月を超える期間、専らこの事業に従事していること",
      met: primarilyEngaged,
      description:
        "他に本業がある場合や、学業に専念する期間が長い場合等は「専ら従事」に該当しない可能性があります。",
    },
  ];

  const eligible = eligibilityChecklist.every((c) => c.met);
  const exceedsDeclaredCap = actualPaidAmount > declaredMaxAmount;
  const deductibleAmount = eligible ? Math.min(actualPaidAmount, declaredMaxAmount) : 0;

  const warnings: string[] = [];
  for (const criterion of eligibilityChecklist) {
    if (!criterion.met) {
      warnings.push(`専従者要件「${criterion.label}」を満たしていない可能性があります。${criterion.description}`);
    }
  }
  if (exceedsDeclaredCap) {
    warnings.push(
      `実際に支払った給与額（${actualPaidAmount.toLocaleString("ja-JP")}円）が、届出書に記載した上限額（` +
        `${declaredMaxAmount.toLocaleString("ja-JP")}円）を超えています。超過分は青色事業専従者給与として必要経費に` +
        "算入できません（届出書の変更が必要な場合は「青色事業専従者給与に関する変更届出書」の提出をご検討ください）。"
    );
  }
  warnings.push(
    "この給与の支払を受ける家族従業員は、その年について事業主の控除対象扶養親族には該当せず、また配偶者の場合は" +
      "配偶者控除・配偶者特別控除の対象にもなりません。扶養控除等申告書や確定申告で二重に控除を受けないようご注意ください。"
  );
  warnings.push(
    "青色事業専従者給与は、青色申告の承認を受けており、かつ「青色事業専従者給与に関する届出書」を事前に" +
      "所轄税務署へ提出済みであることが前提です。本モジュールはこれらの提出状況・承認状況を確認していません。"
  );

  const notes: string[] = [
    "支払われた給与は、受け取る家族従業員本人にとっての給与所得（給与収入）となり、家族従業員自身が年末調整または" +
      "確定申告により所得税を計算・納付する必要があります。家族従業員本人の税額計算は本モジュールの対象外です。",
    "実際に支払った給与額が、労務の内容・従事期間等に照らして相当な金額であるかどうか（不相当に高額でないか）は" +
      "本モジュールでは判定していません。",
    "白色申告の場合はこの制度（青色事業専従者給与）を利用できず、代わりに定額の事業専従者控除（配偶者86万円・" +
      "その他の親族1人につき50万円等、事業所得等の金額に応じた上限あり）が適用されます。",
  ];

  return {
    eligible,
    exceedsDeclaredCap,
    deductibleAmount,
    warnings,
    notes,
    eligibilityChecklist,
    ageAsOfCheckDate,
  };
}
