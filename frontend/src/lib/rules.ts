import type { Rule } from "@/lib/api";
import { type BondType, bondKinds } from "@/lib/bondKinds";

/** What each rule of the mortgage or of a lot asks, in the owner's words. */
export const ruleMessages: Record<Rule, string> = {
  not_positive: "Precisa ser maior que zero.",
  before_contract: "Não pode ser antes da data do contrato.",
  before_today: "Não pode ser antes de hoje.",
  no_row_from_first_installment: "Uma mudança precisa valer desde a primeira prestação.",
  repeated_date: "Outra mudança já começa nesta data.",
  after_today: "Não pode ser depois de hoje.",
  not_after_purchase: "Precisa ser depois da data da compra.",
  not_maturity_day: "Não é uma data em que o Tesouro Direto vence este título.",
};

const maturityDays: Record<BondType, string> = {
  ltn: "no dia 1 de um mês",
  ntn_f: "em 1º de janeiro ou de julho",
  ntn_b_principal: "no dia 15 de um mês",
  ntn_b: "no dia 15 de um mês",
};

/**
 * lotRuleMessage says what a rule of a lot asks of a lot of a bond of type, naming the day the
 * bond's type matures on when the maturity falls on another.
 */
export function lotRuleMessage(rule: Rule, type: BondType | undefined): string {
  if (rule === "not_maturity_day" && type && type in bondKinds) {
    return `O ${bondKinds[type].name} vence ${maturityDays[type]}.`;
  }
  return ruleMessages[rule];
}
