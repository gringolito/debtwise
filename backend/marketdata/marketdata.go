// Package marketdata refreshes DebtWise's market data from its external sources, on a schedule and
// on demand, and reports how fresh each index and the bond quotes are.
package marketdata

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"sync"
	"time"

	"github.com/gringolito/debtwise/backend/indexes"
	"github.com/gringolito/debtwise/backend/marketdata/sgs"
	"github.com/gringolito/debtwise/backend/marketdata/sidra"
)

const (
	// DefaultInterval is how often Run refreshes when no WithInterval option sets it.
	DefaultInterval = 24 * time.Hour
	// StaleAfter is how long after its last successful refresh an index counts as stale: long
	// enough to miss one daily refresh.
	StaleAfter = 48 * time.Hour
	// lookahead extends every request past today, because the Selic target series publishes the
	// target in force up to the next Copom meeting.
	lookahead = 90 * 24 * time.Hour
)

// IndexSource is the subset of *sgs.Client the job reads.
type IndexSource interface {
	Observations(ctx context.Context, series int, from, to time.Time) ([]sgs.Observation, error)
}

// NumberSource is the subset of *sidra.Client the job reads.
type NumberSource interface {
	MonthlyValues(ctx context.Context, table, variable int, from, to time.Time) ([]sidra.Value, error)
}

// Sources are the external sources the job reads.
type Sources struct {
	SGS   IndexSource
	SIDRA NumberSource
	Radar QuoteSource
	Focus ExpectationSource
}

// IndexStore is the subset of *indexes.Store the job reads and writes.
type IndexStore interface {
	LatestPeriodStart(ctx context.Context, index indexes.Index) (time.Time, error)
	SaveRefresh(ctx context.Context, index indexes.Index, values []indexes.Value, at time.Time) error
	SaveFailure(ctx context.Context, index indexes.Index, values []indexes.Value, at time.Time) error
	RefreshTimes(ctx context.Context) ([]indexes.RefreshTimes, error)
	SaveExpectations(ctx context.Context, e indexes.Expectations, at time.Time) error
	SaveExpectationsFailure(ctx context.Context, at time.Time) error
	ExpectationsRefreshTimes(ctx context.Context) (indexes.ExpectationsRefreshTimes, error)
}

// feed is an index and how to fetch its values for the periods from `from` through `to`. When the
// source fails partway, fetch returns the values fetched before the failure with the error.
type feed struct {
	index indexes.Index
	fetch func(ctx context.Context, from, to time.Time) ([]indexes.Value, error)
}

// IBGE's IPCA index numbers: SIDRA table 1737, variable 2266.
const (
	ipcaTable          = 1737
	ipcaNumberVariable = 2266
)

// feeds returns every index with its source, in the order of indexes.All.
func (j *Job) feeds() []feed {
	return []feed{
		j.sgsFeed(indexes.TR, 226),
		j.sgsFeed(indexes.PoupancaYield, 195),
		j.sgsFeed(indexes.SelicTarget, 432),
		j.sgsFeed(indexes.Selic, 11),
		j.sgsFeed(indexes.IPCA, 433),
		{index: indexes.IPCANumber, fetch: j.fetchIPCANumbers},
	}
}

func (j *Job) sgsFeed(index indexes.Index, series int) feed {
	return feed{index: index, fetch: func(ctx context.Context, from, to time.Time) ([]indexes.Value, error) {
		observations, err := j.sources.SGS.Observations(ctx, series, from, to)

		values := make([]indexes.Value, 0, len(observations))
		for _, o := range observations {
			end := o.End
			if end.IsZero() {
				end = o.Start
			}

			values = append(values, indexes.Value{PeriodStart: o.Start, PeriodEnd: end, Value: o.Value})
		}

		return values, err
	}}
}

func (j *Job) fetchIPCANumbers(ctx context.Context, from, to time.Time) ([]indexes.Value, error) {
	numbers, err := j.sources.SIDRA.MonthlyValues(ctx, ipcaTable, ipcaNumberVariable, from, to)

	values := make([]indexes.Value, 0, len(numbers))
	for _, n := range numbers {
		values = append(values, indexes.Value{PeriodStart: n.Month, PeriodEnd: n.Month, Value: n.Value})
	}

	return values, err
}

