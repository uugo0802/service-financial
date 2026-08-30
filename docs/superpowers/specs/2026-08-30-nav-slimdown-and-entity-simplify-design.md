# サイドバーIA刷新・entity_type選択UIの全撤去

## 背景・目的

オーナー(修吾)が実機（本番URL）を継続的に操作した中で、`meeting_minutes/spec_left`にまとめられた24件のフィードバックのうち、以下がまだ未着手だった（誤字修正・ロゴ導線・青色申告承認申請書のナビ削除・ダークモード全面対応・Google認証追加・設定直下へのログアウト追加は別途対応済み）。

1. **サイドバーの項目が多すぎて、どこから入力すればいいか分からない**（フィードバック#1, #2, #3, #4, #9, #13, #16, #22, #24）。現状9グループ・62リンクで、特に「記帳・仕訳」（10件）と「申告書・帳票」（20件）が突出している。詳細な現状分析と絞り込み案は`meeting_minutes/nav-slimdown-proposal.pdf`にまとめ、オーナーと合意済み。
2. **「概算シミュレーション（お試し）」の位置づけが不明瞭**（フィードバック#10, #11）。コードを確認したところ、このページ(`/quick-estimate`)はSupabaseへの書き込みを一切行わない、認証導入前の初期MVPの名残であり、実際のCSV一括取込は`/transactions`に別途実装済みで機能が重複している。オーナーの最終判断は「削除。お試しでもアカウント登録は必須にする」。
3. **他社データ移行フォームの手動選択が冗長**（フィードバック#17）。コードを確認したところ自動判定は既に実装済みで機能しており、常時表示されている「自動判定/freee/MF」の3ボタンは自動判定が効かなかった場合のフォールバックとしてのみ必要。
4. **法人/個人事業主の選択がマイクロ法人ユーザーにとって混乱を招く**（フィードバック#7を発端とする議論の結論）。調査の結果、`tenants.entity_type`（`individual`/`corp`）は既にDBスキーマ上必須カラムとして存在し、オンボーディングウィザードの最初のステップ・設定画面・複数のツールページ（ふるさと納税シミュレーター・インボイス登録申請書・課税事業者判定・パートナー紹介・税理士紹介・通知・申告期限）で選択UIとして使われていた。オーナーの最終判断は「UIからこの選択ボタンを全て無くし、シンプルにする」。現在の利用者・想定利用者は全員マイクロ法人のため、値は`corp`固定でよい。

これらをまとめて1本のspecとして実装する。

## スコープ

**含む**:
- サイドバーのUI機構修正（sticky化・カテゴリ見出しの拡大・ダッシュボードグループの解体・ヘッダーの現在ページ名表示・アコーディオン単一展開）
- `NAV_GROUPS`の再編成（後述の最終構成に置き換え）
- `/quick-estimate`（概算シミュレーション）の完全削除（ページ・ルート・ナビ項目）
- 他社データ移行フォーム（`MigrationImportForm.tsx`）の自動判定失敗時のみ手動選択を表示する方式への変更
- `entity_type`の選択UI（オンボーディング・設定・各種ツールページ）を全て撤去し、値を`corp`固定にする
- 上記の結果、機能として意味をなさなくなる「ふるさと納税」ページのナビからの除外

**含まない**:
- `entity_type`の値そのもの・DBスキーマ（`tenants.entity_type`列）・`individual`向けの計算ロジック（`furusatoNozeiSimulator.ts`・`taxableStatusDetermination.ts`・`deadlines.ts`・`invoiceRegistrationApplicationForm.ts`・`weeklyDigest.ts`・`partnerReferral.ts`・`referralForm.ts`等）の削除。UIから選択できなくするだけで、関数自体は`individual`分岐を残したまま変更しない（将来また必要になった場合に備える。YAGNIよりも「既存の分岐ロジックを壊さない」を優先する）
- 「開業・設立」系（開業届・法人設立届出書一式・インボイス登録申請書）のページ削除。ナビからの除外のみ（青色申告承認申請書と同じ扱い）
- 「申告書・帳票」以外のグループ（記帳・仕訳・資産・負債・請求・給与・パートナー・その他・設定）の中身の見直し（今回のナビ再編成で移動先として使うのみ）
- 家事按分の仕訳入力ページへの統合（#21）、仕訳・固定資産台帳入力の統合（#18）。これらは別spec（入力導線の統合）で扱う
- 別表十六の印刷不具合・フォーマット・Excel/CSV出力対応（#19）。これも別spec（別表十六の印刷/出力）で扱う

