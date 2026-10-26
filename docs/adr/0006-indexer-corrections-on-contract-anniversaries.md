# Indexer corrections on contract anniversaries

An indexed mortgage's outstanding balance is corrected once a month, on the contract's
anniversary, for the month that ends there. Months run from one anniversary to the same day of the
next month, or to the 1st of the month after when the next month is too short. That is how SGS
dates TR and poupança periods, so a contract signed on the 29th to the 31st has its anniversaries
on the 1st from the first one on. Each installment applies, in order, the corrections of every
anniversary since the previous installment, before interest is charged on the corrected balance.
An installment due on the contract date has none; one deferred past an anniversary has several.

Each correction reads a published value:

- **TR:** the SGS 226 row whose period is exactly that month. Shorter rows SGS publishes with the
  same start are not used.
- **Poupança yield:** derived from that month's TR and the Selic target in force on its first day
  (SGS 432) by the legal rule (Lei 8.177/1991, art. 12): TR compounded with 0.5% a month while the
  Selic target is above 8.5% a year, or with 70% of it turned into a monthly rate while it is at or
  below 8.5%. The Selic-based part and the result are rounded half to even at 4 places of percent,
  which reproduces every value SGS 195 published from June 2012 on.
- **IPCA:** the IPCA of the second calendar month before the anniversary (SGS 433), a fixed
  two-month lag.

Only installments due by today are corrected. When a value a past month needs isn't stored, the
month is left uncorrected and reported as missing, never corrected by zero.

## Considered Options

- **Correcting on installment due dates:** rejected. The issue asks for the contract's anniversary,
  and periods starting on due dates wouldn't match the TR of the contract.
- **Reading SGS 195 for the poupança yield:** rejected. It has no rows for periods starting on the
  29th to the 31st, and projections derive the poupança yield from projected TR and Selic by the
  same rule.
- **IPCA of the previous month:** rejected. IBGE publishes a month's IPCA around the 10th of the
  next, so it isn't known yet on anniversaries early in the month.
