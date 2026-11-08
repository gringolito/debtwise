import type { CashFlow, Scenario } from "@/lib/api";

/** A point of the net worth curves: each scenario's net worth on a date, in reais. */
export interface WorthPoint {
  /** The date as milliseconds since the epoch, for a time axis. */
  time: number;
  invest: number;
  prepay: number;
}

// The net worth a scenario's flows leave on a date: that of its last flow on or before it.
function worthOn(flows: CashFlow[], date: string): string {
  return flows.findLast((flow) => flow.date <= date)?.net_worth ?? flows[0].net_worth;
}

/**
 * worthPoints is the net worth of investing and of prepaying on each date either scenario has a
 * flow on, from the decision's date to the horizon. A scenario with no flow on a date keeps the net
 * worth of its last one. Plotting is the one place a net worth becomes a Number; the screen text
 * keeps the decimal string.
 */
export function worthPoints(invest: Scenario, prepay: Scenario): WorthPoint[] {
  const dates = [
    ...new Set([...invest.cash_flows, ...prepay.cash_flows].map((flow) => flow.date)),
  ].sort();
  return dates.map((date) => ({
    time: Date.parse(`${date}T00:00:00Z`),
    invest: Number(worthOn(invest.cash_flows, date)),
    prepay: Number(worthOn(prepay.cash_flows, date)),
  }));
}
