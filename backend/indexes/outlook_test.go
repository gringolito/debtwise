package indexes_test

import (
	"bytes"
	"encoding/csv"
	"os"
	"slices"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/gringolito/debtwise/backend/decimal"
	"github.com/gringolito/debtwise/backend/indexes"
)

// estimateView is an estimate with its value as text, which compares by its places.
type estimateView struct {
	Value   string
	Methods []indexes.ProjectionMethod
}

func viewOf(e indexes.Estimate) estimateView {
	return estimateView{Value: e.Value.String(), Methods: e.Methods}
}

// pathView is a path value with its period as dates and its value as text.
type pathView struct {
	Start, End string
	estimateView
}

func pathViews(path []indexes.PathValue) []pathView {
	if len(path) == 0 {
		return nil
	}

	views := make([]pathView, 0, len(path))
	for _, p := range path {
		views = append(views, pathView{
			Start:        p.PeriodStart.Format(time.DateOnly),
			End:          p.PeriodEnd.Format(time.DateOnly),
			estimateView: viewOf(p.Estimate),
		})
	}

	return views
}

func utcDate(t *testing.T, s string) time.Time {
	t.Helper()

	day, err := time.Parse(time.DateOnly, s)
	require.NoError(t, err)

	return day
}

// loadSGS reads a recorded SGS series from testdata: the period start, period end and value of
// each row, as SGS publishes them.
func loadSGS(t *testing.T, name string) []indexes.Value {
	t.Helper()

	root, err := os.OpenRoot("testdata")
	require.NoError(t, err)

	defer func() { _ = root.Close() }()

	data, err := root.ReadFile(name)
	require.NoError(t, err)

	records, err := csv.NewReader(bytes.NewReader(data)).ReadAll()
	require.NoError(t, err)
	require.NotEmpty(t, records)

	values := make([]indexes.Value, 0, len(records)-1)
	for _, record := range records[1:] {
		values = append(values, indexes.Value{
			PeriodStart: utcDate(t, record[0]),
			PeriodEnd:   utcDate(t, record[1]),
			Value:       percent(t, record[2]),
		})
	}

	return values
}

// monthlyValues returns one value per month from first on, each from the 1st of the month to the
// 1st of the next, or on the 1st alone when single is set.
func monthlyValues(t *testing.T, first string, single bool, values ...string) []indexes.Value {
	t.Helper()

	start := utcDate(t, first)

	out := make([]indexes.Value, 0, len(values))
	for i, v := range values {
		from := start.AddDate(0, i, 0)

		to := from.AddDate(0, 1, 0)
		if single {
			to = from
		}

		out = append(out, indexes.Value{PeriodStart: from, PeriodEnd: to, Value: percent(t, v)})
	}

	return out
}

func only(index indexes.Index, method indexes.Method) []indexes.ProjectionMethod {
	return []indexes.ProjectionMethod{{Index: index, Method: method}}
}

