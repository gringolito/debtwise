package bonds

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/gringolito/debtwise/backend/db"
	"github.com/gringolito/debtwise/backend/decimal"
)

// Lots returns the recorded lots, by purchase date and then ID.
func (s *Store) Lots(ctx context.Context) ([]Lot, error) {
	rows, err := db.New(s.conn).ListLots(ctx)
	if err != nil {
		return nil, fmt.Errorf("bonds: lots: %w", err)
	}

	lots := make([]Lot, 0, len(rows))

	for _, row := range rows {
		lot, err := lotFromRow(row)
		if err != nil {
			return nil, fmt.Errorf("bonds: lot %d: %w", row.ID, err)
		}

		lots = append(lots, lot)
	}

	return lots, nil
}

// AddLot records l and returns it with its ID.
func (s *Store) AddLot(ctx context.Context, l Lot) (Lot, error) {
	id, err := db.New(s.conn).InsertLot(ctx, insertLotParams(l))
	if err != nil {
		return Lot{}, fmt.Errorf("bonds: add lot: %w", err)
	}

	l.ID = id

	return l, nil
}

// AddLots records every lot of lots, or none when one fails, and returns them with their IDs in
// the order given.
func (s *Store) AddLots(ctx context.Context, lots []Lot) ([]Lot, error) {
	tx, err := s.conn.BeginTx(ctx, nil)
	if err != nil {
		return nil, fmt.Errorf("bonds: add lots: begin: %w", err)
	}

	defer func() { _ = tx.Rollback() }()

	queries := db.New(s.conn).WithTx(tx)
	added := make([]Lot, 0, len(lots))

	for i, l := range lots {
		id, err := queries.InsertLot(ctx, insertLotParams(l))
		if err != nil {
			return nil, fmt.Errorf("bonds: add lot %d of %d: %w", i+1, len(lots), err)
		}

		l.ID = id
		added = append(added, l)
	}

	if err := tx.Commit(); err != nil {
		return nil, fmt.Errorf("bonds: add lots: commit: %w", err)
	}

	return added, nil
}

func insertLotParams(l Lot) db.InsertLotParams {
	return db.InsertLotParams{
		BondType:     string(l.Bond.Type),
		Maturity:     l.Bond.Maturity.Format(dateLayout),
		PurchaseDate: l.PurchaseDate.Format(dateLayout),
		Rate:         l.Rate.String(),
		UnitPrice:    l.UnitPrice.String(),
		Quantity:     l.Quantity.String(),
	}
}

// UpdateLot replaces the lot with l's ID by l, or returns ErrLotNotFound.
func (s *Store) UpdateLot(ctx context.Context, l Lot) error {
	updated, err := db.New(s.conn).UpdateLot(ctx, db.UpdateLotParams{
		ID:           l.ID,
		BondType:     string(l.Bond.Type),
		Maturity:     l.Bond.Maturity.Format(dateLayout),
		PurchaseDate: l.PurchaseDate.Format(dateLayout),
		Rate:         l.Rate.String(),
		UnitPrice:    l.UnitPrice.String(),
		Quantity:     l.Quantity.String(),
	})
	if err != nil {
		return fmt.Errorf("bonds: update lot %d: %w", l.ID, err)
	}

	if updated == 0 {
		return ErrLotNotFound
	}

	return nil
}

// DeleteLot removes the lot with id, or returns ErrLotNotFound.
func (s *Store) DeleteLot(ctx context.Context, id int64) error {
	deleted, err := db.New(s.conn).DeleteLot(ctx, id)
	if err != nil {
		return fmt.Errorf("bonds: delete lot %d: %w", id, err)
	}

	if deleted == 0 {
		return ErrLotNotFound
	}

	return nil
}

// Taxes returns the income tax, IOF and custody fee tables, each by the date its rows take effect.
func (s *Store) Taxes(ctx context.Context) (Taxes, error) {
	queries := db.New(s.conn)

	incomeTax, err := queries.ListIncomeTaxRates(ctx)
	if err != nil {
		return Taxes{}, fmt.Errorf("bonds: taxes: income tax rates: %w", err)
	}

	iof, err := queries.ListIOFRates(ctx)
	if err != nil {
		return Taxes{}, fmt.Errorf("bonds: taxes: IOF rates: %w", err)
	}

	custodyFee, err := queries.ListCustodyFeeRates(ctx)
	if err != nil {
		return Taxes{}, fmt.Errorf("bonds: taxes: custody fee rates: %w", err)
	}

	var errs error

	taxes := Taxes{
		IncomeTax:  make([]IncomeTaxRate, 0, len(incomeTax)),
		IOF:        make([]IOFRate, 0, len(iof)),
		CustodyFee: make([]CustodyFeeRate, 0, len(custodyFee)),
	}

	for _, row := range incomeTax {
		from, rate, err := parseRate(row.EffectiveFrom, row.Rate)
		errs = errors.Join(errs, err)

		taxes.IncomeTax = append(taxes.IncomeTax, IncomeTaxRate{EffectiveFrom: from, MinDays: int(row.MinDays), Rate: rate})
	}

	for _, row := range iof {
		from, rate, err := parseRate(row.EffectiveFrom, row.Rate)
		errs = errors.Join(errs, err)

		taxes.IOF = append(taxes.IOF, IOFRate{EffectiveFrom: from, Days: int(row.Days), Rate: rate})
	}

	for _, row := range custodyFee {
		from, rate, err := parseRate(row.EffectiveFrom, row.Rate)
		errs = errors.Join(errs, err)

		taxes.CustodyFee = append(taxes.CustodyFee, CustodyFeeRate{EffectiveFrom: from, Rate: rate})
	}

	if errs != nil {
		return Taxes{}, fmt.Errorf("bonds: taxes: %w", errs)
	}

	return taxes, nil
}

func lotFromRow(row db.Lot) (Lot, error) {
	maturity, maturityErr := time.Parse(dateLayout, row.Maturity)
	purchaseDate, purchaseErr := time.Parse(dateLayout, row.PurchaseDate)
	rate, rateErr := decimal.Parse(row.Rate)
	unitPrice, priceErr := decimal.Parse(row.UnitPrice)
	quantity, quantityErr := decimal.Parse(row.Quantity)

	if err := errors.Join(maturityErr, purchaseErr, rateErr, priceErr, quantityErr); err != nil {
		return Lot{}, err
	}

	return Lot{
		ID:           row.ID,
		Bond:         Bond{Type: Type(row.BondType), Maturity: maturity},
		PurchaseDate: purchaseDate,
		Rate:         rate,
		UnitPrice:    unitPrice,
		Quantity:     quantity,
	}, nil
}

func parseRate(effectiveFrom, rate string) (time.Time, decimal.Decimal, error) {
	from, fromErr := time.Parse(dateLayout, effectiveFrom)
	r, rateErr := decimal.Parse(rate)

	return from, r, errors.Join(fromErr, rateErr)
}
