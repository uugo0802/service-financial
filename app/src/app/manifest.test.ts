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

  it("includes 192x192 and 512x512 PNG icons required for Android/desktop installability", () => {
    const result = manifest();
    const icons = result.icons ?? [];

    const icon192 = icons.find((icon) => icon.sizes === "192x192" && icon.type === "image/png");
    const icon512 = icons.find((icon) => icon.sizes === "512x512" && icon.type === "image/png");

    expect(icon192?.src).toBeTruthy();
    expect(icon512?.src).toBeTruthy();
  });

  it("includes at least one maskable icon so Android can safely crop it to a shape", () => {
    const result = manifest();
    const icons = result.icons ?? [];

    expect(icons.some((icon) => icon.purpose === "maskable")).toBe(true);
  });

  it("sets scope so the installed app treats the whole site as in-scope", () => {
    const result = manifest();
    expect(result.scope).toBe("/");
  });
});
