package sidra_test

import (
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/gringolito/debtwise/backend/marketdata/sidra"
)

// response is one reply of the SIDRA API. The files in testdata hold the bodies recorded from the
// API: ipca_2024_01_06.json is /values/t/1737/n1/all/v/2266/p/202401-202406, no_data.json the
// answer for 203001-203002 (a header row only), missing_value.json the answer of table 1737
// variable 63 for 197901-197912 (a "..." value), bad_table.txt the 400 for table 999999 and
// bad_period.txt the 400 for period "abc".
type response struct {
	status int
	file   string
	body   string
}

func ok(file string) response { return response{status: http.StatusOK, file: file} }

// replayer is a test double of the SIDRA API that answers every request with one response and
// remembers the request URIs.
type replayer struct {
	t        *testing.T
	response response

	mu   sync.Mutex
	uris []string
}

func newClient(t *testing.T, resp response) (*sidra.Client, *replayer) {
	t.Helper()

	r := &replayer{t: t, response: resp}
	server := httptest.NewServer(r)
	t.Cleanup(server.Close)

	return sidra.New(sidra.WithBaseURL(server.URL)), r
}

func (r *replayer) ServeHTTP(w http.ResponseWriter, req *http.Request) {
	r.mu.Lock()
	r.uris = append(r.uris, req.URL.RequestURI())
	r.mu.Unlock()

	body := []byte(r.response.body)

	if r.response.file != "" {
		var err error
		if body, err = os.ReadFile(filepath.Join("testdata", r.response.file)); err != nil {
			r.t.Errorf("read recorded response: %v", err)
			w.WriteHeader(http.StatusInternalServerError)

			return
		}
	}

	w.WriteHeader(r.response.status)

	if _, err := w.Write(body); err != nil {
		r.t.Errorf("write response: %v", err)
	}
}

func (r *replayer) requested() []string {
	r.mu.Lock()
	defer r.mu.Unlock()

	return append([]string(nil), r.uris...)
}

func month(year int, m time.Month) time.Time {
	return time.Date(year, m, 1, 0, 0, 0, 0, time.UTC)
}

func TestMonthlyValuesReturnsEveryMonthWithItsPublishedValue(t *testing.T) {
	t.Parallel()

	client, replay := newClient(t, ok("ipca_2024_01_06.json"))

	got, err := client.MonthlyValues(context.Background(), 1737, 2266,
		time.Date(2024, time.January, 17, 13, 0, 0, 0, time.FixedZone("x", -3*3600)),
		time.Date(2024, time.June, 30, 0, 0, 0, 0, time.UTC))

	require.NoError(t, err)

	months := make([]time.Time, len(got))
	values := make([]string, len(got))

	for i, v := range got {
		months[i] = v.Month
		values[i] = v.Value.String()
	}

	assert.Equal(t, []time.Time{
		month(2024, time.January), month(2024, time.February), month(2024, time.March),
		month(2024, time.April), month(2024, time.May), month(2024, time.June),
	}, months)
	assert.Equal(t, []string{
		"6801.7200000000000", "6858.1700000000000", "6869.1400000000000",
		"6895.2400000000000", "6926.9600000000000", "6941.5100000000000",
	}, values)
	assert.Equal(t, []string{"/values/t/1737/n1/all/v/2266/p/202401-202406"}, replay.requested())
}

func TestMonthlyValuesReturnsOldestFirst(t *testing.T) {
	t.Parallel()

	client, _ := newClient(t, response{status: http.StatusOK, body: `[{"V":"Valor","D3C":"Mês (Código)"},
		{"V":"2.5","D3C":"202402"},{"V":"1.5","D3C":"202401"}]`})

	got, err := client.MonthlyValues(context.Background(), 1, 2, month(2024, time.January), month(2024, time.February))

	require.NoError(t, err)
	require.Len(t, got, 2)
	assert.Equal(t, month(2024, time.January), got[0].Month)
	assert.Equal(t, "1.5", got[0].Value.String())
	assert.Equal(t, month(2024, time.February), got[1].Month)
}

