export type EntityType = "individual" | "corp";

export const CONSULTATION_TOPICS = [
  "確定申告全体の内容確認をしてほしい",
  "税務調査・過去分の修正申告について相談したい",
  "資産・相続など高度な税務プランニングが必要",
  "その他",
] as const;

export type ConsultationTopic = (typeof CONSULTATION_TOPICS)[number];

export interface AdvisorReferralFormValues {
  name: string;
  email: string;
  phone: string;
  entityType: EntityType;
  topic: ConsultationTopic | "";
  message: string;
  consent: boolean;
}

export const EMPTY_ADVISOR_REFERRAL_FORM: AdvisorReferralFormValues = {
  name: "",
  email: "",
  phone: "",
  entityType: "individual",
  topic: "",
  message: "",
  consent: false,
};

export type AdvisorReferralFormErrors = Partial<Record<keyof AdvisorReferralFormValues, string>>;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// 日本の電話番号（固定・携帯）を緩めに許容: 数字・ハイフンのみ、9〜13桁程度
const PHONE_PATTERN = /^[0-9-]{9,15}$/;

const MESSAGE_MIN_LENGTH = 20;
const MESSAGE_MAX_LENGTH = 2000;
const NAME_MAX_LENGTH = 60;

export function validateAdvisorReferralForm(values: AdvisorReferralFormValues): AdvisorReferralFormErrors {
  const errors: AdvisorReferralFormErrors = {};

  const name = values.name.trim();
  if (!name) {
    errors.name = "お名前・法人名を入力してください。";
  } else if (name.length > NAME_MAX_LENGTH) {
    errors.name = `お名前・法人名は${NAME_MAX_LENGTH}文字以内で入力してください。`;
  }

  const email = values.email.trim();
  if (!email) {
    errors.email = "メールアドレスを入力してください。";
  } else if (!EMAIL_PATTERN.test(email)) {
    errors.email = "メールアドレスの形式が正しくありません。";
  }

  const phone = values.phone.trim();
  if (phone && !PHONE_PATTERN.test(phone)) {
    errors.phone = "電話番号はハイフン区切りの数字で入力してください（任意項目）。";
  }

  if (!values.topic) {
    errors.topic = "相談したい内容を選択してください。";
  }

  const message = values.message.trim();
  if (!message) {
    errors.message = "相談内容の詳細を入力してください。";
  } else if (message.length < MESSAGE_MIN_LENGTH) {
    errors.message = `相談内容は${MESSAGE_MIN_LENGTH}文字以上で入力してください（提携税理士が概要を把握できる程度の情報が必要です）。`;
  } else if (message.length > MESSAGE_MAX_LENGTH) {
    errors.message = `相談内容は${MESSAGE_MAX_LENGTH}文字以内で入力してください。`;
  }

  if (!values.consent) {
    errors.consent = "提携税理士への情報連携について同意が必要です。";
  }

  return errors;
}

export function isAdvisorReferralFormValid(errors: AdvisorReferralFormErrors): boolean {
  return Object.keys(errors).length === 0;
}

export interface AdvisorReferralSubmission {
  submittedAt: string;
  values: AdvisorReferralFormValues;
}

/**
 * バックエンドは未接続のため、送信内容をコンソールに出力するモック実装。
 * 実際の連携先（提携税理士への通知API等）が決まり次第、この関数の中身のみ差し替える想定。
 */
export async function submitAdvisorReferralForm(
  values: AdvisorReferralFormValues,
): Promise<AdvisorReferralSubmission> {
  const submission: AdvisorReferralSubmission = {
    submittedAt: new Date().toISOString(),
    values,
  };
  console.info("[advisor-referral] submission (mock)", submission);
  return submission;
}
