package marketdata

import (
	"context"
	"errors"
	"fmt"
	"regexp"
	"time"

	"github.com/gringolito/debtwise/backend/bonds"
	"github.com/gringolito/debtwise/backend/decimal"
	"github.com/gringolito/debtwise/backend/marketdata/radar"
)

// QuoteSource is the subset of *radar.Client the job reads.
type QuoteSource interface {
	Names(ctx context.Context) ([]string, error)
	Bond(ctx context.Context, name string) (radar.Bond, error)
}

// QuoteStore is the subset of *bonds.Store the job reads and writes.
type QuoteStore interface {
	SaveQuotes(ctx context.Context, quotes []bonds.Quote, at time.Time) error
	SaveFailure(ctx context.Context, at time.Time) error
	RefreshTimes(ctx context.Context) (bonds.RefreshTimes, error)
}

// tesouroName matches the names Tesouro Direto gives LTN and NTN-F bonds, such as "Tesouro
// Prefixado 2029" and "Tesouro Prefixado com Juros Semestrais 2037".
var tesouroName = regexp.MustCompile(`^Tesouro Prefixado( com Juros Semestrais)? \d{4}$`)

// bondType returns the type of the bond Tesouro Direto names name, or false when DebtWise does not
// compare it.
func bondType(name string) (bonds.Type, bool) {
	match := tesouroName.FindStringSubmatch(name)
	switch {
	case match == nil:
		return "", false
	case match[1] != "":
		return bonds.NTNF, true
	default:
		return bonds.LTN, true
	}
}

// refreshQuotes fetches the quote of every bond DebtWise compares and replaces the stored ones with
// them. When any fetch fails, the stored quotes stay and the failure is recorded.
func (j *Job) refreshQuotes(ctx context.Context, now time.Time) error {
	quotes, err := j.fetchQuotes(ctx, now)
	if err == nil {
		if err = j.quoteStore.SaveQuotes(ctx, quotes, now); err == nil {
			return nil
		}
	}

	// A refresh cut short by its caller is no failure of the source.
	if ctx.Err() == nil {
		if saveErr := j.quoteStore.SaveFailure(ctx, now); saveErr != nil {
			err = errors.Join(err, saveErr)
		}
	}

	return fmt.Errorf("marketdata: refresh bonds: %w", err)
}

func (j *Job) fetchQuotes(ctx context.Context, now time.Time) ([]bonds.Quote, error) {
	names, err := j.quoteSource.Names(ctx)
	if err != nil {
		return nil, err
	}

	var quotes []bonds.Quote

	for _, name := range names {
		t, ok := bondType(name)
		if !ok {
			continue
		}

		b, err := j.quoteSource.Bond(ctx, name)
		if err != nil {
			return nil, err
		}

		q, err := quote(t, b, now)
		if err != nil {
			return nil, err
		}

		quotes = append(quotes, q)
	}

	if len(quotes) == 0 {
		return nil, errors.New("radar lists no LTN or NTN-F")
	}

	return quotes, nil
}

// quote is the quote of a bond of type t that b describes, fetched at now. Radar's investment side
// is the buy side and its redemption side the sell side. A bond is on offer when its source quotes
// a positive buy price, which then needs a buy rate.
func quote(t bonds.Type, b radar.Bond, now time.Time) (bonds.Quote, error) {
	var zero decimal.Decimal
	if b.RedemptionRate == nil || b.RedemptionPrice.Cmp(zero) <= 0 {
		return bonds.Quote{}, fmt.Errorf("%s quotes no sell price", b.Name)
	}

	q := bonds.Quote{
		Bond:      bonds.Bond{Type: t, Maturity: b.Maturity},
		Sell:      bonds.Price{Rate: *b.RedemptionRate, UnitPrice: b.RedemptionPrice},
		FetchedAt: now,
	}

	if b.InvestmentPrice.Cmp(zero) <= 0 {
		return q, nil
	}

	if b.InvestmentRate == nil {
		return bonds.Quote{}, fmt.Errorf("%s quotes a buy price but no buy rate", b.Name)
	}

	q.Buy = &bonds.Price{Rate: *b.InvestmentRate, UnitPrice: b.InvestmentPrice}

	return q, nil
}
