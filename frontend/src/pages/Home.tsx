import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fetchHealth } from "@/lib/api";

function ServerStatus() {
  const { isPending, isError } = useQuery({ queryKey: ["health"], queryFn: fetchHealth });

  if (isPending) return <Badge variant="outline">Verificando servidor…</Badge>;
  if (isError) return <Badge variant="destructive">Servidor indisponível</Badge>;
  return <Badge>Servidor disponível</Badge>;
}

export function Home() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Status</CardTitle>
      </CardHeader>
      <CardContent>
        <ServerStatus />
      </CardContent>
    </Card>
  );
}
