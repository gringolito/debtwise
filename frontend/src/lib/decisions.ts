import { ApiError, type DecisionInput, type EarlySaleCheck, type Verdict } from "@/lib/api";
import { type BondType, bondRate } from "@/lib/bondKinds";
import { formatMoney, inputToMoney } from "@/lib/format";
import type { PrepaymentEffect } from "@/lib/mortgageEvents";

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

/**
 * advantageText writes an Advantage signed, with the option it favours: ifPositive when it is above
 * zero, ifNegative when below.
 */
export function advantageText(advantage: string, ifPositive: string, ifNegative: string): string {
  if (ZERO.test(advantage)) {
    return `${formatMoney(advantage.replace("-", ""))}, sem diferença entre ${ifPositive} e ${ifNegative}`;
  }
  if (advantage.startsWith("-")) return `${formatMoney(advantage)}, a favor de ${ifNegative}`;
  return `+${formatMoney(advantage)}, a favor de ${ifPositive}`;
}

export const unavailableReasons: Record<NonNullable<Verdict["unavailable"]>, string> = {
  missing_ipca:
    "A comparação depende de um número-índice do IPCA que ainda não foi divulgado nem pode ser projetado.",
  amount_too_small: "O valor compra menos que um centésimo do título. Informe um valor maior.",
};

export const earlySaleVerdicts: Record<NonNullable<EarlySaleCheck["verdict"]>, string> = {
  sell: "Vender agora",
  hold: "Manter até o vencimento",
};

export const earlySaleUnavailableReasons: Record<
  NonNullable<EarlySaleCheck["unavailable"]>,
  string
> = {
  missing_ipca: unavailableReasons.missing_ipca,
  no_market_value: "O Tesouro Direto não informa um preço de venda para este título.",
  matured: "O título deste lote já venceu.",
};

/**
 * breakEvenText writes a Break-even Rate and where today's buy rate sits against it, both the way
 * Tesouro quotes the bond. Both are decimal strings of at most 10 places, which Number reads in
 * their exact order.
 */
export function breakEvenText(type: BondType, rate: string, breakEven: string): string {
  const today = Number(rate);
  const even = Number(breakEven);
  const side =
    today > even ? "está acima dela" : today < even ? "está abaixo dela" : "é igual a ela";
  return `Taxa de equilíbrio: ${bondRate(type, breakEven)}. A taxa de hoje, ${bondRate(type, rate)}, ${side}.`;
}

/** noBreakEvenText says why no rate from 0% to 100% a year is a break-even rate. */
export function noBreakEvenText(
  type: BondType,
  reason: NonNullable<Verdict["no_break_even"]>,
): string {
  switch (reason) {
    case "below_range":
      return `Sem taxa de equilíbrio: investir vence mesmo a ${bondRate(type, "0")} ao ano.`;
    case "above_range":
      return `Sem taxa de equilíbrio: amortizar vence mesmo a ${bondRate(type, "1")} ao ano.`;
  }
}

// The API's own reasons are English sentences for API consumers; the owner reads these.
const fieldMessages: Record<string, string> = {
  amount: "Informe um valor maior que zero, com até 2 casas decimais.",
  date: "A data não pode ser anterior a hoje.",
  effect: "Escolha o que a amortização muda.",
};

/**
 * decisionErrors reads a rejected decision as what the owner sees next to each field, by body field
 * such as "amount" or "date". Any other failure, one that names a field with a 5xx included, gives
 * an empty map.
 */
export function decisionErrors(error: Error | null): Map<string, string> {
  const errors = new Map<string, string>();
  if (!(error instanceof ApiError) || error.status !== 422) return errors;
  for (const location of error.locations) {
    if (!location.startsWith("body.")) continue;
    const field = location.slice("body.".length);
    errors.set(field, fieldMessages[field] ?? "Valor inválido.");
  }
  return errors;
}
