import { cn } from "cn";
import { useId } from "react";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";

function Message({ className, ...props }: React.ComponentProps<"p">) {
  return <p className={cn("text-sm text-destructive", className)} {...props} />;
}

interface TextFieldProps {
  label: string;
  /** Names the input when the visible label alone would be ambiguous, such as in a row. */
  accessibleName?: string;
  value: string;
  onChange: (value: string) => void;
  invalid: boolean;
  type?: "text" | "date" | "number";
  inputMode?: "decimal" | "numeric";
}

export function TextField({
  label,
  accessibleName,
  value,
  onChange,
  invalid,
  type = "text",
  inputMode,
}: TextFieldProps) {
  const id = useId();
  const messageId = `${id}-message`;
  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Input
        id={id}
        type={type}
        inputMode={inputMode}
        aria-label={accessibleName}
        aria-invalid={invalid || undefined}
        aria-describedby={invalid ? messageId : undefined}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
      {invalid && <Message id={messageId}>Valor inválido.</Message>}
    </Field>
  );
}

interface SelectFieldProps<T extends string> {
  label: string;
  accessibleName?: string;
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
  invalid: boolean;
}

export function SelectField<T extends string>({
  label,
  accessibleName,
  value,
  options,
  onChange,
  invalid,
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
      {invalid && <Message id={messageId}>Valor inválido.</Message>}
    </Field>
  );
}

type ListSectionProps = React.ComponentProps<"fieldset"> & {
  title: string;
  invalid: boolean;
  onAdd: () => void;
};

/** ListSection frames the rows of one editable list with the button that adds another. */
export function ListSection({
  title,
  invalid,
  onAdd,
  className,
  children,
  ...props
}: ListSectionProps) {
  const messageId = useId();
  return (
    <fieldset
      className={cn("flex flex-col gap-3", className)}
      aria-invalid={invalid || undefined}
      aria-describedby={invalid ? messageId : undefined}
      {...props}
    >
      <legend className="mb-1.5 font-medium">{title}</legend>
      {children}
      {invalid && <Message id={messageId}>Confira as linhas desta lista.</Message>}
      <Button type="button" variant="outline" className="self-start" onClick={onAdd}>
        Adicionar
      </Button>
    </fieldset>
  );
}

type RowProps = React.ComponentProps<"div"> & { onRemove: () => void };

/** Row groups the inputs of one list row; the caller names it with its list and row number. */
export function Row({ onRemove, className, children, ...props }: RowProps) {
  return (
    <div role="group" className={cn("flex flex-wrap items-start gap-3", className)} {...props}>
      {children}
      <Button type="button" variant="ghost" className="self-end" onClick={onRemove}>
        Remover
      </Button>
    </div>
  );
}
