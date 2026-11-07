import { describe, expect, it } from "vitest";
import { balancePoints } from "@/lib/balanceCurve";
import { schedule } from "@/test/mortgageFixtures";

const [first, second, third] = schedule.installments;
const installments = [first, second, third];

describe("balancePoints", () => {
  it("starts at the original amount and follows each installment's outstanding balance", () => {
    expect(balancePoints("2023-12-10", "60000.00", installments, "2024-02-20")).toEqual([
      { date: "2023-12-10", paid: 60000, projected: undefined },
      { date: "2024-01-10", paid: 50000, projected: undefined },
      { date: "2024-02-10", paid: 40000, projected: 40000 },
      { date: "2024-03-10", paid: undefined, projected: 30000 },
    ]);
  });

  it("counts an installment due today as paid", () => {
    expect(
      balancePoints("2023-12-10", "60000.00", installments, "2024-01-10").map((p) => [
        p.paid,
        p.projected,
      ]),
    ).toEqual([
      [60000, undefined],
      [50000, 50000],
      [undefined, 40000],
      [undefined, 30000],
    ]);
  });

  it("projects the whole curve while the contract is yet to be signed", () => {
    expect(
      balancePoints("2023-12-10", "60000.00", installments, "2023-11-01").map((p) => [
        p.paid,
        p.projected,
      ]),
    ).toEqual([
      [undefined, 60000],
      [undefined, 50000],
      [undefined, 40000],
      [undefined, 30000],
    ]);
  });
});
