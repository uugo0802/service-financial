@AGENTS.md

# ジャービス（JarvisFlow）— プロジェクト設計ドキュメント

> Claude Code向け。このファイルを読めばプロジェクトの全体像・設計思想・実装状況・残タスクがわかる。

---

## 1. プロダクトの本質

**何を作るか**: マイクロ法人・フリーランス向けの完全自動税務申告SaaS

**ターゲット**: マイクロ法人（1人法人）・フリーランスで、freee・マネーフォワードが「高い」と感じている人たち。税務知識はほぼゼロの前提。

**コアバリュー**:
- 人間がやることは **仕訳の入力のみ**（＋最終的な送信操作。下記「法的ポジショニング」参照）
- 入力後は決算書・申告書下書きの作成、e-Taxソフト（WEB版）/PCdeskへのインポート用データ生成までを全自動化。**e-Tax/eLTaxへの最終的な送信・電子署名は、税理士法対応のため必ず納税者本人が実行する**（本アプリが代理送信・代理署名を行うことはない。詳細は `docs/business-plan.md` §2「法的ポジショニング」・`docs/cto-tech-architecture.md` §1参照）
- freee より安いコスト

**重要**: これは特定の1社（ごえん合同会社）向けではなく、**全ユーザーが使う汎用SaaS**。ごえん合同会社のデータは設計検証用サンプルに過ぎない。

---

## 2. システムアーキテクチャ

### 技術スタック
```
フロントエンド: Next.js 16.2.11 + React 19 + TypeScript + Tailwind v4
バックエンド:   Supabase（PostgreSQL + Auth + Storage）
送信方式:       Pattern B（下書きデータ生成 → 本人がe-Taxソフト/PCdeskへインポート → 本人操作で送信。代理送信APIは存在しないため採用）
PWA:            Service Worker + InstallPrompt対応
テスト:         Vitest
```

### フォルダ構成（`app/src/` 配下）
```
lib/
  tax/                    # 税額計算エンジン（純粋関数）
    plStatement.ts          # 損益計算書
    balanceSheetForm.ts     # 貸借対照表
    corporateForms.ts       # 別表一（法人税計算）
    localCorporateTaxForm.ts # 地方税計算（均等割・法人税割・事業税）
    corporateEstimate.ts    # 消費税免除判定・概算
    deadlines.ts            # 申告期限計算
    taxRateMaster.ts        # 全国税率マスタ ← 新規追加
    accountBreakdown.ts     # 勘定科目内訳明細書 ← 新規追加
    businessOverview.ts     # 法人事業概況説明書 ← 新規追加

  filing/                 # 申告書ファイル生成
    etaxFileFormat.ts       # e-Tax形式（現在XMLスタブ、仕様書待ち）
    eltaxFileFormat.ts      # eLTax形式（県・市2ファイル分割済み）
    deadlines.ts            # 申告期限
    submissionSteps.ts      # 申告手順

  supabase/               # DB接続 ← 新規追加
    client.ts               # クライアントサイド用
    server.ts               # サーバーサイド用（RLSバイパス）

app/
  (dashboard)/            # 各種ページ（現在SAMPLE_DATAを使用、Supabase接続TODO）
```

> **注記**: 上記の `filing/etaxFileFormat.ts`・`filing/eltaxFileFormat.ts`・`notifications/page.tsx` は、本リポジトリの `main` ブランチには未マージです（別セッションで進めていた派生実装）。現在の `main` では `filing/` 配下は `submissionSteps.ts`・`wizardProgress.ts` 等の別実装になっています。マージ方針は別途検討中です。

---

## 3. マルチテナント設計（SaaS必須）

### Supabaseに必要なテーブル

