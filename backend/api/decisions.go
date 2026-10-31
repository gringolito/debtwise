package api

import (
	"context"
	"fmt"
	"net/http"
	"time"

	"github.com/danielgtaylor/huma/v2"

	"github.com/gringolito/debtwise/backend/bonds"
	"github.com/gringolito/debtwise/backend/comparison"
	"github.com/gringolito/debtwise/backend/indexes"
	"github.com/gringolito/debtwise/backend/marketdata"
	"github.com/gringolito/debtwise/backend/mortgage"
)

type decisionInput struct {
	Amount string `json:"amount" pattern:"^(0|[1-9][0-9]{0,14})(\\.[0-9]{1,2})?$" doc:"The amount to prepay or invest, in reais, as a decimal string."`
	Date   string `json:"date,omitempty" format:"date" required:"false" doc:"The date the amount is prepaid or invested on. Today when absent; it must not be before today."`
	Effect string `json:"effect" enum:"shorten_term,lower_installment" doc:"What prepaying changes: shorten_term keeps the installment and ends the mortgage earlier; lower_installment keeps the end date and lowers the installments. Every prepayment of both scenarios has it."`
}

type decision struct {
	Amount   string    `json:"amount" doc:"The amount prepaid or invested, in reais, as a decimal string."`
	Date     string    `json:"date" format:"date" doc:"The date the amount is prepaid or invested on."`
	Effect   string    `json:"effect" enum:"shorten_term,lower_installment" doc:"What each prepayment changes."`
	Verdicts []verdict `json:"verdicts" nullable:"false" doc:"A verdict for every bond on offer that follows the mortgage's indexer and matures after the date, in the order of the bond catalogue."`
}

type verdict struct {
	Type          bondType          `json:"type" doc:"The type of the bond compared."`
	Maturity      string            `json:"maturity" format:"date" doc:"The date the bond matures: the horizon both scenarios are valued on."`
	Rate          string            `json:"rate" doc:"The buy rate of the bond's quote, as a decimal fraction. For ntn_b_principal and ntn_b it is the real rate over IPCA."`
	Unavailable   string            `json:"unavailable,omitempty" enum:"missing_ipca,amount_too_small" doc:"Why the verdict has no scenarios. missing_ipca: the IPCA the bond's VNA follows is not available yet; amount_too_small: the amount buys less than a hundredth of the bond. Absent when it has them."`
	UnitPrice     string            `json:"unit_price,omitempty" doc:"The price of one bond at the rate for settlement on the date, in reais, as a decimal string. Absent when the verdict is unavailable for missing_ipca."`
	Quantity      string            `json:"quantity,omitempty" doc:"How many bonds the amount buys, in hundredths of a bond, as a decimal string. Absent when the verdict is unavailable for missing_ipca."`
	Advantage     string            `json:"advantage,omitempty" doc:"The invest scenario's net worth on the horizon less the prepay scenario's, in reais, as a decimal string. Positive favours investing. Absent when the verdict is unavailable."`
	AvoidedCost   string            `json:"avoided_cost,omitempty" doc:"What prepaying the amount saves by the horizon beyond the amount itself, in reais, as a decimal string. Absent when the verdict is unavailable."`
	BreakEvenRate string            `json:"break_even_rate,omitempty" doc:"The yearly bond rate, as a decimal fraction of at most 10 places, at which buying the bond with the amount on the date gives an advantage within a centavo of zero; where the hundredths the amount buys make the advantage jump over zero, the lowest rate at which it is positive. For ntn_b_principal and ntn_b it is the real rate over IPCA, priced through the VNA of the date. Absent when the verdict is unavailable or has no_break_even."`
	NoBreakEven   string            `json:"no_break_even,omitempty" enum:"below_range,above_range" doc:"Why no yearly bond rate from 0% to 100% is a break-even rate. below_range: investing wins even at 0%; above_range: prepaying wins even at 100%. Absent when the verdict has a break_even_rate or is unavailable."`
	Invest        *scenario         `json:"invest,omitempty" doc:"Investing the amount in the bond. Absent when the verdict is unavailable."`
	Prepay        *scenario         `json:"prepay,omitempty" doc:"Prepaying the amount. Absent when the verdict is unavailable."`
	ProjectedBy   []projectedBy     `json:"projected_by" nullable:"false" doc:"The projection method of each index a projected value of the verdict comes from. Empty when it reads published values only."`
	MarketData    verdictMarketData `json:"market_data" doc:"How fresh the market data the verdict reads is."`
}

