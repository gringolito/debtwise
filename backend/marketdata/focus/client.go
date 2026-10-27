// Package focus is a client for the "Expectativas" OData service that Banco Central do Brasil
// publishes on Olinda: the median of the market's expectations in the Focus survey. It knows
// nothing of DebtWise (see ADR-0004).
package focus

import (
	"cmp"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"slices"
	"strconv"
	"strings"
	"time"

	"github.com/gringolito/debtwise/backend/decimal"
)

const (
	defaultBaseURL = "https://olinda.bcb.gov.br/olinda/servico/Expectativas/versao/v1/odata"
	// defaultTimeout is the one of the SGS client, which is also BCB's.
	defaultTimeout = 2 * time.Minute

	// lookbackDays is how far before the day the client looks for a survey, so that a day without
	// one (a weekend, a holiday) is answered by the survey before it.
	lookbackDays = 30

	apiDate = "2006-01-02"

	// Indicators and endpoints of the service.
	indicatorSelic = "Selic"
	indicatorIPCA  = "IPCA"
	pathSelic      = "/ExpectativasMercadoSelic"
	pathMonthly    = "/ExpectativaMercadoMensais"
	pathAnnual     = "/ExpectativasMercadoAnuais"

	// Columns that name what an expectation is for.
	columnMeeting   = "Reuniao"
	columnReference = "DataReferencia"
)

// Meeting is the median expectation of the Selic target after a Copom meeting.
type Meeting struct {
	Year   int             // the meeting's year, 2028 in "R6/2028"
	Number int             // the meeting's number in its year, 6 in "R6/2028"
	Median decimal.Decimal // the Selic target in % a year, as the service sends it
}

// Month is the median expectation of the IPCA variation in a month.
type Month struct {
	Month  time.Time       // the first day of the month, midnight UTC
	Median decimal.Decimal // the variation in %, as the service sends it
}

// Year is the median expectation of the IPCA variation in a year.
type Year struct {
	Year   int             // the year
	Median decimal.Decimal // the variation in %, as the service sends it
}

// Client reads expectations from the Olinda service. Create one with New.
type Client struct {
	baseURL string
	http    *http.Client
}

// Option configures a Client.
type Option func(*Client)

// WithBaseURL sets the URL that endpoint paths are appended to. The default is the public service.
func WithBaseURL(url string) Option {
	return func(c *Client) { c.baseURL = url }
}

// WithTimeout sets the deadline of each HTTP request. The default is 2 minutes.
func WithTimeout(d time.Duration) Option {
	return func(c *Client) { c.http.Timeout = d }
}

// New returns a Client for the public Olinda service, changed by opts.
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

// Selic returns the median expectation of the Selic target for each Copom meeting in the latest
// survey dated `day` or up to 30 days before it (the calendar date of day), by meeting.
// It fails when there is no survey in that time.
func (c *Client) Selic(ctx context.Context, day time.Time) ([]Meeting, error) {
	return survey(ctx, c, endpoint{pathSelic, indicatorSelic, columnMeeting}, day, parseMeeting,
		func(a, b Meeting) int {
			return cmp.Or(cmp.Compare(a.Year, b.Year), cmp.Compare(a.Number, b.Number))
		})
}

// MonthlyIPCA returns the median expectation of the IPCA variation for each month in the latest
// survey dated `day` or up to 30 days before it (the calendar date of day), by month.
// It fails when there is no survey in that time.
func (c *Client) MonthlyIPCA(ctx context.Context, day time.Time) ([]Month, error) {
	return survey(ctx, c, endpoint{pathMonthly, indicatorIPCA, columnReference}, day, parseMonth,
		func(a, b Month) int { return a.Month.Compare(b.Month) })
}

// AnnualIPCA returns the median expectation of the IPCA variation for each year in the latest
// survey dated `day` or up to 30 days before it (the calendar date of day), by year.
// It fails when there is no survey in that time.
func (c *Client) AnnualIPCA(ctx context.Context, day time.Time) ([]Year, error) {
	return survey(ctx, c, endpoint{pathAnnual, indicatorIPCA, columnReference}, day, parseYear,
		func(a, b Year) int { return cmp.Compare(a.Year, b.Year) })
}

// endpoint is one table of the service and the rows asked of it.
type endpoint struct {
	path      string
	indicator string
	column    string // what the expectation is for: columnMeeting or columnReference
}

// row is one row of an answer. Which of the two reference columns is set depends on the endpoint.
type row struct {
	Date      string      `json:"Data"`
	Meeting   string      `json:"Reuniao"`
	Reference string      `json:"DataReferencia"`
	Median    json.Number `json:"Mediana"`
}

type answer struct {
	Value *[]row `json:"value"`
}

