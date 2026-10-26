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

type BondType = BondQuote["type"];

// The API sends the type and maturity; Tesouro Direto's name is written here, as its names carry
// only those two facts. IPCA+ rates are real rates over IPCA.
const BOND_KINDS: Record<BondType, { name: string; ipcaLinked: boolean }> = {
  ltn: { name: "Tesouro Prefixado", ipcaLinked: false },
  ntn_f: { name: "Tesouro Prefixado com Juros Semestrais", ipcaLinked: false },
  ntn_b_principal: { name: "Tesouro IPCA+", ipcaLinked: true },
  ntn_b: { name: "Tesouro IPCA+ com Juros Semestrais", ipcaLinked: true },
};

function bondTitle({ type, maturity }: BondQuote): string {
  return `${BOND_KINDS[type].name} ${maturity.slice(0, 4)}`;
}

function bondRate(type: BondType, rate: string): string {
  return BOND_KINDS[type].ipcaLinked ? `IPCA + ${formatRate(rate)}` : formatRate(rate);
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
