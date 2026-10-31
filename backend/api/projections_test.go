package api_test

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/gringolito/debtwise/backend/decimal"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/gringolito/debtwise/backend/marketdata/sgs"
)

func defaultProjectionMethods() []projectionMethod {
	return []projectionMethod{
		{Index: "tr", Method: "trailing_12", Offered: []string{"trailing_12", "trailing_60"}},
		{Index: "selic_target", Method: "focus", Offered: []string{"focus", "trailing_12", "trailing_60"}},
		{Index: "ipca", Method: "focus", Offered: []string{"focus", "trailing_12", "trailing_60"}},
	}
}

// monthlyTR are 60 months of TR from October 2021 to September 2026, each period running to the
// first of the next month: 0.0100 for the first 48 months, then 0.0150 and 0.0250 for six months
// each.
func monthlyTR() []sgs.Observation {
	rows := make([]sgs.Observation, 0, 60)

	for i := range 60 {
		value := "0.0100"

		switch {
		case i >= 54:
			value = "0.0250"
		case i >= 48:
			value = "0.0150"
		}

		start := date(2021, time.October+time.Month(i), 1)
		rows = append(rows, sgs.Observation{Start: start, End: start.AddDate(0, 1, 0), Value: decimal.MustParse(value)})
	}

	return rows
}

// wantTRPath is the 60 months from October 2026, each with value, projected by method.
func wantTRPath(value, method string) []projectedValue {
	path := make([]projectedValue, 0, 60)

	for i := range 60 {
		start := date(2026, time.October+time.Month(i), 1)
		path = append(path, projectedValue{
			PeriodStart: start.Format(time.DateOnly),
			PeriodEnd:   start.AddDate(0, 1, 0).Format(time.DateOnly),
			Value:       value,
			Methods:     []projectedBy{{Index: "tr", Method: method}},
		})
	}

	return path
}

func TestProjectionMethodsDefaultToTheFirstOfferedMethod(t *testing.T) {
	t.Parallel()

	s := newServer(t, sgsWithRows(nil), quotingRadar())

	assert.Equal(t, defaultProjectionMethods(), s.projectionMethods(t))
}

func TestSavedProjectionMethodIsReadBack(t *testing.T) {
	t.Parallel()

	s := newServer(t, sgsWithRows(nil), quotingRadar())

	rec := s.chooseMethod(t, "ipca", "trailing_60")
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	assert.JSONEq(t, `{"index":"ipca","method":"trailing_60","offered":["focus","trailing_12","trailing_60"]}`,
		rec.Body.String())

	assert.Equal(t, []projectionMethod{
		{Index: "tr", Method: "trailing_12", Offered: []string{"trailing_12", "trailing_60"}},
		{Index: "selic_target", Method: "focus", Offered: []string{"focus", "trailing_12", "trailing_60"}},
		{Index: "ipca", Method: "trailing_60", Offered: []string{"focus", "trailing_12", "trailing_60"}},
	}, s.projectionMethods(t))
}

func TestMethodNotOfferedForTheIndexIsRefused(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name   string
		index  string
		method string
	}{
		{name: "a method the index does not offer", index: "tr", method: "focus"},
		{name: "an index without methods", index: "selic", method: "trailing_12"},
		{name: "another index without methods", index: "poupanca_yield", method: "focus"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			s := newServer(t, sgsWithRows(nil), quotingRadar())

			rec := s.chooseMethod(t, tt.index, tt.method)
			require.Equal(t, http.StatusUnprocessableEntity, rec.Code, rec.Body.String())

			var problem struct {
				Errors []struct {
					Location string `json:"location"`
					Message  string `json:"message"`
					Value    string `json:"value"`
				} `json:"errors"`
			}
			require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &problem))
			require.Len(t, problem.Errors, 1)
			assert.Equal(t, "body.method", problem.Errors[0].Location)
			assert.Equal(t, "is not offered for this index", problem.Errors[0].Message)
			assert.Equal(t, tt.method, problem.Errors[0].Value)

			assert.Equal(t, defaultProjectionMethods(), s.projectionMethods(t), "the stored methods")
		})
	}
}

func TestUnknownMethodOrIndexIsRefusedBySchema(t *testing.T) {
	t.Parallel()

	s := newServer(t, sgsWithRows(nil), quotingRadar())

	for name, rec := range map[string]*httptest.ResponseRecorder{
		"method": s.chooseMethod(t, "tr", "trailing_24"),
		"index":  s.chooseMethod(t, "cdi", "trailing_12"),
	} {
		assert.Equal(t, http.StatusUnprocessableEntity, rec.Code, name+": "+rec.Body.String())
	}

	assert.Equal(t, defaultProjectionMethods(), s.projectionMethods(t), "the stored methods")
}

func TestTRIsProjectedByTheAverageOfItsLatestMonths(t *testing.T) {
	t.Parallel()

	s := newServer(t, sgsWithRows(map[int][]sgs.Observation{226: monthlyTR()}), quotingRadar())

	// (6*0.0150 + 6*0.0250) / 12
	got := s.projection(t, "tr")
	assert.Equal(t, "tr", got.Index)
	assert.Equal(t, wantTRPath("0.0200", "trailing_12"), got.Values)

	rec := s.chooseMethod(t, "tr", "trailing_60")
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())

	// (48*0.0100 + 6*0.0150 + 6*0.0250) / 60
	got = s.projection(t, "tr")
	assert.Equal(t, "tr", got.Index)
	assert.Equal(t, wantTRPath("0.0120", "trailing_60"), got.Values)
}

