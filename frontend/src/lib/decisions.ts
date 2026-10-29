import { ApiError, type DecisionInput, type Verdict } from "@/lib/api";
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

/** advantageText writes an Advantage signed, with the option it favours. */
export function advantageText(advantage: string): string {
  if (ZERO.test(advantage)) {
    return `${formatMoney(advantage.replace("-", ""))}, sem diferença entre investir e amortizar`;
  }
  if (advantage.startsWith("-")) return `${formatMoney(advantage)}, a favor de amortizar`;
  return `+${formatMoney(advantage)}, a favor de investir`;
}

export const unavailableReasons: Record<NonNullable<Verdict["unavailable"]>, string> = {
  missing_ipca:
    "A comparação depende de um número-índice do IPCA que ainda não foi divulgado nem pode ser projetado.",
  amount_too_small: "O valor compra menos que um centésimo do título. Informe um valor maior.",
};

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
