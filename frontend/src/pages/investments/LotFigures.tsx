import { useId } from "react";
import { KeyFigure, KeyFigures } from "@/components/mortgage/KeyFigures";
import { GroupedListHeader, GroupedListSection } from "@/components/patterns/GroupedList";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { LotAmount, LotCoupon, LotValued, LotValues } from "@/lib/api";
import { formatDate, formatMoney } from "@/lib/format";

/** LotKeyFigures are a lot's net Market, Accrual and Maturity Values side by side. */
export function LotKeyFigures({ lot, values }: { lot: LotValued; values: LotValues }) {
  return (
    <KeyFigures>
      <KeyFigure
        name="Valor a mercado"
        note={values.market ? "se vender hoje, líquido" : "sem preço de venda hoje"}
      >
        {values.market ? formatMoney(values.market.net) : "—"}
      </KeyFigure>
      <KeyFigure
        name="Valor na curva"
        note={values.accrual ? "pela taxa contratada, líquido" : "título vencido"}
      >
        {values.accrual ? formatMoney(values.accrual.net) : "—"}
      </KeyFigure>
      <KeyFigure name="No vencimento" note={`em ${formatDate(lot.maturity)}, líquido`}>
        {values.maturity ? formatMoney(values.maturity.net) : "—"}
      </KeyFigure>
    </KeyFigures>
  );
}

const deductions: { label: string; of: (amount: LotAmount) => string }[] = [
  { label: "Valor bruto", of: (amount) => amount.gross },
  { label: "Imposto de renda", of: (amount) => amount.income_tax },
  { label: "Taxa de custódia (B3)", of: (amount) => amount.custody_fee },
  { label: "IOF", of: (amount) => amount.iof },
  { label: "Valor líquido", of: (amount) => amount.net },
];

/** Deductions are what each of a lot's values pays in income tax, custody fee and IOF. */
export function Deductions({ values }: { values: LotValues }) {
  const columns = [
    { label: "A mercado", amount: values.market },
    { label: "Na curva", amount: values.accrual },
    { label: "No vencimento", amount: values.maturity },
  ];
  const titleId = useId();
  return (
    <GroupedListSection>
      <GroupedListHeader id={titleId}>Descontos</GroupedListHeader>
      <Table variant="grouped" aria-labelledby={titleId}>
        <TableHeader>
          <TableRow variant="grouped">
            <TableHead variant="grouped">
              <span className="sr-only">Valor</span>
            </TableHead>
            {columns.map((column) => (
              <TableHead key={column.label} variant="grouped" align="end">
                {column.label}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {deductions.map((deduction) => (
            <TableRow key={deduction.label} variant="grouped">
              <TableHead scope="row" variant="grouped-row">
                {deduction.label}
              </TableHead>
              {columns.map((column) => (
                <TableCell key={column.label} variant="grouped" align="end">
                  {column.amount ? formatMoney(deduction.of(column.amount)) : "—"}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </GroupedListSection>
  );
}

const couponColumns: { label: string; of: (coupon: LotCoupon) => string }[] = [
  { label: "Bruto", of: (coupon) => coupon.gross },
  { label: "IR", of: (coupon) => coupon.income_tax },
  { label: "Custódia", of: (coupon) => coupon.custody_fee },
  { label: "Líquido", of: (coupon) => coupon.net },
];

/** Coupons lists the coupons a lot is paid before its bond matures, past and future. */
export function Coupons({ coupons }: { coupons: LotCoupon[] }) {
  const titleId = useId();
  return (
    <GroupedListSection>
      <GroupedListHeader id={titleId}>Cupons</GroupedListHeader>
      {coupons.length === 0 ? (
        <p className="rounded-lg glass px-4 py-3.5 text-muted-foreground">
          Nenhum cupom antes do vencimento.
        </p>
      ) : (
        <Table variant="grouped" aria-labelledby={titleId}>
          <TableHeader>
            <TableRow variant="grouped">
              <TableHead variant="grouped">Data</TableHead>
              <TableHead variant="grouped">Situação</TableHead>
              {couponColumns.map((column) => (
                <TableHead key={column.label} variant="grouped" align="end">
                  {column.label}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {coupons.map((coupon) => (
              <TableRow key={coupon.date} variant="grouped">
                <TableCell variant="grouped">{formatDate(coupon.date)}</TableCell>
                <TableCell variant="grouped">
                  <span className="text-muted-foreground">
                    {coupon.paid ? "Pago" : "A receber"}
                  </span>
                </TableCell>
                {couponColumns.map((column) => (
                  <TableCell key={column.label} variant="grouped" align="end">
                    {formatMoney(column.of(coupon))}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </GroupedListSection>
  );
}
