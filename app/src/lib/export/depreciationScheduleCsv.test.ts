import { describe, expect, it } from "vitest";
import { Asset, FiscalPeriod } from "../tax/depreciation";
import { buildDepreciationScheduleForm } from "../tax/depreciationScheduleForm";
import { EXPORT_DISCLAIMER } from "./journalExport";
import {
  DEPRECIATION_SCHEDULE_CSV_HEADERS,
  buildDepreciationScheduleExportCsv,
  depreciationScheduleRowsToCsv,
} from "./depreciationScheduleCsv";

const period: FiscalPeriod = { start: "2026-01-01", end: "2026-12-31" };

function makeAsset(overrides: Partial<Asset>): Asset {
  return {
    id: "asset-1",
    name: "ノートパソコン",
    acquisitionDate: "2024-01-10",
    acquisitionCost: 480_000,
    usefulLifeYears: 4,
    method: "straight-line",
    ...overrides,
  };
}

describe("depreciationScheduleRowsToCsv", () => {
  it("emits the expected header row in the documented column order", () => {
    const form = buildDepreciationScheduleForm([], period);
    const csv = depreciationScheduleRowsToCsv(form);
    const [headerLine] = csv.split("\r\n");
    expect(headerLine).toBe(DEPRECIATION_SCHEDULE_CSV_HEADERS.join(","));
  });

  it("renders an asset row with the same figures as the on-screen table", () => {
    const asset = makeAsset({});
    const form = buildDepreciationScheduleForm([asset], period);
    const csv = depreciationScheduleRowsToCsv(form);
    const rows = csv.split("\r\n");

    expect(rows[1]).toContain(asset.name);
    expect(rows[1]).toContain(String(form.rows[0].acquisitionCost));
    expect(rows[1]).toContain("定額法");
  });

  it("appends a 合計 row summing the totals from the form", () => {
    const assetA = makeAsset({ id: "a", acquisitionCost: 480_000, usefulLifeYears: 4 });
    const assetB = makeAsset({ id: "b", acquisitionCost: 200_000, usefulLifeYears: 8 });
    const form = buildDepreciationScheduleForm([assetA, assetB], period);
    const csv = depreciationScheduleRowsToCsv(form);
    const lastRow = csv.split("\r\n").at(-1);

    expect(lastRow).toContain("合計");
    expect(lastRow).toContain(String(form.totals.acquisitionCostTotal));
    expect(lastRow).toContain(String(form.totals.currentYearDepreciationExpenseTotal));
  });

  it("quotes remarks containing a comma so the row stays parseable", () => {
    // 少額減価償却資産の特例が適用された資産を混ぜると、除外資産の注記が別セクションに
    // 回るだけで本体行には影響しないことを確認するため、備考にカンマを含む定額法資産で検証する。
    const asset = makeAsset({});
    const form = buildDepreciationScheduleForm([asset], period);
    form.rows[0].remarks = ["備考A, 備考B"];
    const csv = depreciationScheduleRowsToCsv(form);
    expect(csv).toContain('"備考A, 備考B"');
  });
});

describe("buildDepreciationScheduleExportCsv", () => {
  it("includes the legal-safe disclaimer framing the data as a draft, not a filed return", () => {
    const form = buildDepreciationScheduleForm([], period);
    const csv = buildDepreciationScheduleExportCsv({ form, entityName: "サンプル株式会社" });
    expect(csv).toContain(EXPORT_DISCLAIMER);
  });

  it("includes a fixed generated-at timestamp when one is supplied, for deterministic output", () => {
    const form = buildDepreciationScheduleForm([], period);
    const csv = buildDepreciationScheduleExportCsv({
      form,
      entityName: "サンプル株式会社",
      generatedAt: new Date("2026-08-30T00:00:00.000Z"),
    });
    expect(csv).toContain("出力日時: 2026-08-30T00:00:00.000Z");
  });

  it("embeds the entity name and fiscal period near the top of the document", () => {
    const form = buildDepreciationScheduleForm([], period);
    const csv = buildDepreciationScheduleExportCsv({ form, entityName: "サンプル株式会社" });
    expect(csv).toContain("法人名（屋号）,サンプル株式会社");
    expect(csv).toContain(`対象期間,${period.start} 〜 ${period.end}`);
  });

  it("embeds the full asset table under its own section marker", () => {
    const asset = makeAsset({});
    const form = buildDepreciationScheduleForm([asset], period);
    const csv = buildDepreciationScheduleExportCsv({ form, entityName: "サンプル株式会社" });
    expect(csv).toContain("■ 資産明細（別表十六（一）・定額法）");
    expect(csv).toContain(DEPRECIATION_SCHEDULE_CSV_HEADERS.join(","));
    expect(csv).toContain(asset.name);
  });

  it("embeds every note (including excluded-asset guidance) under its own section marker", () => {
    const straightLineAsset = makeAsset({ id: "a" });
    const decliningBalanceAsset = makeAsset({
      id: "b",
      name: "サーバー機器",
      method: "declining-balance",
    });
    const form = buildDepreciationScheduleForm([straightLineAsset, decliningBalanceAsset], period);
    const csv = buildDepreciationScheduleExportCsv({ form, entityName: "サンプル株式会社" });

    expect(csv).toContain("■ 注記");
    expect(csv).toContain("別表十六（二）");
    expect(csv).toContain("サーバー機器");
  });

  it("produces only header rows and section markers for a fully empty asset list", () => {
    const form = buildDepreciationScheduleForm([], period);
    const csv = buildDepreciationScheduleExportCsv({ form, entityName: "" });
    expect(csv.length).toBeGreaterThan(0);
    expect(csv).toContain(DEPRECIATION_SCHEDULE_CSV_HEADERS.join(","));
  });
});
