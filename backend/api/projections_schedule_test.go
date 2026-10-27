package api_test

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/gringolito/debtwise/backend/marketdata/focus"
	"github.com/gringolito/debtwise/backend/marketdata/sgs"
)

// recordedFocus is a Focus client reading the Olinda responses recorded on 2017-06-30, which the
// focus package keeps in its testdata, from a server that answers each endpoint with its recording
// whatever the query asks for.
func recordedFocus(t *testing.T) *focus.Client {
	t.Helper()

	recordings := map[string]string{
		"/ExpectativasMercadoSelic":  "selic-2017-06-30.json",
		"/ExpectativaMercadoMensais": "ipca-monthly-2017-06-30.json",
		"/ExpectativasMercadoAnuais": "ipca-annual-2017-06-30.json",
	}

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		file, ok := recordings[r.URL.Path]
		if !ok {
			http.NotFound(w, r)

			return
		}

		body, err := os.ReadFile(filepath.Join("..", "marketdata", "focus", "testdata", file))
		if err != nil {
			t.Errorf("read recorded response: %v", err)
			w.WriteHeader(http.StatusInternalServerError)

			return
		}

		w.Header().Set("Content-Type", "application/json;odata.metadata=minimal")

		if _, err := w.Write(body); err != nil {
			t.Errorf("write response: %v", err)
		}
	}))
	t.Cleanup(server.Close)

	return focus.New(focus.WithBaseURL(server.URL))
}

// scheduleIndex is one index value of a scheduled installment, as the schedule answers it.
type scheduleIndex struct {
	Index       string        `json:"index"`
	Status      string        `json:"status"`
	Value       string        `json:"value"`
	PeriodStart string        `json:"period_start"`
	PeriodEnd   string        `json:"period_end"`
	Methods     []projectedBy `json:"methods"`
}

// scheduleRow is what the tests read of each installment of the schedule.
type scheduleRow struct {
	Number             int             `json:"number"`
	DueDate            string          `json:"due_date"`
	Correction         string          `json:"correction"`
	OutstandingBalance string          `json:"outstanding_balance"`
	IndexValues        []scheduleIndex `json:"index_values"`
}

func by(index, method string) projectedBy {
	return projectedBy{Index: index, Method: method}
}

// publishedIndex is a value the balance was corrected by as published, which names no method.
func publishedIndex(index, value, start, end string) scheduleIndex {
	return scheduleIndex{
		Index: index, Status: "published", Value: value, PeriodStart: start, PeriodEnd: end, Methods: []projectedBy{},
	}
}

func projectedIndex(index, value, start, end string, methods ...projectedBy) scheduleIndex {
	return scheduleIndex{
		Index: index, Status: "projected", Value: value, PeriodStart: start, PeriodEnd: end, Methods: methods,
	}
}

// schedule reads the registered mortgage's schedule.
func (s server) schedule(t *testing.T) []scheduleRow {
	t.Helper()

	body := do(t, s.handler, http.MethodGet, "/mortgage/schedule", "", http.StatusOK)

	var got struct {
		Installments []scheduleRow `json:"installments"`
	}
	require.NoError(t, json.Unmarshal([]byte(body), &got))

	return got.Installments
}

// indexedMortgage lends amount under SAC at 12% a year nominal, corrected by indexer, with no
// insurance or fee, so that the balances of its schedule come from its corrections alone.
func indexedMortgage(indexer, amount, contractDate, firstInstallmentDate string, termMonths int) string {
	return fmt.Sprintf(`{
		"contract_date": %[1]q, "original_amount": %[2]q, "term_months": %[3]d, "first_installment_date": %[4]q,
		"amortization_system": "sac", "indexer": %[5]q, "appraisal_value": "200000.00",
		"contract_rates": [{"effective_from": %[1]q, "rate": "0.12", "basis": "nominal"}],
		"mip_rates": [{"effective_from": %[1]q, "rate": "0"}],
		"dfi_rates": [{"effective_from": %[1]q, "rate": "0"}],
		"fees": [{"effective_from": %[1]q, "amount": "0.00"}]
	}`, contractDate, amount, termMonths, firstInstallmentDate, indexer)
}

func observation(start, value string) sgs.Observation {
	return sgs.Observation{Start: mustDate(start), Value: mustDecimal(value)}
}

// monthObservation is a value SGS publishes for the month that runs from start to the 1st of the
// next.
func monthObservation(start, value string) sgs.Observation {
	first := mustDate(start)

	return sgs.Observation{Start: first, End: first.AddDate(0, 1, 0), Value: mustDecimal(value)}
}

