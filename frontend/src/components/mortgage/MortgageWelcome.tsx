import {
  Celebration,
  CelebrationFact,
  CelebrationFacts,
  CelebrationNote,
  CelebrationTitle,
} from "@/components/patterns/Celebration";
import { formatMonthYear } from "@/lib/format";
import { useMortgageSchedule } from "@/lib/mortgageQueries";

/**
 * MortgageWelcome opens once the onboarding registers the mortgage: when the mortgage, as
 * registered, is paid off, and what to record next.
 */
export function MortgageWelcome({ onClose }: { onClose: () => void }) {
  const schedule = useMortgageSchedule();
  if (!schedule.data) return null;

  const payoff = schedule.data.installments.at(-1)?.due_date;
  return (
    <Celebration onClose={onClose}>
      <CelebrationTitle>Financiamento configurado!</CelebrationTitle>
      <CelebrationFacts>
        <CelebrationFact name="Quitação prevista">
          {payoff ? formatMonthYear(payoff) : "—"}
        </CelebrationFact>
      </CelebrationFacts>
      <CelebrationNote>Próximo passo: registre uma amortização ou um investimento.</CelebrationNote>
    </Celebration>
  );
}