// backfillFrom is the first date fetched for an index that has no values yet. It takes in June
// 2000, the IPCA index number that Tesouro's VNA starts from.
func backfillFrom() time.Time {
	return time.Date(2000, time.January, 1, 0, 0, 0, 0, time.UTC)
}

type Option func(*Job)

// WithLogger sets the logger Run reports failed refreshes to. Nil uses slog.Default().
func WithLogger(l *slog.Logger) Option {
	return func(j *Job) { j.logger = l }
}

// WithInterval sets how often Run refreshes.
func WithInterval(d time.Duration) Option {
	return func(j *Job) { j.interval = d }
}

// Job refreshes every index and the bond quotes from their sources.
type Job struct {
	sources    Sources
	indexStore IndexStore
	quoteStore QuoteStore
	logger     *slog.Logger
	interval   time.Duration
	trigger    chan struct{}

	mu      sync.Mutex
	pending bool
	running bool
}

// New returns a job with a refresh already pending, which Run starts with.
func New(sources Sources, indexStore IndexStore, quoteStore QuoteStore, opts ...Option) *Job {
	j := &Job{
		sources:    sources,
		indexStore: indexStore,
		quoteStore: quoteStore,
		interval:   DefaultInterval,
		trigger:    make(chan struct{}, 1),
	}
	for _, opt := range opts {
		opt(j)
	}

	if j.logger == nil {
		j.logger = slog.Default()
	}

	j.Trigger()

	return j
}

// Trigger asks Run for a refresh. A refresh asked for while another is pending is the same
// refresh.
func (j *Job) Trigger() {
	j.mu.Lock()
	defer j.mu.Unlock()

	j.pending = true

	select {
	case j.trigger <- struct{}{}:
	default:
	}
}

// Run refreshes whenever Trigger asks it to and every interval, until ctx is done. It logs the
// refreshes that fail.
func (j *Job) Run(ctx context.Context) {
	ticker := time.NewTicker(j.interval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-j.trigger:
		case <-ticker.C:
		}

		j.start()

		if err := j.Refresh(ctx, time.Now()); err != nil && ctx.Err() == nil {
			j.logger.ErrorContext(ctx, "market data refresh failed", "err", err)
		}

		j.finish()
	}
}

// start marks a refresh as running. A trigger still queued is served by this refresh, so start
// takes it back.
func (j *Job) start() {
	j.mu.Lock()
	defer j.mu.Unlock()

	j.pending = false
	j.running = true

	select {
	case <-j.trigger:
	default:
	}
}

func (j *Job) finish() {
	j.mu.Lock()
	defer j.mu.Unlock()

	j.running = false
}

// Refresh fetches every index, the bond quotes and the Focus expectations from their sources and
// stores what it fetched at now. An index whose fetch fails keeps its values, gains those fetched
// before the failure, and has the failure recorded; failed quotes and failed expectations keep the
// stored ones and have the failure recorded. The others are stored anyway.
func (j *Job) Refresh(ctx context.Context, now time.Time) error {
	all := j.feeds()
	errs := make([]error, len(all), len(all)+2)

	var quotesErr, expectationsErr error

	var wg sync.WaitGroup
	for i, f := range all {
		wg.Go(func() { errs[i] = j.refresh(ctx, f, now) })
	}

	wg.Go(func() { quotesErr = j.refreshQuotes(ctx, now) })
	wg.Go(func() { expectationsErr = j.refreshExpectations(ctx, now) })

	wg.Wait()

	return errors.Join(append(errs, quotesErr, expectationsErr)...)
}

func (j *Job) refresh(ctx context.Context, f feed, now time.Time) error {
	values, err := j.fetch(ctx, f, now)
	if err == nil {
		if err = j.indexStore.SaveRefresh(ctx, f.index, values, now); err == nil {
			return nil
		}
	}

	// A refresh cut short by its caller is no failure of the source.
	if ctx.Err() == nil {
		if saveErr := j.indexStore.SaveFailure(ctx, f.index, values, now); saveErr != nil {
			err = errors.Join(err, saveErr)
		}
	}

	return fmt.Errorf("marketdata: refresh %s: %w", f.index, err)
}

