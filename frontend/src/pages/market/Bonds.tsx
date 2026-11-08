import { ChevronDownIcon } from "lucide-react";
import { useId } from "react";
import { GroupedListHeader, GroupedListSection } from "@/components/patterns/GroupedList";
import { ErrorPanel } from "@/components/patterns/ErrorPanel";
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
import { StaleSourcesNote } from "@/pages/market/StaleSourcesNote";
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

function BondsTable({ bonds, label }: { bonds: BondQuote[]; label: string }) {
  return (
    <Table variant="grouped" aria-label={label}>
      <TableHeader>
        <TableRow variant="grouped">
          <TableHead variant="grouped">Título</TableHead>
          <TableHead variant="grouped">Vencimento</TableHead>
          <TableHead variant="grouped" align="end">
            Compra
          </TableHead>
          <TableHead variant="grouped" align="end">
            Venda
          </TableHead>
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
            <TableCell variant="grouped" align="end">
              <Side type={bond.type} price={bond.buy} />
            </TableCell>
            <TableCell variant="grouped" align="end">
              <Side type={bond.type} price={bond.sell} />
            </TableCell>
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

function Others({ bonds }: { bonds: BondQuote[] }) {
  const id = useId();
  return (
    <GroupedListSection aria-labelledby={id}>
      <GroupedListHeader id={id}>Outros títulos</GroupedListHeader>
      <Collapsible>
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="flex min-h-13 w-full items-center justify-between gap-4 rounded-lg border bg-card px-4 py-3 text-left text-body transition-colors outline-none hover:bg-muted focus-visible:bg-muted"
          >
            {othersSummary(bonds)}
            <ChevronDownIcon
              aria-hidden="true"
              strokeWidth={1.5}
              className="size-5 shrink-0 text-tertiary-foreground transition-transform in-data-[state=open]:rotate-180"
            />
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="pt-2">
            <BondsTable bonds={bonds} label="Outros títulos" />
          </div>
        </CollapsibleContent>
      </Collapsible>
    </GroupedListSection>
  );
}

/**
 * Bonds is Mercado's Títulos: the Tesouro Direto catalogue, the bonds a decision compares with the
 * mortgage first and the rest in a collapsed group.
 */
export function Bonds() {
  const { status } = useMarketData();
  const bonds = useBonds();
  const indexer = useMortgage().data?.indexer ?? "none";
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
  const comparable = catalogue.filter((b) => comparesWith(b.type, indexer));
  const others = catalogue.filter((b) => !comparesWith(b.type, indexer));

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
      {comparable.length > 0 && (
        <GroupedListSection aria-labelledby={id}>
          <GroupedListHeader id={id}>Comparáveis com seu financiamento</GroupedListHeader>
          <BondsTable bonds={comparable} label="Comparáveis com seu financiamento" />
        </GroupedListSection>
      )}
      {others.length > 0 && <Others bonds={others} />}
    </div>
  );
}
