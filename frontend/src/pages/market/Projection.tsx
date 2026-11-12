import { Link } from "@tanstack/react-router";
import { useId } from "react";
import {
  GroupedList,
  GroupedListChevron,
  GroupedListHeader,
  GroupedListItem,
  GroupedListLabel,
  GroupedListRow,
  GroupedListSection,
} from "@/components/patterns/GroupedList";
import type { ProjectionMethod } from "@/lib/api";
import { indexNames } from "@/lib/indexNames";
import { projectionMethodDescriptions } from "@/lib/marketIndexes";
import { projectionMethodLabels } from "@/lib/projectionMethods";
import { ProjectionMethodsEffect } from "@/prototypes/ProtoCopy";

/** ProjectionSummary says how an index is projected, opening Ajustes, where the method is chosen. */
export function ProjectionSummary({ projection }: { projection: ProjectionMethod }) {
  const id = useId();
  return (
    <GroupedListSection aria-labelledby={id}>
      <GroupedListHeader id={id}>Projeção</GroupedListHeader>
      <GroupedList>
        <GroupedListItem>
          <GroupedListRow asChild>
            <Link to="/ajustes">
              <GroupedListLabel className="flex flex-col gap-0.5">
                <span>{projectionMethodLabels[projection.method]}</span>
                <span className="text-callout text-muted-foreground">
                  {projectionMethodDescriptions[projection.method]}
                </span>
              </GroupedListLabel>
              <GroupedListChevron />
            </Link>
          </GroupedListRow>
        </GroupedListItem>
      </GroupedList>
      <p className="px-4 text-footnote text-muted-foreground">
        <ProjectionMethodsEffect /> Escolha o método em Ajustes.
      </p>
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
      <p className="rounded-lg glass px-4 py-3 text-callout">
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
      <p className="px-4 text-footnote text-muted-foreground">
        <ProjectionMethodsEffect />
      </p>
    </GroupedListSection>
  );
}
