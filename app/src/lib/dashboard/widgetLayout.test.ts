import { describe, expect, it } from "vitest";
import {
  DASHBOARD_WIDGETS,
  DashboardWidgetLayout,
  getDefaultWidgetLayout,
  getWidgetLabel,
  moveWidget,
  parseWidgetLayout,
  serializeWidgetLayout,
  toggleWidgetVisibility,
} from "./widgetLayout";

describe("getDefaultWidgetLayout", () => {
  it("returns every known widget, all visible, in the DASHBOARD_WIDGETS order", () => {
    const layout = getDefaultWidgetLayout();
    expect(layout).toEqual(DASHBOARD_WIDGETS.map((w) => ({ id: w.id, visible: true })));
  });

  it("returns a fresh array each call (callers can safely mutate their own copy)", () => {
    const a = getDefaultWidgetLayout();
    const b = getDefaultWidgetLayout();
    expect(a).not.toBe(b);
    expect(a).toEqual(b);
  });
});

describe("getWidgetLabel", () => {
  it("returns the configured label for a known widget id", () => {
    expect(getWidgetLabel("trendLine")).toBe(
      DASHBOARD_WIDGETS.find((w) => w.id === "trendLine")?.label
    );
  });

  it("falls back to the raw id for an unknown id (defensive, should not crash)", () => {
    // @ts-expect-error intentionally passing an id outside the known union
    expect(getWidgetLabel("notARealWidget")).toBe("notARealWidget");
  });
});

describe("parseWidgetLayout - no stored data", () => {
  it("returns the default layout when raw is null (nothing stored yet)", () => {
    expect(parseWidgetLayout(null)).toEqual(getDefaultWidgetLayout());
  });

  it("returns the default layout when raw is undefined", () => {
    expect(parseWidgetLayout(undefined)).toEqual(getDefaultWidgetLayout());
  });

  it("returns the default layout for an empty string", () => {
    expect(parseWidgetLayout("")).toEqual(getDefaultWidgetLayout());
  });
});

describe("parseWidgetLayout - malformed data falls back safely", () => {
  it("falls back to defaults for invalid JSON", () => {
    expect(parseWidgetLayout("{not valid json")).toEqual(getDefaultWidgetLayout());
  });

  it("falls back to defaults when the parsed value is not an array (e.g. an object)", () => {
    expect(parseWidgetLayout(JSON.stringify({ id: "trendLine", visible: true }))).toEqual(
      getDefaultWidgetLayout()
    );
  });

  it("falls back to defaults when the parsed value is a primitive", () => {
    expect(parseWidgetLayout(JSON.stringify("trendLine"))).toEqual(getDefaultWidgetLayout());
    expect(parseWidgetLayout(JSON.stringify(42))).toEqual(getDefaultWidgetLayout());
  });

  it("drops entries with the wrong shape (missing visible, wrong types) and still fills in the rest as defaults", () => {
    const raw = JSON.stringify([
      { id: "trendLine" }, // missing visible -> dropped
      { id: "trendBar", visible: "yes" }, // visible not boolean -> dropped
      { visible: true }, // missing id -> dropped
    ]);
    // nothing survives, so every known widget gets appended as a visible default
    expect(parseWidgetLayout(raw)).toEqual(getDefaultWidgetLayout());
  });

  it("ignores entries referencing an unknown widget id (e.g. from a future version) without crashing", () => {
    const raw = JSON.stringify([
      { id: "trendLine", visible: true },
      { id: "futureWidgetFromV2", visible: true }, // unknown id -> ignored
      { id: "benchmark", visible: false },
    ]);
    const layout = parseWidgetLayout(raw);
    expect(layout.some((e) => (e.id as string) === "futureWidgetFromV2")).toBe(false);
    expect(layout.find((e) => e.id === "trendLine")).toEqual({ id: "trendLine", visible: true });
    expect(layout.find((e) => e.id === "benchmark")).toEqual({ id: "benchmark", visible: false });
    // every known widget is still present overall (missing ones backfilled)
    expect(layout.map((e) => e.id).sort()).toEqual(DASHBOARD_WIDGETS.map((w) => w.id).sort());
  });

  it("backfills widgets missing from a legacy/partial stored layout (e.g. added after the user's save) as visible, appended at the end", () => {
    const raw = JSON.stringify([{ id: "benchmark", visible: false }]);
    const layout = parseWidgetLayout(raw);
    expect(layout[0]).toEqual({ id: "benchmark", visible: false });
    const remainingIds = layout.slice(1).map((e) => e.id);
    expect(remainingIds).toEqual(DASHBOARD_WIDGETS.filter((w) => w.id !== "benchmark").map((w) => w.id));
    for (const entry of layout.slice(1)) {
      expect(entry.visible).toBe(true);
    }
  });

  it("keeps only the first occurrence when a widget id is duplicated in the stored data", () => {
    const raw = JSON.stringify([
      { id: "trendLine", visible: false },
      { id: "trendLine", visible: true },
    ]);
    const layout = parseWidgetLayout(raw);
    expect(layout.filter((e) => e.id === "trendLine")).toHaveLength(1);
    expect(layout.find((e) => e.id === "trendLine")).toEqual({ id: "trendLine", visible: false });
  });

  it("accepts a fully valid, reordered, partially-hidden layout as-is", () => {
    const raw = JSON.stringify([
      { id: "benchmark", visible: true },
      { id: "statTiles", visible: false },
      { id: "trendLine", visible: true },
      { id: "trendBar", visible: true },
      { id: "kpiTrend", visible: false },
      { id: "expenseBreakdown", visible: true },
    ]);
    expect(parseWidgetLayout(raw)).toEqual(JSON.parse(raw));
  });
});

