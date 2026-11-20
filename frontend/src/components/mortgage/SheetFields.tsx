import { InfoIcon } from "lucide-react";
import { useId } from "react";
import {
  GroupedListHeader,
  GroupedListItem,
  GroupedListLabel,
  GroupedListRow,
  GroupedListSection,
  GroupedListValue,
} from "@/components/patterns/GroupedList";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  effectDescriptions,
  effectLabels,
  effectOptions,
  type PrepaymentEffect,
} from "@/lib/mortgageEvents";
import { cn } from "@/lib/utils";

/** SheetValueRow is a grouped list row that shows a value the owner can't change. */
export function SheetValueRow({
  label,
  children,
  className,
  ...props
}: React.ComponentProps<"li"> & { label: string }) {
  return (
    <GroupedListItem className={className} {...props}>
      <GroupedListRow>
        <GroupedListLabel className="text-muted-foreground">{label}</GroupedListLabel>{" "}
        <GroupedListValue className="text-foreground">{children}</GroupedListValue>{" "}
      </GroupedListRow>
    </GroupedListItem>
  );
}

/** SheetNote is a white panel with what the recorded value would change. */
export function SheetNote({ className, children, ...props }: React.ComponentProps<"p">) {
  return (
    <p
      role="status"
      className={cn(
        "flex items-center gap-3 rounded-lg border bg-card px-4 py-3 text-callout",
        className,
      )}
      {...props}
    >
      <InfoIcon aria-hidden="true" strokeWidth={1.5} className="size-5 shrink-0 text-accent" />
      <span>{children}</span>
    </p>
  );
}

/** EffectField picks what a prepayment changes, as a selectable card for each effect. */
export function EffectField({
  value,
  onChange,
}: {
  value: PrepaymentEffect;
  onChange: (effect: PrepaymentEffect) => void;
}) {
  const id = useId();
  return (
    <GroupedListSection>
      <GroupedListHeader id={id}>Efeito</GroupedListHeader>
      <RadioGroup
        aria-labelledby={id}
        value={value}
        onValueChange={(effect) => onChange(effect as PrepaymentEffect)}
      >
        {effectOptions.map((option) => (
          <label
            key={option.value}
            className="flex cursor-pointer items-center gap-4 rounded-lg border bg-card px-4 py-3 transition-colors has-data-checked:border-accent-mark has-data-checked:bg-accent-tint"
          >
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span id={`${id}-${option.value}-name`} className="text-headline">
                {effectLabels[option.value]}
              </span>
              <span
                id={`${id}-${option.value}-description`}
                className="text-callout text-muted-foreground"
              >
                {effectDescriptions[option.value]}
              </span>
            </span>
            <RadioGroupItem
              value={option.value}
              aria-labelledby={`${id}-${option.value}-name`}
              aria-describedby={`${id}-${option.value}-description`}
            />
          </label>
        ))}
      </RadioGroup>
    </GroupedListSection>
  );
}
