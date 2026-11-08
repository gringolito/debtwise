import type { ScheduledInstallment } from "@/lib/api";
import { isZero } from "@/lib/decisions";

/** TrendPoint is a point of a schedule's figure over time, on the solid line, the dashed one or both. */
export interface TrendPoint {
  /** The date, in milliseconds since the epoch at midnight UTC, as the chart's time axis reads it. */
  time: number;
  /** The figure on the line of what is already due. */
  paid?: number;
  /** The figure on the line of what the schedule projects. */
  projected?: number;
  /** Whether prepayments were made between this installment and the next. */
  prepaid?: boolean;
}

/**
 * trend plots value of each installment, after start when given, split at today: the points due by
 * today are paid, the later ones projected, and the last one due by today is on both lines so they
 * join. Plotting is the one place a value becomes a Number; the screen text keeps the decimal string.
 */
export function trend(
  installments: ScheduledInstallment[],
  value: (installment: ScheduledInstallment) => string,
  today: string,
  start?: { date: string; value: string },
): TrendPoint[] {
  const points: { date: string; value: number; prepaid?: boolean }[] = [
    ...(start ? [{ date: start.date, value: Number(start.value) }] : []),
    ...installments.map((installment) => ({
      date: installment.due_date,
      value: Number(value(installment)),
      prepaid: !isZero(installment.prepaid),
    })),
  ];
  const lastPaid = points.findLastIndex((point) => point.date <= today);
  return points.map((point, index) => ({
    time: Date.parse(`${point.date}T00:00:00Z`),
    paid: index <= lastPaid ? point.value : undefined,
    projected: index >= lastPaid ? point.value : undefined,
    prepaid: point.prepaid,
  }));
}
