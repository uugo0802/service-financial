// ------------------------------------------------------------------
// テナント内チームメンバー（オーナー・編集者・閲覧者）管理ロジック。
//
// background: マイクロ法人・個人事業主のセグメントでは、オーナー本人に加えて
// 家族やパートタイムの記帳担当者がデータ入力を行うケースが多い。
// 現状、テナントに2人目以降のユーザーを招待して日々の記帳作業を分担する手段がない。
//
// 注意: これは既存の招待・紹介プログラム（referral/inviteProgram.ts,
// advisorReferral, partnerReferral）とは全く別物。あちらは新規ユーザー獲得・
// 提携税理士への送客を目的とした「対外的な」招待（バイラル成長ループ）であり、
// こちらは既にテナント契約済みの1事業者内で「日々の記帳作業を分担する」ための
// 内部チームメンバー・ロール管理である。
//
// このファイルは純粋な関数のみで構成する（乱数・crypto・外部通信は使わない）。
// 実際のDB永続化・招待メール送信は行わない。inviteProgram.ts と同様、
// メンバー一覧（配列）は呼び出し側（UI）がstateとして保持し、
// このファイルの各関数はその配列を受け取って新しい配列・レコードを返すだけの設計とする。
// ------------------------------------------------------------------

/** チームメンバーのロール。権限は owner > editor > viewer の順に強い。 */
export type TeamRole = "owner" | "editor" | "viewer";

/** 招待の状態: pending（招待済・未参加）→ active（参加済み） */
export type TeamMemberStatus = "pending" | "active";

export interface TeamMember {
  id: string;
  tenantId: string;
  email: string;
  role: TeamRole;
  status: TeamMemberStatus;
  invitedAt: string; // ISO 8601
  joinedAt?: string; // ISO 8601（statusが active になったタイミング）
}

/** チームメンバー管理に関する不正な操作（重複招待・不正な状態遷移など）を表すエラー。 */
export class TeamMemberError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TeamMemberError";
  }
}

/**
 * テナントに残る唯一のオーナーを降格・削除しようとした場合のエラー。
 * テナントには常に最低1名のオーナーが存在しなければならない、というルールを表す。
 */
export class LastOwnerError extends TeamMemberError {
  constructor(message: string) {
    super(message);
    this.name = "LastOwnerError";
  }
}

/** 不正な状態遷移（例: pending でないメンバーを再度 accept しようとした場合など）を表すエラー。 */
export class InvalidTeamMemberTransitionError extends TeamMemberError {
  constructor(message: string) {
    super(message);
    this.name = "InvalidTeamMemberTransitionError";
  }
}

// --------------------------------------------------------------
// バリデーション
// --------------------------------------------------------------

// シンプルな「local@domain.tld」形式のみを許容する実用的なメールアドレス判定。
// 完全なRFC準拠のパーサーは意図的に使わない（招待フォームの入力チェック用途で十分なため）。
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** メールアドレスの形式が妥当かどうかを判定する（前後の空白は無視する）。 */
export function isValidEmail(email: string): boolean {
  return EMAIL_PATTERN.test(email.trim());
}

// --------------------------------------------------------------
// 招待（作成）
// --------------------------------------------------------------

export interface InviteTeamMemberParams {
  tenantId: string;
  email: string;
  role: TeamRole;
  /** テスト等でIDを固定したい場合に指定。省略時は入力値・時刻から決定論的に生成する。 */
  id?: string;
  /** テスト等で時刻を固定したい場合に指定。省略時は `new Date()`。 */
  now?: Date;
}

/**
 * 指定メールアドレスをチームメンバーとして招待する（状態は必ず "pending" から始まる）。
 *
 * - メールアドレスの形式が不正な場合はエラーを投げる。
 * - 同一テナント内に既に同じメールアドレスのメンバー（pending/active問わず）が
 *   存在する場合は重複招待としてエラーを投げる（大文字・小文字は区別しない）。
 *
 * 呼び出し側は返り値の TeamMember を既存のメンバー一覧に追加すること
 * （このファイルはstateを持たない純粋な関数群のため）。
 */
export function inviteTeamMember(members: TeamMember[], params: InviteTeamMemberParams): TeamMember {
  const { role, now = new Date() } = params;
  const tenantId = params.tenantId.trim();
  const email = params.email.trim();

  if (tenantId.length === 0) {
    throw new Error("inviteTeamMember: tenantId must not be empty");
  }
  if (!isValidEmail(email)) {
    throw new Error(`inviteTeamMember: "${params.email}" is not a valid email address`);
  }

  const normalizedEmail = email.toLowerCase();
  const isDuplicate = members.some(
    (member) => member.tenantId === tenantId && member.email.toLowerCase() === normalizedEmail,
  );
  if (isDuplicate) {
    throw new TeamMemberError(`inviteTeamMember: ${email} has already been invited to this tenant`);
  }

  const id = params.id ?? `team-${tenantId}-${normalizedEmail}-${now.getTime().toString(36)}`;

  return {
    id,
    tenantId,
    email,
    role,
    status: "pending",
    invitedAt: now.toISOString(),
  };
}

