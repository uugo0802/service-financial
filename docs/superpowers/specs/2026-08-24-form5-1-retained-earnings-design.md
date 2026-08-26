# 別表五（一）利益積立金額及び資本金等の額の計算に関する明細書

## 背景・目的

決算関連書類のうち最後に残ったピース。別表五（二）（租税公課の納付状況等に関する明細書、別スペック）の集計結果を受け取り、「利益積立金額」（税務上の繰越利益）と「資本金等の額」の期首→期末の増減を表す。

実際に提出された別表五（一）を参照すると、次の対応関係が確認できた:
- row25「繰越損益金」= `equityChangeForm.ts` の `retainedEarnings.closingBalance`
- row26「納税充当金」= 別表五（二）の期末納税充当金
- row27/29/30「未納法人税等／未納道府県民税／未納市町村民税」= 別表五（二）の各税目の期末現在未納税額（確定分・中間分の内訳付き）
- row31「差引合計額」= 上記の合計（＝利益積立金額の合計）
- Ⅱ「資本金等の額の計算」= 資本金（増減なしの前提。`equityChangeForm.ts`と同じ簡易化）

## スコープ

**含む**:
- Ⅰ 利益積立金額の計算（row25〜31相当）: 繰越損益金・納税充当金・未納法人税等／道府県民税／市町村民税・差引合計額
- Ⅱ 資本金等の額の計算（row32〜36相当）: 資本金又は出資金・差引合計額（資本準備金等の増減は今回扱わない）
- `DocumentPreview.tsx` への表示（既存の`OfficialFormFrame`パターンを使用）

**含まない**:
- row1〜24（利益準備金・積立金・その他の留保項目、未収還付税金）。このアプリは`corporateForms.ts`で「別表十四〜十六等の付表・調整は行っていない簡易版」と明記の通り、個別の税務調整項目（減価償却超過額の否認等）を追跡していないため、これらの行は常に空欄（0円）とする
- row28「未払通算税効果額」。グループ通算制度非対応のため対象外（別表五（二）と同じ理由）
- Ⅱの資本準備金・その他資本剰余金の増減（増資・減資・自己株式取得等）。`equityChangeForm.ts`と同じ前提で、当期中の資本取引は発生していないものとして扱う

## 設計

### 新規ファイル: `app/src/lib/tax/form5_1RetainedEarnings.ts`

```typescript
export interface Form5_1Inputs {
  equityChange: EquityChangeForm; // equityChangeForm.tsの結果（繰越損益金の期首・期末を取得）
  form5_2: Form5_2Result; // 別表五（二）の結果（納税充当金・各税目の未納額を取得）
  capitalStock: number; // 資本金（Ⅱ部用。equityChangeFormと同じ値を渡す）
}

export interface RetainedEarningsLine {
  label: string;
  openingBalance: number;
  change: number; // 当期の増減（増ー減。別表五(一)は「減」「増」を別列で持つが、このアプリでは正味の増減1列にまとめる。UI表示側で符号に応じて「増」「減」欄に振り分ける）
  closingBalance: number;
}

export interface Form5_1Result {
  retainedEarningsCarriedForward: RetainedEarningsLine; // row25 繰越損益金
  taxProvision: RetainedEarningsLine; // row26 納税充当金
  unpaidNationalTax: RetainedEarningsLine; // row27 未納法人税等（マイナス値として扱う）
  unpaidPrefectureTax: RetainedEarningsLine; // row29 未納道府県民税（マイナス値）
  unpaidMunicipalityTax: RetainedEarningsLine; // row30 未納市町村民税（マイナス値）
  retainedEarningsTotal: RetainedEarningsLine; // row31 差引合計額
  capitalStock: RetainedEarningsLine; // row32（Ⅱ部）
  capitalTotal: RetainedEarningsLine; // row36（Ⅱ部）差引合計額
}

export function buildForm5_1(inputs: Form5_1Inputs): Form5_1Result { /* ... */ }
```

### 計算ロジックの要点

- `unpaidNationalTax` / `unpaidPrefectureTax` / `unpaidMunicipalityTax` は別表の実際の様式に合わせて**マイナス値**として扱う（未納税額は利益積立金額から控除する項目のため）。`form5_2`の`closingUnpaid`をそのまま符号反転して使う
- `retainedEarningsTotal.closingBalance` = `retainedEarningsCarriedForward.closingBalance + taxProvision.closingBalance - unpaidNationalTax分 - unpaidPrefectureTax分 - unpaidMunicipalityTax分`（符号は上記の通りマイナス値同士の加算として実装する）
- `capitalTotal` は今回の簡易化（資本取引なし）により常に `capitalStock` と同額
- 検算式（実際の別表用紙に印字されている「御注意」の算式）は本スペックでは実装しない。将来、別表四との整合性チェックを追加する際に検討する

### 表示（`DocumentPreview.tsx`）

`CorpDocType` に `"form5_1"` を追加し、「利益積立金額及び資本金等の額の計算に関する明細書（別表五（一））」タブを新設する。Ⅰ部・Ⅱ部をそれぞれ`OfficialSection`で分け、各行を`OfficialRow`（期首・当期の増減・期末の3列相当をラベルに含めて表現）で並べる。既存の別表一・別表四タブと並びの一貫した見た目にする（今回のデザイン刷新スペックのトークン・コンポーネントが先に入っていれば、そちらに合わせる）。

## 検証

- 今回参照した実際の別表五（一）の構造（差引合計額が繰越損益金＋納税充当金－未納税額3種の合計と一致する）を、ダミー金額を使ったテストで再現・検証する
- `capitalTotal` が常に `capitalStock` と一致することを確認する
- `form5_2`側のテストで検証済みの「納税充当金＝別表四の加算額」との整合性が、本モジュール経由でも崩れていないことを確認する
- 既存の Vitest 全件がグリーンのまま保たれることを確認する
