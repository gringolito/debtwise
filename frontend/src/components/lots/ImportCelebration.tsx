import {
  Celebration,
  CelebrationFact,
  CelebrationFacts,
  CelebrationFigure,
  CelebrationMark,
  CelebrationNote,
  CelebrationTitle,
} from "@/components/patterns/Celebration";
import type { LotImported } from "@/lib/api";
import { formatMoney } from "@/lib/format";

/**
 * ImportCelebration opens once an import is recorded: how many purchases it brought in, the net
 * they pay at maturity, for those that have values, and what they cost together.
 */
export function ImportCelebration({
  imported: { lots, invested, maturity_net, without_values },
  onClose,
}: {
  imported: LotImported;
  onClose: () => void;
}) {
  const title = lots.length === 1 ? "1 compra importada!" : `${lots.length} compras importadas!`;
  const leftOut =
    without_values === 1
      ? "1 compra aguardando o IPCA ficou fora da projeção."
      : `${without_values} compras aguardando o IPCA ficaram fora da projeção.`;

  if (maturity_net === undefined) {
    return (
      <Celebration onClose={onClose}>
        <CelebrationTitle>{title}</CelebrationTitle>
        <CelebrationFigure lead="Você investiu" gain={false}>
          {formatMoney(invested)}
        </CelebrationFigure>
        <CelebrationNote>{leftOut}</CelebrationNote>
      </Celebration>
    );
  }

  const valued = lots.length - without_values;
  return (
    <Celebration footnote="* Baseado na projeção atual." onClose={onClose}>
      <CelebrationTitle>{title}</CelebrationTitle>
      <CelebrationFigure
        lead="Você vai receber"
        unit={valued === 1 ? "líquidos, no vencimento" : "líquidos, nos vencimentos"}
        gain={false}
      >
        {formatMoney(maturity_net)}
        <CelebrationMark>*</CelebrationMark>
      </CelebrationFigure>
      <CelebrationFacts>
        <CelebrationFact name="Valor investido">{formatMoney(invested)}</CelebrationFact>
      </CelebrationFacts>
      {without_values > 0 && <CelebrationNote>{leftOut}</CelebrationNote>}
    </Celebration>
  );
}
