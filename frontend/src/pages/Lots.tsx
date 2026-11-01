import { Link } from "@tanstack/react-router";
import { LotList } from "@/components/lots/LotList";
import { NewLotForm } from "@/components/lots/LotForms";
import { Section } from "@/components/mortgage/Section";
import { Button } from "@/components/ui/button";

export function Lots() {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-xl font-semibold">Lotes</h2>
        <Button asChild variant="outline">
          <Link to="/lotes/importar">Importar lotes de um arquivo CSV</Link>
        </Button>
      </div>
      <LotList />
      <Section heading="Registrar lote">
        <NewLotForm />
      </Section>
    </div>
  );
}
