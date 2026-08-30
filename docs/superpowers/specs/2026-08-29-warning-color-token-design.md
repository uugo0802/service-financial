# 警告色（amber）のデザイントークン化

## 背景・目的

`2026-08-29-entry-auth-theme-nav-design.md`の実装（テーマ統一）で、全ページの配色をデザイントークン（`bg-background`・`bg-surface`・`border-border`・`text-muted-foreground`等）に置き換えたが、警告・注意喚起の色（amber系）だけは対応するトークンが存在せず対象外とした。

現状、amber色は各ページで`text-amber-800 dark:text-amber-300`のようにTailwindのハードコード`dark:`バリアントで個別に書かれている。しかし本プロジェクトのTailwind v4設定では、`dark:`バリアントは`prefers-color-scheme`（OSの設定）にのみ追従し、`/settings/appearance`の3択トグル（`data-theme`属性による明示的な上書き）には追従しない。そのため、ユーザーが明示的に「ダーク」または「ライト」を選択している場合、amber系の警告表示だけテーマ設定から取り残される。

## 対象ファイル（`amber-*` + `dark:`の組み合わせを確認済み）

- `src/app/settings/opening-balances/page.tsx`
- `src/app/monthly-close-checklist/MonthlyCloseChecklistPanel.tsx`
- `src/app/payment-reminders/page.tsx`
- `src/app/depreciation-schedule/page.tsx`
- `src/app/statutory-report-summary/StatutoryReportSummaryTable.tsx`
- `src/app/statutory-report-summary/page.tsx`
- `src/app/pricing/page.tsx`
- `src/app/onboarding/page.tsx`
- `src/app/budget/page.tsx`

（上記は`amber`+`dark:`の組み合わせで機械的に検索した結果。実装時に他の色（`red-`等、警告目的でamberの代わりに使われているもの）が見つかった場合は同様に扱ってよい）

## スコープ

**含む**:
- `globals.css`に警告用トークン（`--warning`・`--warning-foreground`・`--warning-border`等、命名は実装時に既存の`--accent`等の命名規則に揃えて決めてよい）を追加し、`:root`・`@media (prefers-color-scheme: dark)`・`:root[data-theme="dark"]`・`:root[data-theme="light"]`の4箇所に定義する（既存の`--background`等と同じパターン）
- 上記9ファイルの`amber-*`ハードコード配色（`bg-amber-50 dark:bg-amber-950`等）を新規トークンに置き換える

**含まない**:
- amber以外の色（`red-700`等でエラー表示に使っているもの）の一斉トークン化。今回は「テーマ切替に追従しない」という実害が確認できているamber系のみを対象とする
- 上記9ファイル以外で今後new追加されるamber使用箇所の対応（本specの対象は現時点で確認済みの9ファイルのみ）
- **`src/app/depreciation-schedule/page.tsx`・`src/app/statutory-report-summary/page.tsx`の、`DocumentPreviewFrame`（別表十六・法定調書合計表の書類プレビュー）の子として描画される`<section>`内にあるamber文言**（2026-08-31追記）。`src/components/ui/DocumentPreviewFrame.tsx`のコメントに明記の通り、書類プレビューの子孫は常にライト固定色（`amber-700`等）を使う必要があり、`text-warning-foreground`等のトークンクラスを使うとダークモード時に固定白背景の紙面でコントラストが崩れる。実際に一度誤ってトークン化され、2026-08-31に`amber-700`へ差し戻した実害があるため、今後もこの2箇所は対象外として扱うこと。同じファイル内でも`DocumentPreviewFrame`の外側（ヘッダー・フッター等）は通常通りトークン化してよい。

## テスト方針

- 既存の全テストがグリーンのまま維持されること
- 視覚的な変更のみのため、新規テスト追加は必須としない
