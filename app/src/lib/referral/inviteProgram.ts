// ------------------------------------------------------------------
// 友達紹介（バイラル招待）プログラムのロジック。
//
// business-plan.md 12章「オーナーからのリクエスト」の
// 「超低コスト、また爆発的に拡散するようなユーザー間のインタラクションで
// ネットワーク効果を作る設計」に対応する MVP 機能。
//
// 注意: これは既存の advisorReferral（提携税理士への送客）とは全く別物。
// こちらは既存ユーザーが友達を「本サービスの新規ユーザーとして」招待する
// バイラル成長ループであり、税務相談・税理士業務とは無関係。
//
// このファイルは純粋な関数のみで構成する（乱数・crypto・外部通信は使わない）。
// 実際の課金・DB永続化・メール送信は行わず、UI/ロジックのみの MVP。
// ------------------------------------------------------------------

/** 招待の状態遷移: pending（招待済・未参加）→ joined（友達が登録済）→ rewarded（特典付与済） */
export type InviteStatus = "pending" | "joined" | "rewarded";

/**
 * 特典の種類。MVPでは実際の請求・課金連携は行わず、
 * 「1ヶ月無料」権利をデータ上のフラグとして表現するだけに留める。
 */
export interface ReferralReward {
  type: "free_month";
  /** 特典の付与対象（紹介した本人 or 招待された友達） */
  grantedTo: "referrer" | "referee";
}

export interface InviteRecord {
  id: string;
  /** 紹介者（招待した既存ユーザー）の紹介コード */
  referralCode: string;
  /** 紹介者（招待した既存ユーザー）のユーザーID */
  referrerUserId: string;
  /** 招待された友達の連絡先（メールアドレスや表示名など、入力されたまま保持） */
  inviteeContact: string;
  status: InviteStatus;
  createdAt: string; // ISO 8601
  joinedAt?: string; // ISO 8601（status が joined 以降になったタイミング）
  rewardedAt?: string; // ISO 8601（status が rewarded になったタイミング）
  rewards: ReferralReward[];
}

/**
 * 不正な状態遷移（例: pending から直接 rewarded にしようとした場合など）を表すエラー。
 */
export class InvalidInviteTransitionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidInviteTransitionError";
  }
}

// --------------------------------------------------------------
// 紹介コード生成
// --------------------------------------------------------------

/** 紹介コードの長さ */
const REFERRAL_CODE_LENGTH = 8;

// 0/O、1/I など見間違えやすい文字を除いた英数字（共有・手入力してもらうことを想定）
const REFERRAL_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/**
 * FNV-1a（32bit）ハッシュ。暗号学的ハッシュではないが、
 * 同じ入力からは常に同じ出力になる決定論的な関数であり、
 * 乱数生成やネットワーク通信を一切使わずにコードを導出できる。
 */