// The expected averages are the means of the latest 12 and 60 monthly values of the recorded
// series, from 2017-01 to 2025-12, worked out with Python's decimal module and rounded at 4 places
// half to even. The recorded TR also holds rows that aren't a month from the 1st to the 1st of
// the next, which a trailing average must ignore.
func TestOutlookTrailingAverageOfRecordedHistory(t *testing.T) {
	t.Parallel()

	trHistory := loadSGS(t, "tr_sgs226.csv")
	ipcaHistory := loadSGS(t, "ipca_sgs433.csv")

	tests := []struct {
		name   string
		index  indexes.Index
		method indexes.Method
		want   string
		lookup func(indexes.Outlook) (indexes.Estimate, bool)
	}{
		{
			name: "TR over 12 months", index: indexes.TR, method: indexes.Trailing12, want: "0.1630",
			lookup: func(o indexes.Outlook) (indexes.Estimate, bool) {
				return o.TR(utcDate(t, "2026-01-01"), utcDate(t, "2026-02-01"))
			},
		},
		{
			name: "TR over 60 months", index: indexes.TR, method: indexes.Trailing60, want: "0.1030",
			lookup: func(o indexes.Outlook) (indexes.Estimate, bool) {
				return o.TR(utcDate(t, "2026-01-01"), utcDate(t, "2026-02-01"))
			},
		},
		{
			name: "TR for a period years later", index: indexes.TR, method: indexes.Trailing12, want: "0.1630",
			lookup: func(o indexes.Outlook) (indexes.Estimate, bool) {
				return o.TR(utcDate(t, "2031-07-01"), utcDate(t, "2031-08-01"))
			},
		},
		{
			name: "TR for a period that shares its start with published ones", index: indexes.TR,
			method: indexes.Trailing12, want: "0.1630",
			lookup: func(o indexes.Outlook) (indexes.Estimate, bool) {
				return o.TR(utcDate(t, "2025-12-01"), utcDate(t, "2025-12-15"))
			},
		},
		{
			name: "IPCA over 12 months", index: indexes.IPCA, method: indexes.Trailing12, want: "0.3492",
			lookup: func(o indexes.Outlook) (indexes.Estimate, bool) {
				return o.IPCA(utcDate(t, "2026-01-01"))
			},
		},
		{
			name: "IPCA over 60 months", index: indexes.IPCA, method: indexes.Trailing60, want: "0.4790",
			lookup: func(o indexes.Outlook) (indexes.Estimate, bool) {
				return o.IPCA(utcDate(t, "2026-01-01"))
			},
		},
		{
			name: "IPCA for a month years later", index: indexes.IPCA, method: indexes.Trailing60, want: "0.4790",
			lookup: func(o indexes.Outlook) (indexes.Estimate, bool) {
				return o.IPCA(utcDate(t, "2030-03-01"))
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			outlook := indexes.NewOutlook(
				map[indexes.Index][]indexes.Value{indexes.TR: trHistory, indexes.IPCA: ipcaHistory},
				indexes.Expectations{},
				only(tt.index, tt.method),
			)

			got, ok := tt.lookup(outlook)
			require.True(t, ok)
			assert.Equal(t, estimateView{Value: tt.want, Methods: only(tt.index, tt.method)}, viewOf(got))
		})
	}
}

// Month i of the Selic history has the target 5.00 + 0.25 i, from 2018-01: its latest 12 months
// average 20.875 and its latest 60 average 14.875.
func TestOutlookSelicTargetTrailingAverage(t *testing.T) {
	t.Parallel()

	targets := make([]string, 0, 70)

	for i := range 70 {
		targets = append(targets, decimal.FromInt(int64(i)).Mul(percent(t, "0.25")).Add(percent(t, "5")).String())
	}

	// A target on another day of a month is not a monthly value, and the history comes in any order.
	history := append(monthlyValues(t, "2018-01-01", true, targets...),
		indexes.Value{
			PeriodStart: utcDate(t, "2022-03-17"), PeriodEnd: utcDate(t, "2022-03-17"), Value: percent(t, "99"),
		},
		indexes.Value{
			PeriodStart: utcDate(t, "2025-12-03"), PeriodEnd: utcDate(t, "2025-12-03"), Value: percent(t, "1"),
		},
	)
	slices.Reverse(history)

	tests := []struct {
		name    string
		history []indexes.Value
		method  indexes.Method
		want    string
		wantOK  bool
	}{
		{name: "latest 12 months", history: history, method: indexes.Trailing12, want: "20.8750", wantOK: true},
		{name: "latest 60 months", history: history, method: indexes.Trailing60, want: "14.8750", wantOK: true},
		{
			name: "exactly 12 months", history: monthlyValues(t, "2018-01-01", true, targets[:12]...),
			method: indexes.Trailing12, want: "6.3750", wantOK: true,
		},
		{
			name: "11 months are too few for 12", history: monthlyValues(t, "2018-01-01", true, targets[:11]...),
			method: indexes.Trailing12,
		},
		{
			name: "59 months are too few for 60", history: monthlyValues(t, "2018-01-01", true, targets[:59]...),
			method: indexes.Trailing60,
		},
		{name: "no history", method: indexes.Trailing12},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			outlook := indexes.NewOutlook(
				map[indexes.Index][]indexes.Value{indexes.SelicTarget: tt.history},
				indexes.Expectations{},
				only(indexes.SelicTarget, tt.method),
			)

			got, ok := outlook.SelicTarget(utcDate(t, "2031-01-01"))
			require.Equal(t, tt.wantOK, ok)

			if tt.wantOK {
				assert.Equal(t, estimateView{Value: tt.want, Methods: only(indexes.SelicTarget, tt.method)}, viewOf(got))
			}
		})
	}
}

