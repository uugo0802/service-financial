import { beforeEach, describe, expect, it, vi } from "vitest";
import { getSupabaseClient } from "../db/supabaseClient";
import { enrollTotpFactor, listTotpFactors, unenrollTotpFactor, verifyTotpFactor } from "./twoFactor";

vi.mock("../db/supabaseClient", () => ({
  getSupabaseClient: vi.fn(),
}));

function mockClient(overrides: Partial<Record<string, unknown>> = {}) {
  const mfa = {
    enroll: vi.fn().mockResolvedValue({ data: null, error: null }),
    challengeAndVerify: vi.fn().mockResolvedValue({ data: null, error: null }),
    listFactors: vi.fn().mockResolvedValue({ data: { all: [] }, error: null }),
    unenroll: vi.fn().mockResolvedValue({ data: null, error: null }),
    ...overrides,
  };
  const client = { auth: { mfa } };
  vi.mocked(getSupabaseClient).mockReturnValue(client as never);
  return client;
}

describe("enrollTotpFactor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("enrolls a TOTP factor and returns the QR code/secret/uri", async () => {
    const client = mockClient({
      enroll: vi.fn().mockResolvedValue({
        data: {
          id: "factor-1",
          type: "totp",
          totp: {
            qr_code: "<svg>qr</svg>",
            secret: "SECRET123",
            uri: "otpauth://totp/example",
          },
        },
        error: null,
      }),
    });

    const result = await enrollTotpFactor();

    expect(client.auth.mfa.enroll).toHaveBeenCalledWith({
      factorType: "totp",
      issuer: "税務申告AI（ジャービス）",
    });
    expect(result).toEqual({
      data: {
        factorId: "factor-1",
        qrCode: "<svg>qr</svg>",
        secret: "SECRET123",
        uri: "otpauth://totp/example",
      },
      error: null,
    });
  });

  it("passes friendlyName through to Supabase when provided", async () => {
    const client = mockClient({
      enroll: vi.fn().mockResolvedValue({
        data: {
          id: "factor-1",
          type: "totp",
          totp: { qr_code: "<svg/>", secret: "SECRET", uri: "otpauth://totp/example" },
        },
        error: null,
      }),
    });

    await enrollTotpFactor("iPhone");

    expect(client.auth.mfa.enroll).toHaveBeenCalledWith({
      factorType: "totp",
      issuer: "税務申告AI（ジャービス）",
      friendlyName: "iPhone",
    });
  });

  it("surfaces the Supabase error message on failure", async () => {
    mockClient({
      enroll: vi.fn().mockResolvedValue({ data: null, error: { message: "enroll failed" } }),
    });

    const result = await enrollTotpFactor();

    expect(result).toEqual({ data: null, error: "enroll failed" });
  });
});

describe("verifyTotpFactor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls challengeAndVerify with the factor id and code, and returns no error on success", async () => {
    const client = mockClient({
      challengeAndVerify: vi.fn().mockResolvedValue({ data: { access_token: "tok" }, error: null }),
    });

    const result = await verifyTotpFactor("factor-1", "123456");

    expect(result).toEqual({ error: null });
    expect(client.auth.mfa.challengeAndVerify).toHaveBeenCalledWith({
      factorId: "factor-1",
      code: "123456",
    });
  });

  it("surfaces the Supabase error message on failure", async () => {
    mockClient({
      challengeAndVerify: vi.fn().mockResolvedValue({ data: null, error: { message: "invalid code" } }),
    });

    const result = await verifyTotpFactor("factor-1", "000000");

    expect(result).toEqual({ error: "invalid code" });
  });
});

describe("listTotpFactors", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns only totp factors, mapped to the wrapper's shape", async () => {
    mockClient({
      listFactors: vi.fn().mockResolvedValue({
        data: {
          all: [
            {
              id: "factor-1",
              friendly_name: "iPhone",
              factor_type: "totp",
              status: "verified",
              created_at: "2026-01-01T00:00:00Z",
              updated_at: "2026-01-02T00:00:00Z",
            },
            {
              id: "factor-2",
              factor_type: "phone",
              status: "verified",
              created_at: "2026-01-01T00:00:00Z",
              updated_at: "2026-01-02T00:00:00Z",
            },
          ],
          totp: [],
        },
        error: null,
      }),
    });

    const result = await listTotpFactors();

    expect(result).toEqual({
      data: [
        {
          id: "factor-1",
          friendlyName: "iPhone",
          status: "verified",
          createdAt: "2026-01-01T00:00:00Z",
          updatedAt: "2026-01-02T00:00:00Z",
        },
      ],
      error: null,
    });
  });

  it("returns null friendlyName when the factor has none", async () => {
    mockClient({
      listFactors: vi.fn().mockResolvedValue({
        data: {
          all: [
            {
              id: "factor-1",
              factor_type: "totp",
              status: "unverified",
              created_at: "2026-01-01T00:00:00Z",
              updated_at: "2026-01-01T00:00:00Z",
            },
          ],
        },
        error: null,
      }),
    });

    const result = await listTotpFactors();

    expect(result.data?.[0].friendlyName).toBeNull();
  });

  it("surfaces the Supabase error message on failure", async () => {
    mockClient({
      listFactors: vi.fn().mockResolvedValue({ data: null, error: { message: "not authenticated" } }),
    });

    const result = await listTotpFactors();

    expect(result).toEqual({ data: null, error: "not authenticated" });
  });
});

describe("unenrollTotpFactor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls unenroll with the factor id and returns no error on success", async () => {
    const client = mockClient({
      unenroll: vi.fn().mockResolvedValue({ data: { id: "factor-1" }, error: null }),
    });

    const result = await unenrollTotpFactor("factor-1");

    expect(result).toEqual({ error: null });
    expect(client.auth.mfa.unenroll).toHaveBeenCalledWith({ factorId: "factor-1" });
  });

  it("surfaces the Supabase error message on failure", async () => {
    mockClient({
      unenroll: vi.fn().mockResolvedValue({ data: null, error: { message: "requires aal2" } }),
    });

    const result = await unenrollTotpFactor("factor-1");

    expect(result).toEqual({ error: "requires aal2" });
  });
});