type verdictMarketData struct {
	Bonds   bondsStatus   `json:"bonds" doc:"How fresh the bond prices are."`
	Focus   focusStatus   `json:"focus" doc:"How fresh the Focus expectations are."`
	Indexes []indexStatus `json:"indexes" nullable:"false" doc:"How fresh each index the verdict reads is."`
}

type scenario struct {
	NetWorth           string     `json:"net_worth" doc:"The bond's net Maturity Value and the cash held, less the outstanding balance, on the horizon, in reais, as a decimal string."`
	Cash               string     `json:"cash" doc:"The cash held at zero return on the horizon, in reais, as a decimal string."`
	OutstandingBalance string     `json:"outstanding_balance" doc:"What is still owed on the horizon, in reais, as a decimal string."`
	Bond               *lotAmount `json:"bond,omitempty" doc:"The bond's Maturity Value, gross and net of IOF, income tax and the custody fee. Only in a decision's invest scenario and an early sale check's hold scenario."`
	CashFlows          []cashFlow `json:"cash_flows" nullable:"false" doc:"The scenario's cash flows from the date to the horizon, by date."`
}

type cashFlow struct {
	Date               string               `json:"date" format:"date" doc:"The date of the flows."`
	Installment        *cashFlowInstallment `json:"installment,omitempty" doc:"The installment due that day. Absent when none is."`
	Invested           string               `json:"invested" doc:"What the bond cost, in reais, as a decimal string. Zero in an early sale check, which buys no bond."`
	Sold               *lotAmount           `json:"sold,omitempty" doc:"The Market Value the lot was sold for that day, gross and net of IOF, income tax and the custody fee. Its net is prepaid that day, and held as far as nothing is owed. Only on the first day of an early sale check's sell scenario."`
	Coupon             *lotAmount           `json:"coupon,omitempty" doc:"The bond's coupon paid that day, gross and net of income tax and the custody fee. Its net is prepaid that day, and held as far as nothing is owed. Only for an ntn_f or ntn_b, in a decision's invest scenario and an early sale check's hold scenario."`
	Prepaid            string               `json:"prepaid" doc:"What the scenario's prepayments that day took off the outstanding balance, in reais, as a decimal string."`
	Held               string               `json:"held" doc:"The cash set aside that day because nothing is owed to prepay with it, in reais, as a decimal string. Negative when the scenario's installment is above the status quo's."`
	Redeemed           *lotAmount           `json:"redeemed,omitempty" doc:"The bond's Maturity Value paid that day. Only on the horizon of a decision's invest scenario and an early sale check's hold scenario."`
	OutstandingBalance string               `json:"outstanding_balance" doc:"What is owed once the day's flows are done, in reais, as a decimal string."`
}

type cashFlowInstallment struct {
	Number       int               `json:"number" doc:"Installment number, counting from 1."`
	Correction   string            `json:"correction" doc:"Indexer correction added to the outstanding balance before interest is charged, in reais, as a decimal string."`
	IndexValues  []correctionIndex `json:"index_values" nullable:"false" doc:"The index values behind the correction, oldest period first."`
	Interest     string            `json:"interest" doc:"Interest charged, in reais, as a decimal string."`
	Amortization string            `json:"amortization" doc:"Outstanding balance paid off, in reais, as a decimal string."`
	MIP          string            `json:"mip" doc:"MIP (life and disability insurance) premium, in reais, as a decimal string."`
	DFI          string            `json:"dfi" doc:"DFI (property damage insurance) premium, in reais, as a decimal string."`
	Fee          string            `json:"fee" doc:"Admin fee, in reais, as a decimal string."`
	Amount       string            `json:"amount" doc:"Total the installment charges, in reais, as a decimal string."`
}

