import { CalendarIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useFormattedValue } from "@/components/patterns/useTypedValue";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TYPED_DATE = /^(\d{2})\/(\d{2})\/(\d{4})$/;
const TEXT_LENGTH = "dd/mm/aaaa".length;
const DIGITS = 8;

/** The text of an ISO date as the owner types it: "2023-03-15" reads "15/03/2023". */
function textOf(iso: string): string {
  const match = ISO_DATE.exec(iso);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : "";
}

/** Writes the digits in `typed`, up to a whole date, as dd/mm/aaaa: "1503" reads "15/03". */
function maskDate(typed: string): string {
  const digits = typed.replace(/\D/g, "").slice(0, DIGITS);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

const isLeapYear = (year: number) => (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;

function daysIn(month: number, year: number): number {
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

/** The ISO date of dd/mm/aaaa text, or "" while it is not a whole date that exists. */
function isoOf(text: string): string {
  const match = TYPED_DATE.exec(text);
  if (!match) return "";
  const [, day, month, year] = match;
  if (Number(year) < 1 || Number(month) < 1 || Number(month) > 12) return "";
  if (Number(day) < 1 || Number(day) > daysIn(Number(month), Number(year))) return "";
  return `${year}-${month}-${day}`;
}

interface DateInputProps
  extends Omit<
    React.ComponentProps<typeof Input>,
    "value" | "onChange" | "variant" | "type" | "inputMode" | "placeholder"
  > {
  /** The date as ISO "YYYY-MM-DD", or "" for none. A value changed from outside rewrites the text. */
  value: string;
  /**
   * Called with the ISO date once the text typed is a whole date that exists, and with "" otherwise,
   * as a native date input does. A complete date that does not exist, such as 31/02/2026, gives "".
   */
  onChange: (iso: string) => void;
  /**
   * Called with true while the text typed is a complete date that does not exist, and with false
   * once it is not: "" cannot tell that date from one left blank, so whoever shows the owner why
   * the date is missing listens here. The input itself is aria-invalid meanwhile.
   */
  onImpossibleChange?: (impossible: boolean) => void;
}

/**
 * DateInput is a date typed as dd/mm/aaaa, whatever the browser's language, which a native date
 * input would write in its own. The owner types digits and the slashes come in; a calendar button
 * on the right opens the native picker through a hidden date input.
 */
export function DateInput({ value, onChange, onImpossibleChange, ...props }: DateInputProps) {
  const picker = useRef<HTMLInputElement>(null);
  const [text, setText] = useState(() => textOf(value));
  // The value the text was last in step with: what it gave or what the parent passed in.
  const [synced, setSynced] = useState(value);
  if (value !== synced) {
    setSynced(value);
    setText(textOf(value));
  }

  const show = (shown: string, iso: string) => {
    setText(shown);
    setSynced(iso);
    onChange(iso);
  };
  const typed = useFormattedValue(text, (shown) => show(shown, isoOf(shown)), maskDate, "/");

  const impossible = text.length === TEXT_LENGTH && isoOf(text) === "";
  useEffect(() => {
    onImpossibleChange?.(impossible);
  }, [impossible, onImpossibleChange]);

  return (
    <span className="relative flex items-center gap-1">
      <Input
        {...props}
        {...typed}
        variant="inline"
        inputMode="numeric"
        autoComplete="off"
        placeholder="dd/mm/aaaa"
        aria-invalid={props["aria-invalid"] || impossible || undefined}
      />
      <input
        ref={picker}
        type="date"
        tabIndex={-1}
        aria-hidden="true"
        className="pointer-events-none absolute right-0 bottom-0 size-px opacity-0"
        value={value}
        onChange={(event) => show(textOf(event.target.value), event.target.value)}
      />
      <Button
        type="button"
        variant="plain"
        size="icon-sm"
        aria-label="Abrir calendário"
        className="max-sm:-my-2 max-sm:size-11"
        onClick={() => picker.current?.showPicker()}
      >
        <CalendarIcon aria-hidden="true" strokeWidth={1.75} />
      </Button>
    </span>
  );
}
