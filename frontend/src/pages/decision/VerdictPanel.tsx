import { useId } from "react";
import type { Scenario } from "@/lib/api";
import { today } from "@/lib/dashboard";
import { type ComparedVerdict, favoured, verdictTitle } from "@/lib/decisions";
import { formatDate, formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  advantageAmount,
  advantageShare,
  horizon,
  standing,
  verdictHeadline,
} from "@/lib/yardstick";

interface OutcomeProps {
  title: string;
  subtitle: string;
  scenario: Scenario;
  /** The option that ends with more, which the panel marks. */
  leading: boolean;
}

/** Outcome is one option read at the horizon: what the owner owes or has, and the two parts of it. */
function Outcome({ title, subtitle, scenario, leading }: OutcomeProps) {
  const id = useId();
  const { owes, amount } = standing(scenario);
  return (
    <section
      aria-labelledby={id}
      className={cn(
        "flex flex-col gap-4 rounded-lg border p-5",
        leading ? "border-accent-mark bg-accent-tint/50" : "bg-card",
      )}
    >
      <div>
        <h3 id={id} className="text-headline">
          {title}
        </h3>
        <p className="text-footnote text-muted-foreground">{subtitle}</p>
      </div>
      <div>
        <p className="text-callout text-muted-foreground">
          {owes ? "No fim, você deve" : "No fim, você tem"}
        </p>
        <p className="text-large-title font-semibold tabular-nums">{amount}</p>
      </div>
      <dl className="flex flex-col gap-1 border-t pt-3 text-footnote text-muted-foreground">
        <div className="flex justify-between gap-3">
          <dt>Saldo devedor</dt>
          <dd className="tabular-nums">{formatMoney(scenario.outstanding_balance)}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt>Dinheiro do título, líquido</dt>
          <dd className="tabular-nums">
            {scenario.bond ? formatMoney(scenario.bond.net) : "Nenhum"}
          </dd>
        </div>
      </dl>
    </section>
  );
}

interface VerdictPanelProps {
  verdict: ComparedVerdict;
  /** What the decision compares, in reais. */
  amount: string;
  /** The date the decision is for, ISO: the amount reads "hoje" on today's. */
  date: string;
}

/**
 * VerdictPanel states a compared verdict as a ledger: where the money is on the horizon if the
 * owner prepays and if they invest in the bond, side by side, and by how much the better one ends
 * above the other. A near tie or an exact tie marks neither.
 */
export function VerdictPanel({ verdict, amount, date }: VerdictPanelProps) {
  const titleId = useId();
  const side = favoured(verdict.advantage);
  const marked = verdict.near_tie ? "even" : side;
  const when = date === today() ? "hoje" : `em ${formatDate(date)}`;
  return (
    <section aria-labelledby={titleId} className="flex flex-col gap-6 rounded-lg glass p-5 sm:p-8">
      <div className="flex flex-col gap-1">
        <h2 id={titleId} className="text-title-2">
          {verdictHeadline(verdict)}
        </h2>
        <p className="text-callout text-muted-foreground">
          {`Onde está o dinheiro em ${formatDate(verdict.maturity)}, em cada opção.`}
        </p>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Outcome
          title="Se amortizar"
          subtitle={`${formatMoney(amount)} ${when}`}
          scenario={verdict.prepay}
          leading={marked === "prepay"}
        />
        <Outcome
          title="Se investir"
          subtitle={verdictTitle(verdict)}
          scenario={verdict.invest}
          leading={marked === "invest"}
        />
      </div>
      <div className="flex flex-col gap-1 border-t pt-5">
        {side === "even" ? (
          <p className="text-title-2">As duas opções terminam iguais.</p>
        ) : (
          <>
            <p className="text-title-2">
              {`${side === "invest" ? "Investir" : "Amortizar"} termina com ${advantageAmount(verdict)} a mais`}
            </p>
            <p className="text-callout text-muted-foreground">
              {`${advantageShare(verdict)} dos ${formatMoney(amount)} em ${horizon(verdict)}.${verdict.near_tie ? " Na prática, um empate." : ""}`}
            </p>
          </>
        )}
      </div>
    </section>
  );
}