#### `company_profiles`(会社プロフィール)
```sql
CREATE TABLE company_profiles (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid REFERENCES auth.users(id),
  company_name     text NOT NULL,
  company_type     text DEFAULT 'godo',  -- 'godo' | 'kabushiki'
  prefecture_city_key text DEFAULT 'kanagawa-hiratsuka',  -- taxRateMaster.tsのキー
  fiscal_year_end_month int DEFAULT 12,  -- 決算月（1-12）
  capital_amount   bigint DEFAULT 0,     -- 資本金（消費税免除判定に使う）
  incorporation_date date,               -- 設立日（事業年度月割り計算に使う）
  tax_payment_method text DEFAULT 'inclusive',  -- 'inclusive'=税込 / 'exclusive'=税抜
  etax_taxpayer_id  text,               -- e-Tax利用者識別番号
  eltax_user_id     text,               -- eLTax利用者ID（英数字混在の発行済みID）
  created_at       timestamptz DEFAULT now()
);
```

#### `journal_entries`(仕訳帳)
```sql
CREATE TABLE journal_entries (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   uuid REFERENCES company_profiles(id),
  date         date NOT NULL,
  debit_account  text NOT NULL,   -- 借方科目
  credit_account text NOT NULL,   -- 貸方科目
  amount       bigint NOT NULL,
  description  text,
  created_at   timestamptz DEFAULT now()
);
```

### 計算関数への渡し方
全ての税額計算関数は `company_profiles` の値を引数で受け取る設計済み。

```typescript
// 例: 地方税計算
const profile = await getCompanyProfile(userId);
const taxRates = TAX_RATE_CONFIGS[profile.prefecture_city_key];
const months = calcFiscalMonths(profile.incorporation_date, fiscalYearEnd);
const localTax = buildLocalCorporateTaxForm(income, nationalTax, taxRates, months);
```

---

## 4. 税額計算ロジック（確定済み）

### 全体フロー
```
仕訳入力
  ↓
試算表（トライアルバランス）
  ↓
損益計算書（P/L）← plStatement.ts
  ↓
当期純利益
  ↓
別表四（所得調整）: 当期純利益 + 損金不算入の未払法人税等 = 所得金額
  ↓
別表一（法人税計算）← corporateForms.ts
  ↓
地方税計算 ← localCorporateTaxForm.ts + taxRateMaster.ts
  ↓
申告書生成 → e-Tax/eLTax送信
```

### 法人税（別表一）
```
所得金額 × 15%（〜800万円）または × 23.2%（超過部分）= 法人税額
法人税額 × 10.3% = 地方法人税
```

### 地方税（神奈川/平塚市を例に）
```
事業税    = 所得金額 × 3.5%（400万以下）
特別法人事業税 = 事業税 × 37%
均等割（県）= 20,000円 × 事業月数/12（切り捨て）
均等割（市）= 50,000円 × 事業月数/12（切り捨て）
法人税割（県）= 法人税額 × 1.0%
法人税割（市）= 法人税額 × 6.0%
```

### 税率マスタ（`taxRateMaster.ts`）
現在対応済み: `kanagawa-hiratsuka` / `tokyo-23ku` / `osaka-osaka`
追加は `TAX_RATE_CONFIGS` オブジェクトにキーを足すだけ。

### 消費税免除判定（`corporateEstimate.ts`）
- 設立1〜2期目 **かつ** 資本金1,000万円未満 → 免税（新設法人特例）
- 売上高2,000万円未満 → 免税（基準期間基準）

---

## 5. e-Tax / eLTax 送信設計

### 送信方式: Pattern B（下書きデータ生成、送信は本人操作）
e-Tax・eLTaxとも「代理送信API」は存在しない（照会系APIのみ）。そのため商業会計ソフト（freee/MF）と同じ方式を採る: 本アプリは申告データを標準フォーマットで生成するところまでを担い、**実際の送信・電子署名は必ず納税者本人がe-Taxソフト（WEB版）/PCdesk上で実行する**（`docs/cto-tech-architecture.md` §1参照）。本アプリが送信や署名を代行することはない。

