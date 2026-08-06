import { describe, expect, it } from "vitest";
import { getInterimPaymentObligations } from "./interimPayment";

describe("getInterimPaymentObligations — 法人税の要否しきい値（20万円「超」）", () => {
  it("前期確定法人税額がちょうど20万円の場合は中間申告・中間納付は不要", () => {
    const result = getInterimPaymentObligations({
      priorYearCorporateTax: 200_000,
      priorYearConsumptionTax: 0,
      fiscalYearStartDate: "2026-04-01",
      referenceDate: "2026-06-01",
    });

    expect(result.corporateTax.required).toBe(false);
    expect(result.corporateTax.thresholdAmount).toBe(200_000);
    expect(result.obligations.some((o) => o.kind === "corporateTax")).toBe(false);
  });

  it("前期確定法人税額が20万円を1円でも超えると中間申告・中間納付が必要になる", () => {
    const result = getInterimPaymentObligations({
      priorYearCorporateTax: 200_001,
      priorYearConsumptionTax: 0,
      fiscalYearStartDate: "2026-04-01",
      referenceDate: "2026-06-01",
    });

    expect(result.corporateTax.required).toBe(true);
    const obligation = result.obligations.find((o) => o.kind === "corporateTax");
    expect(obligation).toBeDefined();
    // floor(200001 / 2) = 100000（端数切り捨て）
    expect(obligation?.estimatedAmount).toBe(100_000);
    expect(obligation?.needsManualReview).toBe(false);
  });

  it("奇数円の前期確定法人税額は概算額の計算で端数を切り捨てる", () => {
    const result = getInterimPaymentObligations({
      priorYearCorporateTax: 333_333,
      priorYearConsumptionTax: 0,
      fiscalYearStartDate: "2026-04-01",
      referenceDate: "2026-06-01",
    });

    const obligation = result.obligations.find((o) => o.kind === "corporateTax");
    // floor(333333 / 2) = 166666.5 -> 166666
    expect(obligation?.estimatedAmount).toBe(166_666);
  });
});

describe("getInterimPaymentObligations — 消費税の区分しきい値（48万円超〜400万円は年1回、400万円超は要確認）", () => {
  it("前期確定消費税額がちょうど48万円の場合は中間申告・中間納付は不要（tier: none）", () => {
    const result = getInterimPaymentObligations({
      priorYearCorporateTax: 0,
      priorYearConsumptionTax: 480_000,
      fiscalYearStartDate: "2026-04-01",
      referenceDate: "2026-06-01",
    });

    expect(result.consumptionTax.required).toBe(false);
    expect(result.consumptionTax.tier).toBe("none");
    expect(result.obligations.some((o) => o.kind === "consumptionTax")).toBe(false);
  });

  it("前期確定消費税額が48万円を1円でも超えると年1回区分（annual）になる", () => {
    const result = getInterimPaymentObligations({
      priorYearCorporateTax: 0,
      priorYearConsumptionTax: 480_001,
      fiscalYearStartDate: "2026-04-01",
      referenceDate: "2026-06-01",
    });

    expect(result.consumptionTax.tier).toBe("annual");
    const obligation = result.obligations.find((o) => o.kind === "consumptionTax");
    expect(obligation).toBeDefined();
    // floor(480001 / 2) = 240000.5 -> 240000
    expect(obligation?.estimatedAmount).toBe(240_000);
    expect(obligation?.needsManualReview).toBe(false);
    expect(obligation?.dueDate).not.toBeNull();
  });

  it("前期確定消費税額がちょうど400万円の場合はまだ年1回区分（annual）のまま（「超」ではない）", () => {
    const result = getInterimPaymentObligations({
      priorYearCorporateTax: 0,
      priorYearConsumptionTax: 4_000_000,
      fiscalYearStartDate: "2026-04-01",
      referenceDate: "2026-06-01",
    });

    expect(result.consumptionTax.tier).toBe("annual");
    const obligation = result.obligations.find((o) => o.kind === "consumptionTax");
    expect(obligation?.estimatedAmount).toBe(2_000_000);
    expect(obligation?.needsManualReview).toBe(false);
  });

  it("前期確定消費税額が400万円を1円でも超えると年3回・年11回区分（moreFrequent）となり、要確認扱いになる", () => {
    const result = getInterimPaymentObligations({
      priorYearCorporateTax: 0,
      priorYearConsumptionTax: 4_000_001,
      fiscalYearStartDate: "2026-04-01",
      referenceDate: "2026-06-01",
    });

    expect(result.consumptionTax.tier).toBe("moreFrequent");
    expect(result.consumptionTax.required).toBe(true);
    const obligation = result.obligations.find((o) => o.kind === "consumptionTax");
    expect(obligation).toBeDefined();
    expect(obligation?.needsManualReview).toBe(true);
    expect(obligation?.dueDate).toBeNull();
    expect(obligation?.daysRemaining).toBeNull();
    expect(obligation?.urgency).toBeNull();
    expect(obligation?.estimatedAmount).toBeNull();
    expect(obligation?.note).toContain("400万円");
    expect(obligation?.note).toContain("4,800万円");
  });
});