## 設計

### ① サイドバーのUI機構修正

`src/components/AppShell.tsx`を対象に以下を変更する。

- **sticky化**: サイドバーの`<nav>`（またはその親要素）に`sticky top-0 h-screen overflow-y-auto`相当のクラスを追加し、メインコンテンツをスクロールしてもサイドバーの位置が固定されるようにする
- **カテゴリ見出しのフォントサイズ拡大**: グループ見出しのクラスを現状の`text-xs`相当から`text-sm`（またはそれ以上）に変更する
- **ダッシュボードグループの解体**: `NAV_GROUPS`の最初の要素（`label: "ダッシュボード"`、リンク1件のみ）は、グループ見出しを表示せず「ダッシュボード」単独のリンクとして描画する。`NavGroupList`の描画ロジックに「リンクが1件かつ`label`がグループ名と同一」のグループはグループ見出しなしで描画する特別扱いを追加する
- **ヘッダーの現在ページ名表示**: 新規関数`getActiveNavLabel(pathname: string): string | null`を`src/lib/navigation/appShellNav.ts`に追加する。全`NAV_GROUPS`のリンクを走査し、既存の`isNavLinkActive()`で最初に一致したリンクの`label`を返す（一致なしなら`null`）。`AppShell`の各ページヘッダーで、この結果が非nullならページタイトル文言の代わりに表示する。ヘッダー自体は各ページ（`page.tsx`）側に個別実装されているため、この関数は`AppShell`が子要素に`context`やpropsで渡す形ではなく、各ページヘッダーが自分で`usePathname()` + `getActiveNavLabel()`を呼ぶ形にする（既存のヘッダー実装パターンを踏襲し、大規模なリファクタは避ける）
- **アコーディオン単一展開**: 「どれか1つのグループを開いたら、それ以外のグループは必ず全て閉じる」という制約を持たせる。実装は`AppShell.tsx`の開閉状態管理を`useState<Set<string>>`（複数グループを独立して開閉できる現状の実装）から`useState<string | null>`（展開中グループのlabelを常に1つだけ保持。複数同時展開は状態として表現できなくする）に変更することで担保する。グループ見出しクリック時、クリックしたグループが既に展開中ならnullに、そうでなければそのグループのlabelに置き換える（＝他に開いていたグループがあれば、置き換えと同時に必ず閉じる）。初期状態は現在アクティブなページを含むグループのみ展開（既存の`2026-08-29-entry-auth-theme-nav-design.md`で実装済みの自動展開ロジックを踏襲）

### ② `NAV_GROUPS`の再編成

`src/lib/navigation/appShellNav.ts`の`NAV_GROUPS`を以下の最終構成に置き換える。

