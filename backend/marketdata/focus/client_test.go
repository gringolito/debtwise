package focus_test

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

	"github.com/gringolito/debtwise/backend/marketdata/focus"
)

// response is one reply of the Olinda service. The files in testdata hold the bodies recorded
// from it for the exact URLs the client requests, and status and content type are the ones it
// answered with. The bodies of failures that are too small to record are written inline.
type response struct {
	status      int
	contentType string
	file        string
	body        string
}

const jsonType = "application/json;odata.metadata=minimal"

func jsonOK(file string) response {
	return response{status: http.StatusOK, contentType: jsonType, file: file}
}

func inline(body string) response {
	return response{status: http.StatusOK, contentType: jsonType, body: body}
}

// replayer is a test double of the Olinda service. It answers the nth request with the nth
// response, the last one for every request after that, and remembers the URI of each request.
type replayer struct {
	t         *testing.T
	responses []response

	mu       sync.Mutex
	requests []string
}

// newClient returns a client that talks to a replayer serving responses.
func newClient(t *testing.T, responses ...response) (*focus.Client, *replayer) {
	t.Helper()

	r := &replayer{t: t, responses: responses}
	server := httptest.NewServer(r)
	t.Cleanup(server.Close)

	return focus.New(focus.WithBaseURL(server.URL + "/odata")), r
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

func date(year int, month time.Month, day int) time.Time {
	return time.Date(year, month, day, 0, 0, 0, 0, time.UTC)
}

func meetings(got []focus.Meeting) []string {
	out := make([]string, len(got))
	for i, m := range got {
		out[i] = fmt.Sprintf("R%d/%d %s", m.Number, m.Year, m.Median)
	}

	return out
}

// months renders the month as RFC 3339, whose "Z" and zeros show that it is midnight UTC.
func months(got []focus.Month) []string {
	out := make([]string, len(got))
	for i, m := range got {
		out[i] = fmt.Sprintf("%s %s", m.Month.Format(time.RFC3339), m.Median)
	}

	return out
}

func years(got []focus.Year) []string {
	out := make([]string, len(got))
	for i, y := range got {
		out[i] = fmt.Sprintf("%d %s", y.Year, y.Median)
	}

	return out
}

// The surveys recorded in testdata are the ones from 2017-05-31 to 2017-06-30, one per business
// day, each with every expectation the service had. The latest is the one of 2017-06-30.

func TestSelicReadsTheLatestRecordedSurvey(t *testing.T) {
	t.Parallel()

	client, _ := newClient(t, jsonOK("selic-2017-06-30.json"))

	got, err := client.Selic(context.Background(), date(2017, 6, 30))

	require.NoError(t, err)
	assert.Equal(t, []string{
		"R5/2017 9.5000",
		"R6/2017 8.7500",
		"R7/2017 8.5000",
		"R8/2017 8.5000",
		"R1/2018 8.2500",
		"R2/2018 8.2500",
		"R3/2018 8.2500",
		"R4/2018 8.2500",
		"R5/2018 8.2500",
		"R6/2018 8.2500",
		"R7/2018 8.2500",
		"R8/2018 8.2500",
	}, meetings(got))
}

func TestMonthlyIPCAReadsTheLatestRecordedSurvey(t *testing.T) {
	t.Parallel()

	client, _ := newClient(t, jsonOK("ipca-monthly-2017-06-30.json"))

	got, err := client.MonthlyIPCA(context.Background(), date(2017, 6, 30))

	require.NoError(t, err)
	assert.Equal(t, []string{
		"2017-06-01T00:00:00Z -0.1500",
		"2017-07-01T00:00:00Z 0.1800",
		"2017-08-01T00:00:00Z 0.2500",
		"2017-09-01T00:00:00Z 0.3300",
		"2017-10-01T00:00:00Z 0.4000",
		"2017-11-01T00:00:00Z 0.4400",
		"2017-12-01T00:00:00Z 0.5200",
		"2018-01-01T00:00:00Z 0.5300",
		"2018-02-01T00:00:00Z 0.4800",
		"2018-03-01T00:00:00Z 0.3700",
		"2018-04-01T00:00:00Z 0.4000",
		"2018-05-01T00:00:00Z 0.3100",
		"2018-06-01T00:00:00Z 0.2000",
		"2018-07-01T00:00:00Z 0.1900",
		"2018-08-01T00:00:00Z 0.2000",
		"2018-09-01T00:00:00Z 0.2800",
		"2018-10-01T00:00:00Z 0.3700",
		"2018-11-01T00:00:00Z 0.4000",
	}, months(got))
}

func TestAnnualIPCAReadsTheLatestRecordedSurvey(t *testing.T) {
	t.Parallel()

	client, _ := newClient(t, jsonOK("ipca-annual-2017-06-30.json"))

	got, err := client.AnnualIPCA(context.Background(), date(2017, 6, 30))

	require.NoError(t, err)
	assert.Equal(t, []string{
		"2017 3.4600",
		"2018 4.2500",
		"2019 4.2500",
		"2020 4.0000",
		"2021 4.0000",
	}, years(got))
}

func TestMethodsRequestTheirEndpointWithTheSurveyQuery(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name      string
		file      string
		call      func(*focus.Client, context.Context, time.Time) error
		path      string
		indicator string
		column    string
	}{
		{
			name: "Selic", file: "selic-2017-06-30.json",
			call: func(c *focus.Client, ctx context.Context, day time.Time) error {
				_, err := c.Selic(ctx, day)

				return err
			},
			path: "/odata/ExpectativasMercadoSelic", indicator: "Selic", column: "Reuniao",
		},
		{
			name: "MonthlyIPCA", file: "ipca-monthly-2017-06-30.json",
			call: func(c *focus.Client, ctx context.Context, day time.Time) error {
				_, err := c.MonthlyIPCA(ctx, day)

				return err
			},
			path: "/odata/ExpectativaMercadoMensais", indicator: "IPCA", column: "DataReferencia",
		},
		{
			name: "AnnualIPCA", file: "ipca-annual-2017-06-30.json",
			call: func(c *focus.Client, ctx context.Context, day time.Time) error {
				_, err := c.AnnualIPCA(ctx, day)

				return err
			},
			path: "/odata/ExpectativasMercadoAnuais", indicator: "IPCA", column: "DataReferencia",
		},
	}

	days := map[string]time.Time{
		"midnight UTC": date(2017, 6, 30),
		"the calendar date of a time in another zone": time.Date(2017, 6, 30, 22, 30, 0, 0,
			time.FixedZone("BRT", -3*60*60)),
	}

	for _, tt := range tests {
		for dayName, day := range days {
			t.Run(tt.name+" on "+dayName, func(t *testing.T) {
				t.Parallel()

				client, server := newClient(t, jsonOK(tt.file))

				require.NoError(t, tt.call(client, context.Background(), day))

				requested := server.requested()
				require.Len(t, requested, 1)

				uri, err := url.ParseRequestURI(requested[0])
				require.NoError(t, err)

				assert.Equal(t, tt.path, uri.Path)
				assert.Equal(t, url.Values{
					"$filter": {"Indicador eq '" + tt.indicator + "' and baseCalculo eq 0 " +
						"and Data ge '2017-05-31' and Data le '2017-06-30'"},
					"$orderby": {"Data desc"},
					"$select":  {"Data," + tt.column + ",Mediana"},
					"$format":  {"json"},
				}, uri.Query())
				assert.NotContains(t, uri.RawQuery, "+", "the service does not decode + as a space")
			})
		}
	}
}

