import { LoaderCircleIcon } from "lucide-react";
import { useId } from "react";
import { ErrorPanel } from "@/components/patterns/ErrorPanel";
import {
  GroupedList,
  GroupedListHeader,
  GroupedListItem,
  GroupedListLabel,
  GroupedListRow,
  GroupedListSection,
  GroupedListValue,
} from "@/components/patterns/GroupedList";
import { Loading } from "@/components/patterns/Loading";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatLastUpdate } from "@/lib/format";
import { freshnessLabels, type SourceFreshness, sourceFreshness } from "@/lib/marketFreshness";
import { cn } from "@/lib/utils";
import { useMarketData } from "@/pages/marketdata/useMarketData";

function SourceRow({ name, status, refreshedAt }: SourceFreshness) {
  return (
    <GroupedListItem>
      <GroupedListRow>
        <GroupedListLabel>{name}</GroupedListLabel>
        <GroupedListValue className="text-footnote">
          {refreshedAt ? `Atualizado ${formatLastUpdate(refreshedAt)}` : "Nunca atualizado"}
          <span className="sr-only">{`, ${freshnessLabels[status]}`}</span>
        </GroupedListValue>
        <span
          aria-hidden="true"
          className={cn(
            "size-2 shrink-0 rounded-full",
            status === "fresh" ? "bg-positive" : "bg-caution",
          )}
        />
      </GroupedListRow>
    </GroupedListItem>
  );
}

/**
 * MarketDataSection is Ajustes' "Dados de mercado": how fresh each source is, and "Atualizar agora",
 * which shows the refresh running until it ends.
 */
export function MarketDataSection() {
  const headerId = useId();
  const { status, refresh, refreshing } = useMarketData();

  let content: React.ReactNode;
  if (status.isError) {
    content = (
      <ErrorPanel
        className="min-h-0 p-8"
        title="Não foi possível carregar os dados de mercado"
        onRetry={() => void status.refetch()}
      />
    );
  } else if (!status.data) {
    content = (
      <Loading label="Carregando dados de mercado">
        <Skeleton className="h-39" />
      </Loading>
    );
  } else {
    content = (
      <>
        <GroupedList aria-labelledby={headerId}>
          {sourceFreshness(status.data).map((source) => (
            <SourceRow key={source.name} {...source} />
          ))}
        </GroupedList>
        <div className="flex items-baseline justify-between gap-4 px-4">
          <div className="flex flex-col gap-1">
            {refreshing || refresh.isPending ? (
              <span
                role="status"
                className="inline-flex items-center gap-2 text-callout text-muted-foreground"
              >
                <LoaderCircleIcon
                  aria-hidden="true"
                  strokeWidth={1.5}
                  className="size-4 animate-spin"
                />
                Atualizando…
              </span>
            ) : (
              <Button variant="link" size="inline" onClick={() => refresh.mutate()}>
                Atualizar agora
              </Button>
            )}
            {refresh.isError && (
              <span className="text-footnote text-destructive">Não foi possível atualizar.</span>
            )}
          </div>
          <p className="text-right text-footnote text-muted-foreground">
            O DebtWise atualiza tudo automaticamente todos os dias.
          </p>
        </div>
      </>
    );
  }

  return (
    <GroupedListSection aria-labelledby={headerId}>
      <GroupedListHeader id={headerId}>Dados de mercado</GroupedListHeader>
      {content}
    </GroupedListSection>
  );
}