// survey requests the endpoint's rows of the latest survey on or before day, parses each one with
// parse and returns them sorted by compare.
func survey[T any](
	ctx context.Context,
	c *Client,
	e endpoint,
	day time.Time,
	parse func(reference string, median decimal.Decimal) (T, error),
	compare func(a, b T) int,
) ([]T, error) {
	day = midnightUTC(day)

	rows, err := c.latest(ctx, e, day)
	if err != nil {
		return nil, fmt.Errorf("focus: %s up to %s: %w", e.path[1:], day.Format(apiDate), err)
	}

	out := make([]T, len(rows))

	for i, r := range rows {
		reference := r.Reference
		if e.column == columnMeeting {
			reference = r.Meeting
		}

		median, err := decimal.Parse(r.Median.String())
		if err != nil {
			return nil, fmt.Errorf("focus: %s up to %s: row %d: median: %w",
				e.path[1:], day.Format(apiDate), i, err)
		}

		if out[i], err = parse(reference, median); err != nil {
			return nil, fmt.Errorf("focus: %s up to %s: row %d: %w",
				e.path[1:], day.Format(apiDate), i, err)
		}
	}

	slices.SortFunc(out, compare)

	return out, nil
}

func midnightUTC(t time.Time) time.Time {
	year, month, d := t.Date()

	return time.Date(year, month, d, 0, 0, 0, 0, time.UTC)
}

// escape percent-encodes s for a query. The service does not read "+" as a space.
func escape(s string) string {
	return strings.ReplaceAll(url.QueryEscape(s), "+", "%20")
}

// latest requests the rows of the survey dated `day` or up to lookbackDays before it, and returns
// those of the latest survey in the answer.
func (c *Client) latest(ctx context.Context, e endpoint, day time.Time) ([]row, error) {
	filter := fmt.Sprintf("Indicador eq '%s' and baseCalculo eq 0 and Data ge '%s' and Data le '%s'",
		e.indicator, day.AddDate(0, 0, -lookbackDays).Format(apiDate), day.Format(apiDate))
	query := "%24filter=" + escape(filter) +
		"&%24orderby=" + escape("Data desc") +
		"&%24select=" + escape("Data,"+e.column+",Mediana") +
		"&%24format=json"

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.baseURL+e.path+"?"+query, nil)
	if err != nil {
		return nil, err
	}

	resp, err := c.http.Do(req)
	if err != nil {
		return nil, err
	}
	defer func() { _ = resp.Body.Close() }()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("status %d", resp.StatusCode)
	}

	var body answer

	decoder := json.NewDecoder(resp.Body)
	decoder.UseNumber()

	if err := decoder.Decode(&body); err != nil {
		return nil, fmt.Errorf("decode response: %w", err)
	}

	if body.Value == nil {
		return nil, errors.New("decode response: no \"value\"")
	}

	var latest string

	for i, r := range *body.Value {
		if _, err := time.Parse(apiDate, r.Date); err != nil {
			return nil, fmt.Errorf("row %d: date: %w", i, err)
		}

		latest = max(latest, r.Date)
	}

	if latest == "" {
		return nil, errors.New("no survey")
	}

	rows := slices.DeleteFunc(*body.Value, func(r row) bool { return r.Date != latest })

	return rows, nil
}

// parseMeeting reads a Copom meeting such as "R6/2028".
func parseMeeting(reference string, median decimal.Decimal) (Meeting, error) {
	number, year, ok := strings.Cut(strings.TrimPrefix(reference, "R"), "/")
	if !ok || !strings.HasPrefix(reference, "R") {
		return Meeting{}, fmt.Errorf("meeting %q: want \"R<number>/<year>\"", reference)
	}

	n, err := strconv.ParseUint(number, 10, 31)
	if err != nil {
		return Meeting{}, fmt.Errorf("meeting %q: number: %w", reference, err)
	}

	y, err := yearOf(year)
	if err != nil {
		return Meeting{}, fmt.Errorf("meeting %q: %w", reference, err)
	}

	return Meeting{Year: y, Number: int(n), Median: median}, nil
}

// parseMonth reads a month such as "10/2028".
func parseMonth(reference string, median decimal.Decimal) (Month, error) {
	month, err := time.Parse("01/2006", reference)
	if err != nil {
		return Month{}, fmt.Errorf("month %q: %w", reference, err)
	}

	return Month{Month: month, Median: median}, nil
}

// parseYear reads a year such as "2028".
func parseYear(reference string, median decimal.Decimal) (Year, error) {
	year, err := yearOf(reference)
	if err != nil {
		return Year{}, fmt.Errorf("year %q: %w", reference, err)
	}

	return Year{Year: year, Median: median}, nil
}

// yearOf reads the four digits of a year.
func yearOf(s string) (int, error) {
	t, err := time.Parse("2006", s)
	if err != nil {
		return 0, err
	}

	return t.Year(), nil
}
