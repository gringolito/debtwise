import { cn } from "@/lib/utils";
import { useId } from "react";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import type { AmortizationSystem } from "@/lib/mortgageForm";
import type { StepProps } from "@/pages/onboarding/StepFrame";

interface SystemChoice {
  value: AmortizationSystem;
  name: string;
  description: string;
  /** The schematic's bars, one per installment, as Tailwind height classes. */
  bars: string[];
}

const choices: SystemChoice[] = [
  {
    value: "sac",
    name: "SAC",
    description: "Prestações começam maiores e diminuem a cada mês.",
    bars: ["h-16", "h-14", "h-12", "h-10", "h-8", "h-6"],
  },
  {
    value: "price",
    name: "Price",
    description: "Prestações de valor parecido ao longo do contrato.",
    bars: ["h-10", "h-10", "h-10", "h-10", "h-10", "h-10"],
  },
];

export function SystemStep({ values, set, messageOf }: StepProps) {
  const id = useId();
  const message = messageOf("amortization_system");
  const invalid = message !== undefined;
  return (
    <div className="flex flex-col gap-4">
      <RadioGroup
        aria-label="Sistema de amortização"
        aria-invalid={invalid || undefined}
        aria-describedby={invalid ? `${id}-message` : undefined}
        value={values.amortizationSystem}
        onValueChange={(value) => set("amortizationSystem", value as AmortizationSystem)}
        layout="cards"
      >
        {choices.map(({ value, name, description, bars }) => (
          <label
            key={value}
            className="group flex cursor-pointer flex-col gap-4 rounded-lg border-2 border-border bg-card p-6 transition-colors has-data-checked:border-accent-mark has-data-checked:bg-accent-tint"
          >
            <span className="flex items-center justify-between">
              <span id={`${id}-${value}-name`} className="text-headline">
                {name}
              </span>
              <RadioGroupItem
                value={value}
                aria-labelledby={`${id}-${value}-name`}
                aria-describedby={`${id}-${value}-description`}
              />
            </span>
            <span aria-hidden="true" className="flex h-16 items-end gap-1.5">
              {bars.map((height, i) => (
                <span
                  // biome-ignore lint/suspicious/noArrayIndexKey: the bars are a fixed picture.
                  key={i}
                  className={cn(height, "flex-1 bg-border group-has-data-checked:bg-accent-mark")}
                />
              ))}
            </span>
            <span id={`${id}-${value}-description`} className="text-callout">
              {description}
            </span>
          </label>
        ))}
      </RadioGroup>
      {invalid && (
        <p id={`${id}-message`} className="text-callout text-destructive">
          {message}
        </p>
      )}
      <p className="text-center text-footnote text-muted-foreground">
        Não encontrou? Ligue para o banco e pergunte pelo sistema de amortização.
      </p>
    </div>
  );
}
