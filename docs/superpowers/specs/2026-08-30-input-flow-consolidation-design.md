# 入力導線の統合（仕訳・固定資産・按分計算）

## 背景・目的

オーナー(修吾)が実機を操作した中で挙がったフィードバック（`meeting_minutes/spec_left_1`）のうち、以下2件に対応する。両方とも`docs/superpowers/specs/2026-08-30-nav-slimdown-and-entity-simplify-design.md`のスコープには明示的に含まれておらず（同specの「含まない」に「家事按分の仕訳入力ページへの統合（#21）、仕訳・固定資産台帳入力の統合（#18）。これらは別spec（入力導線の統合）で扱う」と明記）、本specがその「別spec」にあたる。

1. **#18**「仕訳や、固定資産台帳の入力が別ページにあるのはどう思う？入力関係は全部同じページにした方が良くないかな？」
2. **#21**「家事按分の計算は『按分計算』として名前を変えるのと、費用入力の時に仕訳入力ページで一緒にできた方が良さそう、わざわざページ分ける必要なさそう」

#21への対応にあたり事前調査を行ったところ、「家事按分」を名乗るページが実は2つ存在すること（`/apportionment`と`/expense-allocation`）が判明した。両者は目的が近く紛らわしいが、実装を読み比べた結果、計算のメカニズムが異なる別物であり、単純な重複コンポーネントの削除では済まないことが分かった（詳細は「設計」②）。このため今回は、フルマージを強行するのではなく、実態調査の結果と統合案をこのspecに詳しく記録した上で、コード変更は安全に実施できる範囲（固定資産の仕訳ページ統合、按分計算の名称整理・相互導線の追加）にとどめる。

## スコープ

**含む**:
- `/journal`（仕訳入力ページ）に、固定資産として登録するインライン導線（「＋ 固定資産として登録」ボタン→`FixedAssetForm`）を追加し、既存の`lib/db/fixedAssets.ts`の`createFixedAsset`をそのまま呼び出す
- 登録済み資産をページ内に一覧表示し、より詳細な管理（減価償却明細の確認・除却/売却計算）は引き続き`/assets`で行う旨を案内する導線
- `/apportionment`（床面積・時間按分の計算）と`/expense-allocation`（家事按分・按分計算）の実装比較・重複実態の調査結果の文書化
- オーナーの名称変更要望（「按分計算」への改名）を反映した`/expense-allocation`のナビラベル・ページタイトル・見出しの変更
- 上記2ページ間の相互リンク（「もう一方の計算方法もある」ことが分かるようにする）と、`/journal`ページから按分計算ページへの案内リンク追加
- `/expense-allocation`のメタデータ「個人事業主向け」表記についての気づきの記録（詳細は「設計」④）

**含まない**:
- `ApportionmentCalculator`と`ExpenseAllocationCalculator`（+`MileageAllocationCalculator`）の実装統合・コンポーネント合体。これは計算のメカニズムそのものが異なり（詳細は「設計」②）、どちらの入力方式を正とするか・按分率算出ロジックをどう統合するかにオーナーの製品判断が必要なため、今回は行わない
- `/apportionment`または`/expense-allocation`ページ自体の削除・リダイレクト化
- `/journal`ページへの按分計算UIの本格的な埋め込み（按分率の入力・計算をジャーナルフォーム内で完結させること）。案内リンクの追加にとどめる
- `/assets`ページの削除。今回は`/journal`に「素早く登録する入口」を追加するのみで、`/assets`は詳細な一覧管理・減価償却明細確認・除却/売却計算用として維持する
- `AssetLedgerForm`（`/assets`ページが使うローカルstateのみのシミュレーター）の変更。`/journal`に追加するのは既存の`FixedAssetForm`（DB書き込み版、`settings/opening-balances/`で実績あり）であり、`AssetLedgerForm`とは別コンポーネント
- `tenants.entity_type`選択UIの扱い（「個人事業主向け」表記の根本的な見直し）。これは`2026-08-30-nav-slimdown-and-entity-simplify-design.md`が扱っているentity_type全体の方針（法人固定化）と地続きの論点だが、本specでは気づきの記録にとどめ、実装判断は委ねる
- `NAV_GROUPS`の再編成そのもの（グループ構成・並び順）。`/expense-allocation`のラベル文字列1箇所のみを変更し、それ以外は`2026-08-30-nav-slimdown-and-entity-simplify-design.md`（並行進行中）の再編成に委ねる

## 設計

### ① `/journal`への固定資産登録導線の追加

`src/app/journal/page.tsx`は現在、`FormState`を`{mode: "closed"} | {mode: "create"} | {mode: "edit", id}`で管理し、「＋ 仕訳を追加」ボタンから`JournalEntryForm`を開いて`entries`（`CategorizedTransaction[]`のローカル state）に積み、最後に「記帳する」ボタンで`importCategorizedTransactionsAsJournalEntries`を呼んでまとめてDBへ書き込む設計になっている。

