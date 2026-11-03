# First installment interest for the days since signing

Under SAC, the first installment charges interest for the days from the contract date to its due
date, as a fraction of a 30-day month at the monthly contract rate: the balance it starts from, times
the monthly rate, times the days, divided by 30. The installment still costs one month's interest
plus the usual SAC amortization, the balance divided by the months left, so its amortization absorbs
the difference: it amortizes less when the first period is longer than 30 days and more when it is
shorter. Each figure is rounded to centavos, and the amortization is what the rounded month's
interest plus the rounded SAC amortization leave after the rounded interest. From the second
installment on, interest is a month's at the monthly rate, on the balance the first installment
left.

On the #37 contract, signed 2024-11-18 with its first installment due 2024-12-19, the first
installment is charged 31/30 of a month's interest, and its amortization is the SAC amortization
less that extra day's interest. That reproduces Caixa's first installment within a cent, and the new
installment on the receipt of a prepayment made before it exactly (#38, point 3).

The rule holds whatever the number of days, so a first installment due long after signing amortizes
little, or adds to the balance when its interest is more than a month's interest plus the SAC
amortization. A single-installment term still amortizes the whole balance.

Price is unchanged: its first installment charges a month's interest, as no real Price contract has
been checked.

## Considered Options

- **Interest for one calendar month plus the days beyond it:** not taken. It agrees with the days
  over 30 when the first month has 30 days, as on the #37 contract, and the issue states the days
  over 30.
- **Compounding the monthly rate over the days:** not taken. The linear fraction reproduces Caixa's
  figures within a cent (#38).
- **Keeping the amortization and charging the extra interest on top:** rejected. Caixa's first
  installment and the prepayment receipt's new installment only match with the installment kept at a
  month's interest plus the SAC amortization.
