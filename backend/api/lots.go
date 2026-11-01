package api

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"reflect"
	"slices"
	"strconv"
	"strings"
	"time"

	"github.com/danielgtaylor/huma/v2"

	"github.com/gringolito/debtwise/backend/bonds"
	"github.com/gringolito/debtwise/backend/decimal"
	"github.com/gringolito/debtwise/backend/indexes"
	"github.com/gringolito/debtwise/backend/mortgage"
)

// Lots is the subset of *bonds.Store the API uses to record lots and to value them.
type Lots interface {
	Lots(ctx context.Context) ([]bonds.Lot, error)
	AddLot(ctx context.Context, l bonds.Lot) (bonds.Lot, error)
	AddLots(ctx context.Context, lots []bonds.Lot) ([]bonds.Lot, error)
	UpdateLot(ctx context.Context, l bonds.Lot) error
	DeleteLot(ctx context.Context, id int64) error
	Taxes(ctx context.Context) (bonds.Taxes, error)
}

type lotInput struct {
	Type         bondType `json:"type" doc:"The type of bond the lot bought."`
	Maturity     string   `json:"maturity" format:"date" doc:"The date the bond matures."`
	PurchaseDate string   `json:"purchase_date" format:"date" doc:"The date the purchase settled."`
	Rate         string   `json:"rate" pattern:"^0(\\.[0-9]{1,12})?$" doc:"The yearly rate the lot was bought at, as a decimal fraction: 0.1276 is 12.76% a year. For ntn_b_principal and ntn_b it is the real rate over IPCA."`
	UnitPrice    string   `json:"unit_price" pattern:"^(0|[1-9][0-9]{0,8})(\\.[0-9]{1,6})?$" doc:"The price paid for one bond, in reais, as a decimal string."`
	Quantity     string   `json:"quantity" pattern:"^(0|[1-9][0-9]{0,8})(\\.[0-9]{1,2})?$" doc:"How many bonds the lot bought, as a decimal string. It can be fractional."`
}

type lot struct {
	ID           int64    `json:"id" doc:"The lot's ID."`
	Type         bondType `json:"type" doc:"The type of bond the lot bought."`
	Maturity     string   `json:"maturity" format:"date" doc:"The date the bond matures."`
	PurchaseDate string   `json:"purchase_date" format:"date" doc:"The date the purchase settled."`
	Rate         string   `json:"rate" doc:"The yearly rate the lot was bought at, as a decimal fraction: 0.1276 is 12.76% a year. For ntn_b_principal and ntn_b it is the real rate over IPCA."`
	UnitPrice    string   `json:"unit_price" doc:"The price paid for one bond, in reais, as a decimal string."`
	Quantity     string   `json:"quantity" doc:"How many bonds the lot bought, as a decimal string."`
}

type lotImport struct {
	Lots []lotInput `json:"lots" minItems:"1" nullable:"false" doc:"The lots to record, every one or none."`

	raw []byte
}

// UnmarshalJSON keeps the JSON it reads, for readLots to validate against the schema. It leaves the
// lots that don't fit lotInput for readLots to report.
func (i *lotImport) UnmarshalJSON(data []byte) error {
	type plain lotImport

	i.raw = slices.Clone(data)

	var typeErr *json.UnmarshalTypeError
	if err := json.Unmarshal(data, (*plain)(i)); err != nil && !errors.As(err, &typeErr) {
		return err
	}

	return nil
}

type lotImported struct {
	Lots []lot `json:"lots" nullable:"false" doc:"The lots recorded, in the order they were sent, each with its ID."`
}

type lotAmount struct {
	Gross       string        `json:"gross" doc:"The amount before IOF, income tax and the custody fee, in reais, as a decimal string."`
	IOF         string        `json:"iof" doc:"The IOF taken from the gross amount, in reais, as a decimal string."`
	IncomeTax   string        `json:"income_tax" doc:"The income tax taken from the gross amount, in reais, as a decimal string."`
	CustodyFee  string        `json:"custody_fee" doc:"The custody fee taken from the gross amount, in reais, as a decimal string."`
	Net         string        `json:"net" doc:"The amount left after IOF, income tax and the custody fee, in reais, as a decimal string."`
	ProjectedBy []projectedBy `json:"projected_by" nullable:"false" doc:"The projection methods of the projected IPCA values the amount depends on. Empty when it depends on published values only."`
}

