# レスポンシブ対応 — 共通ナビゲーションシェル＋全ページ適用

## 背景・目的

[[design_refresh_followup]]（ユーザーが実機相当のChrome 390×844でダッシュボードを検証し発見）: `/dashboard`の「年度別 経営指標」テーブルが横あふれし、スマホで正しく表示されない。原因調査の結果、`KpiTrendPanel.tsx`側は`overflow-x-auto`を持つが、祖先のflex/gridコンテナがデフォルトの`min-width: auto`によりテーブルの内在幅まで広がってしまい、ページ全体が横スクロールしてしまう（Tailwind/flexboxの典型的な罠）。

さらに調査で、**現状どのページにも他ページへの`<Link>`が一切ない**ことが判明した（`dashboard`から`/search`等への導線もゼロ）。71ルートすべてがURL直打ちでしか到達できない状態であり、スマホ以前にPCでも「アプリ内を移動する」導線がない。ユーザーは「ゆくゆくスマホから使えるレスポンシブウェブアプリにしたい」との意向を明言しており、レスポンシブ対応と共通ナビゲーションはセットで対応する（ページ遷移導線は必須、と明確に指示された）。

`docs/superpowers/specs/2026-08-24-design-refresh-foundation-design.md`（実装・マージ済み）は意図的にダッシュボード1画面だけにトークン・コンポーネント基盤を適用し、「全ページへの展開は別スペックで」とスコープアウトしていた。本スペックがその「別スペック」にあたる。ただし今回はユーザーの指示により、最初から全画面を対象とする（design-refresh-foundationのような段階分けはしない）。

## スコープ

**含む**:
- `AppShell`（モバイル: ハンバーガー→ドロワー、`md`(768px)以上: 常時サイドバー）を`app/src/app/layout.tsx`に1箇所差し込み、下記「AppShell対象ページ」全てに自動適用する
- `components/ui/PageContainer.tsx`（新規）: 現在各ページで手書きされている`mx-auto max-w-5xl px-6 py-10`相当を共通化し、レスポンシブなpadding/max-widthを内包する
- テーブル用ラッパーコンポーネント（新規、`components/ui/`）: `overflow-x-auto`と、祖先のflex/gridアイテムに`min-w-0`を強制する構造で、上記の横あふれバグを構造的に再発防止する
- `components/ui/DocumentPreviewFrame.tsx`（新規）: 申告書・帳票等の固定レイアウトプレビュー用。中身はA4相当の固定幅を維持したまま、フレーム自体は横スクロール可能にする。既存の「常にライト固定」ルール（design-refresh-foundation）はそのまま踏襲する
- 対象ページ（後述）を`PageContainer`（または`DocumentPreviewFrame`）でラップし、グリッド/フレックスに`sm:`/`md:`のTailwindデフォルトブレークポイントでレスポンシブ差分を適用する

**含まない（別スペックで対応、または対象外）**:
- 下記「AppShell対象外ページ」のレスポンシブ対応（別途判断）
- グラフの配色・SVG描画ロジック自体の変更（`design-refresh-foundation`と同様、`.viz-dashboard`は対象外）
- 色・タイポグラフィのさらなる調整（[[design_refresh_followup]]に別途「色・フォントは継続チューニング中」の記録あり。本スペックはレイアウトのみ）
- オフライン/PWA関連の追加対応（`/offline`は対象外ページ）

## AppShell対象ページ／対象外ページ

**対象外（ランディング・認証・法務・スタンドアロン、AppShellでラップしない）**:
`/`（トップ）, `/login`, `/reset-password`, `/onboarding`, `/pricing`, `/privacy`, `/terms`, `/faq`, `/early-access`, `/tokushoho`, `/offline`, `/invite`

**対象（上記以外の全74ルート中62ルート、AppShellでラップする）**:
`/dashboard`を含む残り全ページ（`/settings`配下のサブページ含む）。実装エージェントは`find src/app -name page.tsx`等で機械的に対象外リストとの差分を取り、対象ページ一覧を確定させること。

## 書類プレビュー系ページの判定基準

