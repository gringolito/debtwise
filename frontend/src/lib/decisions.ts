import {
  ApiError,
  type Decision,
  type DecisionInput,
  type EarlySaleCheck,
  type Rule,
  type Verdict,
} from "@/lib/api";
import { bondKinds, bondRate } from "@/lib/bondKinds";
import { compareDecimals } from "@/lib/decimals";
import { inputToMoney } from "@/lib/format";
import type { PrepaymentEffect } from "@/lib/mortgageEvents";

/** verdictTitle names a verdict's bond the way Tesouro Direto does: its kind and maturity year. */
export function verdictTitle({ type, maturity }: Verdict): string {
  return `${bondKinds[type].name} ${maturity.slice(0, 4)}`;
}

/** DecisionFormValues is what the owner typed for a decision, as text, the way the inputs show it. */
export interface DecisionFormValues {
  amount: string;
  date: string;
  effect: PrepaymentEffect;
}

/** blankDecision leaves the date empty: the API reads that as its own today. */
export const blankDecision: DecisionFormValues = { amount: "", date: "", effect: "shorten_term" };

/** decisionInput builds the request body. Text the API cannot read goes through for it to reject. */
export function decisionInput(values: DecisionFormValues): DecisionInput {
  return {
    amount: inputToMoney(values.amount),
    date: values.date === "" ? undefined : values.date,
    effect: values.effect,
  };
}

const ZERO = /^-?0+(\.0+)?$/;

/** isZero tells whether a signed decimal string is zero, "-0.00" included. */
export function isZero(decimal: string): boolean {
  return ZERO.test(decimal);
}

export type UnavailableReason = NonNullable<Verdict["unavailable"]>;

export const unavailableReasons: Record<UnavailableReason, string> = {
  missing_ipca:
    "A comparação depende de um número-índice do IPCA que ainda não foi divulgado nem pode ser projetado.",
  amount_too_small:
    "O Tesouro Direto vende a partir de um centésimo do título, e o valor não compra isso de nenhum deles.",
};

/** unavailableLabels say in a few words, in a list row, why a verdict has no scenarios. */
export const unavailableLabels: Record<UnavailableReason, string> = {
  missing_ipca: "Aguardando o IPCA",
  amount_too_small: "Valor pequeno demais",
};

export const earlySaleUnavailableReasons: Record<
  NonNullable<EarlySaleCheck["unavailable"]>,
  string
> = {
  missing_ipca: unavailableReasons.missing_ipca,
  no_market_value: "O Tesouro Direto não informa um preço de venda para este título.",
  matured: "O título deste lote já venceu.",
};

/** earlySaleUnavailableLabels say in a few words, in a list row, why a check has no scenarios. */
export const earlySaleUnavailableLabels: Record<
  NonNullable<EarlySaleCheck["unavailable"]>,
  string
> = {
  missing_ipca: "Aguardando o IPCA",
  no_market_value: "Sem preço de venda",
  matured: "Vencido",
};

/** verdictKey tells the verdicts of one decision apart: one per bond. */
export function verdictKey({ type, maturity }: Verdict): string {
  return `${type} ${maturity}`;
}

/** An available verdict: one with an Advantage, its yardstick and both scenarios. */
export type ComparedVerdict = Verdict &
  Required<
    Pick<
      Verdict,
      "advantage" | "advantage_share" | "near_tie" | "horizon_months" | "invest" | "prepay"
    >
  >;

function isCompared(verdict: Verdict): verdict is ComparedVerdict {
  return (
    verdict.advantage !== undefined &&
    verdict.advantage_share !== undefined &&
    verdict.near_tie !== undefined &&
    verdict.horizon_months !== undefined &&
    verdict.invest !== undefined &&
    verdict.prepay !== undefined
  );
}

/**
 * rankVerdicts splits a decision's verdicts into those it compared, the highest Advantage first and
 * ties in the API's order, and those it couldn't, in the API's order.
 */
export function rankVerdicts(verdicts: Verdict[]): {
  compared: ComparedVerdict[];
  unavailable: Verdict[];
} {
  const compared = verdicts
    .filter(isCompared)
    .sort((a, b) => compareDecimals(b.advantage, a.advantage));
  return { compared, unavailable: verdicts.filter((verdict) => !isCompared(verdict)) };
}

