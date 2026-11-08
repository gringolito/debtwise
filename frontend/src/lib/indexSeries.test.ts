import { describe, expect, it } from "vitest";
import type { IndexValue, ProjectedValue } from "@/lib/api";
import { addMonths, plottedValues, seriesPoints, timeOf } from "@/lib/indexSeries";

const published = (start: string, end: string, value: string): IndexValue => ({
  period_start: start,
  period_end: end,
  value,
  fetched_at: "2024-04-14T18:20:33Z",
});

const projected = (start: string, value: string): ProjectedValue => ({
  period_start: start,
  period_end: start,
  value,
  methods: [],
});

describe("addMonths", () => {
  it.each([
    ["2024-04-15", -12, "2023-04-15"],
    ["2024-11-01", 3, "2025-02-01"],
    ["2024-01-31", 1, "2024-03-02"],
  ])("moves %s by %i months to %s", (date, months, want) => {
    expect(addMonths(date, months)).toBe(want);
  });
});

describe("plottedValues", () => {
  const tr = [
    published("2024-03-01", "2024-04-01", "0.0331"),
    published("2024-03-01", "2024-03-02", "0.0312"),
    published("2024-03-02", "2024-04-02", "0.0299"),
    published("2024-04-01", "2024-05-01", "0.0200"),
  ];

  it("draws TR and the poupança yield by the months from the 1st to the 1st", () => {
    expect(plottedValues("tr", tr).map((v) => v.value)).toEqual(["0.0331", "0.0200"]);
    expect(plottedValues("poupanca_yield", tr).map((v) => v.value)).toEqual(["0.0331", "0.0200"]);
  });

  it("draws every value of the other indexes", () => {
    expect(plottedValues("selic", tr)).toEqual(tr);
  });
});

describe("seriesPoints", () => {
  const values = [
    published("2023-12-01", "2023-12-01", "0.50"),
    published("2024-01-01", "2024-01-01", "0.42"),
    published("2024-02-01", "2024-02-01", "-0.32"),
  ];

  it("keeps the values from `from` to `to` and joins the projection to the last one", () => {
    const points = seriesPoints(
      values,
      [projected("2024-03-01", "0.40"), projected("2024-05-01", "0.35")],
      "2024-01-01",
      "2024-04-01",
    );

    expect(points).toEqual([
      { time: timeOf("2024-01-01"), history: 0.42 },
      { time: timeOf("2024-02-01"), history: -0.32, projection: -0.32 },
      { time: timeOf("2024-03-01"), projection: 0.4 },
    ]);
  });

  it("leaves the history unjoined when no projected value falls in the window", () => {
    expect(
      seriesPoints(values, [projected("2024-05-01", "0.35")], "2024-02-01", "2024-04-01"),
    ).toEqual([{ time: timeOf("2024-02-01"), history: -0.32 }]);
  });
});
