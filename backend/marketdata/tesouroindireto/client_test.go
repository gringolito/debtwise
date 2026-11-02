package tesouroindireto_test

import (
	"context"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"sync"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/gringolito/debtwise/backend/marketdata/tesouroindireto"
)

const apiKey = "ti_secret"

// response is one reply of the Tesouro Indireto API. testdata/bonds.json is a bond list written
// to the API's OpenAPI specification.
type response struct {
	status      int
	contentType string
	file        string
	body        string
}

// request is what the API double saw of one request.
type request struct {
	method        string
	uri           string
	authorization []string
}

// api is a test double of the Tesouro Indireto API that answers every request with one response
// and remembers the requests.
type api struct {
	t        *testing.T
	response response

	mu       sync.Mutex
	requests []request
}

func (a *api) ServeHTTP(w http.ResponseWriter, req *http.Request) {
	a.mu.Lock()
	a.requests = append(a.requests, request{
		method:        req.Method,
		uri:           req.URL.RequestURI(),
		authorization: req.Header.Values("Authorization"),
	})
	a.mu.Unlock()

	body := []byte(a.response.body)

	if a.response.file != "" {
		var err error
		if body, err = os.ReadFile(filepath.Join("testdata", a.response.file)); err != nil {
			a.t.Errorf("read response: %v", err)
			w.WriteHeader(http.StatusInternalServerError)

			return
		}
	}

	w.Header().Set("Content-Type", a.response.contentType)
	w.WriteHeader(a.response.status)

	if _, err := w.Write(body); err != nil {
		a.t.Errorf("write response: %v", err)
	}
}

func (a *api) requested() []request {
	a.mu.Lock()
	defer a.mu.Unlock()

	return append([]request(nil), a.requests...)
}

// serve starts an API double serving resp and returns its URL.
func serve(t *testing.T, resp response) (string, *api) {
	t.Helper()

	a := &api{t: t, response: resp}
	server := httptest.NewServer(a)
	t.Cleanup(server.Close)

	return server.URL, a
}

func listed(file string) response {
	return response{status: http.StatusOK, contentType: "application/json", file: file}
}

func answering(body string) response {
	return response{status: http.StatusOK, contentType: "application/json", body: body}
}

// bond is the body of a bond list holding one bond, with its fields written as JSON.
func bond(maturity, buyRate, sellRate, buyPrice, sellPrice, pricedAt string) string {
	return `[{"name":"Tesouro Prefixado 2029","maturity":` + maturity + `,"buyRate":` + buyRate +
		`,"sellRate":` + sellRate + `,"buyPrice":` + buyPrice + `,"sellPrice":` + sellPrice +
		`,"pricedAt":` + pricedAt + `}]`
}

// wantBond is a bond as the test expects it, with rates and prices as decimal strings so the
// places the API publishes are checked too. buyRate is empty when the bond has no buy rate.
type wantBond struct {
	name      string
	maturity  time.Time
	buyRate   string
	buyPrice  string
	sellRate  string
	sellPrice string
	pricedAt  time.Time
}

func assertBonds(t *testing.T, want []wantBond, got []tesouroindireto.Bond) {
	t.Helper()

	require.Len(t, got, len(want))

	for i, w := range want {
		g := got[i]
		assert.Equal(t, w.name, g.Name, "bond %d", i)
		assert.Equal(t, w.maturity, g.Maturity, "%s maturity", w.name)
		assert.Equal(t, w.buyPrice, g.BuyPrice.String(), "%s buy price", w.name)
		assert.Equal(t, w.sellRate, g.SellRate.String(), "%s sell rate", w.name)
		assert.Equal(t, w.sellPrice, g.SellPrice.String(), "%s sell price", w.name)
		assert.True(t, w.pricedAt.Equal(g.PricedAt), "%s priced at %s, want %s", w.name, g.PricedAt, w.pricedAt)

		if w.buyRate == "" {
			assert.Nil(t, g.BuyRate, "%s buy rate", w.name)
		} else if assert.NotNil(t, g.BuyRate, "%s buy rate", w.name) {
			assert.Equal(t, w.buyRate, g.BuyRate.String(), "%s buy rate", w.name)
		}
	}
}

func TestBondsReadsEveryBondOfTheListInOrder(t *testing.T) {
	t.Parallel()

	url, _ := serve(t, listed("bonds.json"))

	got, err := tesouroindireto.New(url, apiKey).Bonds(t.Context())
	require.NoError(t, err)

	pricedAt := time.Date(2026, time.November, 2, 12, 31, 12, 0, time.UTC)
	assertBonds(t, []wantBond{
		{
			name:      "Tesouro IPCA+ 2035",
			maturity:  time.Date(2035, time.May, 15, 0, 0, 0, 0, time.UTC),
			buyPrice:  "0",
			sellRate:  "0.0784",
			sellPrice: "2513.61",
			pricedAt:  pricedAt,
		},
		{
			name:      "Tesouro Prefixado 2029",
			maturity:  time.Date(2029, time.January, 1, 0, 0, 0, 0, time.UTC),
			buyRate:   "0.1340",
			buyPrice:  "762.73",
			sellRate:  "0.1352",
			sellPrice: "760.15",
			pricedAt:  pricedAt,
		},
		{
			name:      "Tesouro Selic 2031",
			maturity:  time.Date(2031, time.March, 1, 0, 0, 0, 0, time.UTC),
			buyRate:   "0.001012",
			buyPrice:  "17602.44",
			sellRate:  "0.001112",
			sellPrice: "17580.05",
			pricedAt:  pricedAt,
		},
	}, got)
}

