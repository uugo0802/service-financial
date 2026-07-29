import { getSupabaseClient } from "./supabaseClient";
import { UserCategoryRule, UserCategoryRuleDraft, TaxCategory } from "../categorize/userRules";

// ------------------------------------------------------------------
// テナントごとのユーザー辞書ルール（user_categorize_rules）への永続化。
// documents.ts / tenants.ts と同じ「テナントIDを明示的に受け取り、
// クエリを .eq("tenant_id", tenantId) でスコープする」規約に従う
// （RLSに加えアプリ層でもテナント分離を強制する。docs/cto-tech-architecture.md 4.2）。
//
// 注意: supabase/schema.sql にはまだ user_categorize_rules テーブルが定義されていない
// （このファイルの担当範囲外のため、テーブル追加のマイグレーションは別途必要）。
// 想定スキーマ:
//   id uuid primary key default gen_random_uuid()
//   tenant_id uuid not null references tenants (id) on delete cascade
//   pattern text not null
//   account text not null
//   tax_category text not null
//   note text
//   created_at timestamptz not null default now()
// ------------------------------------------------------------------

export interface CategorizeRuleRow {
  id: string;
  tenant_id: string;
  pattern: string;
  account: string;
  tax_category: string;
  note: string | null;
  created_at: string;
}

function rowToUserCategoryRule(row: CategorizeRuleRow): UserCategoryRule {
  return {
    id: row.id,
    pattern: row.pattern,
    account: row.account,
    taxCategory: row.tax_category as TaxCategory,
    note: row.note ?? undefined,
    createdAt: row.created_at,
  };
}

/** テナントのユーザー辞書ルール一覧を取得する（作成日時降順。新しいルールほど上に表示） */
export async function listCategorizeRules(tenantId: string): Promise<UserCategoryRule[]> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("user_categorize_rules")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`ユーザー辞書ルールの取得に失敗しました: ${error.message}`);
  }
  return ((data ?? []) as CategorizeRuleRow[]).map(rowToUserCategoryRule);
}

/**
 * ユーザー辞書ルールを新規登録する。
 * 呼び出し側は事前に userRules.ts の validateUserCategoryRuleDraft でエラーがないことを
 * 確認しておくこと（このDB層はバリデーション済みの入力を前提とする）。
 */
export async function createCategorizeRule(
  tenantId: string,
  draft: UserCategoryRuleDraft
): Promise<UserCategoryRule> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("user_categorize_rules")
    .insert({
      tenant_id: tenantId,
      pattern: draft.pattern.trim(),
      account: draft.account.trim(),
      tax_category: draft.taxCategory,
      note: draft.note?.trim() || null,
    })
    .select()
    .single();

  if (error || !data) {
    throw new Error(`ユーザー辞書ルールの登録に失敗しました: ${error?.message ?? "unknown error"}`);
  }
  return rowToUserCategoryRule(data as CategorizeRuleRow);
}

/** 既存のユーザー辞書ルールを更新する */
export async function updateCategorizeRule(
  tenantId: string,
  id: string,
  draft: UserCategoryRuleDraft
): Promise<UserCategoryRule> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("user_categorize_rules")
    .update({
      pattern: draft.pattern.trim(),
      account: draft.account.trim(),
      tax_category: draft.taxCategory,
      note: draft.note?.trim() || null,
    })
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .select()
    .single();

  if (error || !data) {
    throw new Error(`ユーザー辞書ルールの更新に失敗しました: ${error?.message ?? "unknown error"}`);
  }
  return rowToUserCategoryRule(data as CategorizeRuleRow);
}

/** ユーザー辞書ルールを削除する */
export async function deleteCategorizeRule(tenantId: string, id: string): Promise<void> {
  const supabase = getSupabaseClient();
  const { error } = await supabase
    .from("user_categorize_rules")
    .delete()
    .eq("id", id)
    .eq("tenant_id", tenantId);

  if (error) {
    throw new Error(`ユーザー辞書ルールの削除に失敗しました: ${error.message}`);
  }
}
