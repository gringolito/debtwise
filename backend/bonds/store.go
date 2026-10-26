package bonds

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"time"

	"github.com/gringolito/debtwise/backend/db"
	"github.com/gringolito/debtwise/backend/decimal"
)

// Price is a rate and the unit price it gives a bond on a date.
type Price struct {
	Rate      decimal.Decimal
	UnitPrice decimal.Decimal
}

// Quote is what Tesouro Direto offers for a bond: the price it sells the bond at, nil when it is
// not on offer, and the price it buys the bond back at.
type Quote struct {
	Bond      Bond
	Buy       *Price
	Sell      Price
	FetchedAt time.Time
}

// RefreshTimes are when the quotes were last refreshed successfully, zero when they never were,
// and when their latest refresh failed, zero when that refresh succeeded.
type RefreshTimes struct {
	RefreshedAt time.Time
	FailedAt    time.Time
}

const dateLayout = time.DateOnly

// Store persists the quotes and their refreshes in the database.
type Store struct {
	conn *sql.DB
}

func NewStore(conn *sql.DB) *Store {
	return &Store{conn: conn}
}

// SaveQuotes replaces every stored quote with quotes and records the refresh that fetched them at
// refreshedAt.
func (s *Store) SaveQuotes(ctx context.Context, quotes []Quote, refreshedAt time.Time) error {
	tx, err := s.conn.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("bonds: save quotes: begin: %w", err)
	}

	defer func() { _ = tx.Rollback() }()

	queries := db.New(tx)
	if err := queries.DeleteBondQuotes(ctx); err != nil {
		return fmt.Errorf("bonds: save quotes: delete stored quotes: %w", err)
	}

	for _, q := range quotes {
		if err := queries.InsertBondQuote(ctx, quoteParams(q)); err != nil {
			return fmt.Errorf("bonds: save quote %s %s: %w", q.Bond.Type, q.Bond.Maturity.Format(dateLayout), err)
		}
	}

	if err := queries.RecordBondQuotesRefreshed(ctx, nullTime(refreshedAt)); err != nil {
		return fmt.Errorf("bonds: record quotes refresh: %w", err)
	}

	if err := tx.Commit(); err != nil {
		return fmt.Errorf("bonds: save quotes: commit: %w", err)
	}

	return nil
}

// SaveFailure records that a refresh of the quotes failed at failedAt, and keeps the stored quotes.
func (s *Store) SaveFailure(ctx context.Context, failedAt time.Time) error {
	if err := db.New(s.conn).RecordBondQuotesFailed(ctx, nullTime(failedAt)); err != nil {
		return fmt.Errorf("bonds: record quotes failure: %w", err)
	}

	return nil
}

// Quotes returns the stored quotes, LTN before NTN-F and each by maturity.
func (s *Store) Quotes(ctx context.Context) ([]Quote, error) {
	rows, err := db.New(s.conn).ListBondQuotes(ctx)
	if err != nil {
		return nil, fmt.Errorf("bonds: quotes: %w", err)
	}

	quotes := make([]Quote, 0, len(rows))
	for _, row := range rows {
		q, err := quoteFromRow(row)
		if err != nil {
			return nil, fmt.Errorf("bonds: quote %s %s: %w", row.Type, row.Maturity, err)
		}

		quotes = append(quotes, q)
	}

	return quotes, nil
}

// RefreshTimes returns when the quotes were last refreshed and when their latest refresh failed.
func (s *Store) RefreshTimes(ctx context.Context) (RefreshTimes, error) {
	rows, err := db.New(s.conn).ListBondQuoteRefreshes(ctx)
	if err != nil {
		return RefreshTimes{}, fmt.Errorf("bonds: quotes refresh times: %w", err)
	}

	if len(rows) == 0 {
		return RefreshTimes{}, nil
	}

	refreshedAt, refreshedErr := parseNullTime(rows[0].RefreshedAt)
	failedAt, failedErr := parseNullTime(rows[0].FailedAt)

	if err := errors.Join(refreshedErr, failedErr); err != nil {
		return RefreshTimes{}, fmt.Errorf("bonds: quotes refresh times: %w", err)
	}

	return RefreshTimes{RefreshedAt: refreshedAt, FailedAt: failedAt}, nil
}

func quoteParams(q Quote) db.InsertBondQuoteParams {
	params := db.InsertBondQuoteParams{
		Type:          string(q.Bond.Type),
		Maturity:      q.Bond.Maturity.Format(dateLayout),
		SellRate:      q.Sell.Rate.String(),
		SellUnitPrice: q.Sell.UnitPrice.String(),
		FetchedAt:     formatTime(q.FetchedAt),
	}

	if q.Buy != nil {
		params.BuyRate = sql.NullString{String: q.Buy.Rate.String(), Valid: true}
		params.BuyUnitPrice = sql.NullString{String: q.Buy.UnitPrice.String(), Valid: true}
	}

	return params
}

func quoteFromRow(row db.BondQuote) (Quote, error) {
	maturity, maturityErr := time.Parse(dateLayout, row.Maturity)
	sell, sellErr := parsePrice(row.SellRate, row.SellUnitPrice)
	fetchedAt, fetchedErr := time.Parse(time.RFC3339, row.FetchedAt)

	if err := errors.Join(maturityErr, sellErr, fetchedErr); err != nil {
		return Quote{}, err
	}

	q := Quote{Bond: Bond{Type: Type(row.Type), Maturity: maturity}, Sell: sell, FetchedAt: fetchedAt}

	if row.BuyRate.Valid {
		buy, err := parsePrice(row.BuyRate.String, row.BuyUnitPrice.String)
		if err != nil {
			return Quote{}, err
		}

		q.Buy = &buy
	}

	return q, nil
}

func parsePrice(rate, unitPrice string) (Price, error) {
	r, rateErr := decimal.Parse(rate)
	p, priceErr := decimal.Parse(unitPrice)

	if err := errors.Join(rateErr, priceErr); err != nil {
		return Price{}, err
	}

	return Price{Rate: r, UnitPrice: p}, nil
}

func formatTime(t time.Time) string {
	return t.UTC().Format(time.RFC3339)
}

func nullTime(t time.Time) sql.NullString {
	return sql.NullString{String: formatTime(t), Valid: true}
}

func parseNullTime(s sql.NullString) (time.Time, error) {
	if !s.Valid {
		return time.Time{}, nil
	}

	return time.Parse(time.RFC3339, s.String)
}
