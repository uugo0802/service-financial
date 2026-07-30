import { getSupabaseClient, Tenant, TenantUser } from "./supabaseClient";

// ------------------------------------------------------------------
// tenants / tenant_users への読み取り専用アクセス。
// schema.sql の tenant_users.user_id は auth.users.id を主キーとするため、
// 1ユーザーにつき所属テナントは常に高々1件（将来の複数テナント対応まではこの前提でよい）。
// 他テーブルのCRUD関数はここで解決した tenantId を引数として受け取り、
// 呼び出し側で明示的にテナントスコープを指定させることで、RLSに加えアプリ層でも
// テナント分離を強制する（docs/cto-tech-architecture.md 4.2）。
// ------------------------------------------------------------------

/**
 * 現在ログイン中のユーザーが所属するテナントの紐付け（tenant_users行）を取得する。
 * 未ログイン・未所属の場合は null を返す。
 */
export async function getMyTenantUser(): Promise<TenantUser | null> {
  const supabase = getSupabaseClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return null;
  }

  const { data, error } = await supabase
    .from("tenant_users")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return data;
}

/**
 * テナントIDから tenants 行を取得する。RLSにより所属していないテナントは取得できない。
 */
export async function getTenant(tenantId: string): Promise<Tenant | null> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("tenants")
    .select("*")
    .eq("id", tenantId)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return data;
}

// ------------------------------------------------------------------
// テナントプロフィール設定（事業者設定画面）向けの追加ロジック。
// fiscal_year_end_month（法人の決算月）・blue_return（青色申告の承認有無）は
// supabase/schema.sql の tenants テーブルにまだ列がないため、実DB接続時には
// マイグレーション追加が必要（DB導入フェーズで反映する想定。lib/tax/estimate.ts
// の青色申告特別控除の計算はこの blue_return の値を将来的に参照する）。
// ------------------------------------------------------------------

export type EntityType = Tenant["entity_type"];

/** tenants テーブルの想定拡張形（fiscal_year_end_month・blue_returnを含む） */
export interface TenantProfile extends Tenant {
  fiscal_year_end_month: number | null;
  blue_return: boolean;
}

/** 設定フォームの入力値。fiscalYearEndMonthは保存前の生の文字列のまま保持する */
export interface TenantProfileDraft {
  entityType: EntityType;
  displayName: string;
  fiscalYearEndMonth: string;
  blueReturn: boolean;
}

export type TenantProfileFieldErrors = Partial<Record<"displayName" | "fiscalYearEndMonth", string>>;

export const EMPTY_TENANT_PROFILE_DRAFT: TenantProfileDraft = {
  entityType: "individual",
  displayName: "",
  fiscalYearEndMonth: "",
  blueReturn: false,
};

/** 保存済みプロフィールを編集フォームの初期値へ変換する */
export function tenantProfileToDraft(profile: TenantProfile): TenantProfileDraft {
  return {
    entityType: profile.entity_type,
    displayName: profile.display_name,
    fiscalYearEndMonth: profile.fiscal_year_end_month != null ? String(profile.fiscal_year_end_month) : "",
    blueReturn: profile.blue_return,
  };
}

/**
 * フォーム入力のバリデーション。エラーがなければ空オブジェクトを返す。
 * 決算月はマイクロ法人（entityType === "corp"）の場合のみ必須。
 */
export function validateTenantProfileDraft(draft: TenantProfileDraft): TenantProfileFieldErrors {
  const errors: TenantProfileFieldErrors = {};

  if (!draft.displayName.trim()) {
    errors.displayName = "屋号・会社名を入力してください";
  }

  if (draft.entityType === "corp") {
    const month = draft.fiscalYearEndMonth.trim();
    if (!month) {
      errors.fiscalYearEndMonth = "決算月を入力してください";
    } else if (!/^\d{1,2}$/.test(month) || Number(month) < 1 || Number(month) > 12) {
      errors.fiscalYearEndMonth = "決算月は1〜12の整数で入力してください";
    }
  }

  return errors;
}

export function hasTenantProfileErrors(errors: TenantProfileFieldErrors): boolean {
  return Object.values(errors).some((message) => message !== undefined);
}

export interface TenantProfilePatch {
  entity_type: EntityType;
  display_name: string;
  fiscal_year_end_month: number | null;
  blue_return: boolean;
}

/**
 * draftをDB更新用のパッチへ変換する。
 * 呼び出し側は事前に validateTenantProfileDraft でエラーがないことを確認しておくこと。
 * 個人事業主（entityType === "individual"）の場合、決算月は常にnull（暦年で確定）とする。
 */
export function draftToTenantProfilePatch(draft: TenantProfileDraft): TenantProfilePatch {
  const fiscalYearEndMonth =
    draft.entityType === "corp" && draft.fiscalYearEndMonth.trim() ? Number(draft.fiscalYearEndMonth.trim()) : null;

  return {
    entity_type: draft.entityType,
    display_name: draft.displayName.trim(),
    fiscal_year_end_month: fiscalYearEndMonth,
    blue_return: draft.blueReturn,
  };
}

/**
 * テナントの基本プロフィール（事業形態・屋号／会社名・決算月・青色申告の承認有無）を更新する。
 * RLSに加え、呼び出し側で明示的にtenantIdを指定させることでアプリ層でもテナント分離を強制する。
 */
export async function updateTenantProfile(tenantId: string, patch: TenantProfilePatch): Promise<TenantProfile> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("tenants")
    .update({
      entity_type: patch.entity_type,
      display_name: patch.display_name,
      fiscal_year_end_month: patch.fiscal_year_end_month,
      blue_return: patch.blue_return,
    })
    .eq("id", tenantId)
    .select()
    .single();

  if (error || !data) {
    throw new Error(`テナント情報の更新に失敗しました: ${error?.message ?? "unknown error"}`);
  }
  return data as TenantProfile;
}