func TestSelicKeepsOnlyTheLatestSurveyWhateverTheOrder(t *testing.T) {
	t.Parallel()

	client, _ := newClient(t, inline(`{"value":[
		{"Data":"2017-06-28","Reuniao":"R1/2018","Mediana":7.0000},
		{"Data":"2017-06-29","Reuniao":"R10/2018","Mediana":8.2500},
		{"Data":"2017-06-29","Reuniao":"R9/2018","Mediana":8.5},
		{"Data":"2017-06-29","Reuniao":"R1/2019","Mediana":9},
		{"Data":"2017-06-29","Reuniao":"R8/2017","Mediana":8.75},
		{"Data":"2017-06-27","Reuniao":"R1/2018","Mediana":6.0000}
	]}`))

	got, err := client.Selic(context.Background(), date(2017, 6, 30))

	require.NoError(t, err)
	assert.Equal(t, []string{
		"R8/2017 8.75",
		"R9/2018 8.5",
		"R10/2018 8.2500",
		"R1/2019 9",
	}, meetings(got), "ordered by year then number, medians as sent")
}

func TestMonthlyAndAnnualIPCAAreSortedByReference(t *testing.T) {
	t.Parallel()

	client, _ := newClient(t, inline(`{"value":[
		{"Data":"2017-06-30","DataReferencia":"01/2018","Mediana":0.53},
		{"Data":"2017-06-30","DataReferencia":"12/2017","Mediana":0.52},
		{"Data":"2017-06-30","DataReferencia":"02/2018","Mediana":0.48}
	]}`))

	gotMonths, err := client.MonthlyIPCA(context.Background(), date(2017, 6, 30))

	require.NoError(t, err)
	assert.Equal(t, []string{
		"2017-12-01T00:00:00Z 0.52",
		"2018-01-01T00:00:00Z 0.53",
		"2018-02-01T00:00:00Z 0.48",
	}, months(gotMonths))

	client, _ = newClient(t, inline(`{"value":[
		{"Data":"2017-06-30","DataReferencia":"2019","Mediana":4.25},
		{"Data":"2017-06-30","DataReferencia":"2017","Mediana":3.46},
		{"Data":"2017-06-30","DataReferencia":"2018","Mediana":4.25}
	]}`))

	gotYears, err := client.AnnualIPCA(context.Background(), date(2017, 6, 30))

	require.NoError(t, err)
	assert.Equal(t, []string{"2017 3.46", "2018 4.25", "2019 4.25"}, years(gotYears))
}

