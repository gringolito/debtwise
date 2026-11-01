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
 * bestVerdict is the verdict of the highest Advantage, the first of them on a tie; undefined when no
 * verdict has one. Advantages are decimal strings in cents, which Number reads in their exact order.
 */
export function bestVerdict(verdicts: Verdict[]): Verdict | undefined {
  let best: Verdict | undefined;
  for (const verdict of verdicts) {
    if (verdict.advantage === undefined) continue;
    if (best?.advantage === undefined || Number(verdict.advantage) > Number(best.advantage)) {
      best = verdict;
    }
  }
  return best;
}
