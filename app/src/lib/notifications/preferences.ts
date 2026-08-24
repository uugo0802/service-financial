// 通知の詳細設定（頻度・静音時間帯）を扱う純粋ロジック層。
//
// 目的: 週次ダイジェスト（weeklyDigest.ts）と申告期限リマインダー（filing/deadlineReminders.ts）は
// それぞれ「何を伝えるか」の計算に徹しており、「いつ・どのくらいの頻度で伝えるか」というユーザーの
// 好みは持たない。本モジュールはその好み（NotificationPreferences）のモデルと、
//   - 設定値そのものの妥当性検証（validateNotificationPreferences）
//   - 現在時刻が静音時間帯にあたるか、通知を抑制すべきかの判定（shouldSuppressNotification）
//   - ブラウザのlocalStorageへの読み書き（load/saveNotificationPreferences、Storage抽象を注入）
// を提供する純粋関数群である。weeklyDigest.ts / filing/deadlineReminders.ts 自体は変更せず、
// それぞれが公開している型（ReminderStatus）だけを利用する。
//
// このモジュールはDate.now()や引数なしのnew Date()を呼ばない。「今」を判定に使う場合は
// 必ず呼び出し側がタイムスタンプ（Date）を明示的に渡す設計とし、テストで固定時刻を注入できるようにする。

import type { ReminderStatus } from "../filing/deadlineReminders";

/** ダイジェストメールの配信頻度。"off" は配信しない（設定はダイジェスト生成側ではなく配信側の責務）。 */
export type DigestFrequency = "weekly" | "monthly" | "off";

const DIGEST_FREQUENCIES: readonly DigestFrequency[] = ["weekly", "monthly", "off"];

/** "HH:mm" 形式の24時間表記時刻文字列（例: "22:00"、"07:30"）。 */
export type TimeOfDay = string;

export interface QuietHours {
  /** 静音時間帯そのものを有効にするかどうか。falseの場合、start/endの値に関わらず一切抑制しない。 */
  enabled: boolean;
  /** 静音時間帯の開始時刻（"HH:mm"、その時刻を含む）。 */
  start: TimeOfDay;
  /** 静音時間帯の終了時刻（"HH:mm"、その時刻は含まない）。start > end の場合は日をまたぐ範囲として扱う。 */
  end: TimeOfDay;
}

export interface NotificationPreferences {
  digestFrequency: DigestFrequency;
  quietHours: QuietHours;
}

/** フォーム初期表示・localStorageに保存済みの値が無い/壊れている場合に使う既定値。 */
export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  digestFrequency: "weekly",
  quietHours: {
    enabled: false,
    start: "22:00",
    end: "07:00",
  },
};

const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** "HH:mm" 形式（00:00〜23:59）として妥当な時刻文字列かどうかを判定する。 */
export function isValidTimeString(value: string): boolean {
  return typeof value === "string" && TIME_PATTERN.test(value);
}

/** "HH:mm" を 0時からの経過分（0〜1439）に変換する。呼び出し前に isValidTimeString で検証すること。 */
function timeToMinutes(value: TimeOfDay): number {
  const match = TIME_PATTERN.exec(value);
  if (!match) {
    throw new Error(`invalid time string (expected HH:mm): ${value}`);
  }
  return Number(match[1]) * 60 + Number(match[2]);
}

export interface PreferencesValidationResult {
  valid: boolean;
  /** 検証エラーの一覧（人間可読な英語メッセージ。フォーム側で日本語表示に変換する）。valid=trueの場合は空配列。 */
  errors: string[];
}

/**
 * 通知設定オブジェクトの妥当性を検証する。例外は投げず、エラーの一覧を返す
 * （フォーム入力途中の不完全な値をそのまま渡して、フィールドごとのエラー表示に使うことを想定）。
 */
export function validateNotificationPreferences(preferences: NotificationPreferences): PreferencesValidationResult {
  const errors: string[] = [];

  if (!DIGEST_FREQUENCIES.includes(preferences.digestFrequency)) {
    errors.push(
      `digestFrequency must be one of ${DIGEST_FREQUENCIES.join(", ")}, got: ${String(preferences.digestFrequency)}`
    );
  }

  if (!isValidTimeString(preferences.quietHours?.start)) {
    errors.push(`quietHours.start must be a valid "HH:mm" time string, got: ${String(preferences.quietHours?.start)}`);
  }
  if (!isValidTimeString(preferences.quietHours?.end)) {
    errors.push(`quietHours.end must be a valid "HH:mm" time string, got: ${String(preferences.quietHours?.end)}`);
  }

  return { valid: errors.length === 0, errors };
}

