import type { RegisteredMortgage, Schedule } from "@/lib/api";
import { latestDue, nextDue, sharePaid } from "@/lib/dashboard";
import { formatDayMonth, formatMoney, formatMonthYear } from "@/lib/format";
import {
  SummaryBody,
  SummaryFigure,
  SummaryLink,
  SummaryPanel,
} from "@/pages/dashboard/SummaryPanel";

interface MortgagePanelProps {
  mortgage: RegisteredMortgage;
  schedule: Schedule;
  today: string;
}

/** MortgagePanel is what is owed today, when the schedule pays it off and what falls due next. */
export function MortgagePanel({ mortgage, schedule: { installments }, today }: MortgagePanelProps) {
  const due = latestDue(installments, today);
  const next = nextDue(installments, today);
  const last = installments.at(-1);
  // Before the first installment the amount financed is owed; with none left, nothing is.
  const balance = due?.outstanding_balance ?? (next ? mortgage.original_amount : "0.00");
  const paid = sharePaid(mortgage.original_amount, balance);

  return (
    <SummaryPanel title="Financiamento">
      <SummaryBody>
        <SummaryFigure label="Saldo devedor" figure={formatMoney(balance)} />
        {last && (
          <p className="text-callout text-muted-foreground">
            Quitação prevista em {formatMonthYear(last.due_date)}
          </p>
        )}
        <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-border" aria-hidden="true">
          <div
            className="h-full w-(--paid) rounded-full bg-accent-mark"
            style={{ "--paid": `${paid}%` } as React.CSSProperties}
          />
        </div>
        <p className="mt-1 text-footnote text-muted-foreground">{paid}% pago</p>
      </SummaryBody>
      <SummaryLink to="/financiamento">
        {next
          ? `Próxima prestação · ${formatDayMonth(next.due_date)} · ${formatMoney(next.amount)}`
          : "Ver prestações"}
      </SummaryLink>
    </SummaryPanel>
  );
}
