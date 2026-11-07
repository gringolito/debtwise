import { type ReactNode, useId } from "react";
import {
  GroupedListItem,
  GroupedListLabel,
  GroupedListRow,
} from "@/components/patterns/GroupedList";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";

interface RowTextProps {
  id: string;
  label: string;
  hint?: string;
  message?: string;
}

const describedBy = ({ id, hint, message }: RowTextProps) =>
  message !== undefined ? `${id}-message` : hint !== undefined ? `${id}-hint` : undefined;

function RowText({ id, label, hint, message }: RowTextProps) {
  return (
    <GroupedListLabel className="flex flex-col gap-0.5">
      <label htmlFor={id}>{label}</label>
      {message !== undefined ? (
        <span id={`${id}-message`} className="text-footnote text-destructive">
          {message}
        </span>
      ) : (
        hint !== undefined && (
          <span id={`${id}-hint`} className="text-footnote text-muted-foreground">
            {hint}
          </span>
        )
      )}
    </GroupedListLabel>
  );
}

interface InputRowProps
  extends Omit<React.ComponentProps<"input">, "value" | "onChange" | "prefix"> {
  label: string;
  /** One sentence under the label on what to type, while the value is not rejected. */
  hint?: string;
  /** Why the value was rejected, in place of the hint; unset while it is valid. */
  message?: string;
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
  message,
  value,
  onChange,
  prefix,
  suffix,
  ...props
}: InputRowProps) {
  const id = useId();
  const text = { id, label, hint, message };
  return (
    <GroupedListItem>
      <GroupedListRow>
        <RowText {...text} />
        <span className="flex shrink-0 items-baseline gap-1">
          {prefix !== undefined && <span className="text-muted-foreground">{prefix}</span>}
          <Input
            id={id}
            variant="inline"
            value={value}
            onChange={(event) => onChange(event.target.value)}
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

interface SwitchRowProps extends Omit<React.ComponentProps<typeof Switch>, "id"> {
  label: string;
  /** Why the value was rejected; unset while it is valid. */
  message?: string;
}

/** SwitchRow is a grouped list row that turns something on or off. */
export function SwitchRow({ label, message, ...props }: SwitchRowProps) {
  const id = useId();
  const text = { id, label, message };
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
