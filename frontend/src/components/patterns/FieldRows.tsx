import { type ReactNode, useId } from "react";
import {
  GroupedListItem,
  GroupedListLabel,
  GroupedListRow,
} from "@/components/patterns/GroupedList";
import { useTypedValue } from "@/components/patterns/useTypedValue";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";

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

interface InputRowProps extends Omit<InlineInputProps, "prefix">, Omit<RowTextProps, "id"> {
  /** The unit before the value, such as "R$". */
  prefix?: string;
  /** The unit after the value, such as "% ao mês". */
  suffix?: ReactNode;
}

interface InlineInputProps
  extends Omit<React.ComponentProps<typeof Input>, "value" | "onChange" | "variant"> {
  value: string;
  onChange: (value: string) => void;
  /**
   * Groups the thousands of the number the owner types, as "1.250.000,00". The value keeps what
   * inputToMoney reads.
   */
  grouped?: boolean;
}

/** InlineInput is a value typed in place, as on a grouped list row or a table cell. */
export function InlineInput({ value, onChange, grouped = false, ...props }: InlineInputProps) {
  const typed = useTypedValue(value, onChange, grouped);

  return <Input {...typed} variant="inline" {...props} />;
}

/** InputRow is a grouped list row whose value the owner types in place. */
export function InputRow({ label, hint, message, prefix, suffix, ...props }: InputRowProps) {
  const id = useId();
  const text = { id, label, hint, message };
  return (
    <GroupedListItem>
      <GroupedListRow>
        <RowText {...text} />
        <span className="flex shrink-0 items-baseline gap-1">
          {prefix !== undefined && <span className="text-muted-foreground">{prefix}</span>}
          <InlineInput
            id={id}
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