type lotCoupon struct {
	Date        string        `json:"date" format:"date" doc:"The date the coupon is paid."`
	Paid        bool          `json:"paid" doc:"Whether the coupon has been paid by the date the lot is valued on."`
	Gross       string        `json:"gross" doc:"The coupon before IOF, income tax and the custody fee, in reais, as a decimal string."`
	IOF         string        `json:"iof" doc:"The IOF taken from the coupon, in reais, as a decimal string."`
	IncomeTax   string        `json:"income_tax" doc:"The income tax taken from the coupon, in reais, as a decimal string."`
	CustodyFee  string        `json:"custody_fee" doc:"The custody fee taken from the coupon, in reais, as a decimal string."`
	Net         string        `json:"net" doc:"The coupon left after IOF, income tax and the custody fee, in reais, as a decimal string."`
	ProjectedBy []projectedBy `json:"projected_by" nullable:"false" doc:"The projection methods of the projected IPCA values the coupon depends on. Empty when it depends on published values only."`
}

type lotValues struct {
	On       string      `json:"on" format:"date" doc:"The date the lot is valued on."`
	Accrual  *lotAmount  `json:"accrual,omitempty" doc:"The lot's Accrual Value on that date. Absent from the bond's maturity on."`
	Market   *lotAmount  `json:"market,omitempty" doc:"The lot's Market Value on that date, at the sell side of the bond's quote. Absent when the bond has no quote, and from its maturity on."`
	Maturity lotAmount   `json:"maturity" doc:"The lot's Maturity Value: everything the lot pays on the bond's maturity date, its last coupon included."`
	Coupons  []lotCoupon `json:"coupons" nullable:"false" doc:"The coupons the lot is paid before the bond matures, past and future, in date order. Empty for ltn and ntn_b_principal."`
}

type lotValued struct {
	ID                int64      `json:"id" doc:"The lot's ID."`
	Type              bondType   `json:"type" doc:"The type of bond the lot bought."`
	Maturity          string     `json:"maturity" format:"date" doc:"The date the bond matures."`
	PurchaseDate      string     `json:"purchase_date" format:"date" doc:"The date the purchase settled."`
	Rate              string     `json:"rate" doc:"The yearly rate the lot was bought at, as a decimal fraction: 0.1276 is 12.76% a year. For ntn_b_principal and ntn_b it is the real rate over IPCA."`
	UnitPrice         string     `json:"unit_price" doc:"The price paid for one bond, in reais, as a decimal string."`
	Quantity          string     `json:"quantity" doc:"How many bonds the lot bought, as a decimal string."`
	Values            *lotValues `json:"values,omitempty" doc:"The lot's values. Absent when values_unavailable says why they cannot be computed."`
	ValuesUnavailable string     `json:"values_unavailable,omitempty" enum:"missing_ipca" doc:"Why the lot has no values. missing_ipca: the IPCA the lot's values follow is not available yet. Absent when the lot has values."`
}

type lotList struct {
	Lots        []lotValued  `json:"lots" nullable:"false" doc:"Every lot recorded, by purchase date, each valued on today."`
	MarketValue *marketTotal `json:"market_value,omitempty" doc:"The total Market Value of the lots that have one. Absent when none has."`
}

type marketTotal struct {
	Gross string `json:"gross" doc:"The total before IOF, income tax and the custody fee, in reais, as a decimal string."`
	Net   string `json:"net" doc:"The total after IOF, income tax and the custody fee, in reais, as a decimal string."`
}

const (
	lotsPath = "/lots"
	lotsTag  = "Lots"

	missingIPCA = "missing_ipca"
)

