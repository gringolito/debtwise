import { Link } from "@tanstack/react-router";
import { useId } from "react";
import { GroupedListHeader, GroupedListSection } from "@/components/patterns/GroupedList";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import type { ProjectionMethod } from "@/lib/api";
import { indexNames } from "@/lib/indexNames";
import { projectionMethodDescriptions } from "@/lib/marketIndexes";
import { useSaveProjectionMethod } from "@/lib/marketQueries";
import { projectionMethodLabels } from "@/lib/projectionMethods";

const EFFECT = "A projeção muda o saldo devedor futuro e as comparações em Decidir.";

/** ProjectionChoice picks the method an index is projected by and saves it on the spot. */
export function ProjectionChoice({ projection }: { projection: ProjectionMethod }) {
  const id = useId();
  const save = useSaveProjectionMethod(projection.index);
  // While the save runs, the choice shows what was picked rather than what is saved.
  const chosen = save.isPending ? save.variables : projection.method;

  return (
    <GroupedListSection aria-labelledby={`${id}-header`}>
      <GroupedListHeader id={`${id}-header`}>Projeção</GroupedListHeader>
      <div className="overflow-hidden rounded-lg border bg-card">
        <RadioGroup
          aria-labelledby={`${id}-header`}
          value={chosen}
          disabled={save.isPending}
          onValueChange={(value) => {
            const method = projection.offered.find((m) => m === value);
            if (method) save.mutate(method);
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
      {save.isError ? (
        <p role="alert" className="px-4 text-footnote text-destructive">
          Não foi possível salvar o método de projeção.
        </p>
      ) : (
        <p className="px-4 text-footnote text-muted-foreground">{EFFECT}</p>
      )}
    </GroupedListSection>
  );
}

// The labels start a sentence; mid-sentence only the first letter changes, as "Focus" is a name.
function midSentence(method: ProjectionMethod["method"]): string {
  const label = projectionMethodLabels[method];
  return label.charAt(0).toLowerCase() + label.slice(1);
}

/**
 * PoupancaDerivation says what the poupança yield's projection derives from, as no method is
 * chosen for it.
 */
export function PoupancaDerivation({ methods }: { methods: ProjectionMethod[] }) {
  const id = useId();
  const tr = methods.find((m) => m.index === "tr");
  const selic = methods.find((m) => m.index === "selic_target");
  if (!tr || !selic) return null;

  const link = "text-accent underline-offset-4 hover:underline";
  return (
    <GroupedListSection aria-labelledby={id}>
      <GroupedListHeader id={id}>Projeção</GroupedListHeader>
      <p className="rounded-lg border bg-card px-4 py-3 text-callout">
        A projeção deriva da{" "}
        <Link to="/mercado/indices/$index" params={{ index: "tr" }} className={link}>
          {indexNames.tr}
        </Link>{" "}
        projetada pela {midSentence(tr.method)} e da{" "}
        <Link to="/mercado/indices/$index" params={{ index: "selic_target" }} className={link}>
          {indexNames.selic_target}
        </Link>{" "}
        projetada pela {midSentence(selic.method)}, segundo a regra da poupança.
      </p>
      <p className="px-4 text-footnote text-muted-foreground">{EFFECT}</p>
    </GroupedListSection>
  );
}
