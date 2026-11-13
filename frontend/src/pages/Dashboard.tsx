import { useState } from "react";
import { Page, PageHeader, PageTitle } from "@/components/layout/Page";
import { ErrorPanel } from "@/components/patterns/ErrorPanel";
import type { DecisionInput } from "@/lib/api";
import { recentActivity, today } from "@/lib/dashboard";
import { useDecision } from "@/lib/decisionQueries";
import { formatWeekday } from "@/lib/format";
import { useLots } from "@/lib/lotQueries";
import {
  useMortgage,
  useMortgageSchedule,
  usePrepayments,
  useStatements,
} from "@/lib/mortgageQueries";
import { AnswerCard } from "@/pages/dashboard/AnswerCard";
import { DashboardSkeleton } from "@/pages/dashboard/DashboardSkeleton";
import { InvestmentsPanel } from "@/pages/dashboard/InvestmentsPanel";
import { MortgagePanel } from "@/pages/dashboard/MortgagePanel";
import { NextSteps } from "@/pages/dashboard/NextSteps";
import { RecentActivity } from "@/pages/dashboard/RecentActivity";

/** The amount Início answers "amortizar ou investir?" for, prepaid to shorten the term today. */
const ANSWERED: DecisionInput = { amount: "10000.00", effect: "shorten_term" };

const RECENT_ACTIVITY = 3;

function Content() {
  const mortgage = useMortgage();
  const schedule = useMortgageSchedule();
  const statements = useStatements();
  const prepayments = usePrepayments();
  const lots = useLots();
  const decision = useDecision(ANSWERED);
  const queries = [mortgage, schedule, statements, prepayments, lots, decision];

  const failed = queries.filter((query) => query.isError);
  if (failed.length > 0) {
    return (
      <ErrorPanel
        title="Não foi possível carregar o início"
        onRetry={() => {
          for (const query of failed) void query.refetch();
        }}
      />
    );
  }
  if (
    !mortgage.isSuccess ||
    !schedule.isSuccess ||
    !statements.isSuccess ||
    !prepayments.isSuccess ||
    !lots.isSuccess ||
    !decision.isSuccess
  ) {
    return <DashboardSkeleton />;
  }

  const date = today();
  return (
    <>
      <div className="flex flex-col gap-6">
        <AnswerCard decision={decision.data} />
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          {mortgage.data && (
            <MortgagePanel mortgage={mortgage.data} schedule={schedule.data} today={date} />
          )}
          <InvestmentsPanel lots={lots.data} today={date} />
        </div>
      </div>
      <NextSteps
        steps={[
          {
            label: "Configurar o financiamento",
            done: mortgage.data !== null,
            to: "/financiamento/editar",
          },
          {
            label: "Registrar o último extrato do banco",
            done: statements.data.statements.length > 0,
            to: "/financiamento",
          },
          {
            label: "Adicionar suas compras do Tesouro",
            done: lots.data.lots.length > 0,
            to: "/investimentos",
          },
        ]}
      />
      <RecentActivity
        activity={recentActivity(
          statements.data.statements,
          prepayments.data.prepayments,
          RECENT_ACTIVITY,
        )}
      />
    </>
  );
}

/** Dashboard is Início: the answer to "amortizar ou investir?" and where the owner stands. */
export function Dashboard() {
  const [now] = useState(() => new Date());
  return (
    <Page>
      <PageHeader className="flex-col items-start gap-1">
        <PageTitle>Início</PageTitle>
        <p className="text-callout text-muted-foreground">{formatWeekday(now)}</p>
      </PageHeader>
      <Content />
    </Page>
  );
}
