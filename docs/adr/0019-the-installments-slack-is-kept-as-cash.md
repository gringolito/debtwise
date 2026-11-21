# The installment's slack is kept as cash

Supersedes ADR-0018.

Every prepay-or-invest comparison keeps equal outflow (ADR-0011): each scenario pays the status
quo's installment every month after the decision's date. What its own installment leaves of it, the
slack, is held as cash at zero return on the installment's due date, positive or negative, before
and after the scenario's mortgage is paid off. Only a decision on Comparar can prepay the slack
every month instead, as ADR-0011 did, through a switch that is off unless turned on. Início's
answer, a lot's comparison and an early sale check always keep it as cash.

Everything else in ADR-0011 holds either way. The prepaid amount, a coupon or a sale's proceeds are
still prepaid on their dates with the effect the owner chose, and what nothing is owed for is held
as cash at zero return. The break-even rate is searched with the same rule as the verdict it belongs
to.

The avoided cost is the prepay scenario's worth less the status quo's, less the amount, as ADR-0011
sets out: the slack it holds is part of that worth, so it counts the installments the owner no
longer pays. A decision that lowers the installment and keeps the slack also states what doing so
gives by the horizon: the interest, insurance and fees those installments charge less, and how much
less they charge in all.

Kept at zero return, the slack still sets the two effects apart. Lowering the installment frees more
of each month's outflow early and shortening the term keeps more of it paying off the balance, which
saves the contract rate, so the effect matters unless the slack is prepaid.

## Context

ADR-0018 left the slack to the owner's other spending: no scenario prepaid or held it. The invest
scenario paid the status quo's installments while the prepay scenario paid lower ones, and the
difference left the comparison. The advantage then counted every real the prepaying owner kept as
lost, by the whole slack, while the avoided cost added it back. A decision lowering the installment
of an ordinary mortgage could say investing wins even at 0% a year, and turning the switch on to
prepay the slack moved the verdict toward prepaying by more than prepaying it can earn.

## Considered Options

- **Leaving the slack out of both scenarios (ADR-0018):** superseded. Money the owner keeps is not
  lost; leaving it out biased every verdict toward investing and broke the break-even rate.
- **Prepaying the slack by default:** rejected, as ADR-0018 found. It is not what owners do, and it
  makes shortening the term and lowering the installment give the same verdict.
- **Crediting the slack only in the advantage:** rejected. The advantage would no longer be the
  difference of the scenarios' net worths the screens show, and the slack would still be missing
  from every date's net worth.
- **Growing the kept slack at a reinvestment rate:** rejected, as ADR-0011 rejects one for freed
  cash. Held at zero return it is conservative for prepaying.
- **The switch on every comparison:** not adopted, as ADR-0018 found. Comparar is where an owner
  weighs one amount carefully; Início, lots and early sale checks answer at a glance with the plain
  rule.
- **Remembering the switch between visits:** rejected, as ADR-0018 found. Prepaying the slack every
  month is a habit to opt into each time, not a setting that quietly changes every later verdict.
