# Index projections

Past an index's published values, DebtWise projects it by the method the owner chose for it. It
never takes a value the owner types in.

- **TR:** the average of its latest 12 monthly values (the default) or of its latest 60.
- **Selic target:** the Focus median expectations (the default), or the average of its latest 12 or
  60 monthly values.
- **IPCA:** the Focus median expectations (the default), or the average of its latest 12 or 60
  monthly values of SGS 433.
- **Poupança yield:** not chosen. It is derived from TR and the Selic target, published where they
  are and projected where they aren't, by the legal rule of ADR-0006.

A trailing average is the arithmetic mean of an index's latest monthly values: for TR the periods
that run from the 1st of a month to the 1st of the next, for the Selic target the target in force on
the 1st of a month, and for IPCA each month's value. An index with fewer monthly values than the
average needs has no trailing projection. Every projected value that DebtWise computes, rather than
reads from Focus, is rounded at 4 places of percent, half to even.

Focus answers with the latest survey on or before the refresh, over the respondents of its last 30
days:

- **Selic target:** each Copom meeting's median takes effect on the business day after the meeting
  announces its decision, as BCB's history of the target shows, and holds until the next meeting's
  does. Before the first surveyed meeting, the target in force on the latest published day holds.
  After the last one, its median holds. The meeting dates come from a Copom calendar kept as data,
  built from BCB's history of the target and the calendars BCB publishes a year ahead. A meeting in
  a year whose calendar isn't listed yet is taken on the date of the same meeting in the latest year
  listed.
- **IPCA:** a month's median from `ExpectativaMercadoMensais` while Focus has one, then each year's
  median from `ExpectativasMercadoAnuais` spread evenly over its months, `(1 + a)^(1/12) − 1`, then
  the last annual median held.

Each projected value records the methods of the projected indexes it comes from. A poupança yield
can come from a published TR and a projected Selic target, and then records only the Selic target's.

An installment due by today is corrected only by published values, as ADR-0006 says. An installment
due later is corrected by the published value where there is one and by the projected value where
there isn't, and each value it reads is marked as one or the other. A future month with neither is
reported missing. This replaces ADR-0006's rule that only installments due by today are corrected.

## Considered Options

- **Projected values only, from today on:** rejected. SGS publishes the Selic target up to the next
  meeting and TR for periods that end in the future, and those are facts.
- **A geometric mean for the trailing averages:** rejected. The arithmetic mean is what "average"
  means to the owner and can be checked by hand, and the two differ by little at these rates.
- **Copom meetings placed by a fixed month per meeting number:** rejected. The calendar is public,
  and a meeting placed in the wrong month moves the 8.5% switch of the poupança rule by a month.
- **ANBIMA projections and its term structure:** rejected. The feed is paid, and ANBIMA forbids
  scraping.
- **Deriving TR from the expected Selic:** rejected. TR's formula depends on bank deposit rates that
  have no public projection.
