import { describe, expect, it } from "vitest";
import {
  FiscalYearCloseState,
  closeFiscalYear,
  createOpenFiscalYearState,
  isDateInFiscalYear,
  isJournalEditAllowed,
  reopenFiscalYear,
} from "./yearClose";

function openState(overrides: Partial<FiscalYearCloseState> = {}): FiscalYearCloseState {
  return { ...createOpenFiscalYearState(2025), ...overrides };
}

describe("isDateInFiscalYear", () => {
  it("returns true for a date within the fiscal year", () => {
    expect(isDateInFiscalYear(2025, "2025-06-15")).toBe(true);
  });

  it("treats the fiscal year start (1/1) as within the year", () => {
    expect(isDateInFiscalYear(2025, "2025-01-01")).toBe(true);
  });

  it("treats the fiscal year end (12/31) as within the year", () => {
    expect(isDateInFiscalYear(2025, "2025-12-31")).toBe(true);
  });

  it("returns false for the day after the fiscal year end", () => {
    expect(isDateInFiscalYear(2025, "2026-01-01")).toBe(false);
  });

  it("returns false for the day before the fiscal year start", () => {
    expect(isDateInFiscalYear(2025, "2024-12-31")).toBe(false);
  });

  it("returns false for a malformed date", () => {
    expect(isDateInFiscalYear(2025, "2025/06/15")).toBe(false);
  });
});

describe("isJournalEditAllowed", () => {
  it("allows edits when the fiscal year is open", () => {
    const state = openState();
    expect(isJournalEditAllowed(state, "2025-06-15")).toBe(true);
  });

  it("prevents edits when the fiscal year is closed", () => {
    const state = openState({ closed: true, closedAt: "2026-03-15T00:00:00Z" });
    expect(isJournalEditAllowed(state, "2025-06-15")).toBe(false);
  });

  it("prevents edits for an entry dated exactly on the fiscal year end when closed", () => {
    const state = openState({ closed: true, closedAt: "2026-03-15T00:00:00Z" });
    expect(isJournalEditAllowed(state, "2025-12-31")).toBe(false);
  });

  it("allows edits for an entry dated the day after the fiscal year end even when closed", () => {
    const state = openState({ closed: true, closedAt: "2026-03-15T00:00:00Z" });
    expect(isJournalEditAllowed(state, "2026-01-01")).toBe(true);
  });

  it("allows edits for an entry belonging to a different fiscal year regardless of this year's lock state", () => {
    const state = openState({ closed: true, closedAt: "2026-03-15T00:00:00Z" });
    expect(isJournalEditAllowed(state, "2024-06-15")).toBe(true);
  });
});

describe("closeFiscalYear", () => {
  it("closes an open fiscal year and returns an audit entry", () => {
    const state = openState();
    const result = closeFiscalYear(state, { closedAt: "2026-03-15T00:00:00Z" });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok result");
    expect(result.state).toEqual({
      fiscalYear: 2025,
      closed: true,
      closedAt: "2026-03-15T00:00:00Z",
      reopenHistory: [],
    });
    expect(result.auditEntry.action).toBe("fiscalyear.close");
    expect(result.auditEntry.entityType).toBe("fiscal_year");
    expect(result.auditEntry.entityId).toBe("2025");
    expect(result.auditEntry.description).toContain("2025年度");
  });

  it("does not mutate the original state", () => {
    const state = openState();
    closeFiscalYear(state, { closedAt: "2026-03-15T00:00:00Z" });
    expect(state.closed).toBe(false);
    expect(state.closedAt).toBeNull();
  });

  it("rejects closing an already-closed year instead of silently no-op'ing", () => {
    const state = openState({ closed: true, closedAt: "2026-03-15T00:00:00Z" });
    const result = closeFiscalYear(state);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected error result");
    expect(result.error).toMatch(/既に確定済み/);
  });
});

describe("reopenFiscalYear", () => {
  const closedState = openState({ closed: true, closedAt: "2026-03-15T00:00:00Z" });

  it("reopens a closed year when given a non-empty reason", () => {
    const result = reopenFiscalYear(closedState, "税務署からの指摘で修正が必要なため", {
      reopenedAt: "2026-04-01T00:00:00Z",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok result");
    expect(result.state.closed).toBe(false);
    expect(result.state.closedAt).toBeNull();
    expect(result.state.reopenHistory).toEqual([
      { reopenedAt: "2026-04-01T00:00:00Z", reason: "税務署からの指摘で修正が必要なため" },
    ]);
    expect(result.auditEntry.action).toBe("fiscalyear.reopen");
  });

  it("appends to existing reopen history rather than overwriting it", () => {
    const stateWithHistory = openState({
      closed: true,
      closedAt: "2026-03-15T00:00:00Z",
      reopenHistory: [{ reopenedAt: "2026-01-01T00:00:00Z", reason: "過去の修正理由" }],
    });
    const result = reopenFiscalYear(stateWithHistory, "今回の修正理由", { reopenedAt: "2026-04-01T00:00:00Z" });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok result");
    expect(result.state.reopenHistory).toHaveLength(2);
    expect(result.state.reopenHistory[0].reason).toBe("過去の修正理由");
    expect(result.state.reopenHistory[1].reason).toBe("今回の修正理由");
  });

  it("rejects an empty reason", () => {
    const result = reopenFiscalYear(closedState, "");
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected error result");
    expect(result.error).toMatch(/理由/);
  });

  it("rejects a whitespace-only reason", () => {
    const result = reopenFiscalYear(closedState, "   ");
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected error result");
    expect(result.error).toMatch(/理由/);
  });

  it("rejects reopening a year that is not currently closed", () => {
    const state = openState();
    const result = reopenFiscalYear(state, "理由あり");
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected error result");
    expect(result.error).toMatch(/確定されていない/);
  });
});
