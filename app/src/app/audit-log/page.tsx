import { PageContainer } from "@/components/ui/PageContainer";
import type { Metadata } from "next";
import { AuditLogRow } from "@/lib/db/supabaseClient";
import { listAuditLogs, filterAuditLogs, getDistinctEntityTypes, describeEntityType } from "@/lib/db/auditLogs";
import { AuditLogTable } from "@/components/AuditLogTable";
import { PageTitle } from "@/components/ui/PageTitle";

export const metadata: Metadata = {
  title: "監査ログ｜決算書作成から税務申告までワンクリック（スグル）",
  description: "仕訳・証憑データへの変更履歴を確認できる監査ログ画面（開発中プロトタイプ）。",
};

// 本ページ専用のテナントID。認証・テナント切り替えUIが未実装のため、
// 現時点ではデモ用の固定値を使っている（Supabase未接続の間は下記フォールバックで
// サンプルデータに切り替わるため、この値自体は実際には参照されない）。
const DEMO_TENANT_ID = "demo-tenant";

// このページ専用のサンプルデータ。Supabase未接続（開発初期）の間はこちらを表示する。
const SAMPLE_AUDIT_LOGS: AuditLogRow[] = [
  {
    id: "sample-1",
    tenant_id: DEMO_TENANT_ID,
    user_id: "owner@example.com",
    action: "transaction.confirm",
    entity_type: "transaction",
    entity_id: "tx-2026-0042",
    changes: {
      before: { account: "未確定", tax_category: "未確定" },
      after: { account: "地代家賃", tax_category: "課税仕入" },
    },
    created_at: "2026-07-28T09:12:00+09:00",
  },
  {
    id: "sample-2",
    tenant_id: DEMO_TENANT_ID,
    user_id: "owner@example.com",
    action: "transaction.edit",
    entity_type: "transaction",
    entity_id: "tx-2026-0038",
    changes: {
      before: { account: "消耗品費" },
      after: { account: "旅費交通費" },
    },
    created_at: "2026-07-25T18:40:00+09:00",
  },
  {
    id: "sample-3",
    tenant_id: DEMO_TENANT_ID,
    user_id: null,
    action: "document.upload",
    entity_type: "document",
    entity_id: "doc-2026-0117",
    changes: null,
    created_at: "2026-07-20T07:03:00+09:00",
  },
  {
    id: "sample-4",
    tenant_id: DEMO_TENANT_ID,
    user_id: "owner@example.com",
    action: "account.edit",
    entity_type: "account",
    entity_id: "acc-0007",
    changes: {
      before: { name: "雑費" },
      after: { name: "諸会費" },
    },
    created_at: "2026-06-30T11:25:00+09:00",
  },
  {
    id: "sample-5",
    tenant_id: DEMO_TENANT_ID,
    user_id: "owner@example.com",
    action: "transaction.delete",
    entity_type: "transaction",
    entity_id: "tx-2026-0011",
    changes: {
      before: { description: "二重登録のため削除", amount: 3300 },
      after: null,
    },
    created_at: "2026-06-15T14:52:00+09:00",
  },
];

async function loadAuditLogs(): Promise<{ logs: AuditLogRow[]; isSample: boolean }> {
  try {
    const logs = await listAuditLogs(DEMO_TENANT_ID);
    return { logs, isSample: false };
  } catch {
    return { logs: SAMPLE_AUDIT_LOGS, isSample: true };
  }
}

export default async function AuditLogPage({
  searchParams,
}: {
  searchParams: Promise<{ entityType?: string; from?: string; to?: string }>;
}) {
  const { entityType, from, to } = await searchParams;
  const { logs, isSample } = await loadAuditLogs();
  const entityTypes = getDistinctEntityTypes(logs);
  const filteredLogs = filterAuditLogs(logs, { entityType, from, to });
  const hasActiveFilter = Boolean(entityType || from || to);

  return (
    <div className="bg-background text-foreground min-h-screen">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto max-w-5xl px-6 py-4 flex justify-end">
          <PageTitle />
        </div>
      </header>

      <PageContainer as="main" maxWidth="5xl" className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <h1 className="font-serif text-2xl sm:text-3xl">監査ログ</h1>
          <p className="text-muted-foreground text-sm leading-relaxed max-w-2xl">
            仕訳・証憑データに対する作成・編集・削除などの操作履歴を、いつ・誰が・何を変更したかとあわせて確認できます。
            電子帳簿保存法の求める「訂正・削除の履歴が残るシステムでの保存」に対応するための記録です。
          </p>
        </div>

        {isSample && (
          <p className="text-xs text-muted-foreground border border-border bg-surface rounded-lg px-4 py-3">
            現時点ではサンプルデータを表示しています。実際の記帳データとの連携（Supabase）は別途対応予定です。
          </p>
        )}

        <form method="get" className="flex flex-wrap items-end gap-3 border border-border bg-surface rounded-lg p-4">
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            対象種別
            <select
              name="entityType"
              defaultValue={entityType ?? ""}
              className="border border-border rounded px-2 py-1.5 text-sm bg-surface"
            >
              <option value="">すべて</option>
              {entityTypes.map((type) => (
                <option key={type} value={type}>
                  {describeEntityType(type)}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            期間（開始）
            <input
              type="date"
              name="from"
              defaultValue={from ?? ""}
              className="border border-border rounded px-2 py-1.5 text-sm bg-surface"
            />
          </label>

          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            期間（終了）
            <input
              type="date"
              name="to"
              defaultValue={to ?? ""}
              className="border border-border rounded px-2 py-1.5 text-sm bg-surface"
            />
          </label>

          <button
            type="submit"
            className="bg-accent text-white text-sm rounded px-4 py-1.5 hover:opacity-90"
          >
            絞り込む
          </button>

          {hasActiveFilter && (
            <a href="/audit-log" className="text-xs text-muted-foreground underline underline-offset-2">
              条件をクリア
            </a>
          )}
        </form>

        <AuditLogTable logs={filteredLogs} />
      </PageContainer>

      <footer className="border-t border-border bg-surface mt-4">
        <div className="mx-auto max-w-5xl px-6 py-8 text-xs text-muted-foreground leading-relaxed">
          本ページは開発中のプロトタイプであり、税理士法に定める税務代理・税務書類の作成・税務相談を提供するものではありません。
          表示される内容は記帳データの変更履歴（監査ログ）であり、個別具体的な税務相談が必要な場合は、税理士等の専門家にご相談ください。
        </div>
      </footer>
    </div>
  );
}
