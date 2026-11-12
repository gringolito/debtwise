import { useId, useState } from "react";
import { ErrorPanel } from "@/components/patterns/ErrorPanel";
import {
  GroupedList,
  GroupedListChevron,
  GroupedListHeader,
  GroupedListItem,
  GroupedListLabel,
  GroupedListRow,
  GroupedListSection,
  GroupedListValue,
} from "@/components/patterns/GroupedList";
import { Loading } from "@/components/patterns/Loading";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Skeleton } from "@/components/ui/skeleton";
import type { ProjectionMethod } from "@/lib/api";
import { indexNames } from "@/lib/indexNames";
import { projectionMethodDescriptions } from "@/lib/marketIndexes";
import { useProjectionMethods, useSaveProjectionMethod } from "@/lib/marketQueries";
import { projectionMethodLabels } from "@/lib/projectionMethods";
import { ProjectionMethodsEffect } from "@/prototypes/ProtoCopy";

/** ProjectionSheet picks the method an index is projected by, saves it on the spot and closes. */
function ProjectionSheet({
  projection,
  onClose,
}: {
  projection: ProjectionMethod;
  onClose: () => void;
}) {
  const id = useId();
  const save = useSaveProjectionMethod(projection.index);
  // While the save runs, the choice shows what was picked rather than what is saved.
  const chosen = save.isPending ? save.variables : projection.method;

  return (
    <Dialog open onOpenChange={(open) => open || onClose()}>
      <DialogContent aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>{indexNames[projection.index]}</DialogTitle>
          <DialogClose asChild>
            <Button variant="plain" size="inline">
              Cancelar
            </Button>
          </DialogClose>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          <div className="overflow-hidden rounded-lg border bg-card">
            <RadioGroup
              aria-label="Método de projeção"
              value={chosen}
              disabled={save.isPending}
              onValueChange={(value) => {
                const method = projection.offered.find((m) => m === value);
                if (method) save.mutate(method, { onSuccess: onClose });
              }}
              layout="rows"
            >
              {projection.offered.map((method) => (
                <label
                  key={method}
                  className="flex cursor-pointer items-center gap-4 px-4 py-3 transition-colors not-last:border-b has-data-checked:bg-accent-tint"
                >
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span id={`${id}-${method}-name`}>{projectionMethodLabels[method]}</span>
                    <span
                      id={`${id}-${method}-description`}
                      className="text-callout text-muted-foreground"
                    >
                      {projectionMethodDescriptions[method]}
                    </span>
                  </span>
                  <RadioGroupItem
                    value={method}
                    aria-labelledby={`${id}-${method}-name`}
                    aria-describedby={`${id}-${method}-description`}
                  />
                </label>
              ))}
            </RadioGroup>
          </div>
          {save.isError && (
            <p role="alert" className="px-4 text-footnote text-destructive">
              Não foi possível salvar o método de projeção.
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * ProjectionsSection is Ajustes' "Projeções": each index that offers a choice of projection
 * methods with the one it is projected by, opening a sheet that changes it.
 */
export function ProjectionsSection() {
  const headerId = useId();
  const methods = useProjectionMethods();
  const [editing, setEditing] = useState<ProjectionMethod["index"] | null>(null);
  const projection = methods.data?.methods.find((m) => m.index === editing);

  let content: React.ReactNode;
  if (methods.isError) {
    content = (
      <ErrorPanel
        className="min-h-0 p-8"
        title="Não foi possível carregar as projeções"
        onRetry={() => void methods.refetch()}
      />
    );
  } else if (!methods.data) {
    content = (
      <Loading label="Carregando projeções">
        <Skeleton className="h-39" />
      </Loading>
    );
  } else {
    content = (
      <>
        <GroupedList aria-labelledby={headerId}>
          {methods.data.methods.map(({ index, method }) => (
            <GroupedListItem key={index}>
              <GroupedListRow asChild>
                <button type="button" onClick={() => setEditing(index)}>
                  <GroupedListLabel>{indexNames[index]}</GroupedListLabel>
                  <GroupedListValue>{projectionMethodLabels[method]}</GroupedListValue>
                  <GroupedListChevron />
                </button>
              </GroupedListRow>
            </GroupedListItem>
          ))}
        </GroupedList>
        <p className="px-4 text-footnote text-muted-foreground">
          <ProjectionMethodsEffect />
        </p>
      </>
    );
  }

  return (
    <GroupedListSection aria-labelledby={headerId}>
      <GroupedListHeader id={headerId}>Projeções</GroupedListHeader>
      {content}
      {projection && <ProjectionSheet projection={projection} onClose={() => setEditing(null)} />}
    </GroupedListSection>
  );
}