func registerLots(humaAPI huma.API, lots Lots, quotes Quotes, store IndexStore, now func() time.Time) {
	register(humaAPI, huma.Operation{
		OperationID: "list-lots",
		Method:      http.MethodGet,
		Path:        lotsPath,
		Summary:     "List the lots with their values",
		Description: "Lists the lots recorded, each with its Accrual, Market and Maturity Values and its coupons, gross and net of IOF, income tax and the custody fee, valued on today.",
		Tags:        []string{lotsTag},
	}, func(ctx context.Context, _ *struct{}) (*struct{ Body lotList }, error) {
		valued, total, err := valuedLots(ctx, lots, quotes, store, dateOf(now()))
		if err != nil {
			return nil, err
		}

		return &struct{ Body lotList }{Body: lotList{Lots: valued, MarketValue: total}}, nil
	})

	register(humaAPI, huma.Operation{
		OperationID:   "add-lot",
		Method:        http.MethodPost,
		Path:          lotsPath,
		DefaultStatus: http.StatusCreated,
		Summary:       "Record a lot",
		Description:   "Records a purchase of a bond.",
		Tags:          []string{lotsTag},
	}, func(ctx context.Context, in *struct{ Body lotInput }) (*struct{ Body lot }, error) {
		l, err := readLot(in.Body, dateOf(now()))
		if err != nil {
			return nil, err
		}

		added, err := lots.AddLot(ctx, l)
		if err != nil {
			return nil, err
		}

		return &struct{ Body lot }{Body: newLot(added)}, nil
	})

	importSchema := humaAPI.OpenAPI().Components.Schemas.Schema(reflect.TypeFor[lotImport](), true, "")

	register(humaAPI, huma.Operation{
		OperationID:   "import-lots",
		Method:        http.MethodPost,
		Path:          lotsPath + "/import",
		DefaultStatus: http.StatusCreated,
		Summary:       "Import lots",
		Description:   "Records every lot of the batch or none: a batch with any invalid lot records nothing and answers the violations of every lot.",
		Tags:          []string{lotsTag},
		// readLots validates the body itself, to answer the errors of every lot at once.
		SkipValidateBody: true,
	}, func(ctx context.Context, in *struct{ Body lotImport }) (*struct{ Body lotImported }, error) {
		read, err := readLots(humaAPI.OpenAPI().Components.Schemas, importSchema, in.Body.raw, in.Body.Lots, dateOf(now()))
		if err != nil {
			return nil, err
		}

		added, err := lots.AddLots(ctx, read)
		if err != nil {
			return nil, err
		}

		imported := make([]lot, 0, len(added))
		for _, l := range added {
			imported = append(imported, newLot(l))
		}

		return &struct{ Body lotImported }{Body: lotImported{Lots: imported}}, nil
	})

	register(humaAPI, huma.Operation{
		OperationID: "edit-lot",
		Method:      http.MethodPut,
		Path:        lotsPath + "/{id}",
		Summary:     "Edit a lot",
		Description: "Replaces a recorded lot.",
		Tags:        []string{lotsTag},
	}, func(ctx context.Context, in *struct {
		ID   int64 `path:"id" doc:"The ID the lot was recorded with."`
		Body lotInput
	},
	) (*struct{ Body lot }, error) {
		l, err := readLot(in.Body, dateOf(now()))
		if err != nil {
			return nil, err
		}

		l.ID = in.ID

		if err := lots.UpdateLot(ctx, l); err != nil {
			return nil, lotFailure(err)
		}

		return &struct{ Body lot }{Body: newLot(l)}, nil
	})

	register(humaAPI, huma.Operation{
		OperationID:   "delete-lot",
		Method:        http.MethodDelete,
		Path:          lotsPath + "/{id}",
		DefaultStatus: http.StatusNoContent,
		Summary:       "Delete a lot",
		Description:   "Deletes a recorded lot.",
		Tags:          []string{lotsTag},
	}, func(ctx context.Context, in *struct {
		ID int64 `path:"id" doc:"The ID the lot was recorded with."`
	},
	) (*struct{}, error) {
		if err := lots.DeleteLot(ctx, in.ID); err != nil {
			return nil, lotFailure(err)
		}

		return &struct{}{}, nil
	})
}

