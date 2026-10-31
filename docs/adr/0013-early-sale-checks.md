# Early sale checks

An early sale check is a decision (ADR-0011) whose starting position is a lot already held. Its
date is today and its horizon is the lot's maturity. It follows the same three replays of the
mortgage, each with its recorded events and the effect the owner chose:

- **Status quo:** nothing is sold or prepaid. Its installments set the outflow of every later month.
- **Sell:** the lot is sold today at its Market Value (ADR-0010), the sell price of its bond's quote
  times its quantity, and the net is prepaid. The IOF and the income tax are those of the days held
  since the purchase, so a sale within 30 days pays IOF.
- **Hold:** the lot is kept. Each coupon it is paid after today, net of its income tax and custody
  fee, is prepaid on its date, and on the horizon the scenario holds its net Maturity Value. A coupon
  paid on or before today is already the owner's, so it is part of neither scenario.

Both scenarios pay what the status quo pays every month, prepay what their own installment leaves of
it, and hold what nothing is owed for, as ADR-0011 sets out. The advantage is the hold scenario's net
worth on the horizon less the sell scenario's: holding plays investing and selling plays prepaying,
so the sign means what it means in a decision. The check favours selling when the advantage is
negative, and holding otherwise: at zero, selling gains nothing.

Every lot is checked, whatever the mortgage's indexer (ADR-0007), since the owner holds it either
way. An NTN-B Principal's or NTN-B's Maturity Value and future coupons follow the VNA grown by the
projected IPCA, so the check names the IPCA's projection method like any other projection it reads.

A check has no scenarios when the lot's bond has matured, when Tesouro Direto quotes no sell price
for it, or when the IPCA its values follow is missing, and it says which. The checks of all lots are
ranked by advantage, lowest first, so the lots most worth selling lead; those without scenarios
follow in the order of the lots.

## Considered Options

- **A break-even rate for the sale:** not offered. The issue asks for the advantage and its verdict;
  the sell rate at which holding and selling come out even is a different search, over the price the
  lot is sold at rather than bought at, and can be added on its own.
- **Ranking by the advantage per real of Market Value:** rejected. The owner wants the lots whose
  sale gains the most money, which is what the advantage measures; a small lot with a large relative
  gain matters less than a large one.
- **Leaving out lots that can't be checked:** rejected. The list is of every lot held, and saying
  why one has no check tells the owner what to fix or wait for.
