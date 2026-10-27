package api

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"time"

	"github.com/danielgtaylor/huma/v2"

	"github.com/gringolito/debtwise/backend/decimal"
	"github.com/gringolito/debtwise/backend/mortgage"
)

// Mortgages is the subset of *mortgage.Store the API uses.
type Mortgages interface {
	Find(ctx context.Context) (mortgage.Terms, error)
	Save(ctx context.Context, terms mortgage.Terms) (mortgage.Terms, error)
	Delete(ctx context.Context) error
	Events(ctx context.Context) (mortgage.Events, error)
	AddPrepayment(ctx context.Context, p mortgage.Prepayment) (mortgage.Prepayment, error)
	UpdatePrepayment(ctx context.Context, p mortgage.Prepayment) error
	DeletePrepayment(ctx context.Context, id int64) error
	AddStatement(ctx context.Context, s mortgage.Statement) (mortgage.Statement, error)
	UpdateStatement(ctx context.Context, s mortgage.Statement) error
	DeleteStatement(ctx context.Context, id int64) error
}

type mortgageTerms struct {
	ContractDate         string              `json:"contract_date" format:"date" doc:"Date the contract was signed."`
	OriginalAmount       string              `json:"original_amount" pattern:"^(0|[1-9][0-9]{0,14})(\\.[0-9]{1,2})?$" doc:"Amount borrowed, in reais, as a decimal string."`
	TermMonths           int                 `json:"term_months" minimum:"1" maximum:"600" doc:"Number of monthly installments."`
	FirstInstallmentDate string              `json:"first_installment_date" format:"date" doc:"Due date of the first installment."`
	AmortizationSystem   string              `json:"amortization_system" enum:"sac,price" doc:"How each installment splits into amortization and interest."`
	Indexer              string              `json:"indexer" enum:"none,tr,poupanca_yield,ipca" doc:"The index the contract corrects the outstanding balance by: TR, the poupança yield, IPCA, or none for a fixed-rate contract."`
	AppraisalValue       string              `json:"appraisal_value" pattern:"^(0|[1-9][0-9]{0,14})(\\.[0-9]{1,2})?$" doc:"Appraisal value of the property, in reais, as a decimal string."`
	ContractRates        []contractRateTerms `json:"contract_rates" nullable:"false" doc:"The contract's interest rate, and its later changes."`
	MIPRates             []monthlyRate       `json:"mip_rates" nullable:"false" doc:"The MIP (life and disability insurance) rate, and its changes as the borrower moves into a new age band."`
	DFIRates             []monthlyRate       `json:"dfi_rates" nullable:"false" doc:"The DFI (property damage insurance) rate, and its later changes."`
	Fees                 []fee               `json:"fees" nullable:"false" doc:"The monthly admin fee, and its later changes."`
}

type contractRateTerms struct {
	EffectiveFrom string `json:"effective_from" format:"date" doc:"Installments due on or after this date pay this rate, until a later row's date."`
	Rate          string `json:"rate" pattern:"^(0|[1-9][0-9]{0,2})(\\.[0-9]{1,12})?$" doc:"Annual rate as a decimal fraction string: 0.12 is 12% a year."`
	Basis         string `json:"basis" enum:"nominal,effective" doc:"Whether the contract prints the rate as nominal or as effective."`
}

type monthlyRate struct {
	EffectiveFrom string `json:"effective_from" format:"date" doc:"Installments due on or after this date pay this rate, until a later row's date."`
	Rate          string `json:"rate" pattern:"^(0|[1-9][0-9]{0,2})(\\.[0-9]{1,12})?$" doc:"Monthly rate as a decimal fraction string: 0.0003 is 0.03% a month."`
}

type fee struct {
	EffectiveFrom string `json:"effective_from" format:"date" doc:"Installments due on or after this date pay this fee, until a later row's date."`
	Amount        string `json:"amount" pattern:"^(0|[1-9][0-9]{0,14})(\\.[0-9]{1,2})?$" doc:"Monthly amount, in reais, as a decimal string."`
}

