// ------------------------------------------------------------------
// 顧問税理士への閲覧共有（招待・read-onlyアクセス）ロジック。
//
// background: 既に自分自身の顧問税理士・会計事務所と契約しているユーザーが、
// その顧問税理士に対して本サービス内の記帳データを「read-only」で閲覧してもらうための
// アクセス権（advisor access grant）を発行・管理する。
// docs/business-plan.md §12「オーナー修吾からのリクエスト」→「税理士への連携（追加課金）」に
// 対応するPhase 4機能で、追加課金のアドオンという位置付け。
//
// 注意: これは team/teamMembers.ts（同一テナント内で記帳作業を分担する「内部」チームメンバー・
// ロール管理）とも、advisorReferral/referralForm.ts（新規ユーザーを提携税理士に送客する
// リード獲得フォーム）とも別物。本モジュールは「ユーザーが既に持っている顧問税理士」に
// 対して、自分のデータを外部から read-only で見せるためのアクセス権モデルである。
//
// teamMembers.ts / auth/passwordReset.ts と同じ方針で、乱数・crypto・外部通信・DB永続化は
// 行わない純粋関数のみで構成する。招待トークンの既定生成には passwordReset.ts と同様
// `globalThis.crypto.randomUUID` を使うが、呼び出し側（テスト含む）は `token` / `id` を
// 明示的に渡すことで、乱数に依存せず決定論的に呼び出せる（副作用のない設計）。
// 時刻も同様に `now` / `asOf` 引数で注入可能にし、テスト容易性を確保する。
// ------------------------------------------------------------------

import type { SubscriptionStatus } from "../billing/subscriptionBilling";

/**
 * 顧問税理士と共有するデータ範囲。あえて小さな固定セットに限定する
 * （範囲を無制限に広げると「read-onlyアクセス」の意味が薄れるため）。
 */
export type AdvisorAccessScope = "transactions" | "filingDrafts" | "invoices";

export const ADVISOR_ACCESS_SCOPES: AdvisorAccessScope[] = ["transactions", "filingDrafts", "invoices"];

/** 表示用ラベル（UI側での日本語表示に使用）。文言はここを唯一の出典とする。 */
export const ADVISOR_ACCESS_SCOPE_LABELS: Record<AdvisorAccessScope, string> = {
  transactions: "仕訳・記帳データ",
  filingDrafts: "申告書下書き",
  invoices: "請求書",
};

/** 招待の状態: pending（招待済・未承諾）→ active（閲覧可能）→ revoked（アクセス取り消し済み） */
export type AdvisorAccessGrantStatus = "pending" | "active" | "revoked";

export const ADVISOR_ACCESS_STATUS_LABELS: Record<AdvisorAccessGrantStatus, string> = {
  pending: "招待中",
  active: "共有中",
  revoked: "取り消し済み",
};

/** 顧問税理士への閲覧共有に関する不正な操作（不正な状態遷移・不正な入力など）を表すエラー。 */
export class AdvisorAccessError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AdvisorAccessError";
  }
}

/** 不正な状態遷移（例: revoked済みのグラントを再度 revoke しようとした場合など）を表すエラー。 */
export class InvalidAdvisorAccessTransitionError extends AdvisorAccessError {
  constructor(message: string) {
    super(message);
    this.name = "InvalidAdvisorAccessTransitionError";
  }
}

/** 顧問税理士アクセス権（グラント）のレコード。 */
export interface AdvisorAccessGrant {
  id: string;
  tenantId: string;
  advisorName: string;
  advisorEmail: string;
  /** 共有するデータ範囲（1つ以上）。 */
  scopes: AdvisorAccessScope[];
  status: AdvisorAccessGrantStatus;
  /** 招待用トークン（マジックリンク等で顧問税理士に共有する想定）。 */
  inviteToken: string;
  createdAt: string; // ISO 8601
  /** pending → active に遷移したタイミング。 */
  activatedAt?: string; // ISO 8601
  /** アクセスを取り消したタイミング。 */
  revokedAt?: string; // ISO 8601
  /**
   * アクセスの自動失効日時（任意）。申告シーズンのみ等、期間限定でアクセスを許可したい場合に使う。
   * 未設定の場合は明示的に revoke するまで無期限。
   */
  expiresAt?: string; // ISO 8601
}

