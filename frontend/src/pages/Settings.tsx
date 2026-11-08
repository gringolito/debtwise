import { Link } from "@tanstack/react-router";
import { useId } from "react";
import { Page, PageHeader, PageTitle } from "@/components/layout/Page";
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
import type { RegisteredMortgage } from "@/lib/api";
import { formatMoney, formatNumber } from "@/lib/format";
import { indexNames } from "@/lib/indexNames";
import { amortizationSystemLabels } from "@/lib/mortgageForm";
import { useMortgage, useStatements } from "@/lib/mortgageQueries";
import { DeleteMortgage } from "@/pages/settings/DeleteMortgage";
import { MarketDataSection } from "@/pages/settings/MarketDataSection";
import { ProjectionsSection } from "@/pages/settings/ProjectionsSection";

const SOURCE_CODE_URL = "https://github.com/gringolito/debtwise";

function statementCount(count: number): string {
  if (count === 0) return "Nenhum";
  return `${formatNumber(String(count))} ${count === 1 ? "registrado" : "registrados"}`;
}

function MortgageSection({ mortgage }: { mortgage: RegisteredMortgage }) {
  const headerId = useId();
  const statements = useStatements().data?.statements;
  return (
    <GroupedListSection aria-labelledby={headerId}>
      <GroupedListHeader id={headerId}>Financiamento</GroupedListHeader>
      <GroupedList>
        <GroupedListItem>
          <GroupedListRow asChild>
            <Link to="/financiamento/editar">
              <GroupedListLabel>Contrato</GroupedListLabel>
              <GroupedListValue>
                {[
                  formatMoney(mortgage.original_amount),
                  amortizationSystemLabels[mortgage.amortization_system],
                  mortgage.indexer === "none" ? "Prefixado" : indexNames[mortgage.indexer],
                ].join(" · ")}
              </GroupedListValue>
              <GroupedListChevron />
            </Link>
          </GroupedListRow>
        </GroupedListItem>
        <GroupedListItem>
          <GroupedListRow asChild>
            <Link to="/financiamento" search={{ secao: "extratos" }}>
              <GroupedListLabel>Extratos do banco</GroupedListLabel>
              {statements && (
                <GroupedListValue>{statementCount(statements.length)}</GroupedListValue>
              )}
              <GroupedListChevron />
            </Link>
          </GroupedListRow>
        </GroupedListItem>
      </GroupedList>
    </GroupedListSection>
  );
}

function AboutSection() {
  const headerId = useId();
  return (
    <GroupedListSection aria-labelledby={headerId}>
      <GroupedListHeader id={headerId}>Sobre</GroupedListHeader>
      <GroupedList>
        <GroupedListItem>
          <GroupedListRow asChild>
            <a href={SOURCE_CODE_URL} target="_blank" rel="noreferrer">
              <GroupedListLabel>Código-fonte</GroupedListLabel>
              <GroupedListChevron />
            </a>
          </GroupedListRow>
        </GroupedListItem>
      </GroupedList>
    </GroupedListSection>
  );
}

// The gate on the shell opens this page only once the mortgage is loaded and registered.
export function Settings() {
  const { data } = useMortgage();
  if (!data) return null;
  return (
    <Page>
      <PageHeader>
        <PageTitle>Ajustes</PageTitle>
      </PageHeader>
      <MortgageSection mortgage={data} />
      <MarketDataSection />
      <ProjectionsSection />
      <AboutSection />
      <DeleteMortgage />
    </Page>
  );
}