func registerDecisions(humaAPI huma.API, services Services, now func() time.Time) {
	register(humaAPI, huma.Operation{
		OperationID: "decide",
		Method:      http.MethodPost,
		Path:        "/decisions",
		Summary:     "Compare prepaying an amount with buying a bond",
		Description: "Compares prepaying the amount on the date with buying each bond on offer that follows the mortgage's indexer, under equal outflow, valued on the bond's maturity. It is computed on request and not stored.",
		Tags:        []string{"Decisions"},
	}, func(ctx context.Context, in *struct{ Body decisionInput }) (*struct{ Body decision }, error) {
		today := dateOf(now())

		d, terms, err := readDecision(ctx, services.Mortgages, in.Body, today)
		if err != nil {
			return nil, err
		}

		verdicts, err := decide(ctx, services, terms, d, today)
		if err != nil {
			return nil, err
		}

		status, err := services.MarketData.Status(ctx, now())
		if err != nil {
			return nil, err
		}

		out := &struct{ Body decision }{Body: decision{
			Amount:   d.Amount.String(),
			Date:     d.Date.Format(time.DateOnly),
			Effect:   string(d.Effect),
			Verdicts: make([]verdict, 0, len(verdicts)),
		}}

		for _, v := range verdicts {
			out.Body.Verdicts = append(out.Body.Verdicts, newVerdict(v, status))
		}

		return out, nil
	})
}

// readDecision reads a decision from a body whose amount, date and effect the schema has already
// checked, and checks it against the registered mortgage's terms on the day today.
func readDecision(ctx context.Context, mortgages Mortgages, body decisionInput, today time.Time) (comparison.Decision, mortgage.Terms, error) {
	terms, err := mortgages.Find(ctx)
	if err != nil {
		return comparison.Decision{}, mortgage.Terms{}, mortgageFailure(err)
	}

	var p parser

	prepayment := mortgage.Prepayment{Date: today, Amount: p.decimal(body.Amount), Effect: mortgage.PrepaymentEffect(body.Effect)}
	if body.Date != "" {
		prepayment.Date = p.date(body.Date)
	}

	if p.err != nil {
		return comparison.Decision{}, mortgage.Terms{}, fmt.Errorf("read decision: %w", p.err)
	}

	violations := prepayment.Validate(terms)
	if prepayment.Date.Before(today) {
		violations = append(violations, mortgage.Violation{Field: "date", Reason: "must not be before today"})
	}

	d := comparison.Decision{Amount: prepayment.Amount, Date: prepayment.Date, Effect: prepayment.Effect}

	return d, terms, violationsFailure(violations)
}

// decide reads what the comparison needs and compares d against every bond on offer.
func decide(ctx context.Context, services Services, terms mortgage.Terms, d comparison.Decision, today time.Time) ([]comparison.Verdict, error) {
	m, market, err := comparisonOf(ctx, services, terms, terms.Indexer == mortgage.IPCA)
	if err != nil {
		return nil, err
	}

	return comparison.Decide(m, market, d, today)
}

// comparisonOf reads the mortgage of terms with its events and outlook, and the market: the bond
// quotes, the tax tables and, when withIPCA, what an IPCA+ bond's VNA is computed from.
func comparisonOf(ctx context.Context, services Services, terms mortgage.Terms, withIPCA bool) (comparison.Mortgage, comparison.Market, error) {
	outlook, err := outlookOf(ctx, services.Indexes, terms.Indexes()...)
	if err != nil {
		return comparison.Mortgage{}, comparison.Market{}, err
	}

	events, err := services.Mortgages.Events(ctx)
	if err != nil {
		return comparison.Mortgage{}, comparison.Market{}, mortgageFailure(err)
	}

	quotes, err := services.Quotes.Quotes(ctx)
	if err != nil {
		return comparison.Mortgage{}, comparison.Market{}, err
	}

	taxes, err := services.Lots.Taxes(ctx)
	if err != nil {
		return comparison.Mortgage{}, comparison.Market{}, err
	}

	var ipca bonds.IPCA
	if withIPCA {
		if ipca, err = ipcaOf(ctx, services.Indexes); err != nil {
			return comparison.Mortgage{}, comparison.Market{}, err
		}
	}

	return comparison.Mortgage{Terms: terms, Events: events, Outlook: outlook},
		comparison.Market{Quotes: quotes, Taxes: taxes, IPCA: ipca}, nil
}

