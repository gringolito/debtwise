// Package config reads the server's settings from the environment.
package config

import (
	"cmp"
	"fmt"
	"log/slog"
	"strconv"
)

type Config struct {
	// Port is the TCP port the API listens on.
	Port string
	// DBPath is the SQLite file that holds all of DebtWise's data.
	DBPath string
	// LogLevel is the lowest level the server logs.
	LogLevel slog.Level
	// RadarToken is the Radar Opções API token that current bond prices load with. Without it
	// every refresh of the bond prices fails.
	RadarToken string
}

// Load reads the settings through getenv, such as os.Getenv, and applies the defaults for
// those left unset.
func Load(getenv func(string) string) (Config, error) {
	cfg := Config{
		Port:       cmp.Or(getenv("PORT"), "8080"),
		DBPath:     cmp.Or(getenv("DB_PATH"), "debtwise.db"),
		RadarToken: getenv("RADAR_TOKEN"),
	}

	port, err := strconv.ParseUint(cfg.Port, 10, 16)
	if err != nil || port == 0 {
		return Config{}, fmt.Errorf("config: PORT %q is not a TCP port", cfg.Port)
	}

	if err := cfg.LogLevel.UnmarshalText([]byte(cmp.Or(getenv("LOG_LEVEL"), "info"))); err != nil {
		return Config{}, fmt.Errorf("config: LOG_LEVEL: %w", err)
	}

	return cfg, nil
}
