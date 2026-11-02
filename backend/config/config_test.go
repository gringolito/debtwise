package config_test

import (
	"log/slog"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/gringolito/debtwise/backend/config"
)

type environment struct {
	port, dbPath, logLevel, radarToken, tesouroIndiretoURL, tesouroIndiretoAPIKey string
}

func (e environment) getenv(key string) string {
	return map[string]string{
		"PORT": e.port, "DB_PATH": e.dbPath, "LOG_LEVEL": e.logLevel, "RADAR_TOKEN": e.radarToken,
		"TESOURO_INDIRETO_URL": e.tesouroIndiretoURL, "TESOURO_INDIRETO_API_KEY": e.tesouroIndiretoAPIKey,
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
			name: "defaults when only a quote provider is set",
			env:  environment{radarToken: "rop_secret"},
			want: config.Config{
				Port: "8080", DBPath: "debtwise.db", LogLevel: slog.LevelInfo,
				QuoteProvider: config.Radar, RadarToken: "rop_secret",
			},
		},
		{
			name: "every setting from the environment",
			env:  environment{port: "9090", dbPath: "/data/debtwise.db", logLevel: "debug", radarToken: "rop_secret"},
			want: config.Config{
				Port: "9090", DBPath: "/data/debtwise.db", LogLevel: slog.LevelDebug,
				QuoteProvider: config.Radar, RadarToken: "rop_secret",
			},
		},
		{
			name: "log level in any case",
			env:  environment{logLevel: "WARN", radarToken: "rop_secret"},
			want: config.Config{
				Port: "8080", DBPath: "debtwise.db", LogLevel: slog.LevelWarn,
				QuoteProvider: config.Radar, RadarToken: "rop_secret",
			},
		},
		{
			name: "tesouro indireto with its URL and API key",
			env:  environment{tesouroIndiretoURL: "https://ti.example.com", tesouroIndiretoAPIKey: "ti_secret"},
			want: config.Config{
				Port: "8080", DBPath: "debtwise.db", LogLevel: slog.LevelInfo,
				QuoteProvider:         config.TesouroIndireto,
				TesouroIndiretoURL:    "https://ti.example.com",
				TesouroIndiretoAPIKey: "ti_secret",
			},
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
		{name: "unknown log level", env: environment{logLevel: "verbose", radarToken: "rop_secret"}},
		{name: "port that is not a number", env: environment{port: "http", radarToken: "rop_secret"}},
		{name: "port out of range", env: environment{port: "65536", radarToken: "rop_secret"}},
		{name: "port zero", env: environment{port: "0", radarToken: "rop_secret"}},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			_, err := config.Load(tt.env.getenv)
			require.Error(t, err)
		})
	}
}

func TestLoadRejectsAmbiguousOrIncompleteQuoteProviders(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name  string
		env   environment
		names []string // the variables the error names
	}{
		{
			name:  "no provider",
			names: []string{"RADAR_TOKEN", "TESOURO_INDIRETO_API_KEY"},
		},
		{
			name: "both providers",
			env: environment{
				radarToken: "rop_secret", tesouroIndiretoURL: "https://ti.example.com", tesouroIndiretoAPIKey: "ti_secret",
			},
			names: []string{"RADAR_TOKEN", "TESOURO_INDIRETO_API_KEY"},
		},
		{
			name:  "both credentials without the tesouro indireto URL",
			env:   environment{radarToken: "rop_secret", tesouroIndiretoAPIKey: "ti_secret"},
			names: []string{"RADAR_TOKEN", "TESOURO_INDIRETO_API_KEY"},
		},
		{
			name:  "tesouro indireto API key without its URL",
			env:   environment{tesouroIndiretoAPIKey: "ti_secret"},
			names: []string{"TESOURO_INDIRETO_API_KEY", "TESOURO_INDIRETO_URL"},
		},
		{
			name:  "tesouro indireto URL without its API key",
			env:   environment{tesouroIndiretoURL: "https://ti.example.com"},
			names: []string{"TESOURO_INDIRETO_URL", "TESOURO_INDIRETO_API_KEY"},
		},
		{
			name:  "radar token with a tesouro indireto URL",
			env:   environment{radarToken: "rop_secret", tesouroIndiretoURL: "https://ti.example.com"},
			names: []string{"TESOURO_INDIRETO_URL", "TESOURO_INDIRETO_API_KEY"},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			_, err := config.Load(tt.env.getenv)
			require.Error(t, err)

			for _, name := range tt.names {
				assert.Contains(t, err.Error(), name)
			}
		})
	}
}
