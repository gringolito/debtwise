import { ImportLotsForm } from "@/components/lots/ImportLotsForm";
import { LotList } from "@/components/lots/LotList";
import { NewLotForm } from "@/components/lots/LotForms";
import { Section } from "@/components/mortgage/Section";

export function Lots() {
  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-xl font-semibold">Lotes</h2>
      <LotList />
      <Section heading="Registrar lote">
        <NewLotForm />
      </Section>
      <Section heading="Importar lotes de um arquivo CSV">
        <ImportLotsForm />
      </Section>
    </div>
  );
}
