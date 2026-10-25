// Package sgs is a client for the Banco Central do Brasil SGS time-series API.
package sgs

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/gringolito/debtwise/backend/decimal"
)

const (
	defaultBaseURL = "https://api.bcb.gov.br/dados/serie"
	// defaultTimeout leaves room for the API's slowest answers: a 5-year window of a daily series
	// it has not served recently takes about 11 seconds, and its gateway gives up at about 30.
	defaultTimeout = 2 * time.Minute

	// windowYears is the length of the windows a range is split into. The API caps a window of a
	// daily series at 10 years (01/01/2010 to 31/12/2019 is answered, 01/01/2010 to 02/01/2020 is
	// refused with a 406), but a cold 10-year window outlasts the API gateway's limit of about 30
	// seconds, which answers an HTML page with status 200. A 5-year window answers in about 11.
	windowYears = 5

	// noRowsDetail is in the detail of the 404 the API answers when a window has no rows.
	noRowsDetail = "Value(s) not found"

	// maxErrorBody bounds how much of a 404 body is read.
	maxErrorBody = 1 << 16

	// apiDate is the date layout of the API's query parameters and of its rows.
	apiDate = "02/01/2006"
)

// Observation is one row of an SGS series.
type Observation struct {
	Start time.Time       // the row's "data", midnight UTC
	End   time.Time       // the row's "dataFim", midnight UTC; zero when the row has none
	Value decimal.Decimal // the row's "valor", parsed exactly with decimal.Parse
}

// Client reads series from the SGS API. Create one with New.
type Client struct {
	baseURL string
	http    *http.Client
}

// Option configures a Client.
type Option func(*Client)

// WithBaseURL sets the URL that series paths are appended to. The default is the public SGS API.
func WithBaseURL(url string) Option {
	return func(c *Client) { c.baseURL = url }
}

// WithTimeout sets the deadline of each HTTP request. The default is 2 minutes.
func WithTimeout(d time.Duration) Option {
	return func(c *Client) { c.http.Timeout = d }
}

// New returns a Client for the public SGS API, changed by opts.
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

// Observations returns the rows of SGS series `series` dated from `from` through `to`, both
// inclusive (calendar dates of from/to), in the order the API returns them.
//
// The API caps a window at 10 years and the client does not know a series' periodicity, so it
// requests every range in windows of 5 years or less, one after the other.
// A window without rows adds nothing; any other failure stops the call.
func (c *Client) Observations(ctx context.Context, series int, from, to time.Time) ([]Observation, error) {
	from, to = midnightUTC(from), midnightUTC(to)

	var observations []Observation

	for start := from; !start.After(to); start = start.AddDate(windowYears, 0, 0) {
		end := start.AddDate(windowYears, 0, -1)
		if end.After(to) {
			end = to
		}

		window, err := c.window(ctx, series, start, end)
		if err != nil {
			return nil, fmt.Errorf("sgs: series %d from %s to %s: %w",
				series, start.Format(apiDate), end.Format(apiDate), err)
		}

		observations = append(observations, window...)
	}

	return observations, nil
}

// midnightUTC returns the calendar date of t as midnight UTC.
func midnightUTC(t time.Time) time.Time {
	year, month, day := t.Date()

	return time.Date(year, month, day, 0, 0, 0, 0, time.UTC)
}

// row is a row as the API sends it.
type row struct {
	Start string `json:"data"`
	End   string `json:"dataFim"`
	Value string `json:"valor"`
}

func (r row) observation() (Observation, error) {
	start, err := time.Parse(apiDate, r.Start)
	if err != nil {
		return Observation{}, fmt.Errorf("start: %w", err)
	}

	var end time.Time
	if r.End != "" {
		if end, err = time.Parse(apiDate, r.End); err != nil {
			return Observation{}, fmt.Errorf("end: %w", err)
		}
	}

	value, err := decimal.Parse(r.Value)
	if err != nil {
		return Observation{}, err
	}

	return Observation{Start: start, End: end, Value: value}, nil
}

// notFoundBody is the body of a 404.
type notFoundBody struct {
	Error struct {
		StatusCode int    `json:"statusCode"`
		Detail     string `json:"detail"`
	} `json:"erro"`
}

// noRows reports whether the 404 says that the window has no rows, rather than that the request
// failed some other way.
func (b notFoundBody) noRows() bool {
	return b.Error.StatusCode == http.StatusNotFound && strings.Contains(b.Error.Detail, noRowsDetail)
}

// window requests the rows from `from` through `to`, which span windowYears or less.
func (c *Client) window(ctx context.Context, series int, from, to time.Time) ([]Observation, error) {
	url := fmt.Sprintf("%s/bcdata.sgs.%d/dados?formato=json&dataInicial=%s&dataFinal=%s",
		c.baseURL, series, from.Format(apiDate), to.Format(apiDate))

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, err
	}

	resp, err := c.http.Do(req)
	if err != nil {
		return nil, err
	}
	defer func() { _ = resp.Body.Close() }()

	if resp.StatusCode == http.StatusNotFound {
		var body notFoundBody

		err := json.NewDecoder(io.LimitReader(resp.Body, maxErrorBody)).Decode(&body)
		if err == nil && body.noRows() {
			return nil, nil
		}
	}

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("status %d", resp.StatusCode)
	}

	var rows []row
	if err := json.NewDecoder(resp.Body).Decode(&rows); err != nil {
		return nil, fmt.Errorf("decode response: %w", err)
	}

	observations := make([]Observation, len(rows))

	for i, r := range rows {
		if observations[i], err = r.observation(); err != nil {
			return nil, fmt.Errorf("row %d: %w", i, err)
		}
	}

	return observations, nil
}
