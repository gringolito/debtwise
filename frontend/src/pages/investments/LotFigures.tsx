import { useId } from "react";
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

function Figure({ label, amount, note }: { label: string; amount?: LotAmount; note: string }) {
  return (
    <div className="flex flex-1 flex-col gap-1 not-first:border-l not-first:pl-6">
      <dt className="text-footnote tracking-wide text-muted-foreground uppercase">{label}</dt>
      <dd className="text-large-title font-semibold tabular-nums">
        {amount ? formatMoney(amount.net) : "—"}
      </dd>
      <dd className="text-footnote text-muted-foreground">{note}</dd>
    </div>
  );
}

/** KeyFigures are a lot's net Market, Accrual and Maturity Values side by side. */
export function KeyFigures({ lot, values }: { lot: LotValued; values: LotValues }) {
  return (
    <dl className="flex gap-6 rounded-lg glass p-6">
      <Figure
        label="Valor a mercado"
        amount={values.market}
        note={values.market ? "se vender hoje, líquido" : "sem preço de venda hoje"}
      />
      <Figure
        label="Valor na curva"
        amount={values.accrual}
        note={values.accrual ? "pela taxa contratada, líquido" : "título vencido"}
      />
      <Figure
        label="No vencimento"
        amount={values.maturity}
        note={`em ${formatDate(lot.maturity)}, líquido`}
      />
    </dl>
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
