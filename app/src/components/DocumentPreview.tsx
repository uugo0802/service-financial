"use client";

import { useState } from "react";
import { CategorizedTransaction } from "@/lib/categorize/engine";
import { BookkeepingMethod, estimateForIndividual, FilingMethod, IndividualEstimate } from "@/lib/tax/estimate";
import { CorporateEstimate } from "@/lib/tax/corporateEstimate";
import { buildProfitLossStatement } from "@/lib/tax/plStatement";
import {
  buildConsumptionTaxForm,
  buildConsumptionTaxReturnForm,
  ConsumptionTaxMethod,
  SimplifiedBusinessCategory,
  DEEMED_PURCHASE_RATES,
  SIMPLIFIED_BUSINESS_CATEGORY_LABELS,
} from "@/lib/tax/consumptionTaxForm";
import { buildCorporateTaxForm, buildFinancialStatements, buildIncomeAdjustmentForm } from "@/lib/tax/corporateForms";
import { buildLocalCorporateTaxForm } from "@/lib/tax/localCorporateTaxForm";
import { buildForm5_2 } from "@/lib/tax/form5_2TaxPaymentStatus";
import { buildForm5_1, RetainedEarningsLine } from "@/lib/tax/form5_1RetainedEarnings";
import { buildEquityChangeForm } from "@/lib/tax/equityChangeForm";
import { buildBalanceSheetForm } from "@/lib/tax/balanceSheetForm";
import { buildAccountBreakdownForms } from "@/lib/tax/accountBreakdownForm";
import { buildMonthlySalesTrend } from "@/lib/tax/businessOverviewForm";
import { buildIndividualReturnForm, buildBlueReturnStatement } from "@/lib/tax/individualForms";
import { OfficialFormFrame, OfficialSection, OfficialRow } from "@/components/OfficialForm";
import { explainCorporateEstimateCalculation, explainIndividualEstimateCalculation } from "@/lib/explain/taxEstimateExplainer";
import { TaxEstimateExplanationPanel } from "@/components/TaxEstimateExplanationPanel";

const yen = new Intl.NumberFormat("ja-JP", { maximumFractionDigits: 0 });

function Yen({ v }: { v: number }) {
  return <span className="tabular-nums">{yen.format(v)}</span>;
}

