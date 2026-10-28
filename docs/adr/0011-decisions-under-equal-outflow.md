# Decisions under equal outflow

A decision follows three replays of the mortgage, each with its recorded events, from the decision's
date to the horizon, the compared bond's maturity:

- **Status quo:** nothing is prepaid. Its installments set the outflow of every later month.
- **Prepay:** the amount is prepaid on the decision's date.
- **Invest:** the amount buys the bond, and what is left of it is prepaid on the decision's date.

Each prepayment follows that day's installment, as ADR-0008 orders them, and has the effect the
owner chose. After every installment due after the decision's date, a scenario pays what the status
quo's installment of that month is: its own installment, and the difference prepaid right after
it, before the events of that day. What nothing is owed for any more, a prepayment larger than the
balance or a month after the mortgage is paid off, is held as cash at zero return until the horizon.
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

A verdict names the projection method of each index a projected value it read comes from: the
mortgage's corrections in either scenario, and the VNA of the purchase and of the maturity.

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
  bond, and what is left over is cash that frees up on the decision's date.
