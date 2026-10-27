package api_test

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

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
		rows = append(rows, sgs.Observation{Start: start, End: start.AddDate(0, 1, 0), Value: mustDecimal(value)})
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
