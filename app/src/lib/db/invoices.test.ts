import { beforeEach, describe, expect, it, vi } from "vitest";
import { getSupabaseClient } from "./supabaseClient";
import { InvoiceRow, createInvoice, deleteInvoice, listInvoices, updateInvoicePayment } from "./invoices";

vi.mock("./supabaseClient", async () => {
  const actual = await vi.importActual<typeof import("./supabaseClient")>("./supabaseClient");
  return { ...actual, getSupabaseClient: vi.fn() };
});

function createBuilder(result: { data: unknown; error: unknown }) {
  const builder: Record<string, unknown> = {};
  for (const method of ["select", "insert", "update", "delete", "eq", "order"]) {
    builder[method] = vi.fn(() => builder);
  }
  builder.single = vi.fn(() => Promise.resolve(result));
  builder.then = (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) =>
    Promise.resolve(result).then(resolve, reject);
  return builder;
}

const sampleRow: InvoiceRow = {
  id: "inv-1",
  tenant_id: "tenant-1",
  invoice_number: "INV-20260601-0001",
  client_name: "A商事株式会社",
  issue_date: "2026-06-01",
  due_date: "2026-06-30",
  grand_total: 330000,
  paid_at: null,
  paid_amount: null,
  created_at: "2026-06-01T00:00:00Z",
};

describe("invoices CRUD", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("listInvoices scopes by tenant, orders by issue_date asc, and maps rows to ReceivableInvoiceInput", async () => {
    const builder = createBuilder({ data: [sampleRow], error: null });
    const from = vi.fn(() => builder);
    vi.mocked(getSupabaseClient).mockReturnValue({ from } as never);

    const result = await listInvoices("tenant-1");

    expect(from).toHaveBeenCalledWith("invoices");
    expect(builder.eq).toHaveBeenCalledWith("tenant_id", "tenant-1");
    expect(builder.order).toHaveBeenCalledWith("issue_date", { ascending: true });
    expect(result).toEqual([
      {
        invoiceNumber: "INV-20260601-0001",
        clientName: "A商事株式会社",
        issueDate: "2026-06-01",
        dueDate: "2026-06-30",
        grandTotal: 330000,
        paidAt: undefined,
        paidAmount: undefined,
      },
    ]);
  });

  it("listInvoices returns an empty array when no data is returned", async () => {
    const builder = createBuilder({ data: null, error: null });
    vi.mocked(getSupabaseClient).mockReturnValue({ from: vi.fn(() => builder) } as never);

    const result = await listInvoices("tenant-1");
    expect(result).toEqual([]);
  });

  it("listInvoices throws a Japanese error message on failure", async () => {
    const builder = createBuilder({ data: null, error: { message: "boom" } });
    vi.mocked(getSupabaseClient).mockReturnValue({ from: vi.fn(() => builder) } as never);

    await expect(listInvoices("tenant-1")).rejects.toThrow(/請求書の取得に失敗しました/);
  });

  it("createInvoice inserts a trimmed record scoped to the tenant", async () => {
    const builder = createBuilder({ data: sampleRow, error: null });
    vi.mocked(getSupabaseClient).mockReturnValue({ from: vi.fn(() => builder) } as never);

    const result = await createInvoice("tenant-1", {
      invoiceNumber: "  INV-20260601-0001  ",
      clientName: "  A商事株式会社  ",
      issueDate: "2026-06-01",
      dueDate: "2026-06-30",
      grandTotal: 330000,
    });

    expect(builder.insert).toHaveBeenCalledWith({
      tenant_id: "tenant-1",
      invoice_number: "INV-20260601-0001",
      client_name: "A商事株式会社",
      issue_date: "2026-06-01",
      due_date: "2026-06-30",
      grand_total: 330000,
      paid_at: null,
      paid_amount: null,
    });
    expect(result.invoiceNumber).toBe("INV-20260601-0001");
  });

  it("createInvoice throws a Japanese error message on failure", async () => {
    const builder = createBuilder({ data: null, error: { message: "boom" } });
    vi.mocked(getSupabaseClient).mockReturnValue({ from: vi.fn(() => builder) } as never);

    await expect(
      createInvoice("tenant-1", {
        invoiceNumber: "INV-1",
        clientName: "A社",
        issueDate: "2026-06-01",
        grandTotal: 1000,
      })
    ).rejects.toThrow(/請求書の登録に失敗しました/);
  });

  it("updateInvoicePayment scopes the update by invoice_number and tenant_id", async () => {
    const paidRow: InvoiceRow = { ...sampleRow, paid_at: "2026-06-25", paid_amount: 330000 };
    const builder = createBuilder({ data: paidRow, error: null });
    vi.mocked(getSupabaseClient).mockReturnValue({ from: vi.fn(() => builder) } as never);

    const result = await updateInvoicePayment("tenant-1", "INV-20260601-0001", {
      paidAt: "2026-06-25",
      paidAmount: 330000,
    });

    expect(builder.update).toHaveBeenCalledWith({ paid_at: "2026-06-25", paid_amount: 330000 });
    expect(builder.eq).toHaveBeenCalledWith("invoice_number", "INV-20260601-0001");
    expect(builder.eq).toHaveBeenCalledWith("tenant_id", "tenant-1");
    expect(result.paidAt).toBe("2026-06-25");
    expect(result.paidAmount).toBe(330000);
  });

  it("updateInvoicePayment only includes fields explicitly provided", async () => {
    const builder = createBuilder({ data: sampleRow, error: null });
    vi.mocked(getSupabaseClient).mockReturnValue({ from: vi.fn(() => builder) } as never);

    await updateInvoicePayment("tenant-1", "INV-20260601-0001", { paidAt: "2026-06-25" });

    expect(builder.update).toHaveBeenCalledWith({ paid_at: "2026-06-25" });
  });

  it("updateInvoicePayment throws a Japanese error message on failure", async () => {
    const builder = createBuilder({ data: null, error: { message: "boom" } });
    vi.mocked(getSupabaseClient).mockReturnValue({ from: vi.fn(() => builder) } as never);

    await expect(
      updateInvoicePayment("tenant-1", "INV-20260601-0001", { paidAt: "2026-06-25" })
    ).rejects.toThrow(/請求書の入金状況の更新に失敗しました/);
  });

  it("deleteInvoice scopes the delete by invoice_number and tenant_id", async () => {
    const builder = createBuilder({ data: null, error: null });
    vi.mocked(getSupabaseClient).mockReturnValue({ from: vi.fn(() => builder) } as never);

    await deleteInvoice("tenant-1", "INV-20260601-0001");

    expect(builder.delete).toHaveBeenCalledTimes(1);
    expect(builder.eq).toHaveBeenCalledWith("invoice_number", "INV-20260601-0001");
    expect(builder.eq).toHaveBeenCalledWith("tenant_id", "tenant-1");
  });

  it("deleteInvoice throws a Japanese error message on failure", async () => {
    const builder = createBuilder({ data: null, error: { message: "boom" } });
    vi.mocked(getSupabaseClient).mockReturnValue({ from: vi.fn(() => builder) } as never);

    await expect(deleteInvoice("tenant-1", "INV-20260601-0001")).rejects.toThrow(/請求書の削除に失敗しました/);
  });
});
