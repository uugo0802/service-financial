import { getMyTenantUser, getTenant } from "./tenants";
import { listFixedAssets, toDepreciationAsset } from "./fixedAssets";
import { Asset } from "../tax/depreciation";

// ------------------------------------------------------------------
// docs/superpowers/specs/2026-08-29-settlement-attachments-rollout-design.md 対象1。
// depreciation-schedule/page.tsx（別表十六（一）減価償却の計算に関する明細書）向けに、
// fixed_assets・tenants から実データを組み立てる読み込み関数。
// balanceSheetData.ts と同じ方針を踏襲する：
//   - Supabase未設定・未ログイン・所属テナントが見つからない・取得中の例外は
//     すべて null を返す（呼び出し側はページ専用のサンプルデータへフォールバックする）。
//   - 固定資産が1件も登録されていない場合はテナントの実データ（空の一覧）として扱う
//     （ledgerTransactions.tsのように件数0をもってサンプルへフォールバックはしない。
//     「固定資産をまだ登録していない実テナント」を正しく空表示するため）。
// ------------------------------------------------------------------

export interface LedgerDepreciationScheduleData {
  entityName: string; // tenants.display_name
  assets: Asset[]; // fixed_assets（lib/tax/depreciation.ts の Asset 型に変換済み）
}

/**
 * ログイン中ユーザーの所属テナントの固定資産台帳を取得し、
 * depreciationScheduleForm.ts の buildDepreciationScheduleForm() に渡せる形で返す。
 *
 * 以下のいずれかに該当する場合は null を返す（呼び出し側はページ専用のサンプルデータへ
 * フォールバックすること）:
 *   - Supabase未設定（getSupabaseClient()が例外を投げる）
 *   - 未ログイン、またはログイン中ユーザーの所属テナントが見つからない
 *   - テナント情報自体の取得に失敗した
 *   - 取得中に何らかのエラーが発生した
 */
export async function loadDepreciationScheduleDataForCurrentTenant(): Promise<LedgerDepreciationScheduleData | null> {
  try {
    const tenantUser = await getMyTenantUser();
    if (!tenantUser) return null;

    const [tenant, fixedAssetRows] = await Promise.all([
      getTenant(tenantUser.tenant_id),
      listFixedAssets(tenantUser.tenant_id),
    ]);

    if (!tenant) return null;

    return {
      entityName: tenant.display_name,
      assets: fixedAssetRows.map(toDepreciationAsset),
    };
  } catch {
    return null;
  }
}
