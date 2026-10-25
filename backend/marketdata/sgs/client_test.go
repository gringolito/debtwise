package sgs_test

import (
	"context"
	"fmt"
	"net"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/gringolito/debtwise/backend/marketdata/sgs"
)

// response is one reply of the BCB API. The files in testdata hold the bodies recorded from the
// API, and status and content type are the ones it answered with. A body that the API only gives
// in rare failures, and that is too small to record, is written inline instead.
type response struct {
	status      int
	contentType string
	file        string
	body        string
}

const jsonType = "application/json; charset=utf-8"

var notFound = response{status: http.StatusNotFound, contentType: jsonType, file: "notfound.json"}

func jsonOK(file string) response {
	return response{status: http.StatusOK, contentType: jsonType, file: file}
}

// replayer is a test double of the BCB API. It answers the nth request with the nth response, the
// last one for every request after that, and remembers the URI of each request.
type replayer struct {
	t         *testing.T
	responses []response

	mu       sync.Mutex
	requests []string
}

// newClient returns a client that talks to a replayer serving responses.
func newClient(t *testing.T, responses ...response) (*sgs.Client, *replayer) {
	t.Helper()

	r := &replayer{t: t, responses: responses}
	server := httptest.NewServer(r)
	t.Cleanup(server.Close)

	return sgs.New(sgs.WithBaseURL(server.URL)), r
}

func (r *replayer) ServeHTTP(w http.ResponseWriter, req *http.Request) {
	r.mu.Lock()
	n := len(r.requests)
	r.requests = append(r.requests, req.URL.RequestURI())
	r.mu.Unlock()

	resp := r.responses[min(n, len(r.responses)-1)]

	body := []byte(resp.body)

	if resp.file != "" {
		var err error
		if body, err = os.ReadFile(filepath.Join("testdata", resp.file)); err != nil {
			r.t.Errorf("read recorded response: %v", err)
			w.WriteHeader(http.StatusInternalServerError)

			return
		}
	}

	w.Header().Set("Content-Type", resp.contentType)
	w.WriteHeader(resp.status)

	if _, err := w.Write(body); err != nil {
		r.t.Errorf("write response: %v", err)
	}
}

// requested returns the URI of every request the replayer has seen, in order.
func (r *replayer) requested() []string {
	r.mu.Lock()
	defer r.mu.Unlock()

	return append([]string(nil), r.requests...)
}

// window2010to2014 is the first window of the 2010s, as "dataInicial-dataFinal".
const window2010to2014 = "01/01/2010-31/12/2014"

// windows returns the "dataInicial-dataFinal" of every request, after checking that each one asks
// for series in JSON.
func (r *replayer) windows(t *testing.T, series int) []string {
	t.Helper()

	windows := make([]string, 0, len(r.requested()))

	for _, uri := range r.requested() {
		u, err := url.ParseRequestURI(uri)
		require.NoError(t, err)
		assert.Equal(t, fmt.Sprintf("/bcdata.sgs.%d/dados", series), u.Path)
		assert.Equal(t, "json", u.Query().Get("formato"))

		windows = append(windows, u.Query().Get("dataInicial")+"-"+u.Query().Get("dataFinal"))
	}

	return windows
}

func date(year int, month time.Month, day int) time.Time {
	return time.Date(year, month, day, 0, 0, 0, 0, time.UTC)
}

// rows renders observations as "start end value" lines, with "-" for a missing end, after checking
// that every date is midnight UTC.
func rows(t *testing.T, observations []sgs.Observation) []string {
	t.Helper()

	got := make([]string, 0, len(observations))

	for _, o := range observations {
		require.True(t, o.Start.Equal(date(o.Start.Year(), o.Start.Month(), o.Start.Day())),
			"start %s is not midnight UTC", o.Start)

		end := "-"

		if !o.End.IsZero() {
			require.True(t, o.End.Equal(date(o.End.Year(), o.End.Month(), o.End.Day())),
				"end %s is not midnight UTC", o.End)

			end = o.End.Format(time.DateOnly)
		}

		got = append(got, strings.Join([]string{o.Start.Format(time.DateOnly), end, o.Value.String()}, " "))
	}

	return got
}

