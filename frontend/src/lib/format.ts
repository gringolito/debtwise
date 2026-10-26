// The API sends values as decimal strings and dates as ISO text. Both are formatted from the text,
// so no float rounding or time zone shifts a value on its way to the screen.

export function formatPercent(decimal: string): string {
  return `${decimal.replace(".", ",")}%`;
}

export function formatDate(isoDate: string): string {
  const [year, month, day] = isoDate.split("-");
  return `${day}/${month}/${year}`;
}

export function formatPeriod(start: string, end: string): string {
  if (start === end) return formatDate(start);
  return `${formatDate(start)} a ${formatDate(end)}`;
}

const timeFormat = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" });
const dateFormat = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

export function formatDateTime(instant: string): string {
  const date = new Date(instant);
  return `${dateFormat.format(date)} ${timeFormat.format(date)}`;
}

// Intl formats a decimal string exactly, and the input conversions below move digits around.

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