type registeredMortgage struct {
	ContractDate         string         `json:"contract_date" format:"date" doc:"Date the contract was signed."`
	OriginalAmount       string         `json:"original_amount" doc:"Amount borrowed, in reais, as a decimal string."`
	TermMonths           int            `json:"term_months" doc:"Number of monthly installments."`
	FirstInstallmentDate string         `json:"first_installment_date" format:"date" doc:"Due date of the first installment."`
	AmortizationSystem   string         `json:"amortization_system" enum:"sac,price" doc:"How each installment splits into amortization and interest."`
	Indexer              string         `json:"indexer" enum:"none,tr,poupanca_yield,ipca" doc:"The index the contract corrects the outstanding balance by: TR, the poupança yield, IPCA, or none for a fixed-rate contract."`
	AppraisalValue       string         `json:"appraisal_value" doc:"Appraisal value of the property, in reais, as a decimal string."`
	ContractRates        []contractRate `json:"contract_rates" nullable:"false" doc:"The contract's interest rate and its later changes, in date order."`
	MIPRates             []monthlyRate  `json:"mip_rates" nullable:"false" doc:"The MIP (life and disability insurance) rate and its changes, in date order."`
	DFIRates             []monthlyRate  `json:"dfi_rates" nullable:"false" doc:"The DFI (property damage insurance) rate and its changes, in date order."`
	Fees                 []fee          `json:"fees" nullable:"false" doc:"The monthly admin fee and its changes, in date order."`
}

type contractRate struct {
	EffectiveFrom string `json:"effective_from" format:"date" doc:"Installments due on or after this date pay this rate, until a later row's date."`
	Basis         string `json:"basis" enum:"nominal,effective" doc:"The basis the rate was entered on; the other one is derived from it."`
	Nominal       string `json:"nominal" doc:"Annual rate on the nominal basis, as a decimal fraction string."`
	Effective     string `json:"effective" doc:"Annual rate on the effective basis, as a decimal fraction string."`
}

type schedule struct {
	Installments []scheduledInstallment `json:"installments" nullable:"false" doc:"Every installment of the mortgage, in due date order."`
}

type scheduledInstallment struct {
	Number             int               `json:"number" doc:"Installment number, counting from 1."`
	DueDate            string            `json:"due_date" format:"date" doc:"Date the installment falls due."`
	Correction         string            `json:"correction" doc:"Indexer correction added to the outstanding balance before interest is charged, in reais, as a decimal string."`
	IndexValues        []correctionIndex `json:"index_values" nullable:"false" doc:"The index values behind the correction, oldest period first. Empty when no index value applies to the installment."`
	Interest           string            `json:"interest" doc:"Interest charged, in reais, as a decimal string."`
	Amortization       string            `json:"amortization" doc:"Outstanding balance paid off, in reais, as a decimal string."`
	MIP                string            `json:"mip" doc:"MIP (life and disability insurance) premium, in reais, as a decimal string."`
	DFI                string            `json:"dfi" doc:"DFI (property damage insurance) premium, in reais, as a decimal string."`
	Fee                string            `json:"fee" doc:"Admin fee, in reais, as a decimal string."`
	Amount             string            `json:"amount" doc:"Total the installment charges, in reais, as a decimal string."`
	Prepaid            string            `json:"prepaid" doc:"Total of the prepayments made from this installment's due date until the next one's, in reais, as a decimal string."`
	OutstandingBalance string            `json:"outstanding_balance" doc:"Outstanding balance after the installment and the prepayments and statements up to the next one, in reais, as a decimal string."`
}

type correctionIndex struct {
	Index       indexCode     `json:"index" doc:"The index the value belongs to."`
	Status      string        `json:"status" enum:"published,projected,missing" doc:"published: the balance was corrected by the published value; projected: the balance was corrected by a projected value, by the methods listed in methods; missing: no value is available for the period yet, so the balance was not corrected by it."`
	Value       string        `json:"value,omitempty" doc:"The index value for the period, in percent, as a decimal string. Absent when status is missing."`
	PeriodStart string        `json:"period_start" format:"date" doc:"The first day of the period the value covers."`
	PeriodEnd   string        `json:"period_end" format:"date" doc:"The last day of the period the value covers. Equals period_start when the index is dated by month."`
	Methods     []projectedBy `json:"methods" nullable:"false" doc:"The projection methods the value comes from, one for each projected index it is derived from. Empty unless status is projected."`
}

type mortgageOutput struct {
	Body registeredMortgage
}

type scheduleOutput struct {
	Body schedule
}

const (
	mortgagePath = "/mortgage"
	mortgageTag  = "Mortgage"
)

