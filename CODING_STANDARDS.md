# Coding standards

These are the judgement calls a reviewer checks in every change. Rules a tool already enforces
live in that tool (`golangci-lint`, the OpenAPI and sqlc checks, and `oxlint` with `@shadcn/lint`
in the frontend) and are not repeated here. The rest of the project's standards are in:

- `docs/adr/`: decisions every change follows until a newer ADR supersedes them.
- `GLOSSARY.md`: the domain vocabulary that names in code, the API and the UI use.

## Tests

### The expected value is independent of the code under test

A test's expected value comes from somewhere other than the code it checks: a literal, data the test
wrote itself, or a count taken from the migration seed. If both sides of an assertion come from the
same production function, such as an expected schedule built with the schedule function the test
checks, the test passes whatever that function does.

### Moved tests keep their assertions

When code moves, its tests move with it and keep every assertion. They can be strengthened in the
same change. Dropping or loosening an assertion needs a reason in the pull request. Compare the old
and new tests of moved code.

### Assert the whole list

When a response or result carries a list, such as error details or the list of Lots, assert
its length and every entry, not only the first. A test that only checked `errors[0]` let a
duplicated error detail through.

### Refactors keep failure statuses

A change that moves an operation or its error mapping keeps the status code and error details of
every failure the old code mapped: unknown or inaccessible IDs, invalid input, missing inputs. Make
sure handler tests cover those failures before the move, so a status that silently becomes a 500
fails a test.

### Other modules' data comes from their own code

Tests create and read another package's data through `testutil/seed`, which calls that package's
own operations. Raw SQL in a test is for the package's own tables, or for the few writes that have
no Go path, which live in `testutil/seed` once each.

### Cases that share a body share a table

When several cases run the same steps on different inputs, write them as a table and run each row
with `t.Run` under a name that says what the case covers. A failure then names its case, and a new
case is one more row. Cases whose setup or assertions differ stay separate tests.

```go
func TestParseThreshold(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name    string
		input   string
		wantErr bool
	}{
		{name: "percentage", input: "5%"},
		{name: "not a number", input: "five", wantErr: true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			_, err := ParseThreshold(tt.input)
			assert.Equal(t, tt.wantErr, err != nil, "error: %v", err)
		})
	}
}
```

### Fakes are written by hand

A test double is a small hand-written type that satisfies the consumer's interface. Do not add mock
generators or BDD frameworks: a generated mock pins the calls the code makes rather than what it
does, and a test should read as plain Go.

### Tests wait on events, not on time

A test never sleeps to give a goroutine time to run. That passes on a fast machine and flakes on a
slow one. Wait on the event itself: a channel, `require.Eventually` on a condition, or a helper such
as one that polls for the state the test expects. Code whose behavior depends on timers or
timeouts is tested inside `testing/synctest`, whose fake clock makes the wait instant
and exact.

```go
func TestTimeout(t *testing.T) {
	synctest.Test(t, func(t *testing.T) {
		ctx, cancel := context.WithTimeout(t.Context(), time.Second)
		defer cancel()

		time.Sleep(2 * time.Second) // instant: the fake clock advances once every goroutine blocks
		require.ErrorIs(t, ctx.Err(), context.DeadlineExceeded)
	})
}
```

### Large fixtures live in `testdata`

Recorded responses, golden outputs and other inputs too large to read inline go in a `testdata`
directory next to the test. The Go tool ignores that directory when it builds packages.

### Assertion helpers call `t.Helper()`

A helper that can fail the test calls `t.Helper()`, so the failure points at the line that called
it rather than at a line inside the helper.

### No forwarding-only helpers

A test helper that only calls `t.Helper()` and passes its arguments to another helper adds a name
and nothing else.

## Go code

### Clear beats clever

Write the version a reader follows on the first pass. Handle errors and edge cases first and
return, so the main path runs down the left margin with no `else`. A function whose control flow
needs a second reading needs rewriting.

