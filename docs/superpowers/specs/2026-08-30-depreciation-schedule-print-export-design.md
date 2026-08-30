# 別表十六（一）減価償却明細の印刷バグ修正・様式改善・CSV出力追加

## 背景・目的

オーナーが実機で`/depreciation-schedule`（別表十六（一）減価償却の計算に関する明細書）を確認したところ、以下のフィードバックがあった。

1. 印刷ボタン（「印刷 / PDFで保存（別表十六（一））」）を押しても、印刷プレビューに何も表示されない
2. フォーマットを税理士事務所が発行するような体裁にしてほしい
3. CSVもしくはExcel出力にも対応してほしい

## 原因調査（コード確認済み）

### 印刷ボタンで何も表示されない件

`src/app/globals.css`に、アプリ初期プロトタイプ由来の以下のグローバル印刷CSSが存在する（`177b333 Initial commit`から変更なく残っている）。

```css
@media print {
  body * {
    visibility: hidden;
  }
  #print-area,
  #print-area * {
    visibility: visible;
  }
  #print-area {
    position: absolute;
    left: 0;
    top: 0;
    width: 100%;
  }
}
```

これは「`id="print-area"`の要素とその子孫だけを可視化し、それ以外の`body`配下は全て隠す」という、`components/DocumentPreview.tsx`（`/quick-estimate`専用、`id="print-area"`のdivで囲んでいる）だけが前提とする古い印刷方式である。

一方、`PrintableStatementLayout.tsx`・`InvoicePrintLayout.tsx`・`QuotePrintLayout.tsx`など、design-refresh-foundation（2026-08-24）以降に整備された新しい書類プレビュー系コンポーネントは、`id="print-area"`を使わず、Tailwindの`print:hidden`／`print:block`等のユーティリティクラスだけで印刷内容を制御する方式に統一されている（`DepreciationScheduleClient.tsx`が使う`PrintableStatementLayout`もこちら）。

この2方式が同居した結果、`id="print-area"`を持たないページ（`/depreciation-schedule`を含む、`PrintableStatementLayout`等を使う全ページ）で印刷を実行すると、`body * { visibility: hidden; }`だけが常に適用され、それを打ち消す`#print-area`要素がDOM上に存在しないため、`body`配下の内容が実質すべて非表示のまま印刷される。これが「印刷ボタンを押しても何も表示されない」の根本原因である。

`PrintableStatementLayout.tsx`・`InvoicePrintLayout.tsx`自体の印刷用マークアップ（`print:hidden`・`print:fixed`ヘッダー/フッター・透かし等）は正しく実装されており、問題はこのグローバルCSS側にある。

### フォーマットの改善余地

`components/DepreciationScheduleTable.tsx`は独自の罫線ボックスで見出し・表を組んでおり、他の別表系コンポーネント（`DocumentPreview.tsx`内の別表一・別表四・別表五(一)/(二)等）が共通で使っている`components/OfficialForm.tsx`の`OfficialFormFrame`（外枠罫線＋右端に様式番号を縦書きで配置する、実際の国税庁様式に寄せた共通の額縁パーツ）を使っていない。

また、`border-2 border-foreground`・`border-b-2 border-foreground`・`border-t-2 border-foreground`という、デザイントークン（`--foreground`）を使ったクラスが3箇所に残っている。`components/ui/DocumentPreviewFrame.tsx`のコメントで明記されている「配下は常にライト固定・トークンクラス禁止」というルールに反しており、ダークモード時にはこのトークンがダーク用の明るい色に解決されるため、白固定の紙面上で罫線がほぼ見えなくなる副作用がある。

### CSV出力

`src/lib/export/journalExport.ts`に、CSVエスケープ・行組み立て・複数セクション結合を行う`escapeCsvField`・`toCsvRow`・`buildCsvBlock`という純粋関数と、UTF-8 BOM付きでBlobダウンロードさせる`components/ExportDataButton.tsx`（`/export`ページの`ExportClient.tsx`が使用）が既にある。この2つを再利用すれば、別表十六（一）専用の新しいCSV生成関数とダウンロードボタンを最小の追加コードで用意できる。新規に重いライブラリ（xlsx生成等）を追加する必要はない。

## スコープ

**含む**:
- `src/app/globals.css`の`#print-area`前提の印刷用グローバルCSSを、`/quick-estimate`（`DocumentPreview.tsx`）の既存の印刷挙動を変えずに、`#print-area`を持たないページ（`PrintableStatementLayout`系すべて）を巻き込まないようスコープする
- `components/DepreciationScheduleTable.tsx`を`OfficialFormFrame`（`components/OfficialForm.tsx`）で包み、他の別表と統一感のある外枠・様式番号の縦書き表示にする。あわせて事業年度・法人名を様式内のヘッダー領域に表示する
- 上記と同時に、`border-foreground`等のトークンクラスをハードコードされたstone系の色（`border-stone-800`等）に置き換える
- 表の各行に`print:break-inside-avoid`を付与し、ページ境界での行分断を防ぐ（`InvoicePrintLayout.tsx`・`AccountBreakdownStatement.tsx`と同じパターン）
- `src/lib/export/journalExport.ts`の`CRLF`・`buildCsvBlock`を`export`し、別表十六（一）専用のCSV生成関数（新規ファイル、仮称`src/lib/export/depreciationScheduleCsv.ts`）を追加する。ヘッダー（出力日時・免責文言）、資産明細行（表と同じ列構成）、合計行、注記（`form.notes`・対象外資産）を1つのCSVにまとめる
- `DepreciationScheduleClient.tsx`に、`ExportDataButton`を使った「CSVをダウンロード」ボタンを追加する（印刷ボタンと同様、画面表示専用＝`print:hidden`）

