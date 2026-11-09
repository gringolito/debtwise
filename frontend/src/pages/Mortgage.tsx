import { getRouteApi, Link } from "@tanstack/react-router";
import { PlusIcon } from "lucide-react";
import { useState } from "react";
import { Page, PageHeader, PageTitle } from "@/components/layout/Page";
import { InstallmentsTable } from "@/components/mortgage/InstallmentsTable";
import {
  type PrepaymentChange,
  PrepaymentFeedback,
} from "@/components/mortgage/PrepaymentFeedback";
import { PrepaymentSheet } from "@/components/mortgage/PrepaymentSheet";
import { Prepayments } from "@/components/mortgage/Prepayments";
import { ScheduleChart } from "@/components/mortgage/ScheduleChart";
import { StatementSheet } from "@/components/mortgage/StatementSheet";
import { Statements } from "@/components/mortgage/Statements";
import { KeyFigure, KeyFigures } from "@/components/mortgage/KeyFigures";
import { ErrorPanel } from "@/components/patterns/ErrorPanel";
import { Loading } from "@/components/patterns/Loading";
import { SegmentedControl, SegmentedControlItem } from "@/components/patterns/SegmentedControl";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { PrepaymentOutcome, RegisteredMortgage, Schedule, StatementDrift } from "@/lib/api";
import { latestDue, nextDue, today } from "@/lib/dashboard";
import { formatMoney, formatMonthYear } from "@/lib/format";
import { useMortgage, useMortgageSchedule } from "@/lib/mortgageQueries";
import type { MortgageSearch } from "@/router";

const route = getRouteApi("/shell/financiamento");

type Tab = NonNullable<MortgageSearch["secao"]> | "prestacoes";

// A prepayment sheet keeps the schedule it opened over, which its feedback compares with.
type Sheet =
  | { kind: "prepayment"; prepayment?: PrepaymentOutcome; schedule: Schedule }
  | { kind: "statement"; statement?: StatementDrift };

type Feedback = { change: PrepaymentChange; before: Schedule };

function MortgageSkeleton() {
  return (
    <Loading label="Carregando financiamento">
      <Skeleton className="h-28" />
      <Skeleton className="h-80" />
      <Skeleton className="h-96" />
    </Loading>
  );
}

function MortgageDetails({
  mortgage,
  schedule,
}: {
  mortgage: RegisteredMortgage;
  schedule: Schedule;
}) {
  const tab: Tab = route.useSearch().secao ?? "prestacoes";
  const navigate = route.useNavigate();
  const setTab = (secao: Tab) =>
    navigate({ search: secao === "prestacoes" ? {} : { secao }, replace: true });
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const date = today();
  const { installments } = schedule;
  const current = nextDue(installments, date);
  const payoff = installments.at(-1);
  // Before the first installment the amount financed is owed; with none left, nothing is.
  const balance =
    latestDue(installments, date)?.outstanding_balance ??
    (current ? mortgage.original_amount : "0.00");

  return (
    <>
      <KeyFigures>
        <KeyFigure name="Saldo devedor">{formatMoney(balance)}</KeyFigure>
        <KeyFigure name="Prestação atual">{current ? formatMoney(current.amount) : "—"}</KeyFigure>
        <KeyFigure name="Quitação prevista">
          {payoff ? formatMonthYear(payoff.due_date) : "—"}
        </KeyFigure>
      </KeyFigures>
      <ScheduleChart
        installments={schedule.installments}
        contractDate={mortgage.contract_date}
        originalAmount={mortgage.original_amount}
        today={date}
      />
      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between gap-4">
          <SegmentedControl value={tab} onValueChange={setTab} aria-label="Seção">
            <SegmentedControlItem value="prestacoes">Prestações</SegmentedControlItem>
            <SegmentedControlItem value="amortizacoes">Amortizações</SegmentedControlItem>
            <SegmentedControlItem value="extratos">Extratos</SegmentedControlItem>
          </SegmentedControl>
          {tab === "extratos" ? (
            <Button onClick={() => setSheet({ kind: "statement" })}>
              <PlusIcon aria-hidden="true" />
              Registrar extrato
            </Button>
          ) : (
            <Button onClick={() => setSheet({ kind: "prepayment", schedule })}>
              <PlusIcon aria-hidden="true" />
              Registrar amortização
            </Button>
          )}
        </div>
        {tab === "prestacoes" && (
          <InstallmentsTable installments={schedule.installments} current={current} />
        )}
        {tab === "amortizacoes" && (
          <Prepayments
            onEdit={(prepayment) => setSheet({ kind: "prepayment", prepayment, schedule })}
          />
        )}
        {tab === "extratos" && (
          <Statements onEdit={(statement) => setSheet({ kind: "statement", statement })} />
        )}
      </div>
      {sheet?.kind === "prepayment" && (
        <PrepaymentSheet
          prepayment={sheet.prepayment}
          onClose={() => setSheet(null)}
          onSaved={(change) => {
            setSheet(null);
            setFeedback({ change, before: sheet.schedule });
          }}
        />
      )}
      {feedback && (
        <PrepaymentFeedback
          change={feedback.change}
          before={feedback.before}
          onClose={() => setFeedback(null)}
        />
      )}
      {sheet?.kind === "statement" && (
        <StatementSheet statement={sheet.statement} onClose={() => setSheet(null)} />
      )}
    </>
  );
}

function MortgageContent({ mortgage }: { mortgage: RegisteredMortgage }) {
  const schedule = useMortgageSchedule();

  if (schedule.isError) {
    return (
      <ErrorPanel
        title="Não foi possível carregar seu financiamento"
        onRetry={() => void schedule.refetch()}
      />
    );
  }
  if (schedule.isPending) return <MortgageSkeleton />;
  return <MortgageDetails mortgage={mortgage} schedule={schedule.data} />;
}

// The gate on the shell opens this page only once the mortgage is loaded and registered.
export function Mortgage() {
  const { data } = useMortgage();
  if (!data) return null;
  return (
    <Page>
      <PageHeader>
        <PageTitle>Financiamento</PageTitle>
        <Button asChild variant="link" size="inline">
          <Link to="/financiamento/editar">Editar contrato</Link>
        </Button>
      </PageHeader>
      <MortgageContent mortgage={data} />
    </Page>
  );
}
