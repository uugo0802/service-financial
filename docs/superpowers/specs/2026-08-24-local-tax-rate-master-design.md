# 都道府県・市町村別 地方税計算（taxRateMaster）

## 背景・目的

決算関連書類のうち、別表五（一）「利益積立金額及び資本金等の額の計算に関する明細書」・別表五（二）「租税公課の納付状況等に関する明細書」を正しく生成するには、「未納道府県民税」「未納市町村民税」を県・市それぞれの金額で分けて把握する必要がある。

しかし現状のコードには、これを計算する仕組みが存在しない:

- `app/src/lib/tax/localCorporateTaxForm.ts` は**東京都23区限定**の簡易版で、23区には市町村民税が存在しないため「法人住民税」を1本にまとめて計算している
- `CLAUDE.md` に記載のあった `taxRateMaster.ts`（神奈川県平塚市などに対応した全国税率マスタ）は、**ドキュメント上の計画のみで実装されていない**
- `app/src/lib/filing/eltaxFileFormat.ts` も、県・市の按分計算はユーザー任せとしており自前で計算していない

このため、東京23区以外の会社（例: 神奈川県平塚市のごえん合同会社）では、県・市それぞれの正しい税額を出す手段がアプリのどこにもない。本スペックでは、この計算を担う `taxRateMaster.ts` を新設する。

## スコープ

**含む**:
- 都道府県・市町村ごとの税率を保持する `TAX_RATE_CONFIGS` 辞書と、それを使って県・市別に住民税を算出する新関数
- 最初のエントリは2件: `tokyo-23ku`（既存実装から移植、実装・出典コメント共に検証済み）と `kanagawa-hiratsuka`（CLAUDE.mdに記載のあった暫定値。**未検証**である旨を明示）
- 事業税（所得割・3段階税率）は東京・神奈川とも同じ全国標準税率が前提のため、既存の`localCorporateTaxForm.ts`のブラケット計算ロジックをそのまま再利用する

**含まない**:
- 既存の `localCorporateTaxForm.ts` および `DocumentPreview.tsx` の「法人住民税・事業税申告書」タブの変更（東京前提の簡易版としてそのまま動かし続ける。リグレッションを避けるため今回は触らない）
- 全国の都道府県・市町村を網羅すること（今回はこの2件のみ。追加は今後、必要な自治体が出るたびに1エントリずつ足す）
- 超過税率（資本金1億円超の法人や、自治体が標準税率と異なる税率を採用しているケース）への対応

## 設計

### 新規ファイル: `app/src/lib/tax/taxRateMaster.ts`

```typescript
export interface LocalTaxRateConfig {
  key: string;
  prefectureName: string; // 例: "神奈川県"
  municipalityName: string | null; // 東京23区のように市町村民税が存在しない場合は null
  perCapitaTaxPrefecture: number; // 均等割（県）
  perCapitaTaxMunicipality: number | null; // 均等割（市）。null = 該当なし
  corporateTaxLevyRatePrefecture: number | null; // 法人税割 税率（県）。null = 該当なし
  corporateTaxLevyRateMunicipality: number; // 法人税割 税率（市 or 23区は都民税相当）
  verified: boolean; // 実際の自治体公表資料で裏取りされているか
  sourceNote: string; // 出典 or 「未検証、要確認」の注記
}

export const TAX_RATE_CONFIGS: Record<string, LocalTaxRateConfig> = {
  "tokyo-23ku": { /* 既存 localCorporateTaxForm.ts の値をそのまま移植、verified: true */ },
  "kanagawa-hiratsuka": {
    /* CLAUDE.mdの暫定値を移植。verified: false。
       sourceNote: "CLAUDE.mdに記載の暫定値。平塚市公式サイトで税率を必ず確認してから利用すること" */
  },
};
```

### 新規関数: `buildLocalCorporateTaxFormForRegion`

`localCorporateTaxForm.ts` の `buildLocalCorporateTaxForm` と同じ入力（`CorporateEstimate`, `CorporateTaxForm`）に加えて `LocalTaxRateConfig` を受け取り、以下を県・市別に分けて返す:

```typescript
export interface RegionalLocalTaxForm {
  perCapitaTaxPrefecture: number;
  perCapitaTaxMunicipality: number;
  corporateTaxLevyPrefecture: number;
  corporateTaxLevyMunicipality: number;
  inhabitantTaxTotal: number; // 上記4つの合計
  businessTaxSubtotal: number; // 既存ロジック（3段階税率）を再利用、変更なし
  specialBusinessTax: number;
  businessTaxTotal: number;
  grandTotal: number;
  verified: boolean; // config.verified をそのまま伝播。呼び出し側（別表五）で警告表示に使う
}
```

事業税の3段階税率計算（`BUSINESS_TAX_BRACKET_*` / `BUSINESS_TAX_RATE_*` / `SPECIAL_BUSINESS_TAX_RATE`）は `localCorporateTaxForm.ts` からそのままコピーせず、共通の内部ヘルパーとして抽出し両ファイルから参照する（同じ計算式の重複を避けるため）。

### `verified: false` の扱い

`kanagawa-hiratsuka` のような未検証エントリを使って生成した書類には、`corporateInterimTax.ts` 等の既存コードと同じトーンの警告文を出す（例:「この税率は未検証の暫定値です。神奈川県・平塚市の公式サイトで最新の税率をご確認のうえ、必要に応じて値を修正してください」）。この警告文の実際の表示は、本スペックの対象外（別表五（一）（二）のUI実装時に行う）。ただし `RegionalLocalTaxForm.verified` フィールドとして呼び出し元に伝わるようにしておく。

## 検証

- 新規ユニットテスト（`taxRateMaster.test.ts`）で、`tokyo-23ku` 使用時の結果が既存の `buildLocalCorporateTaxForm` の結果と一致することを確認する（リグレッションがないことの担保）
- `kanagawa-hiratsuka` の計算例をテストに含めるが、これは「設定した税率通りに計算できているか」の検証であり、税率そのものの正しさ（実際に平塚市に納める金額と一致するか）は保証しない。テストのコメントにその旨を明記する
- 既存の Vitest 全件がグリーンのまま保たれることを確認する
