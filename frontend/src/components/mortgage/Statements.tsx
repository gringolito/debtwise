import { type FormEvent, useState } from "react";
import { DeleteEventDialog } from "@/components/mortgage/DeleteEventDialog";
import { EventForm } from "@/components/mortgage/EventForm";
import { TextField } from "@/components/mortgage/FormControls";
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
import type { StatementDrift } from "@/lib/api";
import { formatDate, formatMoney } from "@/lib/format";
import {
  blankStatement,
  type StatementValues,
  statementErrors,
  statementInput,
  valuesFromStatement,
} from "@/lib/mortgageEvents";
import {
  useAddStatement,
  useDeleteStatement,
  useEditStatement,
  useStatements,
} from "@/lib/mortgageQueries";

interface StatementFieldsProps {
  values: StatementValues;
  onChange: (values: StatementValues) => void;
  errors: Map<string, string>;
}

function StatementFields({ values, onChange, errors }: StatementFieldsProps) {
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
        label="Saldo informado"
        inputMode="decimal"
        value={values.outstandingBalance}
        onChange={(outstandingBalance) => onChange({ ...values, outstandingBalance })}
        invalid={errors.has("outstanding_balance")}
        message={errors.get("outstanding_balance")}
      />
    </>
  );
}

function NewStatementForm() {
  const [values, setValues] = useState(blankStatement);
  const add = useAddStatement();
  const errors = statementErrors(add.error);

  function submit(event: FormEvent) {
    event.preventDefault();
    add.mutate(statementInput(values), { onSuccess: () => setValues(blankStatement) });
  }

  return (
    <EventForm
      aria-label="Registrar extrato"
      failure={add.isError && errors.size === 0 ? "Não foi possível registrar o extrato." : null}
      onSubmit={submit}
    >
      <StatementFields values={values} onChange={setValues} errors={errors} />
      <Button type="submit" disabled={add.isPending}>
        Registrar
      </Button>
    </EventForm>
  );
}

function EditStatementForm({
  statement,
  onClose,
}: {
  statement: StatementDrift;
  onClose: () => void;
}) {
  const [values, setValues] = useState(() => valuesFromStatement(statement));
  const edit = useEditStatement();
  const errors = statementErrors(edit.error);

  function submit(event: FormEvent) {
    event.preventDefault();
    edit.mutate({ id: statement.id, input: statementInput(values) }, { onSuccess: onClose });
  }

  return (
    <EventForm
      aria-label={`Editar extrato de ${formatDate(statement.date)}`}
      failure={edit.isError && errors.size === 0 ? "Não foi possível salvar o extrato." : null}
      onSubmit={submit}
    >
      <StatementFields values={values} onChange={setValues} errors={errors} />
      <Button type="submit" disabled={edit.isPending}>
        Salvar
      </Button>
      <Button type="button" variant="outline" onClick={onClose}>
        Cancelar
      </Button>
    </EventForm>
  );
}

interface StatementRowProps {
  statement: StatementDrift;
  onDelete: () => void;
}

function StatementRow({ statement, onDelete }: StatementRowProps) {
  const [editing, setEditing] = useState(false);
  const when = formatDate(statement.date);

  if (editing) {
    return (
      <TableRow>
        <TableCell colSpan={5}>
          <EditStatementForm statement={statement} onClose={() => setEditing(false)} />
        </TableCell>
      </TableRow>
    );
  }
  return (
    <TableRow>
      <TableCell>{when}</TableCell>
      <TableCell>{formatMoney(statement.outstanding_balance)}</TableCell>
      <TableCell>{formatMoney(statement.computed_balance)}</TableCell>
      <TableCell>{formatMoney(statement.drift)}</TableCell>
      <TableCell>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            aria-label={`Editar extrato de ${when}`}
            onClick={() => setEditing(true)}
          >
            Editar
          </Button>
          <DeleteEventDialog
            aria-label={`Excluir extrato de ${when}`}
            title="Excluir extrato?"
            description={`O extrato de ${when} será removido e a evolução do financiamento voltará a seguir o saldo calculado.`}
            onConfirm={onDelete}
          />
        </div>
      </TableCell>
    </TableRow>
  );
}

function StatementList() {
  const { data, isPending, isError } = useStatements();
  const remove = useDeleteStatement();

  if (isPending) return <p>Carregando extratos…</p>;
  if (isError) return <p>Não foi possível carregar os extratos.</p>;
  if (data.statements.length === 0) return <p>Nenhum extrato registrado.</p>;
  return (
    <>
      {remove.isError && (
        <Alert variant="destructive">
          <AlertDescription>Não foi possível excluir o extrato.</AlertDescription>
        </Alert>
      )}
      <Table aria-label="Extratos registrados">
        <TableHeader>
          <TableRow>
            <TableHead>Data</TableHead>
            <TableHead>Saldo informado</TableHead>
            <TableHead>Saldo calculado</TableHead>
            <TableHead>Diferença</TableHead>
            <TableHead className="sr-only">Ações</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.statements.map((statement) => (
            <StatementRow
              key={statement.id}
              statement={statement}
              onDelete={() => remove.mutate(statement.id)}
            />
          ))}
        </TableBody>
      </Table>
    </>
  );
}

export function Statements() {
  return (
    <Section heading="Extratos">
      <div className="flex flex-col gap-4">
        <StatementList />
        <NewStatementForm />
      </div>
    </Section>
  );
}
