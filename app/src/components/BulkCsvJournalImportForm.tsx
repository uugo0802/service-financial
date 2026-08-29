"use client";

import { useEffect, useState } from "react";
import { CategorizedTransaction } from "@/lib/categorize/engine";
import { AccountRow } from "@/lib/db/supabaseClient";
import { getMyTenantUser } from "@/lib/db/tenants";
import { listAccounts, createAccount } from "@/lib/db/accounts";
import { importCategorizedTransactionsAsJournalEntries } from "@/lib/db/csvJournalImport";
import { detectDuplicates } from "@/lib/csv/duplicateDetection";
import { AccountSelect } from "./AccountSelect";

// ------------------------------------------------------------------
// ステージ④「2026年1〜8月分の銀行/カードCSVをまとめて一括アップロードできるようにする」。
// 既存の app/api/categorize/route.ts（1ファイルずつCSVを受け取りルールベース/AI分類する
// エンドポイント）は無改修のまま、複数ファイルを順番に投げて結果を1つにまとめ、
// 「この明細がどの現金・預金勘定と対応するか」を選んでもらった上で journal_entries へ
// 書き込む（design doc「CSV取込との接続」節）。
//
// ファイルをまたいだid衝突を避けるため、各ファイルの結果には fileIndex を接頭辞として
// 付け直す（parse.tsの行idは "row-1" のようにファイル内でしか一意でないため）。
// ------------------------------------------------------------------

const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // app/api/categorize/route.tsの上限と揃える
const yen = new Intl.NumberFormat("ja-JP", { style: "currency", currency: "JPY", maximumFractionDigits: 0 });

interface FileUploadResult {
  fileName: string;
  transactions: CategorizedTransaction[];
  skippedRows: number;
  error: string | null;
}

type TenantState = "loading" | "unconfigured" | "unauthenticated" | "ready";

