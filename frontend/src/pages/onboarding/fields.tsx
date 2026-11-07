import { Input } from "@/components/ui/input";
import { type ReactNode, useId } from "react";
import {
  GroupedListItem,
  GroupedListLabel,
  GroupedListRow,
} from "@/components/patterns/GroupedList";
import { Switch } from "@/components/ui/switch";

function RowText({
  labelFor,
  label,
  hint,
  hintId,
  message,
  messageId,
}: {
  labelFor: string;
  label: string;
  hint?: string;
  hintId: string;
  message?: string;
  messageId: string;
}) {
  return (
    <GroupedListLabel className="flex flex-col gap-0.5">
      <label htmlFor={labelFor}>{label}</label>
      {hint !== undefined && (
        <span id={hintId} className="text-footnote text-muted-foreground">
          {hint}
        </span>
      )}
      {message !== undefined && (
        <span id={messageId} className="text-footnote text-destructive">
          {message}
        </span>
      )}
    </GroupedListLabel>
  );
}

interface InputRowProps
  extends Omit<React.ComponentProps<"input">, "value" | "onChange" | "prefix"> {
  label: string;
  /** One sentence under the label on what to type. */
  hint?: string;
  invalid: boolean;
  value: string;
  onChange: (value: string) => void;
  /** The unit before the value, such as "R$". */
  prefix?: string;
  /** The unit after the value, such as "% ao mês". */
  suffix?: ReactNode;
}

/** InputRow is a grouped list row whose value the owner types in place. */
export function InputRow({
  label,
  hint,
  invalid,
  value,
  onChange,
  prefix,
  suffix,
  className,
  ...props
}: InputRowProps) {
  const id = useId();
  const hintId = `${id}-hint`;
  const messageId = `${id}-message`;
  return (
    <GroupedListItem>
      <GroupedListRow>
        <RowText
          labelFor={id}
          label={label}
          hint={hint}
          hintId={hintId}
          message={invalid ? "Valor inválido." : undefined}
          messageId={messageId}
        />
        <span className="flex shrink-0 items-baseline gap-1">
          {prefix !== undefined && <span className="text-muted-foreground">{prefix}</span>}
          <Input
            id={id}
            variant="inline"
            value={value}
            onChange={(event) => onChange(event.target.value)}
            aria-invalid={invalid || undefined}
            aria-describedby={
              [invalid ? messageId : undefined, hint === undefined ? undefined : hintId]
                .filter(Boolean)
                .join(" ") || undefined
            }
            className={className}
            {...props}
          />
          {suffix !== undefined && <span className="text-muted-foreground">{suffix}</span>}
        </span>
      </GroupedListRow>
    </GroupedListItem>
  );
}

interface SwitchRowProps {
  label: string;
  hint?: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  invalid?: boolean;
}

/** SwitchRow is a grouped list row that turns something on or off. */
export function SwitchRow({ label, hint, checked, onCheckedChange, invalid }: SwitchRowProps) {
  const id = useId();
  const hintId = `${id}-hint`;
  const messageId = `${id}-message`;
  return (
    <GroupedListItem>
      <GroupedListRow>
        <RowText
          labelFor={id}
          label={label}
          hint={hint}
          hintId={hintId}
          message={invalid ? "Valor inválido." : undefined}
          messageId={messageId}
        />
        <Switch
          id={id}
          checked={checked}
          onCheckedChange={onCheckedChange}
          aria-invalid={invalid || undefined}
          aria-describedby={invalid ? messageId : hint === undefined ? undefined : hintId}
        />
      </GroupedListRow>
    </GroupedListItem>
  );
}
