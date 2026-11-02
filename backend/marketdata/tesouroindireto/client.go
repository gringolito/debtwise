// Package tesouroindireto is a client for the Tesouro Indireto API, which serves the current rates
// and prices of the Tesouro Direto bonds.
package tesouroindireto

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"time"

	"github.com/gringolito/debtwise/backend/decimal"
)

const defaultTimeout = 30 * time.Second

// maxProblemSize caps how much of an error answer is read for its problem detail.
const maxProblemSize = 64 << 10

// Bond is a treasury bond as the API prices it.
type Bond struct {
	Name     string
	Maturity time.Time // calendar date of the maturity, midnight UTC
	// BuyRate is the annual rate an investor buys at, as a fraction ("13.40" percent is 0.1340).
	// It is nil when the bond is not on offer.
	BuyRate *decimal.Decimal
	// BuyPrice is the unit price to buy the bond, zero when the bond is not on offer.
	BuyPrice decimal.Decimal
	// SellRate is the annual rate an investor sells at, as a fraction.
	SellRate decimal.Decimal
	// SellPrice is the unit price Tesouro Direto pays to buy the bond back.
	SellPrice decimal.Decimal
	// PricedAt is when Tesouro Direto priced the bond.
	PricedAt time.Time
}

type rateBody struct {
	Rate string `json:"rate"`
}

type bondBody struct {
	Name      string    `json:"name"`
	Maturity  time.Time `json:"maturity"`
	BuyRate   *rateBody `json:"buyRate"`
	SellRate  *rateBody `json:"sellRate"`
	BuyPrice  string    `json:"buyPrice"`
	SellPrice string    `json:"sellPrice"`
	PricedAt  time.Time `json:"pricedAt"`
}

func (b bondBody) bond() (Bond, error) {
	if b.SellRate == nil {
		return Bond{}, errors.New("sell rate: missing")
	}

	sellRate, err := parseRate(b.SellRate.Rate)
	if err != nil {
		return Bond{}, fmt.Errorf("sell rate: %w", err)
	}

	var buyRate *decimal.Decimal

	if b.BuyRate != nil {
		r, err := parseRate(b.BuyRate.Rate)
		if err != nil {
			return Bond{}, fmt.Errorf("buy rate: %w", err)
		}

		buyRate = &r
	}

	buyPrice, err := decimal.Parse(b.BuyPrice)
	if err != nil {
		return Bond{}, fmt.Errorf("buy price: %w", err)
	}

	sellPrice, err := decimal.Parse(b.SellPrice)
	if err != nil {
		return Bond{}, fmt.Errorf("sell price: %w", err)
	}

	return Bond{
		Name:      b.Name,
		Maturity:  time.Date(b.Maturity.Year(), b.Maturity.Month(), b.Maturity.Day(), 0, 0, 0, 0, time.UTC),
		BuyRate:   buyRate,
		BuyPrice:  buyPrice,
		SellRate:  sellRate,
		SellPrice: sellPrice,
		PricedAt:  b.PricedAt,
	}, nil
}

// parseRate returns the annual percent the API publishes as a fraction.
func parseRate(percent string) (decimal.Decimal, error) {
	n, err := decimal.Parse(percent)
	if err != nil {
		return decimal.Decimal{}, err
	}

	return decimal.PercentToFraction(n), nil
}

// problem is the part of an RFC 9457 problem document an error reports.
type problem struct {
	Detail string `json:"detail"`
}

// Client reads bonds from a Tesouro Indireto API. Create one with New.
type Client struct {
	baseURL string
	apiKey  string
	http    *http.Client
}

// Option configures a Client.
type Option func(*Client)

// WithTimeout sets the deadline of each HTTP request. The default is 30 seconds.
func WithTimeout(d time.Duration) Option {
	return func(c *Client) { c.http.Timeout = d }
}

// New returns a Client for the API at baseURL that authenticates with apiKey, changed by opts.
func New(baseURL, apiKey string, opts ...Option) *Client {
	c := &Client{
		baseURL: baseURL,
		apiKey:  apiKey,
		http:    &http.Client{Timeout: defaultTimeout},
	}
	for _, opt := range opts {
		opt(c)
	}

	return c
}

// Bonds returns every bond the API lists, in the order it lists them.
func (c *Client) Bonds(ctx context.Context) ([]Bond, error) {
	bodies, err := c.list(ctx)
	if err != nil {
		return nil, fmt.Errorf("tesouroindireto: bond list: %w", err)
	}

	bonds := make([]Bond, 0, len(bodies))

	for _, body := range bodies {
		b, err := body.bond()
		if err != nil {
			return nil, fmt.Errorf("tesouroindireto: bond %q: %w", body.Name, err)
		}

		bonds = append(bonds, b)
	}

	return bonds, nil
}

func (c *Client) list(ctx context.Context) ([]bondBody, error) {
	endpoint, err := url.JoinPath(c.baseURL, "bonds")
	if err != nil {
		return nil, err
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return nil, err
	}

	req.Header.Set("Authorization", "Bearer "+c.apiKey)

	resp, err := c.http.Do(req)
	if err != nil {
		return nil, err
	}
	defer func() { _ = resp.Body.Close() }()

	if resp.StatusCode != http.StatusOK {
		return nil, statusError(resp)
	}

	var bodies []bondBody
	if err := json.NewDecoder(resp.Body).Decode(&bodies); err != nil {
		return nil, fmt.Errorf("decode response: %w", err)
	}

	return bodies, nil
}

// statusError reports an answer other than 200 by its status and, when its body is a problem
// document, the problem's detail.
func statusError(resp *http.Response) error {
	var p problem
	if err := json.NewDecoder(io.LimitReader(resp.Body, maxProblemSize)).Decode(&p); err != nil || p.Detail == "" {
		return fmt.Errorf("status %d", resp.StatusCode)
	}

	return fmt.Errorf("status %d: %s", resp.StatusCode, p.Detail)
}
