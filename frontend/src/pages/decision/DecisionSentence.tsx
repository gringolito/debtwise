import { ChevronDownIcon } from "lucide-react";
import { type FormEvent, useId, useState } from "react";
import { DateInput } from "@/components/patterns/DateInput";
import { useTypedValue } from "@/components/patterns/useTypedValue";
import { Button } from "@/components/ui/button";
import type { DecisionFormValues } from "@/lib/decisions";
import { formatDate } from "@/lib/format";
import type { PrepaymentEffect } from "@/lib/mortgageEvents";
import { cn } from "@/lib/utils";

const effects: Record<PrepaymentEffect, string> = {
  shorten_term: "reduzir o prazo",
  lower_installment: "reduzir a prestação",
};

// An editable value inside the sentence: underlined in the accent mark, red once rejected.
const editable =
  "border-b-2 border-accent-mark font-medium focus-within:border-accent focus-visible:border-accent aria-invalid:border-destructive aria-invalid:text-destructive has-aria-invalid:border-destructive has-aria-invalid:text-destructive";

interface DateValueProps {
  value: string;
  onChange: (date: string) => void;
  /** Whether the date typed is a complete date that does not exist. */
  impossible: boolean;
  /** Called with whether the date typed is a complete date that does not exist. */
  onImpossibleChange: (impossible: boolean) => void;
  invalid: boolean;
  describedBy: string | undefined;
}

/**
 * DateValue reads "hoje" while no date is chosen, and opens a date input when the owner taps it.
 * A date typed that does not exist keeps the input open, so it isn't taken for "hoje".
 */
function DateValue({
  value,
  onChange,
  impossible,
  onImpossibleChange,
  invalid,
  describedBy,
}: DateValueProps) {
  const [editing, setEditing] = useState(false);
  const field = { "aria-invalid": invalid || undefined, "aria-describedby": describedBy };
  if (editing) {
    return (
      // Focus moving inside the field, to its calendar button, doesn't end the editing. Safari
      // doesn't focus a button it is clicked, so a press on one is kept from taking focus away.
      <span
        className={cn(editable, "inline-flex")}
        onBlur={(event) => {
          if (impossible || event.currentTarget.contains(event.relatedTarget)) return;
          setEditing(false);
        }}
        onMouseDown={(event) => {
          if (event.target instanceof Element && event.target.closest("button")) {
            event.preventDefault();
          }
        }}
      >
        <DateInput
          aria-label="Data"
          // biome-ignore lint/a11y/noAutofocus: the owner just asked to type the date
          autoFocus
          value={value}
          onChange={onChange}
          onImpossibleChange={onImpossibleChange}
          className="text-left"
          {...field}
        />
      </span>
    );
  }
  const shown = value === "" ? "hoje" : formatDate(value);
  return (
    <>
      {value !== "" && "em "}
      <button
        type="button"
        aria-label={`Data: ${shown}`}
        onClick={() => setEditing(true)}
        className={editable}
        {...field}
      >
        {shown}
      </button>
    </>
  );
}

interface DecisionSentenceProps {
  values: DecisionFormValues;
  onChange: (values: DecisionFormValues) => void;
  onSubmit: () => void;
  pending: boolean;
  /** What the owner reads under the sentence for each field the server rejected, by body field. */
  errors: Map<string, string>;
}

/**
 * DecisionSentence asks the question as a sentence whose amount, date and effect the owner edits
 * in place: "Se eu tiver R$ 10.000,00 hoje para reduzir o prazo".
 */
export function DecisionSentence({
  values,
  onChange,
  onSubmit,
  pending,
  errors,
}: DecisionSentenceProps) {
  const id = useId();
  const [impossibleDate, setImpossibleDate] = useState(false);
  // A date typed that does not exist reads as none to the API, which has nothing to reject.
  const messages = new Map(errors);
  if (impossibleDate) messages.set("date", "Essa data não existe.");
  const messageId = (field: string) => (messages.has(field) ? `${id}-${field}` : undefined);
  const amount = useTypedValue(
    values.amount,
    (typed) => onChange({ ...values, amount: typed }),
    true,
  );

  function submit(event: FormEvent) {
    event.preventDefault();
    // The API would read a date that does not exist as none, which is today.
    if (!impossibleDate) onSubmit();
  }

  return (
    <form
      aria-label="Decisão"
      onSubmit={submit}
      className="flex flex-col gap-3 rounded-lg glass px-6 py-5"
    >
      <div className="flex items-center justify-between gap-6">
        <p className="flex flex-wrap items-baseline gap-x-1.5 gap-y-2 text-body">
          Se eu tiver{" "}
          <span className={cn(editable, "inline-flex items-baseline")}>
            R$&nbsp;
            <input
              {...amount}
              aria-label="Valor"
              inputMode="decimal"
              placeholder="0,00"
              aria-invalid={messages.has("amount") || undefined}
              aria-describedby={messageId("amount")}
              className="field-sizing-content min-w-12 bg-transparent placeholder:text-tertiary-foreground"
            />
          </span>{" "}
          <DateValue
            value={values.date}
            onChange={(date) => onChange({ ...values, date })}
            impossible={impossibleDate}
            onImpossibleChange={setImpossibleDate}
            invalid={messages.has("date")}
            describedBy={messageId("date")}
          />{" "}
          para{" "}
          <span className={cn(editable, "relative inline-flex items-baseline")}>
            <select
              aria-label="Efeito"
              value={values.effect}
              onChange={(event) =>
                onChange({ ...values, effect: event.target.value as PrepaymentEffect })
              }
              aria-invalid={messages.has("effect") || undefined}
              aria-describedby={messageId("effect")}
              className="field-sizing-content appearance-none bg-transparent pr-5"
            >
              {(Object.keys(effects) as PrepaymentEffect[]).map((effect) => (
                <option key={effect} value={effect}>
                  {effects[effect]}
                </option>
              ))}
            </select>
            <ChevronDownIcon
              aria-hidden="true"
              strokeWidth={1.5}
              className="pointer-events-none absolute right-0 size-4 self-center text-muted-foreground"
            />
          </span>
        </p>
        <Button type="submit" disabled={pending}>
          Comparar
        </Button>
      </div>
      {[...messages].map(([field, message]) => (
        <p key={field} id={`${id}-${field}`} className="text-footnote text-destructive">
          {message}
        </p>
      ))}
    </form>
  );
}
