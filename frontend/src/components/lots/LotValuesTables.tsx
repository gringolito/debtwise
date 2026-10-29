import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { LotAmount, LotCoupon, LotValues, ProjectedBy } from "@/lib/api";
import { formatDate, formatMoney } from "@/lib/format";
import { projectedByText } from "@/lib/projectionMethods";

function ProjectionCell({ methods }: { methods: ProjectedBy[] }) {
  if (methods.length === 0) return <TableCell>—</TableCell>;
  return (
    <TableCell>
      <Badge variant="secondary">Projetado</Badge>
      <span className="block text-xs text-muted-foreground">{projectedByText(methods)}</span>
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

/** LotAmountsTable shows the Accrual, Market and Maturity Values of a lot, taxes and fees apart. */
export function LotAmountsTable({ label, values }: { label: string; values: LotValues }) {
  return (
    <Table aria-label={`Valores de ${label}`}>
      <AmountsHeader />
      <TableBody>
        {values.accrual && <AmountRow name="Na curva" amount={values.accrual} />}
        {values.market ? (
          <AmountRow name="A mercado" amount={values.market} />
        ) : (
          values.accrual && (
            <TableRow>
              <TableHead scope="row">A mercado</TableHead>
              <TableCell colSpan={6}>Sem cotação de venda para este título.</TableCell>
            </TableRow>
          )
        )}
        <AmountRow name="No vencimento" amount={values.maturity} />
      </TableBody>
    </Table>
  );
}

function CouponRow({ coupon }: { coupon: LotCoupon }) {
  return (
    <TableRow>
      <TableCell>{formatDate(coupon.date)}</TableCell>
      <TableCell>{coupon.paid ? "Pago" : "A pagar"}</TableCell>
      <TableCell>{formatMoney(coupon.gross)}</TableCell>
      <TableCell>{formatMoney(coupon.iof)}</TableCell>
      <TableCell>{formatMoney(coupon.income_tax)}</TableCell>
      <TableCell>{formatMoney(coupon.custody_fee)}</TableCell>
      <TableCell>{formatMoney(coupon.net)}</TableCell>
      <ProjectionCell methods={coupon.projected_by} />
    </TableRow>
  );
}

/** CouponsTable lists the coupons a lot is paid before its bond matures, past and future. */
export function CouponsTable({ label, coupons }: { label: string; coupons: LotCoupon[] }) {
  if (coupons.length === 0) return <p>Nenhum cupom antes do vencimento.</p>;
  return (
    <Table aria-label={`Cupons de ${label}`}>
      <TableHeader>
        <TableRow>
          <TableHead>Data</TableHead>
          <TableHead>Situação</TableHead>
          <TableHead>Bruto</TableHead>
          <TableHead>IOF</TableHead>
          <TableHead>IR</TableHead>
          <TableHead>Taxa de custódia</TableHead>
          <TableHead>Líquido</TableHead>
          <TableHead>Projeção</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {coupons.map((coupon) => (
          <CouponRow key={coupon.date} coupon={coupon} />
        ))}
      </TableBody>
    </Table>
  );
}
