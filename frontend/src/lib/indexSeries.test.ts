import { describe, expect, it } from "vitest";
import type { IndexValue, ProjectedValue } from "@/lib/api";
import {
  addMonths,
  axisTicks,
  chartWindow,
  plottedValues,
  seriesPoints,
  timeOf,
} from "@/lib/indexSeries";

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
    // A day the target month lacks runs into the next, as Date does.
    ["2024-01-31", 1, "2024-03-02"],
  ])("moves %s by %i months to %s", (date, months, want) => {
    expect(addMonths(date, months)).toBe(want);
  });
});

describe("chartWindow", () => {
  it.each([
    [1, "2025-11-08", "2027-05-08"],
    [5, "2021-11-08", "2029-05-08"],
    [10, "2016-11-08", "2031-11-08"],
  ])("shows %i years up to today and half as many after", (years, from, to) => {
    expect(chartWindow("2026-11-08", years)).toEqual({ from, to });
  });
});

describe("axisTicks", () => {
  const iso = (ticks: number[]) => ticks.map((t) => new Date(t).toISOString().slice(0, 10));

  it("ticks each 1st of January in the range", () => {
    expect(iso(axisTicks(timeOf("2021-11-08"), timeOf("2024-05-08"), 12))).toEqual([
      "2022-01-01",
      "2023-01-01",
      "2024-01-01",
    ]);
  });

  it("ticks each quarter for a shorter range", () => {
    expect(iso(axisTicks(timeOf("2025-11-08"), timeOf("2026-07-01"), 3))).toEqual([
      "2026-01-01",
      "2026-04-01",
      "2026-07-01",
    ]);
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
