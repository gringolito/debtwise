---
status: amended by ADR-0009 and ADR-0012
---

# Indexer corrections on contract anniversaries

An indexed mortgage's outstanding balance is corrected once a month, on the contract's
anniversary, for the month that ends there. Months run from one anniversary to the same day of the
next month, or to the 1st of the month after when the next month is too short. That is how SGS
dates TR periods, so a contract signed on the 29th to the 31st has its anniversaries on the 1st
from the first one on. Each installment applies, in order, the corrections of every anniversary
since the previous installment, before interest is charged on the corrected balance.

The first installment is never corrected, whatever its due date, as Caixa doesn't correct it. The
month that ends on the first anniversary corrects no installment, and nor do the months that end
on anniversaries up to a first installment deferred past them: their corrections are dropped, not
carried to a later installment. The second installment applies the anniversaries since the first,
as any other does. This holds for every indexer.

Each correction reads a published value:

- **TR:** the SGS 226 row whose period is exactly that month. Shorter rows SGS publishes with the
  same start are not used.
- **IPCA:** the IPCA of the second calendar month before the anniversary (SGS 433), a fixed
  two-month lag.

The poupança yield is not an indexer: a mortgage whose contract rate adds its additional part is
corrected by TR (ADR-0012).

Only installments due by today are corrected. ADR-0009 corrects later installments by projected
values. When a value a past month needs isn't stored, the month is left uncorrected and reported as
missing, never corrected by zero.

## Considered Options

- **Correcting on installment due dates:** rejected. The issue asks for the contract's anniversary,
  and periods starting on due dates wouldn't match the TR of the contract.
- **IPCA of the previous month:** rejected. IBGE publishes a month's IPCA around the 10th of the
  next, so it isn't known yet on anniversaries early in the month.