describe("getInterimPaymentObligations — 期日の計算（開始日+6か月経過日から2か月以内）", () => {
  it("4/1開始の標準的な事業年度は期日11/30になる", () => {
    const result = getInterimPaymentObligations({
      priorYearCorporateTax: 500_000,
      priorYearConsumptionTax: 0,
      fiscalYearStartDate: "2026-04-01",
      referenceDate: "2026-06-01",
    });

    const obligation = result.obligations.find((o) => o.kind === "corporateTax");
    expect(obligation?.dueDate).toBe("2026-11-30");
  });

  it("月末開始（8/31）で6か月後・8か月後の月に31日が存在しない場合は末日に丸める", () => {
    const result = getInterimPaymentObligations({
      priorYearCorporateTax: 500_000,
      priorYearConsumptionTax: 0,
      fiscalYearStartDate: "2026-08-31",
      referenceDate: "2026-09-01",
    });

    const obligation = result.obligations.find((o) => o.kind === "corporateTax");
    expect(obligation?.dueDate).toBe("2027-04-27");
  });

  it("うるう年の2/29開始でも正しく計算する（6か月後は非うるう年の2月末）", () => {
    const result = getInterimPaymentObligations({
      priorYearCorporateTax: 500_000,
      priorYearConsumptionTax: 0,
      fiscalYearStartDate: "2024-02-29",
      referenceDate: "2024-03-01",
    });

    const obligation = result.obligations.find((o) => o.kind === "corporateTax");
    expect(obligation?.dueDate).toBe("2024-10-28");
  });
});

describe("getInterimPaymentObligations — 緊急度の分類（urgent<=14日, warning<=45日, それ以外normal）", () => {
  const base = {
    priorYearCorporateTax: 500_000,
    priorYearConsumptionTax: 0,
    fiscalYearStartDate: "2026-04-01", // 期日 2026-11-30
  };

  it("残り14日ちょうどはurgent", () => {
    const result = getInterimPaymentObligations({ ...base, referenceDate: "2026-11-16" });
    const obligation = result.obligations.find((o) => o.kind === "corporateTax");
    expect(obligation?.daysRemaining).toBe(14);
    expect(obligation?.urgency).toBe("urgent");
  });

  it("残り15日はwarning（urgentの境界を1日超えるとwarningに切り替わる）", () => {
    const result = getInterimPaymentObligations({ ...base, referenceDate: "2026-11-15" });
    const obligation = result.obligations.find((o) => o.kind === "corporateTax");
    expect(obligation?.daysRemaining).toBe(15);
    expect(obligation?.urgency).toBe("warning");
  });

  it("残り45日ちょうどはwarning", () => {
    const result = getInterimPaymentObligations({ ...base, referenceDate: "2026-10-16" });
    const obligation = result.obligations.find((o) => o.kind === "corporateTax");
    expect(obligation?.daysRemaining).toBe(45);
    expect(obligation?.urgency).toBe("warning");
  });

  it("残り46日はnormal（warningの境界を1日超えるとnormalに切り替わる）", () => {
    const result = getInterimPaymentObligations({ ...base, referenceDate: "2026-10-15" });
    const obligation = result.obligations.find((o) => o.kind === "corporateTax");
    expect(obligation?.daysRemaining).toBe(46);
    expect(obligation?.urgency).toBe("normal");
  });

  it("期日を過ぎている（残り日数が負）場合もurgentのまま計算する", () => {
    const result = getInterimPaymentObligations({ ...base, referenceDate: "2026-12-15" });
    const obligation = result.obligations.find((o) => o.kind === "corporateTax");
    expect(obligation?.daysRemaining).toBeLessThan(0);
    expect(obligation?.urgency).toBe("urgent");
  });
});

describe("getInterimPaymentObligations — 両方の税目が該当する場合の一覧の順序", () => {
  it("法人税・消費税（年1回）が同じ期日の場合、法人税が先に並ぶ（挿入順の安定ソート）", () => {
    const result = getInterimPaymentObligations({
      priorYearCorporateTax: 500_000,
      priorYearConsumptionTax: 600_000,
      fiscalYearStartDate: "2026-04-01",
      referenceDate: "2026-06-01",
    });

    expect(result.obligations).toHaveLength(2);
    expect(result.obligations[0].kind).toBe("corporateTax");
    expect(result.obligations[1].kind).toBe("consumptionTax");
    expect(result.obligations[0].dueDate).toBe(result.obligations[1].dueDate);
  });

  it("消費税がmoreFrequent（期日null）の場合、期日ありの法人税が先、期日なしの消費税が後になる", () => {
    const result = getInterimPaymentObligations({
      priorYearCorporateTax: 500_000,
      priorYearConsumptionTax: 5_000_000,
      fiscalYearStartDate: "2026-04-01",
      referenceDate: "2026-06-01",
    });

    expect(result.obligations).toHaveLength(2);
    expect(result.obligations[0].kind).toBe("corporateTax");
    expect(result.obligations[0].dueDate).not.toBeNull();
    expect(result.obligations[1].kind).toBe("consumptionTax");
    expect(result.obligations[1].dueDate).toBeNull();
  });

  it("消費税のみmoreFrequentで法人税が不要な場合、要確認の消費税のみが一覧に含まれる", () => {
    const result = getInterimPaymentObligations({
      priorYearCorporateTax: 0,
      priorYearConsumptionTax: 5_000_000,
      fiscalYearStartDate: "2026-04-01",
      referenceDate: "2026-06-01",
    });

    expect(result.obligations).toHaveLength(1);
    expect(result.obligations[0].kind).toBe("consumptionTax");
    expect(result.obligations[0].needsManualReview).toBe(true);
  });
});