func TestObservationsParsesRecordedSeries(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name   string
		series int
		file   string
		from   time.Time
		to     time.Time
		want   []string
	}{
		{
			// The TR repeats the period start 2024-03-01 at the month boundary, once per period end.
			name:   "TR keeps the repeated period starts",
			series: 226,
			file:   "226.json",
			from:   date(2024, 2, 25),
			to:     date(2024, 3, 5),
			want: []string{
				"2024-02-25 2024-03-25 0.0340",
				"2024-02-26 2024-03-26 0.0627",
				"2024-02-27 2024-03-27 0.0623",
				"2024-02-28 2024-03-28 0.0612",
				"2024-02-29 2024-03-29 0.0620",
				"2024-03-01 2024-03-30 0.0331",
				"2024-03-01 2024-03-31 0.0331",
				"2024-03-01 2024-04-01 0.0331",
				"2024-03-02 2024-04-02 0.0300",
				"2024-03-03 2024-04-03 0.0562",
				"2024-03-04 2024-04-04 0.0824",
				"2024-03-05 2024-04-05 0.0812",
			},
		},
		{
			name:   "poupança has a period end",
			series: 195,
			file:   "195.json",
			from:   date(2024, 3, 1),
			to:     date(2024, 3, 10),
			want: []string{
				"2024-03-01 2024-04-01 0.5333",
				"2024-03-02 2024-04-02 0.5302",
				"2024-03-03 2024-04-03 0.5565",
				"2024-03-04 2024-04-04 0.5828",
				"2024-03-05 2024-04-05 0.5816",
				"2024-03-06 2024-04-06 0.5784",
				"2024-03-07 2024-04-07 0.5475",
				"2024-03-08 2024-04-08 0.5197",
				"2024-03-09 2024-04-09 0.5551",
				"2024-03-10 2024-04-10 0.5809",
			},
		},
		{
			name:   "Selic target includes dates after today",
			series: 432,
			file:   "432.json",
			from:   date(2026, 10, 20),
			to:     date(2026, 12, 31),
			want: []string{
				"2026-10-20 - 13.75",
				"2026-10-21 - 13.75",
				"2026-10-22 - 13.75",
				"2026-10-23 - 13.75",
				"2026-10-24 - 13.75",
				"2026-10-25 - 13.75",
				"2026-10-26 - 13.75",
				"2026-10-27 - 13.75",
				"2026-10-28 - 13.75",
				"2026-10-29 - 13.75",
				"2026-10-30 - 13.75",
				"2026-10-31 - 13.75",
				"2026-11-01 - 13.75",
				"2026-11-02 - 13.75",
				"2026-11-03 - 13.75",
				"2026-11-04 - 13.75",
			},
		},
		{
			name:   "daily Selic keeps all six places",
			series: 11,
			file:   "11.json",
			from:   date(2024, 10, 1),
			to:     date(2024, 10, 10),
			want: []string{
				"2024-10-01 - 0.040168",
				"2024-10-02 - 0.040168",
				"2024-10-03 - 0.040168",
				"2024-10-04 - 0.040168",
				"2024-10-07 - 0.040168",
				"2024-10-08 - 0.040168",
				"2024-10-09 - 0.040168",
				"2024-10-10 - 0.040168",
			},
		},
		{
			name:   "IPCA has negative months",
			series: 433,
			file:   "433.json",
			from:   date(2022, 6, 1),
			to:     date(2022, 10, 1),
			want: []string{
				"2022-06-01 - 0.67",
				"2022-07-01 - -0.68",
				"2022-08-01 - -0.36",
				"2022-09-01 - -0.29",
				"2022-10-01 - 0.59",
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			client, _ := newClient(t, jsonOK(tt.file))

			got, err := client.Observations(context.Background(), tt.series, tt.from, tt.to)

			require.NoError(t, err)
			assert.Equal(t, tt.want, rows(t, got))
		})
	}
}

func TestObservationsRequestsTheSeriesURL(t *testing.T) {
	t.Parallel()

	client, server := newClient(t, jsonOK("433.json"))

	_, err := client.Observations(context.Background(), 433, date(2022, 6, 1), date(2022, 10, 1))

	require.NoError(t, err)
	assert.Equal(t, []string{
		"/bcdata.sgs.433/dados?formato=json&dataInicial=01/06/2022&dataFinal=01/10/2022",
	}, server.requested())
}