func TestMethodsFailOnUnusableAnswers(t *testing.T) {
	t.Parallel()

	calls := map[string]func(*focus.Client) error{
		"ExpectativasMercadoSelic": func(c *focus.Client) error {
			_, err := c.Selic(context.Background(), date(2017, 6, 30))

			return err
		},
		"ExpectativaMercadoMensais": func(c *focus.Client) error {
			_, err := c.MonthlyIPCA(context.Background(), date(2017, 6, 30))

			return err
		},
		"ExpectativasMercadoAnuais": func(c *focus.Client) error {
			_, err := c.AnnualIPCA(context.Background(), date(2017, 6, 30))

			return err
		},
	}

	tests := []struct {
		name     string
		response response
		wantErr  string
	}{
		{
			name:     "a status that is not 200",
			response: response{status: http.StatusServiceUnavailable, contentType: "text/plain"},
			wantErr:  "status 503",
		},
		{
			name: "an HTML body",
			response: response{
				status: http.StatusOK, contentType: "text/html",
				body: "<html><body>Bad gateway</body></html>",
			},
			wantErr: "decode response: ",
		},
		{
			name:     "a truncated body",
			response: inline(`{"value":[{"Data":"2017-06-30","Reuniao":"R8/2018","Mediana":8.25`),
			wantErr:  "decode response: ",
		},
		{
			name:     "a body without value",
			response: inline(`{"codigo":200}`),
			wantErr:  `decode response: no "value"`,
		},
		{
			name:     "a body with a value that is not a list",
			response: inline(`{"value":{"Data":"2017-06-30"}}`),
			wantErr:  "decode response: ",
		},
		{
			name:     "no rows",
			response: jsonOK("no-rows.json"),
			wantErr:  "no survey",
		},
		{
			name:     "a date that is not YYYY-MM-DD",
			response: inline(`{"value":[{"Data":"30/06/2017","Reuniao":"R8/2018","Mediana":8.25}]}`),
			wantErr:  "row 0: date: ",
		},
		{
			name: "a median in exponent notation",
			response: inline(`{"value":[{"Data":"2017-06-30","Reuniao":"R8/2018",` +
				`"DataReferencia":"2018","Mediana":8.25e0}]}`),
			wantErr: "row 0: median: decimal: parse",
		},
		{
			name: "a median that is null",
			response: inline(`{"value":[{"Data":"2017-06-30","Reuniao":"R8/2018",` +
				`"DataReferencia":"2018","Mediana":null}]}`),
			wantErr: "row 0: median: decimal: parse",
		},
		{
			name: "a missing median",
			response: inline(`{"value":[{"Data":"2017-06-30","Reuniao":"R8/2018",` +
				`"DataReferencia":"2018"}]}`),
			wantErr: "row 0: median: decimal: parse",
		},
	}

	for _, tt := range tests {
		for endpoint, call := range calls {
			t.Run(tt.name+" from "+endpoint, func(t *testing.T) {
				t.Parallel()

				client, _ := newClient(t, tt.response)

				err := call(client)

				require.ErrorContains(t, err, "focus: "+endpoint+" up to 2017-06-30: ")
				require.ErrorContains(t, err, tt.wantErr)
			})
		}
	}
}

