import { type FormEvent, useState } from "react";
import { DeleteEventDialog } from "@/components/mortgage/DeleteEventDialog";
import { EventForm } from "@/components/mortgage/EventForm";
import { SelectField, TextField } from "@/components/mortgage/FormControls";
import { Section } from "@/components/mortgage/Section";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { Prepayment } from "@/lib/api";
import { formatDate, formatMoney } from "@/lib/format";
import {
  blankPrepayment,
  effectLabels,
  effectOptions,
  type PrepaymentValues,
  prepaymentErrors,
  prepaymentInput,
  valuesFromPrepayment,
} from "@/lib/mortgageEvents";
import {
  useAddPrepayment,
  useDeletePrepayment,
  useEditPrepayment,
  usePrepayments,
} from "@/lib/mortgageQueries";

interface PrepaymentFieldsProps {
  values: PrepaymentValues;
  onChange: (values: PrepaymentValues) => void;
  errors: Map<string, string>;
}

function PrepaymentFields({ values, onChange, errors }: PrepaymentFieldsProps) {
  return (
    <>
      <TextField
        label="Data"
        type="date"
        value={values.date}
        onChange={(date) => onChange({ ...values, date })}
        invalid={errors.has("date")}
        message={errors.get("date")}
      />
      <TextField
        label="Valor"
        inputMode="decimal"
        value={values.amount}
        onChange={(amount) => onChange({ ...values, amount })}
        invalid={errors.has("amount")}
        message={errors.get("amount")}
      />
      <SelectField
        label="Efeito"
        options={effectOptions}
        value={values.effect}
        onChange={(effect) => onChange({ ...values, effect })}
      />
    </>
  );
}

function NewPrepaymentForm() {
  const [values, setValues] = useState(blankPrepayment);
  const add = useAddPrepayment();
  const errors = prepaymentErrors(add.error);

  function submit(event: FormEvent) {
    event.preventDefault();
    add.mutate(prepaymentInput(values), { onSuccess: () => setValues(blankPrepayment) });
  }

  return (
    <EventForm
      aria-label="Registrar amortização extraordinária"
      failure={
        add.isError && errors.size === 0
          ? "Não foi possível registrar a amortização extraordinária."
          : null
      }
      onSubmit={submit}
    >
      <PrepaymentFields values={values} onChange={setValues} errors={errors} />
      <Button type="submit" disabled={add.isPending}>
        Registrar
      </Button>
    </EventForm>
  );
}

function EditPrepaymentForm({
  prepayment,
  onClose,
}: {
  prepayment: Prepayment;
  onClose: () => void;
}) {
  const [values, setValues] = useState(() => valuesFromPrepayment(prepayment));
  const edit = useEditPrepayment();
  const errors = prepaymentErrors(edit.error);

  function submit(event: FormEvent) {
    event.preventDefault();
    edit.mutate({ id: prepayment.id, input: prepaymentInput(values) }, { onSuccess: onClose });
  }

  return (
    <EventForm
      aria-label={`Editar amortização de ${formatDate(prepayment.date)}`}
      failure={
        edit.isError && errors.size === 0
          ? "Não foi possível salvar a amortização extraordinária."
          : null
      }
      onSubmit={submit}
    >
      <PrepaymentFields values={values} onChange={setValues} errors={errors} />
      <Button type="submit" disabled={edit.isPending}>
        Salvar
      </Button>
      <Button type="button" variant="outline" onClick={onClose}>
        Cancelar
      </Button>
    </EventForm>
  );
}

interface PrepaymentRowProps {
  prepayment: Prepayment;
  onDelete: () => void;
}

function PrepaymentRow({ prepayment, onDelete }: PrepaymentRowProps) {
  const [editing, setEditing] = useState(false);
  const when = formatDate(prepayment.date);

  if (editing) {
    return (
      <TableRow>
        <TableCell colSpan={4}>
          <EditPrepaymentForm prepayment={prepayment} onClose={() => setEditing(false)} />
        </TableCell>
      </TableRow>
    );
  }
  return (
    <TableRow>
      <TableCell>{when}</TableCell>
      <TableCell>{formatMoney(prepayment.amount)}</TableCell>
      <TableCell>{effectLabels[prepayment.effect]}</TableCell>
      <TableCell>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            aria-label={`Editar amortização de ${when}`}
            onClick={() => setEditing(true)}
          >
            Editar
          </Button>
          <DeleteEventDialog
            aria-label={`Excluir amortização de ${when}`}
            title="Excluir amortização extraordinária?"
            description={`A amortização de ${when} será removida e a evolução do financiamento será recalculada sem ela.`}
            onConfirm={onDelete}
          />
        </div>
      </TableCell>
    </TableRow>
  );
}

function PrepaymentList() {
  const { data, isPending, isError } = usePrepayments();
  const remove = useDeletePrepayment();

  if (isPending) return <p>Carregando amortizações extraordinárias…</p>;
  if (isError) return <p>Não foi possível carregar as amortizações extraordinárias.</p>;
  if (data.prepayments.length === 0) return <p>Nenhuma amortização extraordinária registrada.</p>;
  return (
    <>
      {remove.isError && (
        <Alert variant="destructive">
          <AlertDescription>
            Não foi possível excluir a amortização extraordinária.
          </AlertDescription>
        </Alert>
      )}
      <Table aria-label="Amortizações extraordinárias registradas">
        <TableHeader>
          <TableRow>
            <TableHead>Data</TableHead>
            <TableHead>Valor</TableHead>
            <TableHead>Efeito</TableHead>
            <TableHead className="sr-only">Ações</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.prepayments.map((prepayment) => (
            <PrepaymentRow
              key={prepayment.id}
              prepayment={prepayment}
              onDelete={() => remove.mutate(prepayment.id)}
            />
          ))}
        </TableBody>
      </Table>
    </>
  );
}

export function Prepayments() {
  return (
    <Section heading="Amortizações extraordinárias">
      <div className="flex flex-col gap-4">
        <PrepaymentList />
        <NewPrepaymentForm />
      </div>
    </Section>
  );
}
