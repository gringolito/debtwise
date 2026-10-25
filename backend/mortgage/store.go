package mortgage

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"time"

	"github.com/gringolito/debtwise/backend/db"
	"github.com/gringolito/debtwise/backend/decimal"
)

// ErrNotFound is returned when the owner has not registered a mortgage.
var ErrNotFound = errors.New("mortgage: no mortgage is registered")

// Store keeps the owner's one mortgage in the database.
type Store struct {
	conn *sql.DB
}

// NewStore returns a Store over a migrated database.
func NewStore(conn *sql.DB) *Store {
	return &Store{conn: conn}
}

// Find returns the registered mortgage's terms, with each list of rows in date order, or
// ErrNotFound.
func (s *Store) Find(ctx context.Context) (Terms, error) {
	var terms Terms

	err := s.inTx(ctx, func(q *db.Queries) error {
		row, err := q.FindMortgage(ctx)
		if errors.Is(err, sql.ErrNoRows) {
			return ErrNotFound
		}

		if err != nil {
			return fmt.Errorf("mortgage: find: %w", err)
		}

		terms, err = readTerms(ctx, q, row)

		return err
	})

	return terms, err
}

// Save registers terms as the owner's mortgage, replacing the terms of the one already registered.
func (s *Store) Save(ctx context.Context, terms Terms) error {
	return s.inTx(ctx, func(q *db.Queries) error {
		id, err := saveMortgage(ctx, q, terms)
		if err != nil {
			return err
		}

		return saveRows(ctx, q, id, terms)
	})
}

// Delete removes the registered mortgage, or returns ErrNotFound.
func (s *Store) Delete(ctx context.Context) error {
	deleted, err := db.New(s.conn).DeleteMortgages(ctx)
	if err != nil {
		return fmt.Errorf("mortgage: delete: %w", err)
	}

	if deleted == 0 {
		return ErrNotFound
	}

	return nil
}

func (s *Store) inTx(ctx context.Context, fn func(*db.Queries) error) error {
	tx, err := s.conn.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("mortgage: begin: %w", err)
	}

	defer func() { _ = tx.Rollback() }()

	if err := fn(db.New(s.conn).WithTx(tx)); err != nil {
		return err
	}

	if err := tx.Commit(); err != nil {
		return fmt.Errorf("mortgage: commit: %w", err)
	}

	return nil
}

func saveMortgage(ctx context.Context, q *db.Queries, terms Terms) (int64, error) {
	existing, err := q.FindMortgage(ctx)
	if errors.Is(err, sql.ErrNoRows) {
		id, err := q.InsertMortgage(ctx, db.InsertMortgageParams{
			ContractDate:         formatDate(terms.ContractDate),
			OriginalAmount:       terms.OriginalAmount.String(),
			TermMonths:           int64(terms.TermMonths),
			FirstInstallmentDate: formatDate(terms.FirstInstallmentDate),
			AmortizationSystem:   string(terms.AmortizationSystem),
			AppraisalValue:       terms.AppraisalValue.String(),
		})
		if err != nil {
			return 0, fmt.Errorf("mortgage: insert: %w", err)
		}

		return id, nil
	}

	if err != nil {
		return 0, fmt.Errorf("mortgage: find: %w", err)
	}

	err = q.UpdateMortgage(ctx, db.UpdateMortgageParams{
		ID:                   existing.ID,
		ContractDate:         formatDate(terms.ContractDate),
		OriginalAmount:       terms.OriginalAmount.String(),
		TermMonths:           int64(terms.TermMonths),
		FirstInstallmentDate: formatDate(terms.FirstInstallmentDate),
		AmortizationSystem:   string(terms.AmortizationSystem),
		AppraisalValue:       terms.AppraisalValue.String(),
	})
	if err != nil {
		return 0, fmt.Errorf("mortgage: update %d: %w", existing.ID, err)
	}

	return existing.ID, nil
}

