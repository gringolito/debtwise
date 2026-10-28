# Lot taxes and fees

A lot is valued as events: a sale on the valuation date, which is its Accrual Value or its Market
Value, its Maturity Value, and each coupon paid before maturity. An event has a gross value, and the
IOF, the income tax (IR) and the custody fee are taken off it to leave its net value. Dates are
calendar dates at midnight UTC. The days held at an event are the calendar days from the purchase
date, when the purchase settled, to the event's date. Every amount is rounded to centavos, half up,
once, and the cost of a lot is its unit price times its quantity, rounded the same way.

**Gross values**

- **Accrual Value:** the unit price (PU) at the contracted rate for settlement on the date, times
  the quantity. An LTN's and an NTN-F's PU is the bond's price by Tesouro's methodology. An NTN-B
  Principal's and an NTN-B's is its quotation times the VNA projected to the date. It doesn't exist
  from maturity on.
- **Market Value:** the sell price of the bond's quote, times the quantity. It doesn't exist without
  a sell price, nor from maturity on.
- **Maturity Value:** everything paid on the maturity date. An LTN pays 1,000 a bond, an NTN-F
  1,000 plus its last coupon of 48.80885, an NTN-B Principal its VNA of that date, and an NTN-B that
  VNA times 102.956301% (the 100 and its last coupon). The quantity multiplies the unit value
  before the one rounding to centavos.
- **Coupons:** an NTN-F or an NTN-B pays one every six months counted back from maturity, on the
  nominal dates, without moving one that isn't a business day. A lot is paid those after its purchase
  and before maturity; the one on the purchase date went to the seller and the one on the maturity
  date is in the Maturity Value. An NTN-F coupon is 48.80885 a bond. An NTN-B coupon is the VNA of the
  coupon date times 2.956301%, truncated at 6 places as a unit price, times the quantity.

**VNA.** The VNA of a 15th needs IBGE's index number of the previous month. When it isn't published
yet, the latest published number is grown month by month by (1 + IPCA/100), the IPCA of each month
being the published one of SGS 433 where there is one and the projected one past it (ADR-0009). The
numbers aren't rounded: the VNA truncates their ratio at 16 places anyway, and IBGE's two places
would add error to a projection. Between 15ths the VNA is projected pro rata (`ProjectedVNA`) with
the IPCA of the month of the last 15th, and on a 15th it is that VNA, so no IPCA of the month is
read. An amount that depends on any projected IPCA records the methods of those projections, each
once and in the order the months first use it. When a number or an IPCA is neither published nor
projected the lot has no values, which is reported as a missing IPCA, never valued with a guess.

**Taxes and fee.** All three are data with an effective date; a row applies to events, and to days
of fee, on or after its date.

- **Gain:** a sale's or maturity's gross value less the lot's cost. A coupon's gain is the whole
  coupon, whatever the bond's price was, taxed at the regressive bracket of the days since the
  purchase like any other event. A loss is no gain, pays no IOF or IR, and isn't carried over.
- **IOF:** the rate of the table row for exactly the days held, times the gain. The rows are the
  regressive table of Decreto 6.306/2007 for days 1 to 29. A day with no row pays none, which is
  every day from the 30th on.
- **Custody fee:** the yearly rate over 365 for each calendar day after the lot's last deduction up
  to and including the event's date, times the base, rounded once for the whole span. The rate of a
  day is that of the latest row on or before it, and zero before the first row. The last deduction is
  the latest coupon date of the lot on or before the event (before it, for the coupon itself), or the
  purchase date when there is none, because a coupon, a sale and the maturity are where the fee is
  deducted. The base is the gross value of the event, and for a coupon the lot's Accrual Value on the
  coupon date, which no longer holds that coupon, plus the coupon.
- **IR:** the rate times the gain less the IOF and the custody fee, never below zero. The rate is
  chosen from the rows in effect on the event's date: the latest row of each minimum number of days,
  and of those the one with the most days that the days held reach. Lei 11.033/2004's brackets are
  22.5% from 0 days, 20% from 181, 17.5% from 361 and 15% from 721, so 180 days still pays 22.5%
  and 181 pays 20%. A coupon's days are counted from the purchase.
- **Net value:** the gross value less the IOF, the IR and the custody fee.

Changing a rate adds a row with its date, and only events and fee days from that date on use it.

## Considered Options

The issue could not confirm several of these facts. The choices follow its notes, and each is data
or one rule, so correcting it later is a new row or a change to one function.

- **Taxing only the yield portion of a coupon bought at a premium or a discount:** rejected. It
  needs the price paid split between principal and interest, which no source confirms. The whole
  coupon is the gain, as the issue says to use unless a primary source says otherwise, and the same
  for an NTN-B coupon.
- **The IR bracket of a coupon counted from the previous coupon:** rejected. The issue counts a
  coupon's days from the purchase, so the first coupons pay the highest rate and later ones the
  lower rates of the same lot.
- **The custody fee on the Market Value of every event:** rejected. A coupon and the maturity have
  no market value, since no quote exists for a date that hasn't come, and the Accrual Value stands
  in whenever there is no sell price. A sale's base is the value being valued, the Market Value
  for its Market Value, so the issue's Market Value as the base holds wherever one exists.
- **The custody fee over 252 business days:** rejected. The issue says the fee accrues daily, and
  calendar days need no holiday calendar, count the same days the IOF and IR brackets count, and
  give one rate to every day the fee accrues, a business-day count would only give to its own.
  Whether B3 counts calendar or business days is unconfirmed, and the day count is not data, so a
  confirmed 252 is a code change.
- **A custody fee deducted twice a year, as B3 bills it:** rejected. The issue deducts it at a
  coupon, a sale or the maturity, which is when the lot is worth less, and a lot of an LTN has no
  other date.
- **Moving a coupon that falls on a weekend or a holiday to the next business day:** rejected. The
  PU of a bond counts its flows on nominal dates, and an NTN-B's VNA is taken on the nominal 15th,
  so the coupon's amount and its days held stay consistent with the price.
- **Taking the cost of the coupons already paid off the gain of a later sale or maturity:**
  rejected. It needs the price split between coupons and principal that the first option lacked.
  Each coupon's whole amount is taxable when it is paid, and a sale or maturity is taxed over the
  cost.
- **Estimating an NTN-B's VNA from SGS 433 alone:** rejected, as ADR-0007 says. The monthly
  variations are rounded to two places and drift from the VNA by a few cents, so published numbers
  are used where IBGE has them and only the months after are grown by IPCA.
- **Rounding projected index numbers at IBGE's two places:** rejected. Each IPCA is already a
  projection, and the VNA truncates the ratio of the numbers at 16 places by Tesouro's rule.
- **Reading the IPCA of the month on a 15th:** rejected. The pro rata exponent is zero, so the
  value doesn't depend on it, and a missing projection would fail a valuation it doesn't change.
- **IOF as a formula of the days held:** rejected. The decree's table is the rule, and a table
  of rows with a date follows a change of the decree as a new set of rows, like the other rates.

## Consequences

- A lot with no stored quote has no Market Value, and its Accrual Value is the only mark on that
  date.
- Valuing an NTN-B Principal or an NTN-B for a date after the latest IBGE number needs the IPCA
  outlook, and without it the lot has no values.
- The paid or future state of a coupon isn't stored: a coupon is paid when its date is on or before
  the valuation date.
