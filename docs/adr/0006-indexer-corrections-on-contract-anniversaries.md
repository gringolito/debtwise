---
status: amended by ADR-0009 and ADR-0012
---

# Indexer corrections on contract anniversaries

An indexed mortgage's outstanding balance is corrected on each installment's due date, and under
TR on each prepayment's date too. Months run from one day to the same day of the next month, or to
the 1st of the month after when the next month is too short. That is how SGS dates TR periods, so
months that start on the 29th to the 31st start on the 1st from the first short month on, and so
do the anniversaries of a contract signed on those days. Each installment applies its corrections
before interest is charged on the corrected balance.

- **TR:** the balance is updated pro rata die, from the last update, inclusive, to an event's date,
  exclusive, as clause 6.2 of the #37 contract reads: "Na apuração do saldo devedor será aplicada a
  atualização proporcional, pro rata die, no período entre a data de aniversário do contrato ou a
  data da última atualização contratual do saldo devedor, se ocorrida após o último aniversário do
  contrato, inclusive e a data do evento, exclusive." The events are each installment's due date,
  as clause 6 updates the balance monthly "no vencimento do encargo", and each prepayment's date
  (ADR-0008). The first update starts on the contract date, and the first installment is updated
  as any other.

  An update from date _a_ to date _b_ reads the SGS 226 TR of the period that starts on the first
  due day on or after _a_, and of each later period that starts before _b_. Periods start on the
  first due day on or after the contract date. A period the update covers whole applies its TR in
  full, rounded to centavos. A part period applies it for the update's calendar days in it over 30,
  rounded down. Installments with no event between them cover whole periods: installment _n_ is
  updated by the TR of installment _n−1_'s due date to its own, which matches Caixa's corrections
  of a contract signed on the 18th with installments due on the 19th to SGS's four decimals (#38).
  On that contract a prepayment on 2024-12-17 is updated for 29 days by 29/30 of the TR of
  2024-11-19 to 2024-12-19, R$ 451.87, and installment 1, due 2024-12-19, for the 2 days since by
  2/30 of the TR of 2024-12-19 to 2025-01-19, R$ 43.57, as Caixa's was. Caixa's update at the
  prepayment was R$ 455.55; the R$ 3.68 between them is unexplained (#74).
- **IPCA:** each anniversary since the previous installment corrects it, by the IPCA of the second
  calendar month before the anniversary (SGS 433), a fixed two-month lag. The corrections apply on
  the installment's due date. The first installment is never corrected, whatever its due date. A
  month that ends on or before the first anniversary corrects no installment, and nor do the
  months that end by a first installment deferred past them: their corrections are dropped, not
  carried to a later installment. The second installment applies the months since the first, as
  any other does.

Each correction reads a published value. For TR it is the SGS 226 row whose period is exactly that
month; shorter rows SGS publishes with the same start are not used.

The poupança yield is not an indexer: a mortgage whose contract rate adds its additional part is
corrected by TR (ADR-0012).

Only installments due by today are corrected. ADR-0009 corrects later installments by projected
values. When a value a past month needs isn't stored, the month is left uncorrected and reported as
missing, never corrected by zero.

## Considered Options

- **TR of the months between contract anniversaries:** replaced. It agrees with Caixa only when
  installments fall due on the contract's day. On a contract due the day after its anniversaries,
  it was off by up to about 24% of each correction (#38).
- **Applying TR corrections on the last contract anniversary before the due date:** replaced. The
  contract's summary updates the balance "monthly on the day corresponding to the contract date",
  but clause 6 of its conditions updates it on the due date. Caixa's figures after a prepayment on
  2024-12-17, the day before an anniversary, fit the due date (#73).
- **Never correcting the first TR installment:** replaced. Caixa corrected installment 1 of the
  #37 contract by R$ 43.57, and the pro rata rule above matches it to the centavo (#74).
- **Other pro rata rules for TR:** rejected. A joint search over TR period choices, calendar or
  business days, divisors of 30, 21, the period's own length or the calendar month, linear or
  compounded updates, rounding and endpoint conventions found no other rule that fits both the
  prepayment's and installment 1's updates. Calendar-month TR (SGS rows from the 1st) and BCB's
  business-day proration don't fit (#74).
- **Months between due dates for IPCA too:** not taken. The contract clause found is specific to
  poupança-linked TR.
- **IPCA of the previous month:** rejected. IBGE publishes a month's IPCA around the 10th of the
  next, so it isn't known yet on anniversaries early in the month.
