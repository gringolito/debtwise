import { describe, expect, it } from "vitest";
import type { ComparedVerdict } from "@/lib/decisions";
import { advantageAmount, advantageShare, horizon, verdictHeadline } from "@/lib/yardstick";

const scenario = { net_worth: "0", cash: "0", outstanding_balance: "0", cash_flows: [] };

function verdict(advantage: string, nearTie: boolean): ComparedVerdict {
  return {
    type: "ltn",
    maturity: "2032-01-01",
    rate: "0.1507",
    advantage,
    advantage_share: "0.0814",
    near_tie: nearTie,
    horizon_months: 61,
    invest: scenario,
    prepay: scenario,
    projected_by: [],
    market_data: {
      bonds: { status: "fresh" },
      focus: { status: "fresh" },
      indexes: [],
    },
  } as ComparedVerdict;
}

describe("verdictHeadline", () => {
  it.each([
    ["investing ahead", "814.22", false, "Investir em Tesouro Prefixado 2032 rende mais"],
    ["prepaying ahead", "-814.22", false, "Amortizar rende mais que Tesouro Prefixado 2032"],
    [
      "investing a near tie ahead",
      "39.64",
      true,
      "Investir em Tesouro Prefixado 2032 ou amortizar dá praticamente no mesmo",
    ],
    [
      "prepaying a near tie ahead",
      "-39.64",
      true,
      "Investir em Tesouro Prefixado 2032 ou amortizar dá praticamente no mesmo",
    ],
    ["neither ahead", "0.00", true, "Investir em Tesouro Prefixado 2032 ou amortizar dá no mesmo"],
  ])("names %s", (_, advantage, nearTie, headline) => {
    expect(verdictHeadline(verdict(advantage, nearTie))).toBe(headline);
  });
});

describe("the yardstick", () => {
  it("states the advantage without its sign, its share of the amount and the horizon", () => {
    const prepaying = verdict("-814.22", false);
    expect([advantageAmount(prepaying), advantageShare(prepaying), horizon(prepaying)]).toEqual([
      "R$\u00a0814,22",
      "8,1%",
      "5 anos e 1 mês",
    ]);
  });
});
