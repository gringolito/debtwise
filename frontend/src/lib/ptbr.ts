// Decimals reach the UI as strings and go back as strings (ADR-0003), so nothing here turns them
// into numbers: Intl formats the decimal string exactly and the conversions move digits around.

const moneyFormat = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const percentFormat = new Intl.NumberFormat("pt-BR", {
  style: "percent",
  minimumFractionDigits: 2,
  maximumFractionDigits: 6,
});

// Intl.NumberFormat accepts a decimal string but the standard library's typing only knows numeric
// literal types.
type DecimalString = `${number}`;

/** formatMoney writes a decimal string of reais as "R$ 1.234,50". */
export function formatMoney(decimal: string): string {
  return moneyFormat.format(decimal as DecimalString);
}

/** formatRate writes a decimal fraction string as a percent: "0.0258" is "2,58%". */
export function formatRate(fraction: string): string {
  return percentFormat.format(fraction as DecimalString);
}

/** formatDate turns "2024-01-10" into "10/01/2024". */
export function formatDate(isoDate: string): string {
  const [year, month, day] = isoDate.split("-");
  return `${day}/${month}/${year}`;
}

/** moneyToInput turns the API's "60000.00" into the "60000,00" the owner types. */
export function moneyToInput(decimal: string): string {
  return decimal.replace(".", ",");
}

const THOUSANDS_GROUPED = /^\d{1,3}(\.\d{3})+$/;

/**
 * inputToMoney turns what the owner typed, "250000,00" or "250.000,00", into the API's
 * "250000.00". Text that is no pt-BR number comes back unchanged for the API to reject.
 */
export function inputToMoney(input: string): string {
  const text = input.trim();
  if (text.includes(",")) return text.replaceAll(".", "").replace(",", ".");
  if (THOUSANDS_GROUPED.test(text)) return text.replaceAll(".", "");
  return text;
}

const PLAIN_DECIMAL = /^\d+(\.\d+)?$/;

function splitDecimal(decimal: string): [string, string] {
  const [integer, fraction = ""] = decimal.split(".");
  return [integer, fraction];
}

function trimDecimal(integer: string, fraction: string): string {
  const whole = integer.replace(/^0+/, "") || "0";
  const decimals = fraction.replace(/0+$/, "");
  return decimals === "" ? whole : `${whole}.${decimals}`;
}

/** fractionToPercent turns the API's "0.0003" into the "0,03" the owner types as a percent. */
export function fractionToPercent(fraction: string): string {
  const [integer, decimals] = splitDecimal(fraction);
  const padded = decimals.padEnd(2, "0");
  return trimDecimal(integer + padded.slice(0, 2), padded.slice(2)).replace(".", ",");
}

/**
 * percentToFraction turns a percent the owner typed, "9,5", into the API's fraction "0.095" by
 * moving the decimal point. Text that is no number comes back unchanged for the API to reject.
 */
export function percentToFraction(input: string): string {
  const text = input.trim().replace(",", ".");
  if (!PLAIN_DECIMAL.test(text)) return input;
  const [integer, decimals] = splitDecimal(text);
  const padded = integer.padStart(2, "0");
  return trimDecimal(padded.slice(0, -2), `${padded.slice(-2)}${decimals}`);
}
