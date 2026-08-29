"use client";

import { useMemo, useState } from "react";
import { calculateYearEndAdjustment } from "@/lib/payroll/yearEndAdjustment";
import { buildWithholdingSlip, WithholdingSlipResult } from "@/lib/payroll/withholdingSlip";
import { PrintableStatementLayout } from "@/components/PrintableStatementLayout";
import { OfficialFormFrame, OfficialSection, OfficialRow } from "@/components/OfficialForm";

// ------------------------------------------------------------------
// 年末調整の入力（年間の給与等の総支給額・社会保険料・扶養親族等の数・すでに
// 源泉徴収した税額の合計）と、支払者（会社）・受給者（役員・従業員）の識別情報から、
// 「給与所得の源泉徴収票」の下書きプレビューを作成・印刷／PDF保存するフォーム。
//
// 実際の計算はcalculateYearEndAdjustment（yearEndAdjustment.ts）と
// buildWithholdingSlip（withholdingSlip.ts）という2つの純粋関数に委譲し、
// このコンポーネントはフォーム状態の管理と表示のみを担う。
//
// マイナンバー非保持の原則（docs/cto-tech-architecture.md）に従い、個人番号
// （マイナンバー）の入力欄はこのフォームに一切設けない。
// ------------------------------------------------------------------

const yen = new Intl.NumberFormat("ja-JP", { maximumFractionDigits: 0 });

const inputClass = "w-full border border-stone-400 bg-white px-3 py-2 text-sm outline-none focus:border-stone-600";
const labelClass = "block text-xs text-stone-500 mb-1";

const OUTCOME_LABEL: Record<string, string> = {
  shortfall: "徴収不足（追加で徴収・納付が必要）",
  refund: "過納（本人へ還付すべき金額）",
  exact: "過不足なし",
};