// SGS series 226's TR for the 12 months before 2017-07-01, each period from the 1st to the 1st,
// and series 432's Selic target on the days the schedule below reads. SGS had published the target
// up to 2017-07-26, the day before the Copom's decision took effect.
func sgsOf2017() *fakeSGS {
	return sgsWithRows(map[int][]sgs.Observation{
		226: {
			monthObservation("2016-07-01", "0.1621"),
			monthObservation("2016-08-01", "0.2545"),
			monthObservation("2016-09-01", "0.1575"),
			monthObservation("2016-10-01", "0.1601"),
			monthObservation("2016-11-01", "0.1428"),
			monthObservation("2016-12-01", "0.1849"),
			monthObservation("2017-01-01", "0.1700"),
			monthObservation("2017-02-01", "0.0302"),
			monthObservation("2017-03-01", "0.1519"),
			monthObservation("2017-04-01", "0.0000"),
			monthObservation("2017-05-01", "0.0764"),
			monthObservation("2017-06-01", "0.0536"),
		},
		432: {
			observation("2017-03-01", "12.25"),
			observation("2017-04-01", "12.25"),
			observation("2017-05-01", "11.25"),
			observation("2017-06-01", "10.25"),
			observation("2017-06-29", "10.25"),
			observation("2017-06-30", "10.25"),
			observation("2017-07-01", "10.25"),
			observation("2017-07-26", "10.25"),
		},
		// SGS series 433's IPCA of the months published by 2017-06-30, which the schedule reads.
		433: {
			observation("2016-12-01", "0.30"),
			observation("2017-01-01", "0.38"),
			observation("2017-02-01", "0.33"),
			observation("2017-03-01", "0.25"),
			observation("2017-04-01", "0.14"),
			observation("2017-05-01", "0.31"),
		},
	})
}

// newServerOn2017June30 serves the API on 2017-06-30, the day of the recorded Focus survey, after a
// refresh on that day.
func newServerOn2017June30(t *testing.T) server {
	t.Helper()

	today := date(2017, time.June, 30)
	s := newServer(t, sgsOf2017(), quotingRadar(), withFocus(recordedFocus(t)), onDay(today))
	require.NoError(t, s.job.Refresh(t.Context(), today))

	return s
}

