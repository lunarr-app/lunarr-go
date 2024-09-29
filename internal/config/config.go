package config

import (
	"os"
	"strings"

	"github.com/knadh/koanf/parsers/yaml"
	"github.com/knadh/koanf/providers/confmap"
	"github.com/knadh/koanf/providers/env"
	"github.com/knadh/koanf/providers/file"
	"github.com/knadh/koanf/v2"
	"github.com/rs/zerolog/log"
)

var (
	k   *koanf.Koanf
	cfg *Config
)

type Config struct {
	Server struct {
		Host string `koanf:"host"`
		Port int    `koanf:"port"`
	} `koanf:"server"`
	TMDb struct {
		APIKey string `koanf:"api_key"`
	} `koanf:"tmdb"`
	AppDataDir string `koanf:"app_data_dir"`
	Database   struct {
		Driver   string `koanf:"driver"`
		Postgres struct {
			Host     string `koanf:"host"`
			Port     int    `koanf:"port"`
			User     string `koanf:"user"`
			Password string `koanf:"password"`
			DBName   string `koanf:"dbname"`
		} `koanf:"postgres"`
	} `koanf:"database"`
}

func InitConfig() {
	k = koanf.New(".")

	defaultAppDataDir := getDefaultAppDataDir()

	// Load default configuration values
	k.Load(confmap.Provider(map[string]interface{}{
		"server.host":                "127.0.0.1",
		"server.port":                8484,
		"tmdb.api_key":               "",
		"app_data_dir":               defaultAppDataDir,
		"database.driver":            "sqlite", // Default to SQLite
		"database.postgres.host":     "localhost",
		"database.postgres.port":     5432,
		"database.postgres.user":     "postgres",
		"database.postgres.password": "",
		"database.postgres.dbname":   "lunarrdb",
	}, "."), nil)

	// Load configuration from YAML file (if provided)
	yamlPath := os.Getenv("LUNARR_YAML_PATH")
	if yamlPath == "" {
		yamlPath = "lunarr.yml"
	}

	if err := k.Load(file.Provider(yamlPath), yaml.Parser()); err != nil {
		log.Warn().Msgf("No configuration file found or error reading '%s': %v", yamlPath, err)
	}

	// Override with environment variables (prefix LUNARR_)
	k.Load(env.Provider("LUNARR_", ".", func(s string) string {
		s = strings.ToLower(s)
		switch s {
		case "lunarr_server_host":
			return "server.host"
		case "lunarr_server_port":
			return "server.port"
		case "lunarr_tmdb_api_key":
			return "tmdb.api_key"
		case "lunarr_app_data_dir":
			return "app_data_dir"
		case "lunarr_database_driver":
			return "database.driver"
		case "lunarr_database_postgres_host":
			return "database.postgres.host"
		case "lunarr_database_postgres_port":
			return "database.postgres.port"
		case "lunarr_database_postgres_user":
			return "database.postgres.user"
		case "lunarr_database_postgres_password":
			return "database.postgres.password"
		case "lunarr_database_postgres_dbname":
			return "database.postgres.dbname"
		default:
			return s
		}
	}), nil)

	// Unmarshal into the configuration struct
	cfg = &Config{}
	if err := k.Unmarshal("", cfg); err != nil {
		log.Fatal().Msgf("Error unmarshalling configuration: %v", err)
	}

	// Set default app data directory if not provided
	if cfg.AppDataDir == "" {
		cfg.AppDataDir = defaultAppDataDir
	}

	// Log the configuration settings
	log.Info().Msgf("Server bind IP address: %s", cfg.Server.Host)
	log.Info().Msgf("Server port: %d", cfg.Server.Port)
	log.Info().Msgf("TMDb API Key: %s", cfg.TMDb.APIKey)
	log.Info().Msgf("App data directory: %s", cfg.AppDataDir)
	log.Info().Msgf("Database driver: %s", cfg.Database.Driver)

	if cfg.Database.Driver == "postgres" {
		log.Info().Msgf("Postgres DB Host: %s", cfg.Database.Postgres.Host)
		log.Info().Msgf("Postgres DB Port: %d", cfg.Database.Postgres.Port)
		log.Info().Msgf("Postgres DB User: %s", cfg.Database.Postgres.User)
		log.Info().Msgf("Postgres DB Name: %s", cfg.Database.Postgres.DBName)
	}
}

func Get() *Config {
	return cfg
}
