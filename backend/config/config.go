// Package config reads the server's settings from the environment.
package config

import (
	"cmp"
	"errors"
	"fmt"
	"log/slog"
	"strconv"
)

// QuoteProvider names the API that current bond prices load from.
type QuoteProvider string

const (
	// Radar is the Radar Opções API, chosen by RADAR_TOKEN.
	Radar QuoteProvider = "radar"
	// TesouroIndireto is the Tesouro Indireto API, chosen by TESOURO_INDIRETO_API_KEY.
	TesouroIndireto QuoteProvider = "tesouro_indireto"
)

type Config struct {
	// Port is the TCP port the API listens on.
	Port string
	// DBPath is the SQLite file that holds all of DebtWise's data.
	DBPath string
	// LogLevel is the lowest level the server logs.
	LogLevel slog.Level
	// QuoteProvider is the API current bond prices load from.
	QuoteProvider QuoteProvider
	// RadarToken is the Radar Opções API token, set when QuoteProvider is Radar.
	RadarToken string
	// TesouroIndiretoURL is the base URL of the Tesouro Indireto API, set when QuoteProvider is
	// TesouroIndireto.
	TesouroIndiretoURL string
	// TesouroIndiretoAPIKey is the Tesouro Indireto API key, set when QuoteProvider is
	// TesouroIndireto.
	TesouroIndiretoAPIKey string
}

// Load reads the settings through getenv, such as os.Getenv, and applies the defaults for
// those left unset.
func Load(getenv func(string) string) (Config, error) {
	cfg := Config{
		Port:                  cmp.Or(getenv("PORT"), "8080"),
		DBPath:                cmp.Or(getenv("DB_PATH"), "debtwise.db"),
		RadarToken:            getenv("RADAR_TOKEN"),
		TesouroIndiretoURL:    getenv("TESOURO_INDIRETO_URL"),
		TesouroIndiretoAPIKey: getenv("TESOURO_INDIRETO_API_KEY"),
	}

	port, err := strconv.ParseUint(cfg.Port, 10, 16)
	if err != nil || port == 0 {
		return Config{}, fmt.Errorf("config: PORT %q is not a TCP port", cfg.Port)
	}

	if err := cfg.LogLevel.UnmarshalText([]byte(cmp.Or(getenv("LOG_LEVEL"), "info"))); err != nil {
		return Config{}, fmt.Errorf("config: LOG_LEVEL: %w", err)
	}

	if cfg.QuoteProvider, err = cfg.quoteProvider(); err != nil {
		return Config{}, fmt.Errorf("config: %w", err)
	}

	return cfg, nil
}

// quoteProvider is the provider whose settings cfg holds. Exactly one provider has to be set, and
// Tesouro Indireto needs both its URL and its API key.
func (cfg Config) quoteProvider() (QuoteProvider, error) {
	switch {
	case cfg.TesouroIndiretoURL != "" && cfg.TesouroIndiretoAPIKey == "":
		return "", errors.New("TESOURO_INDIRETO_URL is set without TESOURO_INDIRETO_API_KEY")
	case cfg.RadarToken != "" && cfg.TesouroIndiretoAPIKey != "":
		return "", errors.New("RADAR_TOKEN and TESOURO_INDIRETO_API_KEY are both set; set only the one whose API bond prices load from")
	case cfg.RadarToken != "":
		return Radar, nil
	case cfg.TesouroIndiretoAPIKey == "":
		return "", errors.New("neither RADAR_TOKEN nor TESOURO_INDIRETO_API_KEY is set; set the one whose API bond prices load from")
	case cfg.TesouroIndiretoURL == "":
		return "", errors.New("TESOURO_INDIRETO_API_KEY is set without TESOURO_INDIRETO_URL")
	default:
		return TesouroIndireto, nil
	}
}
