import { cn } from "@/lib/utils";
import { useId } from "react";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";

function Message({ className, ...props }: React.ComponentProps<"p">) {
  return <p className={cn("text-callout text-destructive", className)} {...props} />;
}

interface TextFieldProps {
  label: string;
  /** Names the input when the visible label alone would be ambiguous, such as in a row. */
  accessibleName?: string;
  value: string;
  onChange: (value: string) => void;
  invalid: boolean;
  /** What the owner reads next to an invalid input; a generic one when the cause is unknown. */
  message?: string;
  /** What the owner reads under the input while it is valid, such as what leaving it empty means. */
  hint?: string;
  type?: "text" | "date" | "number";
  inputMode?: "decimal" | "numeric";
}

export function TextField({
  label,
  accessibleName,
  value,
  onChange,
  invalid,
  message = "Valor inválido.",
  hint,
  type = "text",
  inputMode,
}: TextFieldProps) {
  const id = useId();
  const messageId = `${id}-message`;
  const hintId = `${id}-hint`;
  const hintShown = !invalid && hint !== undefined;
  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Input
        id={id}
        type={type}
        inputMode={inputMode}
        aria-label={accessibleName}
        aria-invalid={invalid || undefined}
        aria-describedby={invalid ? messageId : hintShown ? hintId : undefined}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
      {invalid && <Message id={messageId}>{message}</Message>}
      {hintShown && <FieldDescription id={hintId}>{hint}</FieldDescription>}
    </Field>
  );
}

interface SelectFieldProps<T extends string> {
  label: string;
  accessibleName?: string;
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
  invalid?: boolean;
  message?: string;
}

export function SelectField<T extends string>({
  label,
  accessibleName,
  value,
  options,
  onChange,
  invalid,
  message = "Valor inválido.",
}: SelectFieldProps<T>) {
  const id = useId();
  const messageId = `${id}-message`;
  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <NativeSelect
        id={id}
        aria-label={accessibleName}
        aria-invalid={invalid || undefined}
        aria-describedby={invalid ? messageId : undefined}
        value={value}
        onChange={(event) => onChange(event.target.value as T)}
      >
        {options.map((option) => (
          <NativeSelectOption key={option.value} value={option.value}>
            {option.label}
          </NativeSelectOption>
        ))}
      </NativeSelect>
      {invalid && <Message id={messageId}>{message}</Message>}
    </Field>
  );
}
