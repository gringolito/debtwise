import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { fetchHealth } from "@/lib/api";
import { BestDecision } from "@/pages/dashboard/BestDecision";
import { BestEarlySale } from "@/pages/dashboard/BestEarlySale";
import { LotsPosition } from "@/pages/dashboard/LotsPosition";
import { MarketDataWarnings } from "@/pages/dashboard/MarketDataWarnings";
import { MortgagePosition } from "@/pages/dashboard/MortgagePosition";

function ServerStatus() {
  const { isPending, isError } = useQuery({ queryKey: ["health"], queryFn: fetchHealth });

  if (isPending) return <Badge variant="outline">Verificando servidor…</Badge>;
  if (isError) return <Badge variant="destructive">Servidor indisponível</Badge>;
  return <Badge>Servidor disponível</Badge>;
}

export function Dashboard() {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-xl font-semibold">Painel</h2>
        <ServerStatus />
      </div>
      <MarketDataWarnings />
      <div className="grid gap-4 md:grid-cols-2">
        <MortgagePosition />
        <LotsPosition />
      </div>
      <BestDecision />
      <BestEarlySale />
    </div>
  );
}