func TestOutlookWithFewerThanTheMonthsOfAnAverageProjectsNothing(t *testing.T) {
	t.Parallel()

	history := map[indexes.Index][]indexes.Value{
		indexes.TR:   monthlyValues(t, "2025-01-01", false, "0.10", "0.11", "0.12", "0.13", "0.14", "0.15", "0.16", "0.17", "0.18", "0.19", "0.20"),
		indexes.IPCA: monthlyValues(t, "2025-01-01", true, "0.10", "0.11"),
	}
	outlook := indexes.NewOutlook(history, indexes.Expectations{}, only(indexes.IPCA, indexes.Trailing12))

	_, ok := outlook.TR(utcDate(t, "2026-01-01"), utcDate(t, "2026-02-01"))
	assert.False(t, ok, "11 TR months, trailing 12 by default")

	_, ok = outlook.IPCA(utcDate(t, "2026-01-01"))
	assert.False(t, ok)
}

func TestOutlookProjectsByTheDefaultMethodOfAnIndexWithNoneChosen(t *testing.T) {
	t.Parallel()

	history := map[indexes.Index][]indexes.Value{
		indexes.TR:   monthlyValues(t, "2025-01-01", false, "0.10", "0.10", "0.10", "0.10", "0.10", "0.10", "0.20", "0.20", "0.20", "0.20", "0.20", "0.20"),
		indexes.IPCA: monthlyValues(t, "2025-09-01", true, "0.30"),
	}
	expectations := indexes.Expectations{
		Selic:       []indexes.MeetingMedian{{Year: 2026, Number: 1, Median: percent(t, "10.50")}},
		MonthlyIPCA: []indexes.MonthMedian{{Month: utcDate(t, "2026-01-01"), Median: percent(t, "0.45")}},
	}

	tests := []struct {
		name    string
		methods []indexes.ProjectionMethod
		wantTR  estimateView
		wantSel estimateView
		wantIPC estimateView
	}{
		{
			name:    "no methods chosen",
			wantTR:  estimateView{Value: "0.1500", Methods: only(indexes.TR, indexes.Trailing12)},
			wantSel: estimateView{Value: "10.50", Methods: only(indexes.SelicTarget, indexes.Focus)},
			wantIPC: estimateView{Value: "0.45", Methods: only(indexes.IPCA, indexes.Focus)},
		},
		{
			name:    "an index missing from the methods keeps its default",
			methods: only(indexes.IPCA, indexes.Trailing12),
			wantTR:  estimateView{Value: "0.1500", Methods: only(indexes.TR, indexes.Trailing12)},
			wantSel: estimateView{Value: "10.50", Methods: only(indexes.SelicTarget, indexes.Focus)},
			wantIPC: estimateView{},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			outlook := indexes.NewOutlook(history, expectations, tt.methods)

			tr, trOK := outlook.TR(utcDate(t, "2026-02-01"), utcDate(t, "2026-03-01"))
			sel, selOK := outlook.SelicTarget(utcDate(t, "2026-02-10"))
			ipca, ipcaOK := outlook.IPCA(utcDate(t, "2026-01-01"))

			assert.True(t, trOK)
			assert.Equal(t, tt.wantTR, viewOf(tr))
			assert.True(t, selOK)
			assert.Equal(t, tt.wantSel, viewOf(sel))
			assert.Equal(t, tt.wantIPC.Value != "", ipcaOK)

			if ipcaOK {
				assert.Equal(t, tt.wantIPC, viewOf(ipca))
			}
		})
	}
}

func TestOutlookPublishedValueBeatsTheProjection(t *testing.T) {
	t.Parallel()

	history := map[indexes.Index][]indexes.Value{
		indexes.TR: append(
			monthlyValues(t, "2025-01-01", false, "0.10", "0.10", "0.10", "0.10", "0.10", "0.10", "0.20", "0.20", "0.20", "0.20", "0.20", "0.20"),
			indexes.Value{PeriodStart: utcDate(t, "2026-02-01"), PeriodEnd: utcDate(t, "2026-02-15"), Value: percent(t, "0.9000")},
		),
		indexes.SelicTarget: {
			{PeriodStart: utcDate(t, "2026-02-04"), PeriodEnd: utcDate(t, "2026-02-04"), Value: percent(t, "12.25")},
		},
		indexes.IPCA: monthlyValues(t, "2026-02-01", true, "0.70"),
	}
	expectations := indexes.Expectations{
		Selic:       []indexes.MeetingMedian{{Year: 2026, Number: 1, Median: percent(t, "10.50")}},
		MonthlyIPCA: []indexes.MonthMedian{{Month: utcDate(t, "2026-02-01"), Median: percent(t, "0.45")}},
	}
	outlook := indexes.NewOutlook(history, expectations, nil)

	t.Run("TR of exactly the published period", func(t *testing.T) {
		t.Parallel()

		got, ok := outlook.TR(utcDate(t, "2026-02-01"), utcDate(t, "2026-02-15"))
		require.True(t, ok)
		assert.Equal(t, estimateView{Value: "0.9000"}, viewOf(got))
		assert.False(t, got.Projected())
	})

	t.Run("TR of a period that only shares the start is projected", func(t *testing.T) {
		t.Parallel()

		got, ok := outlook.TR(utcDate(t, "2026-02-01"), utcDate(t, "2026-03-01"))
		require.True(t, ok)
		assert.Equal(t, estimateView{Value: "0.1500", Methods: only(indexes.TR, indexes.Trailing12)}, viewOf(got))
		assert.True(t, got.Projected())
	})

	t.Run("Selic target of the published day", func(t *testing.T) {
		t.Parallel()

		got, ok := outlook.SelicTarget(utcDate(t, "2026-02-04"))
		require.True(t, ok)
		assert.Equal(t, estimateView{Value: "12.25"}, viewOf(got))
	})

	t.Run("IPCA of the published month", func(t *testing.T) {
		t.Parallel()

		got, ok := outlook.IPCA(utcDate(t, "2026-02-01"))
		require.True(t, ok)
		assert.Equal(t, estimateView{Value: "0.70"}, viewOf(got))
	})
}

