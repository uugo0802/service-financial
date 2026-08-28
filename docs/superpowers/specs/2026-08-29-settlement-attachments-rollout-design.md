# 決算書関連の残り2文書を実データ接続 — 別表十六・勘定科目内訳明細書/事業概況説明書

## 背景・目的

`docs/superpowers/specs/2026-08-28-page-data-rollout-design.md`完了後、ユーザーから「仕訳から決算書発行まで完全に終わっているか」との確認があり、調査の結果2件の未接続が見つかった。既存の計算ロジック・DBアクセス関数はいずれも実装済みで、UI側の配線だけが残っている（`page-data-rollout`specのWave1/2と同じ性質の作業）。

## 対象1: `depreciation-schedule/page.tsx`（別表十六・固定資産の減価償却明細）

現状、`SAMPLE_ASSETS`・`SAMPLE_ENTITY_NAME`・`SAMPLE_PERIOD`が完全にハードコードされており、`lib/db/fixedAssets.ts`（実装済み）にも`fixed_assets`テーブル（実装済み・DB適用済み）にも接続されていない。

接続に必要な関数は全て実装済み:
- `lib/db/fixedAssets.ts`の`listFixedAssets(tenantId)`: `FixedAssetRow[]`を返す
- 同ファイルの`toDepreciationAsset(row)`: `FixedAssetRow`を`lib/tax/depreciation.ts`の`Asset`型に変換する（`buildDepreciationScheduleForm()`の入力形）
- `lib/db/tenants.ts`の`getMyTenantUser()`・`getTenant()`: テナントID・会社名（`display_name`）の取得
- `FiscalPeriod`の算出は、`financial-statements/FinancialStatementsClient.tsx`と同じ「`buildProfitLossStatement(transactions)`が返す`pl.periodStart`/`pl.periodEnd`から組み立てる」方式に合わせる（実データの記帳期間に自動で追従させるため）。取引データ自体は`useLedgerTransactions`で取得する

`financial-statements`等の既存5〜6ページと同じ「テナント未解決・取得失敗時はサンプルのまま表示し、取得できたら差し替える」フォールバック方式に合わせること。

## 対象2: 勘定科目内訳明細書・法人事業概況説明書（D9・D10）

`lib/tax/accountBreakdownForm.ts`の`buildAccountBreakdownForms(rows: CategorizedTransaction[])`、`lib/tax/businessOverviewForm.ts`の`buildMonthlySalesTrend(rows: CategorizedTransaction[])`はいずれも実装・テスト済みだが、**この2つを実データで呼び出している認証後の画面が現状1つも無い**（`src/app/page.tsx`という未ログインのマーケティング用デモ画面が、訪問者が画面内でアップロードしたCSVに対して呼び出しているのみで、ログイン中のテナントの実際の記帳データとは無関係）。

`financial-statements/page.tsx`（決算書類）が既に`useLedgerTransactions`経由で実データの`CategorizedTransaction[]`を保持しているので、そこに2つの新しいセクション（または`FinancialStatementsClient.tsx`内の既存セクションと並ぶ形）として追加するのが最も自然。ページタイトル・説明文の「貸借対照表・株主資本等変動計算書・個別注記表」という記載も、勘定科目内訳明細書・法人事業概況説明書を含む形に更新すること。

表示の体裁（テーブルの見せ方等）は、`src/components/DocumentPreview.tsx`内の`accountBreakdown`・`businessOverview`タブの既存実装を参考にしてよいが、そちらは変更しないこと（マーケティングデモ用の別コンポーネントとして現状維持）。

## テスト方針

- `depreciation-schedule`: 既存の`financial-statements`等と同スタイルで、テナント未解決時はサンプル・解決後は実データに差し替わることをVitestで検証
- 新設する勘定科目内訳明細書・事業概況説明書セクションも同様に、`useLedgerTransactions`が返す実データがそのまま`buildAccountBreakdownForms`/`buildMonthlySalesTrend`に渡ることをテストする
- 既存の全Vitestスイート・`npm run lint`・`tsc --noEmit`・`npm run build`がグリーンのまま維持されること

## 未解決・実装時に判断してよい事項

- 勘定科目内訳明細書・事業概況説明書を`financial-statements`ページ内の新セクションにするか、別ページ（例: `/account-breakdown`）に分けるかは実装時の判断でよい。ただし新ページにする場合は`docs/superpowers/specs/2026-08-27-responsive-app-shell-design.md`のAppShell対象ページ・ナビグループ（「申告書・帳票」）に追加すること