// --------------------------------------------------------------
// バリデーション
// --------------------------------------------------------------

// team/teamMembers.ts と同じ、実用的な「local@domain.tld」形式のみを許容するメールアドレス判定。
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** メールアドレスの形式が妥当かどうかを判定する（前後の空白は無視する）。 */
export function isValidAdvisorEmail(email: string): boolean {
  return EMAIL_PATTERN.test(email.trim());
}

function isKnownScope(scope: string): scope is AdvisorAccessScope {
  return (ADVISOR_ACCESS_SCOPES as string[]).includes(scope);
}

// --------------------------------------------------------------
// トークン生成
// --------------------------------------------------------------

/**
 * Web Crypto（`globalThis.crypto.randomUUID`）を使ってランダムな招待トークンを生成する。
 * auth/passwordReset.ts の generateResetToken と同じ方針。
 * `createAdvisorAccessInvite` の呼び出し側（テスト等）は `token` を明示的に渡すことで、
 * この関数を経由せず決定論的な値を使うことができる。
 */
function generateInviteToken(): string {
  const randomUUID = globalThis.crypto?.randomUUID;
  if (typeof randomUUID !== "function") {
    throw new AdvisorAccessError("generateInviteToken: crypto.randomUUID is not available in this environment");
  }
  return randomUUID.call(globalThis.crypto).replace(/-/g, "");
}

// --------------------------------------------------------------
// 招待（作成）
// --------------------------------------------------------------

export interface CreateAdvisorAccessInviteParams {
  tenantId: string;
  advisorName: string;
  advisorEmail: string;
  /** 共有するデータ範囲。省略時は全範囲（ADVISOR_ACCESS_SCOPES）を共有する。 */
  scopes?: AdvisorAccessScope[];
  /**
   * アクセスの自動失効日数（作成時点からのN日後）。省略時は無期限（明示的にrevokeするまで有効）。
   * 「確定申告シーズンのみ」のような期間限定アクセスに使う。
   */
  expiresInDays?: number;
  /** テスト等でIDを固定したい場合に指定。省略時は入力値・時刻から決定論的に生成する。 */
  id?: string;
  /** テスト等でトークンを固定したい場合に指定。省略時はランダム生成（generateInviteToken）。 */
  token?: string;
  /** テスト等で時刻を固定したい場合に指定。省略時は `new Date()`。 */
  now?: Date;
}

/**
 * 顧問税理士を read-only アクセスに招待する（状態は必ず "pending" から始まる）。
 *
 * - メールアドレスの形式が不正な場合はエラーを投げる。
 * - advisorName が空の場合はエラーを投げる。
 * - scopes を指定する場合は1つ以上、かつ ADVISOR_ACCESS_SCOPES に含まれる値のみ許容する。
 * - 同一テナント内に既に同じメールアドレスの、pending/active いずれかのグラントが
 *   存在する場合は重複招待としてエラーを投げる（大文字・小文字は区別しない）。
 *   revoked済みのグラントに対しては再招待を許可する。
 *
 * 呼び出し側は返り値の AdvisorAccessGrant を既存のグラント一覧に追加すること
 * （このファイルはstateを持たない純粋な関数群のため）。
 */