func TestMonthlyValuesOfUnpublishedMonthsIsEmpty(t *testing.T) {
	t.Parallel()

	client, _ := newClient(t, ok("no_data.json"))

	got, err := client.MonthlyValues(context.Background(), 1737, 2266, month(2030, time.January), month(2030, time.February))

	require.NoError(t, err)
	assert.Empty(t, got)
}

func TestMonthlyValuesOfAReversedRangeRequestsNothing(t *testing.T) {
	t.Parallel()

	client, replay := newClient(t, ok("ipca_2024_01_06.json"))

	got, err := client.MonthlyValues(context.Background(), 1737, 2266, month(2024, time.June), month(2024, time.January))

	require.NoError(t, err)
	assert.Empty(t, got)
	assert.Empty(t, replay.requested())
}

func TestMonthlyValuesFailsWithTheReasonOfARefusal(t *testing.T) {
	t.Parallel()

	tests := map[string]struct {
		resp   response
		reason string
	}{
		"bad table":  {response{status: http.StatusBadRequest, file: "bad_table.txt"}, "Tabela inválida"},
		"bad period": {response{status: http.StatusBadRequest, file: "bad_period.txt"}, "mal especificado"},
		"server":     {response{status: http.StatusInternalServerError}, "status 500"},
	}

	for name, tt := range tests {
		t.Run(name, func(t *testing.T) {
			t.Parallel()

			client, _ := newClient(t, tt.resp)

			got, err := client.MonthlyValues(context.Background(), 999999, 2266, month(2024, time.January), month(2024, time.February))

			require.Error(t, err)
			assert.Empty(t, got)
			require.ErrorContains(t, err, "sidra: table 999999 variable 2266 from 202401 to 202402: status")
			require.ErrorContains(t, err, tt.reason)
		})
	}
}

func TestMonthlyValuesFailsOnABodyItCannotDecode(t *testing.T) {
	t.Parallel()

	bodies := map[string]string{
		"not json":      "<html>gateway timeout</html>",
		"not an array":  `{"V":"1"}`,
		"empty array":   `[]`,
		"bad period":    `[{"V":"Valor"},{"V":"1.5","D3C":"janeiro 2024"}]`,
		"missing field": `[{"V":"Valor"},{"V":"1.5"}]`,
	}

	for name, body := range bodies {
		t.Run(name, func(t *testing.T) {
			t.Parallel()

			client, _ := newClient(t, response{status: http.StatusOK, body: body})

			_, err := client.MonthlyValues(context.Background(), 1737, 2266, month(2024, time.January), month(2024, time.February))

			require.Error(t, err)
			assert.ErrorContains(t, err, "sidra: table 1737 variable 2266 from 202401 to 202402: ")
		})
	}
}

func TestMonthlyValuesFailsOnAValueThatIsNotANumber(t *testing.T) {
	t.Parallel()

	recorded := ok("missing_value.json")
	inline := func(v string) response {
		return response{status: http.StatusOK, body: `[{"V":"Valor"},{"V":"` + v + `","D3C":"202401"}]`}
	}

	tests := map[string]response{
		"recorded not available marker": recorded,
		"zero marker":                   inline("-"),
		"withheld marker":               inline("X"),
		"empty":                         inline(""),
		"comma decimal":                 inline("1,5"),
	}

	for name, resp := range tests {
		t.Run(name, func(t *testing.T) {
			t.Parallel()

			client, _ := newClient(t, resp)

			got, err := client.MonthlyValues(context.Background(), 1737, 63, month(1979, time.December), month(1979, time.December))

			require.Error(t, err)
			assert.Empty(t, got)
			require.ErrorContains(t, err, "sidra: table 1737 variable 63 from ")
			require.ErrorContains(t, err, "not a decimal string")
		})
	}
}

