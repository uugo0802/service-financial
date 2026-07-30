import { afterEach, describe, expect, it, vi } from "vitest";
import { getSupabaseClient } from "./supabaseClient";

describe("getSupabaseClient", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("throws a clear error when Supabase env vars are not configured", () => {
    expect(() => getSupabaseClient()).toThrow(/Supabaseが未設定です/);
  });

  it("throws when only the URL is configured (anon key missing)", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");
    expect(() => getSupabaseClient()).toThrow(/Supabaseが未設定です/);
  });

  it("throws when only the anon key is configured (URL missing)", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "test-anon-key");
    expect(() => getSupabaseClient()).toThrow(/Supabaseが未設定です/);
  });

  it("creates and caches a client once both env vars are configured", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "test-anon-key");

    const client = getSupabaseClient();
    expect(client).toBeTruthy();

    // Subsequent calls (even with different/missing env vars) return the
    // same cached instance rather than re-reading process.env or throwing.
    vi.unstubAllEnvs();
    const again = getSupabaseClient();
    expect(again).toBe(client);
  });
});
