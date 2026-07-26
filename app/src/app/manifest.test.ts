import { describe, expect, it } from "vitest";
import manifest from "./manifest";

describe("manifest", () => {
  it("provides installable PWA fields with standalone display", () => {
    const result = manifest();

    expect(result.name).toBeTruthy();
    expect(result.short_name).toBeTruthy();
    expect(result.start_url).toBe("/");
    expect(result.display).toBe("standalone");
    expect(result.icons?.length).toBeGreaterThan(0);
  });
});
