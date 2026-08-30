// AppShell（共通ナビゲーションシェル）が使うナビゲーション構成と、
// 「どのページにAppShellを適用するか」の判定ロジック。
//
// このモジュール自体はReact/ブラウザAPIに依存しない純粋なデータ・関数のみで構成する
// （lib/dashboard/widgetLayout.tsと同様の方針: ロジックをUIから分離し、Vitestで
// 単体テストしやすくする）。実際の描画は components/AppShell.tsx が行う。

export interface NavLink {
  /** リンク先のパス（Next.jsのLinkのhrefにそのまま渡す） */
  href: string;
  /** ナビゲーション上に表示するラベル */
  label: string;
}

export interface NavGroup {
  /** グループの見出しラベル */
  label: string;
  links: NavLink[];
}

/**
 * AppShell（ハンバーガー→ドロワー/常時サイドバー）を適用しないページのパス一覧。
 * ランディング・認証・法務・スタンドアロン系のページで、これらは独自のヘッダー/フッターを
 * 持つため、共通ナビゲーションシェルでラップしない
 * （docs/superpowers/specs/2026-08-27-responsive-app-shell-design.md 参照）。
 */
export const APP_SHELL_EXCLUDED_PATHS: readonly string[] = [
  "/",
  "/login",
  "/reset-password",
  "/onboarding",
  "/pricing",
  "/privacy",
  "/terms",
  "/faq",
  "/early-access",
  "/tokushoho",
  "/offline",
  "/invite",
  "/auth/confirm",
];

/**
 * 認証なしでもアクセスできるパス（docs/superpowers/specs/2026-08-29-entry-auth-theme-nav-design.md ①）。
 * AppShell対象外パスと同一の考え方だが、意味が異なる（「chromeを描画しない」ではなく
 * 「middlewareでログインを要求しない」）ため、値は同じでも別の定数として公開する
 * （将来どちらかだけを変更したくなった場合に混同しないため）。
 */
export const AUTH_EXEMPT_PATHS: readonly string[] = APP_SHELL_EXCLUDED_PATHS;

export function isAuthExemptPath(pathname: string): boolean {
  return AUTH_EXEMPT_PATHS.includes(pathname);
}

/**
 * 指定のパスがAppShell対象外（ラップしない）かどうかを判定する。
 * 完全一致のみで判定する（例: "/settings" は対象、"/settings/team" のような
 * サブページは別途NAV_GROUPSに個別のリンクとして定義済みで、いずれも対象外リストには
 * 含まれない＝AppShellでラップする）。
 */
export function isAppShellExcludedPath(pathname: string): boolean {
  return APP_SHELL_EXCLUDED_PATHS.includes(pathname);
}

/**
 * ナビゲーションのグループ分け（初期案）。
 * docs/superpowers/specs/2026-08-27-responsive-app-shell-design.md の
 * 「ナビゲーション構成」に定義された初期案に沿う（表示順・グルーピングは実装時に微調整可）。
 * `settings/opening-balances` は上記スペックのグループ一覧に明記されていなかったが、
 * 導線を確保するため「設定」グループに追加した。
 */
