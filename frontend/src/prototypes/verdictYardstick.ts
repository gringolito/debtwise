// PROTOTYPE, throwaway: the yardsticks "Orvalho nítido" puts next to a verdict. The real version
// would have the server send these (share of the amount, margin to break-even, crossover); here the
// browser derives them from the decision's own figures for display only.
import type { Decision, Verdict } from "@/lib/api";
import { bondKinds } from "@/lib/bondKinds";
import type { ComparedVerdict } from "@/lib/decisions";
import { formatDate, formatDuration, formatMoney } from "@/lib/format";
import { worthPoints } from "@/lib/worthCurve";

/** Below this share of the amount, the difference is called a near-tie rather than a win. */
export const NEAR_TIE_SHARE = 0.01;

export type Leader = "invest" | "prepay" | "tie";

const percent1 = new Intl.NumberFormat("pt-BR", { style: "percent", maximumFractionDigits: 1 });
const percent2 = new Intl.NumberFormat("pt-BR", {
  style: "percent",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const monthShort = new Intl.DateTimeFormat("pt-BR", {
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

function monthsBetween(from: string, to: string): number {
  const [fy, fm, fd] = from.split("-").map(Number);
  const [ty, tm, td] = to.split("-").map(Number);
  return (ty - fy) * 12 + (tm - fm) - (td < fd ? 1 : 0);
}

/** Rates the way Tesouro quotes them, rounded to two places: "13,99%" rather than "13,986635%". */
export function roundedRate(verdict: Pick<Verdict, "type">, fraction: string): string {
  const text = percent2.format(Number(fraction));
  return bondKinds[verdict.type].ipcaLinked ? `IPCA + ${text}` : text;
}

export interface Yardstick {
  leader: Leader;
  nearTie: boolean;
  /** The difference without a sign. */
  amount: string;
  /** "8,1%" of the money the decision compares. */
  share: string;
  /** "5 anos e 1 mês" from the decision's date to the bond's maturity. */
  horizon: string;
  /** Today's rate, rounded the way Tesouro quotes it, when the server found a tie. */
  today?: string;
  breakEven?: string;
  rateMoves?: "cair" | "subir";
}

export function yardstick(decision: Decision, verdict: Verdict & { advantage: string }): Yardstick {
  const advantage = Number(verdict.advantage);
  const share = Math.abs(advantage) / Number(decision.amount);
  const nearTie = share < NEAR_TIE_SHARE;
  const leader: Leader = advantage === 0 ? "tie" : advantage > 0 ? "invest" : "prepay";
  const result: Yardstick = {
    leader,
    nearTie,
    amount: formatMoney(verdict.advantage.replace("-", "")),
    share: percent1.format(share),
    horizon: formatDuration(monthsBetween(decision.date, verdict.maturity)),
  };
  if (verdict.break_even_rate !== undefined) {
    const gap = Number(verdict.rate) - Number(verdict.break_even_rate);
    result.today = roundedRate(verdict, verdict.rate);
    result.breakEven = roundedRate(verdict, verdict.break_even_rate);
    result.rateMoves = gap > 0 ? "cair" : "subir";
  }
  return result;
}

export function headline(y: Yardstick, bond: string): string {
  if (y.leader === "tie") return `Investir em ${bond} ou amortizar dá no mesmo`;
  if (y.nearTie) return `Investir em ${bond} ou amortizar dá praticamente no mesmo`;
  return y.leader === "invest"
    ? `Investir em ${bond} rende mais`
    : `Amortizar rende mais que ${bond}`;
}

/** The line under the difference: its horizon and its size against the amount compared. */
export function scale(y: Yardstick, amount: string, maturity: string): string {
  const base = `${y.share} dos ${formatMoney(amount)} em ${y.horizon}`;
  if (y.leader === "tie") return `Nenhuma diferença até ${formatDate(maturity)}.`;
  if (y.nearTie) return `de diferença até ${formatDate(maturity)}: ${base}. Na prática, um empate.`;
  return `a mais até ${formatDate(maturity)}, ou ${base}.`;
}

export interface GapPoint {
  time: number;
  /** Investing minus prepaying, in reais. */
  gap: number;
  ahead: number;
  behind: number;
}

export function gapPoints(verdict: ComparedVerdict): GapPoint[] {
  return worthPoints(verdict.invest, verdict.prepay).map(({ time, invest, prepay }) => {
    const gap = invest - prepay;
    return { time, gap, ahead: Math.max(gap, 0), behind: Math.min(gap, 0) };
  });
}

/** The first date from which the final leader stays ahead to the horizon, when it wasn't ahead at the start. */
export function crossover(points: GapPoint[]): GapPoint | undefined {
  const last = points.at(-1);
  if (!last || last.gap === 0) return undefined;
  const sign = Math.sign(last.gap);
  let i = points.length - 1;
  while (i > 0 && Math.sign(points[i - 1].gap) === sign) i--;
  return i > 1 ? points[i] : undefined;
}

export function monthYear(time: number): string {
  return monthShort.format(new Date(time));
}
