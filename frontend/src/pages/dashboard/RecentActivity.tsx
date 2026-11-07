import { Link } from "@tanstack/react-router";
import { CheckIcon, ClockIcon } from "lucide-react";
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
import type { Activity } from "@/lib/dashboard";
import { formatDate, formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";

function ActivityIcon({ kind }: { kind: Activity["kind"] }) {
  const Icon = kind === "statement" ? CheckIcon : ClockIcon;
  return (
    <span
      className={cn(
        "flex size-8 shrink-0 items-center justify-center rounded-full",
        kind === "statement" ? "bg-accent-tint text-accent" : "bg-muted text-foreground",
      )}
    >
      <Icon aria-hidden="true" strokeWidth={1.5} className="size-4" />
    </span>
  );
}

function describe(activity: Activity): { title: string; detail: string; value?: string } {
  switch (activity.kind) {
    case "statement":
      return {
        title: "Extrato registrado",
        detail: `${formatDate(activity.date)} · diferença de ${formatMoney(activity.statement.drift)}`,
      };
    case "prepayment":
      return {
        title: "Amortização extraordinária",
        detail: formatDate(activity.date),
        value: formatMoney(activity.prepayment.amount),
      };
  }
}

/** RecentActivity lists the latest statements and prepayments recorded on the mortgage. */
export function RecentActivity({ activity }: { activity: Activity[] }) {
  const headerId = useId();
  if (activity.length === 0) return null;
  return (
    <GroupedListSection aria-labelledby={headerId}>
      <GroupedListHeader id={headerId}>Atividade recente</GroupedListHeader>
      <GroupedList>
        {activity.map((entry) => {
          const { title, detail, value } = describe(entry);
          const id = entry.kind === "statement" ? entry.statement.id : entry.prepayment.id;
          return (
            <GroupedListItem key={`${entry.kind} ${id}`}>
              <GroupedListRow asChild>
                <Link to="/financiamento">
                  <ActivityIcon kind={entry.kind} />
                  <GroupedListLabel className="flex flex-col">
                    <span>{title}</span>
                    <span className="text-footnote text-muted-foreground">{detail}</span>
                  </GroupedListLabel>
                  {value && (
                    <GroupedListValue className="font-semibold text-foreground">
                      {value}
                    </GroupedListValue>
                  )}
                  <GroupedListChevron />
                </Link>
              </GroupedListRow>
            </GroupedListItem>
          );
        })}
      </GroupedList>
    </GroupedListSection>
  );
}
