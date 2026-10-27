import { useId } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Field, FieldLabel } from "@/components/ui/field";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import type { IndexName, ProjectionMethod } from "@/lib/api";
import { indexNames } from "@/lib/indexNames";
import { projectionMethodLabels } from "@/lib/projectionMethods";
import { useProjectionMethods, useSaveProjectionMethod } from "@/pages/indexes/projectionQueries";

function MethodSelect({ projection }: { projection: ProjectionMethod }) {
  const id = useId();
  const save = useSaveProjectionMethod(projection.index);

  return (
    <div className="flex flex-col gap-2">
      <Field>
        <FieldLabel htmlFor={id}>Método de projeção</FieldLabel>
        <NativeSelect
          id={id}
          value={projection.method}
          disabled={save.isPending}
          onChange={(event) => {
            const chosen = projection.offered.find((method) => method === event.target.value);
            if (chosen) save.mutate(chosen);
          }}
        >
          {projection.offered.map((method) => (
            <NativeSelectOption key={method} value={method}>
              {projectionMethodLabels[method]}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </Field>
      {save.isError && (
        <Alert variant="destructive">
          <AlertDescription>Não foi possível salvar o método de projeção.</AlertDescription>
        </Alert>
      )}
    </div>
  );
}

// The labels start a sentence; mid-sentence only the first letter changes, as "Focus" is a name.
function midSentence(method: ProjectionMethod["method"]): string {
  const label = projectionMethodLabels[method];
  return label.charAt(0).toLowerCase() + label.slice(1);
}

function PoupancaDerivation({ methods }: { methods: ProjectionMethod[] }) {
  const tr = methods.find((m) => m.index === "tr");
  const selic = methods.find((m) => m.index === "selic_target");
  if (!tr || !selic) return null;

  return (
    <p className="text-muted-foreground">
      A projeção deriva da {indexNames.tr} projetada pela {midSentence(tr.method)} e da{" "}
      {indexNames.selic_target} projetada pela {midSentence(selic.method)}, segundo a regra da
      poupança.
    </p>
  );
}

/**
 * ProjectionControls shows how an index is projected: the choice of method for an index the owner
 * chooses it for, and for the poupança yield what it derives from.
 */
export function ProjectionControls({ index }: { index: IndexName }) {
  const methods = useProjectionMethods().data?.methods ?? [];
  if (index === "poupanca_yield") return <PoupancaDerivation methods={methods} />;
  const projection = methods.find((m) => m.index === index);
  return projection && <MethodSelect projection={projection} />;
}

/** ProjectionMethodsError says the methods could not be loaded, once for all the controls. */
export function ProjectionMethodsError() {
  if (!useProjectionMethods().isError) return null;
  return (
    <Alert variant="destructive">
      <AlertDescription>Não foi possível carregar os métodos de projeção.</AlertDescription>
    </Alert>
  );
}
