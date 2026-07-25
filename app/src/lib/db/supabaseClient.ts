import { createClient, SupabaseClient } from "@supabase/supabase-js";

// ------------------------------------------------------------------
// Supabaseクライアントのスキャフォールドのみ。実際のSupabaseプロジェクトへの
// 接続は行っていない（NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY
// は未設定）。DB導入時（Phase 1後半〜Phase 2）に supabase/schema.sql を
// 実プロジェクトに適用し、.env.local に接続情報を設定してから使い始める想定。
// ------------------------------------------------------------------

// supabase/schema.sql の各テーブルに対応する型定義。
export interface Tenant {
  id: string;
  entity_type: "individual" | "corp";
  display_name: string;
  created_at: string;
}

export interface TenantUser {
  user_id: string;
  tenant_id: string;
  role: "owner" | "member";
  created_at: string;
}

export interface AccountRow {
  id: string;
  tenant_id: string;
  code: string | null;
  name: string;
  category: "income" | "expense";
  created_at: string;
}

export interface TransactionRow {
  id: string;
  tenant_id: string;
  date: string;
  description: string;
  amount: number;
  account_id: string | null;
  tax_category: string;
  confidence: number;
  source: "rule" | "ai" | "uncategorized";
  note: string | null;
  personal_deduction_only: boolean;
  created_at: string;
}

export interface DocumentRow {
  id: string;
  tenant_id: string;
  transaction_id: string | null;
  storage_path: string;
  uploaded_at: string;
}

export interface AuditLogRow {
  id: string;
  tenant_id: string;
  user_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  changes: unknown;
  created_at: string;
}

let cachedClient: SupabaseClient | null = null;

/**
 * ブラウザ/クライアントサイド用のSupabaseクライアントを返す。
 * 環境変数が未設定の間は呼び出し時に例外を投げる（import時点では失敗させない
 * ことで、DB未導入の現状でもアプリのビルド・実行に影響しない設計にしている）。
 */
export function getSupabaseClient(): SupabaseClient {
  if (cachedClient) return cachedClient;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error(
      "Supabaseが未設定です（NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY）。" +
        "現在このアプリはDB未接続で動作する設計のため、この関数はまだどこからも呼び出されていません。"
    );
  }

  cachedClient = createClient(url, anonKey);
  return cachedClient;
}
