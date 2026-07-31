import { describe, expect, it } from "vitest";
import {
  Counterparty,
  createCounterparty,
  dedupeCounterpartiesByName,
  findDuplicateCounterparties,
  hasCounterpartyErrors,
  isDuplicateCounterpartyName,
  listCounterparties,
  normalizeCounterpartyName,
  updateCounterparty,
  validateCounterpartyDraft,
} from "./clientMaster";

// Real, publicly documented check-digit example reused from
// invoiceRegistrationValidator.test.ts (NTA's own worked example PDF):
// base number "120901007402" -> check digit "2" -> corporate number "2120901007402".
const VALID_REGISTRATION_NUMBER = "T2120901007402";
const VALID_REGISTRATION_NUMBER_2 = "T7000012050002";

function counterparty(overrides: Partial<Counterparty> = {}): Counterparty {
  return {
    id: "cp-1",
    name: "株式会社サンプル商事",
    kind: "client",
    defaultAccountName: undefined,
    invoiceRegistrationNumber: undefined,
    notes: undefined,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("normalizeCounterpartyName", () => {
  it("trims surrounding whitespace", () => {
    expect(normalizeCounterpartyName("  株式会社サンプル商事  ")).toBe("株式会社サンプル商事");
  });

  it("collapses full-width and repeated whitespace into a single half-width space", () => {
    expect(normalizeCounterpartyName("株式会社　サンプル  商事")).toBe("株式会社 サンプル 商事");
  });

  it("ignores ASCII letter case differences", () => {
    expect(normalizeCounterpartyName("ABC Consulting LLC")).toBe(normalizeCounterpartyName("abc consulting llc"));
  });

  it("returns an empty string for empty/undefined input", () => {
    expect(normalizeCounterpartyName("")).toBe("");
    expect(normalizeCounterpartyName(undefined as unknown as string)).toBe("");
  });
});

describe("validateCounterpartyDraft", () => {
  it("requires a name", () => {
    const errors = validateCounterpartyDraft({ name: "", kind: "client" });
    expect(errors.name).toBeDefined();
    expect(hasCounterpartyErrors(errors)).toBe(true);
  });

  it("treats a whitespace-only name as missing", () => {
    const errors = validateCounterpartyDraft({ name: "   ", kind: "client" });
    expect(errors.name).toBeDefined();
  });

  it("allows an empty invoice registration number (unregistered/tax-exempt businesses)", () => {
    const errors = validateCounterpartyDraft({ name: "個人事業主 山田", kind: "vendor" });
    expect(hasCounterpartyErrors(errors)).toBe(false);
  });

  it("rejects a malformed invoice registration number", () => {
    const errors = validateCounterpartyDraft({
      name: "有限会社テスト",
      kind: "vendor",
      invoiceRegistrationNumber: "12345",
    });
    expect(errors.invoiceRegistrationNumber).toBeDefined();
    expect(hasCounterpartyErrors(errors)).toBe(true);
  });

  it("rejects a registration number with a wrong check digit", () => {
    const errors = validateCounterpartyDraft({
      name: "有限会社テスト",
      kind: "vendor",
      invoiceRegistrationNumber: "T3120901007402",
    });
    expect(errors.invoiceRegistrationNumber).toBeDefined();
  });

  it("accepts a valid, correctly-formatted registration number", () => {
    const errors = validateCounterpartyDraft({
      name: "有限会社テスト",
      kind: "vendor",
      invoiceRegistrationNumber: VALID_REGISTRATION_NUMBER,
    });
    expect(hasCounterpartyErrors(errors)).toBe(false);
  });
});

describe("createCounterparty", () => {
  const now = new Date("2026-07-31T00:00:00.000Z");

  it("trims name/defaultAccountName/notes and assigns id + timestamps", () => {
    const record = createCounterparty(
      {
        name: "  株式会社サンプル商事  ",
        kind: "client",
        defaultAccountName: "  売上高  ",
        notes: "  月次契約  ",
      },
      now
    );

    expect(record.id).toBeTruthy();
    expect(record.name).toBe("株式会社サンプル商事");
    expect(record.defaultAccountName).toBe("売上高");
    expect(record.notes).toBe("月次契約");
    expect(record.createdAt).toBe(now.toISOString());
    expect(record.updatedAt).toBe(now.toISOString());
  });

  it("leaves optional fields undefined when blank", () => {
    const record = createCounterparty({ name: "山田太郎", kind: "vendor" }, now);
    expect(record.defaultAccountName).toBeUndefined();
    expect(record.invoiceRegistrationNumber).toBeUndefined();
    expect(record.notes).toBeUndefined();
  });

  it("normalizes a valid registration number to the canonical T+13-digit form", () => {
    const record = createCounterparty(
      { name: "有限会社テスト", kind: "vendor", invoiceRegistrationNumber: ` ${VALID_REGISTRATION_NUMBER} ` },
      now
    );
    expect(record.invoiceRegistrationNumber).toBe(VALID_REGISTRATION_NUMBER);
  });

  it("preserves a malformed registration number as trimmed input rather than dropping it", () => {
    const record = createCounterparty(
      { name: "有限会社テスト", kind: "vendor", invoiceRegistrationNumber: " T12345 " },
      now
    );
    expect(record.invoiceRegistrationNumber).toBe("T12345");
  });

  it("generates distinct ids across calls", () => {
    const a = createCounterparty({ name: "取引先A", kind: "client" }, now);
    const b = createCounterparty({ name: "取引先B", kind: "client" }, now);
    expect(a.id).not.toBe(b.id);
  });
});

describe("updateCounterparty", () => {
  it("preserves id and createdAt while applying draft changes and bumping updatedAt", () => {
    const existing = counterparty({ id: "cp-42", createdAt: "2026-01-01T00:00:00.000Z" });
    const now = new Date("2026-07-31T09:00:00.000Z");

    const updated = updateCounterparty(
      existing,
      { name: "株式会社サンプル商事（新社名）", kind: "client", notes: "社名変更" },
      now
    );

    expect(updated.id).toBe("cp-42");
    expect(updated.createdAt).toBe("2026-01-01T00:00:00.000Z");
    expect(updated.updatedAt).toBe(now.toISOString());
    expect(updated.name).toBe("株式会社サンプル商事（新社名）");
    expect(updated.notes).toBe("社名変更");
  });
});

describe("listCounterparties", () => {
  const records: Counterparty[] = [
    counterparty({ id: "1", name: "株式会社ベータ", kind: "client" }),
    counterparty({ id: "2", name: "株式会社アルファ", kind: "client", notes: "重要顧客" }),
    counterparty({ id: "3", name: "ガンマ商事", kind: "vendor" }),
  ];

  it("sorts alphabetically by normalized name", () => {
    const asciiRecords: Counterparty[] = [
      counterparty({ id: "z", name: "Zeta Consulting" }),
      counterparty({ id: "a", name: "Alpha Trading" }),
      counterparty({ id: "m", name: "Mid Corp" }),
    ];
    const result = listCounterparties(asciiRecords);
    expect(result.map((r) => r.id)).toEqual(["a", "m", "z"]);
  });

  it("filters by kind", () => {
    const result = listCounterparties(records, { kind: "vendor" });
    expect(result.map((r) => r.id)).toEqual(["3"]);
  });

  it("filters by a case-insensitive query matched against name or notes", () => {
    expect(listCounterparties(records, { query: "重要" }).map((r) => r.id)).toEqual(["2"]);
    expect(listCounterparties(records, { query: "ガンマ" }).map((r) => r.id)).toEqual(["3"]);
  });

  it("does not mutate the input array", () => {
    const original = [...records];
    listCounterparties(records);
    expect(records).toEqual(original);
  });
});

describe("isDuplicateCounterpartyName", () => {
  const records: Counterparty[] = [counterparty({ id: "1", name: "株式会社サンプル商事" })];

  it("detects a duplicate ignoring whitespace/case differences", () => {
    expect(isDuplicateCounterpartyName(records, "株式会社サンプル商事")).toBe(true);
    expect(isDuplicateCounterpartyName(records, "  株式会社サンプル商事 ")).toBe(true);
  });

  it("excludes the record's own id (editing in place is not a duplicate)", () => {
    expect(isDuplicateCounterpartyName(records, "株式会社サンプル商事", "1")).toBe(false);
  });

  it("returns false for a name that does not match any existing record", () => {
    expect(isDuplicateCounterpartyName(records, "全く別の会社")).toBe(false);
  });
});

describe("findDuplicateCounterparties", () => {
  it("groups records that share a normalized name", () => {
    const records: Counterparty[] = [
      counterparty({ id: "1", name: "株式会社サンプル商事" }),
      counterparty({ id: "2", name: "株式会社サンプル商事　" }),
      counterparty({ id: "3", name: "別の取引先" }),
    ];

    const groups = findDuplicateCounterparties(records);
    expect(groups).toHaveLength(1);
    expect(groups[0].records.map((r) => r.id).sort()).toEqual(["1", "2"]);
  });

  it("returns no groups when every name is unique", () => {
    const records: Counterparty[] = [
      counterparty({ id: "1", name: "取引先A" }),
      counterparty({ id: "2", name: "取引先B" }),
    ];
    expect(findDuplicateCounterparties(records)).toEqual([]);
  });
});

describe("dedupeCounterpartiesByName", () => {
  it("merges duplicate-name records of the same kind, keeping the oldest and filling gaps", () => {
    const records: Counterparty[] = [
      counterparty({
        id: "old",
        name: "株式会社サンプル商事",
        kind: "client",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      }),
      counterparty({
        id: "new",
        name: "株式会社サンプル商事　", // full-width trailing space, same normalized name
        kind: "client",
        createdAt: "2026-02-01T00:00:00.000Z",
        updatedAt: "2026-02-01T00:00:00.000Z",
        defaultAccountName: "売上高",
        invoiceRegistrationNumber: VALID_REGISTRATION_NUMBER,
      }),
    ];

    const result = dedupeCounterpartiesByName(records);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("old");
    expect(result[0].defaultAccountName).toBe("売上高");
    expect(result[0].invoiceRegistrationNumber).toBe(VALID_REGISTRATION_NUMBER);
    expect(result[0].updatedAt).toBe("2026-02-01T00:00:00.000Z");
  });

  it("does not overwrite a value that is already present on the surviving record", () => {
    const records: Counterparty[] = [
      counterparty({
        id: "old",
        name: "同名会社",
        createdAt: "2026-01-01T00:00:00.000Z",
        defaultAccountName: "既存の科目",
      }),
      counterparty({
        id: "new",
        name: "同名会社",
        createdAt: "2026-02-01T00:00:00.000Z",
        defaultAccountName: "別の科目",
      }),
    ];

    const result = dedupeCounterpartiesByName(records);
    expect(result[0].defaultAccountName).toBe("既存の科目");
  });

  it("does not merge same-named records of different kinds (client vs vendor)", () => {
    const records: Counterparty[] = [
      counterparty({ id: "1", name: "同名会社", kind: "client" }),
      counterparty({ id: "2", name: "同名会社", kind: "vendor" }),
    ];

    const result = dedupeCounterpartiesByName(records);
    expect(result).toHaveLength(2);
    expect(result.map((r) => r.kind).sort()).toEqual(["client", "vendor"]);
  });

  it("leaves records with unique names untouched", () => {
    const records: Counterparty[] = [
      counterparty({ id: "1", name: "取引先A" }),
      counterparty({ id: "2", name: "取引先B" }),
    ];
    const result = dedupeCounterpartiesByName(records);
    expect(result).toHaveLength(2);
  });

  it("accepts a second independently-sourced valid registration number without error", () => {
    const errors = validateCounterpartyDraft({
      name: "有限会社テスト2",
      kind: "vendor",
      invoiceRegistrationNumber: VALID_REGISTRATION_NUMBER_2,
    });
    expect(hasCounterpartyErrors(errors)).toBe(false);
  });
});
