import { useId } from "react";
import { ErrorPanel } from "@/components/patterns/ErrorPanel";
import {
  GroupedList,
  GroupedListChevron,
  GroupedListHeader,
  GroupedListItem,
  GroupedListLabel,
  GroupedListRow,
  GroupedListSection,
} from "@/components/patterns/GroupedList";
import { Loading } from "@/components/patterns/Loading";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { BondQuote } from "@/lib/api";
import { bondKinds, bondLabel, bondRate, comparesWith } from "@/lib/bondKinds";
import { staleSources } from "@/lib/dashboard";
import { formatDate, formatInstantDate, formatMoney } from "@/lib/format";
import { useBonds } from "@/lib/marketQueries";
import { useMortgage } from "@/lib/mortgageQueries";
import { StaleSourcesNote } from "@/pages/marketdata/StaleSourcesNote";
import { useMarketData } from "@/pages/marketdata/useMarketData";

// A side of a quote: its rate, with the unit price under it in Footnote.
function Side({ type, price }: { type: BondQuote["type"]; price?: BondQuote["sell"] }) {
  if (!price) return <span className="text-muted-foreground">Fora de oferta</span>;
  return (
    <span className="flex flex-col items-end">
      <span className="whitespace-nowrap">{bondRate(type, price.rate)}</span>
      <span className="text-footnote whitespace-nowrap text-muted-foreground">
        {formatMoney(price.unit_price)}
      </span>
    </span>
  );
}

const sideNames = { buy: "Compra", sell: "Venda" } as const;

function BondsTable({
  bonds,
  label,
  sides,
}: {
  bonds: BondQuote[];
  label: string;
  sides: (keyof typeof sideNames)[];
}) {
  return (
    <Table variant="grouped" aria-label={label}>
      <TableHeader>
        <TableRow variant="grouped">
          <TableHead variant="grouped">Título</TableHead>
          <TableHead variant="grouped">Vencimento</TableHead>
          {sides.map((side) => (
            <TableHead key={side} variant="grouped" align="end">
              {sideNames[side]}
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {bonds.map((bond) => (
          <TableRow key={`${bond.type}-${bond.maturity}`} variant="grouped">
            <TableHead scope="row" variant="grouped-row" className="align-top">
              {bondLabel(bond)}
            </TableHead>
            <TableCell variant="grouped">
              <span className="text-muted-foreground">{formatDate(bond.maturity)}</span>
            </TableCell>
            {sides.map((side) => (
              <TableCell key={side} variant="grouped" align="end">
                <Side type={bond.type} price={bond[side]} />
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

/** othersSummary names the bonds a collapsed group holds: "Tesouro IPCA+ e outros · 6 títulos". */
function othersSummary(bonds: BondQuote[]): string {
  const kinds = [...new Set(bonds.map((b) => bondKinds[b.type].name))];
  const named = kinds.length > 1 ? `${kinds[0]} e outros` : kinds[0];
  return `${named} · ${bonds.length} ${bonds.length === 1 ? "título" : "títulos"}`;
}

/** CollapsedBonds keeps a group of bonds behind a row that names them, closed at first. */
function CollapsedBonds({
  title,
  bonds,
  children,
}: {
  title: string;
  bonds: BondQuote[];
  children: React.ReactNode;
}) {
  const id = useId();
  return (
    <GroupedListSection aria-labelledby={id}>
      <GroupedListHeader id={id}>{title}</GroupedListHeader>
      <Collapsible>
        <GroupedList>
          <GroupedListItem>
            <CollapsibleTrigger asChild>
              <GroupedListRow asChild>
                <button type="button">
                  <GroupedListLabel>{othersSummary(bonds)}</GroupedListLabel>
                  <GroupedListChevron className="rotate-90 transition-transform in-data-[state=open]:-rotate-90" />
                </button>
              </GroupedListRow>
            </CollapsibleTrigger>
          </GroupedListItem>
        </GroupedList>
        <CollapsibleContent>
          <div className="pt-2">{children}</div>
        </CollapsibleContent>
      </Collapsible>
    </GroupedListSection>
  );
}

/**
 * Bonds is Mercado's Títulos: the Tesouro Direto catalogue, the comparable bonds Tesouro sells today
 * first, then the other bonds and last the comparable ones off offer, each in a collapsed group.
 */
export function Bonds() {
  const { status } = useMarketData();
  const bonds = useBonds();
  const mortgage = useMortgage().data;
  const id = useId();

  const failed = [status, bonds].filter((query) => query.isError);
  if (failed.length > 0) {
    return (
      <ErrorPanel
        title="Não foi possível carregar os títulos"
        onRetry={() => {
          for (const query of failed) void query.refetch();
        }}
      />
    );
  }
  // The shell opens only once the mortgage is loaded and registered.
  if (!mortgage) return null;
  if (!status.data || !bonds.data) {
    return (
      <Loading label="Carregando títulos">
        <Skeleton className="h-5 w-96" />
        <Skeleton className="h-80" />
      </Loading>
    );
  }

  const refreshedAt = status.data.bonds.refreshed_at;
  const catalogue = bonds.data.bonds;
  const comparable = catalogue.filter((b) => comparesWith(b.type, mortgage.indexer));
  const offered = comparable.filter((b) => b.buy);
  const notOffered = comparable.filter((b) => !b.buy);
  const others = catalogue.filter((b) => !comparesWith(b.type, mortgage.indexer));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        {refreshedAt && (
          <p className="text-callout text-muted-foreground">
            Taxas e preços do Tesouro Direto em {formatInstantDate(refreshedAt)}.
          </p>
        )}
        <StaleSourcesNote sources={staleSources({ bonds: status.data.bonds })} />
      </div>
      {catalogue.length === 0 && (
        <p className="text-callout text-muted-foreground">Nenhum título disponível.</p>
      )}
      {offered.length > 0 && (
        <GroupedListSection aria-labelledby={id}>
          <GroupedListHeader id={id}>Comparáveis com seu financiamento</GroupedListHeader>
          <BondsTable
            bonds={offered}
            label="Comparáveis com seu financiamento"
            sides={["buy", "sell"]}
          />
        </GroupedListSection>
      )}
      {others.length > 0 && (
        <CollapsedBonds title="Outros títulos" bonds={others}>
          <BondsTable bonds={others} label="Outros títulos" sides={["buy", "sell"]} />
        </CollapsedBonds>
      )}
      {notOffered.length > 0 && (
        <CollapsedBonds title="Comparáveis fora de oferta" bonds={notOffered}>
          <BondsTable bonds={notOffered} label="Comparáveis fora de oferta" sides={["sell"]} />
        </CollapsedBonds>
      )}
    </div>
  );
}
