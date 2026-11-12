import type { Scenario } from "@/lib/api";
import { type ComparedVerdict, favoured, isZero, verdictTitle } from "@/lib/decisions";
import { formatDuration, formatMoney, formatShare } from "@/lib/format";

/**
 * verdictHeadline says which option ends with more by the verdict's horizon, or that both give
 * practically the same when its advantage is a near tie.
 */
export function verdictHeadline(verdict: ComparedVerdict): string {
  const bond = verdictTitle(verdict);
  const side = favoured(verdict.advantage);
  if (side === "even") return `Investir em ${bond} ou amortizar dá no mesmo`;
  if (verdict.near_tie) return `Investir em ${bond} ou amortizar dá praticamente no mesmo`;
  return side === "invest" ? `Investir em ${bond} rende mais` : `Amortizar rende mais que ${bond}`;
}

/** advantageAmount is the advantage without its sign: "R$ 814,22". */
export function advantageAmount(verdict: ComparedVerdict): string {
  return formatMoney(verdict.advantage.replace("-", ""));
}

/**
 * standing is where a scenario leaves the owner on the horizon: whether they owe or have, and the
 * amount without its sign, so no negative money is read. Net worth is only checked for its sign.
 */
export function standing({ net_worth: netWorth }: Scenario): { owes: boolean; amount: string } {
  return {
    owes: netWorth.startsWith("-") && !isZero(netWorth),
    amount: formatMoney(netWorth.replace("-", "")),
  };
}

/**
 * advantageComparison says by how much investing in the verdict's bond ends above or below
 * prepaying, in words instead of a sign: "R$ 80,00 a mais", "R$ 250,30 a menos".
 */
export function advantageComparison(verdict: ComparedVerdict): string {
  const amount = advantageAmount(verdict);
  switch (favoured(verdict.advantage)) {
    case "invest":
      return `${amount} a mais`;
    case "prepay":
      return `${amount} a menos`;
    case "even":
      return amount;
  }
}

/** advantageShare is the advantage's size against the amount compared: "8,1%". */
export function advantageShare(verdict: ComparedVerdict): string {
  return formatShare(verdict.advantage_share);
}

/** horizon is the time from the decision's date to the bond's maturity: "5 anos e 1 mês". */
export function horizon(verdict: ComparedVerdict): string {
  return formatDuration(verdict.horizon_months);
}
