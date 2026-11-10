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
import { favoured, signedAdvantage } from "@/lib/decisions";
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
 * RowFigure hangs a row's asterisk outside its figure, beside its last line, so the figures stay
 * aligned.
 */
function RowFigure({ marked, children }: { marked: boolean; children: React.ReactNode }) {
  return (
    <span className="relative inline-block">
      {children}
      {marked && <CelebrationMark className="top-auto bottom-0 text-headline">*</CelebrationMark>}
    </span>
  );
}

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
          <CelebrationFact name="Líquido no vencimento">
            <RowFigure marked={marked}>{formatMoney(maturity.net)}</RowFigure>
          </CelebrationFact>
        )}
      </CelebrationFacts>
      <ComparisonNote comparison={comparison} />
    </Celebration>
  );
}

const netOf = (c: LotComparison) => (c.maturity ? formatMoney(c.maturity.net) : "—");
const advantageOf = (c: LotComparison) => (c.advantage ? signedAdvantage(c.advantage) : "—");

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
  const marked = projected(after);
  const advantageMarked = advantageProjected(after);
  return (
    <Celebration
      variant="notice"
      footnote={marked || advantageMarked ? projection : undefined}
      onClose={onClose}
    >
      {title}
      <CelebrationFacts>
        <CelebrationFact name="Líquido no vencimento">
          <RowFigure marked={marked}>
            <Change from={netOf(before)} to={netOf(after)} />
          </RowFigure>
        </CelebrationFact>
        <CelebrationFact name="Vantagem sobre amortizar">
          <RowFigure marked={advantageMarked}>
            <Change from={advantageOf(before)} to={advantageOf(after)} />
          </RowFigure>
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