export type Favoured = "invest" | "prepay" | "even";

/** favoured is the option an Advantage favours. */
export function favoured(advantage: string): Favoured {
  if (isZero(advantage)) return "even";
  return advantage.startsWith("-") ? "prepay" : "invest";
}

/**
 * breakEvenNote says at which rate investing in the verdict's bond would tie with prepaying, from
 * where today's buy rate sits, or why no rate from 0% to 100% a year would. Rates read the way
 * Tesouro quotes the bond.
 */
export function breakEvenNote({
  type,
  rate,
  break_even_rate: breakEven,
  no_break_even: noBreakEven,
}: Verdict): string | undefined {
  if (noBreakEven === "below_range") {
    return `Investir rende mais mesmo a ${bondRate(type, "0")} ao ano.`;
  }
  if (noBreakEven === "above_range") {
    return `Amortizar rende mais mesmo a ${bondRate(type, "1")} ao ano.`;
  }
  if (breakEven === undefined) return undefined;
  const side = compareDecimals(rate, breakEven);
  if (side === 0) return `A taxa de hoje, ${bondRate(type, rate)}, empata com amortizar.`;
  const move = side > 0 ? "cair" : "subir";
  return `Empata com amortizar se a taxa ${move} para ${bondRate(type, breakEven)}.`;
}

/**
 * Why a decision compares no bond at all: every verdict is unavailable for one reason, or no bond on
 * offer follows the mortgage's indexer and matures after the date.
 */
export type NoComparison =
  | { reason: "amount_too_small"; minimumAmount: string }
  | { reason: "missing_ipca" }
  | { reason: "no_bond" };

/** noComparisonOf says why one verdict compares nothing; undefined for a compared verdict. */
export function noComparisonOf({
  unavailable,
  minimum_amount: minimumAmount,
}: Verdict): NoComparison | undefined {
  if (unavailable === "missing_ipca") return { reason: "missing_ipca" };
  if (unavailable === "amount_too_small" && minimumAmount !== undefined) {
    return { reason: "amount_too_small", minimumAmount };
  }
  return undefined;
}

/**
 * noComparisons says why a decision with no compared verdict has none, the reason the owner can
 * fix first. A too small amount names the least amount that buys any of the bonds.
 */
export function noComparisons({ verdicts }: Decision): NoComparison[] {
  if (verdicts.length === 0) return [{ reason: "no_bond" }];
  const reasons: NoComparison[] = [];
  const [minimumAmount] = verdicts
    .flatMap(({ minimum_amount: minimum }) => (minimum === undefined ? [] : [minimum]))
    .sort(compareDecimals);
  if (minimumAmount !== undefined) reasons.push({ reason: "amount_too_small", minimumAmount });
  if (verdicts.some((verdict) => verdict.unavailable === "missing_ipca")) {
    reasons.push({ reason: "missing_ipca" });
  }
  return reasons;
}

// The API's own reasons are English sentences for API consumers; the owner reads these, by the
// rule a value breaks or, for a value the schema rejected, by its field.
const ruleMessages: Partial<Record<Rule, string>> = {
  not_positive: "Informe um valor maior que zero.",
  before_today: "A data não pode ser antes de hoje.",
  before_contract: "A data não pode ser antes do contrato.",
};

const fieldMessages: Record<string, string> = {
  amount: "Informe um valor em reais, com até 2 casas decimais.",
  date: "Informe uma data válida.",
  effect: "Escolha o que a amortização muda.",
};

/**
 * decisionErrors reads a rejected decision as what the owner sees under the sentence, by body field
 * such as "amount" or "date". Any other failure, one that names a field with a 5xx included, gives
 * an empty map.
 */
export function decisionErrors(error: Error | null): Map<string, string> {
  const errors = new Map<string, string>();
  if (!(error instanceof ApiError) || error.status !== 422) return errors;
  for (const { location, rule } of error.rejected) {
    if (!location.startsWith("body.")) continue;
    const field = location.slice("body.".length);
    errors.set(field, (rule && ruleMessages[rule]) ?? fieldMessages[field] ?? "Valor inválido.");
  }
  return errors;
}