// --------------------------------------------------------------
// 状態遷移（招待の承諾）
// --------------------------------------------------------------

/**
 * 招待されたメンバーが実際に参加した（例: マジックリンクを踏んでログインした）ときに呼ぶ状態遷移。
 * "pending" からのみ許可する。対象が見つからない場合・既に "active" の場合はエラーを投げる。
 */
export function acceptTeamMemberInvite(members: TeamMember[], memberId: string, now: Date = new Date()): TeamMember[] {
  const target = findMemberOrThrow(members, memberId, "acceptTeamMemberInvite");

  if (target.status !== "pending") {
    throw new InvalidTeamMemberTransitionError(
      `acceptTeamMemberInvite: cannot move member ${memberId} from "${target.status}" to "active" (must be "pending")`,
    );
  }

  return members.map((member) =>
    member.id === memberId ? { ...member, status: "active", joinedAt: now.toISOString() } : member,
  );
}

// --------------------------------------------------------------
// ロール変更・削除（「最後のオーナー」保護ルール付き）
// --------------------------------------------------------------

/**
 * 指定テナント内のオーナー数を数える（statusがpending/activeいずれのオーナーも含む）。
 * 招待中であっても「オーナー枠」として予約されているとみなし、
 * 最後の1人を誤って降格・削除できないようにするため。
 */
export function countOwners(members: TeamMember[], tenantId: string): number {
  return members.filter((member) => member.tenantId === tenantId && member.role === "owner").length;
}

/** 指定メンバーが、そのテナントに残る唯一のオーナーかどうかを判定する。 */
export function isLastOwner(members: TeamMember[], memberId: string): boolean {
  const target = members.find((member) => member.id === memberId);
  if (!target || target.role !== "owner") {
    return false;
  }
  return countOwners(members, target.tenantId) <= 1;
}

/**
 * メンバーのロールを変更する。
 * 対象がテナントに残る唯一のオーナーで、かつ owner 以外へ変更しようとした場合は
 * LastOwnerError を投げる（テナントには常に最低1名のオーナーが必要というルール）。
 */
export function changeTeamMemberRole(members: TeamMember[], memberId: string, newRole: TeamRole): TeamMember[] {
  const target = findMemberOrThrow(members, memberId, "changeTeamMemberRole");

  if (target.role === "owner" && newRole !== "owner" && countOwners(members, target.tenantId) <= 1) {
    throw new LastOwnerError(
      `changeTeamMemberRole: cannot change the role of ${target.email} — a tenant must always have at least one owner`,
    );
  }

  return members.map((member) => (member.id === memberId ? { ...member, role: newRole } : member));
}

/**
 * メンバーをチームから削除する。
 * 対象がテナントに残る唯一のオーナーの場合は LastOwnerError を投げる
 * （テナントには常に最低1名のオーナーが必要というルール）。
 */
export function removeTeamMember(members: TeamMember[], memberId: string): TeamMember[] {
  const target = findMemberOrThrow(members, memberId, "removeTeamMember");

  if (target.role === "owner" && countOwners(members, target.tenantId) <= 1) {
    throw new LastOwnerError(
      `removeTeamMember: cannot remove ${target.email} — a tenant must always have at least one owner`,
    );
  }

  return members.filter((member) => member.id !== memberId);
}

function findMemberOrThrow(members: TeamMember[], memberId: string, callerName: string): TeamMember {
  const target = members.find((member) => member.id === memberId);
  if (!target) {
    throw new Error(`${callerName}: member not found: ${memberId}`);
  }
  return target;
}

// --------------------------------------------------------------
// ロール・権限チェック
// --------------------------------------------------------------

/**
 * 記帳データの編集（取引の追加・編集・カテゴライズ等）を行えるかどうか。
 * owner・editor は編集可能、viewer は閲覧のみ。招待が pending のうちは不可。
 */
export function canEdit(member: TeamMember): boolean {
  return member.status === "active" && (member.role === "owner" || member.role === "editor");
}

/**
 * 記帳データを閲覧できるかどうか。active なメンバーであればロールを問わず閲覧可能。
 */
export function canView(member: TeamMember): boolean {
  return member.status === "active";
}

/**
 * チームメンバーの招待・ロール変更・削除など、チーム管理そのものを行えるかどうか。
 * owner のみに限定する。
 */
export function canManageTeam(member: TeamMember): boolean {
  return member.status === "active" && member.role === "owner";
}

// --------------------------------------------------------------
// 表示用ラベル（UI側での日本語表示に使用）
// --------------------------------------------------------------

export const TEAM_ROLE_LABELS: Record<TeamRole, string> = {
  owner: "オーナー",
  editor: "編集者",
  viewer: "閲覧者",
};

export const TEAM_MEMBER_STATUS_LABELS: Record<TeamMemberStatus, string> = {
  pending: "招待中",
  active: "参加済み",
};