function FormTable({
  title,
  rows,
}: {
  title: string;
  rows: { label: string; symbol?: string; amount: number; muted?: boolean; strong?: boolean }[];
}) {
  return (
    <div className="mb-6">
      <div className="text-xs font-semibold text-stone-500 mb-1">{title}</div>
      <div className="overflow-x-auto print:overflow-visible">
        <table className="w-full min-w-[22rem] text-sm border-collapse">
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className={`border-t border-stone-200 ${r.strong ? "font-semibold" : ""}`}>
                <td className="py-1.5 pr-2 w-10 text-stone-400 text-xs align-top">{r.symbol ?? ""}</td>
                <td className={`py-1.5 pr-4 ${r.muted ? "text-stone-400" : ""}`}>{r.label}</td>
                <td className="py-1.5 text-right w-32 whitespace-nowrap">
                  <Yen v={r.amount} />
                  <span className="text-xs text-stone-400"> 円</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// OfficialRow内部のDigitAmountはマイナス値を0として描画してしまう（マス目表示は非負の
// 金額のみを想定しているため）。別表五（一）は未納税額をマイナス値として扱う設計のため、
// マイナスの場合は絶対値に変換し、会計上のマイナス表記「△」をラベルに付けて表現する。
function SignedOfficialRow({
  label,
  symbol,
  amount,
  indent,
  strong,
}: {
  label: string;
  symbol?: string;
  amount: number;
  indent?: boolean;
  strong?: boolean;
}) {
  return (
    <OfficialRow
      label={amount < 0 ? `${label}　△` : label}
      symbol={symbol}
      amount={Math.abs(amount)}
      indent={indent}
      strong={strong}
    />
  );
}

// 別表五（一）の1行（期首現在・当期の増減・差引翌期首現在の3列）を、
// このアプリの正味の増減1列モデル（RetainedEarningsLine）からOfficialRow3行で表現する。
function RetainedEarningsLineRows({ line, rowNumber }: { line: RetainedEarningsLine; rowNumber: string }) {
  return (
    <>
      <SignedOfficialRow label={`${line.label}（期首現在）`} symbol={rowNumber} amount={line.openingBalance} />
      <SignedOfficialRow label={`${line.label}（当期の増減）`} amount={line.change} indent />
      <SignedOfficialRow label={`${line.label}（差引翌期首現在）`} amount={line.closingBalance} strong />
    </>
  );
}

function DocHeader({ title, entityName, periodStart, periodEnd }: { title: string; entityName: string; periodStart: string; periodEnd: string }) {
  return (
    <div className="text-center mb-8 border-b-2 border-stone-800 pb-4">
      <div className="text-xl font-serif tracking-widest">{title}</div>
      <div className="text-sm text-stone-500 mt-2">
        {entityName || "（氏名・屋号・法人名 未入力）"} ／ 対象期間: {periodStart} 〜 {periodEnd}
      </div>
      <div className="text-xs text-amber-700 mt-2">
        本書類はCSVから機械的に算出した概算の下書きであり、正式な決算書・申告書ではありません。提出前に必ずご自身でご確認ください。
      </div>
    </div>
  );
}

type IndividualDocType = "blueReturn" | "accountBreakdown" | "incomeTaxReturn" | "consumptionTax";
type CorpDocType =
  | "financialStatements"
  | "accountBreakdown"
  | "businessOverview"
  | "corporateTaxReturn"
  | "incomeAdjustment"
  | "localTaxReturn"
  | "form5_1"
  | "form5_2"
  | "consumptionTax";

const INDIVIDUAL_DOC_TABS: { key: IndividualDocType; label: string }[] = [
  { key: "blueReturn", label: "青色申告決算書" },
  { key: "accountBreakdown", label: "地代家賃・外注費等の内訳" },
  { key: "incomeTaxReturn", label: "確定申告書（所得税）" },
  { key: "consumptionTax", label: "消費税申告書" },
];

const CORP_DOC_TABS: { key: CorpDocType; label: string }[] = [
  { key: "financialStatements", label: "決算報告書" },
  { key: "accountBreakdown", label: "勘定科目内訳明細書" },
  { key: "businessOverview", label: "事業概況説明書" },
  { key: "corporateTaxReturn", label: "法人税・地方法人税申告書" },
  { key: "incomeAdjustment", label: "所得金額の計算（別表四）" },
  { key: "localTaxReturn", label: "法人住民税・事業税申告書" },
  { key: "form5_1", label: "利益積立金額及び資本金等の額の計算に関する明細書（別表五（一））" },
  { key: "form5_2", label: "租税公課の納付状況等に関する明細書（別表五（二））" },
  { key: "consumptionTax", label: "消費税申告書" },
];

export function DocumentPreview({
  mode,
  rows,
  individualEstimate,
  corpEstimate,
  entityName,
  capitalStock,
  openingCash,
  shareCount,
}: {
  mode: "individual" | "corp";
  rows: CategorizedTransaction[];
  individualEstimate: IndividualEstimate;
  corpEstimate: CorporateEstimate;
  entityName: string;
  capitalStock: number;
  openingCash: number;
  shareCount?: number;
}) {
  const [individualDoc, setIndividualDoc] = useState<IndividualDocType>("blueReturn");
  const [corpDoc, setCorpDoc] = useState<CorpDocType>("financialStatements");
  // 青色申告特別控除額（65万/55万/10万円）の判定に使う記帳方法・申告方法。
  // 既定値は最大控除額を一律適用しないよう保守的な組み合わせ（複式簿記・書面提出＝55万円）。
  const [bookkeepingMethod, setBookkeepingMethod] = useState<BookkeepingMethod>("double");
  const [filingMethod, setFilingMethod] = useState<FilingMethod>("paper");

  const pl = buildProfitLossStatement(rows);
  const consumptionForm = buildConsumptionTaxForm(rows);
  const tabs = mode === "corp" ? CORP_DOC_TABS : INDIVIDUAL_DOC_TABS;
  const active = mode === "corp" ? corpDoc : individualDoc;
  const blueReturnOptions = { bookkeepingMethod, filingMethod };
  // 個人事業主向けの書類は、渡された概算値ではなく上記の選択を反映した最新の概算値で表示する
  const effectiveIndividualEstimate =
    mode === "individual" ? estimateForIndividual(rows, blueReturnOptions) : individualEstimate;

  return (
    <div>
      {mode === "individual" && (
        <div className="flex flex-wrap items-end gap-4 mb-4 print:hidden">
          <label className="flex flex-col gap-1 text-xs text-stone-500">
            記帳方法
            <select
              value={bookkeepingMethod}
              onChange={(e) => setBookkeepingMethod(e.target.value as BookkeepingMethod)}
              className="border border-stone-400 bg-white px-3 py-2 text-sm outline-none focus:border-stone-600"
            >
              <option value="double">複式簿記（貸借対照表を作成）</option>
              <option value="simple">簡易簿記（単式簿記）</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-stone-500">
            申告方法
            <select
              value={filingMethod}
              onChange={(e) => setFilingMethod(e.target.value as FilingMethod)}
              disabled={bookkeepingMethod === "simple"}
              className="border border-stone-400 bg-white px-3 py-2 text-sm outline-none focus:border-stone-600 disabled:bg-stone-100 disabled:text-stone-400"
            >
              <option value="paper">書面提出</option>
              <option value="eTax">e-Tax電子申告</option>
              <option value="electronicBooks">優良な電子帳簿保存</option>
            </select>
          </label>
          <p className="text-xs text-stone-400 max-w-sm leading-relaxed">
            青色申告特別控除額（65万円/55万円/10万円）の判定に使用します。要件を満たすか不明な場合は「複式簿記・書面提出」のままにしてください。
          </p>
        </div>
      )}

      <div className="flex gap-2 mb-4 flex-wrap print:hidden">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            aria-pressed={active === t.key}
            onClick={() => (mode === "corp" ? setCorpDoc(t.key as CorpDocType) : setIndividualDoc(t.key as IndividualDocType))}
            className={`text-sm px-4 py-2 border transition-colors ${
              active === t.key
                ? "bg-stone-900 border-stone-900 text-white"
                : "bg-white border-stone-400 text-stone-600 hover:border-stone-600"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div id="print-area" className="bg-white border border-stone-300 p-4 sm:p-8 print:border-0 print:p-0">
        {mode === "individual" ? (
          <IndividualDocuments
            doc={individualDoc}
            rows={rows}
            estimate={effectiveIndividualEstimate}
            entityName={entityName}
            pl={pl}
            blueReturnOptions={blueReturnOptions}
          />
        ) : (
          <CorpDocuments
            doc={corpDoc}
            rows={rows}
            pl={pl}
            estimate={corpEstimate}
            consumptionForm={consumptionForm}
            entityName={entityName}
            capitalStock={capitalStock}
            openingCash={openingCash}
            shareCount={shareCount}
          />
        )}
      </div>
    </div>
  );
}

function IndividualDocuments({
  doc,
  rows,
  estimate,
  entityName,
  pl,
  blueReturnOptions,
}: {
  doc: IndividualDocType;
  rows: CategorizedTransaction[];
  estimate: IndividualEstimate;
  entityName: string;
  pl: ReturnType<typeof buildProfitLossStatement>;
  blueReturnOptions: { bookkeepingMethod: BookkeepingMethod; filingMethod: FilingMethod };
}) {
  if (doc === "blueReturn") {
    const blueReturn = buildBlueReturnStatement(rows, blueReturnOptions);
    return (
      <>
        <DocHeader title="所得税青色申告決算書（一般用）－ 損益計算書" entityName={entityName} periodStart={pl.periodStart} periodEnd={pl.periodEnd} />
        <FormTable title="収入" rows={[{ label: "売上（収入）金額", amount: blueReturn.salesTotal, strong: true }]} />
        <FormTable
          title="経費（標準科目）"
          rows={blueReturn.standardExpenseLines.map((l) => ({
            label: l.label + (l.unsupported ? "（本アプリ未対応・要手入力）" : ""),
            amount: l.amount,
            muted: l.unsupported,
          }))}
        />
        {blueReturn.otherExpenseLines.length > 0 && (
          <FormTable title="その他経費（様式の空欄科目に相当）" rows={blueReturn.otherExpenseLines.map((l) => ({ label: l.label, amount: l.amount }))} />
        )}
        <FormTable
          title="所得金額の計算"
          rows={[
            { label: "経費計", amount: blueReturn.expenseTotal },
            { label: "差引金額", amount: blueReturn.incomeBeforeBlueDeduction },
            { label: "青色申告特別控除額", amount: blueReturn.blueReturnDeduction },
            { label: "所得金額", amount: blueReturn.incomeAfterBlueDeduction, strong: true },
          ]}
        />
      </>
    );
  }

  if (doc === "accountBreakdown") {
    const breakdowns = buildAccountBreakdownForms(rows);
    return (
      <>
        <DocHeader title="地代家賃・外注費等の内訳（簡易版）" entityName={entityName} periodStart={pl.periodStart} periodEnd={pl.periodEnd} />
        <p className="text-xs text-amber-700 mb-6">
          青色申告決算書の「地代家賃の内訳」「利子割引料の内訳」等に相当する内訳を、摘要文字列ベースの取引先別に表示しています。取引先名の表記ゆれは統合していません。
        </p>
        {breakdowns.length === 0 && (
          <p className="text-sm text-stone-500">内訳の対象となる科目（地代家賃・外注費・広告宣伝費等）の取引がありませんでした。</p>
        )}
        {breakdowns.map((b) => (
          <FormTable
            key={b.account}
            title={`${b.account}の内訳書`}
            rows={[
              ...b.lines.map((l) => ({
                label: `${l.counterparty}${l.transactionCount > 1 ? `（${l.transactionCount}件）` : ""}`,
                amount: l.amount,
              })),
              { label: "計", amount: b.total, strong: true },
            ]}
          />
        ))}
      </>
    );
  }

  if (doc === "incomeTaxReturn") {
    const returnForm = buildIndividualReturnForm(estimate);
    return (
      <>
        <DocHeader title="所得税及び復興特別所得税の確定申告書 第一表" entityName={entityName} periodStart={pl.periodStart} periodEnd={pl.periodEnd} />
        <OfficialFormFrame scheduleLabel="確定申告書 第一表" formTitle="所得税及び復興特別所得税の申告書">
          <OfficialSection title="収入金額等">
            {returnForm.incomeSection.map((r, i) => (
              <OfficialRow key={i} label={r.label} symbol={r.symbol} amount={r.amount} />
            ))}
          </OfficialSection>
          <OfficialSection title="所得金額等">
            {returnForm.incomeAmountSection.map((r, i) => (
              <OfficialRow key={i} label={r.label} symbol={r.symbol} amount={r.amount} strong={r.symbol === "⑫"} />
            ))}
          </OfficialSection>
          <OfficialSection title="所得から差し引かれる金額">
            {returnForm.deductionSection.map((r, i) => (
              <OfficialRow key={i} label={r.label} symbol={r.symbol} amount={r.amount} strong={r.symbol === "㉖"} />
            ))}
          </OfficialSection>
          <OfficialSection title="税金の計算">
            {returnForm.taxSection.map((r, i) => (
              <OfficialRow key={i} label={r.label} symbol={r.symbol} amount={r.amount} strong={r.symbol === "㊷"} />
            ))}
          </OfficialSection>
        </OfficialFormFrame>
        <div className="mt-3">
          <TaxEstimateExplanationPanel steps={explainIndividualEstimateCalculation(estimate)} />
        </div>
        {estimate.lifeInsurancePaidInfo > 0 && (
          <p className="text-xs text-amber-700 mt-3">
            生命保険料の支払い {yen.format(estimate.lifeInsurancePaidInfo)}円 は参考表示のみです。生命保険料控除（上限あり）はご自身で計算し、上記「所得から差し引かれる金額」に加算してください。
          </p>
        )}
        <p className="text-xs text-stone-500 mt-3">
          住民税・事業税は、この確定申告書のデータが税務署から自治体へ送付されるため、通常は個人で別途申告書を作成する必要はありません（給与所得がある場合等を除く）。
        </p>
      </>
    );
  }

  return (
    <>
      <DocHeader title="消費税及び地方消費税の申告書" entityName={entityName} periodStart={pl.periodStart} periodEnd={pl.periodEnd} />
      <ConsumptionTaxOfficialBody rows={rows} />
    </>
  );
}

function CorpDocuments({
  doc,
  rows,
  pl,
  estimate,
  consumptionForm,
  entityName,
  capitalStock,
  openingCash,
  shareCount,
}: {
  doc: CorpDocType;
  rows: CategorizedTransaction[];
  pl: ReturnType<typeof buildProfitLossStatement>;
  estimate: CorporateEstimate;
  consumptionForm: ReturnType<typeof buildConsumptionTaxForm>;
  entityName: string;
  capitalStock: number;
  openingCash: number;
  shareCount?: number;
}) {
  const [subsequentEvents, setSubsequentEvents] = useState("");
  const taxForm = buildCorporateTaxForm(estimate);
  const localTaxForm = buildLocalCorporateTaxForm(estimate, taxForm);
  const fs = buildFinancialStatements(pl, taxForm, entityName || "（法人名未入力）", localTaxForm.grandTotal);

  if (doc === "financialStatements") {
    // 貸借対照表・株主資本等変動計算書は、税込経理の慣行に合わせ
    // 未払消費税等も反映した「調整後・当期純利益」で繰越利益剰余金を計算する。
    const bsNetIncome = fs.incomeBeforeTax - fs.taxes - consumptionForm.totalDue;
    const bs = buildBalanceSheetForm(
      { capitalStock, openingCash, shareCount },
      pl.incomeTotal,
      pl.expenseTotal,
      fs.taxes,
      consumptionForm.totalDue,
      bsNetIncome
    );
    const officerCompTotal = rows
      .filter((r) => r.account === "役員報酬")
      .reduce((s, r) => s + Math.abs(r.amount), 0);

    return (
      <>
        <DocHeader title="決算報告書" entityName={entityName} periodStart={pl.periodStart} periodEnd={pl.periodEnd} />

        <h3 className="text-base font-semibold mb-3">貸借対照表</h3>
        <FormTable
          title="資産の部"
          rows={[
            { label: "現金及び預金", amount: bs.endingCash },
            { label: "資産の部合計", amount: bs.assetsTotal, strong: true },
          ]}
        />
        <FormTable
          title="負債の部"
          rows={[
            { label: "未払法人税等（法人税・地方法人税・住民税・事業税等）", amount: bs.unpaidCorporateTaxes },
            { label: "未払消費税等", amount: bs.unpaidConsumptionTax },
            { label: "負債の部合計", amount: bs.liabilitiesTotal, strong: true },
          ]}
        />
        <FormTable
          title="純資産の部"
          rows={[
            { label: "資本金", amount: bs.capitalStock },
            { label: "繰越利益剰余金", amount: bs.retainedEarningsEnding },
            { label: "純資産の部合計", amount: bs.netAssetsTotal, strong: true },
          ]}
        />
        <p className={`text-xs mb-6 ${bs.balanced ? "text-stone-400" : "text-red-700"}`}>
          {bs.balanced
            ? "検算: 資産合計＝負債＋純資産合計（一致）"
            : "検算エラー: 資産合計と負債＋純資産合計が一致していません。入力値をご確認ください。"}
          　固定資産・売掛金・借入金等、現金以外の資産負債はこのアプリでは反映されません。
        </p>

        <h3 className="text-base font-semibold mb-3 mt-8">損益計算書</h3>
        <FormTable title="売上高" rows={[{ label: "売上高合計", amount: pl.incomeTotal - fs.nonOperatingIncome, strong: true }]} />
        <FormTable
          title="販売費及び一般管理費（内訳）"
          rows={pl.expenseLines.filter((l) => l.account !== "雑損失").map((l) => ({ label: l.account, amount: l.amount }))}
        />
        <FormTable
          title="営業外損益・税引後利益"
          rows={[
            { label: "営業利益金額", amount: fs.operatingIncome, strong: true },
            { label: "営業外収益合計（受取利息・雑収入等）", amount: fs.nonOperatingIncome },
            { label: "営業外費用合計（雑損失等）", amount: fs.nonOperatingExpense },
            { label: "経常利益金額", amount: fs.ordinaryIncome, strong: true },
            { label: "税引前当期純利益金額", amount: fs.incomeBeforeTax },
            { label: "法人税、住民税及び事業税（概算合計）", amount: fs.taxes },
            { label: "当期純利益金額（概算）", amount: fs.netIncome, strong: true },
          ]}
        />

        <h3 className="text-base font-semibold mb-3 mt-8">株主資本等変動計算書</h3>
        <FormTable
          title="資本金"
          rows={[
            { label: "当期首残高", amount: bs.capitalStock },
            { label: "当期変動額", amount: 0 },
            { label: "当期末残高", amount: bs.capitalStock, strong: true },
          ]}
        />
        <FormTable
          title="繰越利益剰余金"
          rows={[
            { label: "当期首残高", amount: bs.openingRetainedEarnings },
            { label: "当期変動額（当期純利益金額）", amount: bs.netIncome },
            { label: "当期末残高", amount: bs.retainedEarningsEnding, strong: true },
          ]}
        />
        <FormTable
          title="純資産の部合計"
          rows={[
            { label: "当期首残高", amount: bs.openingRetainedEarnings + bs.capitalStock },
            { label: "当期変動額", amount: bs.netIncome },
            { label: "当期末残高", amount: bs.netAssetsTotal, strong: true },
          ]}
        />
        {bs.netIncome !== fs.netIncome && (
          <p className="text-xs text-stone-500 mb-6">
            株主資本等変動計算書の当期純利益は、貸借対照表を一致させるため未払消費税等（{yen.format(consumptionForm.totalDue)}円）も控除した金額（
            {yen.format(bs.netIncome)}円）を使用しています。損益計算書上の表示（{yen.format(fs.netIncome)}円）とは、消費税の扱いの分だけ差があります。
          </p>
        )}

        <h3 className="text-base font-semibold mb-3 mt-8">個別注記表</h3>
        <div className="text-xs font-semibold text-stone-500 mb-1">重要な会計方針に係る事項に関する注記</div>
        <ul className="text-sm text-stone-600 list-disc list-inside space-y-1 mb-6">
          <li>消費税等の会計処理：税込方式を採用しています</li>
          <li>資産の評価基準・固定資産の減価償却方法：このアプリは固定資産・棚卸資産の情報を保持していないため記載していません（該当がある場合はご自身で追記してください）</li>
        </ul>
        <FormTable
          title="株主資本等変動計算書に関する注記"
          rows={
            shareCount
              ? [{ label: "発行済株式の種類及び総数（普通株式）", amount: shareCount }]
              : []
          }
        />
        {!shareCount && <p className="text-xs text-stone-400 -mt-4 mb-6">発行済株式数が未入力のため記載していません。</p>}
        {shareCount && bs.netAssetPerShare !== undefined && (
          <FormTable
            title="一株当たり情報に関する注記"
            rows={[
              { label: "一株当たり純資産額（円）", amount: bs.netAssetPerShare },
              { label: "一株当たり当期純利益金額（円）", amount: bs.netIncomePerShare ?? 0 },
            ]}
          />
        )}

        <div className="text-xs font-semibold text-stone-500 mb-1 mt-4">関連当事者との取引に関する注記</div>
        {officerCompTotal > 0 ? (
          <FormTable title="役員に対する報酬の支払い" rows={[{ label: "役員報酬（取引明細から集計）", amount: officerCompTotal, strong: true }]} />
        ) : (
          <p className="text-sm text-stone-600 mb-6">取引明細から役員報酬の支払いは検出されませんでした。役員貸付金・借入金等、取引明細に現れない関連当事者取引がある場合は別途記載してください。</p>
        )}

        <label htmlFor="subsequentEvents" className="block text-xs font-semibold text-stone-500 mb-1 mt-4">
          重要な後発事象に関する注記
        </label>
        <textarea
          id="subsequentEvents"
          className="print:hidden w-full border border-stone-300 rounded px-2 py-1.5 text-sm mb-2"
          rows={2}
          value={subsequentEvents}
          onChange={(e) => setSubsequentEvents(e.target.value)}
          placeholder="決算日後に生じた重要な事象があれば記載してください（例：増資、大口契約の獲得等）。なければ空欄のままで構いません。"
        />
        <p className="text-sm text-stone-600 mb-6">{subsequentEvents || "特記事項なし"}</p>
      </>
    );
  }

  if (doc === "accountBreakdown") {
    const breakdowns = buildAccountBreakdownForms(rows);
    return (
      <>
        <DocHeader title="勘定科目内訳明細書（簡易版）" entityName={entityName} periodStart={pl.periodStart} periodEnd={pl.periodEnd} />
        <p className="text-xs text-amber-700 mb-6">
          このアプリは取引明細（フロー情報）のみを保持しているため、正式様式にある現金預金・売掛金・買掛金・借入金等（期末残高が前提の科目）は作成できません。
          明細から機械的に内訳を算出できる主要な損益科目のみを、摘要文字列ベースの取引先別に表示しています。取引先名の表記ゆれは統合していません。
        </p>
        {breakdowns.length === 0 && (
          <p className="text-sm text-stone-500">内訳の対象となる科目（地代家賃・外注費・広告宣伝費等）の取引がありませんでした。</p>
        )}
        {breakdowns.map((b) => (
          <FormTable
            key={b.account}
            title={`${b.account}の内訳書`}
            rows={[
              ...b.lines.map((l) => ({
                label: `${l.counterparty}${l.transactionCount > 1 ? `（${l.transactionCount}件）` : ""}`,
                amount: l.amount,
              })),
              { label: "計", amount: b.total, strong: true },
            ]}
          />
        ))}
      </>
    );
  }

  if (doc === "businessOverview") {
    return <BusinessOverviewSection entityName={entityName} pl={pl} rows={rows} />;
  }

  if (doc === "corporateTaxReturn") {
    return (
      <>
        <DocHeader title="法人税及び地方法人税の申告書 別表一（簡易版）" entityName={entityName} periodStart={pl.periodStart} periodEnd={pl.periodEnd} />
        <OfficialFormFrame scheduleLabel="別表一" formTitle="各事業年度の所得に係る申告書">
          <OfficialSection title="法人税額の計算">
            <OfficialRow label="所得金額又は欠損金額" symbol="(1)" amount={taxForm.line1_income} />
            <OfficialRow label="中小法人等の年800万円相当額以下の金額" symbol="(45)" amount={taxForm.line45_reducedBase} indent />
            <OfficialRow label="(45)の15%相当額" symbol="(48)" amount={taxForm.line48_reducedTax} indent />
            <OfficialRow label="その他の所得金額" symbol="(47)" amount={taxForm.line47_excessBase} indent />
            <OfficialRow label="(47)の23.2%相当額" symbol="(50)" amount={taxForm.line50_excessTax} indent />
            <OfficialRow label="法人税額" symbol="(2)" amount={taxForm.line2_corporateTax} strong />
            <OfficialRow label="差引確定法人税額" symbol="(15)" amount={taxForm.line15_finalCorporateTax} strong />
          </OfficialSection>
          <OfficialSection title="地方法人税額の計算">
            <OfficialRow label="所得の金額に対する法人税額" symbol="(28)" amount={taxForm.line28_localTaxBase} />
            <OfficialRow label="(28)の10.3%相当額" symbol="(31)" amount={taxForm.line31_localCorporateTax} />
            <OfficialRow label="差引確定地方法人税額" symbol="(40)" amount={taxForm.line40_finalLocalCorporateTax} strong />
          </OfficialSection>
          <OfficialSection title="国税合計">
            <OfficialRow label="法人税+地方法人税 合計" amount={taxForm.totalNationalTax} strong />
          </OfficialSection>
        </OfficialFormFrame>
        <p className="text-xs text-amber-700 mt-3">
          別表二（同族会社判定）・別表五（一）（利益積立金）・別表十四（寄付金）・別表十五（交際費）・別表十六（減価償却）等の詳細な調整項目は含まれていません。所得金額の計算過程は「所得金額の計算（別表四）」タブをご覧ください。
        </p>
        <div className="mt-3">
          <TaxEstimateExplanationPanel steps={explainCorporateEstimateCalculation(estimate)} />
        </div>
      </>
    );
  }

  if (doc === "incomeAdjustment") {
    const adjustmentForm = buildIncomeAdjustmentForm(fs, taxForm);
    return (
      <>
        <DocHeader title="所得の金額の計算に関する明細書 別表四（簡易版）" entityName={entityName} periodStart={pl.periodStart} periodEnd={pl.periodEnd} />
        <p className="text-xs text-amber-700 mb-4">
          減価償却超過額・交際費等の損金不算入額・受取配当等の益金不算入額・繰越欠損金の当期控除額など、詳細な加算・減算項目は考慮していません。
          反映しているのは「損金経理をした納税充当金」（当期に費用計上した未払法人税等は税務上その事業年度の損金にならないため所得に加算する処理）のみです。
        </p>
        <OfficialFormFrame scheduleLabel="別表四" formTitle="所得の金額の計算に関する明細書">
          <OfficialSection title="当期利益・加算・減算">
            <OfficialRow label="当期利益又は当期欠損の額" symbol="(1)" amount={adjustmentForm.line1_currentNetIncome} strong />
            {adjustmentForm.additionLines.map((l, i) => (
              <OfficialRow key={`add-${i}`} label={l.label} amount={l.amount} indent />
            ))}
            <OfficialRow label="加算 小計" symbol="(10)" amount={adjustmentForm.line10_additionSubtotal} />
            {adjustmentForm.subtractionLines.length === 0 ? (
              <OfficialRow label="減算（該当なし）" symbol="(16)" amount={0} indent />
            ) : (
              adjustmentForm.subtractionLines.map((l, i) => (
                <OfficialRow key={`sub-${i}`} label={l.label} amount={l.amount} indent />
              ))
            )}
          </OfficialSection>
          <OfficialSection title="所得金額の計算">
            <OfficialRow label="仮計" symbol="(17)" amount={adjustmentForm.line17_interimTotal} />
            <OfficialRow label="所得金額又は欠損金額" symbol="(34)" amount={adjustmentForm.line34_totalIncome} strong />
          </OfficialSection>
        </OfficialFormFrame>
        {!adjustmentForm.reconcilesWithFormOne && (
          <p className="text-xs text-amber-700 mt-3">
            この所得金額（{yen.format(adjustmentForm.line34_totalIncome)}円）は別表一の所得金額（{yen.format(taxForm.line1_income)}円）と一致していません。
            当期が赤字の場合、このアプリは繰越欠損金の管理に対応していないため別表一側は0円として扱っています。黒字の場合は千円未満の端数処理による差です。
          </p>
        )}
      </>
    );
  }

  if (doc === "localTaxReturn") {
    return (
      <>
        <DocHeader title="法人住民税・法人事業税及び特別法人事業税の申告書（概算）" entityName={entityName} periodStart={pl.periodStart} periodEnd={pl.periodEnd} />
        <p className="text-xs text-amber-700 mb-4">
          資本金1億円以下の中小法人（外形標準課税対象外）が、東京都23区内に事務所を1か所（資本金1,000万円以下・従業者数50人以下）設置している標準的なケースを前提にした概算です。
          23区以外は道府県民税・市町村民税に分けてそれぞれ別に申告・納付し、税率・均等割額も自治体により異なります。必ず本社所在地の都道府県・市区町村でご確認ください。
        </p>
        <OfficialFormFrame scheduleLabel="都民税・事業税 申告書" formTitle="法人都道府県民税・市町村民税・事業税・特別法人事業税 申告書">
          <OfficialSection title="法人住民税（都民税・23区前提）">
            <OfficialRow label="均等割" amount={localTaxForm.perCapitaTax} />
            <OfficialRow label="法人税割（法人税額×7.0%）" amount={localTaxForm.corporateTaxLevy} />
            <OfficialRow label="法人住民税 合計" amount={localTaxForm.inhabitantTaxTotal} strong />
          </OfficialSection>
          <OfficialSection title="法人事業税（所得割・3段階税率）">
            <OfficialRow label="年400万円以下の部分（3.5%）" amount={localTaxForm.businessTaxByBracket[0].tax} />
            <OfficialRow label="年400万円超800万円以下の部分（5.3%）" amount={localTaxForm.businessTaxByBracket[1].tax} />
            <OfficialRow label="年800万円超の部分（7.0%）" amount={localTaxForm.businessTaxByBracket[2].tax} />
            <OfficialRow label="事業税 所得割 合計" amount={localTaxForm.businessTaxSubtotal} strong />
          </OfficialSection>
          <OfficialSection title="特別法人事業税・総合計">
            <OfficialRow label="特別法人事業税（事業税所得割額×37%）" amount={localTaxForm.specialBusinessTax} />
            <OfficialRow label="事業税＋特別法人事業税 合計" amount={localTaxForm.businessTaxTotal} strong />
            <OfficialRow label="住民税＋事業税等 総合計（概算）" amount={localTaxForm.grandTotal} strong />
          </OfficialSection>
        </OfficialFormFrame>
      </>
    );
  }

  if (doc === "form5_1") {
    // このタブも form5_2 タブと同じく初年度（前期からの繰越なし・中間申告なし）を既定表示とする。
    // 繰越損益金は貸借対照表・株主資本等変動計算書（financialStatementsタブ）と一致させる
    // 必要があるため、消費税調整前のfs.netIncomeではなく、未払消費税等を控除した
    // bsNetIncome相当（financialStatementsタブと同じ計算式）を使う。
    const bsNetIncomeForRetained = fs.incomeBeforeTax - fs.taxes - consumptionForm.totalDue;
    const equityChange = buildEquityChangeForm({ capitalStock, openingCash, netIncome: bsNetIncomeForRetained });
    const form5_2ForRetained = buildForm5_2({
      priorYearUnpaid: undefined,
      interimTax: null,
      finalNationalTax: taxForm.totalNationalTax,
      finalPrefectureTax: localTaxForm.inhabitantTaxTotal,
      finalMunicipalityTax: 0,
      finalBusinessTax: localTaxForm.businessTaxTotal,
    });
    const form5_1 = buildForm5_1({ equityChange, form5_2: form5_2ForRetained, capitalStock });

    return (
      <>
        <DocHeader
          title="利益積立金額及び資本金等の額の計算に関する明細書 別表五（一）（簡易版）"
          entityName={entityName}
          periodStart={pl.periodStart}
          periodEnd={pl.periodEnd}
        />
        <p className="text-xs text-amber-700 mb-4">
          利益準備金・積立金等の個別の税務調整項目（row1〜24）・未払通算税効果額（row28）は対象外です。Ⅱ「資本金等の額の計算」は資本準備金・その他資本剰余金の増減（増資・減資・自己株式取得等）が当期中に発生していない前提です。期首時点の未納税額・前期実績はこのアプリで保持していないため、初年度（前期からの繰越なし）として表示しています。金額欄の「△」はマイナス（控除）を表します。
        </p>
        <OfficialFormFrame scheduleLabel="別表五（一）" formTitle="利益積立金額及び資本金等の額の計算に関する明細書">
          <OfficialSection title="Ⅰ 利益積立金額の計算">
            <RetainedEarningsLineRows line={form5_1.retainedEarningsCarriedForward} rowNumber="25" />
            <RetainedEarningsLineRows line={form5_1.taxProvision} rowNumber="26" />
            <RetainedEarningsLineRows line={form5_1.unpaidNationalTax} rowNumber="27" />
            <RetainedEarningsLineRows line={form5_1.unpaidPrefectureTax} rowNumber="29" />
            <RetainedEarningsLineRows line={form5_1.unpaidMunicipalityTax} rowNumber="30" />
            <RetainedEarningsLineRows line={form5_1.retainedEarningsTotal} rowNumber="31" />
          </OfficialSection>
          <OfficialSection title="Ⅱ 資本金等の額の計算">
            <RetainedEarningsLineRows line={form5_1.capitalStock} rowNumber="32" />
            <RetainedEarningsLineRows line={form5_1.capitalTotal} rowNumber="36" />
          </OfficialSection>
        </OfficialFormFrame>
      </>
    );
  }

  if (doc === "form5_2") {
    // このタブは初年度（前期からの未納繰越なし・中間申告なし）のケースを既定表示とする。
    // このアプリは期首時点の未納税額や前期実績を保持していないため、前期分の入力欄は設けていない。
    const form5_2 = buildForm5_2({
      priorYearUnpaid: undefined,
      interimTax: null,
      finalNationalTax: taxForm.totalNationalTax,
      finalPrefectureTax: localTaxForm.inhabitantTaxTotal,
      finalMunicipalityTax: 0,
      finalBusinessTax: localTaxForm.businessTaxTotal,
    });
    const taxTypeRows = [
      form5_2.nationalTaxRow,
      form5_2.prefectureTaxRow,
      form5_2.municipalityTaxRow,
      form5_2.businessTaxRow,
    ];

    return (
      <>
        <DocHeader
          title="租税公課の納付状況等に関する明細書 別表五（二）（簡易版）"
          entityName={entityName}
          periodStart={pl.periodStart}
          periodEnd={pl.periodEnd}
        />
        <p className="text-xs text-amber-700 mb-4">
          道府県民税・市町村民税・事業税の中間納付額の計算には対応していないため、常に中間分0円として扱っています。「その他」区分（利子税・延滞金・加算税及び加算金・延滞税・過怠税）の実額計算、通算法人の通算税効果額の発生状況等の明細は対象外です。
          期首時点の未納税額・前期実績はこのアプリで保持していないため、初年度（前期からの繰越なし）として表示しています。
        </p>
        <OfficialFormFrame scheduleLabel="別表五（二）" formTitle="租税公課の納付状況等に関する明細書">
          {taxTypeRows.map((row) => (
            <OfficialSection key={row.label} title={row.label}>
              <OfficialRow label="期首現在未納税額" symbol="①" amount={row.openingUnpaid} />
              <OfficialRow label="当期発生税額（中間分）" symbol="②" amount={row.interimAccrued} indent />
              <OfficialRow label="当期発生税額（確定分）" symbol="②" amount={row.finalAccrued} indent />
              <OfficialRow label="損金経理による納付（中間分）" symbol="⑤" amount={row.interimPaidByDeduction} />
              <OfficialRow label="期末現在未納税額" symbol="⑥" amount={row.closingUnpaid} strong />
            </OfficialSection>
          ))}
          <OfficialSection title="納税充当金の計算">
            <OfficialRow label="期首納税充当金" amount={form5_2.taxProvision.openingProvision} />
            <OfficialRow label="繰入額（損金経理をした納税充当金）" amount={form5_2.taxProvision.addition} indent />
            <OfficialRow label="取崩額" amount={form5_2.taxProvision.withdrawal} indent />
            <OfficialRow label="期末納税充当金" amount={form5_2.taxProvision.closingProvision} strong />
          </OfficialSection>
        </OfficialFormFrame>
        {form5_2.taxProvision.addition !== fs.taxes && (
          <p className="text-xs text-amber-700 mt-3">
            納税充当金の繰入額（{yen.format(form5_2.taxProvision.addition)}円）が決算報告書の法人税等（
            {yen.format(fs.taxes)}円）と一致していません。入力値をご確認ください。
          </p>
        )}
      </>
    );
  }

  return (
    <>
      <DocHeader title="消費税及び地方消費税の申告書" entityName={entityName} periodStart={pl.periodStart} periodEnd={pl.periodEnd} />
      <ConsumptionTaxOfficialBody rows={rows} />
    </>
  );
}

function BusinessOverviewSection({
  entityName,
  pl,
  rows,
}: {
  entityName: string;
  pl: ReturnType<typeof buildProfitLossStatement>;
  rows: CategorizedTransaction[];
}) {
  const [industry, setIndustry] = useState("");
  const [businessDescription, setBusinessDescription] = useState("");
  const [employeeCount, setEmployeeCount] = useState("");
  const [mainClients, setMainClients] = useState("");
  const monthlySales = buildMonthlySalesTrend(rows);

  const inputClass = "w-full border border-stone-300 rounded px-2 py-1.5 text-sm";

  return (
    <>
      <DocHeader title="事業概況説明書（簡易版）" entityName={entityName} periodStart={pl.periodStart} periodEnd={pl.periodEnd} />
      <p className="text-xs text-amber-700 mb-6">
        正式様式にある「経理の方法」「海外取引状況」等の項目は本アプリでは対応していません。以下は基本項目のみの簡易版です。
      </p>

      <div className="print:hidden grid gap-4 mb-8 bg-stone-50 border border-stone-200 rounded p-4">
        <div>
          <label htmlFor="bo-industry" className="block text-xs font-semibold text-stone-500 mb-1">業種</label>
          <input id="bo-industry" className={inputClass} value={industry} onChange={(e) => setIndustry(e.target.value)} placeholder="例：ソフトウェア受託開発業" />
        </div>
        <div>
          <label htmlFor="bo-description" className="block text-xs font-semibold text-stone-500 mb-1">事業内容の概要</label>
          <textarea id="bo-description" className={inputClass} rows={3} value={businessDescription} onChange={(e) => setBusinessDescription(e.target.value)} placeholder="例：法人向け業務システムの受託開発・保守" />
        </div>
        <div>
          <label htmlFor="bo-employeeCount" className="block text-xs font-semibold text-stone-500 mb-1">従業者数（役員含む）</label>
          <input id="bo-employeeCount" className={inputClass} value={employeeCount} onChange={(e) => setEmployeeCount(e.target.value)} placeholder="例：1名" />
        </div>
        <div>
          <label htmlFor="bo-mainClients" className="block text-xs font-semibold text-stone-500 mb-1">主要な取引先</label>
          <textarea id="bo-mainClients" className={inputClass} rows={2} value={mainClients} onChange={(e) => setMainClients(e.target.value)} placeholder="例：株式会社〇〇（売上構成比の高い順に）" />
        </div>
      </div>

      <div className="mb-8 text-sm space-y-2">
        <div><span className="text-stone-500 text-xs mr-2">業種</span>{industry || "（未入力）"}</div>
        <div><span className="text-stone-500 text-xs mr-2">事業内容</span>{businessDescription || "（未入力）"}</div>
        <div><span className="text-stone-500 text-xs mr-2">従業者数</span>{employeeCount || "（未入力）"}</div>
        <div><span className="text-stone-500 text-xs mr-2">主要な取引先</span>{mainClients || "（未入力）"}</div>
      </div>

      <h3 className="text-base font-semibold mb-3">売上高の月別推移</h3>
      {monthlySales.length === 0 ? (
        <p className="text-sm text-stone-500">売上（収入）データがありませんでした。</p>
      ) : (
        <FormTable
          title="月別売上高"
          rows={[
            ...monthlySales.map((m) => ({ label: `${m.month}（${m.transactionCount}件）`, amount: m.amount })),
            { label: "合計", amount: monthlySales.reduce((s, m) => s + m.amount, 0), strong: true },
          ]}
        />
      )}
    </>
  );
}

const CONSUMPTION_TAX_METHOD_OPTIONS: { key: ConsumptionTaxMethod; label: string }[] = [
  { key: "general", label: "原則課税" },
  { key: "simplified", label: "簡易課税" },
  { key: "twentyPercentSpecial", label: "2割特例（インボイス経過措置）" },
];

const SIMPLIFIED_BUSINESS_CATEGORIES: SimplifiedBusinessCategory[] = [1, 2, 3, 4, 5, 6];

function ConsumptionTaxOfficialBody({ rows }: { rows: CategorizedTransaction[] }) {
  const [method, setMethod] = useState<ConsumptionTaxMethod>("general");
  const [businessCategory, setBusinessCategory] = useState<SimplifiedBusinessCategory>(5);
  const form = buildConsumptionTaxReturnForm(rows, {
    method,
    simplifiedBusinessCategory: businessCategory,
  });

  return (
    <>
      <div className="print:hidden mb-4 flex flex-wrap items-end gap-4 bg-stone-50 border border-stone-200 rounded p-4">
        <div>
          <label className="block text-xs font-semibold text-stone-500 mb-1" htmlFor="document-preview-consumption-tax-method">課税方式</label>
          <select
            id="document-preview-consumption-tax-method"
            className="border border-stone-300 rounded px-2 py-1.5 text-sm"
            value={method}
            onChange={(e) => setMethod(e.target.value as ConsumptionTaxMethod)}
          >
            {CONSUMPTION_TAX_METHOD_OPTIONS.map((o) => (
              <option key={o.key} value={o.key}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        {method === "simplified" && (
          <div>
            <label className="block text-xs font-semibold text-stone-500 mb-1" htmlFor="document-preview-simplified-business-category">事業区分</label>
            <select
              id="document-preview-simplified-business-category"
              className="border border-stone-300 rounded px-2 py-1.5 text-sm"
              value={businessCategory}
              onChange={(e) => setBusinessCategory(Number(e.target.value) as SimplifiedBusinessCategory)}
            >
              {SIMPLIFIED_BUSINESS_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {SIMPLIFIED_BUSINESS_CATEGORY_LABELS[c]}（みなし仕入率{DEEMED_PURCHASE_RATES[c] * 100}%）
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {form.isLikelyExempt && (
        <p className="text-xs text-amber-700 mb-3">
          課税売上高が1,000万円以下です。基準期間の実績次第で免税事業者となる可能性があります（要確認）。
        </p>
      )}
      {method === "simplified" && (
        <p className="text-xs text-amber-700 mb-3">
          簡易課税は、基準期間の課税売上高が5,000万円以下で、事前に「消費税簡易課税制度選択届出書」を提出している事業者のみ選択できます。複数の事業区分にまたがる場合の按分計算には対応していません。
        </p>
      )}
      {method === "twentyPercentSpecial" && (
        <p className="text-xs text-amber-700 mb-3">
          2割特例は、インボイス発行事業者登録によって免税事業者から課税事業者になった方向けの経過措置（令和8年9月30日を含む課税期間まで）です。基準期間の課税売上高が1,000万円超の場合等は対象外です。
        </p>
      )}

      <OfficialFormFrame scheduleLabel="第一表" formTitle="消費税及び地方消費税の申告書">
        <OfficialSection title="消費税の税額計算">
          <OfficialRow label="課税標準額" symbol="①" amount={form.taxStandardBase} />
          <OfficialRow label="消費税額" symbol="②" amount={form.taxOnSales} />
          <OfficialRow label="控除対象仕入税額" symbol="④" amount={form.deductibleInputTax} indent />
          <OfficialRow label="控除税額小計" symbol="⑦" amount={form.deductionSubtotal} indent />
          <OfficialRow label="差引税額（国税）" symbol="⑨" amount={form.nationalTaxDue} strong />
        </OfficialSection>
        <OfficialSection title="地方消費税の税額計算">
          <OfficialRow label="地方消費税の課税標準となる消費税額" symbol="⑱" amount={form.localTaxBase} />
          <OfficialRow label="納付譲渡割額" symbol="⑳" amount={form.localTaxDue} strong />
        </OfficialSection>
        <OfficialSection title="合計">
          <OfficialRow label="消費税及び地方消費税の合計（納付）税額" symbol="㉖" amount={form.totalDue} strong />
        </OfficialSection>
      </OfficialFormFrame>

      <OfficialFormFrame scheduleLabel="第二表" formTitle="消費税及び地方消費税の課税標準額等の内訳書">
        <OfficialSection title="課税資産の譲渡等の対価の額">
          <OfficialRow label="税率10%分" amount={form.secondTable.standardRate.taxableBase} />
          <OfficialRow label="税率8%（軽減）分" amount={form.secondTable.reducedRate.taxableBase} indent />
          <OfficialRow label="合計" symbol="⑤" amount={form.secondTable.taxStandardBaseTotal} strong />
        </OfficialSection>
        <OfficialSection title="消費税額">
          <OfficialRow label="税率10%分" amount={form.secondTable.standardRate.tax} />
          <OfficialRow label="税率8%（軽減）分" amount={form.secondTable.reducedRate.tax} indent />
          <OfficialRow label="合計" symbol="⑪" amount={form.secondTable.taxOnSalesTotal} strong />
        </OfficialSection>
      </OfficialFormFrame>

      {form.simplifiedAppendix && (
        <OfficialFormFrame scheduleLabel="付表(簡易課税)" formTitle="控除対象仕入税額等の計算表（簡易課税制度用）">
          <OfficialSection title={form.simplifiedAppendix.businessCategoryLabel}>
            <OfficialRow label="課税売上げに係る消費税額" amount={form.taxOnSales} />
            <OfficialRow
              label={`控除対象仕入税額（みなし仕入率${form.simplifiedAppendix.deemedPurchaseRate * 100}%）`}
              amount={form.simplifiedAppendix.deductibleInputTax}
              strong
            />
          </OfficialSection>
        </OfficialFormFrame>
      )}

      {form.twentyPercentSpecialAppendix && (
        <OfficialFormFrame scheduleLabel="2割特例" formTitle="控除対象仕入税額の計算（2割特例）">
          <OfficialSection title="みなし仕入率80%による計算">
            <OfficialRow label="課税売上げに係る消費税額" amount={form.taxOnSales} />
            <OfficialRow
              label="控除対象仕入税額（みなし仕入率80%）"
              amount={form.twentyPercentSpecialAppendix.deductibleInputTax}
              strong
            />
          </OfficialSection>
        </OfficialFormFrame>
      )}
    </>
  );
}
