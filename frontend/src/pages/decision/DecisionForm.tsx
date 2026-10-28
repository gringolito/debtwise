import { type FormEvent, useState } from "react";
import { EventForm } from "@/components/mortgage/EventForm";
import { SelectField, TextField } from "@/components/mortgage/FormControls";
import { Button } from "@/components/ui/button";
import type { DecisionInput } from "@/lib/api";
import { blankDecision, decisionInput } from "@/lib/decisions";
import { effectOptions } from "@/lib/mortgageEvents";

interface DecisionFormProps {
  onSubmit: (input: DecisionInput) => void;
  pending: boolean;
  /** What the owner reads next to each field the server rejected, by body field. */
  errors: Map<string, string>;
  /** What the alert says; null while the last comparison did not fail or the failure names a field. */
  failure: string | null;
}

export function DecisionForm({ onSubmit, pending, errors, failure }: DecisionFormProps) {
  const [values, setValues] = useState(blankDecision);

  function submit(event: FormEvent) {
    event.preventDefault();
    onSubmit(decisionInput(values));
  }

  return (
    <EventForm aria-label="Simular decisão" failure={failure} onSubmit={submit}>
      <TextField
        label="Valor"
        inputMode="decimal"
        value={values.amount}
        onChange={(amount) => setValues({ ...values, amount })}
        invalid={errors.has("amount")}
        message={errors.get("amount")}
      />
      <TextField
        label="Data"
        type="date"
        hint="Hoje, se vazia."
        value={values.date}
        onChange={(date) => setValues({ ...values, date })}
        invalid={errors.has("date")}
        message={errors.get("date")}
      />
      <SelectField
        label="Efeito"
        options={effectOptions}
        value={values.effect}
        onChange={(effect) => setValues({ ...values, effect })}
        invalid={errors.has("effect")}
        message={errors.get("effect")}
      />
      <Button type="submit" disabled={pending}>
        Comparar
      </Button>
    </EventForm>
  );
}