**含まない**:
- Excel（.xlsx）形式そのものの出力（package.jsonに対応ライブラリが無く、新規に重い依存を追加しない方針のためCSVのみとする。CSVはExcelでもそのまま開けるため実用上の代替とする）
- `#print-area`方式に依存する`/quick-estimate`（`DocumentPreview.tsx`）自体の印刷方式の刷新（今回のグローバルCSS修正でも、このページの既存の印刷挙動は変えない。将来的に`DocumentPreview.tsx`も新方式へ統一するかどうかは別スコープ）
- 別表十六（一）の列構成・計算ロジックの変更（`lib/tax/depreciation.ts`・`lib/tax/depreciationScheduleForm.ts`は対象外。既存の欄構成・簡略化方針はそのまま踏襲する）
- 定率法（別表十六（二））・少額減価償却資産の特例（別表十六（七））の様式追加（既存どおりスコープ外として除外資産の案内のみ）

## 設計

### 印刷CSSのスコープ修正（`src/app/globals.css`）

`:has()`セレクタを使い、「ページ内に実際に`#print-area`が存在する場合のみ」旧方式の強制非表示を適用するよう変更する。

```css
@media print {
  body:has(#print-area) *:not(#print-area, #print-area *) {
    visibility: hidden;
  }
  #print-area {
    position: absolute;
    left: 0;
    top: 0;
    width: 100%;
  }
}
```

- `/quick-estimate`（`#print-area`あり）: 従来どおり`#print-area`以外を強制非表示にする挙動を維持
- それ以外の`print:`クラスベースのページ（`#print-area`なし）: この規則自体が適用されなくなり、各コンポーネントの`print:hidden`等のユーティリティクラスだけで印刷内容が制御される（本来意図していた新方式の挙動に戻る）

### `DepreciationScheduleTable.tsx`の様式改善

- 外枠を独自の`border-2 border-foreground`から`OfficialFormFrame`（`scheduleLabel="別表十六（一）"`・`formTitle={form.formTitle}`）に置き換える
- `OfficialFormFrame`の中、表の直前に事業年度・法人名を表示するヘッダー行を追加する（`entityName`を新規propとして受け取る。省略可能＝呼び出し側が未対応でも壊れない）
- 表本体・合計行・除外資産の案内・注記リストは既存の構成を維持しつつ、トークンクラスをstone系に置換し、各`<tr>`に`print:break-inside-avoid`を追加する
- `DepreciationScheduleClient.tsx`から`<DepreciationScheduleTable form={form} entityName={entityName} />`のように呼び出し元を更新する

### CSV出力の追加

- `src/lib/export/journalExport.ts`の`CRLF`・`buildCsvBlock`を`export`する（既存の`EXPORT_DISCLAIMER`は既にexport済み）
- 新規`src/lib/export/depreciationScheduleCsv.ts`に、`DepreciationScheduleForm`と法人名を受け取ってCSV文字列を組み立てる`buildDepreciationScheduleExportCsv(form, entityName, generatedAt?)`を追加する。構成は`buildJournalExportCsv`と同じ「タイトル行＋出力日時＋免責文言」→「■ 資産明細」（表と同じ列＋合計行）→「■ 注記」（`form.notes`）の3ブロック
- `DepreciationScheduleClient.tsx`に`ExportDataButton`（`fileNamePrefix="depreciation-schedule"`）を追加し、印刷ボタンの近くに配置する。ボタンの見た目はデザイントークンではなく、既存の印刷ボタン（`PrintableStatementLayout.tsx`）と同系統のハードコードされたstone系クラスを使う

## テスト方針

- `src/lib/export/depreciationScheduleCsv.test.ts`（新規）: ヘッダー行・資産1件のCSV行・合計行・注記・除外資産ありの場合の案内文が含まれることを検証する（`journalExport.test.ts`と同じ検証スタイル）
- `src/components/DepreciationScheduleTable.tsx`は直接のユニットテストが無いため、`src/app/depreciation-schedule/DepreciationScheduleClient.test.tsx`に、CSVダウンロードボタンが表示されること・`OfficialFormFrame`経由の様式番号（`別表十六（一）`）が表示されることを検証するケースを追加する
- 印刷CSS自体（`@media print`の実際の見え方）はjsdom上でのユニットテストでは検証できないため、原因と対処をこのspecおよびコード内コメントに明記するに留める（実機・実ブラウザでの確認はオーナー側で実施）
- `npm test -- --run`と`npm run build`が最終的にグリーンであることを確認する。既存テスト（`DepreciationScheduleClient.test.tsx`・`depreciationScheduleForm.test.ts`・`journalExport.test.ts`等）を壊さないこと