```go
func loadConfig(path string) (Config, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return Config{}, fmt.Errorf("config: read %s: %w", path, err)
	}

	var cfg Config
	if err := json.Unmarshal(data, &cfg); err != nil {
		return Config{}, fmt.Errorf("config: parse %s: %w", path, err)
	}

	return cfg, nil
}
```

### Money is never a float

Money, rates, prices and index values are `decimal.Decimal` from the `decimal` package (ADR-0003),
from parsing to the API response. A `float64` in that path loses cents that Tesouro's truncation
rules and the bank's statements keep. Only `decimal` imports `apd`, which `depguard` enforces; no
lint catches a stray `float64`, so review does.

### Zero values are ready to use

Prefer types whose zero value works without a constructor, as `sync.Mutex` and `bytes.Buffer` do.
Callers then declare and use them without setup code that can be forgotten.

```go
type Counter struct {
	mu    sync.Mutex
	count int
}

func (c *Counter) Inc() {
	c.mu.Lock()
	defer c.mu.Unlock()

	c.count++
}
```

### Interfaces are found, not planned

Start with concrete types. An interface appears when a consumer has to accept more than one
implementation, a test fake included, and the consumer declares it with only the methods it calls.

```go
// QuoteStore is the subset of *bonds.Store the marketdata refresh job writes, declared in marketdata.
type QuoteStore interface {
	SaveQuotes(ctx context.Context, quotes []bonds.Quote) error
}
```

A function accepts the narrowest interface it needs, such as `io.Reader` rather than `*os.File`,
and returns a concrete type, so callers keep every method without a type assertion.

### Generics remove repeated algorithms

Use a type parameter when the same algorithm runs over several concrete types, with a constraint
that states what the algorithm needs: `comparable` for map keys and equality, `cmp.Ordered` for
ordering. Polymorphism is the job of a small interface, so do not build generic repositories,
services or base types. `any` as a constraint means the algorithm needs nothing from the type, not
that the type is still undecided. Write the concrete version first and generalize once the same
logic repeats across three types.

```go
// Good: one algorithm, any ordered type.
func Clamp[T cmp.Ordered](v, lo, hi T) T {
	return min(max(v, lo), hi)
}

// Bad: generics standing in for polymorphism.
type Repository[T any] interface {
	Find(ctx context.Context, id uuid.UUID) (T, error)
	Save(ctx context.Context, entity T) error
}
```

### The standard library comes before a dependency

Before adding a module or writing a helper, check the standard library. `slices`, `maps`, `cmp`,
`iter` and `errors.Join` cover most of what older code pulled in packages for: `cmp.Or` applies a
default, `slices.Sorted(maps.Keys(m))` returns sorted keys, and `errors.Join` replaces `multierr`.
`modernize` flags some hand-written versions; review catches the rest. A new third-party module
needs a reason in the pull request that the standard library does not cover.

```go
cfg.Timeout = cmp.Or(cfg.Timeout, 30*time.Second)
keys := slices.Sorted(maps.Keys(weights))
err := errors.Join(errs...)
```

### Sequences are returned as iterators

An API that exposes a large or lazily produced sequence returns `iter.Seq` or `iter.Seq2`, which
callers read with a plain `range`, instead of building a slice. Do not write an iterator type with
`Next` and `HasNext` methods.

```go
func (s *Schedule) Months() iter.Seq[Month] {
	return func(yield func(Month) bool) {
		for _, m := range s.months {
			if !yield(m) {
				return
			}
		}
	}
}

for month := range schedule.Months() {
	// ...
}
```

### Optional settings are functional options

A constructor takes what it requires as parameters and everything optional as `Option` functions,
and sets the defaults itself before applying them.

```go
type Option func(*Client)

func WithThrottle(d time.Duration) Option {
	return func(c *Client) { c.throttle = d }
}

func New(opts ...Option) *Client {
	c := &Client{throttle: DefaultThrottle}
	for _, opt := range opts {
		opt(c)
	}

	return c
}
```

