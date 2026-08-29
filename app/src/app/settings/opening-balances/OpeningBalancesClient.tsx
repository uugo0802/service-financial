"use client";
import { TableScrollArea } from "@/components/ui/TableScrollArea";

import { useCallback, useEffect, useState } from "react";
import { AccountRow, FixedAssetRow, LoanRow } from "@/lib/db/supabaseClient";
import { getMyTenantUser } from "@/lib/db/tenants";
import { listAccounts, createAccount } from "@/lib/db/accounts";
import { listFixedAssets, createFixedAsset } from "@/lib/db/fixedAssets";
import { listLoans, createLoan } from "@/lib/db/loans";
import {
  EMPTY_OPENING_BALANCE_DRAFT,
  draftToOpeningBalanceInput,
  getCompanyOpeningBalance,
  openingBalanceToDraft,
  upsertCompanyOpeningBalance,
} from "@/lib/db/openingBalances";
import { OpeningBalanceForm } from "@/components/OpeningBalanceForm";
import { FixedAssetForm } from "@/components/FixedAssetForm";
import { LoanForm } from "@/components/LoanForm";

// ------------------------------------------------------------------
// ステージ④「期首残高投入用のUI」。company_opening_balances（現金残高・繰越利益剰余金・期首日）・
// fixed_assets・loans の初期行を投入するフォームをまとめた画面。
// security/page.tsx と同じ方針: getSupabaseClient() は未設定時に例外を投げるため、
// データ取得全体をtry/catchで囲みSupabase未設定の状態を区別する。未ログイン・未所属の
// 場合も編集不可であることをそのまま案内する（この画面はテナントの実データを書き換えるため、
// financial-statements等のようなサンプルデータへのフォールバックは行わない）。
// ------------------------------------------------------------------

const yen = new Intl.NumberFormat("ja-JP", { style: "currency", currency: "JPY", maximumFractionDigits: 0 });
const percent = new Intl.NumberFormat("ja-JP", { style: "percent", minimumFractionDigits: 0, maximumFractionDigits: 4 });

type LoadState = "loading" | "unconfigured" | "unauthenticated" | "ready";

