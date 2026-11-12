// PROTOTYPE, throwaway: Investimentos for variants B/C. Compras becomes one inset list whose rows
// say, in words, which lots are worth selling; Venda antecipada replaces signed amounts with
// "Vender rende R$ x a mais" and shows the horizon each comparison runs to.
import { Link } from "@tanstack/react-router";
import { CalendarClockIcon, TrendingUpIcon } from "lucide-react";
import {
  GroupedList,
  GroupedListChevron,
  GroupedListItem,
  GroupedListLabel,
  GroupedListRow,
  GroupedListSection,
  GroupedListValue,
} from "@/components/patterns/GroupedList";
import type { EarlySaleCheck, LotValued } from "@/lib/api";
import { bondLabel, bondRate } from "@/lib/bondKinds";
import { earlySaleUnavailableLabels } from "@/lib/decisions";
import { formatDate, formatMoney } from "@/lib/format";
import { checkOf, groupByBond, saleGain, type EffectSearch } from "@/lib/investments";

/** ProtoSaleGain says in words which option earns more, and by how much. No signs, no red. */
export function ProtoSaleGain({ check }: { check: EarlySaleCheck }) {
  if (check.advantage === undefined) return null;
  const gain = saleGain(check.advantage);
  if (gain.kind === "even") return <>Vender e manter rendem o mesmo</>;
  const amount = <span className="tabular-nums">{formatMoney(gain.amount)}</span>;
  if (gain.kind === "gain") {
    return (
      <>
        Vender rende <span className="text-positive tabular-nums">{formatMoney(gain.amount)}</span>{" "}
        a mais
      </>
    );
  }
  return <>Manter rende {amount} a mais</>;
}

/** ProtoSaleSummary is the one quiet line under Compras' total: how many lots favour selling. */
export function ProtoSaleSummary({ checks }: { checks: EarlySaleCheck[] }) {
  const selling = checks.filter((check) => check.verdict === "sell").length;
  if (selling === 0) return null;
  return (
    <p className="mt-2 text-callout text-muted-foreground">
      {selling === 1
        ? "1 compra renderia mais vendida para amortizar."
        : `${selling} compras renderiam mais vendidas para amortizar.`}{" "}
      <Link
        to="/investimentos/venda-antecipada"
        className="inline-block py-1 font-medium text-accent hover:underline"
      >
        Ver venda antecipada
      </Link>
    </p>
  );
}

function marketFigure(lot: LotValued): { text: string; muted: boolean } {
  if (lot.values_unavailable === "missing_ipca") return { text: "Aguardando o IPCA", muted: true };
  if (lot.values?.market) return { text: formatMoney(lot.values.market.net), muted: false };
  if (!lot.values?.accrual) return { text: "Vencido", muted: true };
  return { text: "Sem preço de venda", muted: true };
}

function LotHint({ check }: { check: EarlySaleCheck | undefined }) {
  if (check?.verdict === "sell" && check.advantage !== undefined) {
    return (
      <span className="flex items-start gap-1.5 text-callout">
        <TrendingUpIcon
          aria-hidden="true"
          strokeWidth={1.75}
          className="mt-0.5 size-4 shrink-0 text-positive"
        />
        <span>
          Vender e amortizar rende{" "}
          <span className="whitespace-nowrap">
            <span className="text-positive tabular-nums">
              {formatMoney(saleGain(check.advantage).amount)}
            </span>{" "}
            a mais
          </span>
        </span>
      </span>
    );
  }
  if (check?.verdict === "hold") {
    return (
      <span className="flex items-start gap-1.5 text-callout text-muted-foreground">
        <CalendarClockIcon
          aria-hidden="true"
          strokeWidth={1.75}
          className="mt-0.5 size-4 shrink-0"
        />
        <span>Manter até o vencimento</span>
      </span>
    );
  }
  return null;
}

/**
 * ProtoLotRow is one lot: bond name and net value on the first line, the purchase and the early
 * sale hint below. A grid, so the hint can run under the value on a narrow screen.
 */
function ProtoLotRow({ lot, check }: { lot: LotValued; check: EarlySaleCheck | undefined }) {
  const figure = marketFigure(lot);
  return (
    <GroupedListItem>
      <GroupedListRow asChild className="proto-lot-row">
        <Link to="/investimentos/compras/$lotId" params={{ lotId: String(lot.id) }}>
          <span className="proto-lot-name text-headline">{bondLabel(lot)}</span>
          <GroupedListValue
            className={`proto-lot-value ${
              figure.muted
                ? "text-callout"
                : "text-headline font-semibold text-foreground tabular-nums"
            }`}
          >
            {figure.text}
          </GroupedListValue>
          <span className="proto-lot-meta text-callout text-muted-foreground">
            Compra em {formatDate(lot.purchase_date)} · {bondRate(lot.type, lot.rate)}
          </span>
          <span className="proto-lot-hint">
            <LotHint check={check} />
          </span>
          <GroupedListChevron className="proto-lot-chevron" />
        </Link>
      </GroupedListRow>
    </GroupedListItem>
  );
}

/** ProtoLotList is every lot in one inset list, the bonds maturing first leading. */
export function ProtoLotList({ lots, checks }: { lots: LotValued[]; checks: EarlySaleCheck[] }) {
  const ordered = groupByBond(lots).flatMap((group) => group.lots);
  return (
    <GroupedListSection aria-label="Compras">
      <GroupedList>
        {ordered.map((lot) => (
          <ProtoLotRow key={lot.id} lot={lot} check={checkOf(checks, lot.id)} />
        ))}
      </GroupedList>
      <p className="px-1 text-footnote text-muted-foreground">
        Cada compra em uma data diferente aparece separada.
      </p>
    </GroupedListSection>
  );
}

/** ProtoCheckRow is a Venda antecipada row: the bond, then the option that earns more and until when. */
export function ProtoCheckRow({ check, search }: { check: EarlySaleCheck; search: EffectSearch }) {
  const { lot } = check;
  const decided = check.verdict && check.advantage !== undefined;
  return (
    <GroupedListItem>
      <GroupedListRow asChild className="proto-sale-row">
        <Link to="/investimentos/compras/$lotId" params={{ lotId: String(lot.id) }} search={search}>
          <GroupedListLabel className="proto-sale-label flex flex-col gap-0.5">
            <span className="text-headline">{bondLabel(lot)}</span>
            <span className="text-callout text-muted-foreground">
              Compra em {formatDate(lot.purchase_date)}
            </span>
          </GroupedListLabel>
          <GroupedListValue className="proto-sale-value flex flex-col gap-0.5">
            {check.unavailable ? (
              <span className="text-callout">{earlySaleUnavailableLabels[check.unavailable]}</span>
            ) : decided ? (
              <>
                <span className="text-callout font-medium text-foreground">
                  <ProtoSaleGain check={check} />
                </span>
                <span className="text-callout">até {formatDate(lot.maturity)}</span>
              </>
            ) : null}
          </GroupedListValue>
          <GroupedListChevron className="proto-sale-chevron" />
        </Link>
      </GroupedListRow>
    </GroupedListItem>
  );
}