func TestZeroOutlookHasNothingPublishedOrProjected(t *testing.T) {
	t.Parallel()

	var outlook indexes.Outlook

	_, ok := outlook.TR(utcDate(t, "2026-02-01"), utcDate(t, "2026-03-01"))
	assert.False(t, ok)

	_, ok = outlook.SelicTarget(utcDate(t, "2026-02-01"))
	assert.False(t, ok)

	_, ok = outlook.IPCA(utcDate(t, "2026-02-01"))
	assert.False(t, ok)

	_, ok = outlook.PoupancaYield(utcDate(t, "2026-02-01"), utcDate(t, "2026-03-01"))
	assert.False(t, ok)

	for _, index := range indexes.Projected() {
		assert.Empty(t, outlook.Path(index, 3), index)
	}
}

// Meetings 6 to 8 of 2017 decided on 09-06, 10-25 and 12-06. A median takes effect on the business
// day after: 09-07 is a holiday, so the first takes effect on 09-08. The latest published target
// holds before it. 2028 isn't in the Copom calendar, so its meetings take the days of 2027's:
// 01-27 and 03-17, a Thursday and a Friday, which take effect on the 28th and on Monday 03-20.
func TestOutlookFocusSelicTargetStepsOnTheEffectiveDays(t *testing.T) {
	t.Parallel()

	published := []indexes.Value{
		{PeriodStart: utcDate(t, "2017-07-27"), PeriodEnd: utcDate(t, "2017-07-27"), Value: percent(t, "9.25")},
		{PeriodStart: utcDate(t, "2017-05-31"), PeriodEnd: utcDate(t, "2017-05-31"), Value: percent(t, "10.25")},
	}
	// Out of meeting order, and with meetings the calendar doesn't have.
	medians := []indexes.MeetingMedian{
		{Year: 2028, Number: 2, Median: percent(t, "6.50")},
		{Year: 2017, Number: 7, Median: percent(t, "7.50")},
		{Year: 2017, Number: 9, Median: percent(t, "1.00")},
		{Year: 2017, Number: 0, Median: percent(t, "2.00")},
		{Year: 2017, Number: 6, Median: percent(t, "8.00")},
		{Year: 2028, Number: 1, Median: percent(t, "6.75")},
		{Year: 2028, Number: 9, Median: percent(t, "3.00")},
		{Year: 2017, Number: 8, Median: percent(t, "7.25")},
		{Year: 2027, Number: 8, Median: percent(t, "7.00")},
	}

	focus := only(indexes.SelicTarget, indexes.Focus)

	tests := []struct {
		name string
		day  string
		want estimateView
	}{
		{name: "the published day is not projected", day: "2017-07-27", want: estimateView{Value: "9.25"}},
		{name: "the latest published target holds before the first meeting", day: "2017-08-01", want: estimateView{Value: "9.25", Methods: focus}},
		{name: "the day after the decision is a holiday", day: "2017-09-07", want: estimateView{Value: "9.25", Methods: focus}},
		{name: "the median takes effect after the holiday", day: "2017-09-08", want: estimateView{Value: "8.00", Methods: focus}},
		{name: "the day before the next decision's effect", day: "2017-10-25", want: estimateView{Value: "8.00", Methods: focus}},
		{name: "the next meeting takes effect the day after its decision", day: "2017-10-26", want: estimateView{Value: "7.50", Methods: focus}},
		{name: "the decision day itself", day: "2017-12-06", want: estimateView{Value: "7.50", Methods: focus}},
		{name: "the last meeting of the year", day: "2017-12-07", want: estimateView{Value: "7.25", Methods: focus}},
		{name: "a median holds until the next surveyed meeting", day: "2027-12-08", want: estimateView{Value: "7.25", Methods: focus}},
		{name: "the last meeting of 2027", day: "2027-12-09", want: estimateView{Value: "7.00", Methods: focus}},
		{name: "a meeting of a year past the calendar is placed by 2027's date", day: "2028-01-27", want: estimateView{Value: "7.00", Methods: focus}},
		{name: "the first meeting of 2028 takes effect on the 28th", day: "2028-01-28", want: estimateView{Value: "6.75", Methods: focus}},
		{name: "a Friday decision takes effect on Monday", day: "2028-03-19", want: estimateView{Value: "6.75", Methods: focus}},
		{name: "the second meeting of 2028 takes effect on Monday", day: "2028-03-20", want: estimateView{Value: "6.50", Methods: focus}},
		{name: "the last median holds after", day: "2035-06-01", want: estimateView{Value: "6.50", Methods: focus}},
	}

	outlook := indexes.NewOutlook(
		map[indexes.Index][]indexes.Value{indexes.SelicTarget: published},
		indexes.Expectations{Selic: medians},
		only(indexes.SelicTarget, indexes.Focus),
	)

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			got, ok := outlook.SelicTarget(utcDate(t, tt.day))
			require.True(t, ok)
			assert.Equal(t, tt.want, viewOf(got))
		})
	}
}

