import { Page, PageHeader, PageTitle } from "@/components/layout/Page";
import { SectionLayout } from "@/components/layout/SectionLayout";

/** Market is Mercado: the indexes, under Índices, and the Tesouro Direto bonds, under Títulos. */
export function Market() {
  return (
    <Page className="gap-6">
      <PageHeader>
        <PageTitle>Mercado</PageTitle>
      </PageHeader>
      <SectionLayout
        label="Mercado"
        sections={[
          { to: "/mercado", label: "Índices" },
          { to: "/mercado/titulos", label: "Títulos" },
        ]}
      />
    </Page>
  );
}