### Dependencies are passed in, not reached for

Backend packages keep no package-level mutable state. Loggers, clients and settings arrive
as parameters or options, and the composition root (`cmd/server`) builds them. Two instances
can then coexist in one process, and tests that use them run in parallel. A component that takes a
`*slog.Logger` falls back to `slog.Default()` when given nil.

### Names don't stutter or say Get

A name does not repeat its package: `bonds.Quote`, not `bonds.BondQuote`. Go names carry no
`Get` prefix. A method that returns a field is named after the field, `Owner()` rather than
`GetOwner()`. A lookup that can come back empty says so with `Find`: `FindLot` returns
`ErrLotNotFound` when there is no such Lot. A name does not borrow its HTTP verb from the
endpoint that calls it.

## Errors and logging

### Wrapped errors say what was being done

Wrap an error with the operation that failed and the values that identify it:
`bonds: save quote %s: %w`. The chain of wraps reads as the path to the failure, so it needs no
stack trace. When a caller has to branch on a failure, return a sentinel or typed error it can
match with `errors.Is` or `errors.As`, such as `bonds.ErrLotNotFound`.

### Log or return, not both

An error is logged once, where it stops travelling: the HTTP boundary, a background job, or `main`.
Code below that returns it. Logging and returning the same error records one failure several times.

### API handlers return failures, and the HTTP boundary logs them

That API logs each failed request once, with its `request_id`, operation ID and status: a 5xx at
Error with the full text of the error the handler returned, a 4xx at Debug with the problem detail.
Handlers and workflows return errors and never log them.

A 4xx answers its problem detail, so its message is written for the user. A 5xx answers only its
status, a generic detail and the `request_id`, so a handler returns the cause as it is. To answer a
5xx other than 500, wrap the cause in the status error, and the log keeps the chain:

```go
return nil, fmt.Errorf("%w: %w", huma.Error503ServiceUnavailable("market data is unavailable"), err)
```

### Log levels match what a reader does with the entry

Debug is internal state that matters only while tracing a problem and may be high volume. Info is a
lifecycle event, such as a server starting. Warn is a problem the code recovered from, such as a
retry. Error is a failure someone needs to look at. Fields shared by a run of entries go on a logger
made with `With`, and related fields are grouped with `slog.Group`.

```go
logger := s.logger.With("lot_id", lotID)

logger.DebugContext(ctx, "price cache miss")
logger.InfoContext(ctx, "starting server", "port", cfg.Port)
logger.WarnContext(ctx, "retrying quote fetch", "attempt", n)
logger.ErrorContext(ctx, "price refresh failed", "err", err)
```

## Concurrency

### Every goroutine has a way to stop

Before starting a goroutine, know what ends it, usually a canceled `context.Context` or a closed
channel. Work that has to outlive the request that started it keeps the request's values without
its cancellation through `context.WithoutCancel`.

### Bounded fan-out uses errgroup

Fan-out over input of unknown size runs through `errgroup` with `SetLimit`, which bounds the
goroutines and returns the first error. Do not hand-roll a semaphore channel or keep a static
worker pool, since goroutines are cheap enough to start per item. When there are no errors to
collect, `sync.WaitGroup.Go` is enough.

```go
func FetchAll(ctx context.Context, series []string, limit int) error {
	g, ctx := errgroup.WithContext(ctx)
	g.SetLimit(limit)

	for _, code := range series {
		g.Go(func() error { return fetch(ctx, code) })
	}

	return g.Wait()
}
```

### Channels move data, mutexes guard it

When data passes from one goroutine to another, hand it over on a channel so one goroutine owns it
at a time. A mutex is for state that stays in one place and is reached from several goroutines.

## Domain packages

### No hidden I/O

Standard library calls that reach outside the process count too: `time.LoadLocation` reads the zone
database from disk, and `time.Now` and `os` read the clock and the environment. The caller (a
handler, a job or `cmd/server`) loads these and passes the results in, such as a `*time.Location`
or `now`.

