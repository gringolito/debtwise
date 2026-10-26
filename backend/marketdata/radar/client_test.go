package radar_test

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

	"github.com/gringolito/debtwise/backend/decimal"
	"github.com/gringolito/debtwise/backend/marketdata/radar"
)

const jsonType = "application/json"

// response is one reply of the Radar API. The files in testdata hold the bodies recorded from the
// API, or built from Tesouro Direto's own JSON, which Radar relays field for field.
type response struct {
	status int
	file   string
	body   string
}

func ok(file string) response { return response{status: http.StatusOK, file: file} }

// request is what the replayer saw of one request.
type request struct {
	uri           string
	authorization []string
}

// replayer is a test double of the Radar API that answers every request with one response and
// remembers the requests.
type replayer struct {
	t        *testing.T
	response response

	mu       sync.Mutex
	requests []request
}

// newClient returns a client with token that talks to a replayer serving resp.
func newClient(t *testing.T, token string, resp response) (*radar.Client, *replayer) {
	t.Helper()

	r := &replayer{t: t, response: resp}
	server := httptest.NewServer(r)
	t.Cleanup(server.Close)

	return radar.New(token, radar.WithBaseURL(server.URL)), r
}

func (r *replayer) ServeHTTP(w http.ResponseWriter, req *http.Request) {
	r.mu.Lock()
	r.requests = append(r.requests, request{
		uri:           req.URL.RequestURI(),
		authorization: req.Header.Values("Authorization"),
	})
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

	w.Header().Set("Content-Type", jsonType)
	w.WriteHeader(r.response.status)

	if _, err := w.Write(body); err != nil {
		r.t.Errorf("write response: %v", err)
	}
}

// requested returns every request the replayer has seen, in order.
func (r *replayer) requested() []request {
	r.mu.Lock()
	defer r.mu.Unlock()

	return append([]request(nil), r.requests...)
}

func TestNamesReturnsEveryBondOfTheListInOrder(t *testing.T) {
	t.Parallel()

	client, server := newClient(t, "token", ok("bonds.json"))

	names, err := client.Names(context.Background())

	require.NoError(t, err)
	assert.Equal(t, []string{
		"Tesouro Educa+ 2026",
		"Tesouro Educa+ 2027",
		"Tesouro Educa+ 2028",
		"Tesouro Educa+ 2029",
		"Tesouro Educa+ 2030",
		"Tesouro Educa+ 2031",
		"Tesouro Educa+ 2032",
		"Tesouro Educa+ 2033",
		"Tesouro Educa+ 2034",
		"Tesouro Educa+ 2035",
		"Tesouro Educa+ 2036",
		"Tesouro Educa+ 2037",
		"Tesouro Educa+ 2038",
		"Tesouro Educa+ 2039",
		"Tesouro Educa+ 2040",
		"Tesouro Educa+ 2041",
		"Tesouro Educa+ 2042",
		"Tesouro Educa+ 2043",
		"Tesouro Educa+ 2044",
		"Tesouro IGPM+ com Juros Semestrais 2031",
		"Tesouro IPCA+ 2029",
		"Tesouro IPCA+ 2032",
		"Tesouro IPCA+ 2035",
		"Tesouro IPCA+ 2040",
		"Tesouro IPCA+ 2045",
		"Tesouro IPCA+ 2050",
		"Tesouro IPCA+ com Juros Semestrais 2030",
		"Tesouro IPCA+ com Juros Semestrais 2032",
		"Tesouro IPCA+ com Juros Semestrais 2035",
		"Tesouro IPCA+ com Juros Semestrais 2037",
		"Tesouro IPCA+ com Juros Semestrais 2040",
		"Tesouro IPCA+ com Juros Semestrais 2045",
		"Tesouro IPCA+ com Juros Semestrais 2050",
		"Tesouro IPCA+ com Juros Semestrais 2055",
		"Tesouro IPCA+ com Juros Semestrais 2060",
		"Tesouro Prefixado 2027",
		"Tesouro Prefixado 2028",
		"Tesouro Prefixado 2029",
		"Tesouro Prefixado 2031",
		"Tesouro Prefixado 2032",
		"Tesouro Prefixado com Juros Semestrais 2027",
		"Tesouro Prefixado com Juros Semestrais 2029",
		"Tesouro Prefixado com Juros Semestrais 2031",
		"Tesouro Prefixado com Juros Semestrais 2033",
		"Tesouro Prefixado com Juros Semestrais 2035",
		"Tesouro Prefixado com Juros Semestrais 2037",
		"Tesouro Renda+ Aposentadoria Extra 2030",
		"Tesouro Renda+ Aposentadoria Extra 2035",
		"Tesouro Renda+ Aposentadoria Extra 2040",
		"Tesouro Renda+ Aposentadoria Extra 2045",
		"Tesouro Renda+ Aposentadoria Extra 2050",
		"Tesouro Renda+ Aposentadoria Extra 2055",
		"Tesouro Renda+ Aposentadoria Extra 2060",
		"Tesouro Renda+ Aposentadoria Extra 2065",
		"Tesouro Reserva 2036",
		"Tesouro Selic 2028",
		"Tesouro Selic 2029",
		"Tesouro Selic 2031",
	}, names)
	assert.Equal(t, []request{{uri: "/bonds.json"}}, server.requested(), "the list needs no token, so none is sent")
}

