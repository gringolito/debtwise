// Package mortgage models the owner's mortgage from its contract terms and rebuilds its
// month-by-month schedule.
package mortgage

import (
	"time"

	"github.com/gringolito/debtwise/backend/decimal"
)

// AmortizationSystem is the contract rule that splits each installment into amortization and
// interest.
type AmortizationSystem string

const (
	// SAC amortizes the outstanding balance in equal parts over the months left, so installments
	// fall.
	SAC AmortizationSystem = "sac"
	// Price keeps amortization plus interest level while the rate holds.
	Price AmortizationSystem = "price"
)

// RateBasis says how an annual contract rate is printed.
type RateBasis string

const (
	// Nominal is a rate charged a twelfth each month.
	Nominal RateBasis = "nominal"
	// Effective is the rate the monthly charge compounds to over a year.
	Effective RateBasis = "effective"
)

// Indexer is the index a contract corrects the outstanding balance by, before interest is charged.
type Indexer string

const (
	NoIndexer Indexer = "none"
	TR        Indexer = "tr"
	// PoupancaYield follows the poupança yield's legal rule, from TR and the Selic target.
	PoupancaYield Indexer = "poupanca_yield"
	IPCA          Indexer = "ipca"
)

// Terms are a mortgage's contract terms. Rates and fees are rows effective from a date: each
// applies to the installments due on or after that date, until a later row takes over.
type Terms struct {
	ContractDate         time.Time
	OriginalAmount       decimal.Decimal
	TermMonths           int
	FirstInstallmentDate time.Time
	AmortizationSystem   AmortizationSystem
	// Indexer corrects the outstanding balance once a month, on the contract's anniversary.
	Indexer Indexer
	// AppraisalValue is the property's appraisal, which DFI is charged on.
	AppraisalValue decimal.Decimal
	ContractRates  []ContractRate
	// MIPRates are charged on the outstanding balance; their dates are the owner's age-band
	// changes.
	MIPRates []MonthlyRate
	// DFIRates are charged on the appraisal value.
	DFIRates []MonthlyRate
	// Fees are the monthly admin fee.
	Fees []Fee
}

// ContractRate is the annual interest rate the contract charges from a date, as a fraction (0.12
// is 12%), on the basis the contract prints it.
type ContractRate struct {
	EffectiveFrom time.Time
	Rate          decimal.Decimal
	Basis         RateBasis
}

// Nominal returns the rate as a nominal annual rate.
func (r ContractRate) Nominal() decimal.Decimal {
	if r.Basis == Effective {
		return decimal.EffectiveToNominal(r.Rate)
	}

	return r.Rate
}

// Effective returns the rate as an effective annual rate.
func (r ContractRate) Effective() decimal.Decimal {
	if r.Basis == Effective {
		return r.Rate
	}

	return decimal.NominalToEffective(r.Rate)
}

func (r ContractRate) monthly() decimal.Decimal {
	if r.Basis == Effective {
		return decimal.AnnualToMonthly(r.Rate)
	}

	return decimal.NominalToMonthly(r.Rate)
}

func (r ContractRate) effectiveFrom() time.Time { return r.EffectiveFrom }

// MonthlyRate is an insurance premium rate, a fraction charged each month, from a date.
type MonthlyRate struct {
	EffectiveFrom time.Time
	Rate          decimal.Decimal
}

func (r MonthlyRate) effectiveFrom() time.Time { return r.EffectiveFrom }

// Fee is the monthly admin fee from a date.
type Fee struct {
	EffectiveFrom time.Time
	Amount        decimal.Decimal
}

func (f Fee) effectiveFrom() time.Time { return f.EffectiveFrom }

type dated interface {
	effectiveFrom() time.Time
}

// inEffect returns the row in effect on day: the latest one effective on or before it. Valid terms
// always have one.
func inEffect[T dated](rows []T, day time.Time) T {
	var current T

	var found bool

	for _, row := range rows {
		from := row.effectiveFrom()
		if from.After(day) {
			continue
		}

		if !found || from.After(current.effectiveFrom()) {
			current, found = row, true
		}
	}

	return current
}
