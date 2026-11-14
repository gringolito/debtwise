import {
  CalendarIcon,
  HouseIcon,
  type LucideIcon,
  ReceiptTextIcon,
  TrendingUpIcon,
} from "lucide-react";
import {
  GroupedList,
  GroupedListItem,
  GroupedListLabel,
  GroupedListRow,
} from "@/components/patterns/GroupedList";
import { Button } from "@/components/ui/button";

const features: { icon: LucideIcon; text: string }[] = [
  { icon: CalendarIcon, text: "Entenda cada prestação, mês a mês." },
  { icon: TrendingUpIcon, text: "Compare amortizar com investir no Tesouro Direto." },
  { icon: ReceiptTextIcon, text: "Confira o cálculo com os extratos do seu banco." },
];

export function Welcome({ onStart }: { onStart: () => void }) {
  return (
    <main className="mx-auto flex min-h-svh w-full max-w-140 flex-col items-center justify-center px-4 py-16 text-center">
      <div className="mb-8 flex size-18 items-center justify-center rounded-lg bg-primary">
        <HouseIcon aria-hidden="true" strokeWidth={1.5} className="size-8 text-accent-soft" />
      </div>
      <h1 className="mb-3 text-large-title">Seu financiamento, com clareza.</h1>
      <p className="mb-8 text-muted-foreground">
        Acompanhe o saldo devedor e descubra, a cada mês, se vale mais amortizar ou investir.
      </p>
      <GroupedList className="mb-8 w-full text-left">
        {features.map(({ icon: Icon, text }) => (
          <GroupedListItem key={text}>
            <GroupedListRow className="text-callout">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-accent-tint">
                <Icon aria-hidden="true" strokeWidth={1.5} className="size-4 text-accent" />
              </span>
              <GroupedListLabel>{text}</GroupedListLabel>
            </GroupedListRow>
          </GroupedListItem>
        ))}
      </GroupedList>
      <Button onClick={onStart} className="mb-3 w-full">
        Configurar meu financiamento
      </Button>
      <p className="text-footnote text-muted-foreground">
        Leva cerca de 5 minutos. Tenha o contrato em mãos.
      </p>
    </main>
  );
}
