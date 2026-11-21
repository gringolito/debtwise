// PROTOTYPE: where "Ver cenários" opens its tables. Five variants on /comparar and on a lot's
// early sale, switchable via `?variant=atual|abas|lado|resumo|painel`. Stays on the prototype branch.
import { Dialog as DialogPrimitive } from "radix-ui";
import { useState } from "react";
import {
  GroupedList,
  GroupedListChevron,
  GroupedListItem,
  GroupedListLabel,
  GroupedListRow,
  GroupedListValue,
} from "@/components/patterns/GroupedList";
import {
  PrototypeSwitcher,
  type PrototypeVariant,
  usePrototypeVariant,
} from "@/components/patterns/PrototypeSwitcher";
import { SegmentedControl, SegmentedControlItem } from "@/components/patterns/SegmentedControl";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import type { Scenario } from "@/lib/api";
import { formatMoney } from "@/lib/format";
import { standing } from "@/lib/yardstick";
import { CashFlowTable } from "@/pages/decision/CashFlowTable";
import { ScenarioDetails } from "@/pages/decision/ScenarioDetails";
import { Scenarios } from "@/pages/decision/Scenarios";

export const SCENARIO_VARIANTS: PrototypeVariant[] = [
  { key: "atual", name: "Atual: expande na página" },
  { key: "abas", name: "Modal com abas" },
  { key: "lado", name: "Tela cheia lado a lado" },
  { key: "resumo", name: "Resumo na página, modal por cenário" },
  { key: "painel", name: "Painel lateral" },
];

export interface NamedScenario {
  title: string;
  scenario: Scenario;
}

function standingText(scenario: Scenario): string {
  const { owes, amount } = standing(scenario);
  return `${owes ? "Você deve" : "Você tem"} ${amount}`;
}

function CloseButton() {
  return (
    <DialogClose asChild>
      <Button variant="plain" size="inline">
        Fechar
      </Button>
    </DialogClose>
  );
}

function Trigger() {
  return (
    <DialogTrigger asChild>
      <Button variant="outline" size="sm" className="self-start">
        Ver cenários
      </Button>
    </DialogTrigger>
  );
}

function Current({ scenarios }: { scenarios: NamedScenario[] }) {
  return (
    <Scenarios>
      {scenarios.map(({ title, scenario }) => (
        <ScenarioDetails key={title} title={title} scenario={scenario} />
      ))}
    </Scenarios>
  );
}

/** One wide modal; a segmented control shows one scenario at a time. */
function Tabs({ scenarios }: { scenarios: NamedScenario[] }) {
  const [shown, setShown] = useState(scenarios[0].title);
  const current = scenarios.find((s) => s.title === shown) ?? scenarios[0];
  return (
    <Dialog>
      <Trigger />
      <DialogContent variant="wide">
        <DialogHeader>
          <DialogTitle>Cenários</DialogTitle>
          <CloseButton />
        </DialogHeader>
        <DialogDescription className="sr-only">O que cada cenário deixa no fim.</DialogDescription>
        <SegmentedControl
          fill
          value={shown}
          onValueChange={setShown}
          aria-label="Cenário"
          className="self-start"
        >
          {scenarios.map(({ title, scenario }) => (
            <SegmentedControlItem key={title} value={title}>
              {title} · {standing(scenario).amount}
            </SegmentedControlItem>
          ))}
        </SegmentedControl>
        <ScenarioDetails title={current.title} scenario={current.scenario} />
      </DialogContent>
    </Dialog>
  );
}

