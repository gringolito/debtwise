# Prepayment outcomes and previews are replayed differences

A prepayment's outcome is how much it changed the schedule: the installments it removed and the
reduction in the first installment due after its date. Both are the difference between two replays
(ADR-0008). Prepayment i is compared with the replay of the statements and the prepayments listed
before it, in date order, against the same replay with i added. What one prepayment changes is then
not credited to another, and the outcomes add up: the installments the prepayments shorten sum to
the installments of the replay with statements only minus those of the replay with every event.
Where a prepayment leaves no installment of the number it is compared at, the whole installment is
the reduction; where none is due after its date, the reduction is zero.

A preview replays a hypothetical event without storing it. A preview of an edit names the recorded
event it replaces, which is left out of the replay, so the recorded schedule is compared with the
one the edit would give. A statement preview refuses a date another statement has, as recording it
would, and answers the drift the statement would show once recorded. Both are computed on each
request and stored nowhere, as every figure that depends on the history of the indexes is.

A drift counts as within rounding when it is zero or under 0.001% of the balance the schedule
computed, either way. The bank and the schedule round each charge to centavos, and the corrections
those charges compound on grow with the balance, so the line grows with it: R$ 4,30 on a balance of
R$ 430.000,00, ten centavos on R$ 10.000,00. It is the tolerance the schedule is held to against a
real contract's statements. A larger drift says the terms no longer match the contract. The Drift
reports the verdict, so every screen draws the same line.

## Considered Options

- **Comparing each prepayment with the schedule without any prepayment:** rejected. Every
  prepayment after the first would be credited with what the earlier ones already changed, and the
  outcomes would not add up to the whole.
- **Comparing each prepayment with the schedule without only that prepayment:** rejected. It
  gives each prepayment its marginal effect, which depends on the ones that follow it, so the
  outcomes again do not add up to the whole.
- **Storing each prepayment's outcome when it is recorded:** rejected. An edit to the terms or to
  any earlier event, or a newly published index value, would leave stored outcomes stale. Drift is
  computed on every read for the same reason (ADR-0008).
- **A drift threshold set by the owner:** not taken. Nothing in the contract or the statements calls
  for another line, and a setting could make two screens disagree on the same drift.
- **A fixed amount, such as R$ 1,00, as the threshold:** rejected. On a large balance it would call
  a few reais of ordinary rounding drift, and near the end of the term it would let a mismatch that
  is a large share of what is left pass as rounding.