## HTTP API

### Response data carries codes, not copy

A response field the UI shows to the user carries a code and the data behind it, never a sentence.
The API says which option a verdict favours with a code such as `invest`, and the frontend writes
the text. User-facing copy then lives in one place and can be translated.

API errors are not user-facing copy. The `detail` and `errors[].message` of a problem document are
written for API consumers and stay in English.

### Endpoint descriptions are written for API consumers

Operation `Summary` and `Description` and `doc:"..."` struct tags feed the generated OpenAPI
contract. Its readers are API consumers, not people working on the server, so write them for that
audience.

- An endpoint description says what the operation does for a client, its use cases, and any
  externally visible side effect. It does not state internal behaviours or business rules, such as
  how the Advantage is computed, which months count as projected, or what is excluded and why.
  Those belong in an ADR or the glossary.
- A field `doc` tag says what the field means to a client: purpose, units, format, allowed values.
  It does not say how the server stores, computes or validates it.
- Neither mentions implementation details (tables, services, algorithms, validation order,
  background jobs) or lists HTTP status codes.

### Servers set timeouts and drain on shutdown

Every `http.Server` sets `ReadHeaderTimeout`, `ReadTimeout`, `WriteTimeout` and `IdleTimeout`.
Without them one slow client holds a connection open indefinitely, and `gosec` checks only the
first. A route that needs a shorter limit than `WriteTimeout` uses `http.TimeoutHandler` or a
deadline on the request context.

On a termination signal the server calls `Shutdown`, which stops accepting connections and waits
for in-flight requests to finish. Shutdown gets a fresh context with its own deadline, because the
signal context is already canceled. `ListenAndServe` returns `http.ErrServerClosed` as soon as
Shutdown starts, so the program waits for Shutdown to return before it exits; otherwise in-flight
requests are cut off.

Shutdown does not cancel the requests it waits for, and it neither closes nor waits for hijacked
connections such as WebSockets. A long-lived handler, such as a stream, therefore needs its own
shutdown signal, registered with `RegisterOnShutdown`, and returns when either that signal or
`r.Context()` is done. Watching `r.Context()` alone holds Shutdown until its deadline.

```go
func serve(ctx context.Context, srv *http.Server) error {
	ctx, stop := signal.NotifyContext(ctx, os.Interrupt, syscall.SIGTERM)
	defer stop()

	shutdownDone := make(chan error, 1)

	go func() {
		<-ctx.Done()

		shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()

		shutdownDone <- srv.Shutdown(shutdownCtx)
	}()

	if err := srv.ListenAndServe(); !errors.Is(err, http.ErrServerClosed) {
		return err
	}

	return <-shutdownDone
}

// A stream handler built with streams, where streams is canceled through
// srv.RegisterOnShutdown, returns on whichever comes first.
select {
case <-r.Context().Done():
case <-streams.Done():
}
```

### Outbound calls have a deadline

Every HTTP client sets a timeout; `http.DefaultClient` has none. Each `marketdata` source client
takes its timeout as a constructor option.

## Frontend components

### `components/ui/` is our code

The files in `frontend/src/components/ui/` came from the shadcn CLI, but the repository owns them
and they change like any other source. When the design needs something a component does not offer,
change the component there. Keep the names shadcn gave it: the exported components, their
`data-slot` attributes and the `*Variants` function. Code written from shadcn's documentation then
works here unchanged.

`npx shadcn add <name> --overwrite` replaces the file with upstream's version. Diff the result
against the committed file and carry the local changes over before committing. A local change that
alters upstream behaviour, rather than adding a variant, gets a comment saying why, so whoever runs
the next overwrite knows the difference is deliberate.

### Variants are `cva` entries