func registerMortgage(humaAPI huma.API, mortgages Mortgages, store IndexStore, now func() time.Time) {
	register(humaAPI, huma.Operation{
		OperationID: "read-mortgage",
		Method:      http.MethodGet,
		Path:        mortgagePath,
		Summary:     "Read the mortgage",
		Description: "Returns the registered mortgage's terms, with each contract rate on both the nominal and the effective basis.",
		Tags:        []string{mortgageTag},
	}, func(ctx context.Context, _ *struct{}) (*mortgageOutput, error) {
		terms, err := mortgages.Find(ctx)
		if err != nil {
			return nil, mortgageFailure(err)
		}

		return &mortgageOutput{Body: newRegisteredMortgage(terms)}, nil
	})

	register(humaAPI, huma.Operation{
		OperationID: "save-mortgage",
		Method:      http.MethodPut,
		Path:        mortgagePath,
		Summary:     "Register or edit the mortgage",
		Description: "Registers the owner's mortgage, or replaces the terms of the one already registered, and returns it as a read would.",
		Tags:        []string{mortgageTag},
	}, func(ctx context.Context, in *struct{ Body mortgageTerms }) (*mortgageOutput, error) {
		terms, err := in.Body.terms()
		if err != nil {
			return nil, err
		}

		if err := violationsFailure(terms.Validate()); err != nil {
			return nil, err
		}

		saved, err := mortgages.Save(ctx, terms)
		if err != nil {
			return nil, err
		}

		return &mortgageOutput{Body: newRegisteredMortgage(saved)}, nil
	})

	register(humaAPI, huma.Operation{
		OperationID:   "delete-mortgage",
		Method:        http.MethodDelete,
		Path:          mortgagePath,
		DefaultStatus: http.StatusNoContent,
		Summary:       "Delete the mortgage",
		Description:   "Deletes the registered mortgage with all its terms, prepayments and statements.",
		Tags:          []string{mortgageTag},
	}, func(ctx context.Context, _ *struct{}) (*struct{}, error) {
		if err := mortgages.Delete(ctx); err != nil {
			return nil, mortgageFailure(err)
		}

		return &struct{}{}, nil
	})

	register(humaAPI, huma.Operation{
		OperationID: "read-mortgage-schedule",
		Method:      http.MethodGet,
		Path:        mortgagePath + "/schedule",
		Summary:     "Read the mortgage schedule",
		Description: "Returns the registered mortgage's installments month by month, with its prepayments and statements replayed, to check against bank statements.",
		Tags:        []string{mortgageTag},
	}, func(ctx context.Context, _ *struct{}) (*scheduleOutput, error) {
		terms, outlook, events, err := replayInputs(ctx, mortgages, store)
		if err != nil {
			return nil, err
		}

		out := &scheduleOutput{Body: schedule{Installments: make([]scheduledInstallment, 0, terms.TermMonths)}}
		for m := range terms.Schedule(outlook, events, now()) {
			out.Body.Installments = append(out.Body.Installments, scheduledInstallment{
				Number:             m.Number,
				DueDate:            m.DueDate.Format(time.DateOnly),
				Correction:         m.Correction.String(),
				IndexValues:        newCorrectionIndexes(m.IndexValues),
				Interest:           m.Interest.String(),
				Amortization:       m.Amortization.String(),
				MIP:                m.MIP.String(),
				DFI:                m.DFI.String(),
				Fee:                m.Fee.String(),
				Amount:             m.Amount.String(),
				Prepaid:            m.Prepaid.String(),
				OutstandingBalance: m.OutstandingBalance.String(),
			})
		}

		return out, nil
	})

	registerMortgageEvents(humaAPI, mortgages, store, now)
}

func mortgageFailure(err error) error {
	switch {
	case errors.Is(err, mortgage.ErrNotFound):
		return huma.Error404NotFound("no mortgage is registered")
	case errors.Is(err, mortgage.ErrPrepaymentNotFound):
		return huma.Error404NotFound("no such prepayment")
	case errors.Is(err, mortgage.ErrStatementNotFound):
		return huma.Error404NotFound("no such statement")
	default:
		return err
	}
}

func newCorrectionIndexes(values []mortgage.IndexValue) []correctionIndex {
	out := make([]correctionIndex, 0, len(values))

	for _, v := range values {
		index := correctionIndex{
			Index:       indexCode(v.Index),
			Status:      "published",
			Methods:     projectedByOf(v.Methods),
			Value:       v.Value.String(),
			PeriodStart: v.PeriodStart.Format(time.DateOnly),
			PeriodEnd:   v.PeriodEnd.Format(time.DateOnly),
		}
		if v.Missing {
			index.Status, index.Value = "missing", ""
		} else if len(v.Methods) > 0 {
			index.Status = "projected"
		}

		out = append(out, index)
	}

	return out
}

