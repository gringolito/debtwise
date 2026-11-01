import { Link } from "@tanstack/react-router";
import { Section } from "@/components/mortgage/Section";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ApiError } from "@/lib/api";
import { latestDue, today } from "@/lib/dashboard";
import { formatDate, formatMoney } from "@/lib/format";
import { useMortgageSchedule } from "@/lib/mortgageQueries";
import { Figure, Figures } from "@/pages/dashboard/Figures";

function Position() {
  const { data, error, isPending } = useMortgageSchedule();

  if (isPending) return <p>Carregando financiamento…</p>;
  if (error instanceof ApiError && error.status === 404) {
    return (
      <p className="text-muted-foreground">
        Nenhum financiamento cadastrado.{" "}
        <Link to="/financiamento/editar">Cadastrar financiamento</Link>.
      </p>
    );
  }
  if (error) {
    return (
      <Alert variant="destructive">
        <AlertDescription>Não foi possível carregar o financiamento.</AlertDescription>
      </Alert>
    );
  }

  const due = latestDue(data.installments, today());
  const last = data.installments.at(-1);
  return (
    <Figures>
      <Figure name="Saldo devedor">
        {due
          ? `${formatMoney(due.outstanding_balance)} após a parcela ${due.number}, de ${formatDate(due.due_date)}`
          : "Nenhuma parcela venceu ainda."}
      </Figure>
      {last && <Figure name="Quitação prevista">{formatDate(last.due_date)}</Figure>}
    </Figures>
  );
}

/** MortgagePosition is what is owed today and when the schedule pays it off. */
export function MortgagePosition() {
  return (
    <Section heading="Financiamento">
      <Position />
    </Section>
  );
}