func dec(t *testing.T, s string) decimal.Decimal {
	t.Helper()

	d, err := decimal.Parse(s)
	require.NoError(t, err)

	return d
}

func rate(t *testing.T, s string) *decimal.Decimal {
	t.Helper()

	d := dec(t, s)

	return &d
}

// assertBond compares rates and prices as decimal strings, so the places the API quotes are kept.
func assertBond(t *testing.T, want, got radar.Bond) {
	t.Helper()

	assert.Equal(t, want.Name, got.Name)
	assert.Equal(t, want.Maturity, got.Maturity)
	assertRate(t, "investment rate", want.InvestmentRate, got.InvestmentRate)
	assertRate(t, "redemption rate", want.RedemptionRate, got.RedemptionRate)
	assert.Equal(t, want.InvestmentPrice.String(), got.InvestmentPrice.String(), "investment price")
	assert.Equal(t, want.RedemptionPrice.String(), got.RedemptionPrice.String(), "redemption price")
}

func assertRate(t *testing.T, what string, want, got *decimal.Decimal) {
	t.Helper()

	if want == nil {
		assert.Nil(t, got, what)

		return
	}

	if assert.NotNil(t, got, what) {
		assert.Equal(t, want.String(), got.String(), what)
	}
}

func TestBondReadsTheTreasuryBondOfTheFixture(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name string
		file string
		want func(t *testing.T) radar.Bond
	}{
		{
			name: "Tesouro Prefixado 2029",
			file: "prefixado-2029.json",
			want: func(t *testing.T) radar.Bond {
				return radar.Bond{
					Name:            "Tesouro Prefixado 2029",
					Maturity:        time.Date(2029, time.January, 1, 0, 0, 0, 0, time.UTC),
					InvestmentRate:  rate(t, "0.1276"),
					InvestmentPrice: dec(t, "771.26"),
					RedemptionRate:  rate(t, "0.1288"),
					RedemptionPrice: dec(t, "769.49"),
				}
			},
		},
		{
			name: "Tesouro Prefixado 2027",
			file: "prefixado-2027.json",
			want: func(t *testing.T) radar.Bond {
				return radar.Bond{
					Name:            "Tesouro Prefixado 2027",
					Maturity:        time.Date(2027, time.January, 1, 0, 0, 0, 0, time.UTC),
					RedemptionRate:  rate(t, "0.1347"),
					RedemptionPrice: dec(t, "977.19"),
				}
			},
		},
		{
			name: "Tesouro Prefixado com Juros Semestrais 2037",
			file: "prefixado-juros-semestrais-2037.json",
			want: func(t *testing.T) radar.Bond {
				return radar.Bond{
					Name:            "Tesouro Prefixado com Juros Semestrais 2037",
					Maturity:        time.Date(2037, time.January, 1, 0, 0, 0, 0, time.UTC),
					InvestmentRate:  rate(t, "0.1288"),
					InvestmentPrice: dec(t, "880.05"),
					RedemptionRate:  rate(t, "0.1300"),
					RedemptionPrice: dec(t, "874.38"),
				}
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			client, _ := newClient(t, "token", ok(tt.file))

			got, err := client.Bond(context.Background(), tt.name)

			require.NoError(t, err)
			assertBond(t, tt.want(t), got)
		})
	}
}