```
ダッシュボード
  - ダッシュボード

記帳・仕訳
  - 取引明細        (/transactions)
  - 仕訳入力        (/journal)

資産・負債            ※変更なし
  - 固定資産台帳
  - 減価償却明細（別表十六）
  - 予算実績管理
  - 家事按分

決算書類              ※「申告書・帳票」から分割
  - 決算書類          (/financial-statements)
  - 試算表           (/trial-balance)
  - 総勘定元帳        (/general-ledger、記帳・仕訳から移動)

税務判定ツール         ※新設、「申告書・帳票」「分析・通知」から集約
  - 高額特定資産チェック (/high-value-asset-status)
  - 簡易課税判定       (/simplified-taxation)
  - 課税事業者判定     (/taxable-status)
  - 住宅ローン控除     (/housing-loan-deduction)
  - 交際費の損金限度額 (/entertainment-expense-limit)
  - 経費按分計算       (/apportionment)
  - 印紙税チェック     (/stamp-duty-checker、分析・通知から移動)

概算・納税スケジュール  ※新設、「申告書・帳票」「分析・通知」から集約
  - 住民税概算        (/resident-tax-estimate)
  - 副業所得概算       (/side-income-estimate)
  - 予定納税          (/estimated-tax)
  - 中間納付リマインダー (/interim-payment)
  - 法人中間申告       (/corporate-interim-tax)
  - 申告期限          (/deadlines、分析・通知から移動)

請求・給与             ※「申告書・帳票」の給与・法定調書系を統合
  - 請求書           (/invoices)
  - 見積書           (/quotes)
  - 支払督促メール     (/payment-reminders)
  - 給与・賞与計算     (/payroll)
  - 専従者給与チェック  (/family-employee)
  - 源泉徴収票        (/withholding-slip、申告書・帳票から移動)
  - 法定調書合計表     (/statutory-report-summary、申告書・帳票から移動)
  - 支払調書          (/payment-report、申告書・帳票から移動)
  - 源泉徴収税額突合    (/withholding-credit-reconciliation、申告書・帳票から移動)

その他                ※「分析・通知」を解体して統合
  - 証憑検索          (/documents)
  - CSVエクスポート    (/export)
  - 監査ログ          (/audit-log)
  - アーカイブ履歴     (/history)
  - 横断検索          (/search)
  - 他社データ移行     (/migrate、記帳・仕訳から移動)
  - おすすめサービス    (/recommendations、分析・通知から移動)
  - 通知             (/notifications、分析・通知から移動)
  - タスクリマインダー  (/reminders、分析・通知から移動)
  - 月次締めチェックリスト (/monthly-close-checklist、分析・通知から移動)
  - iDeCo・小規模企業共済 (/pension-savings-simulator、分析・通知から移動)
  - 口座残高照合       (/reconcile、記帳・仕訳から移動)
  - 入金消込          (/invoice-reconciliation、記帳・仕訳から移動)

パートナー             ※変更なし
  - パートナー紹介
  - 税理士紹介
  - 顧問アクセス
  - 取引先マスタ

設定                  ※仕訳関連の設定系を統合
  - 事業者設定
  - 表示設定
  - 期首残高等の登録
  - プラン・お支払い
  - セキュリティ
  - チーム
  - 仕訳ルール         (/categorize-rules、記帳・仕訳から移動)
  - タグ別収益性       (/tags、記帳・仕訳から移動)
  - ルール一括再適用    (/rule-backfill、記帳・仕訳から移動)
  - ログアウト         (/logout、既存)
```

**ナビから除外する（ページ・ルートは残す。青色申告承認申請書と同じ扱い）**:
- 開業届 (`/business-commencement-notification`)
- 法人設立届出書一式 (`/corporate-establishment-notification`)
- インボイス登録申請書 (`/invoice-registration-application`)
- ふるさと納税 (`/furusato-nozei`) — ③の`entity_type`固定化により、常に「法人のため対象外」の結果しか返さなくなるため

**完全削除する（ページ・ルート・ナビ項目とも）**:
- 概算シミュレーション（お試し） (`/quick-estimate`)

### ③ `/quick-estimate`の削除

- `src/app/quick-estimate/`ディレクトリを削除する
- `src/lib/navigation/appShellNav.ts`の`NAV_GROUPS`から該当リンクを削除する（②の最終構成に反映済み）
- `src/app/page.tsx`内のコメント（`// /quick-estimate に移設済み...`）を、削除の経緯が分かる内容に更新する
- 削除後、「お試しでもアカウント登録は必須」という方針に矛盾する導線（未ログインで試せる旨の文言等）が他ページ（`/pricing`等のランディング系）に残っていないか確認し、あれば併せて削除する

### ④ 他社データ移行フォームの簡素化

`src/components/MigrationImportForm.tsx`を変更する。