### e-Tax（国税: 法人税・消費税）
- 仕様書: **申請中**（e-tax-api@nta.go.jp にメール済み）
- ファイル形式: `.xtx`（XML）
- 現状: XMLスタブのみ実装済み（`etaxFileFormat.ts` の `generateEtaxXmlStub()`）。本人がe-Taxソフト（WEB版）へインポートし、本人のマイナンバーカード等で電子署名・送信する前提

### eLTax（地方税: 法人住民税・事業税）
- 仕様書: **申請予定**（地方税共同機構 0570-081459 or Webフォーム）
- 現状: ドラフトCSVを県分・市分の2ファイルで出力（`generateEltaxDrafts()`）。本人がPCdeskへインポートし、本人操作で電子署名・送信する前提
- 申告書: 第六号様式（都道府県民税）/ 第二十号様式（市町村民税）

### 電子証明書
- 送信時に本人が使用する電子証明書は**未取得**（ユーザーアクション待ち）
- 推奨: 法務局「商業登記電子証明書」（約9,000円/年）
- 証明書なしでも申告は受理されるが E.150 エラーが記録される（あくまで本人がe-Taxソフト上で送信する際の話であり、本アプリ側の自動送信・自動署名の話ではない）

### 受信通知の取得
仕様書取得後に実装予定。通知は：
1. APIのポーリングで自動取得
2. Supabase に保存
3. Google Drive へPDF保存（オプション）

---

## 6. 出力ドキュメント一覧（D1〜D11）

ごえん合同会社の提出書類を例に、システムが自動生成すべき書類:

| ID | 書類名 | 提出先 | 実装状況 |
|----|--------|--------|----------|
| D1 | 法人税確定申告書（別表一） | e-Tax | スタブ実装済み |
| D2 | 別表四（所得の金額の計算） | e-Tax | ロジック実装済み |
| D3 | 別表五(一)（利益積立金額） | e-Tax | 未実装 |
| D4 | 法人都道府県民税確定申告書（第六号様式） | eLTax | ドラフト出力済み |
| D5 | 法人市町村民税確定申告書（第二十号様式） | eLTax | ドラフト出力済み |
| D6 | 損益計算書 | 添付 | 実装済み |
| D7 | 貸借対照表 | 添付 | 実装済み（要検証） |
| D8 | 株主資本等変動計算書 | 添付 | 未実装 |
| D9 | 勘定科目内訳明細書 | 添付 | ロジック実装済み |
| D10 | 法人事業概況説明書 | 添付 | ロジック実装済み |
| D11 | 法人番号届出書 | 税務署 | 初回のみ・手動 |

---

## 7. 実装状況サマリー

| 領域 | 完成度 | 状況 |
|------|--------|------|
| 税額計算ロジック | 75% | バグ修正済み、中間納付対応済み |
| 申告書生成 | 35% | XMLスタブ、ドラフトCSVまで |
| UI / UX | 55% | ダッシュボード・仕訳入力あり |
| DB / Supabase接続 | 10% | 接続ファイル作成済み、テーブル未定義 |
| e-Tax送信データ生成（送信自体は常に本人操作） | 0% | 仕様書待ち |
| eLTax送信データ生成（送信自体は常に本人操作） | 0% | 仕様書待ち |
| テスト | 75% | Vitest設定済み |
| **全体** | **35%** | |

---

## 8. 残タスク（優先順）

### 🔴 今すぐできる（仕様書不要）

1. **`company_profiles` テーブルをSupabaseに作成** → 全計算関数をマルチテナント対応に
2. **`journal_entries` テーブルをSupabaseに作成**
3. **SAMPLE_DATA を使っているページをSupabase接続に切り替え**
   - `dashboard/page.tsx`
   - `financial-statements/page.tsx`
   - `history/page.tsx`
   - `notifications/page.tsx`
4. **別表五(一)（利益積立金額）の実装**
5. **株主資本等変動計算書の実装**

