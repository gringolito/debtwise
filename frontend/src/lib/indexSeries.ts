import type { IndexName, IndexValue, ProjectedValue } from "@/lib/api";

/** A point of an index's chart: a published value, a projected one, or both where they meet. */
export interface SeriesPoint {
  time: number;
  history?: number;
  projection?: number;
}

export const timeOf = (isoDate: string) => Date.parse(`${isoDate}T00:00:00Z`);

/** addMonths moves an ISO date by whole months, back when months is negative. */
export function addMonths(isoDate: string, months: number): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1 + months, day)).toISOString().slice(0, 10);
}

/**
 * plottedValues is what a chart of the index draws. TR and the poupança yield have a value for the
 * month that starts on each day, which zigzags as the days of a month differ, so their charts draw
 * the months from the 1st to the 1st, the ones the projection continues (ADR-0009).
 */
export function plottedValues(index: IndexName, values: IndexValue[]): IndexValue[] {
  if (index !== "tr" && index !== "poupanca_yield") return values;
  return values.filter(
    (v) => v.period_start.endsWith("-01") && v.period_end === addMonths(v.period_start, 1),
  );
}
/**
 * seriesPoints plots the values and projected values that start from `from` to `to`, both
 * included. The projection starts from the last published value shown, so the two lines meet.
 * Plotting is the one place a value becomes a Number; the screen text keeps the decimal string.
 */
export function seriesPoints(
  values: IndexValue[],
  projection: ProjectedValue[],
  from: string,
  to: string,
): SeriesPoint[] {
  const within = (v: { period_start: string }) => v.period_start >= from && v.period_start <= to;
  const points: SeriesPoint[] = values
    .filter(within)
    .map((v) => ({ time: timeOf(v.period_start), history: Number(v.value) }));
  const ahead = projection.filter(within);
  const last = points.at(-1);
  if (last && ahead.length > 0) last.projection = last.history;
  for (const v of ahead) points.push({ time: timeOf(v.period_start), projection: Number(v.value) });
  return points;
}