func TestSelicFailsOnAMeetingThatDoesNotParse(t *testing.T) {
	t.Parallel()

	bad := map[string]response{
		"S7/2018":  jsonOK("bad-meeting.json"),
		"R7-2018":  inline(`{"value":[{"Data":"2017-06-30","Reuniao":"R7-2018","Mediana":8.25}]}`),
		"R/2018":   inline(`{"value":[{"Data":"2017-06-30","Reuniao":"R/2018","Mediana":8.25}]}`),
		"R-1/2018": inline(`{"value":[{"Data":"2017-06-30","Reuniao":"R-1/2018","Mediana":8.25}]}`),
		"R7/18":    inline(`{"value":[{"Data":"2017-06-30","Reuniao":"R7/18","Mediana":8.25}]}`),
		"":         inline(`{"value":[{"Data":"2017-06-30","Mediana":8.25}]}`),
	}

	for reference, resp := range bad {
		t.Run("meeting "+reference, func(t *testing.T) {
			t.Parallel()

			client, _ := newClient(t, resp)

			got, err := client.Selic(context.Background(), date(2017, 6, 30))

			require.ErrorContains(t, err, "focus: ExpectativasMercadoSelic up to 2017-06-30: row ")
			require.ErrorContains(t, err, fmt.Sprintf("meeting %q", reference))
			assert.Empty(t, got)
		})
	}
}

func TestMonthlyIPCAFailsOnAMonthThatDoesNotParse(t *testing.T) {
	t.Parallel()

	for _, reference := range []string{"13/2018", "2018-01", "1/2018", "01/18", "2018", ""} {
		t.Run("month "+reference, func(t *testing.T) {
			t.Parallel()

			client, _ := newClient(t, inline(`{"value":[{"Data":"2017-06-30","DataReferencia":"`+
				reference+`","Mediana":0.4}]}`))

			got, err := client.MonthlyIPCA(context.Background(), date(2017, 6, 30))

			require.ErrorContains(t, err,
				fmt.Sprintf("focus: ExpectativaMercadoMensais up to 2017-06-30: row 0: month %q", reference))
			assert.Empty(t, got)
		})
	}
}

func TestAnnualIPCAFailsOnAYearThatDoesNotParse(t *testing.T) {
	t.Parallel()

	for _, reference := range []string{"next year", "18", "12/2018", ""} {
		t.Run("year "+reference, func(t *testing.T) {
			t.Parallel()

			client, _ := newClient(t, inline(`{"value":[{"Data":"2017-06-30","DataReferencia":"`+
				reference+`","Mediana":4.25}]}`))

			got, err := client.AnnualIPCA(context.Background(), date(2017, 6, 30))

			require.ErrorContains(t, err,
				fmt.Sprintf("focus: ExpectativasMercadoAnuais up to 2017-06-30: row 0: year %q", reference))
			assert.Empty(t, got)
		})
	}
}