func TestOutlookFocusSelicTargetWithoutAnAnchorOrMeetings(t *testing.T) {
	t.Parallel()

	published := map[indexes.Index][]indexes.Value{
		indexes.SelicTarget: {
			{PeriodStart: utcDate(t, "2017-07-27"), PeriodEnd: utcDate(t, "2017-07-27"), Value: percent(t, "9.25")},
		},
	}
	medians := []indexes.MeetingMedian{{Year: 2017, Number: 6, Median: percent(t, "8.00")}}

	tests := []struct {
		name         string
		history      map[indexes.Index][]indexes.Value
		expectations indexes.Expectations
		day          string
		want         string
	}{
		{
			name: "before the first meeting with nothing published", day: "2017-09-07",
			expectations: indexes.Expectations{Selic: medians},
		},
		{
			name: "after the first meeting with nothing published", day: "2017-09-08", want: "8.00",
			expectations: indexes.Expectations{Selic: medians},
		},
		{name: "no meetings", history: published, day: "2017-08-01"},
		{
			name: "only meetings the calendar has no date for", history: published, day: "2017-08-01",
			expectations: indexes.Expectations{Selic: []indexes.MeetingMedian{{Year: 2017, Number: 9, Median: percent(t, "1")}}},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			outlook := indexes.NewOutlook(tt.history, tt.expectations, only(indexes.SelicTarget, indexes.Focus))

			got, ok := outlook.SelicTarget(utcDate(t, tt.day))
			require.Equal(t, tt.want != "", ok)

			if ok {
				assert.Equal(t, tt.want, got.Value.String())
			}
		})
	}
}