一方、固定資産の登録は`journal_entries`とは別テーブル（`fixed_assets`）への書き込みであり、`src/app/settings/opening-balances/OpeningBalancesClient.tsx`が既に同等の配線（`listAccounts`→`FixedAssetForm`→`createFixedAsset`）を実装済みだった。フルマージ（固定資産を仕訳の一種として`entries`に混在させる）は、`journal_entries`と`fixed_assets`という異なるテーブル・スキーマ・保存タイミングを無理に統合することになり複雑化するため行わない。代わりに、**同じページの中に、別テーブルへ書き込む独立した入力導線を並置する**方式を採る（オーナーの要望「入力関係は全部同じページに」を、"同じページから両方の入力口にアクセスできる"という形で満たす）。

具体的には：

- `FormState`に`{mode: "create-asset"}`を追加。既存の「＋ 仕訳を追加」ボタンの隣に「＋ 固定資産として登録」ボタンを追加し、クリックで`create-asset`モードに遷移する
- `create-asset`モードでは、既存の`FixedAssetForm`（`src/components/FixedAssetForm.tsx`、`OpeningBalancesClient.tsx`と共用）をそのまま描画する。`assetAccounts`/`expenseAccounts`は、journalページが既に`saveSetupState`のために取得済みの`accounts`（`listAccounts`）を`account_type`でフィルタして渡す（新規のデータ取得は不要）
- `onSubmit`は`createFixedAsset(tenantId, input)`をそのまま呼び、成功したらページ内の「今回登録した固定資産」一覧（セッション内のみ、`registeredAssets` state）に追加し、フォームを閉じる。`FixedAssetForm`自体が送信中・エラー表示を内包しているため、journalページ側の追加実装は最小限で済む
- 「固定資産として登録」ボタンは`saveSetupState === "ready"`（テナント・勘定科目取得済み）の場合のみ表示する。未ログイン・Supabase未設定時は仕訳の保存自体もできない状態のため、固定資産登録も同様に無効化するのが一貫している
- 登録済み一覧の下・仕訳フォーム冒頭に、より詳細な管理（減価償却明細・除却/売却計算）は`/assets`で行う旨のリンクを案内する。`/assets`ページ自体・`AssetLedgerForm`は変更しない

### ② `/apportionment`と`/expense-allocation`の実装比較（重複実態の調査結果）

事前調査の想定通り、2つの独立した「家事按分」系ページが存在していた。実装を読み比べた結果は以下の通り。

| | `/apportionment`（`ApportionmentCalculator`） | `/expense-allocation`（`ExpenseAllocationCalculator` + `MileageAllocationCalculator`） |
|---|---|---|
| 対象範囲 | 単一項目（総額1件） | 複数勘定科目を1画面でまとめて入力（テーブル形式） |
| 按分率の求め方 | **床面積 or 使用時間の実測値から自動算出**（`lib/tax/apportionment.ts`の`calculateApportionment`） | **ユーザーが按分率(%)を直接入力**（`lib/tax/expenseAllocation.ts`の`summarizeExpenseAllocation`）。車両費に限り`MileageAllocationCalculator`が走行距離ログから按分率を別途算出できる |
| 出力 | 必要経費となる金額（1件） | 科目ごとの事業経費・家事関連費の内訳一覧＋合計、按分率が0-5%/95-100%付近の場合の注意喚起 |
| ナビ上のラベル（変更前） | 「経費按分計算」（「申告書・帳票」グループ） | 「家事按分」（「資産・負債」グループ） |
| ページのmetadata | 特になし | 「個人事業主向け」という記載あり（③参照） |

**結論**: 単純な重複コンポーネントではない。「家事按分（家事関連費の按分計算）」という**税務上の目的は同一**だが、`/apportionment`は「比率をどう算出するか（床面積比・時間比）」に特化した単一項目の計算ツール、`/expense-allocation`は「（既に決まっている）比率を複数科目にまとめて適用する」ための集計ツールという、**互いに補完関係にある別UI**になっている。オーナーが実機で両方に遭遇して「重複では」と感じたのは自然だが、機能としては後者が前者の上位互換ではなく、両方の機能を1つのUIに統合するには、少なくとも次の設計判断が必要になる。

- 統合後のUIは「複数科目のテーブル」（`ExpenseAllocationCalculator`方式）を基本形にし、各行に「床面積・時間から算出する」モードと「率を直接入力する」モードを切り替えられるサブUIを持たせる、という形が最も機能を失わない統合案と考えられる（`MileageAllocationCalculator`の車両費サブUIと同じ設計パターンを、床面積・時間按分にも一般化するイメージ）
- その場合、`lib/tax/apportionment.ts`の`calculateApportionment`（床面積・時間→比率）と`lib/tax/expenseAllocation.ts`の`summarizeExpenseAllocation`（比率→金額）は関数としては両方生き残り、UIの1行の中で連結して使われる形になる
- どちらのページ・どちらの見た目をベースに統合するか、既存の`/apportionment`単体ページ・`/expense-allocation`単体ページをどう扱うか（削除するか、統合後のページへリダイレクトするか）はオーナーの意思決定が必要な範囲と判断し、今回はコード上のフルマージは行わない

