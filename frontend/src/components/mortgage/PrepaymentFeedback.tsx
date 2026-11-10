import { KeyRoundIcon } from "lucide-react";
import {
  Celebration,
  CelebrationChange,
  CelebrationFact,
  CelebrationFacts,
  CelebrationFigure,
  CelebrationNote,
  CelebrationTitle,
} from "@/components/patterns/Celebration";
import type {
  Prepayment,
  PrepaymentList,
  PrepaymentOutcome,
  Schedule,
  ScheduledInstallment,
} from "@/lib/api";
import { nextDue, today } from "@/lib/dashboard";
import { formatDuration, formatMoney, formatMonthYear } from "@/lib/format";
import { useMortgageSchedule, usePrepayments } from "@/lib/mortgageQueries";

/** What the prepayment sheet saved: a new prepayment, an edit of one, or its deletion. */
export type PrepaymentChange =
  | { kind: "recorded"; prepayment: Prepayment }
  | { kind: "edited"; prepayment: Prepayment; replaced: PrepaymentOutcome }
  | { kind: "deleted" };

interface FeedbackProps {
  list: PrepaymentList;
  before: Schedule;
  after: Schedule;
  onClose: () => void;
}

const payoffOf = (schedule: Schedule) => schedule.installments.at(-1)?.due_date;

function InstallmentChange({ before, after }: { before: Schedule; after: ScheduledInstallment }) {
  const was = before.installments.find((installment) => installment.number === after.number);
  if (!was) return formatMoney(after.amount);
  return <CelebrationChange from={formatMoney(was.amount)} to={formatMoney(after.amount)} />;
}

function PayoffChange({ before, after }: { before: Schedule; after: Schedule }) {
  const was = payoffOf(before);
  const is = payoffOf(after);
  if (!is) return "—";
  if (!was || was === is) return formatMonthYear(is);
  return <CelebrationChange from={formatMonthYear(was)} to={formatMonthYear(is)} />;
}

function Recorded({
  prepayment,
  list,
  before,
  after,
  onClose,
}: FeedbackProps & { prepayment: Prepayment }) {
  const outcome = list.prepayments.find((recorded) => recorded.id === prepayment.id);
  if (!outcome) return null;
  const next = nextDue(after.installments, outcome.date);
  const paidOff = !next && nextDue(before.installments, outcome.date) !== undefined;
  const payoff = payoffOf(after);
  const saved = (
    <CelebrationFigure lead="Na projeção atual, ela economiza" unit="em juros, seguros e taxas">
      {formatMoney(outcome.money_saved)}
    </CelebrationFigure>
  );
  const shortened = outcome.months_shortened > 0 && (
    <CelebrationFact name="Prazo reduzido">
      {formatDuration(outcome.months_shortened)}
    </CelebrationFact>
  );

  if (paidOff) {
    return (
      <Celebration variant="milestone" onClose={onClose}>
        <CelebrationTitle icon={KeyRoundIcon}>Financiamento quitado!</CelebrationTitle>
        {saved}
        {shortened && <CelebrationFacts>{shortened}</CelebrationFacts>}
      </Celebration>
    );
  }
  const facts =
    outcome.effect === "shorten_term" ? (
      <>
        {shortened}
        {payoff && (
          <CelebrationFact name="Quitação prevista">{formatMonthYear(payoff)}</CelebrationFact>
        )}
      </>
    ) : (
      next && (
        <CelebrationFact name="Prestação">
          <InstallmentChange before={before} after={next} />
        </CelebrationFact>
      )
    );
  return (
    <Celebration onClose={onClose}>
      <CelebrationTitle>Amortização registrada!</CelebrationTitle>
      {saved}
      {facts && <CelebrationFacts>{facts}</CelebrationFacts>}
    </Celebration>
  );
}

function Edited({
  prepayment,
  replaced,
  list,
  before,
  after,
  onClose,
}: FeedbackProps & { prepayment: Prepayment; replaced: PrepaymentOutcome }) {
  const outcome = list.prepayments.find((recorded) => recorded.id === prepayment.id);
  if (!outcome) return null;
  const next = nextDue(after.installments, outcome.date);
  return (
    <Celebration variant="notice" onClose={onClose}>
      <CelebrationTitle>Amortização atualizada</CelebrationTitle>
      <CelebrationNote>Na projeção atual, o financiamento fica assim:</CelebrationNote>
      <CelebrationFacts>
        {outcome.effect === "lower_installment" && next ? (
          <CelebrationFact name="Prestação">
            <InstallmentChange before={before} after={next} />
          </CelebrationFact>
        ) : (
          <CelebrationFact name="Quitação prevista">
            <PayoffChange before={before} after={after} />
          </CelebrationFact>
        )}
        <CelebrationFact name="Economia">
          <CelebrationChange
            from={formatMoney(replaced.money_saved)}
            to={formatMoney(outcome.money_saved)}
          />
        </CelebrationFact>
      </CelebrationFacts>
    </Celebration>
  );
}

function Deleted({ list, after, onClose }: FeedbackProps) {
  const payoff = payoffOf(after);
  const current = nextDue(after.installments, today());
  return (
    <Celebration variant="notice" onClose={onClose}>
      <CelebrationTitle>Amortização excluída</CelebrationTitle>
      <CelebrationNote>Na projeção atual, o financiamento fica assim:</CelebrationNote>
      <CelebrationFacts>
        <CelebrationFact name="Quitação prevista">
          {payoff ? formatMonthYear(payoff) : "—"}
        </CelebrationFact>
        <CelebrationFact name="Prestação atual">
          {current ? formatMoney(current.amount) : "—"}
        </CelebrationFact>
        <CelebrationFact name="Economia com amortizações">
          {formatMoney(list.money_saved)}
        </CelebrationFact>
      </CelebrationFacts>
    </Celebration>
  );
}

interface PrepaymentFeedbackProps {
  change: PrepaymentChange;
  /** The schedule as it was before the change. */
  before: Schedule;
  onClose: () => void;
}

/**
 * PrepaymentFeedback opens once a prepayment change is saved: a celebration of what a new
 * prepayment saves, or a notice of where an edit or a deletion leaves the mortgage.
 */
export function PrepaymentFeedback({ change, before, onClose }: PrepaymentFeedbackProps) {
  const list = usePrepayments();
  const schedule = useMortgageSchedule();
  if (!list.data || !schedule.data) return null;

  const props = { list: list.data, before, after: schedule.data, onClose };
  switch (change.kind) {
    case "recorded":
      return <Recorded prepayment={change.prepayment} {...props} />;
    case "edited":
      return <Edited prepayment={change.prepayment} replaced={change.replaced} {...props} />;
    case "deleted":
      return <Deleted {...props} />;
  }
}
