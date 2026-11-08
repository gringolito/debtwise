import { Badge } from "@/components/ui/badge";
import { TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { LotAmount, ProjectedBy } from "@/lib/api";
import { formatMoney } from "@/lib/format";
import { projectedByText } from "@/lib/projectionMethods";

/** ProjectionCell marks an amount projected and names the methods, or shows a dash when it isn't. */
export function ProjectionCell({ methods }: { methods: ProjectedBy[] }) {
  if (methods.length === 0) return <TableCell>—</TableCell>;
  return (
    <TableCell>
      <Badge variant="secondary">Projetado</Badge>
      <span className="block text-footnote text-muted-foreground">{projectedByText(methods)}</span>
    </TableCell>
  );
}

export function AmountRow({ name, amount }: { name: string; amount: LotAmount }) {
  return (
    <TableRow>
      <TableHead scope="row">{name}</TableHead>
      <TableCell>{formatMoney(amount.gross)}</TableCell>
      <TableCell>{formatMoney(amount.iof)}</TableCell>
      <TableCell>{formatMoney(amount.income_tax)}</TableCell>
      <TableCell>{formatMoney(amount.custody_fee)}</TableCell>
      <TableCell>{formatMoney(amount.net)}</TableCell>
      <ProjectionCell methods={amount.projected_by} />
    </TableRow>
  );
}

/** AmountsHeader is the head row of a table of AmountRow rows. */
export function AmountsHeader() {
  return (
    <TableHeader>
      <TableRow>
        <TableHead>Valor</TableHead>
        <TableHead>Bruto</TableHead>
        <TableHead>IOF</TableHead>
        <TableHead>IR</TableHead>
        <TableHead>Taxa de custódia</TableHead>
        <TableHead>Líquido</TableHead>
        <TableHead>Projeção</TableHead>
      </TableRow>
    </TableHeader>
  );
}