### ③ 今回実施した最小限の変更（名称整理・相互導線）

オーナーの明示的な要望「家事按分の計算は『按分計算』として名前を変える」の対象は、ナビ上「家事按分」というラベルが付いていた`/expense-allocation`である（`/apportionment`のラベルは元々「経費按分計算」であり、「家事按分」ではない）。フルマージは行わないが、以下は低リスクで即座に実施できるためこのタイミングで対応した。

- `src/lib/navigation/appShellNav.ts`: `/expense-allocation`のラベルを「家事按分」→「按分計算」に変更（1行のみの差分）
- `src/app/expense-allocation/page.tsx`: ページタイトル・見出し・metadataを「家事按分の計算（個人事業主向け）」から「按分計算（家事按分）」に変更。`/apportionment`への案内リンク（床面積・時間から按分率を算出したい場合の誘導）を追加
- `src/app/apportionment/page.tsx`: ページタイトル・見出しを「家事按分（家事関連費按分）の計算」から「床面積・時間按分の計算」に変更し、「単一項目向けの簡易計算ツールである」ことと、`/expense-allocation`（按分計算ページ）への案内リンクを明記
- `src/app/journal/page.tsx`: 冒頭の説明文に、事業・私用が混在する費用を按分したい場合は按分計算ページ（`/expense-allocation`）で計算した事業分の金額を仕訳に入力する旨のリンクを追加（#21の「費用入力の時に仕訳入力ページで一緒にできた方が良い」という要望に対する、今回実施できる範囲の折衷案）

`/apportionment`のナビラベル（「経費按分計算」）自体は変更していない。`NAV_GROUPS`は`2026-08-30-nav-slimdown-and-entity-simplify-design.md`により並行して大規模再編中のため、影響範囲を最小限（`/expense-allocation`の1エントリのラベル文字列のみ）に留めた。

### ④ 「個人事業主向け」表記についての気づき（深追いせず記録のみ）

`/expense-allocation`のmetadata・ヘッダーには変更前「個人事業主向け」という記載があった（`lib/tax/expenseAllocation.ts`のコメントにも「個人事業主向け」と明記）。一方、`docs/superpowers/specs/2026-08-30-nav-slimdown-and-entity-simplify-design.md`が並行して進めている通り、本サービスは現在entity_type選択UIを撤去し法人固定にする方針で進んでいる。按分計算という機能自体は個人事業主・法人を問わず必要な処理だが、「個人事業主向け」という文言をこのタイミングで残しておくと、法人ユーザーに「自分には関係ない機能」という誤解を与えかねない。

今回は文言から「個人事業主向け」の記載を除去する変更のみ行い（③参照）、`lib/tax/expenseAllocation.ts`内のコメント文言や、より踏み込んだentity_type関連の扱い（そもそも按分計算がマイクロ法人にとってどの程度必要な機能か等）はentity_type全体の方針を扱う`nav-slimdown-and-entity-simplify`spec側の範囲と判断し、深追いしない。

### ⑤ 並行specとの整合性についての注記

`2026-08-30-nav-slimdown-and-entity-simplify-design.md`は本spec作成時点でまだ実装されておらず（specのみコミット済み、`NAV_GROUPS`は旧構成のまま）、同specの設計セクションに書かれた最終`NAV_GROUPS`構成には、`/expense-allocation`のラベルとして変更前の「家事按分」がそのまま記載されている（同spec作成時点では本specの改名がまだ存在しなかったため）。今回`appShellNav.ts`に加えた1行の変更（「家事按分」→「按分計算」）は、`nav-slimdown`側の実装がまだ`NAV_GROUPS`を書き換えていない前提でのみ意味を持つ。両ブランチが統合される際は、`nav-slimdown`側の実装者が`NAV_GROUPS`を最終構成に置き換える際に、`/expense-allocation`のラベルを「按分計算」に更新するよう申し送りが必要（通常のgit mergeでコンフリクトとして表面化する想定だが、念のためここに明記する）。

## テスト方針

- `src/app/journal/page.test.tsx`: 新規`describe("JournalPage fixed asset registration", ...)`ブロックを追加。
  - 未ログイン・未設定時は「＋ 固定資産として登録」ボタンが表示されないこと
  - フォーム入力→送信で`createFixedAsset(tenantId, input)`が正しい引数で呼ばれ、成功時に「今回登録した固定資産」一覧に反映されフォームが閉じること
  - キャンセルボタンで`createFixedAsset`を呼ばずに閉じた状態へ戻ること
  - 既存の「保存（記帳）」まわりのテスト（4件）は変更せずグリーンを維持する
- `/apportionment`・`/expense-allocation`ページの文言変更（タイトル・見出し・相互リンク）は既存のスナップショット/テキストアサーションを持つテストが存在しないことを確認済みのため、新規のテキストベースのテストは追加せず目視確認とする
- `npm test -- --run`と`npm run build`の両方がグリーンであることを確認する