function fnv1aHash(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/**
 * ユーザーIDから、短く共有しやすい紹介コードを決定論的に生成する。
 *
 * - 同じ userId からは常に同じコードが生成される（DB保存や乱数採番が不要）。
 * - 暗号学的な一意性・秘匿性は保証しない（あくまで共有用の短縮コード）。
 * - 外部通信・乱数は一切使用しないピュア関数。
 */
export function generateReferralCode(userId: string): string {
  const trimmed = userId.trim();
  if (trimmed.length === 0) {
    throw new Error("generateReferralCode: userId must not be empty");
  }

  let state = fnv1aHash(trimmed);
  const chars: string[] = [];
  for (let i = 0; i < REFERRAL_CODE_LENGTH; i++) {
    chars.push(REFERRAL_CODE_ALPHABET[state % REFERRAL_CODE_ALPHABET.length]);
    // xorshift 風の追加撹拌で次の桁用に値を変化させる（決定論的・乱数不使用）
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
  }
  return chars.join("");
}

/**
 * 紹介コードから共有用URL（相対パス）を組み立てる。
 * `origin` を渡すと絶対URLになる（例: クライアント側で `window.location.origin` を渡す）。
 */
export function buildReferralShareUrl(referralCode: string, origin?: string): string {
  const path = `/invite?ref=${encodeURIComponent(referralCode)}`;
  return origin ? `${origin.replace(/\/$/, "")}${path}` : path;
}

// --------------------------------------------------------------
// 招待レコードの作成・状態遷移
// --------------------------------------------------------------

export interface CreateInviteRecordParams {
  referrerUserId: string;
  inviteeContact: string;
  /** テスト等でIDを固定したい場合に指定。省略時は入力値から決定論的に生成する。 */
  id?: string;
  /** テスト等で時刻を固定したい場合に指定。省略時は `new Date()`。 */
  now?: Date;
}

/**
 * 新規の招待レコードを作成する（状態は必ず "pending" から始まる）。
 */
export function createInviteRecord(params: CreateInviteRecordParams): InviteRecord {
  const { referrerUserId, inviteeContact, now = new Date() } = params;
  const trimmedReferrer = referrerUserId.trim();
  const trimmedInvitee = inviteeContact.trim();

  if (trimmedReferrer.length === 0) {
    throw new Error("createInviteRecord: referrerUserId must not be empty");
  }
  if (trimmedInvitee.length === 0) {
    throw new Error("createInviteRecord: inviteeContact must not be empty");
  }

  const referralCode = generateReferralCode(trimmedReferrer);
  const id = params.id ?? `${referralCode}-${fnv1aHash(trimmedInvitee).toString(36)}-${now.getTime().toString(36)}`;

  return {
    id,
    referralCode,
    referrerUserId: trimmedReferrer,
    inviteeContact: trimmedInvitee,
    status: "pending",
    createdAt: now.toISOString(),
    rewards: [],
  };
}

/**
 * 招待された友達が実際にサービスへ登録したときに呼ぶ状態遷移。
 * "pending" からのみ許可（"joined"/"rewarded" から再度呼ぶのは不正な遷移としてエラー）。
 */
export function markInviteJoined(invite: InviteRecord, now: Date = new Date()): InviteRecord {
  if (invite.status !== "pending") {
    throw new InvalidInviteTransitionError(
      `markInviteJoined: cannot move invite ${invite.id} from "${invite.status}" to "joined" (must be "pending")`,
    );
  }
  return { ...invite, status: "joined", joinedAt: now.toISOString() };
}

// --------------------------------------------------------------
// 特典（リワード）判定
// --------------------------------------------------------------

/**
 * 特典付与の条件となる「クオリファイング・アクション」。
 *
 * MVPでの定義（シンプルさ優先、1つだけに絞る）:
 * 「招待された友達（referee）が、自分のアカウントで初めてのCSVインポート
 *  （明細取り込み。app/src/lib/csv 相当の機能）を完了すること」
 *
 * これを紹介プログラムの唯一の適格条件とする。理由:
 * - 本サービスの中核体験（記帳の自動化）に実際に触れて初めて「使われた」と言えるため、
 *   単なるアカウント登録だけでは特典を出さない（インセンティブ目当ての空登録を防ぐ）。
 * - 判定に必要な入力が1つのbooleanで済み、実装・テストが容易（MVPの検証速度を優先）。
 */
export interface QualifyingActionEvent {
  /** 招待された本人（referee）が初めてのCSVインポートを完了したかどうか */
  refereeCompletedFirstCsvImport: boolean;
}

/**
 * 招待レコードとクオリファイング・アクションの発生状況から、
 * 特典を付与してよいかどうかを判定する（副作用なしの純粋な判定関数）。
 *
 * 条件: 友達がすでに参加済み（"joined"）であり、かつ初回CSVインポートを完了していること。
 */
export function isRewardEligible(invite: InviteRecord, event: QualifyingActionEvent): boolean {
  return invite.status === "joined" && event.refereeCompletedFirstCsvImport === true;
}

/**
 * 特典を付与し、招待レコードを "rewarded" に遷移させる。
 * 紹介者・被紹介者の双方に「1ヶ月無料」特典を付与する（双方向インセンティブでバイラル性を高める設計）。
 *
 * `isRewardEligible` が false の場合は不正な遷移としてエラーを投げる。
 */
export function markInviteRewarded(invite: InviteRecord, event: QualifyingActionEvent, now: Date = new Date()): InviteRecord {
  if (!isRewardEligible(invite, event)) {
    throw new InvalidInviteTransitionError(
      `markInviteRewarded: invite ${invite.id} is not eligible for a reward (status="${invite.status}", refereeCompletedFirstCsvImport=${event.refereeCompletedFirstCsvImport})`,
    );
  }

  const rewards: ReferralReward[] = [
    { type: "free_month", grantedTo: "referrer" },
    { type: "free_month", grantedTo: "referee" },
  ];

  return {
    ...invite,
    status: "rewarded",
    rewardedAt: now.toISOString(),
    rewards,
  };
}

/**
 * `markInviteRewarded` の非throw版。適格でなければ何もせず元のレコードをそのまま返す。
 * UI側でユーザー操作のたびに毎回呼び出しても安全なように用意した補助関数。
 */
export function tryMarkInviteRewarded(invite: InviteRecord, event: QualifyingActionEvent, now: Date = new Date()): InviteRecord {
  return isRewardEligible(invite, event) ? markInviteRewarded(invite, event, now) : invite;
}

// --------------------------------------------------------------
// 集計（招待一覧カードの表示用）
// --------------------------------------------------------------

export interface InviteSummary {
  total: number;
  pending: number;
  joined: number;
  rewarded: number;
  /** rewarded な招待から、紹介者（自分）に付与された「1ヶ月無料」特典の件数 */
  freeMonthsEarned: number;
}

/**
 * 招待一覧から件数のサマリーを算出する（表示用の集計、副作用なし）。
 */
export function summarizeInvites(invites: InviteRecord[]): InviteSummary {
  const summary: InviteSummary = { total: invites.length, pending: 0, joined: 0, rewarded: 0, freeMonthsEarned: 0 };
  for (const invite of invites) {
    summary[invite.status] += 1;
    summary.freeMonthsEarned += invite.rewards.filter((r) => r.grantedTo === "referrer" && r.type === "free_month").length;
  }
  return summary;
}