func newVerdict(v comparison.Verdict, status marketdata.Status) verdict {
	out := verdict{
		Type:        bondType(v.Bond.Type),
		Maturity:    v.Bond.Maturity.Format(time.DateOnly),
		Rate:        v.Rate.String(),
		Unavailable: string(v.Unavailable),
		ProjectedBy: projectedByOf(v.ProjectedBy),
		MarketData:  newVerdictMarketData(v.Indexes, status),
	}

	if v.Unavailable == comparison.MissingIPCA {
		return out
	}

	out.UnitPrice, out.Quantity = v.UnitPrice.String(), v.Quantity.String()

	if v.Unavailable != "" {
		return out
	}

	out.Advantage, out.AvoidedCost = v.Advantage.String(), v.AvoidedCost.String()
	out.NoBreakEven = string(v.NoBreakEven)

	if v.NoBreakEven == "" {
		out.BreakEvenRate = v.BreakEvenRate.String()
	}

	out.Invest, out.Prepay = new(newScenario(v.Invest)), new(newScenario(v.Prepay))

	return out
}

func newVerdictMarketData(read []indexes.Index, status marketdata.Status) verdictMarketData {
	out := verdictMarketData{
		Bonds:   bondsStatus{Status: stateCode(status.Quotes.State), RefreshedAt: timeOrNil(status.Quotes.RefreshedAt), FailedAt: timeOrNil(status.Quotes.FailedAt)},
		Focus:   focusStatus{Status: stateCode(status.Focus.State), RefreshedAt: timeOrNil(status.Focus.RefreshedAt), FailedAt: timeOrNil(status.Focus.FailedAt)},
		Indexes: make([]indexStatus, 0, len(read)),
	}

	for _, s := range status.Indexes {
		for _, index := range read {
			if s.Index == index {
				out.Indexes = append(out.Indexes, indexStatus{
					Index:       indexCode(s.Index),
					Status:      stateCode(s.State),
					RefreshedAt: timeOrNil(s.RefreshedAt),
					FailedAt:    timeOrNil(s.FailedAt),
				})
			}
		}
	}

	return out
}

func newScenario(s comparison.Scenario) scenario {
	out := scenario{
		NetWorth:           s.NetWorth.String(),
		Cash:               s.Cash.String(),
		OutstandingBalance: s.OutstandingBalance.String(),
		CashFlows:          make([]cashFlow, 0, len(s.CashFlows)),
	}

	if s.Bond != nil {
		out.Bond = new(newLotAmount(*s.Bond))
	}

	for _, f := range s.CashFlows {
		flow := cashFlow{
			Date:               f.Date.Format(time.DateOnly),
			Invested:           f.Invested.String(),
			Prepaid:            f.Prepaid.String(),
			Held:               f.Held.String(),
			OutstandingBalance: f.OutstandingBalance.String(),
		}

		if f.Sold != nil {
			flow.Sold = new(newLotAmount(*f.Sold))
		}

		if i := f.Installment; i != nil {
			flow.Installment = &cashFlowInstallment{
				Number:       i.Number,
				Correction:   i.Correction.String(),
				IndexValues:  newCorrectionIndexes(i.IndexValues),
				Interest:     i.Interest.String(),
				Amortization: i.Amortization.String(),
				MIP:          i.MIP.String(),
				DFI:          i.DFI.String(),
				Fee:          i.Fee.String(),
				Amount:       i.Amount.String(),
			}
		}

		if f.Coupon != nil {
			flow.Coupon = new(newLotAmount(*f.Coupon))
		}

		if f.Redeemed != nil {
			flow.Redeemed = new(newLotAmount(*f.Redeemed))
		}

		out.CashFlows = append(out.CashFlows, flow)
	}

	return out
}
