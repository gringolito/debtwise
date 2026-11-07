import type {
  LotValued,
  Prepayment,
  ScheduledInstallment,
  StatementDrift,
  Verdict,
  VerdictMarketData,
} from "@/lib/api";
import { indexNames } from "@/lib/indexNames";

/** today is the owner's calendar date as ISO text, the way the API writes dates. */
export function today(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

/** latestDue is the last installment due on or before the date; undefined before the first one. */
export function latestDue(
  installments: ScheduledInstallment[],
  date: string,
): ScheduledInstallment | undefined {
  return installments.findLast((installment) => installment.due_date <= date);
}

/** nextDue is the first installment due after the date; undefined once the last one is due. */
export function nextDue(
  installments: ScheduledInstallment[],
  date: string,
): ScheduledInstallment | undefined {
  return installments.find((installment) => installment.due_date > date);
}

/**
 * sharePaid is the whole percent of the amount financed that the balance no longer owes, from 0 to
 * 100. An indexer's correction can push the balance above the amount financed, which reads as 0.
 */
export function sharePaid(originalAmount: string, balance: string): number {
  const paid = Math.floor((1 - Number(balance) / Number(originalAmount)) * 100 + 1e-9);
  return Math.min(100, Math.max(0, paid));
}

/** bondCount is how many distinct bonds the lots bought: a type and maturity each. */
export function bondCount(lots: LotValued[]): number {
  return new Set(lots.map((lot) => `${lot.type} ${lot.maturity}`)).size;
}

export type Activity =
  | { kind: "statement"; date: string; statement: StatementDrift }
  | { kind: "prepayment"; date: string; prepayment: Prepayment };

/** recentActivity is the latest statements and prepayments recorded, newest first. */
export function recentActivity(
  statements: StatementDrift[],
  prepayments: Prepayment[],
  limit: number,
): Activity[] {
  const activity: Activity[] = [
    ...statements.map((statement) => ({
      kind: "statement" as const,
      date: statement.date,
      statement,
    })),
    ...prepayments.map((prepayment) => ({
      kind: "prepayment" as const,
      date: prepayment.date,
      prepayment,
    })),
  ];
  return activity.sort((a, b) => b.date.localeCompare(a.date)).slice(0, limit);
}

export interface StaleSource {
  name: string;
  /** When the source was last refreshed successfully; absent when it never was. */
  refreshedAt?: string;
}

/** staleSources names the market data a verdict reads that is not fresh, bonds and Focus first. */
export function staleSources({ bonds, focus, indexes }: VerdictMarketData): StaleSource[] {
  return [
    { name: "Preços dos títulos", ...bonds },
    { name: "Expectativas do Focus", ...focus },
    ...indexes.map((index) => ({ ...index, name: indexNames[index.index] })),
  ]
    .filter((source) => source.status !== "fresh")
    .map(({ name, refreshed_at }) => ({ name, refreshedAt: refreshed_at }));
}

/**
 * compareDecimals orders two signed decimal strings exactly, as no float rounding can tie two
 * amounts a cent apart: negative when a is the smaller, positive when b is.
 */
function compareDecimals(a: string, b: string): number {
  const [aInteger, aFraction = ""] = a.split(".");
  const [bInteger, bFraction = ""] = b.split(".");
  const places = Math.max(aFraction.length, bFraction.length);
  const scaled = (integer: string, fraction: string) =>
    BigInt(integer + fraction.padEnd(places, "0"));
  const difference = scaled(aInteger, aFraction) - scaled(bInteger, bFraction);
  return difference === 0n ? 0 : difference < 0n ? -1 : 1;
}

/**
 * bestVerdict is the verdict of the highest Advantage, the first of them on a tie; undefined when no
 * verdict has one.
 */
export function bestVerdict(verdicts: Verdict[]): Verdict | undefined {
  let best: Verdict | undefined;
  for (const verdict of verdicts) {
    if (verdict.advantage === undefined) continue;
    if (best?.advantage === undefined || compareDecimals(verdict.advantage, best.advantage) > 0) {
      best = verdict;
    }
  }
  return best;
}
