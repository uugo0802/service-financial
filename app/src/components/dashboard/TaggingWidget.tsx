"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  DEFAULT_MATERIALITY_THRESHOLD,
  Tag,
  TagAssignment,
  TaggableTransaction,
  assignTag,
  findUntaggedAboveThreshold,
  tagIdsForTransaction,
  unassignTag,
} from "@/lib/tags/tagging";
import { getMyTenantUser } from "@/lib/db/tenants";
import {
  assignTag as dbAssignTag,
  listTagAssignments as dbListTagAssignments,
  listTags as dbListTags,
  unassignTag as dbUnassignTag,
} from "@/lib/db/tags";

// タグそのものの作成・改名・削除は/tags（TagManagerClient.tsx）にすでに実装済みのため、
// ここでは複製しない。このウィジェットは「ダッシュボードを見ながら、主要な未タグ取引に
// すぐタグを付けられる」クイックアクションのみを提供する（app/src/app/tags/TagManagerClient.tsx
// の「取引にタグを付ける」テーブル部分と同じデータモデル・永続化関数を再利用）。

const yen = new Intl.NumberFormat("ja-JP", { maximumFractionDigits: 0 });

/** ダッシュボードでは画面を占有しすぎないよう、未タグ取引の表示件数を絞る */
const MAX_VISIBLE_TRANSACTIONS = 5;

export interface TaggingWidgetProps {
  transactions: TaggableTransaction[];
}

export function TaggingWidget({ transactions }: TaggingWidgetProps) {
  const [tags, setTags] = useState<Tag[]>([]);
  const [assignments, setAssignments] = useState<TagAssignment[]>([]);
  const [tenantId, setTenantId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    // TagManagerClient.tsxと同様、getSupabaseClient()の同期的な例外をエフェクト本体で
    // 直接投げさせないようマイクロタスク経由で呼び出す。テナントが解決するまでは
    // タグ0件（＝「まだタグが登録されていません」案内）のまま表示する。
    Promise.resolve().then(async () => {
      try {
        const tenantUser = await getMyTenantUser();
        if (!tenantUser || cancelled) return;
        const [realTags, realAssignments] = await Promise.all([
          dbListTags(tenantUser.tenant_id),
          dbListTagAssignments(tenantUser.tenant_id),
        ]);
        if (!cancelled) {
          setTenantId(tenantUser.tenant_id);
          setTags(realTags);
          setAssignments(realAssignments);
        }
      } catch {
        // Supabase未設定・未ログインの場合はタグ0件のまま（案内メッセージを表示する）
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const untagged = useMemo(
    () => findUntaggedAboveThreshold(transactions, assignments, DEFAULT_MATERIALITY_THRESHOLD).slice(0, MAX_VISIBLE_TRANSACTIONS),
    [transactions, assignments]
  );
  // findUntaggedAboveThreshold は「1つもタグが付いていない」取引のみを返すため、
  // 表示される行のタグチップは常に未チェック状態で始まり、1つでもタグを付けると
  // その取引はこの一覧から消える（＝完了した項目を減らしていくナッジUI）。
  // 2つ目以降のタグ付けや、既にタグ済みの取引の編集は/tagsで行う想定。

  async function handleToggleAssignment(tagId: string, transactionId: string, checked: boolean) {
    if (tenantId) {
      try {
        if (checked) {
          await dbAssignTag(tagId, transactionId);
        } else {
          await dbUnassignTag(tagId, transactionId);
        }
      } catch {
        // 永続化に失敗した場合は画面表示も変更しない（再操作を促す）
        return;
      }
    }
    setAssignments((prev) => (checked ? assignTag(prev, tagId, transactionId) : unassignTag(prev, tagId, transactionId)));
  }

  if (tags.length === 0) {
    return (
      <div className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-foreground">取引にタグを付ける</h2>
        <p className="text-sm text-muted-foreground leading-relaxed">
          まだタグが登録されていません。クライアント名・案件名などのタグを作成すると、ここから取引にタグを付けられるようになります。
        </p>
        <Link href="/tags" className="text-xs text-accent underline underline-offset-2 hover:opacity-80 self-start">
          タグを作成する →
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between flex-wrap gap-2">
        <h2 className="text-sm font-semibold text-foreground">取引にタグを付ける</h2>
        <span className="text-xs text-muted-foreground">
          未タグ付けの主要な取引（{yen.format(DEFAULT_MATERIALITY_THRESHOLD)}円以上）
        </span>
      </div>

      {untagged.length === 0 ? (
        <p className="text-sm text-muted-foreground">閾値以上の未タグ付け取引はありません。</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {untagged.map((tx) => {
            const assignedTagIds = new Set(tagIdsForTransaction(assignments, tx.id));
            return (
              <li key={tx.id} className="border border-border/60 rounded-md px-3 py-2 flex flex-col gap-1.5">
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="text-foreground truncate">
                    {tx.date} {tx.description}
                  </span>
                  <span className="tabular-nums text-muted-foreground shrink-0">{yen.format(tx.amount)}円</span>
                </div>
                <div className="flex flex-wrap gap-x-3 gap-y-1">
                  {tags.map((tag) => {
                    const checked = assignedTagIds.has(tag.id);
                    return (
                      <button
                        key={tag.id}
                        type="button"
                        aria-pressed={checked}
                        onClick={() => handleToggleAssignment(tag.id, tx.id, !checked)}
                        className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs transition-colors ${
                          checked
                            ? "border-accent bg-accent/10 text-accent"
                            : "border-border text-muted-foreground hover:border-foreground/40"
                        }`}
                      >
                        <span className="inline-block w-2 h-2 rounded-full shrink-0" style={{ background: tag.color ?? "#898781" }} />
                        {tag.label}
                      </button>
                    );
                  })}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <Link href="/tags" className="text-xs text-accent underline underline-offset-2 hover:opacity-80 self-start">
        すべての取引・タグを管理する →
      </Link>
    </div>
  );
}
