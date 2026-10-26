# Prepayments and statements replay between installments

The schedule replays the owner's prepayments and the bank's statements in date order. Each one
applies after every installment due on or before its date and before the next one, so a prepayment
or statement dated on a due date follows that day's installment. On the same date, prepayments
apply before statements, since a statement reports the balance a prepayment that day left. The
next installment's indexer correction and interest are then charged on the balance they leave.

- **Prepayment:** takes its amount off the outstanding balance, or what is still owed when it is
  more. Shortening the term keeps the amortization system's installment: the months left become
  the fewest whose installment, under SAC its amortization and under Price its amortization plus
  interest, at the rate of the next installment, is no higher than before the prepayment. Lowering
  the installment keeps the months left, and the installment follows from the lower balance. Price
  levels the installment again either way. Each installment reports what the prepayments after it
  took off; those dated before the first installment only lower the balance it starts from.
- **Statement:** replaces the computed outstanding balance with the stated one, and the schedule
  continues from it. Its drift is the stated balance minus the one the schedule shows on its date:
  after the installments due by then and the prepayments and statements before it, without
  interest accrued since the last installment. A mortgage has at most one statement per date, so
  each date has one balance to continue from; prepayments on one date add up.

Once nothing is owed, the schedule ends. It doesn't add installments the contract no longer has:
later prepayments take nothing off, and later statements only report their drift against a
computed balance of zero.

Prepayments and statements belong to the mortgage and are kept when its terms are edited. They are
checked against the terms when recorded; the replay applies them whatever the terms become, so
fixing the terms never requires deleting them first. Drift is computed on every read, never stored.

## Considered Options

- **Applying events on the next installment's due date:** rejected. A prepayment paid mid-month
  would still be charged a full month of interest by the model, and a statement couldn't be
  compared with the balance on its own date.
- **Shortening the term by keeping the installment exactly, with a smaller last one:** rejected.
  Under SAC the installment falls every month, so there's no single installment to keep, and
  rounding the months left to a whole term under the system's own rule keeps SAC and Price alike.
- **Restarting installments from a statement dated after the computed payoff:** rejected. There is
  no term left to amortize it over; its drift already tells the owner the model has stopped
  tracking the contract.
- **Rejecting edits to the terms that leave recorded events out of range:** rejected. The owner
  would have to delete real prepayments to correct a typo in the contract date.