個別のページ名を人力でリストアップして「書類プレビュー系」と決め打ちしない。既に`components/`に存在する印刷・プレビュー系コンポーネント（`PrintableStatementLayout.tsx`・`InvoicePrintLayout.tsx`・`QuotePrintLayout.tsx`・`DocumentPreview.tsx`など、A4相当の固定幅で申告書・帳票・請求書等を模しているもの）を**import しているページは`DocumentPreviewFrame`で包む**。それ以外の対象ページは`PageContainer`＋レスポンシブグリッド/テーブルラッパーの通常適用とする。この基準に当てはまらない新規パターンが見つかった場合は、実装エージェントが個別に判断し、レポートに記載すること（税務書式の見た目に関わる判断を勝手に変えない、という既存ルールに準じる）。

## ナビゲーション構成

- ブレークポイント: Tailwindデフォルトの`md`(768px)を境に、未満はハンバーガー→ドロワー、以上は常時表示の左サイドバーとする
- リンク一覧はグループ分けする（初期案。実装時の並び替え・グルーピング微調整は許容する）:
  - ダッシュボード
  - 記帳・仕訳（transactions, journal, general-ledger, categorize-rules, tags, reconcile, invoice-reconciliation, rule-backfill, migrate）
  - 資産・負債（assets, depreciation-schedule, budget, expense-allocation）
  - 申告書・帳票（financial-statements, trial-balance, blue-return-application, statutory-report-summary, withholding-slip, apportionment, entertainment-expense-limit, high-value-asset-status, housing-loan-deduction, corporate-interim-tax, simplified-taxation, taxable-status, resident-tax-estimate, side-income-estimate, estimated-tax, interim-payment, withholding-credit-reconciliation, payment-report, business-commencement-notification, corporate-establishment-notification, invoice-registration-application）
  - 請求・給与（invoices, quotes, payment-reminders, payroll, family-employee）
  - 分析・通知（recommendations, deadlines, notifications, reminders, monthly-close-checklist, pension-savings-simulator, furusato-nozei, stamp-duty-checker）
  - パートナー（partner-referral, advisor-referral, advisor-access, clients）
  - その他（documents, export, audit-log, history, search）
  - 設定（settings, settings/appearance, settings/billing, settings/security, settings/team）
- ドロワー/サイドバーは現在ログイン中のテナント名等は表示しない（既存のヘッダー領域の役割と重複させない。ロゴ＋メニューのみ）

## 実装順序

`docs/superpowers/service-financial-spec-driven-routine`は1スペック=1worktreeエージェントで処理する。本スペックは以下の順で1エージェント内で進めることを想定する（依存関係が直列のため）:

1. `AppShell`・`PageContainer`・テーブルラッパー・`DocumentPreviewFrame`を新規実装し、Vitestで単体テストを追加する
2. `layout.tsx`に`AppShell`を差し込む（対象外ページは`AppShell`側でパス名判定して素通しするか、対象外ページ側で明示的にラップを外す仕組みのどちらか実装しやすい方でよい）
3. `/dashboard`を`PageContainer`＋テーブルラッパーに置き換え、[[design_refresh_followup]]で報告された横あふれバグが解消することを確認する
4. 残りの対象ページを機械的にロールアウトする

## テスト方針

- `AppShell`: ドロワーの開閉、リンク一覧の存在、`md`未満/以上でのレンダリング分岐をVitest（+ Testing Library等、既存の依存で足りるもの）でテストする
- `PageContainer`・テーブルラッパー・`DocumentPreviewFrame`: 単純なラッパーなので、propsが正しく子要素に渡ること程度の軽量テストでよい
- 既存の全Vitestスイートがグリーンのまま維持されること
- `npm run lint`・`tsc --noEmit`がクリーンであること
- 開発サーバー上で、iPhone相当のビューポート（390×844）で最低限`/dashboard`・書類プレビュー系1ページ・通常アプリページ1ページを目視確認し、横あふれが発生しないことを確認する

## 未解決・実装時に判断してよい事項

- 対象ページ数が多いため（62ページ）、1回のworktreeエージェントセッションで全て完了しない可能性がある。完了しなかった場合は、実装済みページと未実装ページをレポートに明記し、未実装分は次回以降のルーティン実行で本スペックが「未完了」と判定されて再度キューに入ることを期待する（スペックファイル自体は編集しないルールのため、進捗管理はコードの実装状況で判断する）
- ナビゲーションのグループ分け・表示順は上記初期案から実装時に微調整してよい
- 対象外ページ（マーケティング・認証系）に将来的に軽量なレスポンシブ対応が必要かどうかは、本スペックのスコープ外として別途判断する
