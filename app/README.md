# 税務申告AI／ジャービス

A Next.js MVP for a Japanese tax/accounting SaaS aimed at freelancers (個人事業主) and micro-corporations (マイクロ法人). The core loop: upload a bank/card CSV, auto-categorize each transaction into an accounting item (勘定科目) and consumption-tax category, then generate draft tax estimates and form-like previews (income tax, corporate tax, consumption tax, P/L, balance sheet, etc.) formatted to resemble the official NTA/local-tax paper forms. Everything produced is explicitly a **simulation/draft**, not a filed return — see the disclaimers embedded throughout `lib/tax/*`.

See `app/CLAUDE.md` / `app/AGENTS.md` for agent-facing conventions, and `../docs/business-plan.md` (section 6) for the product scope this MVP targets.

## Module map (`src/`)

- **`lib/csv/`** — CSV ingestion. `decode.ts` detects UTF-8 vs Shift-JIS (CP932) encoding, which is common for Japanese bank/card exports. `parse.ts` is a hand-rolled RFC4180-ish CSV parser plus `normalizeCsv()`, which maps the many header-name variants used by Japanese banks/card issuers (single "amount" column or separate withdrawal/deposit columns) into a normalized `{date, description, amount}` transaction shape.
- **`lib/categorize/`** — Transaction categorization. `dictionary.ts` holds an ordered list of regex-based rules mapping transaction descriptions to an accounting account and consumption-tax category (課税仕入10%, 非課税, 不課税, etc.), plus default fallbacks. `engine.ts` runs those rules (`ruleBasedCategorize`) and flags low-confidence/unmatched rows for escalation. `aiEscalate.ts` sends only the unmatched rows to the Anthropic API (Claude Haiku, tool-use for structured output) to fill in a best-guess category; it's a no-op (rows stay "uncategorized") if `ANTHROPIC_API_KEY` is unset, and it caps how many rows are sent per request.
- **`lib/tax/`** — Estimation and form-preview logic, all explicitly labeled as simplified approximations (see the disclaimer comment at the top of each file):
  - `estimate.ts` / `corporateEstimate.ts` — income tax + consumption tax estimate for individuals, and corporate/local-corporate tax estimate for micro-corporations, computed from categorized transactions.
  - `plStatement.ts`, `balanceSheetForm.ts`, `businessOverviewForm.ts`, `accountBreakdownForm.ts` — build P/L, balance sheet (requires user-supplied opening cash/capital since only flow data is available), business-overview, and account-breakdown documents from transactions.
  - `individualForms.ts`, `corporateForms.ts`, `consumptionTaxForm.ts`, `localCorporateTaxForm.ts` — map the above into line-numbered structures mirroring the actual NTA/local-tax paper form layouts, for display purposes only (no e-Tax/eLtax submission).
- **`lib/db/supabaseClient.ts`** — Scaffolding only. Defines TypeScript types mirroring `supabase/schema.sql` and a `getSupabaseClient()` helper, but there is no live Supabase project wired up; the helper throws until `NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_ANON_KEY` are set, and nothing currently calls it.
- **`app/api/categorize/route.ts`** — The one API route: accepts a CSV upload (5MB cap), decodes/normalizes it, runs rule-based categorization, escalates unmatched rows to AI if configured, and returns the categorized transactions plus summary metadata.
- **`app/page.tsx`** — The main app screen: CSV upload, categorized-transaction review, and estimate/document previews (individual vs. micro-corp mode).
- **`app/early-access/page.tsx`** — Standalone marketing/landing page for early-access signup (links out to a Google Form).
- **`components/`** — `DocumentPreview.tsx` renders the tax estimates and generated documents in the app UI; `OfficialForm.tsx` provides shared building blocks (e.g. `DigitAmount`) that mimic the boxed-digit layout of official paper tax forms.

## Getting started

```bash
npm install
npm run dev      # start the dev server at http://localhost:3000
npm run build    # production build
npm run lint     # ESLint (eslint-config-next)
npm test         # vitest run — unit tests for csv/categorize/tax modules
```

Sample CSVs for manual testing live in `sample-data/`, and sample real-world filing output (for reference, not code) lives in `sample-financialreport/`.

Optional env var (copy `.env.local.example` to `.env.local`): `ANTHROPIC_API_KEY` enables AI-assisted categorization for transactions the rule engine can't confidently match. The app works without it — unmatched rows are just left as "要確認" (needs review).

## Known gaps

- **No database or auth.** `lib/db/supabaseClient.ts` is scaffolding with no live Supabase project connected; nothing persists between uploads. The planned schema (tenants, accounts, transactions, documents, audit logs) lives in `app/supabase/schema.sql` but has not been applied anywhere.
- **No CI.** There's no `.github/workflows` — build/lint/test only run locally or via whatever the operator sets up manually.
- **No e-Tax/eLtax integration.** Generated forms are previews only; actual filing is entirely manual and out of scope for this MVP phase (see `docs/business-plan.md` section 6).
- **Tax logic is intentionally simplified.** Each file in `lib/tax/` documents its own omissions (e.g. no 簡易課税, no 別表 adjustments, no non-cash balance-sheet items, limited deduction coverage). Treat all outputs as drafts requiring human/professional review, not authoritative calculations.
- **CSV format coverage is best-effort.** `lib/csv/parse.ts` recognizes a list of known Japanese bank/card header variants; unrecognized formats surface as `detectedColumns: "未検出"` in the API response rather than failing silently.