func TestObservationsSplitsRangesIntoWindowsOfFiveYearsOrLess(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name string
		from time.Time
		to   time.Time
		want []string // "dataInicial-dataFinal" of each request
	}{
		{
			name: "five years fit one window",
			from: date(2010, 1, 1),
			to:   date(2014, 12, 31),
			want: []string{window2010to2014},
		},
		{
			name: "one day past five years opens a second window",
			from: date(2010, 1, 1),
			to:   date(2015, 1, 1),
			want: []string{window2010to2014, "01/01/2015-01/01/2015"},
		},
		{
			name: "a backfill of more than twenty years",
			from: date(2000, 1, 1),
			to:   date(2026, 10, 25),
			want: []string{
				"01/01/2000-31/12/2004",
				"01/01/2005-31/12/2009",
				window2010to2014,
				"01/01/2015-31/12/2019",
				"01/01/2020-31/12/2024",
				"01/01/2025-25/10/2026",
			},
		},
		{
			name: "windows starting on a leap day stay contiguous",
			from: date(2000, 2, 29),
			to:   date(2012, 1, 1),
			want: []string{"29/02/2000-28/02/2005", "01/03/2005-28/02/2010", "01/03/2010-01/01/2012"},
		},
		{
			name: "a single day",
			from: date(2024, 3, 1),
			to:   date(2024, 3, 1),
			want: []string{"01/03/2024-01/03/2024"},
		},
		{
			name: "the time of day is ignored",
			from: time.Date(2024, 3, 1, 23, 59, 0, 0, time.UTC),
			to:   time.Date(2024, 3, 2, 0, 1, 0, 0, time.UTC),
			want: []string{"01/03/2024-02/03/2024"},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			client, server := newClient(t, jsonOK("433.json"))

			_, err := client.Observations(context.Background(), 11, tt.from, tt.to)
			require.NoError(t, err)

			assert.Equal(t, tt.want, server.windows(t, 11))
		})
	}
}

func TestObservationsConcatenatesWindowsInOrder(t *testing.T) {
	t.Parallel()

	// The API answers a window without rows with a 404.
	client, server := newClient(t,
		jsonOK("433.json"), notFound, jsonOK("11.json"), notFound, notFound, jsonOK("195.json"))

	got, err := client.Observations(context.Background(), 11, date(2000, 1, 1), date(2026, 10, 25))

	require.NoError(t, err)
	assert.Len(t, server.requested(), 6)
	assert.Equal(t, []string{
		"2022-06-01 - 0.67",
		"2022-07-01 - -0.68",
		"2022-08-01 - -0.36",
		"2022-09-01 - -0.29",
		"2022-10-01 - 0.59",
		"2024-10-01 - 0.040168",
		"2024-10-02 - 0.040168",
		"2024-10-03 - 0.040168",
		"2024-10-04 - 0.040168",
		"2024-10-07 - 0.040168",
		"2024-10-08 - 0.040168",
		"2024-10-09 - 0.040168",
		"2024-10-10 - 0.040168",
		"2024-03-01 2024-04-01 0.5333",
		"2024-03-02 2024-04-02 0.5302",
		"2024-03-03 2024-04-03 0.5565",
		"2024-03-04 2024-04-04 0.5828",
		"2024-03-05 2024-04-05 0.5816",
		"2024-03-06 2024-04-06 0.5784",
		"2024-03-07 2024-04-07 0.5475",
		"2024-03-08 2024-04-08 0.5197",
		"2024-03-09 2024-04-09 0.5551",
		"2024-03-10 2024-04-10 0.5809",
	}, rows(t, got))
}

func TestObservationsAnswersNothingWhenToIsBeforeFrom(t *testing.T) {
	t.Parallel()

	client, server := newClient(t, jsonOK("433.json"))

	got, err := client.Observations(context.Background(), 433, date(2024, 3, 2), date(2024, 3, 1))

	require.NoError(t, err)
	assert.Empty(t, got)
	assert.Empty(t, server.requested())
}

func TestObservationsAnswersNothingForAWindowWithoutRows(t *testing.T) {
	t.Parallel()

	client, _ := newClient(t, notFound)

	got, err := client.Observations(context.Background(), 433, date(2099, 1, 1), date(2099, 12, 31))

	require.NoError(t, err)
	assert.Empty(t, got)
}

