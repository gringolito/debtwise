import { describe, expect, it } from "vitest";
import type { ScheduledInstallment } from "@/lib/api";
import { trend } from "@/lib/scheduleTrend";
import { schedule } from "@/test/mortgageFixtures";

const [first, second, third] = schedule.installments;
const installments: ScheduledInstallment[] = [first, { ...second, prepaid: "5000.00" }, third];
const balance = (installment: ScheduledInstallment) => installment.outstanding_balance;
const at = (date: string) => Date.parse(`${date}T00:00:00Z`);

describe("the trend of a schedule", () => {
  it("joins the line of what is due by today to the projected one at the last installment due", () => {
    expect(
      trend(installments, balance, "2024-02-10", { date: "2023-12-10", value: "60000.00" }),
    ).toEqual([
      { time: at("2023-12-10"), paid: 60000, projected: undefined, prepaid: undefined },
      { time: at("2024-01-10"), paid: 50000, projected: undefined, prepaid: false },
      { time: at("2024-02-10"), paid: 40000, projected: 40000, prepaid: true },
      { time: at("2024-03-10"), paid: undefined, projected: 30000, prepaid: false },
    ]);
  });

  it("projects every point before the first installment, from the start", () => {
    expect(
      trend(installments, (installment) => installment.amount, "2023-12-01").map(
        ({ paid, projected }) => [paid, projected],
      ),
    ).toEqual([
      [undefined, 10640.5],
      [undefined, 10537.5],
      [undefined, 10434.5],
    ]);
  });

  it("draws every point as due once the schedule is paid off", () => {
    expect(
      trend(installments, balance, "2024-07-01").map(({ paid, projected }) => [paid, projected]),
    ).toEqual([
      [50000, undefined],
      [40000, undefined],
      [30000, 30000],
    ]);
  });
});