func TestMethodsFailOnAnUnusableBaseURL(t *testing.T) {
	t.Parallel()

	client := focus.New(focus.WithBaseURL("http://bad\x7fhost"))

	got, err := client.Selic(context.Background(), date(2017, 6, 30))

	require.ErrorContains(t, err, "focus: ExpectativasMercadoSelic up to 2017-06-30: ")
	assert.Empty(t, got)
}

func TestMethodsStopWhenTheContextIsCanceled(t *testing.T) {
	t.Parallel()

	client, server := newClient(t, jsonOK("selic-2017-06-30.json"))

	ctx, cancel := context.WithCancel(context.Background())
	cancel()

	got, err := client.Selic(ctx, date(2017, 6, 30))

	require.ErrorIs(t, err, context.Canceled)
	assert.Empty(t, got)
	assert.Empty(t, server.requested())
}

func TestMethodsStopWhenTheContextIsCanceledDuringTheRequest(t *testing.T) {
	t.Parallel()

	arrived := make(chan struct{})
	release := make(chan struct{})
	server := httptest.NewServer(http.HandlerFunc(func(http.ResponseWriter, *http.Request) {
		close(arrived)
		<-release
	}))
	t.Cleanup(server.Close)
	t.Cleanup(func() { close(release) })

	client := focus.New(focus.WithBaseURL(server.URL))

	ctx, cancel := context.WithCancel(context.Background())

	go func() {
		<-arrived
		cancel()
	}()

	got, err := client.AnnualIPCA(ctx, date(2017, 6, 30))

	require.ErrorIs(t, err, context.Canceled)
	assert.Empty(t, got)
}

func TestMethodsGiveUpAfterTheTimeout(t *testing.T) {
	t.Parallel()

	release := make(chan struct{})
	server := httptest.NewServer(http.HandlerFunc(func(http.ResponseWriter, *http.Request) { <-release }))
	t.Cleanup(server.Close)
	t.Cleanup(func() { close(release) })

	client := focus.New(focus.WithBaseURL(server.URL), focus.WithTimeout(50*time.Millisecond))

	_, err := client.MonthlyIPCA(context.Background(), date(2017, 6, 30))

	var netErr net.Error

	require.ErrorAs(t, err, &netErr)
	assert.True(t, netErr.Timeout(), "error: %v", err)
}

func TestNewDefaultsToThePublicService(t *testing.T) {
	t.Parallel()

	// A client without options must not talk to the test server: it is the base URL that
	// WithBaseURL replaces. Pointing the default at a canceled context proves nothing is sent.
	ctx, cancel := context.WithCancel(context.Background())
	cancel()

	_, err := focus.New().Selic(ctx, date(2017, 6, 30))

	require.ErrorIs(t, err, context.Canceled)
	require.ErrorContains(t, err, "https://olinda.bcb.gov.br/olinda/servico/Expectativas/versao/v1/odata"+
		"/ExpectativasMercadoSelic?")
	assert.True(t, strings.HasPrefix(err.Error(), "focus: "), "error: %v", err)
}

func TestSelicLooksBackThirtyDaysAcrossAYearEnd(t *testing.T) {
	t.Parallel()

	client, server := newClient(t, jsonOK("selic-2017-06-30.json"))

	_, err := client.Selic(context.Background(), date(2018, 1, 15))

	require.NoError(t, err)

	requested := server.requested()
	require.Len(t, requested, 1)

	uri, err := url.ParseRequestURI(requested[0])
	require.NoError(t, err)
	assert.Equal(t,
		"Indicador eq 'Selic' and baseCalculo eq 0 and Data ge '2017-12-16' and Data le '2018-01-15'",
		uri.Query().Get("$filter"))
}
