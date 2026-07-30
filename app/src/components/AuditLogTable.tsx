import { AuditLogRow } from "@/lib/db/supabaseClient";
import { describeAuditAction, describeEntityType, extractChangeSummary } from "@/lib/db/auditLogs";

// ------------------------------------------------------------------
// 監査ログ（audit_logs）の一覧表示テーブル。
// データを取り込まない純粋な表示コンポーネント（サーバーコンポーネントとして利用可能）。
// ------------------------------------------------------------------

const dateFormatter = new Intl.DateTimeFormat("ja-JP", { dateStyle: "medium", timeStyle: "short" });

function formatTimestamp(createdAt: string): string {
  const date = new Date(createdAt);
  return Number.isNaN(date.getTime()) ? createdAt : dateFormatter.format(date);
}

function ChangeValue({ value }: { value: unknown }) {
  if (value === undefined) {
    return <span className="text-stone-400">—</span>;
  }
  return <code className="whitespace-pre-wrap break-all">{JSON.stringify(value)}</code>;
}

function ChangesCell({ changes }: { changes: unknown }) {
  if (changes === null || changes === undefined) {
    return <span className="text-stone-400">—</span>;
  }

  const summary = extractChangeSummary(changes);
  if (summary === null) {
    return <code className="text-xs whitespace-pre-wrap break-all">{JSON.stringify(changes)}</code>;
  }

  return (
    <div className="flex flex-col gap-1 text-xs">
      <div>
        <span className="text-stone-500">変更前: </span>
        <ChangeValue value={summary.before} />
      </div>
      <div>
        <span className="text-stone-500">変更後: </span>
        <ChangeValue value={summary.after} />
      </div>
    </div>
  );
}

export function AuditLogTable({ logs }: { logs: AuditLogRow[] }) {
  if (logs.length === 0) {
    return (
      <div className="border border-stone-300 bg-white rounded-lg p-8 text-center text-sm text-stone-500">
        条件に一致する監査ログが見つかりませんでした。絞り込み条件を変更するか、記帳・仕訳操作が行われると、ここに履歴が積み上がっていきます。
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="overflow-x-auto border border-stone-300 bg-white rounded-lg">
        <table className="w-full text-sm border-collapse min-w-[720px]">
          <thead>
            <tr className="border-b border-stone-300 bg-stone-50 text-left text-xs text-stone-500">
              <th className="py-2 px-3 font-semibold">日時</th>
              <th className="py-2 px-3 font-semibold">操作者</th>
              <th className="py-2 px-3 font-semibold">操作</th>
              <th className="py-2 px-3 font-semibold">対象レコード</th>
              <th className="py-2 px-3 font-semibold">変更内容</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((log) => (
              <tr key={log.id} className="border-b border-stone-200 last:border-b-0 align-top">
                <td className="py-2.5 px-3 whitespace-nowrap text-xs text-stone-600">
                  {formatTimestamp(log.created_at)}
                </td>
                <td className="py-2.5 px-3 text-xs">{log.user_id ?? "システム"}</td>
                <td className="py-2.5 px-3">
                  <div className="font-medium">{describeAuditAction(log.action)}</div>
                  <div className="text-[0.68rem] text-stone-400">{log.action}</div>
                </td>
                <td className="py-2.5 px-3 text-xs">
                  <div>{describeEntityType(log.entity_type)}</div>
                  {log.entity_id && <div className="text-stone-400">#{log.entity_id}</div>}
                </td>
                <td className="py-2.5 px-3">
                  <ChangesCell changes={log.changes} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-stone-500">
        監査ログは仕訳・証憑データへの変更を記録した追記専用の履歴であり、後から編集・削除はできません。
        本ページの表示は記帳内容の変更履歴を確認するためのものであり、税理士法に定める税務代理・税務相談を提供するものではありません。
      </p>
    </div>
  );
}
