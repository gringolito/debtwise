# Decisions under equal outflow

A decision follows three replays of the mortgage, each with its recorded events, from the decision's
date to the horizon, the compared bond's maturity:

- **Status quo:** nothing is prepaid. Its installments set the outflow of every later month.
- **Prepay:** the amount is prepaid on the decision's date.
- **Invest:** the amount buys the bond, and the remainder is held as cash at zero return. Each
  coupon an NTN-F or NTN-B pays before maturity is prepaid on its date, net of the income tax and
  custody fee ADR-0010 takes from it, the income tax at the bracket of the days since the purchase.

The prepay scenario's initial prepayment and later top-ups, and the invest scenario's coupons, have
the effect the owner chose. They never happened, so a recorded prepayment or statement can't account
for them: each applies after the recorded events of its date, and after that day's installment as
ADR-0008 orders a prepayment. A coupon paid on an installment's due date applies before that day's
top-up. After every installment due after the decision's date, a scenario pays what the status
quo's installment of that month is: its own installment, and the difference prepaid on its due
date. What nothing is owed for any more, a prepayment larger than the balance, a coupon or a month
after the mortgage is paid off, is held as cash at zero return until the horizon.
A month in which a scenario's installment is above the status quo's holds the difference as negative
cash, so both scenarios still pay the same out of pocket.

The bond is bought at the buy rate of its quote, at the unit price Tesouro's methodology gives that
rate for settlement on the decision's date: the VNA projected to that date for an NTN-B Principal.
The quantity is the amount over the unit price, truncated at the hundredth of a bond Tesouro Direto
sells, and costs that quantity times the unit price, rounded to centavos. An amount that buys less
than a hundredth has no verdict.

On the horizon each scenario is worth the bond's net Maturity Value (ADR-0010), its cash, less the
outstanding balance: after the installments due by then and the events dated on or before it,
without interest accrued since the last installment. The advantage is the invest scenario's worth
less the prepay scenario's. The avoided cost is the prepay scenario's worth less the status quo's,
less the amount: what the prepaid amount would have cost by the horizon had it stayed owed.

The break-even rate is the yearly bond rate, from 0% to 100% and of at most 10 decimal places, at
which the same decision gives an advantage within a centavo of zero: the bond bought at the unit
price that rate gives on the decision's date, through the VNA of that date for an IPCA+ bond, in the
hundredths the amount buys. A rate at which the amount buys no hundredth has no verdict, so it is no
break-even either. For an IPCA+ bond the rate is the real rate over IPCA, as Tesouro quotes it.
The search starts from the buy rate, since a higher rate buys the bond cheaper and the advantage
grows with it. Where the amount buys one more hundredth, the advantage jumps by what that hundredth
gains over the cash it takes, often a few reais, and the zero can fall inside that jump. Then no
rate gives an advantage of zero, and the verdict says so instead of naming one, as it does when
investing wins even at 0% or prepaying even at 100%.

A verdict names the projection method of each index a projected value it read comes from: the
mortgage's corrections and contract rates in either scenario, and the VNA of the purchase, of each
coupon and of the maturity.

## Considered Options

- **Valuing the bond at today's quoted unit price:** rejected. The decision's date can be later
  than the quote, and Tesouro computes that price from the same rate, so the rate is what carries
  over to another date.
- **A reinvestment rate for freed cash:** rejected, as the issue's equal outflow rule says. Money
  held until the horizon earns nothing, which is conservative for prepaying.
- **Accruing interest from the last installment to the horizon:** rejected. ADR-0008 charges a
  month's interest on the balance an event leaves, so the balance an owner could pay off on a date is
  the one the schedule shows, and statements' drift uses the same balance.
- **Fractional bonds to the cent of the amount:** rejected. Tesouro Direto sells hundredths of a
  bond, and what is left over is held as cash until the horizon, not prepaid.
- **Reinvesting coupons in the bond or in anything other than the mortgage:** rejected. It would
  need a reinvestment rate, which equal outflow never assumes, and prepaying a coupon on its date
  is what the owner can always do with it.
- **A break-even rate for a bond sold in any fraction:** rejected. It always names a rate, but
  quoted back as the buy rate, that rate leaves an advantage of up to a hundredth's gain, since the
  verdict buys hundredths. A rate the owner can't check against the verdict's own advantage is no
  break-even.
- **The rate where the advantage jumps over zero:** rejected. Quoted back, it leaves the advantage
  on one side of the jump, reais away from zero.