// valuedLots values every recorded lot on the date on, and totals the Market Value of the lots that
// have one; the total is nil when none has.
func valuedLots(ctx context.Context, lots Lots, quotes Quotes, store IndexStore, on time.Time) ([]lotValued, *marketTotal, error) {
	recorded, err := lots.Lots(ctx)
	if err != nil {
		return nil, nil, err
	}

	taxes, err := lots.Taxes(ctx)
	if err != nil {
		return nil, nil, err
	}

	stored, err := quotes.Quotes(ctx)
	if err != nil {
		return nil, nil, err
	}

	sells := make(map[bonds.Bond]bonds.Price, len(stored))
	for _, q := range stored {
		sells[q.Bond] = q.Sell
	}

	var ipca bonds.IPCA

	if slices.ContainsFunc(recorded, func(l bonds.Lot) bool { return readsIPCA(l.Bond.Type) }) {
		if ipca, err = ipcaOf(ctx, store); err != nil {
			return nil, nil, err
		}
	}

	valued := make([]lotValued, 0, len(recorded))

	var (
		gross, net decimal.Decimal
		hasMarket  bool
	)

	for _, l := range recorded {
		var sell *bonds.Price
		if p, ok := sells[l.Bond]; ok {
			sell = &p
		}

		v, err := l.Value(on, taxes, ipca, sell)

		switch {
		case errors.Is(err, bonds.ErrMissingIPCANumber):
			valued = append(valued, newLotValued(l, nil, missingIPCA))
		case err != nil:
			return nil, nil, fmt.Errorf("value lot %d: %w", l.ID, err)
		default:
			valued = append(valued, newLotValued(l, new(newLotValues(v)), ""))

			if v.Market != nil {
				gross, net = gross.Add(v.Market.Gross), net.Add(v.Market.Net)
				hasMarket = true
			}
		}
	}

	if !hasMarket {
		return valued, nil, nil
	}

	return valued, &marketTotal{Gross: gross.String(), Net: net.String()}, nil
}

// readsIPCA reports whether the values of a lot of the bond type follow the IPCA.
func readsIPCA(t bonds.Type) bool {
	return t == bonds.NTNBPrincipal || t == bonds.NTNB
}

// ipcaOf reads what an NTN-B's VNA is computed from: IBGE's published index numbers, and the IPCA
// the Outlook publishes or projects for each month.
func ipcaOf(ctx context.Context, store IndexStore) (bonds.IPCA, error) {
	history, err := store.History(ctx, indexes.IPCANumber)
	if err != nil {
		return bonds.IPCA{}, err
	}

	numbers := make(bonds.IPCANumbers, len(history))
	for _, v := range history {
		numbers[v.PeriodStart] = v.Value
	}

	outlook, err := outlookOf(ctx, store, indexes.IPCA)
	if err != nil {
		return bonds.IPCA{}, err
	}

	return bonds.IPCA{Numbers: numbers, Outlook: outlook}, nil
}

// readLot reads a lot from a body whose dates and decimals the schema has already checked, and
// checks it on the day today.
func readLot(body lotInput, today time.Time) (bonds.Lot, error) {
	l, violations, err := checkLot(body, today)
	if err != nil {
		return bonds.Lot{}, err
	}

	return l, violationsFailure(violations)
}

// checkLot reads a lot like readLot, and returns the violations of the lot's rules instead of
// failing with them.
func checkLot(body lotInput, today time.Time) (bonds.Lot, []mortgage.Violation, error) {
	var p parser

	l := bonds.Lot{
		Bond:         bonds.Bond{Type: bonds.Type(body.Type), Maturity: p.date(body.Maturity)},
		PurchaseDate: p.date(body.PurchaseDate),
		Rate:         p.decimal(body.Rate),
		UnitPrice:    p.decimal(body.UnitPrice),
		Quantity:     p.decimal(body.Quantity),
	}
	if p.err != nil {
		return bonds.Lot{}, nil, fmt.Errorf("read lot: %w", p.err)
	}

	violations := l.Validate(today)

	converted := make([]mortgage.Violation, 0, len(violations))
	for _, v := range violations {
		converted = append(converted, mortgage.Violation(v))
	}

	return l, converted, nil
}