func TestBondSendsTheTokenAndTheEscapedName(t *testing.T) {
	t.Parallel()

	client, server := newClient(t, "secret", ok("prefixado-juros-semestrais-2037.json"))

	_, err := client.Bond(context.Background(), "Tesouro Prefixado com Juros Semestrais 2037")

	require.NoError(t, err)
	assert.Equal(t, []request{{
		uri:           "/bonds/Tesouro%20Prefixado%20com%20Juros%20Semestrais%202037",
		authorization: []string{"Bearer secret"},
	}}, server.requested())
}

func TestBondEscapesThePathSeparatorOfAName(t *testing.T) {
	t.Parallel()

	client, server := newClient(t, "secret", ok("prefixado-2029.json"))

	_, err := client.Bond(context.Background(), "Tesouro/Prefixado?2029")

	require.NoError(t, err)
	assert.Equal(t, "/bonds/Tesouro%2FPrefixado%3F2029", server.requested()[0].uri)
}

func TestBondWithoutATokenSendsNoAuthorization(t *testing.T) {
	t.Parallel()

	client, server := newClient(t, "", ok("prefixado-2029.json"))

	_, err := client.Bond(context.Background(), "Tesouro Prefixado 2029")

	require.NoError(t, err)
	assert.Equal(t, []request{{uri: "/bonds/Tesouro%20Prefixado%202029"}}, server.requested())
}

// The API answers a token it refuses with status 200 and a body without a bond.
func TestBondFailsWithTheIndicationOfARefusedToken(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name       string
		file       string
		indication string
	}{
		{"missing token", "missing-token.json", "Token ausente. Gere um em https://radaropcoes.com"},
		{"invalid token", "invalid-token.json", "Token inválido. Gere um novo em https://radaropcoes.com"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			client, _ := newClient(t, "token", ok(tt.file))

			_, err := client.Bond(context.Background(), "Tesouro Prefixado 2029")

			require.Error(t, err)
			assert.Contains(t, err.Error(), tt.indication)
			assert.Contains(t, err.Error(), `radar: bond "Tesouro Prefixado 2029"`)
		})
	}
}

func TestRequestsFailOnAStatusOtherThan200(t *testing.T) {
	t.Parallel()

	for _, status := range []int{http.StatusUnauthorized, http.StatusNotFound, http.StatusInternalServerError} {
		t.Run(http.StatusText(status), func(t *testing.T) {
			t.Parallel()

			client, _ := newClient(t, "token", response{status: status, file: "prefixado-2029.json"})

			_, err := client.Names(context.Background())
			require.Error(t, err)
			assert.Contains(t, err.Error(), "status")

			_, err = client.Bond(context.Background(), "Tesouro Prefixado 2029")
			require.Error(t, err)
			assert.Contains(t, err.Error(), "status")
		})
	}
}

func TestRequestsFailOnUndecodableJSON(t *testing.T) {
	t.Parallel()

	client, _ := newClient(t, "token", response{status: http.StatusOK, body: "<html>bad gateway</html>"})

	_, err := client.Names(context.Background())
	require.Error(t, err)
	assert.Contains(t, err.Error(), "decode")

	_, err = client.Bond(context.Background(), "Tesouro Prefixado 2029")
	require.Error(t, err)
	assert.Contains(t, err.Error(), "decode")
}

func TestBondFailsOnABadMaturityDate(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name     string
		maturity string
	}{
		{"not a date", "amanhã"},
		{"too short", "2029-01"},
		{"impossible date", "2029-02-30T00:00"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			client, _ := newClient(t, "token", response{status: http.StatusOK, body: bondBody(tt.maturity, `"12,76%"`, "771.26")})

			_, err := client.Bond(context.Background(), "Tesouro Prefixado 2029")

			require.Error(t, err)
			assert.Contains(t, err.Error(), "maturity date")
		})
	}
}

