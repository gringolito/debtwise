import { type ReactNode, useId, useLayoutEffect, useRef } from "react";
import {
  GroupedListItem,
  GroupedListLabel,
  GroupedListRow,
} from "@/components/patterns/GroupedList";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { groupThousands } from "@/lib/format";

interface RowTextProps {
  id: string;
  label: string;
  /** One sentence under the label on what to give. */
  hint?: string;
  /** Why the value was rejected; unset while it is valid. */
  message?: string;
}

const describedBy = ({ id, hint, message }: RowTextProps) =>
  [
    message === undefined ? undefined : `${id}-message`,
    hint === undefined ? undefined : `${id}-hint`,
  ]
    .filter(Boolean)
    .join(" ") || undefined;

function RowText({ id, label, hint, message }: RowTextProps) {
  return (
    <GroupedListLabel className="flex flex-col gap-0.5">
      <label htmlFor={id}>{label}</label>
      {hint !== undefined && (
        <span id={`${id}-hint`} className="text-footnote text-muted-foreground">
          {hint}
        </span>
      )}
      {message !== undefined && (
        <span id={`${id}-message`} className="text-footnote text-destructive">
          {message}
        </span>
      )}
    </GroupedListLabel>
  );
}

interface InputRowProps
  extends Omit<React.ComponentProps<"input">, "value" | "onChange" | "prefix">,
    Omit<RowTextProps, "id"> {
  value: string;
  onChange: (value: string) => void;
  /**
   * Groups the thousands of the number the owner types, as "1.250.000,00". The value keeps what
   * inputToMoney reads.
   */
  grouped?: boolean;
  /** The unit before the value, such as "R$". */
  prefix?: string;
  /** The unit after the value, such as "% ao mês". */
  suffix?: ReactNode;
}

// Where the caret goes in formatted text: after as many characters other than group dots as were
// before it in what the owner typed.
function caretIn(formatted: string, typed: string, caret: number): number {
  const kept = typed.slice(0, caret).replaceAll(".", "").length;
  let position = 0;
  for (let seen = 0; position < formatted.length && seen < kept; position++) {
    if (formatted[position] !== ".") seen++;
  }
  return position;
}

/** InputRow is a grouped list row whose value the owner types in place. */
export function InputRow({
  label,
  hint,
  message,
  value,
  onChange,
  grouped = false,
  prefix,
  suffix,
  ...props
}: InputRowProps) {
  const id = useId();
  const text = { id, label, hint, message };
  const input = useRef<HTMLInputElement>(null);
  const caret = useRef<number | null>(null);

  useLayoutEffect(() => {
    if (caret.current === null) return;
    input.current?.setSelectionRange(caret.current, caret.current);
    caret.current = null;
  });

  const change = (event: React.ChangeEvent<HTMLInputElement>) => {
    const typed = event.target.value;
    const next = grouped ? groupThousands(typed, value) : typed;
    if (next !== typed) {
      caret.current = caretIn(next, typed, event.target.selectionStart ?? typed.length);
    }
    onChange(next);
  };

  return (
    <GroupedListItem>
      <GroupedListRow>
        <RowText {...text} />
        <span className="flex shrink-0 items-baseline gap-1">
          {prefix !== undefined && <span className="text-muted-foreground">{prefix}</span>}
          <Input
            ref={input}
            id={id}
            variant="inline"
            value={value}
            onChange={change}
            aria-invalid={message !== undefined || undefined}
            aria-describedby={describedBy(text)}
            {...props}
          />
          {suffix !== undefined && <span className="text-muted-foreground">{suffix}</span>}
        </span>
      </GroupedListRow>
    </GroupedListItem>
  );
}

interface SwitchRowProps
  extends Omit<React.ComponentProps<typeof Switch>, "id">,
    Omit<RowTextProps, "id"> {}

/** SwitchRow is a grouped list row that turns something on or off. */
export function SwitchRow({ label, hint, message, ...props }: SwitchRowProps) {
  const id = useId();
  const text = { id, label, hint, message };
  return (
    <GroupedListItem>
      <GroupedListRow>
        <RowText {...text} />
        <Switch
          id={id}
          aria-invalid={message !== undefined || undefined}
          aria-describedby={describedBy(text)}
          {...props}
        />
      </GroupedListRow>
    </GroupedListItem>
  );
}

interface ChoiceRowProps {
  label: string;
  message?: string;
  /** Renders the control that makes the choice, named by the row's label through its id. */
  children: (labelId: string, describedBy: string | undefined) => ReactNode;
}

/** ChoiceRow is a grouped list row that picks one of a few options, such as a segmented control. */
export function ChoiceRow({ label, message, children }: ChoiceRowProps) {
  const id = useId();
  const labelId = `${id}-label`;
  return (
    <GroupedListItem>
      <GroupedListRow>
        <GroupedListLabel className="flex flex-col gap-0.5">
          <span id={labelId}>{label}</span>
          {message !== undefined && (
            <span id={`${id}-message`} className="text-footnote text-destructive">
              {message}
            </span>
          )}
        </GroupedListLabel>
        {children(labelId, message !== undefined ? `${id}-message` : undefined)}
      </GroupedListRow>
    </GroupedListItem>
  );
}
