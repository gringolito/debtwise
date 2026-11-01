import type { ScheduledInstallment, Verdict } from "@/lib/api";

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