// bondBody is the body of a bond with the given maturityDate and profitability text, and a
// unitaryInvestmentValue written as the JSON number price.
func bondBody(maturity, profitability, price string) string {
	return `{"treasuryBondCode":174,"treasuryBondName":"Tesouro Prefixado 2029","maturityDate":"` + maturity +
		`","investmentProfitabilityIndexerName":` + profitability +
		`,"redemptionProfitabilityFeeIndexerName":` + profitability +
		`,"unitaryInvestmentValue":` + price + `,"unitaryRedemptionValue":` + price + `}`
}

func TestBondReadsThePercentOfAProfitabilityText(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name string
		text string
		want string // empty when the text quotes no percent
	}{
		{"percent", "12,76%", "0.1276"},
		{"index plus percent", "IPCA + 6,97%", "0.0697"},
		{"whole percent", "13%", "0.13"},
		{"trailing zeros", "13,00%", "0.1300"},
		{"explicit plus", "+0,05%", "0.0005"},
		{"negative", "-0,05%", "-0.0005"},
		{"prefixed", "prefixado", ""},
		{"selic", "SELIC", ""},
		{"empty", "", ""},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			text := `"` + tt.text + `"`
			client, _ := newClient(t, "token", response{status: http.StatusOK, body: bondBody("2029-01-01T00:00", text, "771.26")})

			got, err := client.Bond(context.Background(), "Tesouro Prefixado 2029")

			require.NoError(t, err)

			var want *decimal.Decimal
			if tt.want != "" {
				want = rate(t, tt.want)
			}

			assertRate(t, "investment rate", want, got.InvestmentRate)
			assertRate(t, "redemption rate", want, got.RedemptionRate)
		})
	}
}

func TestBondKeepsEveryDigitOfAPrice(t *testing.T) {
	t.Parallel()

	client, _ := newClient(t, "token", response{
		status: http.StatusOK,
		body:   bondBody("2029-01-01T00:00", `"12,76%"`, "12345678901234567.89"),
	})

	got, err := client.Bond(context.Background(), "Tesouro Prefixado 2029")

	require.NoError(t, err)
	assert.Equal(t, "12345678901234567.89", got.InvestmentPrice.String())
	assert.Equal(t, "12345678901234567.89", got.RedemptionPrice.String())
}

func TestRequestsGiveUpAtTheTimeout(t *testing.T) {
	t.Parallel()

	server := httptest.NewServer(http.HandlerFunc(func(_ http.ResponseWriter, r *http.Request) {
		<-r.Context().Done()
	}))
	t.Cleanup(server.Close)

	client := radar.New("token", radar.WithBaseURL(server.URL), radar.WithTimeout(20*time.Millisecond))
	start := time.Now()

	_, err := client.Bond(context.Background(), "Tesouro Prefixado 2029")

	require.Error(t, err)
	assert.Less(t, time.Since(start), 5*time.Second, "the request gives up at its own timeout")
}

func TestRequestsStopWithTheirContext(t *testing.T) {
	t.Parallel()

	client, _ := newClient(t, "token", ok("prefixado-2029.json"))
	ctx, cancel := context.WithCancel(context.Background())
	cancel()

	_, namesErr := client.Names(ctx)
	_, bondErr := client.Bond(ctx, "Tesouro Prefixado 2029")

	require.ErrorIs(t, namesErr, context.Canceled)
	require.ErrorIs(t, bondErr, context.Canceled)
}

func TestBondReadsANullPriceAsZero(t *testing.T) {
	t.Parallel()

	client, _ := newClient(t, "token", response{
		status: http.StatusOK,
		body:   bondBody("2029-01-01T00:00", `"prefixado"`, "null"),
	})

	got, err := client.Bond(context.Background(), "Tesouro Prefixado 2029")

	require.NoError(t, err)
	assert.Equal(t, "0", got.InvestmentPrice.String())
	assert.Equal(t, "0", got.RedemptionPrice.String())
}