- 現状: 「自動判定 / freee / MF」の3ボタン（`FormatButton`）を常時表示し、ユーザーが毎回選択する
- 変更後: ボタン群を初期状態では非表示にし、常に`formatOverride = "auto"`でCSVパースを試みる。自動判定が失敗した場合（現状の`parsed`が`null`になるケース）にのみ、既存のエラーメッセージに加えて「freee形式ですか？MF形式ですか？」の選択肢（従来のボタン群）を表示する
- 自動判定に成功した場合のボタン群は完全に非表示のままでよい（表示条件: 判定失敗後の再アップロード時のみ）

### ⑤ `entity_type`選択UIの全撤去

以下11ファイルから選択UI（ラジオボタン・トグルボタン・セレクトボックス）を削除し、値を固定する。**下記の関数・型（`EntityType`、`taxableStatusDetermination.ts`等の計算ロジック本体）は変更しない** — UIコンポーネント側で渡す値を固定するだけにとどめる。

| ファイル | 対応 |
|---|---|
| `src/lib/db/tenants.ts` | `EMPTY_TENANT_PROFILE_DRAFT.entityType`のデフォルト値を`"individual"`から`"corp"`に変更 |
| `src/lib/onboarding/steps.ts` | `ONBOARDING_STEPS`から`"entityType"`ステップを削除（`["fiscalYear", "blueReturn", "review"]`に） |
| `src/components/OnboardingWizard.tsx` | `definition.id === "entityType"`の分岐（選択UI）を削除。ステップ自体が無くなるため到達しなくなるが、コードとしても削除する |
| `src/components/TenantSettingsForm.tsx` | `entityType`のセレクトボックスを削除。フォーム送信時は常に`"corp"`を使う |
| `src/components/FurusatoNozeiSimulatorForm.tsx` | `entityType`のトグルUIを削除し、`useState`の初期値を固定値`"corporation"`に（`setEntityType`呼び出し自体を削除） |
| `src/components/QualifiedInvoiceApplicationForm.tsx` | 同様に`"corporation"`固定（このページ自体は②でナビから除外済みだが、直接URLでの利用に備えてUIは統一しておく） |
| `src/components/PartnerReferralForm.tsx` | `entityType`のトグルボタンを削除し、`"corp"`固定 |
| `src/components/AdvisorReferralForm.tsx` | 同様に`"corp"`固定 |
| `src/components/TaxableStatusChecker.tsx` | `entityType`のラジオボタンを削除し、`"corporation"`固定 |
| `src/app/notifications/page.tsx` | `entityType`のトグルUIを削除し、`"corporate"`固定 |
| `src/app/deadlines/page.tsx` | `entityType`のトグルボタンを削除し、`"corporate"`固定 |

**注意**: 型ごとに固定すべきリテラル値が異なる（`"corp"` / `"corporation"` / `"corporate"`）。実装時は各ファイルの既存の型定義（`EntityType`、`FurusatoNozeiEntityType`、`InvoiceRegistrationEntityType`等）を確認し、対応するリテラルを使うこと。

## テスト方針

- `appShellNav.test.ts`: 新しい`NAV_GROUPS`構成（グループ数・各グループの中身）のテストを更新。新規`getActiveNavLabel()`の単体テストを追加（一致あり・一致なし・サブページ一致の3パターン）
- `AppShell.test.tsx`: sticky化はCSSクラスの存在確認、アコーディオン単一展開（別グループを開くと元のグループが閉じる）、ダッシュボードグループがグループ見出しなしで描画されることをテスト
- `MigrationImportForm.test.tsx`（新規 or 既存拡張）: 自動判定成功時はボタン非表示、失敗時のみボタン表示されることをテスト
- `tenants.test.ts` / `steps.test.ts` / `onboarding`関連テスト: デフォルト値・ステップ数の変更に合わせて更新
- `TenantSettingsForm.test.tsx`・`FurusatoNozeiSimulatorForm.test.tsx`・`QualifiedInvoiceApplicationForm.test.tsx`・`PartnerReferralForm.test.tsx`・`AdvisorReferralForm.test.tsx`・`TaxableStatusChecker.test.tsx`・`notifications/page.test.tsx`・`deadlines/page.test.tsx`: 選択UIの存在を前提にしたテストがあれば、固定値前提のテストに更新する
- 既存の全テストがグリーンのまま維持されること
