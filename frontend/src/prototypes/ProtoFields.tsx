// PROTOTYPE, throwaway: "Orvalho nítido"'s typed-in-place values.
// - The value and its units read as one right-aligned group: the input is as wide as its text, so
//   "R$" sits next to the amount instead of at the far edge of a fixed 144px box.
// - Dates are typed as dd/mm/aaaa whatever the browser's language; the native input wrote them in
//   the browser's locale ("04/15/2023" on an English system). The calendar still opens the native
//   picker.
// - Money always shows its cents ("480.000,00").
import { CalendarIcon } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import {
  describedBy,
  InlineInput,
  type InputRowProps,
  RowText,
} from "@/components/patterns/FieldRows";
import { GroupedListItem, GroupedListRow } from "@/components/patterns/GroupedList";

const GROUPED_MONEY = /^\d{1,3}(\.\d{3})*(,\d*)?$|^\d+(,\d*)?$/;

/** withCents completes a typed amount to two places: "480.000" reads "480.000,00". */
function withCents(text: string): string {
  if (!GROUPED_MONEY.test(text)) return text;
  const [integer, cents = ""] = text.split(",");
  return `${integer},${cents.padEnd(2, "0")}`;
}

function brDate(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : "";
}

/** Writes the digits typed so far as dd/mm/aaaa. */
function masked(digits: string): string {
  const d = digits.slice(0, 8);
  if (d.length <= 2) return d;
  if (d.length <= 4) return `${d.slice(0, 2)}/${d.slice(2)}`;
  return `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}`;
}

type FieldProps = Omit<InputRowProps, "label" | "hint" | "message" | "prefix" | "suffix">;

function DateInput({ value, onChange, id, ...props }: FieldProps) {
  const picker = useRef<HTMLInputElement>(null);
  const [text, setText] = useState(() => brDate(value));
  const emitted = useRef(value);

  useEffect(() => {
    if (value === emitted.current) return;
    emitted.current = value;
    setText(brDate(value));
  }, [value]);

  const emit = (iso: string) => {
    emitted.current = iso;
    onChange(iso);
  };

  return (
    <span className="relative flex items-center gap-1">
      <button
        type="button"
        aria-label="Abrir calendário"
        className="proto-calendar grid size-8 place-items-center rounded-lg text-muted-foreground hover:text-foreground"
        onClick={() => picker.current?.showPicker()}
      >
        <CalendarIcon aria-hidden="true" strokeWidth={1.75} className="size-4" />
      </button>
      <InlineInput
        {...props}
        id={id}
        inputMode="numeric"
        autoComplete="off"
        placeholder="dd/mm/aaaa"
        value={text}
        onFocus={(event) => event.currentTarget.select()}
        onChange={(typed) => {
          const all = typed.replace(/\D/g, "");
          // Typing on past a complete date starts a new one with what was typed after it.
          const digits = all.length > 8 ? all.slice(8) : all;
          setText(masked(digits));
          emit(
            digits.length === 8
              ? `${digits.slice(4, 8)}-${digits.slice(2, 4)}-${digits.slice(0, 2)}`
              : "",
          );
        }}
      />
      <input
        ref={picker}
        type="date"
        tabIndex={-1}
        aria-hidden="true"
        className="proto-date-picker"
        value={value}
        onChange={(event) => {
          setText(brDate(event.target.value));
          emit(event.target.value);
        }}
      />
    </span>
  );
}

function MoneyInput({ value, onChange, ...props }: FieldProps) {
  const [focused, setFocused] = useState(false);
  return (
    <InlineInput
      {...props}
      value={focused || value === "" ? value : withCents(value)}
      onChange={onChange}
      onFocus={() => {
        setFocused(true);
        if (value !== "" && withCents(value) !== value) onChange(withCents(value));
      }}
      onBlur={() => {
        setFocused(false);
        if (value !== "" && withCents(value) !== value) onChange(withCents(value));
      }}
    />
  );
}

export function ProtoInputRow({ label, hint, message, prefix, suffix, ...props }: InputRowProps) {
  const id = useId();
  const text = { id, label, hint, message };
  const field = {
    ...props,
    id,
    "aria-invalid": message !== undefined || undefined,
    "aria-describedby": describedBy(text),
  };
  const money = prefix === "R$" && props.grouped;
  return (
    <GroupedListItem>
      <GroupedListRow>
        <RowText {...text} />
        <span className="proto-value flex shrink-0 items-baseline justify-end gap-1">
          {prefix !== undefined && <span className="text-muted-foreground">{prefix}</span>}
          {props.type === "date" ? (
            <DateInput {...field} type="text" />
          ) : money ? (
            <MoneyInput {...field} />
          ) : (
            <InlineInput {...field} />
          )}
          {suffix !== undefined && <span className="text-muted-foreground">{suffix}</span>}
        </span>
      </GroupedListRow>
    </GroupedListItem>
  );
}
