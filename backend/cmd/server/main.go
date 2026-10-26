// Command server runs DebtWise's API. It applies pending database migrations before it starts
// listening, and refreshes market data in the background while it serves.
package main

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/gringolito/debtwise/backend/api"
	"github.com/gringolito/debtwise/backend/bonds"
	"github.com/gringolito/debtwise/backend/config"
	"github.com/gringolito/debtwise/backend/db"
	"github.com/gringolito/debtwise/backend/indexes"
	"github.com/gringolito/debtwise/backend/marketdata"
	"github.com/gringolito/debtwise/backend/marketdata/radar"
	"github.com/gringolito/debtwise/backend/marketdata/sgs"
	"github.com/gringolito/debtwise/backend/mortgage"
)

func main() {
	var level slog.LevelVar

	logger := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: &level}))
	slog.SetDefault(logger)

	if err := run(logger, &level); err != nil {
		logger.Error("server exited with error", "err", err)
		os.Exit(1)
	}
}

func run(logger *slog.Logger, level *slog.LevelVar) error {
	cfg, err := config.Load(os.Getenv)
	if err != nil {
		return err
	}

	level.Set(cfg.LogLevel)

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	conn, err := db.Open(ctx, cfg.DBPath)
	if err != nil {
		return err
	}

	defer func() { _ = conn.Close() }()

	applied, err := db.Migrate(ctx, conn)
	if err != nil {
		return err
	}

	logger.InfoContext(ctx, "database ready", "path", cfg.DBPath, "applied_migrations", applied)

	store := indexes.NewStore(conn)
	quotes := bonds.NewStore(conn)
	job := marketdata.New(sgs.New(), store, radar.New(cfg.RadarToken), quotes, marketdata.WithLogger(logger))

	jobCtx, stopJob := context.WithCancel(ctx)
	jobDone := make(chan struct{})

	go func() {
		defer close(jobDone)

		job.Run(jobCtx)
	}()

	// The job writes to the database, so it stops before the database closes.
	defer func() {
		stopJob()
		<-jobDone
	}()

	srv := &http.Server{
		Addr:              ":" + cfg.Port,
		Handler:           api.NewHandler(db.New(conn), store, job, mortgage.NewStore(conn), quotes, api.WithLogger(logger)),
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       10 * time.Second,
		WriteTimeout:      30 * time.Second,
		IdleTimeout:       2 * time.Minute,
	}

	logger.InfoContext(ctx, "starting server", "port", cfg.Port)

	return serve(ctx, srv)
}

func serve(ctx context.Context, srv *http.Server) error {
	shutdownDone := make(chan error, 1)

	go func() {
		<-ctx.Done()

		shutdownCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), 10*time.Second)
		defer cancel()

		shutdownDone <- srv.Shutdown(shutdownCtx)
	}()

	if err := srv.ListenAndServe(); !errors.Is(err, http.ErrServerClosed) {
		return fmt.Errorf("serve: %w", err)
	}

	return <-shutdownDone
}