// A year's median of 4.20% a year is 0.3434% a month, 3.80% is 0.3113% and 3.50% is 0.2871%, by
// (1 + a)^(1/12) - 1 rounded at 4 places half to even.
func TestOutlookFocusIPCA(t *testing.T) {
	t.Parallel()

	published := map[indexes.Index][]indexes.Value{
		indexes.IPCA: monthlyValues(t, "2026-09-01", true, "0.48"),
	}
	focus := only(indexes.IPCA, indexes.Focus)

	tests := []struct {
		name         string
		expectations indexes.Expectations
		month        string
		want         estimateView
		wantOK       bool
	}{
		{
			name:         "a month's median",
			expectations: focusIPCA(t, "2026-11-01", "0.40", "2026-12-01", "0.55"),
			month:        "2026-11-01",
			want:         estimateView{Value: "0.40", Methods: focus},
			wantOK:       true,
		},
		{
			name:         "the last month's median",
			expectations: focusIPCA(t, "2026-11-01", "0.40", "2026-12-01", "0.55"),
			month:        "2026-12-01",
			want:         estimateView{Value: "0.55", Methods: focus},
			wantOK:       true,
		},
		{
			name:         "the year's median spread where the monthly ones end",
			expectations: focusIPCA(t, "2026-11-01", "0.40", "2026-12-01", "0.55"),
			month:        "2027-01-01",
			want:         estimateView{Value: "0.3113", Methods: focus},
			wantOK:       true,
		},
		{
			name:         "a month of a year before the monthly ones end",
			expectations: focusIPCA(t, "2026-11-01", "0.40", "2026-12-01", "0.55"),
			month:        "2026-10-01",
			want:         estimateView{Value: "0.3434", Methods: focus},
			wantOK:       true,
		},
		{
			name:         "the last month of the last annual median",
			expectations: focusIPCA(t, "2026-11-01", "0.40", "2026-12-01", "0.55"),
			month:        "2028-12-01",
			want:         estimateView{Value: "0.2871", Methods: focus},
			wantOK:       true,
		},
		{
			name:         "the last annual median held",
			expectations: focusIPCA(t, "2026-11-01", "0.40", "2026-12-01", "0.55"),
			month:        "2031-05-01",
			want:         estimateView{Value: "0.2871", Methods: focus},
			wantOK:       true,
		},
		{
			name: "a month before any median",
			expectations: indexes.Expectations{
				AnnualIPCA: []indexes.YearMedian{{Year: 2027, Median: percent(t, "3.80")}},
			},
			month: "2026-12-01",
		},
		{name: "no expectations", month: "2026-12-01"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			outlook := indexes.NewOutlook(published, tt.expectations, only(indexes.IPCA, indexes.Focus))

			got, ok := outlook.IPCA(utcDate(t, tt.month))
			require.Equal(t, tt.wantOK, ok)

			if ok {
				assert.Equal(t, tt.want, viewOf(got))
			}
		})
	}
}

// focusIPCA returns monthly medians from pairs of a month and its median, and the annual medians
// 4.20 for 2026, 3.80 for 2027 and 3.50 for 2028.
func focusIPCA(t *testing.T, monthAndMedian ...string) indexes.Expectations {
	t.Helper()

	var monthly []indexes.MonthMedian
	for rest := monthAndMedian; len(rest) >= 2; rest = rest[2:] {
		monthly = append(monthly, indexes.MonthMedian{Month: utcDate(t, rest[0]), Median: percent(t, rest[1])})
	}

	return indexes.Expectations{
		MonthlyIPCA: monthly,
		AnnualIPCA: []indexes.YearMedian{
			{Year: 2028, Median: percent(t, "3.50")},
			{Year: 2026, Median: percent(t, "4.20")},
			{Year: 2027, Median: percent(t, "3.80")},
		},
	}
}