// A poupança-indexed mortgage signed on 2017-03-01 with its installments on the 1st is corrected
// by the yield of the month before each installment. Today is 2017-06-30, so the 1st to the 3rd
// installments are past, and the 4th, due 2017-07-01, is corrected by the yield of June, whose TR
// and Selic target SGS has published: all five of them are published. The yield of July needs a TR
// that is not published: its trailing 12 months average (1.5440 / 12 = 0.1287) is projected. The
// Selic target of 2017-07-01 is still published (10.25), and of the days after 2017-07-26 it is the
// Focus median of the latest meeting in effect: R5/2017's 9.50 from 2017-07-27, R6's 8.75 from
// 2017-09-08, R7's 8.50 from 2017-10-26 and R8's 8.50 from 2017-12-07. While it is above 8.5 the
// yield is the TR with 0.5% a month (0.1287 and 0.5 give 0.6293), from then on the TR with 70% of
// the target (8.5 gives 0.4828 a month, so 0.6121). The figures were worked out independently with
// python's decimal.
func TestPoupancaIndexedScheduleFollowsTheFocusSelicPath(t *testing.T) {
	t.Parallel()

	s := newServerOn2017June30(t)
	do(t, s.handler, http.MethodPut, "/mortgage",
		indexedMortgage("poupanca_yield", "50000.00", "2017-03-01", "2017-04-01", 10), http.StatusOK)

	assert.Equal(t, []scheduleRow{
		{1, "2017-04-01", "326.35", "45293.71", []scheduleIndex{publishedIndex("poupanca_yield", "0.6527", "2017-03-01", "2017-04-01")}},
		{2, "2017-05-01", "226.47", "40462.38", []scheduleIndex{publishedIndex("poupanca_yield", "0.5000", "2017-04-01", "2017-05-01")}},
		{3, "2017-06-01", "233.39", "35608.80", []scheduleIndex{publishedIndex("poupanca_yield", "0.5768", "2017-05-01", "2017-06-01")}},
		{4, "2017-07-01", "197.24", "30690.89", []scheduleIndex{publishedIndex("poupanca_yield", "0.5539", "2017-06-01", "2017-07-01")}},
		{5, "2017-08-01", "193.14", "25736.69", []scheduleIndex{projectedIndex("poupanca_yield", "0.6293", "2017-07-01", "2017-08-01", by("tr", "trailing_12"))}},
		{6, "2017-09-01", "161.96", "20718.92", []scheduleIndex{projectedIndex("poupanca_yield", "0.6293", "2017-08-01", "2017-09-01", by("tr", "trailing_12"), by("selic_target", "focus"))}},
		{7, "2017-10-01", "130.38", "15636.97", []scheduleIndex{projectedIndex("poupanca_yield", "0.6293", "2017-09-01", "2017-10-01", by("tr", "trailing_12"), by("selic_target", "focus"))}},
		{8, "2017-11-01", "98.40", "10490.25", []scheduleIndex{projectedIndex("poupanca_yield", "0.6293", "2017-10-01", "2017-11-01", by("tr", "trailing_12"), by("selic_target", "focus"))}},
		{9, "2017-12-01", "64.21", "5277.23", []scheduleIndex{projectedIndex("poupanca_yield", "0.6121", "2017-11-01", "2017-12-01", by("tr", "trailing_12"), by("selic_target", "focus"))}},
		{10, "2018-01-01", "32.30", "0.00", []scheduleIndex{projectedIndex("poupanca_yield", "0.6121", "2017-12-01", "2018-01-01", by("tr", "trailing_12"), by("selic_target", "focus"))}},
	}, s.schedule(t))

	// On the wire, a published value lists no methods, and a projected one the methods it comes from.
	var wire struct {
		Installments []json.RawMessage `json:"installments"`
	}

	require.NoError(t, json.Unmarshal([]byte(do(t, s.handler, http.MethodGet, "/mortgage/schedule", "", http.StatusOK)), &wire))
	require.Len(t, wire.Installments, 10)
	assert.JSONEq(t, `{"number": 4, "due_date": "2017-07-01", "correction": "197.24",
		"index_values": [{"index": "poupanca_yield", "status": "published", "value": "0.5539",
		                  "period_start": "2017-06-01", "period_end": "2017-07-01", "methods": []}],
		"interest": "358.06", "amortization": "5115.15", "mip": "0.00", "dfi": "0.00", "fee": "0.00",
		"amount": "5473.21", "prepaid": "0.00", "outstanding_balance": "30690.89"}`, string(wire.Installments[3]))
	assert.JSONEq(t, `{"number": 5, "due_date": "2017-08-01", "correction": "193.14",
		"index_values": [{"index": "poupanca_yield", "status": "projected", "value": "0.6293",
		                  "period_start": "2017-07-01", "period_end": "2017-08-01",
		                  "methods": [{"index": "tr", "method": "trailing_12"}]}],
		"interest": "308.84", "amortization": "5147.34", "mip": "0.00", "dfi": "0.00", "fee": "0.00",
		"amount": "5456.18", "prepaid": "0.00", "outstanding_balance": "25736.69"}`, string(wire.Installments[4]))
}

