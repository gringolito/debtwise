# The installment's slack is ignored

A prepay-or-invest comparison leaves the installment's slack to the owner's other spending: no
scenario prepays or holds it, positive or negative, before or after its mortgage is paid off. A
scenario's slack in a month is the difference between the status quo's installment and its own, and
after its mortgage is paid off, the status quo's whole installment. Only a decision on Comparar can
prepay the slack every month, as ADR-0011 did, through a switch that is off unless turned on.
Início's answer, a lot's comparison and an early sale check always ignore it.

Everything else in ADR-0011 holds either way. The prepaid amount, a coupon or a sale's proceeds are
still prepaid on their dates with the effect the owner chose, and what nothing is owed for is held
as cash at zero return. The break-even rate is searched with the same rule as the verdict it belongs
to.

With the slack ignored, prepaying saves partly through installments the owner no longer pays, which
no balance shows. The avoided cost adds what the prepay scenario's installments due after the
decision's date and by the horizon charge less than the status quo's, so it is still what the
prepaid amount would have cost by the horizon. A decision that lowers the installment also states
what doing so gives by the horizon: the interest, insurance and fees those installments charge less,
and how much less they charge in all.

## Considered Options

- **Prepaying the slack by default:** rejected. It is not what market comparisons of the two effects
  assume, nor what owners do, and it makes shortening the term and lowering the installment give the
  same verdict. An owner who forgets to prepay loses money: the slack neither pays off the debt nor
  is spent on purpose.
- **Holding the slack as cash at zero return:** rejected. It treats money the owner spends as saved,
  and still ties the two effects together.
- **The switch on every comparison:** not adopted. Comparar is where an owner weighs one amount
  carefully; Início, lots and early sale checks answer at a glance with the plain rule.
- **Remembering the switch between visits:** rejected. Prepaying the slack every month is a habit to
  opt into each time, not a setting that quietly changes every later verdict.
