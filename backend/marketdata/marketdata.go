// Package marketdata refreshes DebtWise's market data from its external sources, on a schedule and
// on demand, and reports how fresh each index is.
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
)

const (
	// DefaultInterval is how often Run refreshes when no WithInterval option sets it.
	DefaultInterval = 6 * time.Hour
	// StaleAfter is how long after its last successful refresh an index counts as stale.
	StaleAfter = 24 * time.Hour
	// lookahead extends every request past today, because the Selic target series publishes the
	// target in force up to the next Copom meeting.
	lookahead = 90 * 24 * time.Hour
)

// Source is the subset of *sgs.Client the job reads.
type Source interface {
	Observations(ctx context.Context, series int, from, to time.Time) ([]sgs.Observation, error)
}

// Store is the subset of *indexes.Store the job reads and writes.
type Store interface {
	LatestPeriodStart(ctx context.Context, index indexes.Index) (time.Time, error)
	SaveRefresh(ctx context.Context, index indexes.Index, values []indexes.Value, at time.Time) error
	SaveFailure(ctx context.Context, index indexes.Index, values []indexes.Value, at time.Time) error
	RefreshTimes(ctx context.Context) ([]indexes.RefreshTimes, error)
}

// sgsIndex is an index and the SGS series it is published as.
type sgsIndex struct {
	index  indexes.Index
	series int
}

// sgsIndexes returns every index with its SGS series, in the order of indexes.All.
func sgsIndexes() []sgsIndex {
	return []sgsIndex{
		{index: indexes.TR, series: 226},
		{index: indexes.PoupancaYield, series: 195},
		{index: indexes.SelicTarget, series: 432},
		{index: indexes.Selic, series: 11},
		{index: indexes.IPCA, series: 433},
	}
}

// backfillFrom is the first date fetched for an index that has no values yet.
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

// Job refreshes every index from its source.
type Job struct {
	source   Source
	store    Store
	logger   *slog.Logger
	interval time.Duration
	trigger  chan struct{}

	mu      sync.Mutex
	pending bool
	running bool
}

// New returns a job with a refresh already pending, which Run starts with.
func New(source Source, store Store, opts ...Option) *Job {
	j := &Job{source: source, store: store, interval: DefaultInterval, trigger: make(chan struct{}, 1)}
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

// Refresh fetches every index from its source and stores what it fetched at now. An index whose
// fetch fails keeps its values, gains those fetched before the failure, and has the failure
// recorded; the others are stored anyway.
func (j *Job) Refresh(ctx context.Context, now time.Time) error {
	all := sgsIndexes()
	errs := make([]error, len(all))

	var wg sync.WaitGroup
	for i, s := range all {
		wg.Go(func() { errs[i] = j.refresh(ctx, s, now) })
	}

	wg.Wait()

	return errors.Join(errs...)
}

func (j *Job) refresh(ctx context.Context, s sgsIndex, now time.Time) error {
	values, err := j.fetch(ctx, s, now)
	if err == nil {
		err = j.store.SaveRefresh(ctx, s.index, values, now)
	}

	if err == nil {
		return nil
	}

	// A refresh cut short by its caller is no failure of the source.
	if ctx.Err() == nil {
		if saveErr := j.store.SaveFailure(ctx, s.index, values, now); saveErr != nil {
			err = errors.Join(err, saveErr)
		}
	}

	return fmt.Errorf("marketdata: refresh %s: %w", s.index, err)
}

// fetch returns the values of an index from its latest stored period on, so that values its
// source revised for that period replace the stored ones. When the source fails partway, fetch
// returns the values fetched before the failure with the error.
func (j *Job) fetch(ctx context.Context, s sgsIndex, now time.Time) ([]indexes.Value, error) {
	from, err := j.store.LatestPeriodStart(ctx, s.index)
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

	observations, err := j.source.Observations(ctx, s.series, from, now.Add(lookahead))

	values := make([]indexes.Value, 0, len(observations))
	for _, o := range observations {
		end := o.End
		if end.IsZero() {
			end = o.Start
		}

		values = append(values, indexes.Value{PeriodStart: o.Start, PeriodEnd: end, Value: o.Value, FetchedAt: now})
	}

	return values, err
}

// State is how fresh an index's stored values are.
type State string

const (
	// Fresh is an index refreshed successfully within StaleAfter.
	Fresh State = "fresh"
	// Stale is an index whose last successful refresh is older than StaleAfter.
	Stale State = "stale"
	// Failed is an index whose latest refresh failed.
	Failed State = "failed"
	// Missing is an index that was never refreshed.
	Missing State = "missing"
)

// IndexStatus is how fresh one index is. RefreshedAt and FailedAt are zero when it never
// happened.
type IndexStatus struct {
	Index       indexes.Index
	State       State
	RefreshedAt time.Time
	FailedAt    time.Time
}

// Status is whether a refresh is pending or running, and how fresh every index is.
type Status struct {
	Refreshing bool
	Indexes    []IndexStatus
}

// Status reports how fresh every index is at now, in the order of indexes.All.
func (j *Job) Status(ctx context.Context, now time.Time) (Status, error) {
	times, err := j.store.RefreshTimes(ctx)
	if err != nil {
		return Status{}, fmt.Errorf("marketdata: status: %w", err)
	}

	byIndex := make(map[indexes.Index]indexes.RefreshTimes, len(times))
	for _, t := range times {
		byIndex[t.Index] = t
	}

	all := indexes.All()
	status := Status{Refreshing: j.refreshing(), Indexes: make([]IndexStatus, 0, len(all))}

	for _, index := range all {
		r := byIndex[index]
		status.Indexes = append(status.Indexes, IndexStatus{
			Index:       index,
			State:       state(r, now),
			RefreshedAt: r.RefreshedAt,
			FailedAt:    r.FailedAt,
		})
	}

	return status, nil
}

func (j *Job) refreshing() bool {
	j.mu.Lock()
	defer j.mu.Unlock()

	return j.pending || j.running
}

func state(r indexes.RefreshTimes, now time.Time) State {
	switch {
	case !r.FailedAt.IsZero():
		return Failed
	case r.RefreshedAt.IsZero():
		return Missing
	case now.Sub(r.RefreshedAt) > StaleAfter:
		return Stale
	default:
		return Fresh
	}
}