/**
 * 静音時間帯（start〜end）に指定時刻が含まれるかを判定する。
 *
 * エッジケースの扱い:
 * - start < end（例: 09:00-17:00）: 同日内で完結する範囲として [start, end) を判定する。
 * - start > end（例: 22:00-07:00）: 日をまたぐオーバーナイト範囲として扱い、
 *   [start, 24:00) ∪ [00:00, end) のいずれかに入れば静音時間帯内とみなす。
 * - start === end: 「開始と終了が同時刻」は「静音時間帯の幅がゼロ」と「24時間まるごと静音」の
 *   どちらの意図か文字列だけでは一意に決まらないが、本モジュールでは【常に静音（終日）】として扱う。
 *   理由: quietHours.enabled を true にした上でstart=endを設定するのは、「一日中通知を止めたい」を
 *   ユーザーが（意図せず、あるいは意図して）表現した結果である可能性が高く、UI上も「静音時間帯としては
 *   機能しない（何も抑制されない）」という結果よりは「常に静音」の方が非直感的な通知漏れを防げる。
 *   逆に「一切静音にしたくない」場合は quietHours.enabled を false にするのが自然な操作なので、
 *   この解釈によって「絶対に静音にできなくなる」ケースは生じない。
 */
export function isWithinQuietHours(quietHours: Pick<QuietHours, "start" | "end">, timeOfDay: TimeOfDay): boolean {
  const start = timeToMinutes(quietHours.start);
  const end = timeToMinutes(quietHours.end);
  const now = timeToMinutes(timeOfDay);

  if (start === end) return true; // 上記コメントの通り「常に静音」として扱う

  if (start < end) {
    return now >= start && now < end;
  }

  // オーバーナイト（日をまたぐ）ラップアラウンド計算
  return now >= start || now < end;
}

export interface SuppressionCheckInput {
  preferences: NotificationPreferences;
  /** 判定基準の「今」。このモジュールはDate.now()を呼ばないため、呼び出し側が明示的に渡す。 */
  timestamp: Date;
  /**
   * 通知の緊急度。filing/deadlineReminders.ts の ReminderStatus をそのまま利用する。
   * "overdue"（期限超過）のリマインダーだけは、静音時間帯中でも抑制しない
   * （見逃した場合の実害が大きい「緊急」な通知のため）。省略時は「緊急ではない」として扱う。
   */
  urgency?: ReminderStatus;
}

/**
 * 現在のタイムスタンプ・設定から見て、通知（週次ダイジェストの配信や申告期限リマインダー等）を
 * 抑制すべきかどうかを判定する。抑制する場合は「今は送らない」だけであり、恒久的な非表示ではない
 * （呼び出し側で後で再送・繰り延べするかは呼び出し側の責務）。
 */
export function shouldSuppressNotification(input: SuppressionCheckInput): boolean {
  const { preferences, timestamp, urgency } = input;

  if (urgency === "overdue") return false; // 期限超過は静音時間帯でも通知する

  if (!preferences.quietHours.enabled) return false;

  const validation = validateNotificationPreferences(preferences);
  if (!validation.valid) return false; // 壊れた設定値では抑制しない（通知を取りこぼさない方に倒す）

  const hh = String(timestamp.getHours()).padStart(2, "0");
  const mm = String(timestamp.getMinutes()).padStart(2, "0");
  return isWithinQuietHours(preferences.quietHours, `${hh}:${mm}`);
}

// ---- localStorage 永続化 ----
//
// ReceiptUpload.tsxのカメラ対応判定やpwa/installPrompt.tsと同様、ブラウザAPI（localStorage）への
// 直接依存はここでは持たず、get/setItemだけを要求する最小インターフェースを受け取る設計にすることで、
// このモジュール自体はテストでは単純なオブジェクトのモックを渡すだけで検証できる
// （実際のwindow.localStorageへのアクセスはコンポーネント側でSSRガードした上で行う）。

export const NOTIFICATION_PREFERENCES_STORAGE_KEY = "jarvis:notification-preferences";

export interface NotificationPreferencesStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/**
 * 保存済みの通知設定を読み込む。未保存・JSONとして壊れている・妥当性検証に失敗した場合は
 * すべて既定値（DEFAULT_NOTIFICATION_PREFERENCES）にフォールバックする（例外は投げない）。
 */
export function loadNotificationPreferences(
  storage: NotificationPreferencesStorage | null | undefined
): NotificationPreferences {
  if (!storage) return DEFAULT_NOTIFICATION_PREFERENCES;

  try {
    const raw = storage.getItem(NOTIFICATION_PREFERENCES_STORAGE_KEY);
    if (!raw) return DEFAULT_NOTIFICATION_PREFERENCES;

    const parsed = JSON.parse(raw) as NotificationPreferences;
    const validation = validateNotificationPreferences(parsed);
    if (!validation.valid) return DEFAULT_NOTIFICATION_PREFERENCES;

    return parsed;
  } catch {
    return DEFAULT_NOTIFICATION_PREFERENCES;
  }
}

/**
 * 通知設定をlocalStorageへ保存する。保存前に妥当性検証を行い、不正な値は保存しない
 * （呼び出し側でフォームエラーとして表示することを想定し、ここでは例外を投げず何もしない）。
 * storageへの書き込みが失敗（プライベートブラウジング等）した場合も例外は投げない。
 */
export function saveNotificationPreferences(
  storage: NotificationPreferencesStorage | null | undefined,
  preferences: NotificationPreferences
): void {
  if (!storage) return;
  if (!validateNotificationPreferences(preferences).valid) return;

  try {
    storage.setItem(NOTIFICATION_PREFERENCES_STORAGE_KEY, JSON.stringify(preferences));
  } catch {
    // プライベートブラウジング等でstorageが使えない場合は無視する
  }
}
