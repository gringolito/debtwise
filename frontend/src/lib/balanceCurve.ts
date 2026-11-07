import type { ScheduledInstallment } from "@/lib/api";

/** A point of the balance curve: the balance on a date, on the paid line, the projected one or both. */
export interface BalancePoint {
  date: string;
  paid?: number;
  projected?: number;
}

/**
 * balancePoints is the outstanding balance from the contract, which owes the original amount, to
 * each installment. Points up to today are paid and the ones after it projected; the last one on or
 * before today belongs to both lines, so they join. Plotting is the one place a balance becomes a
 * Number; the screen text keeps the decimal string.
 */
export function balancePoints(
  contractDate: string,
  originalAmount: string,
  installments: ScheduledInstallment[],
  today: string,
): BalancePoint[] {
  const balances = [
    { date: contractDate, balance: Number(originalAmount) },
    ...installments.map((i) => ({ date: i.due_date, balance: Number(i.outstanding_balance) })),
  ];
  const lastPaid = balances.findLastIndex((b) => b.date <= today);
  return balances.map(({ date, balance }, index) => ({
    date,
    paid: index <= lastPaid ? balance : undefined,
    projected: index >= lastPaid ? balance : undefined,
  }));
}