func TestObservationsFailsOnErrorResponses(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name     string
		response response
		wantErr  string
	}{
		{
			name:     "window the API refuses",
			response: response{status: http.StatusNotAcceptable, contentType: jsonType, file: "toolong.json"},
			wantErr:  "sgs: series 11 from 01/01/2010 to 31/12/2014: status 406",
		},
		{
			name: "a 404 that is not a missing window",
			response: response{
				status:      http.StatusNotFound,
				contentType: jsonType,
				body:        `{"erro":{"statusCode":404,"detail":"Not Found"}}`,
			},
			wantErr: "sgs: series 11 from 01/01/2010 to 31/12/2014: status 404",
		},
		{
			name:     "transient bad gateway with an empty body",
			response: response{status: http.StatusBadGateway, contentType: "text/plain"},
			wantErr:  "sgs: series 11 from 01/01/2010 to 31/12/2014: status 502",
		},
		{
			name:     "an HTML page for an unknown series",
			response: response{status: http.StatusOK, contentType: "text/html; charset=utf-8", file: "unknown.html"},
			wantErr:  "sgs: series 11 from 01/01/2010 to 31/12/2014: decode",
		},
		{
			name: "a row with a malformed value",
			response: response{
				status:      http.StatusOK,
				contentType: jsonType,
				body:        `[{"data":"01/01/2010","valor":"13.75"},{"data":"02/01/2010","valor":"13,75"}]`,
			},
			wantErr: `sgs: series 11 from 01/01/2010 to 31/12/2014: row 1: decimal: parse "13,75": not a decimal string`,
		},
		{
			name:     "a row with a malformed date",
			response: response{status: http.StatusOK, contentType: jsonType, body: `[{"data":"2010-01-01","valor":"13.75"}]`},
			wantErr:  "sgs: series 11 from 01/01/2010 to 31/12/2014: row 0: start",
		},
		{
			name: "a row with a malformed end date",
			response: response{
				status:      http.StatusOK,
				contentType: jsonType,
				body:        `[{"data":"01/01/2010","dataFim":"2010-02-01","valor":"13.75"}]`,
			},
			wantErr: "sgs: series 11 from 01/01/2010 to 31/12/2014: row 0: end",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			client, _ := newClient(t, tt.response)

			got, err := client.Observations(context.Background(), 11, date(2010, 1, 1), date(2014, 12, 31))

			require.Error(t, err)
			assert.Contains(t, err.Error(), tt.wantErr)
			assert.Empty(t, got)
		})
	}
}

func TestObservationsFailsOnAnUnusableBaseURL(t *testing.T) {
	t.Parallel()

	client := sgs.New(sgs.WithBaseURL("http://bad\x7fhost"))

	got, err := client.Observations(context.Background(), 11, date(2010, 1, 1), date(2014, 12, 31))

	require.ErrorContains(t, err, "sgs: series 11 from 01/01/2010 to 31/12/2014: ")
	assert.Empty(t, got)
}

func TestObservationsStopsAtTheFirstFailingWindow(t *testing.T) {
	t.Parallel()

	client, server := newClient(t,
		jsonOK("433.json"),
		response{status: http.StatusBadGateway, contentType: "text/plain"},
	)

	got, err := client.Observations(context.Background(), 11, date(2000, 1, 1), date(2026, 10, 25))

	require.ErrorContains(t, err, "sgs: series 11 from 01/01/2005 to 31/12/2009: status 502")
	assert.Empty(t, got)
	assert.Len(t, server.requested(), 2)
}

func TestObservationsStopsWhenTheContextIsCanceled(t *testing.T) {
	t.Parallel()

	client, server := newClient(t, jsonOK("433.json"))

	ctx, cancel := context.WithCancel(context.Background())
	cancel()

	_, err := client.Observations(ctx, 433, date(2022, 6, 1), date(2022, 10, 1))

	require.ErrorIs(t, err, context.Canceled)
	assert.Empty(t, server.requested())
}

func TestObservationsGivesUpAfterTheTimeout(t *testing.T) {
	t.Parallel()

	release := make(chan struct{})
	server := httptest.NewServer(http.HandlerFunc(func(http.ResponseWriter, *http.Request) { <-release }))
	t.Cleanup(server.Close)
	t.Cleanup(func() { close(release) })

	client := sgs.New(sgs.WithBaseURL(server.URL), sgs.WithTimeout(50*time.Millisecond))

	_, err := client.Observations(context.Background(), 433, date(2022, 6, 1), date(2022, 10, 1))

	var netErr net.Error

	require.ErrorAs(t, err, &netErr)
	assert.True(t, netErr.Timeout(), "error: %v", err)
}