export function createAdvisorAccessInvite(
  grants: AdvisorAccessGrant[],
  params: CreateAdvisorAccessInviteParams,
): AdvisorAccessGrant {
  const { scopes = ADVISOR_ACCESS_SCOPES, expiresInDays, now = new Date() } = params;
  const tenantId = params.tenantId.trim();
  const advisorName = params.advisorName.trim();
  const advisorEmail = params.advisorEmail.trim();

  if (tenantId.length === 0) {
    throw new AdvisorAccessError("createAdvisorAccessInvite: tenantId must not be empty");
  }
  if (advisorName.length === 0) {
    throw new AdvisorAccessError("createAdvisorAccessInvite: advisorName must not be empty");
  }
  if (!isValidAdvisorEmail(advisorEmail)) {
    throw new AdvisorAccessError(
      `createAdvisorAccessInvite: "${params.advisorEmail}" is not a valid email address`,
    );
  }
  if (scopes.length === 0) {
    throw new AdvisorAccessError("createAdvisorAccessInvite: scopes must include at least one item");
  }
  const unknownScope = scopes.find((scope) => !isKnownScope(scope));
  if (unknownScope) {
    throw new AdvisorAccessError(`createAdvisorAccessInvite: unknown scope "${unknownScope}"`);
  }
  if (expiresInDays !== undefined && !(expiresInDays > 0)) {
    throw new AdvisorAccessError("createAdvisorAccessInvite: expiresInDays must be a positive number when provided");
  }

  const normalizedEmail = advisorEmail.toLowerCase();
  const isDuplicate = grants.some(
    (grant) =>
      grant.tenantId === tenantId &&
      grant.advisorEmail.toLowerCase() === normalizedEmail &&
      grant.status !== "revoked",
  );
  if (isDuplicate) {
    throw new AdvisorAccessError(
      `createAdvisorAccessInvite: ${advisorEmail} already has a pending or active advisor access grant for this tenant`,
    );
  }

  const id = params.id ?? `advisor-access-${tenantId}-${normalizedEmail}-${now.getTime().toString(36)}`;
  const token = params.token ?? generateInviteToken();
  const expiresAt =
    expiresInDays !== undefined ? new Date(now.getTime() + expiresInDays * 24 * 60 * 60 * 1000).toISOString() : undefined;

  return {
    id,
    tenantId,
    advisorName,
    advisorEmail,
    scopes: [...scopes],
    status: "pending",
    inviteToken: token,
    createdAt: now.toISOString(),
    ...(expiresAt ? { expiresAt } : {}),
  };
}

// --------------------------------------------------------------
// 状態遷移（招待の承諾・取り消し）
// --------------------------------------------------------------

/**
 * 顧問税理士が招待を承諾した（例: 招待リンクを踏んだ）ときに呼ぶ状態遷移。
 * "pending" からのみ許可する。対象が見つからない場合・既に pending でない場合はエラーを投げる。
 */
export function activateAdvisorAccessGrant(
  grants: AdvisorAccessGrant[],
  grantId: string,
  now: Date = new Date(),
): AdvisorAccessGrant[] {
  const target = findGrantOrThrow(grants, grantId, "activateAdvisorAccessGrant");

  if (target.status !== "pending") {
    throw new InvalidAdvisorAccessTransitionError(
      `activateAdvisorAccessGrant: cannot move grant ${grantId} from "${target.status}" to "active" (must be "pending")`,
    );
  }

  return grants.map((grant) =>
    grant.id === grantId ? { ...grant, status: "active", activatedAt: now.toISOString() } : grant,
  );
}

/**
 * 顧問税理士へのアクセス権を取り消す。pending / active のいずれからも取り消せる。
 * 既に revoked のグラントを再度 revoke しようとした場合はエラーを投げる。
 */
export function revokeAdvisorAccessGrant(
  grants: AdvisorAccessGrant[],
  grantId: string,
  now: Date = new Date(),
): AdvisorAccessGrant[] {
  const target = findGrantOrThrow(grants, grantId, "revokeAdvisorAccessGrant");

  if (target.status === "revoked") {
    throw new InvalidAdvisorAccessTransitionError(
      `revokeAdvisorAccessGrant: grant ${grantId} is already revoked`,
    );
  }

  return grants.map((grant) =>
    grant.id === grantId ? { ...grant, status: "revoked", revokedAt: now.toISOString() } : grant,
  );
}