### 🟡 ユーザーアクション待ち

| アクション | 担当 | 現状 |
|-----------|------|------|
| e-Tax API仕様書の申請 | ユーザー | メール送信予定 |
| eLTax 開発者登録 | ユーザー | 電話/Webフォームで申込予定 |
| 法人電子証明書の取得 | ユーザー | 法務局に申請予定 |

### 🔵 仕様書到着後

1. e-Tax XMLの正式実装（`etaxFileFormat.ts`）。生成したファイルを本人がe-Taxソフト（WEB版）へインポートする前提
2. eLTax送信データの正式実装（`eltaxFileFormat.ts`）。生成したファイルを本人がPCdeskへインポートする前提（**本アプリからeLTax APIへ直接送信する実装は行わない** — 代理送信APIが存在しないこと、および税理士法対応上の本人操作原則のため）
3. ~~PKCS#12電子署名の実装（サーバーサイド）~~ → 対応しない。電子署名は必ず本人がe-Taxソフト/PCdesk上で自身の電子証明書を用いて行うため、本アプリ側で署名処理を持つ設計にはしない
4. 受信通知の自動取得・Supabase保存（照会系APIの範囲内。参照専用であり送信・署名とは別の話）

---

## 9. 重要な設計判断

### なぜ Pattern B（下書き生成＋本人送信）を選んだか
- e-Tax/eLTaxとも代理送信APIが存在しないため、freee/MFと同じ「データ生成→本人操作で送信」方式以外の選択肢がない
- 商業会計ソフト（freee等）を経由しない → コスト削減の核心
- **注意**: 「送信は必ず本人操作」は税理士法対応上の必須要件であり、コスト都合で選んだオプションではない（`docs/business-plan.md` §2参照）。本アプリが送信・署名を自動化・代行することは今後も想定しない

### 電子証明書なしでも申告できるか
**できる**。E.150エラー（証明書未添付）が記録されるが申告自体は受理される。実際にごえん合同会社の第1期申告でも受理された実績がある（受付番号: R1-2026-XXXXXXXX, R1-2026-XXXXXXXX）。
**訂正（2026-08-26）**: この受理実績は、納税者本人が別途の手段（e-Taxソフト/PCdesk等での本人操作）で実際に提出した結果であり、本アプリのPattern B実装（送信・署名まわり）が完成・使用されたことを示すものではない。本アプリの送信まわりは本ドキュメント執筆時点でも下書き生成までしか実装されておらず（上記「5. e-Tax / eLTax 送信設計」参照）、電子署名の自動化機能自体が存在しない。以前の記述はこの2つを混同しており、誤って「本アプリの自動送信パイプラインが動作確認済み」と読めるものだったため訂正した。

### SAMPLE_DATA について
各ページの `SAMPLE_DATA` / `SAMPLE_ENTRIES` は開発中の暫定プレースホルダー。本番では `company_profiles` から取得した設定値 + `journal_entries` の仕訳データをもとに全て動的生成する。

### 均等割の月割り計算
事業年度が12ヶ月未満の場合（新設法人の初年度など）は月割りが必要。
`calcFiscalMonths(startDate, endDate)` で月数を算出し、`calcPerCapitaTaxMonthly(annualAmount, months)` で按分する。

---

## 10. 環境変数

```env
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...   # サーバーサイドのみ・RLSバイパス
```

---

## 11. 参照ドキュメント

- 設計書（サービス全体）: https://claude.ai/code/artifact/df728ca5-abbe-4f45-8eab-e033cb0ff68b
- アウトプット仕様書（D1〜D11詳細）: https://claude.ai/code/artifact/ae9584f6-fb9c-486d-8a6b-6eb6e374d806
- 開発ロードマップ: https://claude.ai/code/artifact/22801a40-f0c5-44f1-bca3-43e58d191c46
- GitHubリポジトリ: https://github.com/uugo0802/service-financial
