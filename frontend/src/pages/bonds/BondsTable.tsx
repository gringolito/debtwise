import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { BondQuote } from "@/lib/api";
import { bondKinds, bondRate } from "@/lib/bondKinds";
import { formatDate, formatMoney } from "@/lib/format";

const NOT_ON_OFFER = "—";

function bondTitle({ type, maturity }: BondQuote): string {
  return `${bondKinds[type].name} ${maturity.slice(0, 4)}`;
}

export function BondsTable({ bonds }: { bonds: BondQuote[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Título</TableHead>
          <TableHead>Vencimento</TableHead>
          <TableHead>Taxa de compra</TableHead>
          <TableHead>Preço de compra</TableHead>
          <TableHead>Taxa de venda</TableHead>
          <TableHead>Preço de venda</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {bonds.map((bond) => (
          <TableRow key={`${bond.type}-${bond.maturity}`}>
            <TableCell>{bondTitle(bond)}</TableCell>
            <TableCell>{formatDate(bond.maturity)}</TableCell>
            <TableCell>{bond.buy ? bondRate(bond.type, bond.buy.rate) : NOT_ON_OFFER}</TableCell>
            <TableCell>{bond.buy ? formatMoney(bond.buy.unit_price) : NOT_ON_OFFER}</TableCell>
            <TableCell>{bondRate(bond.type, bond.sell.rate)}</TableCell>
            <TableCell>{formatMoney(bond.sell.unit_price)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
