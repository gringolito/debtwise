import { Link, type LinkProps } from "@tanstack/react-router";
import { CircleCheckIcon, CircleIcon } from "lucide-react";
import { useId } from "react";
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

export interface Step {
  label: string;
  done: boolean;
  to: LinkProps["to"];
}

/** NextSteps lists what a new owner still has to set up, and disappears once all of it is done. */
export function NextSteps({ steps }: { steps: Step[] }) {
  const headerId = useId();
  if (steps.every((step) => step.done)) return null;
  return (
    <GroupedListSection aria-labelledby={headerId}>
      <GroupedListHeader id={headerId}>Próximos passos</GroupedListHeader>
      <GroupedList>
        {steps.map(({ label, done, to }) => (
          <GroupedListItem key={label}>
            {done ? (
              <GroupedListRow>
                <CircleCheckIcon
                  aria-hidden="true"
                  strokeWidth={1.5}
                  className="size-5 text-accent"
                />
                <GroupedListLabel className="text-muted-foreground line-through">
                  {label}
                </GroupedListLabel>
                <GroupedListValue className="text-footnote">Concluído</GroupedListValue>
              </GroupedListRow>
            ) : (
              <GroupedListRow asChild>
                <Link to={to}>
                  <CircleIcon
                    aria-hidden="true"
                    strokeWidth={1.5}
                    className="size-5 text-tertiary-foreground"
                  />
                  <GroupedListLabel>{label}</GroupedListLabel>
                  <GroupedListChevron />
                </Link>
              </GroupedListRow>
            )}
          </GroupedListItem>
        ))}
      </GroupedList>
    </GroupedListSection>
  );
}