func TestRequestsGiveUpAtTheTimeout(t *testing.T) {
	t.Parallel()

	server := httptest.NewServer(http.HandlerFunc(func(_ http.ResponseWriter, r *http.Request) {
		<-r.Context().Done()
	}))
	t.Cleanup(server.Close)

	client := sidra.New(sidra.WithBaseURL(server.URL), sidra.WithTimeout(20*time.Millisecond))
	start := time.Now()

	_, err := client.MonthlyValues(context.Background(), 1737, 2266, month(2024, time.January), month(2024, time.June))

	require.Error(t, err)
	assert.Less(t, time.Since(start), 5*time.Second, "the request gives up at its own timeout")
}

func TestRequestsStopWithTheirContext(t *testing.T) {
	t.Parallel()

	client, _ := newClient(t, ok("ipca_2024_01_06.json"))
	ctx, cancel := context.WithCancel(context.Background())
	cancel()

	_, err := client.MonthlyValues(ctx, 1737, 2266, month(2024, time.January), month(2024, time.June))

	require.ErrorIs(t, err, context.Canceled)
}

// The fake server answers every request with one row per period of the path, so the windows a
// range is split into show in the result.
func TestMonthlyValuesSplitsALongRangeIntoWindows(t *testing.T) {
	t.Parallel()

	var (
		mu   sync.Mutex
		uris []string
	)

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		mu.Lock()

		uris = append(uris, r.URL.RequestURI())

		mu.Unlock()

		var from, to string
		if _, err := fmt.Sscanf(r.URL.Path, "/values/t/1737/n1/all/v/2266/p/%6s", &from); err != nil {
			t.Errorf("unexpected path %q: %v", r.URL.Path, err)
		}

		to = r.URL.Path[len(r.URL.Path)-6:]
		start, _ := time.Parse("200601", from)
		end, _ := time.Parse("200601", to)
		body := `[{"V":"Valor","D3C":"Mês (Código)"}`

		for m := start; !m.After(end); m = m.AddDate(0, 1, 0) {
			body += fmt.Sprintf(`,{"V":"%d.5","D3C":"%s"}`, m.Year(), m.Format("200601"))
		}

		_, _ = w.Write([]byte(body + "]"))
	}))
	t.Cleanup(server.Close)

	client := sidra.New(sidra.WithBaseURL(server.URL))

	got, err := client.MonthlyValues(context.Background(), 1737, 2266, month(1970, time.January), month(2026, time.September))

	require.NoError(t, err)
	assert.Equal(t, []string{
		"/values/t/1737/n1/all/v/2266/p/197001-201912",
		"/values/t/1737/n1/all/v/2266/p/202001-202609",
	}, uris)
	require.Len(t, got, 56*12+9)
	assert.Equal(t, month(1970, time.January), got[0].Month)
	assert.Equal(t, "1970.5", got[0].Value.String())
	assert.Equal(t, month(2019, time.December), got[599].Month)
	assert.Equal(t, month(2020, time.January), got[600].Month)
	assert.Equal(t, month(2026, time.September), got[len(got)-1].Month)
}

func TestMonthlyValuesFailsWhenALaterWindowFails(t *testing.T) {
	t.Parallel()

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.HasSuffix(r.URL.Path, "-202609") {
			w.WriteHeader(http.StatusBadGateway)

			return
		}

		_, _ = w.Write([]byte(`[{"V":"Valor"},{"V":"1.5","D3C":"197001"}]`))
	}))
	t.Cleanup(server.Close)

	client := sidra.New(sidra.WithBaseURL(server.URL))

	got, err := client.MonthlyValues(context.Background(), 1737, 2266, month(1970, time.January), month(2026, time.September))

	require.Error(t, err)
	assert.Empty(t, got)
	assert.ErrorContains(t, err, "sidra: table 1737 variable 2266 from 202001 to 202609: status 502")
}
