// The API sends values as decimal strings and dates as ISO text. Both are formatted from the text,
// so no float rounding or time zone shifts a value on its way to the screen.

/** formatPercent writes a decimal string with a decimal comma and a percent sign. */
export function formatPercent(decimal: string): string {
  return `${decimal.replace(".", ",")}%`;
}

/** formatDate turns a calendar date such as 2024-03-01 into 01/03/2024. */
export function formatDate(isoDate: string): string {
  const [year, month, day] = isoDate.split("-");
  return `${day}/${month}/${year}`;
}

/** formatPeriod writes a single date when the period is one day, and "start a end" otherwise. */
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

/** formatDateTime writes an instant as date and time in the browser's time zone. */
export function formatDateTime(instant: string): string {
  const date = new Date(instant);
  return `${dateFormat.format(date)} ${timeFormat.format(date)}`;
}
