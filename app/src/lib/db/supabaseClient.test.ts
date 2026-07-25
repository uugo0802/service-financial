import { describe, expect, it } from "vitest";
import { getSupabaseClient } from "./supabaseClient";

describe("getSupabaseClient", () => {
  it("throws a clear error when Supabase env vars are not configured", () => {
    expect(() => getSupabaseClient()).toThrow(/Supabaseが未設定です/);
  });
});