describe("getInterimPaymentObligations — 0円・負値の入力", () => {
  it("両方とも0円の場合、いずれの中間申告・中間納付も不要で一覧は空になる", () => {
    const result = getInterimPaymentObligations({
      priorYearCorporateTax: 0,
      priorYearConsumptionTax: 0,
      fiscalYearStartDate: "2026-04-01",
      referenceDate: "2026-06-01",
    });

    expect(result.corporateTax.required).toBe(false);
    expect(result.consumptionTax.required).toBe(false);
    expect(result.consumptionTax.tier).toBe("none");
    expect(result.obligations).toEqual([]);
  });

  it("負の値が入力された場合は0円として扱う（マイナスの前期税額はあり得ないための防御）", () => {
    const result = getInterimPaymentObligations({
      priorYearCorporateTax: -500_000,
      priorYearConsumptionTax: -600_000,
      fiscalYearStartDate: "2026-04-01",
      referenceDate: "2026-06-01",
    });

    expect(result.corporateTax.priorYearCorporateTax).toBe(0);
    expect(result.corporateTax.required).toBe(false);
    expect(result.consumptionTax.priorYearConsumptionTax).toBe(0);
    expect(result.consumptionTax.tier).toBe("none");
    expect(result.obligations).toEqual([]);
  });
});

describe("getInterimPaymentObligations — 日付入力の形式（Date/文字列）と異常値", () => {
  it("fiscalYearStartDateをDateオブジェクトで渡しても、文字列で渡した場合と同じ結果になる", () => {
    const viaString = getInterimPaymentObligations({
      priorYearCorporateTax: 500_000,
      priorYearConsumptionTax: 0,
      fiscalYearStartDate: "2026-04-01",
      referenceDate: "2026-06-01",
    });
    const viaDate = getInterimPaymentObligations({
      priorYearCorporateTax: 500_000,
      priorYearConsumptionTax: 0,
      fiscalYearStartDate: new Date(2026, 3, 1), // 月は0始まりなので4月=3
      referenceDate: "2026-06-01",
    });

    expect(viaDate.fiscalYearStartDate).toBe(viaString.fiscalYearStartDate);
    expect(viaDate.obligations).toEqual(viaString.obligations);
  });

  it("referenceDateを省略した場合はエラーにならず、現在日時を基準に計算する", () => {
    expect(() =>
      getInterimPaymentObligations({
        priorYearCorporateTax: 500_000,
        priorYearConsumptionTax: 0,
        fiscalYearStartDate: "2026-04-01",
      })
    ).not.toThrow();
  });

  it("不正な形式（YYYY-MM-DDでない）のfiscalYearStartDate文字列はエラーを投げる", () => {
    expect(() =>
      getInterimPaymentObligations({
        priorYearCorporateTax: 500_000,
        priorYearConsumptionTax: 0,
        fiscalYearStartDate: "2026/04/01",
      })
    ).toThrow();
  });
});

describe("getInterimPaymentObligations — 開示情報（しきい値の定数・前提事項）", () => {
  it("結果に法人税・消費税それぞれのしきい値定数を含める", () => {
    const result = getInterimPaymentObligations({
      priorYearCorporateTax: 500_000,
      priorYearConsumptionTax: 600_000,
      fiscalYearStartDate: "2026-04-01",
      referenceDate: "2026-06-01",
    });

    expect(result.corporateTax.thresholdAmount).toBe(200_000);
    expect(result.consumptionTax.annualThresholdAmount).toBe(480_000);
    expect(result.consumptionTax.annualUpperBoundAmount).toBe(4_000_000);
  });

  it("前提事項の一覧が空でなく、仮決算方式には対応していない旨を含む", () => {
    const result = getInterimPaymentObligations({
      priorYearCorporateTax: 500_000,
      priorYearConsumptionTax: 0,
      fiscalYearStartDate: "2026-04-01",
      referenceDate: "2026-06-01",
    });

    expect(result.assumptions.length).toBeGreaterThan(0);
    expect(result.assumptions.some((a) => a.includes("仮決算"))).toBe(true);
    expect(result.assumptions.some((a) => a.includes("個人事業主"))).toBe(true);
  });
});
