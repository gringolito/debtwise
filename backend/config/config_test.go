package config_test

import (
	"log/slog"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/gringolito/debtwise/backend/config"
)

type environment struct {
	port, dbPath, logLevel, radarToken string
}

func (e environment) getenv(key string) string {
	return map[string]string{
		"PORT": e.port, "DB_PATH": e.dbPath, "LOG_LEVEL": e.logLevel, "RADAR_TOKEN": e.radarToken,
	}[key]
}

func TestLoad(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name string
		env  environment
		want config.Config
	}{
		{
			name: "defaults when nothing is set",
			want: config.Config{Port: "8080", DBPath: "debtwise.db", LogLevel: slog.LevelInfo},
		},
		{
			name: "every setting from the environment",
			env:  environment{port: "9090", dbPath: "/data/debtwise.db", logLevel: "debug", radarToken: "rop_secret"},
			want: config.Config{
				Port: "9090", DBPath: "/data/debtwise.db", LogLevel: slog.LevelDebug, RadarToken: "rop_secret",
			},
		},
		{
			name: "log level in any case",
			env:  environment{logLevel: "WARN"},
			want: config.Config{Port: "8080", DBPath: "debtwise.db", LogLevel: slog.LevelWarn},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			got, err := config.Load(tt.env.getenv)
			require.NoError(t, err)
			assert.Equal(t, tt.want, got)
		})
	}
}

func TestLoadRejectsInvalidSettings(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name string
		env  environment
	}{
		{name: "unknown log level", env: environment{logLevel: "verbose"}},
		{name: "port that is not a number", env: environment{port: "http"}},
		{name: "port out of range", env: environment{port: "65536"}},
		{name: "port zero", env: environment{port: "0"}},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			_, err := config.Load(tt.env.getenv)
			require.Error(t, err)
		})
	}
}