function findGrantOrThrow(grants: AdvisorAccessGrant[], grantId: string, callerName: string): AdvisorAccessGrant {
  const target = grants.find((grant) => grant.id === grantId);
  if (!target) {
    throw new AdvisorAccessError(`${callerName}: advisor access grant not found: ${grantId}`);
  }
  return target;
}

// --------------------------------------------------------------
// 一覧・有効性チェック
// --------------------------------------------------------------

/** 指定テナントのグラントを、指定ステータスで絞り込む。 */
export function listAdvisorAccessGrantsByStatus(
  grants: AdvisorAccessGrant[],
  tenantId: string,
  status: AdvisorAccessGrantStatus,
): AdvisorAccessGrant[] {
  return grants.filter((grant) => grant.tenantId === tenantId && grant.status === status);
}

/** グラントの有効期限（expiresAt）が、指定時刻時点で過ぎているかどうかを判定する。期限なしの場合は常に false。 */
export function isAdvisorAccessGrantExpired(grant: AdvisorAccessGrant, asOf: Date = new Date()): boolean {
  if (!grant.expiresAt) return false;
  return asOf.getTime() > new Date(grant.expiresAt).getTime();
}

/**
 * グラントが指定時刻時点で「現在有効（顧問税理士が実際にデータを閲覧できる）」かどうかを判定する。
 * - status が "active" であること
 * - かつ、期限（expiresAt）が設定されている場合はまだ期限内であること
 * の両方を満たす場合のみ true。pending（未承諾）・revoked（取り消し済み）・期限切れは false。
 */
export function isAdvisorAccessGrantValid(grant: AdvisorAccessGrant, asOf: Date = new Date()): boolean {
  return grant.status === "active" && !isAdvisorAccessGrantExpired(grant, asOf);
}

// --------------------------------------------------------------
// 課金プランとの連携（有償アドオン適格性チェック）
// --------------------------------------------------------------
//
// 前提（documented assumption）: 「顧問税理士への連携（追加課金）」は
// docs/business-plan.md §12 に基づく将来の有償アドオンであり、
// src/lib/pricing/plans.ts の PricingPlan には現時点でこのアドオンの有無を表す
// フィールドが存在しない。そのため、アドオンの契約有無そのもの
// （`planIncludesAdvisorAccess`）は呼び出し側（将来のエンタイトルメント解決層）が
// 判定済みの boolean として渡す前提とし、このモジュールでは
// billing/subscriptionBilling.ts の SubscriptionStatus 型を読み取り専用で利用して
// 「サブスクリプション自体が有効な状態か」を合わせてチェックするだけに留める
// （過剰に作り込まない）。

export interface AdvisorAccessEligibilityParams {
  /** テナントの現在のサブスクリプション状態（billing/subscriptionBilling.ts の SubscriptionStatus）。 */
  subscriptionStatus: SubscriptionStatus;
  /**
   * 契約中のプラン・アドオンに「顧問税理士への閲覧共有」が含まれるかどうか。
   * pricing/plans.ts はこのアドオンをまだモデル化していないため、
   * 呼び出し側でエンタイトルメントを解決した結果をそのまま渡してもらう。
   */
  planIncludesAdvisorAccess: boolean;
}

/**
 * 顧問税理士への read-only アクセス共有機能を、今このテナントが使える状態かどうかを判定する。
 * - サブスクリプションが支払い遅延（past_due）・解約済み（canceled）の場合は不可
 * - プラン・アドオンに含まれていない場合は不可
 * の両方を満たさない限り true にはならない。
 */
export function isAdvisorAccessEligible(params: AdvisorAccessEligibilityParams): boolean {
  const { subscriptionStatus, planIncludesAdvisorAccess } = params;
  const subscriptionInGoodStanding = subscriptionStatus === "active" || subscriptionStatus === "trialing";
  return subscriptionInGoodStanding && planIncludesAdvisorAccess;
}