// Each want is the legal rule worked out with Python's decimal module: TR compounded with 0.5%
// while the Selic target is above 8.5%, and with 70% of it as a monthly rate at or below.
func TestOutlookPoupancaYield(t *testing.T) {
	t.Parallel()

	// Published TR for 2026-03 to 2026-05.
	trPublished := monthlyValues(t, "2026-03-01", false, "0.07", "0.07", "0.09")
	// Twelve TR months, 2025-03 to 2026-02, averaging 0.16.
	trAverage := monthlyValues(t, "2025-03-01", false,
		"0.12", "0.12", "0.12", "0.12", "0.12", "0.12", "0.20", "0.20", "0.20", "0.20", "0.20", "0.20")
	selicPublished := []indexes.Value{
		{PeriodStart: utcDate(t, "2026-03-01"), PeriodEnd: utcDate(t, "2026-03-01"), Value: percent(t, "10.50")},
	}
	// Meetings 1 to 4 of 2026 decided on 01-28, 03-18, 04-29 and 06-17, and took effect on 01-29,
	// 03-19, 04-30 and 06-18.
	expectations := indexes.Expectations{Selic: []indexes.MeetingMedian{
		{Year: 2026, Number: 1, Median: percent(t, "9.00")},
		{Year: 2026, Number: 2, Median: percent(t, "8.25")},
		{Year: 2026, Number: 3, Median: percent(t, "8.50")},
		{Year: 2026, Number: 4, Median: percent(t, "15.00")},
	}}

	selicFocus := only(indexes.SelicTarget, indexes.Focus)

	tests := []struct {
		name    string
		history map[indexes.Index][]indexes.Value
		methods []indexes.ProjectionMethod
		start   string
		end     string
		want    estimateView
		wantOK  bool
	}{
		{
			name:    "published TR and Selic target record no method",
			history: map[indexes.Index][]indexes.Value{indexes.TR: trPublished, indexes.SelicTarget: selicPublished},
			start:   "2026-03-01", end: "2026-04-01",
			want:   estimateView{Value: "0.5704"},
			wantOK: true,
		},
		{
			name:    "published TR and projected Selic target record only the Selic method",
			history: map[indexes.Index][]indexes.Value{indexes.TR: trPublished},
			start:   "2026-03-01", end: "2026-04-01",
			want:   estimateView{Value: "0.5704", Methods: selicFocus},
			wantOK: true,
		},
		{
			name:    "projected TR and Selic target record both methods in the order of the indexes",
			history: map[indexes.Index][]indexes.Value{indexes.TR: trAverage},
			start:   "2026-07-01", end: "2026-08-01",
			want: estimateView{
				Value: "0.6608",
				Methods: []indexes.ProjectionMethod{
					{Index: indexes.TR, Method: indexes.Trailing12},
					{Index: indexes.SelicTarget, Method: indexes.Focus},
				},
			},
			wantOK: true,
		},
		{
			name:    "the path crosses below 8.5% and the rule takes 70% of the target",
			history: map[indexes.Index][]indexes.Value{indexes.TR: trPublished},
			start:   "2026-04-01", end: "2026-05-01",
			want:   estimateView{Value: "0.5393", Methods: selicFocus},
			wantOK: true,
		},
		{
			name:    "a Selic target at 8.5% takes 70% of it",
			history: map[indexes.Index][]indexes.Value{indexes.TR: trPublished},
			start:   "2026-05-01", end: "2026-06-01",
			want:   estimateView{Value: "0.5732", Methods: selicFocus},
			wantOK: true,
		},
		{
			name:    "no TR",
			history: map[indexes.Index][]indexes.Value{indexes.SelicTarget: selicPublished},
			start:   "2026-03-01", end: "2026-04-01",
		},
		{
			name:    "no Selic target",
			history: map[indexes.Index][]indexes.Value{indexes.TR: trPublished},
			methods: only(indexes.SelicTarget, indexes.Trailing12),
			start:   "2026-03-01", end: "2026-04-01",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			outlook := indexes.NewOutlook(tt.history, expectations, tt.methods)

			got, ok := outlook.PoupancaYield(utcDate(t, tt.start), utcDate(t, tt.end))
			require.Equal(t, tt.wantOK, ok)

			if ok {
				assert.Equal(t, tt.want, viewOf(got))
			}
		})
	}
}

