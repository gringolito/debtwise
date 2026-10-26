package mortgage

import (
	"iter"
	"time"

	"github.com/gringolito/debtwise/backend/decimal"
)

// Installment is one scheduled monthly payment and what it charges, in reais rounded to centavos.
type Installment struct {
	// Number counts installments from 1.
	Number  int
	DueDate time.Time
	// Correction is what the indexer added to the outstanding balance before this installment.
	Correction decimal.Decimal
	// IndexValues are the index values Correction applied, one for each contract anniversary since
	// the previous installment. There are none without an indexer, and for an installment not due
	// yet, which is not corrected.
	IndexValues []IndexValue
	// Interest is charged on the outstanding balance before this installment, once corrected.
	Interest     decimal.Decimal
	Amortization decimal.Decimal
	MIP          decimal.Decimal
	DFI          decimal.Decimal
	Fee          decimal.Decimal
	// Amount is everything the installment charges.
	Amount decimal.Decimal
	// OutstandingBalance is what is still owed after this installment.
	OutstandingBalance decimal.Decimal
}

// Schedule returns the installments of valid terms in order, each priced with the rates and fee
// in effect on its due date.
//
// Each installment due by today first corrects the outstanding balance by the indexer's published
// value on each contract anniversary since the previous installment, unless that value is missing.
// Each charge and correction is rounded to centavos. The last installment amortizes whatever is
// still owed, so the balance ends at zero. Under Price the amortization plus interest is set from
// the balance, rate and months left on the first installment, whenever the rate changes and
// whenever the balance is corrected.
func (t Terms) Schedule(history History, today time.Time) iter.Seq[Installment] {
	return func(yield func(Installment) bool) {
		corrections := newCorrections(t, history)
		balance := t.OriginalAmount.RoundCents()

		var payment, paymentRate decimal.Decimal

		for number := 1; number <= t.TermMonths; number++ {
			due := addMonths(t.FirstInstallmentDate, number-1)
			rate := inEffect(t.ContractRates, due).monthly()
			left := t.TermMonths - number + 1

			var values []IndexValue
			if !due.After(today) {
				values = corrections.through(due)
			}

			correction := decimal.Decimal{}.RoundCents()

			for _, v := range values {
				if v.Missing {
					continue
				}

				corrected := balance.Mul(v.Value).Quo(decimal.FromInt(100)).RoundCents()
				correction = correction.Add(corrected)
				balance = balance.Add(corrected)
			}

			interest := balance.Mul(rate).RoundCents()

			var amortization decimal.Decimal

			switch {
			case left == 1:
				amortization = balance
			case t.AmortizationSystem == SAC:
				amortization = balance.Quo(decimal.FromInt(int64(left))).RoundCents()
			default:
				if number == 1 || rate.Cmp(paymentRate) != 0 || correction.Cmp(decimal.Decimal{}) != 0 {
					payment, paymentRate = pricePayment(balance, rate, left), rate
				}

				amortization = payment.Sub(interest)
			}

			mip := balance.Mul(inEffect(t.MIPRates, due).Rate).RoundCents()
			dfi := t.AppraisalValue.Mul(inEffect(t.DFIRates, due).Rate).RoundCents()
			fee := inEffect(t.Fees, due).Amount.RoundCents()
			balance = balance.Sub(amortization)

			installment := Installment{
				Number:             number,
				DueDate:            due,
				Correction:         correction,
				IndexValues:        values,
				Interest:           interest,
				Amortization:       amortization,
				MIP:                mip,
				DFI:                dfi,
				Fee:                fee,
				Amount:             amortization.Add(interest).Add(mip).Add(dfi).Add(fee),
				OutstandingBalance: balance,
			}
			if !yield(installment) {
				return
			}
		}
	}
}

// pricePayment returns the level amortization plus interest that pays balance off over months at
// a monthly rate. A rate too small to discount at all, zero included, splits the balance evenly.
func pricePayment(balance, rate decimal.Decimal, months int) decimal.Decimal {
	one := decimal.FromInt(1)

	discount := one.Sub(one.Add(rate).Pow(decimal.FromInt(int64(-months))))
	if discount.Cmp(decimal.Decimal{}) == 0 {
		return balance.Quo(decimal.FromInt(int64(months))).RoundCents()
	}

	return balance.Mul(rate).Quo(discount).RoundCents()
}

// addMonths returns the date months after day, on the same day of the month or on the month's
// last day when it is shorter.
func addMonths(day time.Time, months int) time.Time {
	first := time.Date(day.Year(), day.Month()+time.Month(months), 1, 0, 0, 0, 0, time.UTC)
	lastDay := first.AddDate(0, 1, -1).Day()

	return first.AddDate(0, 0, min(day.Day(), lastDay)-1)
}