// An IPCA-indexed mortgage signed on 2017-01-10 is corrected on each anniversary by the IPCA of
// the second month before it. Today is 2017-06-30: the installments to 2017-06-10 are past, and
// the one of 2017-07-10, reading May, is corrected by a published value; the later ones by the
// Focus median of their month, from June 2017 to November 2018 (read by the installment of
// 2019-01-10), and then by the annual median of the month's year spread over its months, the
// monthly equivalent of 4.25% (0.3474) for 2018 and 2019, and of 4.00% (0.3274) for 2020.
// Figures worked out independently with python's decimal.
func TestIPCAIndexedScheduleFollowsTheFocusIPCAPath(t *testing.T) {
	t.Parallel()

	s := newServerOn2017June30(t)
	do(t, s.handler, http.MethodPut, "/mortgage",
		indexedMortgage("ipca", "100000.00", "2017-01-10", "2017-02-10", 38), http.StatusOK)

	assert.Equal(t, []scheduleRow{
		{1, "2017-02-10", "300.00", "97660.53", []scheduleIndex{publishedIndex("ipca", "0.30", "2016-12-01", "2016-12-01")}},
		{2, "2017-03-10", "371.11", "95382.14", []scheduleIndex{publishedIndex("ipca", "0.38", "2017-01-01", "2017-01-01")}},
		{3, "2017-04-10", "314.76", "93038.65", []scheduleIndex{publishedIndex("ipca", "0.33", "2017-02-01", "2017-02-01")}},
		{4, "2017-05-10", "232.60", "90606.36", []scheduleIndex{publishedIndex("ipca", "0.25", "2017-03-01", "2017-03-01")}},
		{5, "2017-06-10", "126.85", "88064.59", []scheduleIndex{publishedIndex("ipca", "0.14", "2017-04-01", "2017-04-01")}},
		{6, "2017-07-10", "273.00", "85660.69", []scheduleIndex{publishedIndex("ipca", "0.31", "2017-05-01", "2017-05-01")}},
		{7, "2017-08-10", "-128.49", "82859.32", []scheduleIndex{projectedIndex("ipca", "-0.1500", "2017-06-01", "2017-06-01", by("ipca", "focus"))}},
		{8, "2017-09-10", "149.15", "80330.78", []scheduleIndex{projectedIndex("ipca", "0.1800", "2017-07-01", "2017-07-01", by("ipca", "focus"))}},
		{9, "2017-10-10", "200.83", "77847.22", []scheduleIndex{projectedIndex("ipca", "0.2500", "2017-08-01", "2017-08-01", by("ipca", "focus"))}},
		{10, "2017-11-10", "256.90", "75410.87", []scheduleIndex{projectedIndex("ipca", "0.3300", "2017-09-01", "2017-09-01", by("ipca", "focus"))}},
		{11, "2017-12-10", "301.64", "73008.49", []scheduleIndex{projectedIndex("ipca", "0.4000", "2017-10-01", "2017-10-01", by("ipca", "focus"))}},
		{12, "2018-01-10", "321.24", "70613.81", []scheduleIndex{projectedIndex("ipca", "0.4400", "2017-11-01", "2017-11-01", by("ipca", "focus"))}},
		{13, "2018-02-10", "367.19", "68250.96", []scheduleIndex{projectedIndex("ipca", "0.5200", "2017-12-01", "2017-12-01", by("ipca", "focus"))}},
		{14, "2018-03-10", "361.73", "65868.18", []scheduleIndex{projectedIndex("ipca", "0.5300", "2018-01-01", "2018-01-01", by("ipca", "focus"))}},
		{15, "2018-04-10", "316.17", "63426.67", []scheduleIndex{projectedIndex("ipca", "0.4800", "2018-02-01", "2018-02-01", by("ipca", "focus"))}},
		{16, "2018-05-10", "234.68", "60893.47", []scheduleIndex{projectedIndex("ipca", "0.3700", "2018-03-01", "2018-03-01", by("ipca", "focus"))}},
		{17, "2018-06-10", "243.57", "58358.08", []scheduleIndex{projectedIndex("ipca", "0.4000", "2018-04-01", "2018-04-01", by("ipca", "focus"))}},
		{18, "2018-07-10", "180.91", "55751.42", []scheduleIndex{projectedIndex("ipca", "0.3100", "2018-05-01", "2018-05-01", by("ipca", "focus"))}},
		{19, "2018-08-10", "111.50", "53069.77", []scheduleIndex{projectedIndex("ipca", "0.2000", "2018-06-01", "2018-06-01", by("ipca", "focus"))}},
		{20, "2018-09-10", "100.83", "50372.15", []scheduleIndex{projectedIndex("ipca", "0.1900", "2018-07-01", "2018-07-01", by("ipca", "focus"))}},
		{21, "2018-10-10", "100.74", "47668.84", []scheduleIndex{projectedIndex("ipca", "0.2000", "2018-08-01", "2018-08-01", by("ipca", "focus"))}},
		{22, "2018-11-10", "133.47", "44990.41", []scheduleIndex{projectedIndex("ipca", "0.2800", "2018-09-01", "2018-09-01", by("ipca", "focus"))}},
		{23, "2018-12-10", "166.46", "42334.57", []scheduleIndex{projectedIndex("ipca", "0.3700", "2018-10-01", "2018-10-01", by("ipca", "focus"))}},
		{24, "2019-01-10", "169.34", "39670.32", []scheduleIndex{projectedIndex("ipca", "0.4000", "2018-11-01", "2018-11-01", by("ipca", "focus"))}},
		{25, "2019-02-10", "137.81", "36964.69", []scheduleIndex{projectedIndex("ipca", "0.3474", "2018-12-01", "2018-12-01", by("ipca", "focus"))}},
		{26, "2019-03-10", "128.42", "34239.79", []scheduleIndex{projectedIndex("ipca", "0.3474", "2019-01-01", "2019-01-01", by("ipca", "focus"))}},
		{27, "2019-04-10", "118.95", "31495.51", []scheduleIndex{projectedIndex("ipca", "0.3474", "2019-02-01", "2019-02-01", by("ipca", "focus"))}},
		{28, "2019-05-10", "109.42", "28731.75", []scheduleIndex{projectedIndex("ipca", "0.3474", "2019-03-01", "2019-03-01", by("ipca", "focus"))}},
		{29, "2019-06-10", "99.81", "25948.40", []scheduleIndex{projectedIndex("ipca", "0.3474", "2019-04-01", "2019-04-01", by("ipca", "focus"))}},
		{30, "2019-07-10", "90.14", "23145.37", []scheduleIndex{projectedIndex("ipca", "0.3474", "2019-05-01", "2019-05-01", by("ipca", "focus"))}},
		{31, "2019-08-10", "80.41", "20322.56", []scheduleIndex{projectedIndex("ipca", "0.3474", "2019-06-01", "2019-06-01", by("ipca", "focus"))}},
		{32, "2019-09-10", "70.60", "17479.85", []scheduleIndex{projectedIndex("ipca", "0.3474", "2019-07-01", "2019-07-01", by("ipca", "focus"))}},
		{33, "2019-10-10", "60.72", "14617.14", []scheduleIndex{projectedIndex("ipca", "0.3474", "2019-08-01", "2019-08-01", by("ipca", "focus"))}},
		{34, "2019-11-10", "50.78", "11734.34", []scheduleIndex{projectedIndex("ipca", "0.3474", "2019-09-01", "2019-09-01", by("ipca", "focus"))}},
		{35, "2019-12-10", "40.77", "8831.33", []scheduleIndex{projectedIndex("ipca", "0.3474", "2019-10-01", "2019-10-01", by("ipca", "focus"))}},
		{36, "2020-01-10", "30.68", "5908.01", []scheduleIndex{projectedIndex("ipca", "0.3474", "2019-11-01", "2019-11-01", by("ipca", "focus"))}},
		{37, "2020-02-10", "20.52", "2964.26", []scheduleIndex{projectedIndex("ipca", "0.3474", "2019-12-01", "2019-12-01", by("ipca", "focus"))}},
		{38, "2020-03-10", "9.70", "0.00", []scheduleIndex{projectedIndex("ipca", "0.3274", "2020-01-01", "2020-01-01", by("ipca", "focus"))}},
	}, s.schedule(t))
}