export function OpeningBalancesClient() {
  const [state, setState] = useState<LoadState>("loading");
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  const [fixedAssets, setFixedAssets] = useState<FixedAssetRow[]>([]);
  const [loans, setLoans] = useState<LoanRow[]>([]);
  const [openingDraft, setOpeningDraft] = useState(EMPTY_OPENING_BALANCE_DRAFT);
  const [loadError, setLoadError] = useState<string | null>(null);

  const refresh = useCallback(async (currentTenantId: string) => {
    const [accountRows, assetRows, loanRows, openingBalance] = await Promise.all([
      listAccounts(currentTenantId),
      listFixedAssets(currentTenantId),
      listLoans(currentTenantId),
      getCompanyOpeningBalance(currentTenantId),
    ]);
    setAccounts(accountRows);
    setFixedAssets(assetRows);
    setLoans(loanRows);
    setOpeningDraft(openingBalance ? openingBalanceToDraft(openingBalance) : EMPTY_OPENING_BALANCE_DRAFT);
  }, []);

  useEffect(() => {
    // security/page.tsxと同様、エフェクト本体での同期的なsetStateを避けるためマイクロタスク経由で呼び出す
    let cancelled = false;
    Promise.resolve().then(async () => {
      try {
        const tenantUser = await getMyTenantUser();
        if (cancelled) return;
        if (!tenantUser) {
          setState("unauthenticated");
          return;
        }
        setTenantId(tenantUser.tenant_id);
        await refresh(tenantUser.tenant_id);
        if (!cancelled) setState("ready");
      } catch (e) {
        if (cancelled) return;
        setLoadError(e instanceof Error ? e.message : "Supabaseが未設定です");
        setState("unconfigured");
      }
    });
    return () => {
      cancelled = true;
    };
  }, [refresh]);

  async function handleCreateAccount(name: string, accountType: AccountRow["account_type"]): Promise<AccountRow> {
    if (!tenantId) throw new Error("テナント情報が取得できていません");
    const account = await createAccount(tenantId, { name, account_type: accountType });
    setAccounts((prev) => [...prev, account]);
    return account;
  }

  if (state === "loading") {
    return <p className="text-sm text-muted-foreground">読み込み中…</p>;
  }

  if (state === "unconfigured") {
    return (
      <div className="border border-amber-300 bg-amber-50 text-amber-800 text-sm p-4">
        Supabaseが未設定のため、この画面はまだ利用できません（開発中のプロトタイプです）。
        {loadError && <span className="block mt-1 text-xs">{loadError}</span>}
      </div>
    );
  }

  if (state === "unauthenticated" || !tenantId) {
    return (
      <div className="border border-border bg-surface text-sm p-4 text-muted-foreground">
        ログインすると期首残高・固定資産・借入金を投入できます。
      </div>
    );
  }

  const assetAccounts = accounts.filter((a) => a.account_type === "asset");
  const liabilityAccounts = accounts.filter((a) => a.account_type === "liability");
  const expenseAccounts = accounts.filter((a) => a.account_type === "expense");

  return (
    <div className="flex flex-col gap-10">
      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">期首残高（現金・繰越利益剰余金）</h2>
        <p className="text-xs text-muted-foreground leading-relaxed max-w-2xl">
          前期末時点の貸借対照表をもとに、期首日・現金及び預金残高・繰越利益剰余金を入力してください。
          既に投入済みの場合は上書き保存されます（tenant_idにつき1行のみ保持します）。
        </p>
        <OpeningBalanceForm
          initialDraft={openingDraft}
          onSubmit={async (draft) => {
            await upsertCompanyOpeningBalance(tenantId, draftToOpeningBalanceInput(draft));
            setOpeningDraft(draft);
          }}
        />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">固定資産台帳</h2>
        <p className="text-xs text-muted-foreground leading-relaxed max-w-2xl">
          期首時点で既に保有している固定資産があれば登録してください（取得日は実際の取得日のままで構いません）。
          登録した資産は毎期の減価償却費が自動計算され、貸借対照表に反映されます。
        </p>
        {fixedAssets.length > 0 && (
          <TableScrollArea innerClassName="border border-border bg-surface">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground text-xs">
                  <th className="px-3 py-2 font-normal">資産名</th>
                  <th className="px-3 py-2 font-normal">取得日</th>
                  <th className="px-3 py-2 font-normal text-right">取得価額</th>
                  <th className="px-3 py-2 font-normal text-right">耐用年数</th>
                </tr>
              </thead>
              <tbody>
                {fixedAssets.map((a) => (
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
        )}
        <FixedAssetForm
          assetAccounts={assetAccounts}
          expenseAccounts={expenseAccounts}
          onCreateAccount={handleCreateAccount}
          onSubmit={async (input) => {
            const created = await createFixedAsset(tenantId, input);
            setFixedAssets((prev) => [...prev, created]);
          }}
        />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">借入金台帳</h2>
        <p className="text-xs text-muted-foreground leading-relaxed max-w-2xl">
          期首時点で返済中の借入金があれば登録してください（借入日は実際の借入日のままで構いません）。
          登録した借入金は毎月の元本・利息の返済仕訳が自動計算され、貸借対照表に反映されます。
        </p>
        {loans.length > 0 && (
          <TableScrollArea innerClassName="border border-border bg-surface">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground text-xs">
                  <th className="px-3 py-2 font-normal">借入先・借入名</th>
                  <th className="px-3 py-2 font-normal">借入日</th>
                  <th className="px-3 py-2 font-normal text-right">元本</th>
                  <th className="px-3 py-2 font-normal text-right">年利率</th>
                  <th className="px-3 py-2 font-normal text-right">返済期間</th>
                </tr>
              </thead>
              <tbody>
                {loans.map((l) => (
                  <tr key={l.id} className="border-b border-border/60 last:border-0">
                    <td className="px-3 py-2">{l.name}</td>
                    <td className="px-3 py-2 whitespace-nowrap tabular-nums">{l.start_date}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{yen.format(l.principal_amount)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{percent.format(l.interest_rate)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{l.term_months}ヶ月</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableScrollArea>
        )}
        <LoanForm
          liabilityAccounts={liabilityAccounts}
          expenseAccounts={expenseAccounts}
          onCreateAccount={handleCreateAccount}
          onSubmit={async (input) => {
            const created = await createLoan(tenantId, input);
            setLoans((prev) => [...prev, created]);
          }}
        />
      </section>
    </div>
  );
}
