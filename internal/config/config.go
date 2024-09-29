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
		APIKey      string `koanf:"api_key"`
		AccessToken string `koanf:"access_token"`
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
	AppSettings struct {
		MovieLocations  []string           `koanf:"movie_locations"`
		TVShowLocations []string           `koanf:"tv_show_locations"`
		EmailSMTP       *EmailSMTPSettings `koanf:"email_smtp"`
		NewUserSignup   bool               `koanf:"new_user_signup"`
	} `koanf:"app_settings"`
}

type EmailSMTPSettings struct {
	SMTPServer string `koanf:"smtp_server"`
	Port       int    `koanf:"port"`
	Username   string `koanf:"username"`
	Password   string `koanf:"password"`
}

func InitConfig() {
	k = koanf.New(".")

	defaultAppDataDir := getDefaultAppDataDir()

	// Load default configuration values
	k.Load(confmap.Provider(map[string]interface{}{
		"server.host":                    "127.0.0.1",
		"server.port":                    8484,
		"tmdb.api_key":                   "",
		"tmdb.access_token":              "",
		"app_data_dir":                   defaultAppDataDir,
		"database.driver":                "sqlite",
		"database.postgres.host":         "localhost",
		"database.postgres.port":         5432,
		"database.postgres.user":         "postgres",
		"database.postgres.password":     "",
		"database.postgres.dbname":       "lunarrdb",
		"app_settings.movie_locations":   []string{},
		"app_settings.tv_show_locations": []string{},
		"app_settings.new_user_signup":   true,
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
		case "lunarr_tmdb_access_token":
			return "tmdb.access_token"
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
		case "lunarr_appsettings_movie_locations":
			return "app_settings.movie_locations"
		case "lunarr_appsettings_tv_show_locations":
			return "app_settings.tv_show_locations"
		case "lunarr_appsettings_email_smtp_server":
			return "app_settings.email_smtp.smtp_server"
		case "lunarr_appsettings_email_smtp_port":
			return "app_settings.email_smtp.port"
		case "lunarr_appsettings_email_smtp_username":
			return "app_settings.email_smtp.username"
		case "lunarr_appsettings_email_smtp_password":
			return "app_settings.email_smtp.password"
		case "lunarr_appsettings_new_user_signup":
			return "app_settings.new_user_signup"
		default:
			return s
		}
	}), nil)

	// Unmarshal into the configuration struct
	cfg = &Config{}
	if err := k.Unmarshal("", cfg); err != nil {
		log.Fatal().Msgf("Error unmarshalling configuration: %v", err)
	}

	// Handle comma-separated movie and TV show locations from environment variables
	if movieLocations := os.Getenv("LUNARR_APPSETTINGS_MOVIE_LOCATIONS"); movieLocations != "" {
		cfg.AppSettings.MovieLocations = strings.Split(movieLocations, ",")
	}
	if tvShowLocations := os.Getenv("LUNARR_APPSETTINGS_TV_SHOW_LOCATIONS"); tvShowLocations != "" {
		cfg.AppSettings.TVShowLocations = strings.Split(tvShowLocations, ",")
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

	log.Info().Msgf("Movie locations: %v", cfg.AppSettings.MovieLocations)
	log.Info().Msgf("TV show locations: %v", cfg.AppSettings.TVShowLocations)
	log.Info().Msgf("New user signup enabled: %t", cfg.AppSettings.NewUserSignup)
}

func Get() *Config {
	return cfg
}
