import { InfoIcon } from "lucide-react";
import { useId } from "react";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import type { Indexer } from "@/lib/mortgageForm";
import { indexerChoices } from "@/lib/onboarding";
import type { StepProps } from "@/pages/onboarding/StepFrame";

export function IndexerStep({ values, set, isInvalid }: StepProps) {
  const id = useId();
  const invalid = isInvalid("indexer");
  return (
    <div className="flex flex-col gap-4">
      <div className="overflow-hidden rounded-lg border bg-card">
        <RadioGroup
          aria-label="Índice de correção"
          aria-invalid={invalid || undefined}
          value={values.indexer}
          onValueChange={(value) => set("indexer", value as Indexer)}
          layout="rows"
        >
          {indexerChoices.map(({ value, name, description }) => (
            <label
              key={value}
              className="flex cursor-pointer items-center gap-4 px-4 py-3 transition-colors not-last:border-b has-data-checked:bg-accent-tint"
            >
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span id={`${id}-${value}-name`} className="text-headline">
                  {name}
                </span>
                <span
                  id={`${id}-${value}-description`}
                  className="text-callout text-muted-foreground"
                >
                  {description}
                </span>
              </span>
              <RadioGroupItem
                value={value}
                aria-labelledby={`${id}-${value}-name`}
                aria-describedby={`${id}-${value}-description`}
              />
            </label>
          ))}
        </RadioGroup>
      </div>
      {invalid && <p className="text-callout text-destructive">Escolha um índice.</p>}
      <p className="flex items-center gap-3 rounded-lg bg-accent-tint px-4 py-3 text-callout text-accent">
        <InfoIcon aria-hidden="true" strokeWidth={1.5} className="size-5 shrink-0" />O índice define
        com quais títulos do Tesouro o DebtWise compara.
      </p>
    </div>
  );
}