export function WithholdingSlipForm() {
  // 支払者（会社）情報
  const [companyName, setCompanyName] = useState("");
  const [payerAddress, setPayerAddress] = useState("");
  const [corporateNumber, setCorporateNumber] = useState("");
  const [representativeName, setRepresentativeName] = useState("");

  // 支払を受ける者（役員・従業員）情報。個人番号（マイナンバー）は扱わない。
  const [employeeName, setEmployeeName] = useState("");
  const [employeeAddress, setEmployeeAddress] = useState("");
  const [employeeNumber, setEmployeeNumber] = useState("");

  // 対象年・種別
  const [fiscalYear, setFiscalYear] = useState(String(new Date().getFullYear()));
  const [paymentKind, setPaymentKind] = useState("");

  // 年末調整の入力（YearEndAdjustmentCalculatorと同じ4項目）
  const [annualGrossCompensation, setAnnualGrossCompensation] = useState("");
  const [annualSocialInsurancePremium, setAnnualSocialInsurancePremium] = useState("");
  const [dependentCount, setDependentCount] = useState("0");
  const [monthlyWithholdingTotal, setMonthlyWithholdingTotal] = useState("");

  const { slip, error } = useMemo(() => {
    if (employeeName.trim() === "" || companyName.trim() === "" || annualGrossCompensation.trim() === "") {
      return { slip: null as WithholdingSlipResult | null, error: null as string | null };
    }

    try {
      const yearEndAdjustment = calculateYearEndAdjustment({
        annualGrossCompensation: Number(annualGrossCompensation),
        annualSocialInsurancePremium:
          annualSocialInsurancePremium.trim() === "" ? 0 : Number(annualSocialInsurancePremium),
        dependentCount: dependentCount.trim() === "" ? 0 : Number(dependentCount),
        monthlyWithholdingTotal: monthlyWithholdingTotal.trim() === "" ? 0 : Number(monthlyWithholdingTotal),
      });

      const slip = buildWithholdingSlip({
        fiscalYear: Number(fiscalYear),
        employee: {
          name: employeeName,
          address: employeeAddress.trim() || undefined,
          employeeNumber: employeeNumber.trim() || undefined,
        },
        payer: {
          companyName,
          address: payerAddress.trim() || undefined,
          corporateNumber: corporateNumber.trim() || undefined,
          representativeName: representativeName.trim() || undefined,
        },
        yearEndAdjustment,
        paymentKind: paymentKind.trim() || undefined,
      });

      return { slip, error: null as string | null };
    } catch (e) {
      return { slip: null as WithholdingSlipResult | null, error: e instanceof Error ? e.message : "入力内容をご確認ください。" };
    }
  }, [
    companyName,
    payerAddress,
    corporateNumber,
    representativeName,
    employeeName,
    employeeAddress,
    employeeNumber,
    fiscalYear,
    paymentKind,
    annualGrossCompensation,
    annualSocialInsurancePremium,
    dependentCount,
    monthlyWithholdingTotal,
  ]);

  return (
    <div className="flex flex-col gap-8">
      <section className="print:hidden flex flex-col gap-6 bg-stone-50 border border-stone-200 rounded p-4">
        <div>
          <label className={labelClass} htmlFor="slip-fiscal-year">
            対象の年（西暦）
          </label>
          <input
            id="slip-fiscal-year"
            type="number"
            value={fiscalYear}
            onChange={(e) => setFiscalYear(e.target.value)}
            placeholder="例：2026"
            className={`${inputClass} max-w-[10rem]`}
          />
        </div>

        <div>
          <div className="text-xs font-semibold text-stone-500 mb-2">支払者（会社）情報</div>
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className={labelClass} htmlFor="slip-company-name">
                会社の名称
              </label>
              <input
                id="slip-company-name"
                type="text"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                placeholder="例：今ごえん合同会社"
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="slip-payer-address">
                住所（所在地、任意）
              </label>
              <input
                id="slip-payer-address"
                type="text"
                value={payerAddress}
                onChange={(e) => setPayerAddress(e.target.value)}
                placeholder="例：東京都〇〇区…"
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="slip-corporate-number">
                法人番号（13桁、任意）
              </label>
              <input
                id="slip-corporate-number"
                type="text"
                value={corporateNumber}
                onChange={(e) => setCorporateNumber(e.target.value)}
                placeholder="例：1234567890123"
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="slip-representative-name">
                代表者氏名（任意）
              </label>
              <input
                id="slip-representative-name"
                type="text"
                value={representativeName}
                onChange={(e) => setRepresentativeName(e.target.value)}
                placeholder="例：山田 太郎"
                className={inputClass}
              />
            </div>
          </div>
        </div>

        <div>
          <div className="text-xs font-semibold text-stone-500 mb-2">
            支払を受ける者（役員・従業員）情報 ※個人番号（マイナンバー）は入力しません
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className={labelClass} htmlFor="slip-employee-name">
                氏名
              </label>
              <input
                id="slip-employee-name"
                type="text"
                value={employeeName}
                onChange={(e) => setEmployeeName(e.target.value)}
                placeholder="例：山田 太郎"
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="slip-employee-address">
                住所又は居所（任意）
              </label>
              <input
                id="slip-employee-address"
                type="text"
                value={employeeAddress}
                onChange={(e) => setEmployeeAddress(e.target.value)}
                placeholder="例：東京都〇〇区…"
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="slip-employee-number">
                受給者番号（社内管理用、任意）
              </label>
              <input
                id="slip-employee-number"
                type="text"
                value={employeeNumber}
                onChange={(e) => setEmployeeNumber(e.target.value)}
                placeholder="例：E001"
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="slip-payment-kind">
                種別（任意。省略時は「給与・賞与」）
              </label>
              <input
                id="slip-payment-kind"
                type="text"
                value={paymentKind}
                onChange={(e) => setPaymentKind(e.target.value)}
                placeholder="例：給与・賞与、役員報酬"
                className={inputClass}
              />
            </div>
          </div>
        </div>

        <div>
          <div className="text-xs font-semibold text-stone-500 mb-2">年末調整の入力（yearEndAdjustment.tsと同じ内容）</div>
          <div className="flex flex-col gap-4">
            <div>
              <label className={labelClass} htmlFor="slip-annual-gross-compensation">
                年間の給与等の総支給額（月々の役員報酬・給与＋賞与の合計、円）
              </label>
              <input
                id="slip-annual-gross-compensation"
                type="number"
                min="0"
                value={annualGrossCompensation}
                onChange={(e) => setAnnualGrossCompensation(e.target.value)}
                placeholder="例：4000000"
                className={inputClass}
              />
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className={labelClass} htmlFor="slip-annual-social-insurance">
                  年間の社会保険料（健康保険・厚生年金等の合計、円）
                </label>
                <input
                  id="slip-annual-social-insurance"
                  type="number"
                  min="0"
                  value={annualSocialInsurancePremium}
                  onChange={(e) => setAnnualSocialInsurancePremium(e.target.value)}
                  placeholder="例：550000"
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass} htmlFor="slip-dependent-count">
                  控除対象扶養親族等の数（0〜7人以上）
                </label>
                <input
                  id="slip-dependent-count"
                  type="number"
                  min="0"
                  step="1"
                  value={dependentCount}
                  onChange={(e) => setDependentCount(e.target.value)}
                  placeholder="例：0"
                  className={inputClass}
                />
              </div>
            </div>
            <div>
              <label className={labelClass} htmlFor="slip-monthly-withholding-total">
                その年にすでに源泉徴収した所得税額の合計（月々の給与・賞与分、円）
              </label>
              <input
                id="slip-monthly-withholding-total"
                type="number"
                min="0"
                value={monthlyWithholdingTotal}
                onChange={(e) => setMonthlyWithholdingTotal(e.target.value)}
                placeholder="例：132000"
                className={inputClass}
              />
            </div>
          </div>
        </div>

        {error && <p className="text-sm text-red-700">{error}</p>}
      </section>

      {slip ? (
        <PrintableStatementLayout
          tenantName={slip.payer.companyName}
          fiscalYearLabel={slip.fiscalYearLabel}
          printButtonLabel="印刷 / PDFで保存（源泉徴収票）"
          sections={[{ id: "withholding-slip", content: <WithholdingSlipPreview slip={slip} /> }]}
        />
      ) : (
        <p className="text-sm text-stone-500">
          対象の年・支払者情報・受給者の氏名・年間の給与等の総支給額を入力すると、源泉徴収票の下書きプレビューを表示します。
        </p>
      )}
    </div>
  );
}

