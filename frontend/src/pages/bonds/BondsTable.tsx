import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { BondQuote } from "@/lib/api";
import { formatDate, formatMoney, formatRate } from "@/lib/format";

const NOT_ON_OFFER = "—";

// The API sends the type and maturity; Tesouro Direto's name is written here, as its names carry
// only those two facts.
function bondTitle({ type, maturity }: BondQuote): string {
  const year = maturity.slice(0, 4);
  return type === "ltn"
    ? `Tesouro Prefixado ${year}`
    : `Tesouro Prefixado com Juros Semestrais ${year}`;
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
            <TableCell>{bond.buy ? formatRate(bond.buy.rate) : NOT_ON_OFFER}</TableCell>
            <TableCell>{bond.buy ? formatMoney(bond.buy.unit_price) : NOT_ON_OFFER}</TableCell>
            <TableCell>{formatRate(bond.sell.rate)}</TableCell>
            <TableCell>{formatMoney(bond.sell.unit_price)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