// terms converts a body whose dates and decimals the schema has already checked.
func (b mortgageTerms) terms() (mortgage.Terms, error) {
	var p parser

	terms := mortgage.Terms{
		ContractDate:         p.date(b.ContractDate),
		OriginalAmount:       p.decimal(b.OriginalAmount),
		TermMonths:           b.TermMonths,
		FirstInstallmentDate: p.date(b.FirstInstallmentDate),
		AmortizationSystem:   mortgage.AmortizationSystem(b.AmortizationSystem),
		Indexer:              mortgage.Indexer(b.Indexer),
		AppraisalValue:       p.decimal(b.AppraisalValue),
	}

	for _, r := range b.ContractRates {
		terms.ContractRates = append(terms.ContractRates, mortgage.ContractRate{
			EffectiveFrom: p.date(r.EffectiveFrom), Rate: p.decimal(r.Rate), Basis: mortgage.RateBasis(r.Basis),
		})
	}

	for _, r := range b.MIPRates {
		terms.MIPRates = append(terms.MIPRates, mortgage.MonthlyRate{EffectiveFrom: p.date(r.EffectiveFrom), Rate: p.decimal(r.Rate)})
	}

	for _, r := range b.DFIRates {
		terms.DFIRates = append(terms.DFIRates, mortgage.MonthlyRate{EffectiveFrom: p.date(r.EffectiveFrom), Rate: p.decimal(r.Rate)})
	}

	for _, f := range b.Fees {
		terms.Fees = append(terms.Fees, mortgage.Fee{EffectiveFrom: p.date(f.EffectiveFrom), Amount: p.decimal(f.Amount)})
	}

	if p.err != nil {
		return mortgage.Terms{}, fmt.Errorf("read mortgage terms: %w", p.err)
	}

	return terms, nil
}

func newRegisteredMortgage(terms mortgage.Terms) registeredMortgage {
	out := registeredMortgage{
		ContractDate:         terms.ContractDate.Format(time.DateOnly),
		OriginalAmount:       terms.OriginalAmount.String(),
		TermMonths:           terms.TermMonths,
		FirstInstallmentDate: terms.FirstInstallmentDate.Format(time.DateOnly),
		AmortizationSystem:   string(terms.AmortizationSystem),
		Indexer:              string(terms.Indexer),
		AppraisalValue:       terms.AppraisalValue.String(),
		ContractRates:        make([]contractRate, 0, len(terms.ContractRates)),
		MIPRates:             make([]monthlyRate, 0, len(terms.MIPRates)),
		DFIRates:             make([]monthlyRate, 0, len(terms.DFIRates)),
		Fees:                 make([]fee, 0, len(terms.Fees)),
	}

	for _, r := range terms.ContractRates {
		out.ContractRates = append(out.ContractRates, contractRate{
			EffectiveFrom: r.EffectiveFrom.Format(time.DateOnly),
			Basis:         string(r.Basis),
			Nominal:       r.Nominal().String(),
			Effective:     r.Effective().String(),
		})
	}

	for _, r := range terms.MIPRates {
		out.MIPRates = append(out.MIPRates, monthlyRate{EffectiveFrom: r.EffectiveFrom.Format(time.DateOnly), Rate: r.Rate.String()})
	}

	for _, r := range terms.DFIRates {
		out.DFIRates = append(out.DFIRates, monthlyRate{EffectiveFrom: r.EffectiveFrom.Format(time.DateOnly), Rate: r.Rate.String()})
	}

	for _, f := range terms.Fees {
		out.Fees = append(out.Fees, fee{EffectiveFrom: f.EffectiveFrom.Format(time.DateOnly), Amount: f.Amount.String()})
	}

	return out
}

// parser reads dates and decimal strings, collecting their errors.
type parser struct {
	err error
}

func (p *parser) date(s string) time.Time {
	d, err := time.Parse(time.DateOnly, s)
	p.err = errors.Join(p.err, err)

	return d
}

func (p *parser) decimal(s string) decimal.Decimal {
	d, err := decimal.Parse(s)
	p.err = errors.Join(p.err, err)

	return d
}