// saveRows replaces the mortgage's rate and fee rows with those of terms.
func saveRows(ctx context.Context, q *db.Queries, id int64, terms Terms) error {
	for _, deleteRows := range []func(context.Context, int64) error{
		q.DeleteMortgageContractRates, q.DeleteMortgageMIPRates, q.DeleteMortgageDFIRates, q.DeleteMortgageFees,
	} {
		if err := deleteRows(ctx, id); err != nil {
			return fmt.Errorf("mortgage: clear rows of %d: %w", id, err)
		}
	}

	for _, r := range terms.ContractRates {
		err := q.InsertMortgageContractRate(ctx, db.InsertMortgageContractRateParams{
			MortgageID: id, EffectiveFrom: formatDate(r.EffectiveFrom), Rate: r.Rate.String(), Basis: string(r.Basis),
		})
		if err != nil {
			return fmt.Errorf("mortgage: save contract rate from %s: %w", formatDate(r.EffectiveFrom), err)
		}
	}

	for _, r := range terms.MIPRates {
		err := q.InsertMortgageMIPRate(ctx, db.InsertMortgageMIPRateParams{
			MortgageID: id, EffectiveFrom: formatDate(r.EffectiveFrom), Rate: r.Rate.String(),
		})
		if err != nil {
			return fmt.Errorf("mortgage: save MIP rate from %s: %w", formatDate(r.EffectiveFrom), err)
		}
	}

	for _, r := range terms.DFIRates {
		err := q.InsertMortgageDFIRate(ctx, db.InsertMortgageDFIRateParams{
			MortgageID: id, EffectiveFrom: formatDate(r.EffectiveFrom), Rate: r.Rate.String(),
		})
		if err != nil {
			return fmt.Errorf("mortgage: save DFI rate from %s: %w", formatDate(r.EffectiveFrom), err)
		}
	}

	for _, f := range terms.Fees {
		err := q.InsertMortgageFee(ctx, db.InsertMortgageFeeParams{
			MortgageID: id, EffectiveFrom: formatDate(f.EffectiveFrom), Amount: f.Amount.String(),
		})
		if err != nil {
			return fmt.Errorf("mortgage: save fee from %s: %w", formatDate(f.EffectiveFrom), err)
		}
	}

	return nil
}

func readTerms(ctx context.Context, q *db.Queries, row db.Mortgage) (Terms, error) {
	var p parser

	terms := Terms{
		ContractDate:         p.date(row.ContractDate),
		OriginalAmount:       p.decimal(row.OriginalAmount),
		TermMonths:           int(row.TermMonths),
		FirstInstallmentDate: p.date(row.FirstInstallmentDate),
		AmortizationSystem:   AmortizationSystem(row.AmortizationSystem),
		AppraisalValue:       p.decimal(row.AppraisalValue),
	}

	contractRates, err := q.ListMortgageContractRates(ctx, row.ID)
	if err != nil {
		return Terms{}, fmt.Errorf("mortgage: list contract rates of %d: %w", row.ID, err)
	}

	for _, r := range contractRates {
		terms.ContractRates = append(terms.ContractRates, ContractRate{
			EffectiveFrom: p.date(r.EffectiveFrom), Rate: p.decimal(r.Rate), Basis: RateBasis(r.Basis),
		})
	}

	mipRates, err := q.ListMortgageMIPRates(ctx, row.ID)
	if err != nil {
		return Terms{}, fmt.Errorf("mortgage: list MIP rates of %d: %w", row.ID, err)
	}

	for _, r := range mipRates {
		terms.MIPRates = append(terms.MIPRates, MonthlyRate{EffectiveFrom: p.date(r.EffectiveFrom), Rate: p.decimal(r.Rate)})
	}

	dfiRates, err := q.ListMortgageDFIRates(ctx, row.ID)
	if err != nil {
		return Terms{}, fmt.Errorf("mortgage: list DFI rates of %d: %w", row.ID, err)
	}

	for _, r := range dfiRates {
		terms.DFIRates = append(terms.DFIRates, MonthlyRate{EffectiveFrom: p.date(r.EffectiveFrom), Rate: p.decimal(r.Rate)})
	}

	fees, err := q.ListMortgageFees(ctx, row.ID)
	if err != nil {
		return Terms{}, fmt.Errorf("mortgage: list fees of %d: %w", row.ID, err)
	}

	for _, f := range fees {
		terms.Fees = append(terms.Fees, Fee{EffectiveFrom: p.date(f.EffectiveFrom), Amount: p.decimal(f.Amount)})
	}

	if p.err != nil {
		return Terms{}, fmt.Errorf("mortgage: read %d: %w", row.ID, p.err)
	}

	return terms, nil
}

// parser reads stored dates and decimals, collecting their errors.
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

func formatDate(d time.Time) string {
	return d.Format(time.DateOnly)
}
