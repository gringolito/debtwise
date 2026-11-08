import { ApiError, type Lot, type LotInput } from "@/lib/api";
import type { BondType } from "@/lib/bondKinds";
import { fractionToPercent, inputToMoney, moneyToInput, percentToFraction } from "@/lib/format";

/** LotFormValues is what the owner typed for a lot, as text, the way the inputs show it. */
export interface LotFormValues {
  type: BondType;
  maturity: string;
  purchaseDate: string;
  /** The contracted rate as a percent a year, such as "12,76". */
  rate: string;
  unitPrice: string;
  quantity: string;
}

export const blankLot: LotFormValues = {
  type: "ltn",
  maturity: "",
  purchaseDate: "",
  rate: "",
  unitPrice: "",
  quantity: "",
};

export function valuesFromLot(lot: Lot): LotFormValues {
  return {
    type: lot.type,
    maturity: lot.maturity,
    purchaseDate: lot.purchase_date,
    rate: fractionToPercent(lot.rate),
    unitPrice: moneyToInput(lot.unit_price),
    quantity: moneyToInput(lot.quantity),
  };
}

/** lotInput builds the request body. Text the API cannot read goes through for it to reject. */
export function lotInput(values: LotFormValues): LotInput {
  return {
    type: values.type,
    maturity: values.maturity,
    purchase_date: values.purchaseDate,
    rate: percentToFraction(values.rate),
    unit_price: inputToMoney(values.unitPrice),
    quantity: inputToMoney(values.quantity),
  };
}

/** lotPreviewInput is lotInput once the owner has filled every field, and undefined before. */
export function lotPreviewInput(values: LotFormValues): LotInput | undefined {
  const { maturity, purchaseDate, rate, unitPrice, quantity } = values;
  return [maturity, purchaseDate, rate, unitPrice, quantity].every((text) => text.trim() !== "")
    ? lotInput(values)
    : undefined;
}

// The API's own reasons are English sentences for API consumers; the owner reads these.
export const lotFieldMessages: Record<string, string> = {
  type: "Escolha um dos títulos.",
  maturity:
    "O vencimento deve ser posterior à compra e cair no dia 1 (Prefixado) ou no dia 15 (IPCA+).",
  purchase_date: "A data da compra não pode ser futura.",
  rate: "Informe uma taxa de 0% a menos de 100% ao ano.",
  unit_price: "Informe um preço maior que zero, com até 6 casas decimais.",
  quantity: "Informe uma quantidade maior que zero, com até 2 casas decimais.",
};

/**
 * lotErrors reads a rejected lot as what the owner sees next to each field, by body field such as
 * "maturity" or "unit_price". Any other failure, one that names a field with a 5xx included, gives
 * an empty map.
 */
export function lotErrors(error: Error | null): Map<string, string> {
  const errors = new Map<string, string>();
  if (!(error instanceof ApiError) || error.status !== 422) return errors;
  for (const { location } of error.rejected) {
    if (!location.startsWith("body.")) continue;
    const field = location.slice("body.".length);
    errors.set(field, lotFieldMessages[field] ?? "Valor inválido.");
  }
  return errors;
}