// projectedOn lists projected values of one day or month each, in order, projected by methods.
func projectedOn(methods []projectedBy, dayAndValue ...string) []projectedValue {
	values := make([]projectedValue, 0, len(dayAndValue)/2)

	for rest := dayAndValue; len(rest) >= 2; rest = rest[2:] {
		values = append(values, projectedValue{
			PeriodStart: rest[0], PeriodEnd: rest[0], Value: rest[1], Methods: methods,
		})
	}

	return values
}

// The Selic target is published through 2017-07-26, so its path starts on 2017-08-01. The Focus
// survey of 2017-06-30 puts R5/2017's 9.50 in force from 2017-07-27, R6's 8.75 from 2017-09-08, R7's
// and R8's 8.50 from 2017-10-26 and 2017-12-07, R1/2018's 8.25 from 2018-02-08 (the Copom decided on
// the 7th) and the same 8.25 for every meeting after it.
func TestSelicTargetProjectionFollowsTheRecordedFocusMedians(t *testing.T) {
	t.Parallel()

	s := newServerOn2017June30(t)

	got := s.projection(t, "selic_target")
	assert.Equal(t, "selic_target", got.Index)
	require.Len(t, got.Values, 60)

	assert.Equal(t, projectedOn([]projectedBy{by("selic_target", "focus")},
		"2017-08-01", "9.5000",
		"2017-09-01", "9.5000",
		"2017-10-01", "8.7500",
		"2017-11-01", "8.5000",
		"2017-12-01", "8.5000",
		"2018-01-01", "8.5000",
		"2018-02-01", "8.5000",
		"2018-03-01", "8.2500",
	), got.Values[:8])
	assert.Equal(t, projectedOn([]projectedBy{by("selic_target", "focus")}, "2022-07-01", "8.2500"), got.Values[59:])
}

// The IPCA is published through 2017-05, so its path starts in 2017-06 with the monthly Focus medians
// of the survey of 2017-06-30 up to 2018-11. The month after has none, so it takes the annual median
// of 2018, 4.25%, as a monthly rate: 1.0425^(1/12) - 1 = 0.3474%. The year 2019 does the same, and
// 2022 holds 2021's median of 4.00%, 0.3274% a month.
func TestIPCAProjectionFollowsTheRecordedFocusMedians(t *testing.T) {
	t.Parallel()

	s := newServerOn2017June30(t)

	got := s.projection(t, "ipca")
	assert.Equal(t, "ipca", got.Index)
	require.Len(t, got.Values, 60)

	focus := []projectedBy{by("ipca", "focus")}

	assert.Equal(t, projectedOn(focus,
		"2017-06-01", "-0.1500",
		"2017-07-01", "0.1800",
		"2017-08-01", "0.2500",
		"2017-09-01", "0.3300",
		"2017-10-01", "0.4000",
		"2017-11-01", "0.4400",
		"2017-12-01", "0.5200",
		"2018-01-01", "0.5300",
		"2018-02-01", "0.4800",
		"2018-03-01", "0.3700",
		"2018-04-01", "0.4000",
		"2018-05-01", "0.3100",
		"2018-06-01", "0.2000",
		"2018-07-01", "0.1900",
		"2018-08-01", "0.2000",
		"2018-09-01", "0.2800",
		"2018-10-01", "0.3700",
		"2018-11-01", "0.4000",
		"2018-12-01", "0.3474",
		"2019-01-01", "0.3474",
	), got.Values[:20])
	assert.Equal(t, projectedOn(focus, "2022-01-01", "0.3274"), got.Values[55:56])
}

func TestIndexWithoutProjectionHasNoValues(t *testing.T) {
	t.Parallel()

	s := newServer(t, sgsWithRows(nil), quotingRadar())

	rec := s.do(t, http.MethodGet, "/api/indexes/selic/projection")
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	assert.JSONEq(t, `{"index":"selic","values":[]}`, rec.Body.String())
}

func TestProjectionOfAnUnknownIndexIsRefused(t *testing.T) {
	t.Parallel()

	s := newServer(t, sgsWithRows(nil), quotingRadar())

	rec := s.do(t, http.MethodGet, "/api/indexes/cdi/projection")
	assert.Equal(t, http.StatusUnprocessableEntity, rec.Code, rec.Body.String())
}

func TestStatusReportsHowFreshTheFocusExpectationsAre(t *testing.T) {
	t.Parallel()

	start := time.Now()
	s := newServer(t, sgsWithRows(nil), quotingRadar())

	focus := s.status(t).Focus
	assert.Equal(t, "fresh", focus.Status)
	assert.Nil(t, focus.FailedAt)
	require.NotNil(t, focus.RefreshedAt)
	assert.WithinRange(t, *focus.RefreshedAt, start.Truncate(time.Second), time.Now())

	require.NoError(t, s.job.Refresh(t.Context(), time.Now().Add(-49*time.Hour)))
	assert.Equal(t, "stale", s.status(t).Focus.Status)
}

// A Focus source that fails leaves the expectations never refreshed and the failure reported for
// them alone: the bond quotes of the same refresh are fresh.
func TestFailedFocusRefreshIsReportedWhileTheBondsStayFresh(t *testing.T) {
	t.Parallel()

	start := time.Now()
	s := newServer(t, sgsWithRows(nil), quotingRadar(), withFocus(failingFocus{}))

	status := s.status(t)
	assert.Equal(t, "failed", status.Focus.Status)
	assert.Nil(t, status.Focus.RefreshedAt)
	require.NotNil(t, status.Focus.FailedAt)
	assert.WithinRange(t, *status.Focus.FailedAt, start.Truncate(time.Second), time.Now())

	assert.Equal(t, "fresh", status.Bonds.Status)
	assert.Nil(t, status.Bonds.FailedAt)
}
