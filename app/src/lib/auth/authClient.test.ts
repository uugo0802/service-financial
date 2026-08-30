import { beforeEach, describe, expect, it, vi } from "vitest";
import { getSupabaseClient } from "../db/supabaseClient";
import { getCurrentSession, signInWithGoogle, signInWithMagicLink, signOut } from "./authClient";

vi.mock("../db/supabaseClient", () => ({
  getSupabaseClient: vi.fn(),
}));

function mockClient(overrides: Partial<Record<string, unknown>> = {}) {
  const auth = {
    signInWithOtp: vi.fn().mockResolvedValue({ data: {}, error: null }),
    signInWithOAuth: vi.fn().mockResolvedValue({ data: { provider: "google", url: "https://accounts.google.com/o" }, error: null }),
    signOut: vi.fn().mockResolvedValue({ error: null }),
    getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
    ...overrides,
  };
  const client = { auth };
  vi.mocked(getSupabaseClient).mockReturnValue(client as never);
  return client;
}

describe("signInWithMagicLink", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sends a magic link email and returns no error on success", async () => {
    const client = mockClient();

    const result = await signInWithMagicLink("user@example.com");

    expect(result).toEqual({ error: null });
    expect(client.auth.signInWithOtp).toHaveBeenCalledWith({
      email: "user@example.com",
      options: undefined,
    });
  });

  it("passes emailRedirectTo through to Supabase when provided", async () => {
    const client = mockClient();

    await signInWithMagicLink("user@example.com", "https://example.com/login");

    expect(client.auth.signInWithOtp).toHaveBeenCalledWith({
      email: "user@example.com",
      options: { emailRedirectTo: "https://example.com/login" },
    });
  });

  it("surfaces the Supabase error message on failure", async () => {
    mockClient({
      signInWithOtp: vi.fn().mockResolvedValue({ data: {}, error: { message: "rate limit exceeded" } }),
    });

    const result = await signInWithMagicLink("user@example.com");

    expect(result).toEqual({ error: "rate limit exceeded" });
  });
});

describe("signInWithGoogle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("starts the Google OAuth flow and returns no error on success", async () => {
    const client = mockClient();

    const result = await signInWithGoogle();

    expect(result).toEqual({ error: null });
    expect(client.auth.signInWithOAuth).toHaveBeenCalledWith({
      provider: "google",
      options: undefined,
    });
  });

  it("passes redirectTo through to Supabase when provided", async () => {
    const client = mockClient();

    await signInWithGoogle("https://example.com/auth/confirm");

    expect(client.auth.signInWithOAuth).toHaveBeenCalledWith({
      provider: "google",
      options: { redirectTo: "https://example.com/auth/confirm" },
    });
  });

  it("surfaces the Supabase error message on failure", async () => {
    mockClient({
      signInWithOAuth: vi.fn().mockResolvedValue({ data: { provider: "google", url: null }, error: { message: "provider not enabled" } }),
    });

    const result = await signInWithGoogle();

    expect(result).toEqual({ error: "provider not enabled" });
  });
});

describe("signOut", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns no error on successful sign-out", async () => {
    const client = mockClient();

    const result = await signOut();

    expect(result).toEqual({ error: null });
    expect(client.auth.signOut).toHaveBeenCalledTimes(1);
  });

  it("surfaces the Supabase error message on failure", async () => {
    mockClient({ signOut: vi.fn().mockResolvedValue({ error: { message: "network error" } }) });

    const result = await signOut();

    expect(result).toEqual({ error: "network error" });
  });
});

describe("getCurrentSession", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns null when there is no active session", async () => {
    mockClient();

    const session = await getCurrentSession();

    expect(session).toBeNull();
  });

  it("returns the active session when present", async () => {
    const fakeSession = { access_token: "token", user: { id: "user-1" } };
    mockClient({ getSession: vi.fn().mockResolvedValue({ data: { session: fakeSession }, error: null }) });

    const session = await getCurrentSession();

    expect(session).toEqual(fakeSession);
  });
});
