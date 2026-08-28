import { getSupabaseClient } from "./supabaseClient";
import { Tag, TagAssignment, TagDraft } from "../tags/tagging";

// ------------------------------------------------------------------
// テナントごとのタグ（tags）・取引へのタグ付け（tag_assignments）への永続化。
// documents.ts / categorizeRules.ts と同じ「テナントIDを明示的に受け取り、
// クエリを .eq("tenant_id", tenantId) でスコープする」規約に従う
// （RLSに加えアプリ層でもテナント分離を強制する。docs/cto-tech-architecture.md 4.2）。
//
// app/src/lib/tags/tagging.ts はDB非依存の純粋関数群として維持し、ここでは
// Tag/TagAssignment に必要な最小フィールドをDB行との間で相互変換するだけの薄い層とする。
// tag_assignments 自体には tenant_id 列が無いため（tags経由でRLSスコープする。
// supabase/schema.sql 参照）、テナントスコープは常に紐づく tags.tenant_id を介して行う。
// ------------------------------------------------------------------

export interface TagRow {
  id: string;
  tenant_id: string;
  label: string;
  color: string | null;
  created_at: string;
}

export interface TagAssignmentRow {
  tag_id: string;
  transaction_id: string;
  created_at: string;
}

function rowToTag(row: TagRow): Tag {
  return {
    id: row.id,
    label: row.label,
    color: row.color ?? undefined,
  };
}

function rowToTagAssignment(row: TagAssignmentRow): TagAssignment {
  return {
    tagId: row.tag_id,
    transactionId: row.transaction_id,
  };
}

/** テナントのタグ一覧を取得する（ラベルの昇順）。 */
export async function listTags(tenantId: string): Promise<Tag[]> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("tags")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("label", { ascending: true });

  if (error) {
    throw new Error(`タグの取得に失敗しました: ${error.message}`);
  }
  return ((data ?? []) as TagRow[]).map(rowToTag);
}

/**
 * テナントのタグ付け（TagAssignment）一覧を取得する。
 * tag_assignments には tenant_id が無いため、まずテナントのタグID一覧を取得し、
 * それに紐づく紐付けだけを取得する（RLSと同じテナントスコープの考え方をアプリ層でも徹底する）。
 * テナントにタグが1件も無い場合は問い合わせを行わず空配列を返す。
 */
export async function listTagAssignments(tenantId: string): Promise<TagAssignment[]> {
  const supabase = getSupabaseClient();
  const { data: tagRows, error: tagError } = await supabase.from("tags").select("id").eq("tenant_id", tenantId);

  if (tagError) {
    throw new Error(`タグの取得に失敗しました: ${tagError.message}`);
  }

  const tagIds = ((tagRows ?? []) as { id: string }[]).map((row) => row.id);
  if (tagIds.length === 0) return [];

  const { data, error } = await supabase.from("tag_assignments").select("*").in("tag_id", tagIds);

  if (error) {
    throw new Error(`タグの紐付けの取得に失敗しました: ${error.message}`);
  }
  return ((data ?? []) as TagAssignmentRow[]).map(rowToTagAssignment);
}

/**
 * タグを新規登録する。
 * 呼び出し側は事前に tagging.ts の validateTagLabel でエラーがないことを
 * 確認しておくこと（このDB層はバリデーション済みの入力を前提とする）。
 */
export async function createTag(tenantId: string, draft: TagDraft): Promise<Tag> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("tags")
    .insert({
      tenant_id: tenantId,
      label: draft.label.trim(),
      color: draft.color ?? null,
    })
    .select()
    .single();

  if (error || !data) {
    throw new Error(`タグの登録に失敗しました: ${error?.message ?? "unknown error"}`);
  }
  return rowToTag(data as TagRow);
}

/**
 * 既存タグの名前・色を更新する（無ければ作成する upsert）。
 * id を指定した場合は該当タグを更新し、省略した場合は新規タグを作成する。
 */
export async function upsertTag(tenantId: string, draft: TagDraft, id?: string): Promise<Tag> {
  if (!id) {
    return createTag(tenantId, draft);
  }

  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("tags")
    .update({
      label: draft.label.trim(),
      color: draft.color ?? null,
    })
    .eq("id", id)
    .eq("tenant_id", tenantId) // RLSに加えアプリ層でもテナントスコープを明示
    .select()
    .single();

  if (error || !data) {
    throw new Error(`タグの更新に失敗しました: ${error?.message ?? "unknown error"}`);
  }
  return rowToTag(data as TagRow);
}

/** タグを削除する（tag_assignmentsへの紐付けは on delete cascade により自動で削除される）。 */
export async function deleteTag(tenantId: string, id: string): Promise<void> {
  const supabase = getSupabaseClient();
  const { error } = await supabase.from("tags").delete().eq("id", id).eq("tenant_id", tenantId);

  if (error) {
    throw new Error(`タグの削除に失敗しました: ${error.message}`);
  }
}

/**
 * 取引にタグを付与する（冪等ではない呼び出し元向けに .upsert を用い、
 * 既に同じ組み合わせがあってもエラーにしない）。
 */
export async function assignTag(tagId: string, transactionId: string): Promise<TagAssignment> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("tag_assignments")
    .upsert({ tag_id: tagId, transaction_id: transactionId }, { onConflict: "tag_id,transaction_id" })
    .select()
    .single();

  if (error || !data) {
    throw new Error(`タグの付与に失敗しました: ${error?.message ?? "unknown error"}`);
  }
  return rowToTagAssignment(data as TagAssignmentRow);
}

/** 取引からタグを外す。 */
export async function unassignTag(tagId: string, transactionId: string): Promise<void> {
  const supabase = getSupabaseClient();
  const { error } = await supabase
    .from("tag_assignments")
    .delete()
    .eq("tag_id", tagId)
    .eq("transaction_id", transactionId);

  if (error) {
    throw new Error(`タグの解除に失敗しました: ${error.message}`);
  }
}
