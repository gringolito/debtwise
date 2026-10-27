package indexes_test

import (
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/gringolito/debtwise/backend/indexes"
)

func TestProjectionMethodsDefaultToTheFirstMethodOfEachIndex(t *testing.T) {
	t.Parallel()

	store := indexes.NewStore(openDatabase(t, true))

	methods, err := store.ProjectionMethods(t.Context())
	require.NoError(t, err)

	assert.Equal(t, []indexes.ProjectionMethod{
		{Index: indexes.TR, Method: indexes.Trailing12},
		{Index: indexes.SelicTarget, Method: indexes.Focus},
		{Index: indexes.IPCA, Method: indexes.Focus},
	}, methods)
}

func TestSavedProjectionMethodsAreReadBack(t *testing.T) {
	t.Parallel()

	store := indexes.NewStore(openDatabase(t, true))

	for _, m := range []indexes.ProjectionMethod{
		{Index: indexes.TR, Method: indexes.Trailing60},
		{Index: indexes.SelicTarget, Method: indexes.Trailing12},
		{Index: indexes.IPCA, Method: indexes.Trailing60},
	} {
		require.NoError(t, store.SaveProjectionMethod(t.Context(), m))
	}

	methods, err := store.ProjectionMethods(t.Context())
	require.NoError(t, err)

	assert.Equal(t, []indexes.ProjectionMethod{
		{Index: indexes.TR, Method: indexes.Trailing60},
		{Index: indexes.SelicTarget, Method: indexes.Trailing12},
		{Index: indexes.IPCA, Method: indexes.Trailing60},
	}, methods)

	// Saving again replaces the method, leaving the others.
	require.NoError(t, store.SaveProjectionMethod(t.Context(), indexes.ProjectionMethod{
		Index: indexes.SelicTarget, Method: indexes.Focus,
	}))

	methods, err = store.ProjectionMethods(t.Context())
	require.NoError(t, err)

	assert.Equal(t, []indexes.ProjectionMethod{
		{Index: indexes.TR, Method: indexes.Trailing60},
		{Index: indexes.SelicTarget, Method: indexes.Focus},
		{Index: indexes.IPCA, Method: indexes.Trailing60},
	}, methods)
}

func TestSavingAMethodTheIndexIsNotOfferedFailsAndChangesNothing(t *testing.T) {
	t.Parallel()

	tests := []indexes.ProjectionMethod{
		{Index: indexes.TR, Method: indexes.Focus},
		{Index: indexes.PoupancaYield, Method: indexes.Trailing12},
		{Index: indexes.Selic, Method: indexes.Focus},
		{Index: indexes.IPCA, Method: indexes.Method("average")},
	}

	for _, m := range tests {
		t.Run(string(m.Index)+" by "+string(m.Method), func(t *testing.T) {
			t.Parallel()

			store := indexes.NewStore(openDatabase(t, true))
			require.NoError(t, store.SaveProjectionMethod(t.Context(), indexes.ProjectionMethod{
				Index: indexes.TR, Method: indexes.Trailing60,
			}))

			err := store.SaveProjectionMethod(t.Context(), m)
			require.ErrorIs(t, err, indexes.ErrMethodNotOffered)

			methods, err := store.ProjectionMethods(t.Context())
			require.NoError(t, err)

			assert.Equal(t, []indexes.ProjectionMethod{
				{Index: indexes.TR, Method: indexes.Trailing60},
				{Index: indexes.SelicTarget, Method: indexes.Focus},
				{Index: indexes.IPCA, Method: indexes.Focus},
			}, methods)
		})
	}
}

func sampleExpectations(t *testing.T) indexes.Expectations {
	t.Helper()

	return indexes.Expectations{
		Selic: []indexes.MeetingMedian{
			{Year: 2026, Number: 8, Median: percent(t, "14.50")},
			{Year: 2027, Number: 1, Median: percent(t, "14.25")},
			{Year: 2027, Number: 2, Median: percent(t, "13.75")},
		},
		MonthlyIPCA: []indexes.MonthMedian{
			{Month: time.Date(2026, time.November, 1, 0, 0, 0, 0, time.UTC), Median: percent(t, "0.30")},
			{Month: time.Date(2026, time.December, 1, 0, 0, 0, 0, time.UTC), Median: percent(t, "0.45")},
		},
		AnnualIPCA: []indexes.YearMedian{
			{Year: 2026, Median: percent(t, "4.60")},
			{Year: 2027, Median: percent(t, "4.00")},
		},
	}
}

func TestExpectationsAreEmptyBeforeAnySave(t *testing.T) {
	t.Parallel()

	store := indexes.NewStore(openDatabase(t, true))

	stored, err := store.Expectations(t.Context())
	require.NoError(t, err)
	assert.Equal(t, indexes.Expectations{}, stored)

	times, err := store.ExpectationsRefreshTimes(t.Context())
	require.NoError(t, err)
	assert.Equal(t, indexes.ExpectationsRefreshTimes{}, times)
}

