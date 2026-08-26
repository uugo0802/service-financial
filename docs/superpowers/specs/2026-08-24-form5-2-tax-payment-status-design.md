# 別表五（二）租税公課の納付状況等に関する明細書

## 背景・目的

別表五（一）（利益積立金額及び資本金等の額の計算に関する明細書、別スペックで設計）の「未納法人税等」「未納道府県民税」「未納市町村民税」欄、および「納税充当金」欄は、実務上そのまま別表五（二）の集計値を転記する構造になっている。そのため、別表五（一）を作る前提として、まず別表五（二）を実装する。

実際に提出された別表五（二）（国税庁提出分）を参照すると、以下の対応関係が確認できた:
- 別表五（二）の「期末納税充当金」= 別表五（一）row26「納税充当金」
- 別表五（二）の各税目の「期末現在未納税額」= 別表五（一）のrow27（未納法人税等）/row29（未納道府県民税）/row30（未納市町村民税）

## スコープ

**含む**:
- 税目別（法人税及び地方法人税／道府県民税／市町村民税／事業税及び特別法人事業税）の「期首未納税額・当期発生税額（中間・確定）・当期中の納付額・期末未納税額」の計算
- 「納税充当金の計算」セクション（期首納税充当金・繰入額・取崩額・期末納税充当金）
- 法人税及び地方法人税の中間納付額は `corporateInterimTax.ts` の `calculateProvisionalInterimTax()` と連携し、実際に中間納付が必要な場合はその金額を反映する

**含まない**:
- 道府県民税・市町村民税・事業税の中間納付額の計算（該当する計算ロジックがコードに存在しないため。常に0円＝中間納付なしとして扱う。将来必要になれば別スペックで対応する）
- 「その他」区分（利子税・延滞金・加算税及び加算金・延滞税・過怠税、row20-29）の実額計算。このアプリは該当する取引データを持たないため、常に「該当なし」として空欄表示する
- 「通算法人の通算税効果額の発生状況等の明細」（row42-45）。グループ通算制度を利用しないマイクロ法人向けサービスのため対象外

## 設計

### 新規ファイル: `app/src/lib/tax/form5_2TaxPaymentStatus.ts`

```typescript
export interface PriorYearUnpaidTaxAmounts {
  // 前期確定額のうち、期首時点でまだ納付していない金額（2期目以降のみ指定。
  // 初年度は指定不要＝すべて0として扱う）
  nationalTax: number; // 法人税及び地方法人税（確定分の合計）
  prefectureTax: number; // 道府県民税
  municipalityTax: number; // 市町村民税
  businessTax: number; // 事業税及び特別法人事業税
}

export interface TaxTypeRow {
  label: string;
  openingUnpaid: number; // ① 期首現在未納税額
  interimAccrued: number; // ② 当期発生税額（中間分）
  finalAccrued: number; // ② 当期発生税額（確定分）
  interimPaidByDeduction: number; // ⑤ 損金経理による納付（中間分。今回は中間納付があれば全額納付済みとして扱う）
  closingUnpaid: number; // ⑥ 期末現在未納税額 = ①＋②(中間+確定)－⑤
}

export interface Form5_2Inputs {
  priorYearUnpaid?: PriorYearUnpaidTaxAmounts; // 省略時＝初年度（すべて0）
  interimTax: ProvisionalInterimTaxResult | null; // corporateInterimTax.tsの結果。中間納付が不要な場合はnull
  finalNationalTax: number; // 確定 法人税＋地方法人税（CorporateTaxForm.totalNationalTaxを想定）
  finalPrefectureTax: number; // 確定 道府県民税（RegionalLocalTaxForm由来）
  finalMunicipalityTax: number; // 確定 市町村民税（RegionalLocalTaxForm由来）
  finalBusinessTax: number; // 確定 事業税及び特別法人事業税（RegionalLocalTaxForm.businessTaxTotal）
}

export interface TaxProvisionCalculation {
  openingProvision: number; // 期首納税充当金（2期目以降のみ。初年度は0）
  addition: number; // 繰入額＝損金経理をした納税充当金（＝当期の確定税額合計。別表四の加算額と一致させる）
  withdrawal: number; // 取崩額（今回は常に0固定。中間納付済み分は「損金経理による納付」欄で別途減算するため、納税充当金の取崩しとしては扱わない）
  closingProvision: number; // 期末納税充当金 = openingProvision + addition - withdrawal
}

export interface Form5_2Result {
  nationalTaxRow: TaxTypeRow;
  prefectureTaxRow: TaxTypeRow;
  municipalityTaxRow: TaxTypeRow;
  businessTaxRow: TaxTypeRow;
  taxProvision: TaxProvisionCalculation;
}

export function buildForm5_2(inputs: Form5_2Inputs): Form5_2Result { /* ... */ }
```

### 計算ロジックの要点

- `interimAccrued`（中間分の当期発生額）は、税目が「法人税及び地方法人税」の場合のみ `interimTax`（`corporateInterimTax.ts`の結果）から取得する。道府県民税・市町村民税・事業税は常に0（スコープ外のため）
- 中間納付が発生した税目（法人税及び地方法人税のみ）は、`interimPaidByDeduction` に同額を入れて中間分の期末未納額を0にする（＝中間申告分はこのアプリの利用時点で既に納付済みという前提。未納のまま繰り越すケースは扱わない）
- 確定分（`finalAccrued`）は常に未納（`interimPaidByDeduction`は確定分には適用しない）として扱う。これは今回参照した実例（初年度、確定分は全額未納のまま期末を迎えている）と一致する挙動
- `closingUnpaid` = `openingUnpaid + interimAccrued + finalAccrued - interimPaidByDeduction`
- `taxProvision.addition`（繰入額）= 4税目の確定分（`finalAccrued`）の合計。これは別表四で「損金経理をした納税充当金」として加算する額（`buildIncomeAdjustmentForm`の`fs.taxes`）と一致するはずなので、実装後にテストで突き合わせて検証する
- `taxProvision.closingProvision` は、別表五（一）row26「納税充当金」にそのまま渡す値になる

### 表示（`DocumentPreview.tsx`）

既存の `OfficialFormFrame` / `OfficialSection` / `OfficialRow` パターンをそのまま使う。新しい `CorpDocType` として `"form5_2"` を追加し、`CORP_DOC_TABS` に「租税公課の納付状況等に関する明細書（別表五（二））」タブを足す。列構成（期首未納・当期発生・当期中の納付・期末未納）を`OfficialRow`の並びで表現する。

## 検証

- 初年度（`priorYearUnpaid`省略、中間納付なし）のケースで、今回参照した実際の別表五（二）の構造（税目ごとに確定分のみ計上、期末未納＝当期発生額）と一致することをテストで確認する（金額そのものは実データのため使わず、ダミーの金額で同じ構造を検証する）
- 中間納付が発生するケース（`interimTax.required === true`）で、中間分の期末未納が0になり、確定分だけが未納として残ることを確認する
- `taxProvision.addition` が `buildIncomeAdjustmentForm` の加算額（`fs.taxes`）と一致することを確認するテストを追加する
- 既存の Vitest 全件がグリーンのまま保たれることを確認する
