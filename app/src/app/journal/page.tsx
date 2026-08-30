"use client";
import { TableScrollArea } from "@/components/ui/TableScrollArea";
import { PageContainer } from "@/components/ui/PageContainer";

import { Fragment, useEffect, useState } from "react";
import Link from "next/link";
import { CategorizedTransaction } from "@/lib/categorize/engine";
import { AccountRow, FixedAssetRow } from "@/lib/db/supabaseClient";
import { getMyTenantUser } from "@/lib/db/tenants";
import { listAccounts, createAccount } from "@/lib/db/accounts";
import { createFixedAsset } from "@/lib/db/fixedAssets";
import { importCategorizedTransactionsAsJournalEntries } from "@/lib/db/csvJournalImport";
import {
  EMPTY_JOURNAL_DRAFT,
  JournalEntryDraft,
  addJournalEntry,
  removeJournalEntry,
  transactionToDraft,
  updateJournalEntry,
} from "@/lib/journal/entries";
import { JournalEntryForm } from "@/components/JournalEntryForm";
import { FixedAssetForm } from "@/components/FixedAssetForm";
import { CategorizationRationale } from "@/components/CategorizationRationale";
import { AccountSelect } from "@/components/AccountSelect";
import { PageTitle } from "@/components/ui/PageTitle";

const yen = new Intl.NumberFormat("ja-JP", { style: "currency", currency: "JPY", maximumFractionDigits: 0 });

// "create-asset" は固定資産台帳（fixed_assets）への登録フォームを開いている状態。
// 通常の仕訳（journal_entries）とは保存先テーブルが異なり、入力済み一覧（entries）を
// 経由せずFixedAssetForm経由でその場でcreateFixedAssetを呼ぶ（settings/opening-balances/
// OpeningBalancesClient.tsxと同じ配線）。
// オーナーからの実機フィードバック「仕訳や固定資産台帳の入力が別ページにあるのはどうか」を受けて、
// パソコン・車両など複数年使用する資産をこの仕訳入力ページからも登録できる入口として追加した
// （docs/superpowers/specs/2026-08-30-input-flow-consolidation-design.md参照）。
// より詳細な一覧管理・減価償却明細の確認・除却/売却計算は引き続き/assetsページで行う。
type FormState = { mode: "closed" } | { mode: "create" } | { mode: "create-asset" } | { mode: "edit"; id: string };

// 記帳（保存）操作のためのテナント・勘定科目の読み込み状態。
// BulkCsvJournalImportForm（transactions/page.tsx配下、同じCSV分類済みデータを
// journal_entriesへ書き込む処理）と同じ4状態にしている。
type SaveSetupState = "loading" | "unconfigured" | "unauthenticated" | "ready";

