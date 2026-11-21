# Bonds mature before the payoff

A decision offers only the bonds that mature before the mortgage's payoff as recorded: the due date
of the last installment of its schedule replayed with its recorded prepayments and statements, or
the date of the event that paid it off before its first installment. Investing instead of prepaying
makes sense only while the bond's Maturity Value can still go into the mortgage. A bond maturing on
the payoff or later pays out once the last installment has left nothing to prepay, so its verdict
would weigh the bond against a mortgage that no longer exists.

The payoff is the recorded one. Prepaying moves it earlier by design, and the bond is what the owner
buys instead of prepaying, so the payoff of the scenario that prepays doesn't bound it.

The rule only limits what a decision offers, as ADR-0007's does. A recorded lot is compared and
checked for an early sale whatever its maturity, because the owner already holds it.

## Considered Options

- **The contract's last due date:** rejected. A recorded prepayment that shortened the term already
  moved the payoff earlier, and the recorded payoff is the date the screens show as the expected
  payoff.
- **Comparing every bond and holding what it pays after the payoff as cash (ADR-0011):** rejected.
  The verdict then ranked a bond partly on years without debt, where the comparison is no longer
  between prepaying and investing.
- **Including a bond that matures on the payoff:** rejected. Its Maturity Value arrives the day the
  last installment is paid, with nothing left to prepay.

## Consequences

- A mortgage close to its payoff can have no bond to compare, and the decision says so.
- Recording a prepayment that shortens the term can take bonds out of the decisions.
- Mercado's Títulos lists among the bonds a decision compares only those maturing before the
  payoff, read from the schedule's last installment (`comparesWith` in
  `frontend/src/lib/bondKinds.ts`).
