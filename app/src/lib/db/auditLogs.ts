import { getSupabaseClient, AuditLogRow } from "./supabaseClient";

// schema.sql の方針どおり、audit_logs へのINSERTはクライアントからは行わない
// （改ざん防止のためサーバー側のservice roleからのみ許可する運用）。
// ここではテナントメンバーに許可された読み取りのみを提供する。

/** テナントの監査ログを一覧取得する（作成日時降順）。 */
export async function listAuditLogs(tenantId: string): Promise<AuditLogRow[]> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("audit_logs")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`監査ログの取得に失敗しました: ${error.message}`);
  }
  return data ?? [];
}

// ------------------------------------------------------------------
// 以下は監査ログ閲覧UI（/audit-log）向けの純粋関数（DBアクセスなし）。
// listAuditLogs() で取得済みの配列を対象に、絞り込み・表示ラベル整形を行う。
// ------------------------------------------------------------------

/** 監査ログ一覧に対する絞り込み条件。日時は Date が解釈できる文字列（ISO日付/日時）を渡す。 */
export interface AuditLogFilter {
  entityType?: string;
  action?: string;
  from?: string;
  to?: string;
}

function toValidTime(value: string | undefined | null): number | undefined {
  if (!value) return undefined;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? undefined : time;
}

/** 対象種別・操作・期間（開始/終了とも境界値を含む）で監査ログ配列を絞り込む。 */
export function filterAuditLogs(logs: AuditLogRow[], filter: AuditLogFilter = {}): AuditLogRow[] {
  const fromTime = toValidTime(filter.from);
  const toTime = toValidTime(filter.to);

  return logs.filter((log) => {
    if (filter.entityType && log.entity_type !== filter.entityType) return false;
    if (filter.action && log.action !== filter.action) return false;

    if (fromTime !== undefined || toTime !== undefined) {
      const createdTime = toValidTime(log.created_at);
      if (createdTime === undefined) return false;
      if (fromTime !== undefined && createdTime < fromTime) return false;
      if (toTime !== undefined && createdTime > toTime) return false;
    }
    return true;
  });
}

/** ログ配列に登場する対象種別（entity_type）の一覧を重複なく昇順で返す（絞り込みUIの選択肢用）。 */
export function getDistinctEntityTypes(logs: AuditLogRow[]): string[] {
  return Array.from(new Set(logs.map((log) => log.entity_type))).sort();
}

// 年度確定・ロック機能（app/src/lib/journal/yearClose.ts）向けのaction/entity_typeコード。
// 監査ログのスキーマ自体は文字列なので新規追加は既存レコードに影響しない（追記のみ）。
export const FISCAL_YEAR_CLOSE_ACTION = "fiscalyear.close";
export const FISCAL_YEAR_REOPEN_ACTION = "fiscalyear.reopen";
export const FISCAL_YEAR_ENTITY_TYPE = "fiscal_year";

const ACTION_LABELS: Record<string, string> = {
  "transaction.create": "取引明細を作成",
  "transaction.edit": "仕訳を編集",
  "transaction.confirm": "仕訳を確定",
  "transaction.delete": "取引明細を削除",
  "document.upload": "証憑をアップロード",
  "document.delete": "証憑を削除",
  "account.create": "勘定科目を作成",
  "account.edit": "勘定科目を編集",
  [FISCAL_YEAR_CLOSE_ACTION]: "年度を確定（ロック）",
  [FISCAL_YEAR_REOPEN_ACTION]: "年度のロックを解除",
};

/** action コード（例: "transaction.confirm"）を画面表示用の日本語ラベルに変換する。未知の値はそのまま返す。 */
export function describeAuditAction(action: string): string {
  return ACTION_LABELS[action] ?? action;
}

const ENTITY_TYPE_LABELS: Record<string, string> = {
  transaction: "取引明細",
  journal_entry: "仕訳",
  document: "証憑",
  account: "勘定科目",
  [FISCAL_YEAR_ENTITY_TYPE]: "年度",
};

/** entity_type（例: "transaction"）を画面表示用の日本語ラベルに変換する。未知の値はそのまま返す。 */
export function describeEntityType(entityType: string): string {
  return ENTITY_TYPE_LABELS[entityType] ?? entityType;
}

/** 監査ログの changes(jsonb) から before/after 形式の差分を取り出す。その形でなければ null。 */
export interface AuditLogChangeSummary {
  before?: unknown;
  after?: unknown;
}

export function extractChangeSummary(changes: unknown): AuditLogChangeSummary | null {
  if (!changes || typeof changes !== "object" || Array.isArray(changes)) return null;
  const record = changes as Record<string, unknown>;
  if (!("before" in record) && !("after" in record)) return null;
  return { before: record.before, after: record.after };
}
