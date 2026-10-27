package marketdata

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/gringolito/debtwise/backend/indexes"
	"github.com/gringolito/debtwise/backend/marketdata/focus"
)

// ExpectationSource is the subset of *focus.Client the job reads.
type ExpectationSource interface {
	Selic(ctx context.Context, day time.Time) ([]focus.Meeting, error)
	MonthlyIPCA(ctx context.Context, day time.Time) ([]focus.Month, error)
	AnnualIPCA(ctx context.Context, day time.Time) ([]focus.Year, error)
}

// refreshExpectations fetches the Focus median expectations and replaces the stored ones with them.
// When any fetch fails, the stored expectations stay and the failure is recorded.
func (j *Job) refreshExpectations(ctx context.Context, now time.Time) error {
	expectations, err := j.fetchExpectations(ctx, now)
	if err == nil {
		if err = j.indexStore.SaveExpectations(ctx, expectations, now); err == nil {
			return nil
		}
	}

	// A refresh cut short by its caller is no failure of the source.
	if ctx.Err() == nil {
		if saveErr := j.indexStore.SaveExpectationsFailure(ctx, now); saveErr != nil {
			err = errors.Join(err, saveErr)
		}
	}

	return fmt.Errorf("marketdata: refresh focus expectations: %w", err)
}

// fetchExpectations asks Focus for its latest survey as of now.
func (j *Job) fetchExpectations(ctx context.Context, now time.Time) (indexes.Expectations, error) {
	meetings, err := j.sources.Focus.Selic(ctx, now)
	if err != nil {
		return indexes.Expectations{}, err
	}

	months, err := j.sources.Focus.MonthlyIPCA(ctx, now)
	if err != nil {
		return indexes.Expectations{}, err
	}

	years, err := j.sources.Focus.AnnualIPCA(ctx, now)
	if err != nil {
		return indexes.Expectations{}, err
	}

	e := indexes.Expectations{
		Selic:       make([]indexes.MeetingMedian, 0, len(meetings)),
		MonthlyIPCA: make([]indexes.MonthMedian, 0, len(months)),
		AnnualIPCA:  make([]indexes.YearMedian, 0, len(years)),
	}

	for _, m := range meetings {
		e.Selic = append(e.Selic, indexes.MeetingMedian{Year: m.Year, Number: m.Number, Median: m.Median})
	}

	for _, m := range months {
		e.MonthlyIPCA = append(e.MonthlyIPCA, indexes.MonthMedian{Month: m.Month, Median: m.Median})
	}

	for _, y := range years {
		e.AnnualIPCA = append(e.AnnualIPCA, indexes.YearMedian{Year: y.Year, Median: y.Median})
	}

	return e, nil
}
