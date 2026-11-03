---
status: amended by ADR-0009 and ADR-0012
---

# Indexer corrections on contract anniversaries

An indexed mortgage's outstanding balance is corrected once a month, on the contract's
anniversary. Months run from one day to the same day of the next month, or to the 1st of the month
after when the next month is too short. That is how SGS dates TR periods, so months that start on
the 29th to the 31st start on the 1st from the first short month on, and so do the anniversaries of
a contract signed on those days. Each installment applies, in order, the corrections since the
previous installment, before interest is charged on the corrected balance.

- **TR:** installment _n_ is corrected by the TR of the months, counted from the first
  installment's due date, that end after installment _n−1_'s due date and on or before its own:
  the month from one due date to the next. The correction applies on the last contract anniversary
  on or before installment _n_'s due date, so a prepayment or statement dated from that anniversary
  on sees the corrected balance. The contract updates the balance "monthly on the day corresponding
  to the contract date, based on the updating coefficient applicable to poupança deposits of the
  day corresponding to the due date of the monthly charges", and Caixa's corrections of a contract
  signed on the 18th with installments due on the 19th match these months to SGS's four decimals
  (#38). For example, the installment due 2025-01-19 is corrected by the TR of 2024-12-19 to
  2025-01-19, applied on 2025-01-18. When installments fall due on the contract's day, the months
  are those between anniversaries.
- **IPCA:** each anniversary since the previous installment corrects it, by the IPCA of the second
  calendar month before the anniversary (SGS 433), a fixed two-month lag. The corrections apply on
  the installment's due date.

The first installment is never corrected, whatever its due date, as Caixa doesn't correct it. A
month that ends on or before the first anniversary corrects no installment, and nor do the months
that end by a first installment deferred past them: their corrections are dropped, not carried to a
later installment. The second installment applies the months since the first, as any other does.
This holds for every indexer.

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
- **Applying TR corrections on installment due dates:** rejected. The contract updates the balance
  on the day corresponding to the contract date, so a prepayment between the anniversary and the
  due date pays the corrected balance.
- **Months between due dates for IPCA too:** not taken. The contract clause found is specific to
  poupança-linked TR.
- **IPCA of the previous month:** rejected. IBGE publishes a month's IPCA around the 10th of the
  next, so it isn't known yet on anniversaries early in the month.