func TestBondsSendsTheAPIKeyToTheBondListUnderTheBaseURL(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name string
		path string // appended to the server URL to make the base URL
		want string
	}{
		{name: "host only", path: "", want: "/bonds"},
		{name: "trailing slash", path: "/", want: "/bonds"},
		{name: "path prefix", path: "/tesouro", want: "/tesouro/bonds"},
		{name: "path prefix with trailing slash", path: "/tesouro/", want: "/tesouro/bonds"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			url, a := serve(t, answering("[]"))

			_, err := tesouroindireto.New(url+tt.path, apiKey).Bonds(t.Context())
			require.NoError(t, err)

			assert.Equal(t, []request{{
				method:        http.MethodGet,
				uri:           tt.want,
				authorization: []string{"Bearer " + apiKey},
			}}, a.requested())
		})
	}
}

func TestBondsReadsAnEmptyListAsNoBonds(t *testing.T) {
	t.Parallel()

	for _, body := range []string{"null", "[]"} {
		t.Run(body, func(t *testing.T) {
			t.Parallel()

			url, _ := serve(t, answering(body))

			got, err := tesouroindireto.New(url, apiKey).Bonds(t.Context())
			require.NoError(t, err)
			assert.Empty(t, got)
		})
	}
}

func TestBondsKeepsEveryDigitOfAPrice(t *testing.T) {
	t.Parallel()

	url, _ := serve(t, answering(bond(`"2029-01-01T00:00:00Z"`, `{"index":null,"rate":"13.40"}`,
		`{"index":null,"rate":"13.52"}`, `"12345678901234567.89"`, `"98765432109876543.21"`, `"2026-11-02T12:00:00Z"`)))

	got, err := tesouroindireto.New(url, apiKey).Bonds(t.Context())
	require.NoError(t, err)
	require.Len(t, got, 1)
	assert.Equal(t, "12345678901234567.89", got[0].BuyPrice.String())
	assert.Equal(t, "98765432109876543.21", got[0].SellPrice.String())
}

func TestBondsFailsOnAStatusOtherThan200(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name string
		resp response
		want []string // what the error says
	}{
		{
			name: "unauthorized problem",
			resp: response{
				status: http.StatusUnauthorized, contentType: "application/problem+json",
				body: `{"status":401,"title":"Unauthorized","detail":"the API key is not valid"}`,
			},
			want: []string{"status 401", "the API key is not valid"},
		},
		{
			name: "server error problem",
			resp: response{
				status: http.StatusInternalServerError, contentType: "application/problem+json",
				body: `{"status":500,"title":"Internal Server Error","detail":"unexpected error","request_id":"abc123"}`,
			},
			want: []string{"status 500", "unexpected error"},
		},
		{
			name: "gateway page",
			resp: response{status: http.StatusBadGateway, contentType: "text/html", body: "<html>bad gateway</html>"},
			want: []string{"status 502"},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			url, _ := serve(t, tt.resp)

			_, err := tesouroindireto.New(url, apiKey).Bonds(t.Context())
			require.Error(t, err)

			for _, w := range tt.want {
				assert.Contains(t, err.Error(), w)
			}
		})
	}
}

func TestBondsFailsOnABodyItCannotRead(t *testing.T) {
	t.Parallel()

	const (
		date  = `"2029-01-01T00:00:00Z"`
		rate  = `{"index":null,"rate":"13.40"}`
		price = `"762.73"`
	)

	tests := []struct {
		name string
		body string
		want string
	}{
		{name: "not JSON", body: "<html>bad gateway</html>", want: "decode"},
		{name: "bad maturity", body: bond(`"amanhã"`, rate, rate, price, price, date), want: "decode"},
		{name: "bad pricing time", body: bond(date, rate, rate, price, price, `"hoje"`), want: "decode"},
		{name: "bad buy rate", body: bond(date, `{"index":null,"rate":"13,40"}`, rate, price, price, date), want: "buy rate"},
		{name: "bad sell rate", body: bond(date, rate, `{"index":null,"rate":"treze"}`, price, price, date), want: "sell rate"},
		{name: "missing sell rate", body: bond(date, rate, `null`, price, price, date), want: "sell rate"},
		{name: "bad buy price", body: bond(date, rate, rate, `"762,73"`, price, date), want: "buy price"},
		{name: "bad sell price", body: bond(date, rate, rate, price, `""`, date), want: "sell price"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			url, _ := serve(t, answering(tt.body))

			_, err := tesouroindireto.New(url, apiKey).Bonds(t.Context())
			require.Error(t, err)
			assert.Contains(t, err.Error(), tt.want)
		})
	}
}

func TestBondsGivesUpAtTheTimeout(t *testing.T) {
	t.Parallel()

	server := httptest.NewServer(http.HandlerFunc(func(_ http.ResponseWriter, r *http.Request) {
		<-r.Context().Done()
	}))
	t.Cleanup(server.Close)

	client := tesouroindireto.New(server.URL, apiKey, tesouroindireto.WithTimeout(20*time.Millisecond))
	start := time.Now()

	_, err := client.Bonds(context.Background())

	require.Error(t, err)
	assert.Less(t, time.Since(start), 5*time.Second, "the request gives up at its own timeout")
}

func TestBondsStopsWithItsContext(t *testing.T) {
	t.Parallel()

	url, _ := serve(t, listed("bonds.json"))
	ctx, cancel := context.WithCancel(context.Background())
	cancel()

	_, err := tesouroindireto.New(url, apiKey).Bonds(ctx)

	require.ErrorIs(t, err, context.Canceled)
}
