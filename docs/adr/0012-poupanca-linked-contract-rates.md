# Poupança-linked contract rates

Some contracts, such as Caixa's poupança mortgages, are indexed by TR and charge a contract rate
made of a fixed part plus the poupança yield's additional part over TR. TR alone corrects the
outstanding balance (ADR-0006). No mortgage is corrected by the whole poupança yield, so it can't be
a mortgage's indexer.

A contract rate row can add that part to its rate, which is then the fixed part. Each installment's
rate adds the part of the month that ends on its due date, which starts on the previous
installment's due date, or a month before the first installment's. The Selic target in force on the
month's first day sets the part by the legal rule (Lei 8.177/1991, art. 12): 0.5% a month while the
target is above 8.5% a year, or 70% of the target turned into a monthly rate while it is at or below
8.5%. The Selic-based part, and the poupança yield it makes with TR, are rounded half to even at 4
places of percent, which reproduces every value SGS 195 published from June 2012 on.

The part is turned into an effective annual rate, `(1 + part)^12 − 1`, and added to the fixed part,
both as effective annual rates. A fixed part printed as nominal is turned into its effective rate
first. The installment is charged the monthly rate that compounds to the sum. With a fixed part of
3.89% and the target above 8.5%, the part is 6.1678% a year and the rate 10.0578%, the 10.06% the
contract prints.

The Selic target is read as corrections read their index values (ADR-0009): an installment due by
today reads a published target only, and a later one the published target where there is one and
the projected one where there isn't. A month without one is charged the fixed part alone, and its
Selic target is reported missing. A projected target records its method on the installment, as a
projected correction does.

## Considered Options

- **Correcting the balance by the whole poupança yield, with a fixed rate on top:** rejected. It was
  DebtWise's model before this decision, and a real contract shows the yield going into the rate
  while TR corrects the balance, so it misstated both.
- **Adding the whole poupança yield to the rate:** rejected. TR would count twice, in the correction
  and in the rate.
- **Compounding the fixed part with the additional part:** rejected. The contract's 10.06% is their
  sum; compounding gives 10.30%.
- **The Selic target of the month that ends on a contract anniversary, as corrections read:**
  rejected. The first installment is charged interest though it is never corrected, and the interest
  an installment charges is for the month before its due date. The two months are the same when
  installments fall due on the contract's day.
- **Reading SGS 195 for the poupança yield:** rejected. It has no rows for periods starting on the
  29th to the 31st, and projections derive the poupança yield from projected TR and Selic by the
  same rule.