describe("serializeWidgetLayout", () => {
  it("round-trips through parseWidgetLayout for a valid layout", () => {
    const layout = getDefaultWidgetLayout();
    expect(parseWidgetLayout(serializeWidgetLayout(layout))).toEqual(layout);
  });

  it("produces a JSON string", () => {
    const layout = getDefaultWidgetLayout();
    const raw = serializeWidgetLayout(layout);
    expect(() => JSON.parse(raw)).not.toThrow();
  });
});

describe("toggleWidgetVisibility", () => {
  it("flips visible for the targeted widget only", () => {
    const layout = getDefaultWidgetLayout();
    const next = toggleWidgetVisibility(layout, "trendBar");
    expect(next.find((e) => e.id === "trendBar")?.visible).toBe(false);
    for (const entry of next) {
      if (entry.id !== "trendBar") expect(entry.visible).toBe(true);
    }
  });

  it("toggling twice returns to the original visibility", () => {
    const layout = getDefaultWidgetLayout();
    const twice = toggleWidgetVisibility(toggleWidgetVisibility(layout, "kpiTrend"), "kpiTrend");
    expect(twice).toEqual(layout);
  });

  it("does not mutate the input layout", () => {
    const layout = getDefaultWidgetLayout();
    const snapshot: DashboardWidgetLayout = JSON.parse(JSON.stringify(layout));
    toggleWidgetVisibility(layout, "trendBar");
    expect(layout).toEqual(snapshot);
  });

  it("is a no-op (returns an equivalent layout) for an id not present in the layout", () => {
    const layout: DashboardWidgetLayout = [{ id: "trendLine", visible: true }];
    // @ts-expect-error intentionally passing an id absent from this particular layout
    expect(toggleWidgetVisibility(layout, "benchmark")).toEqual(layout);
  });
});

describe("moveWidget", () => {
  it("moves a widget up by one position", () => {
    const layout = getDefaultWidgetLayout();
    const next = moveWidget(layout, "trendBar", "up");
    expect(next.map((e) => e.id)).toEqual([
      "statTiles",
      "trendBar",
      "trendLine",
      "kpiTrend",
      "expenseBreakdown",
      "benchmark",
    ]);
  });

  it("moves a widget down by one position", () => {
    const layout = getDefaultWidgetLayout();
    const next = moveWidget(layout, "trendLine", "down");
    expect(next.map((e) => e.id)).toEqual([
      "statTiles",
      "trendBar",
      "trendLine",
      "kpiTrend",
      "expenseBreakdown",
      "benchmark",
    ]);
  });

  it("does nothing (returns the same layout) when moving the first widget up", () => {
    const layout = getDefaultWidgetLayout();
    expect(moveWidget(layout, "statTiles", "up")).toEqual(layout);
  });

  it("does nothing (returns the same layout) when moving the last widget down", () => {
    const layout = getDefaultWidgetLayout();
    expect(moveWidget(layout, "benchmark", "down")).toEqual(layout);
  });

  it("preserves each entry's visibility while reordering", () => {
    const layout = toggleWidgetVisibility(getDefaultWidgetLayout(), "kpiTrend");
    const next = moveWidget(layout, "kpiTrend", "up");
    expect(next.find((e) => e.id === "kpiTrend")).toEqual({ id: "kpiTrend", visible: false });
  });

  it("does not mutate the input layout", () => {
    const layout = getDefaultWidgetLayout();
    const snapshot: DashboardWidgetLayout = JSON.parse(JSON.stringify(layout));
    moveWidget(layout, "trendBar", "up");
    expect(layout).toEqual(snapshot);
  });

  it("returns the same layout unchanged for an id not present in the layout", () => {
    const layout: DashboardWidgetLayout = [{ id: "trendLine", visible: true }];
    // @ts-expect-error intentionally passing an id absent from this particular layout
    expect(moveWidget(layout, "benchmark", "up")).toEqual(layout);
  });
});