func TestExpectationsRoundTripInReferenceOrder(t *testing.T) {
	t.Parallel()

	store := indexes.NewStore(openDatabase(t, true))
	want := sampleExpectations(t)

	// Saved out of order, read back ascending.
	shuffled := indexes.Expectations{
		Selic:       []indexes.MeetingMedian{want.Selic[2], want.Selic[0], want.Selic[1]},
		MonthlyIPCA: []indexes.MonthMedian{want.MonthlyIPCA[1], want.MonthlyIPCA[0]},
		AnnualIPCA:  []indexes.YearMedian{want.AnnualIPCA[1], want.AnnualIPCA[0]},
	}
	at := time.Date(2026, time.October, 26, 9, 0, 0, 0, time.UTC)

	require.NoError(t, store.SaveExpectations(t.Context(), shuffled, at))

	stored, err := store.Expectations(t.Context())
	require.NoError(t, err)
	assert.Equal(t, want, stored)

	for i, m := range stored.Selic {
		assert.Equal(t, want.Selic[i].Median.String(), m.Median.String())
	}

	assert.Equal(t, "14.50", stored.Selic[0].Median.String())
	assert.Equal(t, "0.30", stored.MonthlyIPCA[0].Median.String())
	assert.Equal(t, "4.60", stored.AnnualIPCA[0].Median.String())

	times, err := store.ExpectationsRefreshTimes(t.Context())
	require.NoError(t, err)
	assert.Equal(t, indexes.ExpectationsRefreshTimes{RefreshedAt: at}, times)
}

func TestASecondSaveReplacesTheExpectationsWhole(t *testing.T) {
	t.Parallel()

	store := indexes.NewStore(openDatabase(t, true))
	first := time.Date(2026, time.October, 26, 9, 0, 0, 0, time.UTC)
	second := first.Add(24 * time.Hour)

	require.NoError(t, store.SaveExpectations(t.Context(), sampleExpectations(t), first))

	replacement := indexes.Expectations{
		Selic: []indexes.MeetingMedian{{Year: 2027, Number: 1, Median: percent(t, "13.00")}},
	}
	require.NoError(t, store.SaveExpectations(t.Context(), replacement, second))

	stored, err := store.Expectations(t.Context())
	require.NoError(t, err)
	assert.Equal(t, replacement, stored)

	times, err := store.ExpectationsRefreshTimes(t.Context())
	require.NoError(t, err)
	assert.Equal(t, indexes.ExpectationsRefreshTimes{RefreshedAt: second}, times)
}

func TestAFailureKeepsTheExpectationsAndALaterSuccessClearsIt(t *testing.T) {
	t.Parallel()

	store := indexes.NewStore(openDatabase(t, true))
	savedAt := time.Date(2026, time.October, 26, 9, 0, 0, 0, time.UTC)
	failedAt := savedAt.Add(time.Hour)
	recoveredAt := failedAt.Add(time.Hour)

	require.NoError(t, store.SaveExpectations(t.Context(), sampleExpectations(t), savedAt))
	require.NoError(t, store.SaveExpectationsFailure(t.Context(), failedAt))

	stored, err := store.Expectations(t.Context())
	require.NoError(t, err)
	assert.Equal(t, sampleExpectations(t), stored)

	times, err := store.ExpectationsRefreshTimes(t.Context())
	require.NoError(t, err)
	assert.Equal(t, indexes.ExpectationsRefreshTimes{RefreshedAt: savedAt, FailedAt: failedAt}, times)

	require.NoError(t, store.SaveExpectations(t.Context(), sampleExpectations(t), recoveredAt))

	times, err = store.ExpectationsRefreshTimes(t.Context())
	require.NoError(t, err)
	assert.Equal(t, indexes.ExpectationsRefreshTimes{RefreshedAt: recoveredAt}, times)
}

// A save that fails while storing its expectations, here on the same meeting twice, replaces
// nothing and records no refresh.
func TestAFailedSaveKeepsTheStoredExpectationsAndTheirRefreshTime(t *testing.T) {
	t.Parallel()

	store := indexes.NewStore(openDatabase(t, true))
	savedAt := time.Date(2026, time.October, 26, 9, 0, 0, 0, time.UTC)

	require.NoError(t, store.SaveExpectations(t.Context(), sampleExpectations(t), savedAt))

	duplicate := indexes.Expectations{
		Selic: []indexes.MeetingMedian{
			{Year: 2028, Number: 1, Median: percent(t, "12.00")},
			{Year: 2028, Number: 1, Median: percent(t, "11.00")},
		},
		AnnualIPCA: []indexes.YearMedian{{Year: 2028, Median: percent(t, "3.50")}},
	}
	require.Error(t, store.SaveExpectations(t.Context(), duplicate, savedAt.Add(time.Hour)))

	stored, err := store.Expectations(t.Context())
	require.NoError(t, err)
	assert.Equal(t, sampleExpectations(t), stored)

	times, err := store.ExpectationsRefreshTimes(t.Context())
	require.NoError(t, err)
	assert.Equal(t, indexes.ExpectationsRefreshTimes{RefreshedAt: savedAt}, times)
}

func TestAFailureBeforeAnySuccessRecordsOnlyTheFailure(t *testing.T) {
	t.Parallel()

	store := indexes.NewStore(openDatabase(t, true))
	failedAt := time.Date(2026, time.October, 26, 9, 0, 0, 0, time.UTC)

	require.NoError(t, store.SaveExpectationsFailure(t.Context(), failedAt))

	times, err := store.ExpectationsRefreshTimes(t.Context())
	require.NoError(t, err)
	assert.Equal(t, indexes.ExpectationsRefreshTimes{FailedAt: failedAt}, times)
}