// fetch returns the values of an index from its latest stored period on, so that values its
// source revised for that period replace the stored ones, each fetched at now. When the source
// fails partway, fetch returns the values fetched before the failure with the error.
func (j *Job) fetch(ctx context.Context, f feed, now time.Time) ([]indexes.Value, error) {
	from, err := j.indexStore.LatestPeriodStart(ctx, f.index)
	if err != nil {
		return nil, err
	}

	switch {
	case from.IsZero():
		from = backfillFrom()
	case from.After(now):
		// Rows dated after today, such as the Selic target in force up to the next Copom
		// meeting, are refetched in case the target changed.
		from = now
	}

	values, err := f.fetch(ctx, from, now.Add(lookahead))
	for i := range values {
		values[i].FetchedAt = now
	}

	return values, err
}

// State is how fresh an index's stored values, the stored bond quotes, or the stored Focus
// expectations are.
type State string

const (
	// Fresh is data refreshed successfully within StaleAfter.
	Fresh State = "fresh"
	// Stale is data whose last successful refresh is older than StaleAfter.
	Stale State = "stale"
	// Failed is data whose latest refresh failed.
	Failed State = "failed"
	// Missing is data that was never refreshed.
	Missing State = "missing"
)

// States returns every State.
func States() []State {
	return []State{Fresh, Stale, Failed, Missing}
}

// Freshness is how fresh some market data is. RefreshedAt and FailedAt are zero when it never
// happened.
type Freshness struct {
	State       State
	RefreshedAt time.Time
	FailedAt    time.Time
}

// IndexStatus is how fresh one index is.
type IndexStatus struct {
	Index indexes.Index
	Freshness
}

// Status is whether a refresh is pending or running, and how fresh every index, the bond quotes and
// the Focus expectations are.
type Status struct {
	Refreshing bool
	Indexes    []IndexStatus
	Quotes     Freshness
	Focus      Freshness
}

// Status reports how fresh every index, in the order of indexes.All, the bond quotes and the Focus
// expectations are at now.
func (j *Job) Status(ctx context.Context, now time.Time) (Status, error) {
	times, err := j.indexStore.RefreshTimes(ctx)
	if err != nil {
		return Status{}, fmt.Errorf("marketdata: status: %w", err)
	}

	quoteTimes, err := j.quoteStore.RefreshTimes(ctx)
	if err != nil {
		return Status{}, fmt.Errorf("marketdata: status: %w", err)
	}

	focusTimes, err := j.indexStore.ExpectationsRefreshTimes(ctx)
	if err != nil {
		return Status{}, fmt.Errorf("marketdata: status: %w", err)
	}

	byIndex := make(map[indexes.Index]indexes.RefreshTimes, len(times))
	for _, t := range times {
		byIndex[t.Index] = t
	}

	all := indexes.All()
	status := Status{
		Refreshing: j.refreshing(),
		Indexes:    make([]IndexStatus, 0, len(all)),
		Quotes:     freshness(quoteTimes.RefreshedAt, quoteTimes.FailedAt, now),
		Focus:      freshness(focusTimes.RefreshedAt, focusTimes.FailedAt, now),
	}

	for _, index := range all {
		r := byIndex[index]
		status.Indexes = append(status.Indexes, IndexStatus{
			Index:     index,
			Freshness: freshness(r.RefreshedAt, r.FailedAt, now),
		})
	}

	return status, nil
}

func (j *Job) refreshing() bool {
	j.mu.Lock()
	defer j.mu.Unlock()

	return j.pending || j.running
}

func freshness(refreshedAt, failedAt, now time.Time) Freshness {
	f := Freshness{State: Fresh, RefreshedAt: refreshedAt, FailedAt: failedAt}

	switch {
	case !failedAt.IsZero():
		f.State = Failed
	case refreshedAt.IsZero():
		f.State = Missing
	case now.Sub(refreshedAt) > StaleAfter:
		f.State = Stale
	}

	return f
}
