"use client";

import { useState } from "react";
import { CategorizedTransaction } from "@/lib/categorize/engine";
import { IndividualEstimate } from "@/lib/tax/estimate";
import { CorporateEstimate } from "@/lib/tax/corporateEstimate";
import { buildProfitLossStatement } from "@/lib/tax/plStatement";
import { buildConsumptionTaxForm } from "@/lib/tax/consumptionTaxForm";
import { buildCorporateTaxForm, buildFinancialStatements } from "@/lib/tax/corporateForms";
import { buildLocalCorporateTaxForm } from "@/lib/tax/localCorporateTaxForm";
import { buildBalanceSheetForm } from "@/lib/tax/balanceSheetForm";
import { buildIndividualReturnForm, buildBlueReturnStatement } from "@/lib/tax/individualForms";
import { OfficialFormFrame, OfficialSection, OfficialRow } from "@/components/OfficialForm";

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
      <table className="w-full text-sm border-collapse">
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className={`border-t border-stone-200 ${r.strong ? "font-semibold" : ""}`}>
              <td className="py-1.5 pr-2 w-10 text-stone-400 text-xs align-top">{r.symbol ?? ""}</td>
              <td className={`py-1.5 pr-4 ${r.muted ? "text-stone-400" : ""}`}>{r.label}</td>
              <td className="py-1.5 text-right w-32">
                <Yen v={r.amount} />
                <span className="text-xs text-stone-400"> 円</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
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

type IndividualDocType = "blueReturn" | "incomeTaxReturn" | "consumptionTax";
type CorpDocType = "financialStatements" | "corporateTaxReturn" | "localTaxReturn" | "consumptionTax";

const INDIVIDUAL_DOC_TABS: { key: IndividualDocType; label: string }[] = [
  { key: "blueReturn", label: "青色申告決算書" },
  { key: "incomeTaxReturn", label: "確定申告書（所得税）" },
  { key: "consumptionTax", label: "消費税申告書" },
];

const CORP_DOC_TABS: { key: CorpDocType; label: string }[] = [
  { key: "financialStatements", label: "決算報告書" },
  { key: "corporateTaxReturn", label: "法人税・地方法人税申告書" },
  { key: "localTaxReturn", label: "法人住民税・事業税申告書" },
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

  const pl = buildProfitLossStatement(rows);
  const consumptionForm = buildConsumptionTaxForm(rows);
  const tabs = mode === "corp" ? CORP_DOC_TABS : INDIVIDUAL_DOC_TABS;
  const active = mode === "corp" ? corpDoc : individualDoc;

  return (
    <div>
      <div className="flex gap-2 mb-4 flex-wrap print:hidden">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
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

      <div id="print-area" className="bg-white border border-stone-300 p-8 print:border-0 print:p-0">
        {mode === "individual" ? (
          <IndividualDocuments
            doc={individualDoc}
            rows={rows}
            estimate={individualEstimate}
            entityName={entityName}
            pl={pl}
            consumptionForm={consumptionForm}
          />
        ) : (
          <CorpDocuments
            doc={corpDoc}
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
  consumptionForm,
}: {
  doc: IndividualDocType;
  rows: CategorizedTransaction[];
  estimate: IndividualEstimate;
  entityName: string;
  pl: ReturnType<typeof buildProfitLossStatement>;
  consumptionForm: ReturnType<typeof buildConsumptionTaxForm>;
}) {
  if (doc === "blueReturn") {
    const blueReturn = buildBlueReturnStatement(rows);
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
      <DocHeader title="消費税及び地方消費税の申告書（第一表・概算）" entityName={entityName} periodStart={pl.periodStart} periodEnd={pl.periodEnd} />
      <ConsumptionTaxOfficialBody form={consumptionForm} />
    </>
  );
}

function CorpDocuments({
  doc,
  pl,
  estimate,
  consumptionForm,
  entityName,
  capitalStock,
  openingCash,
  shareCount,
}: {
  doc: CorpDocType;
  pl: ReturnType<typeof buildProfitLossStatement>;
  estimate: CorporateEstimate;
  consumptionForm: ReturnType<typeof buildConsumptionTaxForm>;
  entityName: string;
  capitalStock: number;
  openingCash: number;
  shareCount?: number;
}) {
  const taxForm = buildCorporateTaxForm(estimate);
  const localTaxForm = buildLocalCorporateTaxForm(estimate, taxForm);

  if (doc === "financialStatements") {
    const fs = buildFinancialStatements(pl, taxForm, entityName || "（法人名未入力）", localTaxForm.grandTotal);
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
      </>
    );
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
          別表二（同族会社判定）・別表四（所得の金額の計算）・別表五（利益積立金）・別表十四（寄付金）・別表十五（交際費）・別表十六（減価償却）等の詳細な調整項目は含まれていません。
        </p>
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

  return (
    <>
      <DocHeader title="消費税及び地方消費税の申告書（第一表・概算）" entityName={entityName} periodStart={pl.periodStart} periodEnd={pl.periodEnd} />
      <ConsumptionTaxOfficialBody form={consumptionForm} />
    </>
  );
}

function ConsumptionTaxOfficialBody({ form }: { form: ReturnType<typeof buildConsumptionTaxForm> }) {
  return (
    <>
      {form.isLikelyExempt && (
        <p className="text-xs text-amber-700 mb-3">
          課税売上高が1,000万円以下です。基準期間の実績次第で免税事業者となる可能性があります（要確認）。
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
    </>
  );
}