export function BulkCsvJournalImportForm() {
  const [tenantState, setTenantState] = useState<TenantState>("loading");
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  const [cashAccountId, setCashAccountId] = useState("");

  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [fileResults, setFileResults] = useState<FileUploadResult[]>([]);

  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [importResult, setImportResult] = useState<{ created: number; createdAccountCount: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.resolve().then(async () => {
      try {
        const tenantUser = await getMyTenantUser();
        if (cancelled) return;
        if (!tenantUser) {
          setTenantState("unauthenticated");
          return;
        }
        const rows = await listAccounts(tenantUser.tenant_id);
        if (cancelled) return;
        setTenantId(tenantUser.tenant_id);
        setAccounts(rows);
        setTenantState("ready");
      } catch {
        if (!cancelled) setTenantState("unconfigured");
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleFiles(fileList: FileList) {
    const files = Array.from(fileList);
    if (files.length === 0) return;

    setFileResults([]);
    setImportResult(null);
    setImportError(null);
    setProcessing(true);
    setProgress({ done: 0, total: files.length });

    const results: FileUploadResult[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (file.size > MAX_FILE_SIZE_BYTES) {
        results.push({ fileName: file.name, transactions: [], skippedRows: 0, error: `ファイルサイズが大きすぎます（上限 ${MAX_FILE_SIZE_BYTES / 1024 / 1024}MB）` });
        setFileResults([...results]);
        setProgress({ done: i + 1, total: files.length });
        continue;
      }

      try {
        const fd = new FormData();
        fd.append("file", file);
        const res = await fetch("/api/categorize", { method: "POST", body: fd });
        const data = await res.json();
        if (!res.ok) {
          results.push({ fileName: file.name, transactions: [], skippedRows: 0, error: data.error ?? "解析に失敗しました" });
        } else {
          const transactions: CategorizedTransaction[] = data.transactions.map((t: CategorizedTransaction) => ({
            ...t,
            id: `f${i}-${t.id}`,
          }));
          results.push({ fileName: file.name, transactions, skippedRows: data.meta.skippedRows, error: null });
        }
      } catch {
        results.push({ fileName: file.name, transactions: [], skippedRows: 0, error: "通信エラーが発生しました" });
      }

      setFileResults([...results]);
      setProgress({ done: i + 1, total: files.length });
    }

    setProcessing(false);
  }

  async function handleCreateAccount(name: string, accountType: AccountRow["account_type"]): Promise<AccountRow> {
    if (!tenantId) throw new Error("テナント情報が取得できていません");
    const account = await createAccount(tenantId, { name, account_type: accountType });
    setAccounts((prev) => [...prev, account]);
    return account;
  }

  const allTransactions = fileResults.flatMap((r) => r.transactions);
  // 複数ファイル間の重複（同一期間のCSVを誤って2回選んだ場合等）を検出する。
  // detectDuplicates(existing, incoming) は「incoming内でexistingと重複する行」を返す形のため、
  // ここではファイルを1つずつ既存分に足し込みながら突き合わせる。
  const crossFileDuplicateIds = new Set<string>();
  {
    let seen: CategorizedTransaction[] = [];
    for (const r of fileResults) {
      const matches = detectDuplicates(seen, r.transactions);
      for (const m of matches) crossFileDuplicateIds.add(m.newRowId);
      seen = [...seen, ...r.transactions];
    }
  }

  const totalCount = allTransactions.length;
  const needsReviewCount = allTransactions.filter((t) => t.source === "uncategorized" || t.confidence < 0.75).length;

  async function handleImport() {
    if (!tenantId || !cashAccountId) return;
    setImporting(true);
    setImportError(null);
    try {
      const result = await importCategorizedTransactionsAsJournalEntries(tenantId, allTransactions, cashAccountId);
      setImportResult({ created: result.created.length, createdAccountCount: result.createdAccountCount });
    } catch (e) {
      setImportError(e instanceof Error ? e.message : "記帳に失敗しました");
    } finally {
      setImporting(false);
    }
  }

  if (tenantState === "loading") {
    return <p className="text-sm text-muted-foreground">読み込み中…</p>;
  }

  if (tenantState === "unconfigured") {
    return (
      <div className="border border-amber-300 bg-amber-50 text-amber-800 text-sm p-4">
        Supabaseが未設定のため、この機能はまだ利用できません（開発中のプロトタイプです）。
      </div>
    );
  }

  if (tenantState === "unauthenticated") {
    return <div className="border border-border bg-surface text-sm p-4 text-muted-foreground">ログインすると過去のCSVをまとめて記帳できます。</div>;
  }

  const cashAccounts = accounts.filter((a) => a.account_type === "asset");

  return (
    <div className="border border-border bg-surface p-5 flex flex-col gap-4">
      <div className="max-w-sm">
        <AccountSelect
          label="記帳先の現金・預金勘定"
          accounts={cashAccounts}
          value={cashAccountId}
          onChange={setCashAccountId}
          onCreate={(name) => handleCreateAccount(name, "asset")}
        />
      </div>

      <div>
        <label
          className={`inline-flex min-w-[13rem] items-center justify-center gap-3 border px-5 py-3 text-sm cursor-pointer transition-colors border-stone-400 dark:border-stone-600 bg-white dark:bg-stone-900 hover:border-red-700 dark:hover:border-red-400 ${
            processing ? "pointer-events-none opacity-50" : ""
          }`}
        >
          <span>{processing ? "解析中…" : "CSVファイルを複数選択"}</span>
          <input
            type="file"
            accept=".csv,text/csv"
            multiple
            className="hidden"
            disabled={processing}
            onChange={(e) => {
              if (e.target.files) handleFiles(e.target.files);
              e.target.value = "";
            }}
          />
        </label>
        {progress && (
          <span className="ml-3 text-xs text-muted-foreground">
            {progress.done}/{progress.total}ファイル処理済み
          </span>
        )}
      </div>

      {fileResults.length > 0 && (
        <div className="text-xs text-muted-foreground flex flex-col gap-1">
          {fileResults.map((r) => (
            <div key={r.fileName} className="flex items-baseline gap-2">
              <span className="font-medium text-foreground">{r.fileName}</span>
              {r.error ? (
                <span className="text-red-700 dark:text-red-400">{r.error}</span>
              ) : (
                <span>{r.transactions.length}件（スキップ {r.skippedRows}件）</span>
              )}
            </div>
          ))}
        </div>
      )}

      {totalCount > 0 && (
        <>
          <div className="text-xs text-muted-foreground flex flex-wrap gap-x-6 gap-y-1">
            <span>合計取込件数: {totalCount}件</span>
            <span>要確認: {needsReviewCount}件</span>
            {crossFileDuplicateIds.size > 0 && (
              <span className="text-amber-700 dark:text-amber-500">ファイル間で重複の可能性: {crossFileDuplicateIds.size}件</span>
            )}
          </div>

          <div className="overflow-x-auto border border-border dark:border-stone-700 max-h-80 overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-surface">
                <tr className="border-b border-border text-left text-muted-foreground text-xs">
                  <th className="px-3 py-2 font-normal">日付</th>
                  <th className="px-3 py-2 font-normal">摘要</th>
                  <th className="px-3 py-2 font-normal text-right">金額</th>
                  <th className="px-3 py-2 font-normal">勘定科目</th>
                  <th className="px-3 py-2 font-normal">状態</th>
                </tr>
              </thead>
              <tbody>
                {allTransactions.map((t) => {
                  const needsReview = t.source === "uncategorized" || t.confidence < 0.75;
                  return (
                    <tr
                      key={t.id}
                      className={`border-b border-border/60 last:border-0 ${needsReview ? "bg-red-50 dark:bg-red-950/30" : ""}`}
                    >
                      <td className="px-3 py-2 whitespace-nowrap tabular-nums">{t.date}</td>
                      <td className="px-3 py-2 max-w-xs truncate" title={t.description}>
                        {t.description}
                        {crossFileDuplicateIds.has(t.id) && (
                          <span className="ml-2 inline-block whitespace-nowrap rounded-sm bg-amber-100 dark:bg-amber-900 px-1.5 py-0.5 align-middle text-[10px] text-amber-800 dark:text-amber-300">
                            重複の可能性
                          </span>
                        )}
                      </td>
                      <td className={`px-3 py-2 text-right whitespace-nowrap tabular-nums ${t.amount < 0 ? "text-foreground" : "text-emerald-700 dark:text-emerald-400"}`}>
                        {yen.format(t.amount)}
                      </td>
                      <td className="px-3 py-2">{t.account}</td>
                      <td className="px-3 py-2 text-xs whitespace-nowrap">
                        {t.source === "rule" && <span className="text-emerald-700 dark:text-emerald-400">自動確定</span>}
                        {t.source === "ai" && <span className="text-sky-700 dark:text-sky-400">AI判定</span>}
                        {t.source === "uncategorized" && <span className="text-red-700 dark:text-red-400">要確認</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div>
            <button
              type="button"
              disabled={!cashAccountId || importing || processing}
              onClick={handleImport}
              className={`text-sm px-5 py-2.5 border transition-colors ${
                !cashAccountId || importing || processing
                  ? "border-border bg-surface text-muted-foreground cursor-not-allowed"
                  : "border-accent bg-accent text-white hover:opacity-90"
              }`}
            >
              {importing ? "記帳中…" : `この内容で記帳する（${totalCount}件）`}
            </button>
            {!cashAccountId && <span className="ml-3 text-xs text-muted-foreground">記帳先の現金・預金勘定を選択してください</span>}
            {importError && <span className="ml-3 text-xs text-red-700 dark:text-red-400">{importError}</span>}
            {importResult && (
              <span className="ml-3 text-xs text-emerald-700 dark:text-emerald-400">
                {importResult.created}件を記帳しました
                {importResult.createdAccountCount > 0 && `（新規勘定科目 ${importResult.createdAccountCount}件を作成）`}
              </span>
            )}
          </div>
        </>
      )}

      <p className="text-xs text-amber-700 dark:text-amber-500 leading-relaxed max-w-xl">
        AI補完を含む自動判定の結果です。「要確認」の行や勘定科目・税区分が実態と異なる行がないか、記帳前に必ずご自身でご確認ください。
        個別具体的な税務相談・代理は行っておりません。
      </p>
    </div>
  );
}
