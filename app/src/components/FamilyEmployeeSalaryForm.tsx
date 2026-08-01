"use client";

import { useMemo, useState } from "react";
import { calculateFamilyEmployeeSalary, FamilyEmployeeSalaryResult } from "@/lib/payroll/familyEmployeeSalary";

// ------------------------------------------------------------------
// 「青色事業専従者給与に関する届出書」に記載した給与の上限額・実際に支払った
// 給与額・専従者（家族従業員）の生年月日・専従者要件（生計を一にするか、
// 専ら従事しているか）から、必要経費に算入できる金額と適格性チェックリスト・
// 注意事項を表示するフォーム。
//
// 実際の判定・計算はcalculateFamilyEmployeeSalary（familyEmployeeSalary.ts、
// 純粋関数）に委譲し、このコンポーネントはフォーム状態の管理と表示のみを担う。
// ------------------------------------------------------------------

const yen = new Intl.NumberFormat("ja-JP", { maximumFractionDigits: 0 });

const inputClass = "w-full border border-stone-400 bg-white px-3 py-2 text-sm outline-none focus:border-stone-600";
const labelClass = "block text-xs text-stone-500 mb-1";

export function FamilyEmployeeSalaryForm() {
  const [declaredMaxAmount, setDeclaredMaxAmount] = useState("");
  const [actualPaidAmount, setActualPaidAmount] = useState("");
  const [familyMemberBirthdate, setFamilyMemberBirthdate] = useState("");
  const [taxYear, setTaxYear] = useState(String(new Date().getFullYear()));
  const [cohabiting, setCohabiting] = useState(true);
  const [primarilyEngaged, setPrimarilyEngaged] = useState(true);

  const { result, error } = useMemo(() => {
    if (declaredMaxAmount.trim() === "" || actualPaidAmount.trim() === "" || familyMemberBirthdate.trim() === "") {
      return { result: null as FamilyEmployeeSalaryResult | null, error: null as string | null };
    }

    try {
      return {
        result: calculateFamilyEmployeeSalary({
          declaredMaxAmount: Number(declaredMaxAmount),
          actualPaidAmount: Number(actualPaidAmount),
          familyMemberBirthdate,
          taxYear: Number(taxYear),
          cohabiting,
          primarilyEngaged,
        }),
        error: null as string | null,
      };
    } catch (e) {
      return {
        result: null as FamilyEmployeeSalaryResult | null,
        error: e instanceof Error ? e.message : "入力内容をご確認ください。",
      };
    }
  }, [declaredMaxAmount, actualPaidAmount, familyMemberBirthdate, taxYear, cohabiting, primarilyEngaged]);

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-4 bg-stone-50 border border-stone-200 rounded p-4">
        <div>
          <label className={labelClass} htmlFor="fes-tax-year">
            対象の年（西暦）
          </label>
          <input
            id="fes-tax-year"
            type="number"
            value={taxYear}
            onChange={(e) => setTaxYear(e.target.value)}
            placeholder="例：2026"
            className={`${inputClass} max-w-[10rem]`}
          />
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className={labelClass} htmlFor="fes-declared-max-amount">
              届出書に記載した給与の上限額（年額、円）
            </label>
            <input
              id="fes-declared-max-amount"
              type="number"
              min="0"
              value={declaredMaxAmount}
              onChange={(e) => setDeclaredMaxAmount(e.target.value)}
              placeholder="例：1800000"
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="fes-actual-paid-amount">
              実際に支払った（支払う予定の）給与の額（年額、円）
            </label>
            <input
              id="fes-actual-paid-amount"
              type="number"
              min="0"
              value={actualPaidAmount}
              onChange={(e) => setActualPaidAmount(e.target.value)}
              placeholder="例：1500000"
              className={inputClass}
            />
          </div>
        </div>

        <div>
          <label className={labelClass} htmlFor="fes-birthdate">
            専従者（家族従業員）の生年月日
          </label>
          <input
            id="fes-birthdate"
            type="date"
            value={familyMemberBirthdate}
            onChange={(e) => setFamilyMemberBirthdate(e.target.value)}
            className={`${inputClass} max-w-[14rem]`}
          />
        </div>

        <div>
          <div className="text-xs font-semibold text-stone-600 mb-2">専従者要件（該当するものにチェック）</div>
          <div className="flex flex-col gap-2">
            <label className="flex items-start gap-2 text-sm text-stone-700">
              <input
                type="checkbox"
                checked={cohabiting}
                onChange={(e) => setCohabiting(e.target.checked)}
                className="mt-0.5"
              />
              <span>事業主と生計を一にする配偶者その他の親族である（生計を一にする）</span>
            </label>
            <label className="flex items-start gap-2 text-sm text-stone-700">
              <input
                type="checkbox"
                checked={primarilyEngaged}
                onChange={(e) => setPrimarilyEngaged(e.target.checked)}
                className="mt-0.5"
              />
              <span>その年を通じて6か月を超える期間、専らこの事業に従事している（専ら従事）</span>
            </label>
          </div>
        </div>

        {error && <p className="text-sm text-red-700">{error}</p>}
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-3">判定結果</h2>
        {result ? (
          <div className="flex flex-col gap-6">
            <div className="border border-stone-300 bg-white p-4 flex flex-col gap-2">
              <div className="flex justify-between text-sm text-stone-600">
                <span>専従者要件の判定</span>
                <span className={`font-semibold ${result.eligible ? "text-emerald-700" : "text-red-700"}`}>
                  {result.eligible ? "要件を満たす（該当する可能性が高い）" : "要件を満たさない可能性があります"}
                </span>
              </div>
              <div className="flex justify-between text-sm text-stone-600">
                <span>届出書の上限額を超えているか</span>
                <span className={`font-semibold ${result.exceedsDeclaredCap ? "text-red-700" : "text-stone-700"}`}>
                  {result.exceedsDeclaredCap ? "超えています" : "超えていません"}
                </span>
              </div>
              <div className="flex justify-between text-base font-semibold border-t border-stone-200 pt-2">
                <span>必要経費に算入できる金額（概算）</span>
                <span className="tabular-nums">{yen.format(result.deductibleAmount)}円</span>
              </div>
            </div>

            <div>
              <h3 className="text-sm font-semibold text-stone-700 mb-2">専従者要件チェックリスト</h3>
              <ul className="border border-stone-300 bg-white divide-y divide-stone-200">
                {result.eligibilityChecklist.map((c) => (
                  <li key={c.key} className="flex items-start gap-3 p-3">
                    <span
                      className={`mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px] text-white ${
                        c.met ? "bg-emerald-600" : "bg-red-600"
                      }`}
                      aria-hidden
                    >
                      {c.met ? "✓" : "!"}
                    </span>
                    <div className="text-sm">
                      <div className="text-stone-800">{c.label}</div>
                      <div className="text-xs text-stone-500 mt-0.5">{c.description}</div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>

            {result.warnings.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-amber-800 mb-2">注意事項</h3>
                <ul className="text-xs text-amber-700 leading-relaxed list-disc list-inside space-y-1">
                  {result.warnings.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              </div>
            )}

            {result.notes.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-stone-600 mb-2">参考情報</h3>
                <ul className="text-xs text-stone-500 leading-relaxed list-disc list-inside space-y-1">
                  {result.notes.map((n) => (
                    <li key={n}>{n}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        ) : (
          <p className="text-sm text-stone-500">
            届出書に記載した給与の上限額・実際に支払った給与の額・専従者の生年月日を入力すると、
            必要経費に算入できる金額の目安と、専従者要件のチェックリストを表示します。
          </p>
        )}
      </section>
    </div>
  );
}