// A TR-indexed mortgage signed on 2026-06-01 has its 4 first installments past on 2026-10-15 and
// is corrected by the published TR of each (0.0250). The other 4 are corrected by the TR of the
// months from October 2026, which no one has published: the average of the latest 12 months
// published ((6 * 0.0150 + 6 * 0.0250) / 12 = 0.0200) by default, or of the latest 60 months
// ((48 * 0.0100 + 6 * 0.0150 + 6 * 0.0250) / 60 = 0.0120) once chosen. The figures were worked out
// independently with python's decimal.
func TestChangingTheProjectionMethodChangesTheFutureInstallments(t *testing.T) {
	t.Parallel()

	s := newServer(t, sgsWithRows(map[int][]sgs.Observation{226: monthlyTR()}), quotingRadar(),
		onDay(date(2026, time.October, 15)))
	do(t, s.handler, http.MethodPut, "/mortgage",
		indexedMortgage("tr", "60000.00", "2026-06-01", "2026-07-01", 8), http.StatusOK)

	assert.Equal(t, []scheduleRow{
		{1, "2026-07-01", "15.00", "52513.12", []scheduleIndex{publishedIndex("tr", "0.0250", "2026-06-01", "2026-07-01")}},
		{2, "2026-08-01", "13.13", "45022.50", []scheduleIndex{publishedIndex("tr", "0.0250", "2026-07-01", "2026-08-01")}},
		{3, "2026-09-01", "11.26", "37528.13", []scheduleIndex{publishedIndex("tr", "0.0250", "2026-08-01", "2026-09-01")}},
		{4, "2026-10-01", "9.38", "30030.01", []scheduleIndex{publishedIndex("tr", "0.0250", "2026-09-01", "2026-10-01")}},
		{5, "2026-11-01", "6.01", "22527.01", []scheduleIndex{projectedIndex("tr", "0.0200", "2026-10-01", "2026-11-01", by("tr", "trailing_12"))}},
		{6, "2026-12-01", "4.51", "15021.01", []scheduleIndex{projectedIndex("tr", "0.0200", "2026-11-01", "2026-12-01", by("tr", "trailing_12"))}},
		{7, "2027-01-01", "3.00", "7512.00", []scheduleIndex{projectedIndex("tr", "0.0200", "2026-12-01", "2027-01-01", by("tr", "trailing_12"))}},
		{8, "2027-02-01", "1.50", "0.00", []scheduleIndex{projectedIndex("tr", "0.0200", "2027-01-01", "2027-02-01", by("tr", "trailing_12"))}},
	}, s.schedule(t), "projected by the trailing 12 months, the default")

	rec := s.chooseMethod(t, "tr", "trailing_60")
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())

	assert.Equal(t, []scheduleRow{
		{1, "2026-07-01", "15.00", "52513.12", []scheduleIndex{publishedIndex("tr", "0.0250", "2026-06-01", "2026-07-01")}},
		{2, "2026-08-01", "13.13", "45022.50", []scheduleIndex{publishedIndex("tr", "0.0250", "2026-07-01", "2026-08-01")}},
		{3, "2026-09-01", "11.26", "37528.13", []scheduleIndex{publishedIndex("tr", "0.0250", "2026-08-01", "2026-09-01")}},
		{4, "2026-10-01", "9.38", "30030.01", []scheduleIndex{publishedIndex("tr", "0.0250", "2026-09-01", "2026-10-01")}},
		{5, "2026-11-01", "3.60", "22525.21", []scheduleIndex{projectedIndex("tr", "0.0120", "2026-10-01", "2026-11-01", by("tr", "trailing_60"))}},
		{6, "2026-12-01", "2.70", "15018.61", []scheduleIndex{projectedIndex("tr", "0.0120", "2026-11-01", "2026-12-01", by("tr", "trailing_60"))}},
		{7, "2027-01-01", "1.80", "7510.20", []scheduleIndex{projectedIndex("tr", "0.0120", "2026-12-01", "2027-01-01", by("tr", "trailing_60"))}},
		{8, "2027-02-01", "0.90", "0.00", []scheduleIndex{projectedIndex("tr", "0.0120", "2027-01-01", "2027-02-01", by("tr", "trailing_60"))}},
	}, s.schedule(t), "projected by the trailing 60 months")
}