// readLots reads every lot of an import like readLot. The operation skips huma's validation of the
// body, so a malformed lot doesn't hide the violations of the others: raw is validated here against
// schema, with the errors huma would answer, and the lot rules are checked on every lot that passed
// it. It fails with the errors of all the lots, each located by the lot's position in the batch.
func readLots(registry huma.Registry, schema *huma.Schema, raw []byte, bodies []lotInput, today time.Time) ([]bonds.Lot, error) {
	var parsed any
	if err := json.Unmarshal(raw, &parsed); err != nil {
		return nil, fmt.Errorf("read lots: %w", err)
	}

	var res huma.ValidateResult

	huma.Validate(registry, schema, huma.NewPathBuffer([]byte("body"), len("body")), huma.ModeWriteToServer, parsed, &res)

	var details []error // errors of the batch itself, then of each lot in turn

	malformed := make(map[int][]error)

	for _, err := range res.Errors {
		if i, ok := lotIndex(err); ok {
			malformed[i] = append(malformed[i], err)
		} else {
			details = append(details, err)
		}
	}

	lots := make([]bonds.Lot, 0, len(bodies))

	for i, body := range bodies {
		if errs, ok := malformed[i]; ok {
			details = append(details, errs...)

			continue
		}

		l, violations, err := checkLot(body, today)
		if err != nil {
			return nil, fmt.Errorf("lot %d: %w", i, err)
		}

		for _, v := range violations {
			details = append(details, &huma.ErrorDetail{
				Location: fmt.Sprintf("body.lots[%d].%s", i, v.Field),
				Message:  v.Reason,
			})
		}

		lots = append(lots, l)
	}

	if len(details) > 0 {
		return nil, huma.Error422UnprocessableEntity("validation failed", details...)
	}

	return lots, nil
}

// lotIndex returns the position in the batch of the lot a validation error is located in.
func lotIndex(err error) (int, bool) {
	var detail *huma.ErrorDetail
	if !errors.As(err, &detail) {
		return 0, false
	}

	rest, found := strings.CutPrefix(detail.Location, "body.lots[")
	if !found {
		return 0, false
	}

	digits, _, found := strings.Cut(rest, "]")
	if !found {
		return 0, false
	}

	i, err := strconv.Atoi(digits)

	return i, err == nil
}

func lotFailure(err error) error {
	if errors.Is(err, bonds.ErrLotNotFound) {
		return huma.Error404NotFound("no such lot")
	}

	return err
}

// dateOf returns the calendar date of t at midnight UTC.
func dateOf(t time.Time) time.Time {
	year, month, day := t.Date()

	return time.Date(year, month, day, 0, 0, 0, 0, time.UTC)
}

func newLotValued(l bonds.Lot, values *lotValues, unavailable string) lotValued {
	base := newLot(l)

	return lotValued{
		ID:                base.ID,
		Type:              base.Type,
		Maturity:          base.Maturity,
		PurchaseDate:      base.PurchaseDate,
		Rate:              base.Rate,
		UnitPrice:         base.UnitPrice,
		Quantity:          base.Quantity,
		Values:            values,
		ValuesUnavailable: unavailable,
	}
}

func newLot(l bonds.Lot) lot {
	return lot{
		ID:           l.ID,
		Type:         bondType(l.Bond.Type),
		Maturity:     l.Bond.Maturity.Format(time.DateOnly),
		PurchaseDate: l.PurchaseDate.Format(time.DateOnly),
		Rate:         l.Rate.String(),
		UnitPrice:    l.UnitPrice.String(),
		Quantity:     l.Quantity.String(),
	}
}

func newLotValues(v bonds.Valuation) lotValues {
	out := lotValues{
		On:       v.On.Format(time.DateOnly),
		Maturity: newLotAmount(v.Maturity),
		Coupons:  make([]lotCoupon, 0, len(v.Coupons)),
	}

	if v.Accrual != nil {
		out.Accrual = new(newLotAmount(*v.Accrual))
	}

	if v.Market != nil {
		out.Market = new(newLotAmount(*v.Market))
	}

	for _, c := range v.Coupons {
		amount := newLotAmount(c.Amount)

		out.Coupons = append(out.Coupons, lotCoupon{
			Date:        c.Date.Format(time.DateOnly),
			Paid:        !c.Date.After(v.On),
			Gross:       amount.Gross,
			IOF:         amount.IOF,
			IncomeTax:   amount.IncomeTax,
			CustodyFee:  amount.CustodyFee,
			Net:         amount.Net,
			ProjectedBy: amount.ProjectedBy,
		})
	}

	return out
}

func newLotAmount(a bonds.Amount) lotAmount {
	return lotAmount{
		Gross:       a.Gross.String(),
		IOF:         a.IOF.String(),
		IncomeTax:   a.IncomeTax.String(),
		CustodyFee:  a.CustodyFee.String(),
		Net:         a.Net.String(),
		ProjectedBy: projectedByOf(a.ProjectedBy),
	}
}