// The path of each projected index after its published values, over a short horizon.
func TestOutlookPath(t *testing.T) {
	t.Parallel()

	trTrailing := only(indexes.TR, indexes.Trailing12)
	selicFocus := only(indexes.SelicTarget, indexes.Focus)
	ipcaFocus := only(indexes.IPCA, indexes.Focus)
	both := []indexes.ProjectionMethod{
		{Index: indexes.TR, Method: indexes.Trailing12},
		{Index: indexes.SelicTarget, Method: indexes.Focus},
	}

	// The recorded TR runs to the period 2025-12-01 to 2026-01-01, and has later rows that don't
	// run from the 1st to the 1st.
	recorded := map[indexes.Index][]indexes.Value{
		indexes.TR:   loadSGS(t, "tr_sgs226.csv"),
		indexes.IPCA: loadSGS(t, "ipca_sgs433.csv"),
	}

	selicDay := func(day, value string) indexes.Value {
		return indexes.Value{PeriodStart: utcDate(t, day), PeriodEnd: utcDate(t, day), Value: percent(t, value)}
	}
	period := func(start, end, value string) indexes.Value {
		return indexes.Value{PeriodStart: utcDate(t, start), PeriodEnd: utcDate(t, end), Value: percent(t, value)}
	}

	// Twelve TR months, 2025-03 to 2026-02, averaging 0.16, the last of them 0.20.
	trMonths := monthlyValues(t, "2025-03-01", false,
		"0.12", "0.12", "0.12", "0.12", "0.12", "0.12", "0.20", "0.20", "0.20", "0.20", "0.20", "0.20")

	tests := []struct {
		name         string
		index        indexes.Index
		history      map[indexes.Index][]indexes.Value
		expectations indexes.Expectations
		months       int
		want         []pathView
	}{
		{
			name: "TR by its trailing average after the latest 1st to 1st period", index: indexes.TR, history: recorded,
			months: 3,
			want: []pathView{
				{"2026-01-01", "2026-02-01", estimateView{Value: "0.1630", Methods: trTrailing}},
				{"2026-02-01", "2026-03-01", estimateView{Value: "0.1630", Methods: trTrailing}},
				{"2026-03-01", "2026-04-01", estimateView{Value: "0.1630", Methods: trTrailing}},
			},
		},
		{
			name: "Selic target by Focus after the month of its latest published day", index: indexes.SelicTarget,
			history: map[indexes.Index][]indexes.Value{
				indexes.SelicTarget: {selicDay("2026-02-10", "15.00"), selicDay("2026-02-09", "15.25")},
			},
			expectations: indexes.Expectations{Selic: []indexes.MeetingMedian{
				{Year: 2026, Number: 3, Median: percent(t, "14.00")},
				{Year: 2026, Number: 2, Median: percent(t, "14.25")},
			}},
			months: 4,
			want: []pathView{
				{"2026-03-01", "2026-03-01", estimateView{Value: "15.00", Methods: selicFocus}},
				{"2026-04-01", "2026-04-01", estimateView{Value: "14.25", Methods: selicFocus}},
				{"2026-05-01", "2026-05-01", estimateView{Value: "14.00", Methods: selicFocus}},
				{"2026-06-01", "2026-06-01", estimateView{Value: "14.00", Methods: selicFocus}},
			},
		},
		{
			name: "IPCA by Focus skips the months with no estimate", index: indexes.IPCA, history: recorded,
			expectations: indexes.Expectations{
				MonthlyIPCA: []indexes.MonthMedian{
					{Month: utcDate(t, "2026-02-01"), Median: percent(t, "0.35")},
					{Month: utcDate(t, "2026-01-01"), Median: percent(t, "0.40")},
				},
				AnnualIPCA: []indexes.YearMedian{{Year: 2027, Median: percent(t, "3.80")}},
			},
			months: 15,
			want: []pathView{
				{"2026-01-01", "2026-01-01", estimateView{Value: "0.40", Methods: ipcaFocus}},
				{"2026-02-01", "2026-02-01", estimateView{Value: "0.35", Methods: ipcaFocus}},
				{"2027-01-01", "2027-01-01", estimateView{Value: "0.3113", Methods: ipcaFocus}},
				{"2027-02-01", "2027-02-01", estimateView{Value: "0.3113", Methods: ipcaFocus}},
				{"2027-03-01", "2027-03-01", estimateView{Value: "0.3113", Methods: ipcaFocus}},
			},
		},
		{
			name:  "poupança yield derived from the projected inputs after its latest 1st to 1st period",
			index: indexes.PoupancaYield,
			history: map[indexes.Index][]indexes.Value{
				indexes.TR: trMonths,
				indexes.PoupancaYield: {
					period("2026-02-15", "2026-03-15", "0.50"),
					period("2026-01-01", "2026-02-01", "0.61"),
					period("2025-12-01", "2026-01-01", "0.60"),
				},
			},
			expectations: indexes.Expectations{Selic: []indexes.MeetingMedian{
				{Year: 2026, Number: 1, Median: percent(t, "10.50")},
			}},
			months: 2,
			want: []pathView{
				{"2026-02-01", "2026-03-01", estimateView{Value: "0.7010", Methods: selicFocus}},
				{"2026-03-01", "2026-04-01", estimateView{Value: "0.6608", Methods: both}},
			},
		},
		{
			name: "nothing published for the index", index: indexes.TR, months: 3,
			history: map[indexes.Index][]indexes.Value{indexes.IPCA: recorded[indexes.IPCA]},
		},
		{name: "a horizon of no months", index: indexes.TR, history: recorded, months: 0},
		{name: "no estimate for any month", index: indexes.IPCA, history: recorded, months: 3},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			outlook := indexes.NewOutlook(tt.history, tt.expectations, nil)

			path := outlook.Path(tt.index, tt.months)
			assert.NotNil(t, path)
			assert.Equal(t, tt.want, pathViews(path))
		})
	}
}

func TestOutlookPathOfAnIndexThatIsNotProjectedIsNil(t *testing.T) {
	t.Parallel()

	history := map[indexes.Index][]indexes.Value{
		indexes.Selic:      monthlyValues(t, "2026-01-01", true, "0.90"),
		indexes.IPCANumber: monthlyValues(t, "2026-01-01", true, "7000.12"),
	}
	outlook := indexes.NewOutlook(history, indexes.Expectations{}, nil)

	assert.Nil(t, outlook.Path(indexes.Selic, 3))
	assert.Nil(t, outlook.Path(indexes.IPCANumber, 3))
	assert.Nil(t, outlook.Path(indexes.Index("unknown"), 3))
}