// A statement is compared with the balance the schedule computes on the clock's today. An
// installment that is due by it is corrected by published values only, so on 2026-12-15 the
// installments of 2026-11-01 and 2026-12-01 are left uncorrected, as no TR is published for their
// months, while on 2026-10-15 the projected TR corrects them. The mortgage is the one of
// TestChangingTheProjectionMethodChangesTheFutureInstallments, with 15,021.01 owed after the
// 6th installment when projected and 15,015.01 when uncorrected.
func TestStatementDriftsReadTheClock(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name  string
		today time.Time
		want  string
	}{
		{
			name:  "installments that are not due yet are projected",
			today: date(2026, time.October, 15),
			want:  `"computed_balance": "15021.01", "drift": "4978.99"`,
		},
		{
			name:  "installments due by today are not",
			today: date(2026, time.December, 15),
			want:  `"computed_balance": "15015.01", "drift": "4984.99"`,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			s := newServer(t, sgsWithRows(map[int][]sgs.Observation{226: monthlyTR()}), quotingRadar(), onDay(tt.today))
			do(t, s.handler, http.MethodPut, "/mortgage",
				indexedMortgage("tr", "60000.00", "2026-06-01", "2026-07-01", 8), http.StatusOK)
			do(t, s.handler, http.MethodPost, "/mortgage/statements",
				`{"date": "2026-12-20", "outstanding_balance": "20000.00"}`, http.StatusCreated)

			assert.JSONEq(t, `{"statements": [{"id": 1, "date": "2026-12-20", "outstanding_balance": "20000.00", `+
				tt.want+`}]}`, do(t, s.handler, http.MethodGet, "/mortgage/statements", "", http.StatusOK))
		})
	}
}

// The market-data status judges freshness at the clock's time: the refresh at startup is more than
// 48 hours before it.
func TestMarketDataStatusReadsTheClock(t *testing.T) {
	t.Parallel()

	s := newServer(t, sgsWithRows(nil), quotingRadar(), onDay(time.Now().Add(72*time.Hour)))

	status := s.status(t)
	require.Len(t, status.Indexes, 6)

	for _, index := range status.Indexes {
		assert.Equal(t, "stale", index.Status, index.Index)
	}

	assert.Equal(t, "stale", status.Bonds.Status, "bonds")
	assert.Equal(t, "stale", status.Focus.Status, "focus")
}
