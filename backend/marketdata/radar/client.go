// Package radar is a client for the Radar Opções API, which relays the Tesouro Direto bond prices.
package radar

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"time"

	"github.com/gringolito/debtwise/backend/decimal"
)

const (
	defaultBaseURL = "https://api.radaropcoes.com"
	defaultTimeout = 30 * time.Second
)

// dateLen is the length of the YYYY-MM-DD that starts a maturityDate.
const dateLen = len("2006-01-02")

// percent finds the percent a profitability text quotes: "12,76%", "IPCA + 6,97%".
var percent = regexp.MustCompile(`([+-]?\d+(?:,\d+)?)\s*%`)

// Bond is a treasury bond as the API quotes it.
type Bond struct {
	Name     string
	Maturity time.Time // calendar date of the maturity, midnight UTC
	// InvestmentRate is the percent the investment profitability text quotes, as a fraction
	// ("12,76%" is 0.1276). It is nil when the text quotes none, as when the bond is not on offer.
	InvestmentRate *decimal.Decimal
	// InvestmentPrice is the unit price to buy the bond, zero when the bond is not on offer.
	InvestmentPrice decimal.Decimal
	// RedemptionRate is the percent of the redemption profitability text, by the rule of
	// InvestmentRate.
	RedemptionRate *decimal.Decimal
	// RedemptionPrice is the unit price the Treasury pays to buy the bond back.
	RedemptionPrice decimal.Decimal
}

type bondBody struct {
	Code           *json.Number `json:"treasuryBondCode"`
	Name           string       `json:"treasuryBondName"`
	Maturity       string       `json:"maturityDate"`
	InvestmentRate string       `json:"investmentProfitabilityIndexerName"`
	InvestmentPU   *json.Number `json:"unitaryInvestmentValue"`
	RedemptionRate string       `json:"redemptionProfitabilityFeeIndexerName"`
	RedemptionPU   *json.Number `json:"unitaryRedemptionValue"`
	Indication     string       `json:"indication"`
}

func (b bondBody) bond() (Bond, error) {
	if len(b.Maturity) < dateLen {
		return Bond{}, fmt.Errorf("maturity date %q is not a date", b.Maturity)
	}

	maturity, err := time.Parse(time.DateOnly, b.Maturity[:dateLen])
	if err != nil {
		return Bond{}, fmt.Errorf("maturity date: %w", err)
	}

	investmentRate, err := parsePercent(b.InvestmentRate)
	if err != nil {
		return Bond{}, fmt.Errorf("investment rate: %w", err)
	}

	redemptionRate, err := parsePercent(b.RedemptionRate)
	if err != nil {
		return Bond{}, fmt.Errorf("redemption rate: %w", err)
	}

	investmentPrice, err := parsePrice(b.InvestmentPU)
	if err != nil {
		return Bond{}, fmt.Errorf("investment price: %w", err)
	}

	redemptionPrice, err := parsePrice(b.RedemptionPU)
	if err != nil {
		return Bond{}, fmt.Errorf("redemption price: %w", err)
	}

	return Bond{
		Name:            b.Name,
		Maturity:        maturity,
		InvestmentRate:  investmentRate,
		InvestmentPrice: investmentPrice,
		RedemptionRate:  redemptionRate,
		RedemptionPrice: redemptionPrice,
	}, nil
}

// parsePercent returns the percent that text quotes as a fraction, or nil when it quotes none.
func parsePercent(text string) (*decimal.Decimal, error) {
	m := percent.FindStringSubmatch(text)
	if m == nil {
		return nil, nil
	}

	n, err := decimal.Parse(strings.TrimPrefix(strings.Replace(m[1], ",", ".", 1), "+"))
	if err != nil {
		return nil, err
	}

	fraction := decimal.PercentToFraction(n)

	return &fraction, nil
}

// parsePrice returns the price of a JSON number, zero when it is null.
func parsePrice(n *json.Number) (decimal.Decimal, error) {
	if n == nil {
		return decimal.FromInt(0), nil
	}

	return decimal.Parse(n.String())
}

// Client reads bonds from the Radar API. Create one with New.
type Client struct {
	baseURL string
	token   string
	http    *http.Client
}

// Option configures a Client.
type Option func(*Client)

// WithBaseURL sets the URL that paths are appended to. The default is the public Radar API.
func WithBaseURL(baseURL string) Option {
	return func(c *Client) { c.baseURL = baseURL }
}

// WithTimeout sets the deadline of each HTTP request. The default is 30 seconds.
func WithTimeout(d time.Duration) Option {
	return func(c *Client) { c.http.Timeout = d }
}

// New returns a Client for the public Radar API that authenticates with token, changed by opts.
// An empty token sends no Authorization header.
func New(token string, opts ...Option) *Client {
	c := &Client{
		baseURL: defaultBaseURL,
		token:   token,
		http:    &http.Client{Timeout: defaultTimeout},
	}
	for _, opt := range opts {
		opt(c)
	}

	return c
}

type bondList struct {
	Response struct {
		Bonds []struct {
			Bond struct {
				Name string `json:"nm"`
			} `json:"TrsrBd"`
		} `json:"TrsrBdTradgList"`
	} `json:"response"`
}

// Names returns the name of every bond the API lists, in the order it lists them. The list needs
// no token, so none is spent on it, and the values in it are placeholders: Bond reads the real ones.
func (c *Client) Names(ctx context.Context) ([]string, error) {
	var list bondList
	if err := c.get(ctx, "/bonds.json", "", &list); err != nil {
		return nil, fmt.Errorf("radar: bond list: %w", err)
	}

	names := make([]string, len(list.Response.Bonds))
	for i, b := range list.Response.Bonds {
		names[i] = b.Bond.Name
	}

	return names, nil
}

// Bond returns the bond that the API names `name`. It needs the token the Client was created
// with.
//
// The API answers a missing or invalid token, or an exhausted quota, with status 200 and a body
// whose bond code is null and whose text fields hold the reason. Bond returns that reason as an
// error.
func (c *Client) Bond(ctx context.Context, name string) (Bond, error) {
	var body bondBody
	if err := c.get(ctx, "/bonds/"+url.PathEscape(name), c.token, &body); err != nil {
		return Bond{}, fmt.Errorf("radar: bond %q: %w", name, err)
	}

	if body.Code == nil {
		return Bond{}, fmt.Errorf("radar: bond %q: no bond answered: %s", name, body.Indication)
	}

	bond, err := body.bond()
	if err != nil {
		return Bond{}, fmt.Errorf("radar: bond %q: %w", name, err)
	}

	return bond, nil
}

// get requests path, with token when there is one, and decodes the JSON body of a 200 answer
// into v.
func (c *Client) get(ctx context.Context, path, token string, v any) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.baseURL+path, nil)
	if err != nil {
		return err
	}

	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}

	resp, err := c.http.Do(req)
	if err != nil {
		return err
	}
	defer func() { _ = resp.Body.Close() }()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("status %d", resp.StatusCode)
	}

	if err := json.NewDecoder(resp.Body).Decode(v); err != nil {
		return fmt.Errorf("decode response: %w", err)
	}

	return nil
}