/** A near full-screen modal: the endings side by side up top, each cash flow scrolling in its column. */
function SideBySide({ scenarios }: { scenarios: NamedScenario[] }) {
  return (
    <Dialog>
      <Trigger />
      <DialogContent variant="full">
        <DialogHeader>
          <DialogTitle>Cenários</DialogTitle>
          <CloseButton />
        </DialogHeader>
        <DialogDescription className="sr-only">Os cenários lado a lado.</DialogDescription>
        <div className="grid min-h-0 flex-1 grid-cols-1 gap-6 md:grid-cols-2">
          {scenarios.map(({ title, scenario }) => (
            <section
              key={title}
              aria-label={title}
              className="flex min-h-0 min-w-0 flex-col gap-3 rounded-lg glass p-4"
            >
              <div className="flex items-baseline justify-between gap-4">
                <h3 className="text-headline">{title}</h3>
                <span className="text-headline tabular-nums">
                  {standingText(scenario)}
                </span>
              </div>
              <p className="text-footnote text-muted-foreground">
                Saldo devedor no fim: {formatMoney(scenario.outstanding_balance)}
              </p>
              <div className="min-h-0 flex-1 overflow-auto">
                <CashFlowTable label={title} flows={scenario.cash_flows} />
              </div>
            </section>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** The endings stay on the page as rows; a row opens only that scenario's cash flow. */
function Summary({ scenarios }: { scenarios: NamedScenario[] }) {
  const [open, setOpen] = useState<NamedScenario>();
  return (
    <>
      <GroupedList aria-label="Cenários">
        {scenarios.map((named) => (
          <GroupedListItem key={named.title}>
            <GroupedListRow asChild>
              <button type="button" onClick={() => setOpen(named)}>
                <GroupedListLabel>{named.title}</GroupedListLabel>
                <GroupedListValue className="tabular-nums">
                  {standingText(named.scenario)}
                </GroupedListValue>
                <GroupedListChevron />
              </button>
            </GroupedListRow>
          </GroupedListItem>
        ))}
      </GroupedList>
      <Dialog open={open !== undefined} onOpenChange={(next) => !next && setOpen(undefined)}>
        <DialogContent variant="wide">
          {open && (
            <>
              <DialogHeader>
                <DialogTitle>{open.title}</DialogTitle>
                <CloseButton />
              </DialogHeader>
              <DialogDescription className="sr-only">
                O fluxo de caixa de {open.title}.
              </DialogDescription>
              <ScenarioDetails title={open.title} scenario={open.scenario} />
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

/** A sheet from the right edge, full height, both scenarios stacked under sticky headings. */
function SidePanel({ scenarios }: { scenarios: NamedScenario[] }) {
  return (
    <Dialog>
      <Trigger />
      <DialogPortal>
        <DialogOverlay />
        <DialogPrimitive.Content className="fixed inset-y-0 right-0 z-50 flex w-full max-w-4xl flex-col bg-popover text-popover-foreground shadow-sheet outline-none data-open:animate-in data-open:slide-in-from-right data-closed:animate-out data-closed:slide-out-to-right">
          <div className="border-b px-6 py-4">
            <DialogHeader>
              <DialogTitle>Cenários</DialogTitle>
              <CloseButton />
            </DialogHeader>
          </div>
          <DialogDescription className="sr-only">
            Os cenários, um abaixo do outro.
          </DialogDescription>
          <nav className="flex gap-2 border-b px-6 py-2">
            {scenarios.map(({ title, scenario }) => (
              <a
                key={title}
                href={`#cenario-${title}`}
                className="rounded-full bg-foreground/5 px-3 py-1 text-footnote hover:bg-foreground/10"
              >
                {title} · {standingText(scenario)}
              </a>
            ))}
          </nav>
          <div className="flex-1 overflow-y-auto">
            {scenarios.map(({ title, scenario }) => (
              <section
                key={title}
                id={`cenario-${title}`}
                aria-label={title}
                className="flex flex-col gap-3 px-6 pb-8"
              >
                <div className="sticky top-0 z-10 -mx-6 flex items-baseline justify-between gap-4 bg-popover/90 px-6 py-3 backdrop-blur">
                  <h3 className="text-headline">{title}</h3>
                  <span className="font-semibold tabular-nums">{standingText(scenario)}</span>
                </div>
                <p className="text-footnote text-muted-foreground">
                  Saldo devedor no fim: {formatMoney(scenario.outstanding_balance)}
                </p>
                <CashFlowTable label={title} flows={scenario.cash_flows} />
              </section>
            ))}
          </div>
        </DialogPrimitive.Content>
      </DialogPortal>
    </Dialog>
  );
}

export function ScenariosPrototype({ scenarios }: { scenarios: NamedScenario[] }) {
  const variant = usePrototypeVariant(SCENARIO_VARIANTS);
  return (
    <>
      {variant === "atual" && <Current scenarios={scenarios} />}
      {variant === "abas" && <Tabs scenarios={scenarios} />}
      {variant === "lado" && <SideBySide scenarios={scenarios} />}
      {variant === "resumo" && <Summary scenarios={scenarios} />}
      {variant === "painel" && <SidePanel scenarios={scenarios} />}
      <PrototypeSwitcher variants={SCENARIO_VARIANTS} current={variant} />
    </>
  );
}
