// Package sidra is a client for the IBGE SIDRA API, which serves the statistical tables of IBGE.
package sidra

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"slices"
	"strings"
	"time"

	"github.com/gringolito/debtwise/backend/decimal"
)

const (
	defaultBaseURL = "https://apisidra.ibge.gov.br"
	defaultTimeout = 2 * time.Minute

	// maxErrorBody bounds how much of an error answer is quoted in an error.
	maxErrorBody = 512

	// periodLayout is the layout of a SIDRA monthly period code ("202401") and of the period
	// range in the request path.
	periodLayout = "200601"

	// windowMonths is the length of the windows a range is split into: 50 years of one value per
	// month, 600 values, against a cap of 50,000 values per request.
	windowMonths = 600
)

// Value is one monthly value of a SIDRA table.
type Value struct {
	Month time.Time       // first day of the month, midnight UTC
	Value decimal.Decimal // the published value, parsed exactly with decimal.Parse
}

// Client reads tables from the SIDRA API. Create one with New.
type Client struct {
	baseURL string
	http    *http.Client
}

// Option configures a Client.
type Option func(*Client)

// WithBaseURL sets the URL that request paths are appended to. The default is the public SIDRA API.
func WithBaseURL(url string) Option {
	return func(c *Client) { c.baseURL = url }
}

// WithTimeout sets the deadline of each HTTP request. The default is 2 minutes.
func WithTimeout(d time.Duration) Option {
	return func(c *Client) { c.http.Timeout = d }
}

// New returns a Client for the public SIDRA API, changed by opts.
func New(opts ...Option) *Client {
	c := &Client{
		baseURL: defaultBaseURL,
		http:    &http.Client{Timeout: defaultTimeout},
	}
	for _, opt := range opts {
		opt(c)
	}

	return c
}

// row is one element of the array SIDRA answers. The first element is a header whose fields
// describe the columns; the others hold the values. D3C is the period code only when the request
// has the variable, the territory and the period as its three dimensions, as MonthlyValues does.
type row struct {
	Value  string `json:"V"`
	Period string `json:"D3C"`
}

func (r row) value() (Value, error) {
	month, err := time.Parse(periodLayout, r.Period)
	if err != nil {
		return Value{}, fmt.Errorf("period %q: %w", r.Period, err)
	}

	value, err := decimal.Parse(r.Value)
	if err != nil {
		return Value{}, fmt.Errorf("period %s: %w", r.Period, err)
	}

	return Value{Month: month, Value: value}, nil
}

// MonthlyValues returns the values of variable in table for Brazil (territorial level n1), for
// every month from the month of `from` through the month of `to`, oldest first. Each request is
// /values/t/{table}/n1/all/v/{variable}/p/{YYYYMM}-{YYYYMM}.
//
// SIDRA caps a request at 50,000 values (it answers 400 "Quantidade de valores solicitados: N
// excedeu o limite: 50000"). A request here has one value per month, so the range is requested in
// windows of windowMonths months or less, one after the other; every window stays far below the
// cap. Any failure stops the call, which returns no values.
//
// A month SIDRA has not published (yet) is absent from its answer and so from the result, which
// then holds only the published months, not necessarily every month of the range; a range in
// which nothing is published, or that ends before it starts, yields no values.
//
// A month that SIDRA lists without a number (its markers are "..." for not available, "-" for
// zero by rounding or none, "X" for withheld) is an error: a value is never invented.
func (c *Client) MonthlyValues(ctx context.Context, table, variable int, from, to time.Time) ([]Value, error) {
	from, to = monthOf(from), monthOf(to)

	var values []Value

	for start := from; !start.After(to); start = start.AddDate(0, windowMonths, 0) {
		end := start.AddDate(0, windowMonths-1, 0)
		if end.After(to) {
			end = to
		}

		window, err := c.window(ctx, table, variable, start, end)
		if err != nil {
			return nil, fmt.Errorf("sidra: table %d variable %d from %s to %s: %w",
				table, variable, start.Format(periodLayout), end.Format(periodLayout), err)
		}

		values = append(values, window...)
	}

	return values, nil
}

func monthOf(t time.Time) time.Time {
	year, month, _ := t.Date()

	return time.Date(year, month, 1, 0, 0, 0, 0, time.UTC)
}

// window requests the months from `from` through `to`, which span windowMonths or less.
func (c *Client) window(ctx context.Context, table, variable int, from, to time.Time) ([]Value, error) {
	url := fmt.Sprintf("%s/values/t/%d/n1/all/v/%d/p/%s-%s",
		c.baseURL, table, variable, from.Format(periodLayout), to.Format(periodLayout))

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, err
	}

	resp, err := c.http.Do(req)
	if err != nil {
		return nil, err
	}
	defer func() { _ = resp.Body.Close() }()

	if resp.StatusCode != http.StatusOK {
		// SIDRA explains a refusal (400) in a short plain-text body.
		reason, _ := io.ReadAll(io.LimitReader(resp.Body, maxErrorBody))
		if text := strings.TrimSpace(string(reason)); text != "" {
			return nil, fmt.Errorf("status %d: %s", resp.StatusCode, text)
		}

		return nil, fmt.Errorf("status %d", resp.StatusCode)
	}

	var rows []row
	if err := json.NewDecoder(resp.Body).Decode(&rows); err != nil {
		return nil, fmt.Errorf("decode response: %w", err)
	}

	if len(rows) == 0 {
		return nil, fmt.Errorf("decode response: no header row")
	}

	values := make([]Value, len(rows)-1)

	for i, r := range rows[1:] {
		if values[i], err = r.value(); err != nil {
			return nil, fmt.Errorf("row %d: %w", i, err)
		}
	}

	slices.SortFunc(values, func(a, b Value) int { return a.Month.Compare(b.Month) })

	return values, nil
}
