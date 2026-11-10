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

const MONTH_NAMES = [
  "jan",
  "fev",
  "mar",
  "abr",
  "mai",
  "jun",
  "jul",
  "ago",
  "set",
  "out",
  "nov",
  "dez",
];

/** formatMonth writes the month of an ISO date the short pt-BR way: "2023-12-01" is "dez/2023". */
export function formatMonth(isoDate: string): string {
  const [year, month] = isoDate.split("-");
  return `${MONTH_NAMES[Number(month) - 1]}/${year}`;
}

/** formatDayMonth writes an ISO date without its year: "2026-12-15" is "15/12". */
export function formatDayMonth(isoDate: string): string {
  const [, month, day] = isoDate.split("-");
  return `${day}/${month}`;
}

const monthYearFormat = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" });

/** formatMonthYear writes the month of an ISO date in prose: "2058-03-15" is "março de 2058". */
export function formatMonthYear(isoDate: string): string {
  const [year, month] = isoDate.split("-");
  return monthYearFormat.format(new Date(Number(year), Number(month) - 1));
}

/** formatDuration writes a count of months in years and months: 13 is "1 ano e 1 mês". */
export function formatDuration(months: number): string {
  const plural = (count: number, one: string, many: string) =>
    `${count} ${count === 1 ? one : many}`;
  const years = Math.floor(months / 12);
  const rest = months % 12;
  if (years === 0) return plural(rest, "mês", "meses");
  const inYears = plural(years, "ano", "anos");
  return rest === 0 ? inYears : `${inYears} e ${plural(rest, "mês", "meses")}`;
}

const weekdayFormat = new Intl.DateTimeFormat("pt-BR", {
  weekday: "long",
  day: "numeric",
  month: "long",
});

/** formatWeekday writes a day as a page subtitle: "Sexta-feira, 6 de novembro". */
export function formatWeekday(date: Date): string {
  const text = weekdayFormat.format(date);
  return text.charAt(0).toUpperCase() + text.slice(1);
}

const instantDayMonthFormat = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
});

/** formatInstantDayMonth writes the owner's calendar day of an instant without its year: "15/12". */
export function formatInstantDayMonth(instant: string): string {
  return instantDayMonthFormat.format(new Date(instant));
}

const timeFormat = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" });
const dateFormat = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

/**
 * formatLastUpdate says when an instant was in the owner's time zone, for a "last updated" line:
 * "hoje às 08:00" on the day of `now`, "em 01/11/2026" before it.
 */
export function formatLastUpdate(instant: string, now = new Date()): string {
  const date = new Date(instant);
  const day = dateFormat.format(date);
  return day === dateFormat.format(now) ? `hoje às ${timeFormat.format(date)}` : `em ${day}`;
}

/** formatInstantDate writes the owner's calendar day of an instant: "06/11/2026". */
export function formatInstantDate(instant: string): string {
  return dateFormat.format(new Date(instant));
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

/**
 * formatNumber writes a decimal string the pt-BR way, without the zeros that pad its places:
 * "7329.2500000000000" is "7.329,25".
 */
export function formatNumber(decimal: string): string {
  const places = (decimal.split(".")[1] ?? "").replace(/0+$/, "").length;
  const format = new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: places,
    maximumFractionDigits: places,
  });
  return format.format(decimal as DecimalString);
}

const groupDigits = (digits: string) => digits.replace(/\B(?=(\d{3})+(?!\d))/g, ".");

/** moneyToInput turns the API's "60000.00" into the "60.000,00" the owner types. */
export function moneyToInput(decimal: string): string {
  const [integer, fraction] = decimal.split(".");
  const grouped = groupDigits(integer);
  return fraction === undefined ? grouped : `${grouped},${fraction}`;
}

const THOUSANDS_GROUPED = /^\d{1,3}(\.\d{3})+$/;
const TYPED_MONEY = /^([\d.]*)(,\d*)?$/;

// Whether one character typed into or deleted from one text gives the other.
function oneKeyApart(a: string, b: string): boolean {
  const [longer, shorter] = a.length > b.length ? [a, b] : [b, a];
  if (longer.length - shorter.length !== 1) return false;
  let i = 0;
  while (i < shorter.length && longer[i] === shorter[i]) i++;
  return longer.slice(i + 1) === shorter.slice(i);
}

/**
 * groupThousands writes the pt-BR number the owner is typing, `typed`, with its thousands grouped:
 * "1250000,5" reads "1.250.000,5". Its dots are thousands separators when a comma marks the
 * decimals, when they already group thousands, or when one key typed or deleted changed the
 * grouped text it replaces, `previous`. Otherwise, as in "60000.00" pasted, a dot is the decimal
 * point inputToMoney reads, and the text stays as typed, as does text that is no number.
 */
export function groupThousands(typed: string, previous = ""): string {
  const match = TYPED_MONEY.exec(typed);
  if (!match) return typed;
  const [, integer, decimals = ""] = match;
  const keyOnGrouped =
    oneKeyApart(typed, previous) && THOUSANDS_GROUPED.test(previous.split(",")[0]);
  const separators =
    decimals !== "" || !integer.includes(".") || THOUSANDS_GROUPED.test(integer) || keyOnGrouped;
  if (!separators) return typed;
  const digits = integer.replaceAll(".", "");
  return digits === "" ? typed : `${groupDigits(digits)}${decimals}`;
}

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
