package marketdata

import (
	"cmp"
	"context"
	"errors"
	"fmt"
	"regexp"
	"time"

	"github.com/gringolito/debtwise/backend/bonds"
	"github.com/gringolito/debtwise/backend/decimal"
)

// SourceQuote is a bond's quote as a QuoteSource reports it, before the job checks it.
type SourceQuote struct {
	// Name is Tesouro Direto's name of the bond, such as "Tesouro Prefixado 2029".
	Name     string
	Maturity time.Time // calendar date of the maturity, midnight UTC
	// BuyRate is the rate to buy the bond at, as a fraction, nil when the source quotes none.
	BuyRate *decimal.Decimal
	// BuyPrice is the unit price to buy the bond at, zero when the bond is not on offer.
	BuyPrice decimal.Decimal
	// SellRate is the rate Tesouro Direto buys the bond back at, as a fraction, nil when the
	// source quotes none.
	SellRate *decimal.Decimal
	// SellPrice is the unit price Tesouro Direto buys the bond back at.
	SellPrice decimal.Decimal
	// PricedAt is when Tesouro Direto priced the bond, zero when the source does not say.
	PricedAt time.Time
}

// QuoteSource is where the job reads the current bond quotes from.
type QuoteSource interface {
	// Fetch returns the quotes of the bonds the source lists whose name wanted accepts.
	Fetch(ctx context.Context, wanted func(name string) bool) ([]SourceQuote, error)
}

// QuoteStore is the subset of *bonds.Store the job reads and writes.
type QuoteStore interface {
	SaveQuotes(ctx context.Context, quotes []bonds.Quote, at time.Time) error
	SaveFailure(ctx context.Context, at time.Time) error
	RefreshTimes(ctx context.Context) (bonds.RefreshTimes, error)
}

// tesouroName matches the names Tesouro Direto gives the bonds DebtWise compares (ADR-0007), such
// as "Tesouro Prefixado 2029", "Tesouro IPCA+ 2035" and "Tesouro IPCA+ com Juros Semestrais 2037".
var tesouroName = regexp.MustCompile(`^Tesouro (Prefixado|IPCA\+)( com Juros Semestrais)? \d{4}$`)

// bondType returns the type of the bond Tesouro Direto names name, or false when DebtWise does not
// compare it.
func bondType(name string) (bonds.Type, bool) {
	match := tesouroName.FindStringSubmatch(name)
	if match == nil {
		return "", false
	}

	semestral := match[2] != ""

	switch {
	case match[1] == "Prefixado" && semestral:
		return bonds.NTNF, true
	case match[1] == "Prefixado":
		return bonds.LTN, true
	case semestral:
		return bonds.NTNB, true
	default:
		return bonds.NTNBPrincipal, true
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
	sourced, err := j.sources.Quotes.Fetch(ctx, compared)
	if err != nil {
		return nil, err
	}

	quotes := make([]bonds.Quote, 0, len(sourced))

	for _, s := range sourced {
		t, ok := bondType(s.Name)
		if !ok {
			continue
		}

		q, err := quote(t, s, now)
		if err != nil {
			return nil, err
		}

		quotes = append(quotes, q)
	}

	if len(quotes) == 0 {
		return nil, errors.New("the quote source lists no bond DebtWise compares")
	}

	return quotes, nil
}

// compared reports whether DebtWise compares the bond Tesouro Direto names name.
func compared(name string) bool {
	_, ok := bondType(name)

	return ok
}

// quote is the quote of a bond of type t that s describes. A bond is on offer when its source
// quotes a positive buy price, which then needs a buy rate. The quote is timed by when Tesouro
// Direto priced the bond, or by now when the source does not say.
func quote(t bonds.Type, s SourceQuote, now time.Time) (bonds.Quote, error) {
	var zero decimal.Decimal
	if s.SellRate == nil || s.SellPrice.Cmp(zero) <= 0 {
		return bonds.Quote{}, fmt.Errorf("%s quotes no sell price", s.Name)
	}

	q := bonds.Quote{
		Bond:      bonds.Bond{Type: t, Maturity: s.Maturity},
		Sell:      bonds.Price{Rate: *s.SellRate, UnitPrice: s.SellPrice},
		FetchedAt: cmp.Or(s.PricedAt, now),
	}

	if s.BuyPrice.Cmp(zero) <= 0 {
		return q, nil
	}

	if s.BuyRate == nil {
		return bonds.Quote{}, fmt.Errorf("%s quotes a buy price but no buy rate", s.Name)
	}

	q.Buy = &bonds.Price{Rate: *s.BuyRate, UnitPrice: s.BuyPrice}

	return q, nil
}
