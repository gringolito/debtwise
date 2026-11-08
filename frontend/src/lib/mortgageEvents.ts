import {
  ApiError,
  type Prepayment,
  type PrepaymentInput,
  type StatementDrift,
  type StatementInput,
} from "@/lib/api";
import { inputToMoney, moneyToInput } from "@/lib/format";
import { rejections } from "@/lib/mortgageForm";

export type PrepaymentEffect = Prepayment["effect"];

export const effectLabels: Record<PrepaymentEffect, string> = {
  shorten_term: "Reduzir prazo",
  lower_installment: "Reduzir prestação",
};

export const effectDescriptions: Record<PrepaymentEffect, string> = {
  shorten_term: "Mesma prestação, quitação mais cedo.",
  lower_installment: "Mesmo prazo, prestações menores.",
};

export const effectOptions = (Object.entries(effectLabels) as [PrepaymentEffect, string][]).map(
  ([value, label]) => ({ value, label }),
);

/** PrepaymentValues is what the owner typed for a prepayment, as text, the way the inputs show it. */
export interface PrepaymentValues {
  date: string;
  amount: string;
  effect: PrepaymentEffect;
}

export const blankPrepayment: PrepaymentValues = { date: "", amount: "", effect: "shorten_term" };

export function valuesFromPrepayment(prepayment: Prepayment): PrepaymentValues {
  return {
    date: prepayment.date,
    amount: moneyToInput(prepayment.amount),
    effect: prepayment.effect,
  };
}

/** prepaymentInput builds the request body. Text the API cannot read goes through for it to reject. */
export function prepaymentInput(values: PrepaymentValues): PrepaymentInput {
  return { date: values.date, amount: inputToMoney(values.amount), effect: values.effect };
}

/** StatementValues is what the owner typed for a statement, as text. */
export interface StatementValues {
  date: string;
  outstandingBalance: string;
}

export const blankStatement: StatementValues = { date: "", outstandingBalance: "" };

export function valuesFromStatement(statement: StatementDrift): StatementValues {
  return {
    date: statement.date,
    outstandingBalance: moneyToInput(statement.outstanding_balance),
  };
}

export function statementInput(values: StatementValues): StatementInput {
  return { date: values.date, outstanding_balance: inputToMoney(values.outstandingBalance) };
}

/**
 * prepaymentErrors reads a rejected prepayment as what the owner sees next to each field, by body
 * field such as "date" or "amount": what the rule it breaks asks, by the rule's code. Any other
 * failure, one that names a field with a 5xx included, gives an empty map.
 */
export function prepaymentErrors(error: Error | null): Map<string, string> {
  if (!(error instanceof ApiError) || error.status !== 422) return new Map();
  return rejections(error);
}

/** statementErrors is prepaymentErrors for a statement, whose date can also be taken (409). */
export function statementErrors(error: Error | null): Map<string, string> {
  if (error instanceof ApiError && error.status === 409) {
    return new Map([["date", "Já existe um extrato nesta data."]]);
  }
  return prepaymentErrors(error);
}