export const NAV_GROUPS: readonly NavGroup[] = [
  {
    label: "ダッシュボード",
    links: [{ href: "/dashboard", label: "ダッシュボード" }],
  },
  {
    label: "記帳・仕訳",
    links: [
      { href: "/transactions", label: "取引明細" },
      { href: "/journal", label: "仕訳入力" },
    ],
  },
  {
    label: "資産・負債",
    links: [
      { href: "/assets", label: "固定資産台帳" },
      { href: "/depreciation-schedule", label: "減価償却明細（別表十六）" },
      { href: "/budget", label: "予算実績管理" },
      { href: "/expense-allocation", label: "按分計算" },
    ],
  },
  {
    label: "決算書類",
    links: [
      { href: "/financial-statements", label: "決算書類" },
      { href: "/trial-balance", label: "試算表" },
      { href: "/general-ledger", label: "総勘定元帳" },
    ],
  },
  {
    label: "税務判定ツール",
    links: [
      { href: "/high-value-asset-status", label: "高額特定資産チェック" },
      { href: "/simplified-taxation", label: "簡易課税判定" },
      { href: "/taxable-status", label: "課税事業者判定" },
      { href: "/housing-loan-deduction", label: "住宅ローン控除" },
      { href: "/entertainment-expense-limit", label: "交際費の損金限度額" },
      { href: "/apportionment", label: "経費按分計算" },
      { href: "/stamp-duty-checker", label: "印紙税チェック" },
    ],
  },
  {
    label: "概算・納税スケジュール",
    links: [
      { href: "/resident-tax-estimate", label: "住民税概算" },
      { href: "/side-income-estimate", label: "副業所得概算" },
      { href: "/estimated-tax", label: "予定納税" },
      { href: "/interim-payment", label: "中間納付リマインダー" },
      { href: "/corporate-interim-tax", label: "法人中間申告" },
      { href: "/deadlines", label: "申告期限" },
    ],
  },
  {
    label: "請求・給与",
    links: [
      { href: "/invoices", label: "請求書" },
      { href: "/quotes", label: "見積書" },
      { href: "/payment-reminders", label: "支払督促メール" },
      { href: "/payroll", label: "給与・賞与計算" },
      { href: "/family-employee", label: "専従者給与チェック" },
      { href: "/withholding-slip", label: "源泉徴収票" },
      { href: "/statutory-report-summary", label: "法定調書合計表" },
      { href: "/payment-report", label: "支払調書" },
      { href: "/withholding-credit-reconciliation", label: "源泉徴収税額突合" },
    ],
  },
  {
    label: "その他",
    links: [
      { href: "/documents", label: "証憑検索" },
      { href: "/export", label: "CSVエクスポート" },
      { href: "/audit-log", label: "監査ログ" },
      { href: "/history", label: "アーカイブ履歴" },
      { href: "/search", label: "横断検索" },
      { href: "/migrate", label: "他社データ移行" },
      { href: "/recommendations", label: "おすすめサービス" },
      { href: "/notifications", label: "通知" },
      { href: "/reminders", label: "タスクリマインダー" },
      { href: "/monthly-close-checklist", label: "月次締めチェックリスト" },
      { href: "/pension-savings-simulator", label: "iDeCo・小規模企業共済" },
      { href: "/reconcile", label: "口座残高照合" },
      { href: "/invoice-reconciliation", label: "入金消込" },
    ],
  },
  {
    label: "パートナー",
    links: [
      { href: "/partner-referral", label: "パートナー紹介" },
      { href: "/advisor-referral", label: "税理士紹介" },
      { href: "/advisor-access", label: "顧問アクセス" },
      { href: "/clients", label: "取引先マスタ" },
    ],
  },
  {
    label: "設定",
    links: [
      { href: "/settings", label: "事業者設定" },
      { href: "/settings/appearance", label: "表示設定" },
      { href: "/settings/opening-balances", label: "期首残高等の登録" },
      { href: "/settings/billing", label: "プラン・お支払い" },
      { href: "/settings/security", label: "セキュリティ" },
      { href: "/settings/team", label: "チーム" },
      { href: "/categorize-rules", label: "仕訳ルール" },
      { href: "/tags", label: "タグ別収益性" },
      { href: "/rule-backfill", label: "ルール一括再適用" },
      { href: "/logout", label: "ログアウト" },
    ],
  },
];

/**
 * 現在のパスがナビゲーションリンクの「表示中」項目かどうかを判定する。
 * リンク先ちょうどのページに加え、そのサブページ（例: "/settings" のリンクに対する
 * "/settings/security"）でも一致とみなす。ただし他のリンクの前方一致に誤爆しないよう
 * "/settings/team" のように別リンクとして個別定義済みのパスは、そのリンク自身の
 * 完全一致でのみ afford する（NAV_GROUPS内で最長一致するリンクのみを呼び出し側が
 * 選ぶことを想定し、ここでは単純な1リンクとの一致判定のみを提供する）。
 */
export function isNavLinkActive(pathname: string, href: string): boolean {
  if (pathname === href) return true;
  if (href === "/") return false;
  return pathname.startsWith(`${href}/`);
}

/**
 * 現在のパスに対応するナビゲーションリンクのラベルを返す（一致するリンクがなければnull）。
 * `isNavLinkActive()`で一致する全リンクのうち、hrefが最長（＝最も具体的）のものを採用する
 * （例: "/settings/security" は "/settings"（事業者設定）にも前方一致するが、
 * より具体的な "/settings/security"（セキュリティ）を優先する）。
 */
export function getActiveNavLabel(pathname: string): string | null {
  const allLinks = NAV_GROUPS.flatMap((group) => group.links);
  const matches = allLinks.filter((link) => isNavLinkActive(pathname, link.href));
  if (matches.length === 0) return null;
  return matches.reduce((best, link) => (link.href.length > best.href.length ? link : best)).label;
}
