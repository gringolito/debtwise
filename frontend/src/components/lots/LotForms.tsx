import { type FormEvent, useState } from "react";
import { EventForm } from "@/components/mortgage/EventForm";
import { SelectField, TextField } from "@/components/mortgage/FormControls";
import { Button } from "@/components/ui/button";
import type { Lot } from "@/lib/api";
import { bondTypeOptions } from "@/lib/bondKinds";
import {
  blankLot,
  type LotFormValues,
  lotErrors,
  lotInput,
  lotLabel,
  valuesFromLot,
} from "@/lib/lots";
import { useAddLot, useEditLot } from "@/lib/lotQueries";

interface LotFieldsProps {
  values: LotFormValues;
  onChange: (values: LotFormValues) => void;
  errors: Map<string, string>;
}

function LotFields({ values, onChange, errors }: LotFieldsProps) {
  return (
    <>
      <SelectField
        label="Título"
        options={bondTypeOptions}
        value={values.type}
        onChange={(type) => onChange({ ...values, type })}
        invalid={errors.has("type")}
        message={errors.get("type")}
      />
      <TextField
        label="Vencimento"
        type="date"
        value={values.maturity}
        onChange={(maturity) => onChange({ ...values, maturity })}
        invalid={errors.has("maturity")}
        message={errors.get("maturity")}
      />
      <TextField
        label="Data da compra"
        type="date"
        value={values.purchaseDate}
        onChange={(purchaseDate) => onChange({ ...values, purchaseDate })}
        invalid={errors.has("purchase_date")}
        message={errors.get("purchase_date")}
      />
      <TextField
        label="Taxa contratada (% ao ano)"
        inputMode="decimal"
        value={values.rate}
        onChange={(rate) => onChange({ ...values, rate })}
        invalid={errors.has("rate")}
        message={errors.get("rate")}
      />
      <TextField
        label="Preço unitário"
        inputMode="decimal"
        value={values.unitPrice}
        onChange={(unitPrice) => onChange({ ...values, unitPrice })}
        invalid={errors.has("unit_price")}
        message={errors.get("unit_price")}
      />
      <TextField
        label="Quantidade"
        inputMode="decimal"
        value={values.quantity}
        onChange={(quantity) => onChange({ ...values, quantity })}
        invalid={errors.has("quantity")}
        message={errors.get("quantity")}
      />
    </>
  );
}

export function NewLotForm() {
  const [values, setValues] = useState(blankLot);
  const add = useAddLot();
  const errors = lotErrors(add.error);

  function submit(event: FormEvent) {
    event.preventDefault();
    add.mutate(lotInput(values), { onSuccess: () => setValues(blankLot) });
  }

  return (
    <EventForm
      aria-label="Registrar lote"
      failure={add.isError && errors.size === 0 ? "Não foi possível registrar o lote." : null}
      onSubmit={submit}
    >
      <LotFields values={values} onChange={setValues} errors={errors} />
      <Button type="submit" disabled={add.isPending}>
        Registrar
      </Button>
    </EventForm>
  );
}

export function EditLotForm({ lot, onClose }: { lot: Lot; onClose: () => void }) {
  const [values, setValues] = useState(() => valuesFromLot(lot));
  const edit = useEditLot();
  const errors = lotErrors(edit.error);

  function submit(event: FormEvent) {
    event.preventDefault();
    edit.mutate({ id: lot.id, input: lotInput(values) }, { onSuccess: onClose });
  }

  return (
    <EventForm
      aria-label={`Editar ${lotLabel(lot)}`}
      failure={edit.isError && errors.size === 0 ? "Não foi possível salvar o lote." : null}
      onSubmit={submit}
    >
      <LotFields values={values} onChange={setValues} errors={errors} />
      <Button type="submit" disabled={edit.isPending}>
        Salvar
      </Button>
      <Button type="button" variant="outline" onClick={onClose}>
        Cancelar
      </Button>
    </EventForm>
  );
}
