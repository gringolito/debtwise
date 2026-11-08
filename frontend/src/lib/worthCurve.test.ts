import { describe, expect, it } from "vitest";
import type { CashFlow, Scenario } from "@/lib/api";
import { worthPoints } from "@/lib/worthCurve";

const flow = (date: string, net_worth: string): CashFlow => ({
  date,
  invested: "0.00",
  prepaid: "0.00",
  held: "0.00",
  outstanding_balance: "0.00",
  net_worth,
});

const scenario = (...cash_flows: CashFlow[]): Scenario => ({
  net_worth: cash_flows[cash_flows.length - 1].net_worth,
  cash: "0.00",
  outstanding_balance: "0.00",
  cash_flows,
});

const time = (date: string) => Date.parse(`${date}T00:00:00Z`);

describe("worthPoints", () => {
  it("takes every date of either scenario, each keeping its last net worth on a date it has no flow on", () => {
    const invest = scenario(
      flow("2026-11-06", "-100.00"),
      flow("2026-11-15", "-90.50"),
      flow("2026-12-15", "-80.00"),
      flow("2027-01-01", "25.00"),
    );
    const prepay = scenario(
      flow("2026-11-06", "-100.00"),
      flow("2026-12-15", "-85.00"),
      flow("2027-01-01", "10.00"),
    );

    expect(worthPoints(invest, prepay)).toEqual([
      { time: time("2026-11-06"), invest: -100, prepay: -100 },
      { time: time("2026-11-15"), invest: -90.5, prepay: -100 },
      { time: time("2026-12-15"), invest: -80, prepay: -85 },
      { time: time("2027-01-01"), invest: 25, prepay: 10 },
    ]);
  });
});
