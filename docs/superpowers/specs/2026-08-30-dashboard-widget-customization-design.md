# ダッシュボードのカスタマイズ機能 — タグ付け導線・並び替えのD&D化・予算実績ウィジェット

## 背景・目的

オーナーが実機を操作した際のフィードバック3件への対応:

1. 「タグ付け機能があるならダッシュボードでもタグ付けしたい」— `/tags`にしかタグ付け導線が無く、日々の記帳確認の場（ダッシュボード）から離れないとタグを付けられない。
2. 「ウィジェットの並び替えは設定でドラッグ&ドロップにしたい、ダッシュボードページの変更UIは削除」— 現状`dashboard/page.tsx`に上下ボタン式の並び替え・表示切替UI（`WidgetLayoutControls`）が直接埋め込まれており、日々見る画面が設定用UIで占有されている。
3. 「予算実績管理はダッシュボードのウィジェットに入れたい」— `/budget`は独立ページで、日常のダッシュボード確認フローに入っていない。

いずれも既存の実装（データモデル・永続化・計算ロジック）を再利用し、新しい仕組みを増やさない方針で対応する。

## スコープ

含む:
- ダッシュボードに「取引にタグを付ける」ウィジェットを追加する（`lib/tags/tagging.ts`・`lib/db/tags.ts`の既存タグ機構を再利用。新しいタグテーブル・型は作らない）
- ウィジェット並び替え・表示/非表示UIを`dashboard/page.tsx`から`settings/appearance`ページへ移設し、ドラッグ&ドロップ操作を追加する（永続化は既存の`localStorage`キー`sf.dashboard.widgetLayout.v1`をそのまま使う）
- ダッシュボードに「予算実績（概要）」ウィジェットを追加する（`lib/budget/budgetTracking.ts`の既存計算ロジックを再利用。`/budget`ページ自体は残し、詳細遷移先として使う）

含まない:
- 新しいタグ管理UI・タグの新規テーブル設計（既存`tags`/`tag_assignments`をそのまま使う）
- 予算設定値（`CategoryBudget[]`）自体の永続化（`/budget`ページも含め現状DB/localStorageに保存されておらず、この課題は本specの対象外。既定値`DEFAULT_CATEGORY_BUDGETS`を両画面で共有するに留める）
- サイドバーナビ（`appShellNav.ts`のNAV_GROUPS）の再編成（並行作業中のため、既存ナビ項目に手を加えない。`/budget`のナビエントリは変更しない）
- `/quick-estimate`ページ（別作業で削除予定のため触らない）

## 設計

### 1. タグ付けウィジェット（ダッシュボード新設）

`src/components/dashboard/TaggingWidget.tsx`を新設し、`dashboard/page.tsx`が既に保持している`transactions`（`useLedgerTransactions`由来）を渡す。

- `lib/tags/tagging.ts`の`findUntaggedAboveThreshold`で、重要性閾値（既定`DEFAULT_MATERIALITY_THRESHOLD`）以上の未タグ取引のうち直近の数件（5件）を抽出して一覧表示する。
- 各行にタグのチップ（チェックボックス型トグル）を並べ、クリックで`assignTag`/`unassignTag`（DB層は`lib/db/tags.ts`の同名関数）を呼び出す。テナント解決・フォールバックの流儀は`TagManagerClient.tsx`と同一（`getMyTenantUser()`が解決できればSupabase接続、できなければローカルstateのみで動作しサンプル運用）。
- タグそのものの作成・改名・削除フォームはウィジェットに持たせない（`TagManagerClient.tsx`の全機能をダッシュボードに複製すると情報量過多になるため）。タグが1件も無い場合は「/tagsでタグを作成してください」という案内とリンクのみを表示する。
- フッターに「/tagsで全件管理する」リンクを常設する。
- 新しいタグデータ型・新しいDB関数は作らない（`Tag`/`TagAssignment`/`TaggableTransaction`と`lib/db/tags.ts`の既存関数をそのまま使う）。

判断理由: タグCRUD自体は`/tags`に残し、ダッシュボードには「今すぐ主要な未タグ取引にタグを付ける」というクイックアクションだけを置く設計とした。これはBenchmarkPanel等、既存ダッシュボードウィジェットが「概要+詳細は別ページ」という構成を踏襲している一貫性のある選択。

### 2. ウィジェット並び替えUIの`settings/appearance`への移設 + ドラッグ&ドロップ化

現状`src/lib/dashboard/widgetLayout.ts`（永続化ロジック、DOM非依存の純粋関数）と`src/components/dashboard/WidgetLayoutControls.tsx`（`useDashboardWidgetLayout`フック + 上下ボタンUI）が一体のファイルになっている。以下のように分割・移設する:

- `useDashboardWidgetLayout`フック（localStorage購読・書き込みの`useSyncExternalStore`実装）を`src/hooks/useDashboardWidgetLayout.ts`に切り出す（`hooks/useLedgerTransactions.ts`等、既存の「フックは`src/hooks/`に置く」規約に合わせる）。ロジック自体（parse/serialize等）は`lib/dashboard/widgetLayout.ts`から変更しない。
- `dashboard/page.tsx`は新しい`useDashboardWidgetLayout`から`layout`のみを読み取り、並び替えUI（`<WidgetLayoutControls />`）の描画をやめる。ページ上部の説明文に「ウィジェットの表示・並び替えは表示設定で変更できます」という1行と`/settings/appearance`へのリンクを追加し、機能が消えたのではなく移動したことが分かるようにする。
- `src/components/dashboard/WidgetLayoutControls.tsx`は`src/components/settings/DashboardWidgetOrderEditor.tsx`へリネーム・移設し、`settings/appearance/page.tsx`に配置する。
- ドラッグ&ドロップ実装: `package.json`に既存のD&Dライブラリは無いため、ネイティブHTML5 Drag and Dropイベント（`draggable`属性 + `onDragStart`/`onDragOver`/`onDrop`/`onDragEnd`）で実装する。新規ライブラリは追加しない。
- 既存の上下ボタン（`moveWidget`）と表示/非表示トグルはキーボード操作・アクセシビリティ用のフォールバックとして残す（D&Dはポインタ操作前提でキーボードのみのユーザーが操作できないため）。
- `lib/dashboard/widgetLayout.ts`に、D&D用の並び替え関数`reorderWidget(layout, sourceId, targetId)`を追加する（`sourceId`のエントリを取り除いたうえで`targetId`の直前に挿入する）。既存の`moveWidget`（1つ上下移動）は削除せず両方残す。
- 永続化キー（`DASHBOARD_WIDGET_LAYOUT_STORAGE_KEY = "sf.dashboard.widgetLayout.v1"`）・スキーマは変更しない。

判断理由: 「新しいストレージ機構を発明しない」という制約により、`localStorage`+`useSyncExternalStore`の既存実装をそのまま移設するだけに留めた。D&Dは要件通りネイティブHTML5 DnDで実装し、上下ボタンはキーボードアクセシビリティのために残す（削除するとキーボードユーザーの並び替え手段が無くなるため）。

### 3. 予算実績（概要）ウィジェット（ダッシュボード新設）

`src/lib/budget/budgetTracking.ts`に`DEFAULT_CATEGORY_BUDGETS`（現状`budget/page.tsx`内にローカル定義されている`DEFAULT_BUDGETS`と同内容）をエクスポートし、`budget/page.tsx`側はこの共有定数をインポートするよう変更する（重複定義の解消）。

`src/components/dashboard/BudgetSummaryWidget.tsx`を新設し、ダッシュボードの`transactions`を渡す:
- `compareBudgetToActual(DEFAULT_CATEGORY_BUDGETS, transactions, formatPeriod(new Date()))`で当月の予算vs実績を計算する（`/budget`ページと同じ関数・同じ既定予算を使用）。
- 予算合計・実績合計・予算超過カテゴリ数をStatTile相当のミニ表示で示す。
- 超過中のカテゴリを優先し、実績額の大きい順に上位4件をバー付きで一覧表示する（`/budget`ページのバー表示と同じ配色ルール = under/at/over budgetで緑・グレー・赤）。
- フッターに「/budgetで全科目を見る・予算を編集する」リンクを常設する。

判断理由: 予算設定自体の永続化が現状存在しない（`/budget`ページ自体もリロードで既定値に戻る）ため、ウィジェットも同じ既定値を使う「概要」に留め、予算編集フォームはウィジェットに持たせない。予算値の永続化は本specのスコープ外の別課題として扱う。

### 4. `lib/dashboard/widgetLayout.ts`へのウィジェットID追加

`DashboardWidgetId`に`"tagging"`・`"budgetSummary"`を追加し、`DASHBOARD_WIDGETS`配列の末尾に追記する（既存の並び順を変えない）。`parseWidgetLayout`は未知IDを無視し既知IDを末尾補完する設計に既になっているため、追加後も既存の保存済みレイアウト（旧バージョン）が壊れずに新ウィジェットが末尾に表示される。

## テスト方針

- `lib/dashboard/widgetLayout.test.ts`に新ウィジェットID追加後の`getDefaultWidgetLayout`の並び、`reorderWidget`の単体テストを追加する。
- `src/hooks/useDashboardWidgetLayout.ts`は既存`WidgetLayoutControls.tsx`同様、localStorageスタブを使ったテストを新設する（`dashboard/page.test.tsx`が既に持つ`createLocalStorageStub`パターンを踏襲）。
- `TaggingWidget.tsx`・`BudgetSummaryWidget.tsx`はそれぞれ、実データ/サンプルデータ双方でのレンダリング、タグ付与操作・予算超過表示のロジックをVitest + Testing Libraryで検証する。
- `budgetTracking.ts`に追加する`DEFAULT_CATEGORY_BUDGETS`はただの定数エクスポートであり、既存の`budgetTracking.test.ts`のテストは変更不要（`budget/page.tsx`が同じ値を参照するようになるだけで計算結果は変わらない）。
- `dashboard/page.test.tsx`は`WidgetLayoutControls`削除に伴う表示崩れが無いか確認し、必要なら既存テストを更新する。
- `npm test -- --run`と`npm run build`の両方がグリーンであることを確認してから完了とする。
