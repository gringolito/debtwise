import {
  Celebration,
  CelebrationChange,
  CelebrationFact,
  CelebrationFacts,
  CelebrationFigure,
  CelebrationMark,
  CelebrationNote,
  CelebrationTitle,
} from "@/components/patterns/Celebration";
import type { Lot, LotComparison } from "@/lib/api";
import { compareDecimals } from "@/lib/decimals";
import { favoured } from "@/lib/decisions";
import { formatDate, formatMoney } from "@/lib/format";
import { useLotComparison } from "@/lib/lotQueries";

/** What the lot sheet saved: a new lot, or an edit of one. */
export type LotChange =
  | { kind: "recorded"; lot: Lot }
  | { kind: "edited"; lot: Lot; replaced: Lot };

const projection = "* Baseado na projeção atual.";

/** projected reports whether the lot's Maturity Value, and the gain from it, read a projection. */
const projected = (c: LotComparison) => (c.maturity?.projected_by.length ?? 0) > 0;

/** advantageProjected reports whether the comparison's advantage read a projection. */
const advantageProjected = (c: LotComparison) =>
  c.advantage !== undefined && c.projected_by.length > 0;

/** Mark is the asterisk beside a figure in a sentence, which the footnote explains. */
function Mark({ shown }: { shown: boolean }) {
  return shown && <span className="text-muted-foreground">*</span>;
}

/**
 * label marks a row's name rather than its figure, so the figures keep their right edge and a
 * before → after keeps its width.
 */
const label = (name: string, marked: boolean) => (marked ? `${name}*` : name);

/** ComparisonNote says how the lot compares with prepaying what it cost with shorten_term. */
function ComparisonNote({ comparison }: { comparison: LotComparison }) {
  const { advantage, horizon } = comparison;
  if (advantage === undefined) return null;
  const until = formatDate(horizon);
  const amount = (
    <>
      {formatMoney(advantage.replace("-", ""))}
      <Mark shown={advantageProjected(comparison)} />
    </>
  );
  switch (favoured(advantage)) {
    case "invest":
      return (
        <CelebrationNote>
          Você fica com {amount} a mais do que se amortizasse reduzindo o prazo, até {until}.
        </CelebrationNote>
      );
    case "prepay":
      return (
        <CelebrationNote>
          Amortizar reduzindo o prazo renderia {amount} a mais até {until}.
        </CelebrationNote>
      );
    case "even":
      return (
        <CelebrationNote>
          Investir e amortizar reduzindo o prazo dão o mesmo resultado até {until}.
        </CelebrationNote>
      );
  }
}

function Recorded({ comparison, onClose }: { comparison?: LotComparison; onClose: () => void }) {
  const title = <CelebrationTitle>Compra registrada!</CelebrationTitle>;
  if (!comparison) {
    return <Celebration onClose={onClose}>{title}</Celebration>;
  }
  const { amount_invested: invested, maturity, gain } = comparison;
  const marked = projected(comparison);
  const footnote = marked || advantageProjected(comparison) ? projection : undefined;
  return (
    <Celebration footnote={footnote} onClose={onClose}>
      {title}
      {maturity && gain && compareDecimals(gain, "0") > 0 && (
        <CelebrationFigure
          lead="Você vai ganhar"
          unit={`até ${formatDate(comparison.horizon)}, já descontados impostos e custódia`}
        >
          {formatMoney(gain)}
          {marked && <CelebrationMark>*</CelebrationMark>}
        </CelebrationFigure>
      )}
      <CelebrationFacts>
        <CelebrationFact name="Valor investido">{formatMoney(invested)}</CelebrationFact>
        {maturity && (
          <CelebrationFact name={label("Líquido no vencimento", marked)}>
            {formatMoney(maturity.net)}
          </CelebrationFact>
        )}
      </CelebrationFacts>
      <ComparisonNote comparison={comparison} />
    </Celebration>
  );
}

const netOf = (c: LotComparison) => (c.maturity ? formatMoney(c.maturity.net) : "—");

const amountOf = (advantage: string) => formatMoney(advantage.replace("-", ""));

/**
 * advantageRow writes the advantage over prepaying before and after an edit without a sign: an
 * advantage while investing wins on both sides, a disadvantage while prepaying does, and which way
 * each side goes when the edit turned the comparison around.
 */
function advantageRow(before?: string, after?: string) {
  const sides = [before, after].filter((side) => side !== undefined);
  const wins = new Set(sides.map(favoured).filter((side) => side !== "even"));
  if (!wins.has("prepay")) {
    const value = (side?: string) => (side === undefined ? "—" : amountOf(side));
    return { name: "Vantagem sobre amortizar", from: value(before), to: value(after) };
  }
  if (!wins.has("invest")) {
    const value = (side?: string) =>
      side === undefined ? "—" : favoured(side) === "even" ? "Nenhuma" : amountOf(side);
    return { name: "Desvantagem sobre amortizar", from: value(before), to: value(after) };
  }
  const value = (side?: string) => {
    if (side === undefined) return "—";
    const amount = amountOf(side);
    return favoured(side) === "invest" ? `${amount} a mais` : `${amount} a menos`;
  };
  return { name: "Comparado a amortizar", from: value(before), to: value(after) };
}

function Change({ from, to }: { from: string; to: string }) {
  return from === to ? to : <CelebrationChange from={from} to={to} />;
}

function Edited({
  before,
  after,
  onClose,
}: {
  before?: LotComparison;
  after?: LotComparison;
  onClose: () => void;
}) {
  const title = <CelebrationTitle>Compra atualizada</CelebrationTitle>;
  if (!before || !after) {
    return (
      <Celebration variant="notice" onClose={onClose}>
        {title}
      </Celebration>
    );
  }
  // A row marks its change when either side reads a projection.
  const marked = projected(before) || projected(after);
  const advantageMarked = advantageProjected(before) || advantageProjected(after);
  const row = advantageRow(before.advantage, after.advantage);
  return (
    <Celebration
      variant="notice"
      footnote={marked || advantageMarked ? projection : undefined}
      onClose={onClose}
    >
      {title}
      <CelebrationFacts>
        <CelebrationFact name={label("Líquido no vencimento", marked)}>
          <Change from={netOf(before)} to={netOf(after)} />
        </CelebrationFact>
        <CelebrationFact name={label(row.name, advantageMarked)}>
          <Change from={row.from} to={row.to} />
        </CelebrationFact>
      </CelebrationFacts>
    </Celebration>
  );
}

interface LotFeedbackProps {
  change: LotChange;
  onClose: () => void;
}

/**
 * LotFeedback opens once a lot is saved: a celebration of what a new lot gains and how it compares
 * with prepaying, or a notice of how an edit changed both.
 */
export function LotFeedback({ change, onClose }: LotFeedbackProps) {
  const after = useLotComparison(change.lot);
  const before = useLotComparison(change.kind === "edited" ? change.replaced : change.lot);
  if (after.isPending || before.isPending) return null;

  if (change.kind === "recorded") return <Recorded comparison={after.data} onClose={onClose} />;
  return <Edited before={before.data} after={after.data} onClose={onClose} />;
}