export default function JournalPage() {
  const [entries, setEntries] = useState<CategorizedTransaction[]>([]);
  const [formState, setFormState] = useState<FormState>({ mode: "closed" });

  const [saveSetupState, setSaveSetupState] = useState<SaveSetupState>("loading");
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  const [cashAccountId, setCashAccountId] = useState("");

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveResult, setSaveResult] = useState<{ created: number; createdAccountCount: number } | null>(null);

  const [registeredAssets, setRegisteredAssets] = useState<FixedAssetRow[]>([]);

  useEffect(() => {
    // 他の書き込み系フォーム（settings/opening-balances/OpeningBalancesClient.tsx等）と同様、
    // エフェクト本体での同期的なsetStateを避けるためマイクロタスク経由で呼び出す
    let cancelled = false;
    Promise.resolve().then(async () => {
      try {
        const tenantUser = await getMyTenantUser();
        if (cancelled) return;
        if (!tenantUser) {
          setSaveSetupState("unauthenticated");
          return;
        }
        const rows = await listAccounts(tenantUser.tenant_id);
        if (cancelled) return;
        setTenantId(tenantUser.tenant_id);
        setAccounts(rows);
        setSaveSetupState("ready");
      } catch {
        if (!cancelled) setSaveSetupState("unconfigured");
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const editingEntry = formState.mode === "edit" ? entries.find((e) => e.id === formState.id) : undefined;

  function handleCreate(draft: JournalEntryDraft) {
    setEntries((prev) => addJournalEntry(prev, draft));
    setSaveResult(null);
  }

  function handleUpdate(id: string) {
    return (draft: JournalEntryDraft) => {
      setEntries((prev) => updateJournalEntry(prev, id, draft));
      setFormState({ mode: "closed" });
      setSaveResult(null);
    };
  }

  function handleDelete(id: string) {
    setEntries((prev) => removeJournalEntry(prev, id));
    if (formState.mode === "edit" && formState.id === id) {
      setFormState({ mode: "closed" });
    }
    setSaveResult(null);
  }

  async function handleCreateAccount(name: string, accountType: AccountRow["account_type"]): Promise<AccountRow> {
    if (!tenantId) throw new Error("テナント情報が取得できていません");
    const account = await createAccount(tenantId, { name, account_type: accountType });
    setAccounts((prev) => [...prev, account]);
    return account;
  }

  async function handleSave() {
    if (!tenantId || !cashAccountId || entries.length === 0) return;
    setSaving(true);
    setSaveError(null);
    try {
      // 手入力の仕訳もCSV取込と同じ CategorizedTransaction 形なので、
      // csvJournalImport.ts の変換ロジック（勘定科目未整備時のその場作成含む）をそのまま再利用する。
      const result = await importCategorizedTransactionsAsJournalEntries(tenantId, entries, cashAccountId);
      setSaveResult({ created: result.created.length, createdAccountCount: result.createdAccountCount });
      setEntries([]);
      setFormState({ mode: "closed" });
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "記帳に失敗しました");
    } finally {
      setSaving(false);
    }
  }

  async function handleCreateFixedAsset(input: Parameters<typeof createFixedAsset>[1]) {
    if (!tenantId) throw new Error("テナント情報が取得できていません");
    const created = await createFixedAsset(tenantId, input);
    setRegisteredAssets((prev) => [...prev, created]);
    setFormState({ mode: "closed" });
  }

  // 記帳先の現金・預金勘定と、固定資産側の勘定科目はどちらもaccount_type: "asset"のため
  // 同じ一覧を共用する（選択肢に他のasset勘定が混ざる点はOpeningBalancesClient.tsxと同様の割り切り）
  const assetTypeAccounts = accounts.filter((a) => a.account_type === "asset");
  const expenseAccounts = accounts.filter((a) => a.account_type === "expense");

  return (
    <div className="bg-background text-foreground min-h-screen">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto max-w-5xl px-6 py-4 flex items-baseline justify-between">
          <PageTitle />
          <div className="text-xs text-muted-foreground">仕訳の手入力</div>
        </div>
      </header>

      <PageContainer as="main" maxWidth="5xl" className="flex flex-col gap-8">
        <section>
          <h1 className="text-2xl font-semibold mb-2">仕訳を手入力する</h1>
          <p className="text-sm text-muted-foreground mb-4 max-w-2xl leading-relaxed">
            CSVアップロードに頼らず、現金取引やレシートのみの取引などを1件ずつ手入力で追加・編集・削除できます。
            自宅家賃や通信費など事業と私用が混在する費用の金額を按分したい場合は、
            <Link href="/expense-allocation" className="underline hover:text-red-700">按分計算ページ</Link>
            で計算した事業分の金額をこちらに入力してください。
            <b>これは概算シミュレーションであり、正式な申告書ではありません。</b>
          </p>

          {formState.mode === "create" ? (
            <JournalEntryForm
              mode="create"
              initialDraft={EMPTY_JOURNAL_DRAFT}
              onSubmit={handleCreate}
              onCancel={() => setFormState({ mode: "closed" })}
            />
          ) : formState.mode === "create-asset" ? (
            <div className="flex flex-col gap-3">
              <p className="text-sm text-muted-foreground max-w-2xl leading-relaxed">
                パソコンや車両など、取得価額が高く複数年にわたって使用する資産は仕訳ではなく固定資産台帳に登録し、
                減価償却費を毎期自動計算します。登録済み資産の一覧・除却/売却の計算は
                <Link href="/assets" className="underline hover:text-red-700">固定資産台帳ページ</Link>
                で行えます。
              </p>
              <FixedAssetForm
                assetAccounts={assetTypeAccounts}
                expenseAccounts={expenseAccounts}
                onCreateAccount={handleCreateAccount}
                onSubmit={handleCreateFixedAsset}
              />
              <div>
                <button
                  type="button"
                  onClick={() => setFormState({ mode: "closed" })}
                  className="text-sm px-5 py-2.5 border border-border bg-surface hover:border-foreground/40 transition-colors"
                >
                  キャンセル
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => setFormState({ mode: "create" })}
                className="text-sm px-5 py-3 border border-border bg-surface hover:border-red-700 transition-colors"
              >
                ＋ 仕訳を追加
              </button>
              {saveSetupState === "ready" && (
                <button
                  type="button"
                  onClick={() => setFormState({ mode: "create-asset" })}
                  className="text-sm px-5 py-3 border border-border bg-surface hover:border-red-700 transition-colors"
                >
                  ＋ 固定資産として登録
                </button>
              )}
            </div>
          )}
        </section>

        {registeredAssets.length > 0 && (
          <section>
            <h2 className="text-lg font-semibold mb-3">
              今回登録した固定資産 <span className="text-sm font-normal text-muted-foreground">（{registeredAssets.length}件）</span>
            </h2>
            <TableScrollArea innerClassName="border border-border bg-surface">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground text-xs">
                    <th className="px-3 py-2 font-normal">資産名</th>
                    <th className="px-3 py-2 font-normal whitespace-nowrap">取得日</th>
                    <th className="px-3 py-2 font-normal text-right whitespace-nowrap">取得価額</th>
                    <th className="px-3 py-2 font-normal text-right whitespace-nowrap">耐用年数</th>
                  </tr>
                </thead>
                <tbody>
                  {registeredAssets.map((a) => (
                    <tr key={a.id} className="border-b border-border/60 last:border-0">
                      <td className="px-3 py-2">{a.name}</td>
                      <td className="px-3 py-2 whitespace-nowrap tabular-nums">{a.acquisition_date}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{yen.format(a.acquisition_cost)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{a.useful_life_years}年</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableScrollArea>
            <p className="mt-2 text-xs text-muted-foreground">
              減価償却明細の確認や除却・売却の計算は<Link href="/assets" className="underline hover:text-red-700">固定資産台帳ページ</Link>で行えます。
            </p>
          </section>
        )}

        <section>
          <h2 className="text-lg font-semibold mb-3">
            入力済みの仕訳 {entries.length > 0 && <span className="text-sm font-normal text-muted-foreground">（{entries.length}件）</span>}
          </h2>

          {entries.length === 0 ? (
            <p className="text-sm text-muted-foreground border border-dashed border-border bg-surface px-4 py-6 text-center">
              まだ仕訳がありません。上の「＋ 仕訳を追加」から入力してください。
            </p>
          ) : (
            <TableScrollArea innerClassName="border border-border bg-surface">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground text-xs">
                    <th className="px-3 py-2 font-normal">日付</th>
                    <th className="px-3 py-2 font-normal">摘要</th>
                    <th className="px-3 py-2 font-normal text-right">金額</th>
                    <th className="px-3 py-2 font-normal">勘定科目</th>
                    <th className="px-3 py-2 font-normal">消費税区分</th>
                    <th className="px-3 py-2 font-normal">なぜこの仕訳？</th>
                    <th className="px-3 py-2 font-normal">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((entry) => (
                    <Fragment key={entry.id}>
                      <tr className="border-b border-border/60 last:border-0">
                        <td className="px-3 py-2 whitespace-nowrap tabular-nums">{entry.date}</td>
                        <td className="px-3 py-2 max-w-xs truncate" title={entry.description}>
                          {entry.description}
                        </td>
                        <td className={`px-3 py-2 text-right tabular-nums ${entry.amount < 0 ? "text-foreground" : "text-emerald-700"}`}>
                          {yen.format(entry.amount)}
                        </td>
                        <td className="px-3 py-2">{entry.account}</td>
                        <td className="px-3 py-2 text-xs whitespace-nowrap">{entry.taxCategory}</td>
                        <td className="px-3 py-2">
                          <CategorizationRationale transaction={entry} />
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() =>
                              setFormState(
                                formState.mode === "edit" && formState.id === entry.id
                                  ? { mode: "closed" }
                                  : { mode: "edit", id: entry.id }
                              )
                            }
                            className="text-xs text-muted-foreground hover:text-red-700 mr-3"
                          >
                            {formState.mode === "edit" && formState.id === entry.id ? "閉じる" : "編集"}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(entry.id)}
                            className="text-xs text-red-700 hover:text-red-900"
                          >
                            削除
                          </button>
                        </td>
                      </tr>
                      {formState.mode === "edit" && formState.id === entry.id && editingEntry && (
                        <tr>
                          <td colSpan={7} className="px-3 py-4 bg-surface">
                            <JournalEntryForm
                              mode="edit"
                              initialDraft={transactionToDraft(editingEntry)}
                              onSubmit={handleUpdate(entry.id)}
                              onCancel={() => setFormState({ mode: "closed" })}
                            />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </TableScrollArea>
          )}
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-3">記帳する</h2>
          <p className="text-sm text-muted-foreground mb-4 max-w-2xl leading-relaxed">
            上の一覧の内容を、指定した現金・預金勘定と組み合わせて仕訳台帳（journal_entries）へ保存します。
            保存が完了すると上の一覧はクリアされます。
          </p>

          {saveSetupState === "loading" && <p className="text-sm text-muted-foreground">読み込み中…</p>}

          {saveSetupState === "unconfigured" && (
            <div className="border border-amber-300 bg-amber-50 text-amber-800 text-sm p-4">
              Supabaseが未設定のため、この機能はまだ利用できません（開発中のプロトタイプです）。
            </div>
          )}

          {saveSetupState === "unauthenticated" && (
            <div className="border border-border bg-surface text-sm p-4 text-muted-foreground">
              ログインすると入力した仕訳を保存できます。
            </div>
          )}

          {saveSetupState === "ready" && (
            <div className="border border-border bg-surface p-5 flex flex-col gap-4">
              <div className="max-w-sm">
                <AccountSelect
                  label="記帳先の現金・預金勘定"
                  accounts={assetTypeAccounts}
                  value={cashAccountId}
                  onChange={setCashAccountId}
                  onCreate={(name) => handleCreateAccount(name, "asset")}
                />
              </div>

              <div>
                <button
                  type="button"
                  disabled={!cashAccountId || entries.length === 0 || saving}
                  onClick={handleSave}
                  className={`text-sm px-5 py-2.5 border transition-colors ${
                    !cashAccountId || entries.length === 0 || saving
                      ? "border-border bg-surface text-muted-foreground cursor-not-allowed"
                      : "border-accent bg-accent text-white hover:opacity-90"
                  }`}
                >
                  {saving ? "記帳中…" : `この内容で記帳する（${entries.length}件）`}
                </button>
                {entries.length === 0 && (
                  <span className="ml-3 text-xs text-muted-foreground">保存する仕訳がありません</span>
                )}
                {entries.length > 0 && !cashAccountId && (
                  <span className="ml-3 text-xs text-muted-foreground">記帳先の現金・預金勘定を選択してください</span>
                )}
                {saveError && <span className="ml-3 text-xs text-red-700">{saveError}</span>}
                {saveResult && (
                  <span className="ml-3 text-xs text-emerald-700">
                    {saveResult.created}件を記帳しました
                    {saveResult.createdAccountCount > 0 && `（新規勘定科目 ${saveResult.createdAccountCount}件を作成）`}
                  </span>
                )}
              </div>
            </div>
          )}
        </section>
      </PageContainer>
    </div>
  );
}