function WithholdingSlipPreview({ slip }: { slip: WithholdingSlipResult }) {
  return (
    <section className="flex flex-col gap-4">
      <OfficialFormFrame scheduleLabel="法定調書" formTitle={`給与所得の源泉徴収票（${slip.fiscalYearLabel}）`}>
        <OfficialSection title="支払を受ける者">
          <div className="text-sm space-y-1 px-1 py-1">
            <div>住所又は居所: {slip.employee.address || "（未入力）"}</div>
            <div>
              氏名: <span className="font-semibold">{slip.employee.name}</span>
            </div>
            {slip.employee.employeeNumber && (
              <div className="text-xs text-stone-500">受給者番号: {slip.employee.employeeNumber}</div>
            )}
          </div>
        </OfficialSection>

        <OfficialSection title="種別">
          <div className="text-sm px-1 py-1">{slip.paymentKind}</div>
        </OfficialSection>

        <OfficialSection title="支払金額等">
          <OfficialRow label="支払金額" amount={slip.paymentAmount} strong />
          <OfficialRow label="給与所得控除後の金額（調整控除後）" amount={slip.amountAfterSalaryIncomeDeduction} />
          <OfficialRow label="所得控除の額の合計額" amount={slip.totalIncomeDeductions} />
          <OfficialRow label="源泉徴収税額" amount={slip.withholdingTaxAmount} strong />
        </OfficialSection>

        <OfficialSection title="控除の内訳">
          <OfficialRow label="社会保険料等の金額" amount={slip.socialInsurancePremiumAmount} />
          <div className="text-sm px-1 py-2">控除対象扶養親族の数: {slip.dependentCount}人</div>
        </OfficialSection>

        <OfficialSection title="摘要">
          <ul className="text-xs text-stone-500 list-disc list-inside space-y-1 px-1 py-1">
            <li>この源泉徴収票は下書きです。正式な発行前に必ず内容をご確認ください。</li>
            {slip.unsupportedFields.length > 0 && (
              <li>次の欄はこのツールでは計算していません（空欄のままです）: {slip.unsupportedFields.join("、")}</li>
            )}
          </ul>
        </OfficialSection>

        <OfficialSection title="支払者">
          <div className="text-sm space-y-1 px-1 py-1">
            <div>住所（所在地）: {slip.payer.address || "（未入力）"}</div>
            <div>
              氏名又は名称: <span className="font-semibold">{slip.payer.companyName}</span>
            </div>
            {slip.payer.representativeName && (
              <div className="text-xs text-stone-500">代表者: {slip.payer.representativeName}</div>
            )}
            {slip.payer.corporateNumber && (
              <div className="text-xs text-stone-500">法人番号: {slip.payer.corporateNumber}</div>
            )}
          </div>
        </OfficialSection>
      </OfficialFormFrame>

      <div className="print:hidden text-xs text-stone-500">
        参考: その年にすでに源泉徴収した税額の合計 {yen.format(slip.alreadyWithheld)}円／年末調整による差額{" "}
        {yen.format(Math.abs(slip.yearEndAdjustmentDifference))}円（{OUTCOME_LABEL[slip.yearEndAdjustmentOutcome]}）
      </div>

      <ul className="print:hidden text-xs text-amber-700 leading-relaxed list-disc list-inside space-y-1">
        {slip.assumptions.map((a) => (
          <li key={a}>{a}</li>
        ))}
      </ul>
    </section>
  );
}
