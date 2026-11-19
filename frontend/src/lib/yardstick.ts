import type { Scenario } from "@/lib/api";
import { type ComparedVerdict, favoured, isZero, verdictTitle } from "@/lib/decisions";
import { formatDuration, formatMoney, formatShare } from "@/lib/format";

/**
 * verdictHeadline says which option ends with more by the verdict's horizon, or that both give
 * practically the same when its advantage is a near tie. best is the decision's verdict of the
 * highest advantage: when it favours prepaying, prepaying beats every bond and names none.
 */
export function verdictHeadline(verdict: ComparedVerdict, best: ComparedVerdict = verdict): string {
  const bond = verdictTitle(verdict);
  const side = favoured(verdict.advantage);
  if (side === "even") return `Investir em ${bond} ou amortizar dá no mesmo`;
  if (verdict.near_tie) return `Investir em ${bond} ou amortizar dá praticamente no mesmo`;
  if (side === "invest") return `Investir em ${bond} vale mais a pena`;
  return favoured(best.advantage) === "prepay"
    ? "Amortizar vale mais a pena"
    : `Amortizar vale mais a pena que investir em ${bond}`;
}

/** advantageAmount is the advantage without its sign: "R$ 814,22". */
export function advantageAmount(verdict: ComparedVerdict): string {
  return formatMoney(verdict.advantage.replace("-", ""));
}

const owes = (netWorth: string) => netWorth.startsWith("-") && !isZero(netWorth);

/**
 * standing is where a scenario leaves the owner on the horizon: whether they owe or have, and the
 * amount without its sign, so no negative money is read. Net worth is only checked for its sign.
 */
export function standing({ net_worth: netWorth }: Scenario): { owes: boolean; amount: string } {
  return { owes: owes(netWorth), amount: formatMoney(netWorth.replace("-", "")) };
}

/**
 * ahead is the words around the amount the option that ends with more is ahead by, from that
 * option's net worth on the horizon: "devendo R$ 814,22 a menos" while it still owes, "com R$
 * 814,22 a mais" once nothing is owed.
 */
export function ahead(leaderNetWorth: string): { lead: string; trail: string } {
  return owes(leaderNetWorth)
    ? { lead: "devendo", trail: "a menos" }
    : { lead: "com", trail: "a mais" };
}

/** leader is the scenario of the option the verdict's advantage favours. */
export function leader(verdict: ComparedVerdict): Scenario {
  return favoured(verdict.advantage) === "prepay" ? verdict.prepay : verdict.invest;
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