`shadcn/no-restyle` sends a screen that needs a different look to a new variant, but the lint
rules that check class strings are off inside `components/ui/`. There, write each look as an entry
in the component's `cva` call, built from theme tokens, and let callers choose it through the
`variant` or `size` prop. Do not build the class string with ternaries or template literals: a
`cva` entry is one place to read and change the look, and `VariantProps` types the prop from it.

```tsx
// Good: the look is a named entry.
const badgeVariants = cva("...", {
  variants: {
    variant: {
      default: "bg-primary text-primary-foreground [a]:hover:bg-primary/80",
      muted: "bg-muted text-muted-foreground",
    },
  },
});

<Comp className={cn(badgeVariants({ variant }), className)} {...props} />

// Bad: the look is a branch inside the component.
<Comp className={`${base} ${muted ? "bg-muted text-muted-foreground" : "bg-primary"}`} />
```

### New colors are theme variables with a dark value

When a design needs a color the theme lacks, such as a success or warning text, add it the way
`src/index.css` declares `destructive`: an oklch value under `:root`, another under `.dark`, and a
`--color-<name>: var(--<name>)` line in `@theme inline`. Tailwind then generates `text-<name>` and
`bg-<name>`, and the color switches with the theme. Name the token for what it means, not for its
hue, so `success` rather than `green`. A value written straight into `@theme` has no dark
counterpart.

```css
:root {
  --success: oklch(0.6 0.15 150);
}

.dark {
  --success: oklch(0.75 0.15 150);
}

@theme inline {
  --color-success: var(--success);
}
```

### Composites are assembled from parts

A component that grows boolean props to switch sections on and off, such as `showDelete` or
`withHistory`, is hard to read at the call site and harder to change. Build screens from the parts
shadcn already splits, such as `DialogHeader`, `DialogTitle` and `DialogFooter`, and let each caller
include the parts it needs. State and behavior that several screens share go in a hook that returns
data and handlers, as a `useLotEditor` hook would for the pencil on a Lot, and a component such as
`EditLotButton` renders them.

```tsx
// Bad: flags decide the structure.
<LotDialog lot={lot} showHistory showDelete />

// Good: the caller assembles the parts.
<Dialog open={open} onOpenChange={setOpen}>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>Edit {lot.bond}</DialogTitle>
    </DialogHeader>
    <LotForm lot={lot} />
    <DialogFooter>
      <DeleteLotButton lot={lot} />
    </DialogFooter>
  </DialogContent>
</Dialog>
```

### Wrappers take the props of what they wrap

A component that renders one element or one shadcn component accepts all of its props, typed as
`React.ComponentProps<"main">` or `React.ComponentProps<typeof Button>`, and spreads the rest onto
it. Callers then pass `aria-*` attributes, event handlers and `ref` without the wrapper listing
each one. React 19 passes `ref` as an ordinary prop, so it arrives in the rest props and the spread
delivers it to the element. Merge the caller's `className` last through `cn`, so `tailwind-merge`
lets it override the defaults.

```tsx
export function Page({ className, ...props }: React.ComponentProps<"main">) {
  return (
    <main
      className={cn("mx-auto w-full max-w-screen-2xl px-6 py-8 text-left", className)}
      {...props}
    />
  );
}
```

### Interactive widgets come from Radix

Dialogs, popovers, menus, comboboxes and tooltips get focus trapping, keyboard navigation and ARIA
state from the Radix primitives under the shadcn components. When a screen needs a widget that
`components/ui/` does not have yet, add it with `npx shadcn add <name>` from `frontend/` instead of
writing key handlers and `aria-*` bookkeeping by hand.

## Documentation

### Markdown wraps at 100 columns

Prose in Markdown files wraps at 100 characters. A reviewer then reads the text without scrolling
sideways, and a diff marks the lines that changed instead of a whole paragraph. A list item's
continuation lines are indented to its text. Code blocks, table rows, headings and URLs are exempt
from this limit, because a break changes how they render. When a change edits a paragraph that is
still one long line, rewrap that paragraph.
